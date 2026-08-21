"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.priorAuthWorkflow = exports.PriorAuthWorkflow = void 0;
const uuid_1 = require("uuid");
const logger_1 = require("../utils/logger");
const requestStoreLib = __importStar(require("../lib/requestStore"));
const tokenVault_service_1 = require("../services/auth/tokenVault.service");
const ciba_service_1 = require("../services/auth/ciba.service");
const demoFHIR_service_1 = require("../services/ehr/demoFHIR.service");
const fhir_service_1 = require("../services/ehr/fhir.service");
const openai_service_1 = require("../services/ai/openai.service");
const submission_service_1 = require("../services/insurer/submission.service");
const requirements_service_1 = require("../services/insurer/requirements.service");
class PriorAuthWorkflow {
    /**
     * Full end-to-end prior authorization workflow:
     * 1. Check insurer requirements
     * 2. CIBA step-up consent from patient
     * 3. Get FHIR token from Token Vault (or use demo)
     * 4. Fetch clinical data from Epic FHIR
     * 5. OpenAI analyzes & drafts PA form
     * 6. Submit to insurer
     */
    async execute(input) {
        const requestId = input.requestId ?? (0, uuid_1.v4)();
        // Create initial record (or update if caller already created it)
        const existing = await requestStoreLib.getRequest(requestId);
        const request = existing ?? {
            id: requestId,
            patientId: input.patientId,
            medicationName: '',
            medicationCode: '',
            diagnosis: '',
            diagnosisCode: '',
            prescribingPhysician: '',
            insurerId: input.insurerId,
            status: 'pending_consent',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        await requestStoreLib.setRequest(requestId, request);
        logger_1.logger.info(`[Workflow] Started PA workflow. Request ID: ${requestId}`);
        try {
            // Step 1: Get insurer requirements
            const requirements = requirements_service_1.insurerRequirementsService.getRequirements(input.insurerId);
            logger_1.logger.info(`[Workflow] Insurer: ${requirements.insurerName}, CIBA required: ${requirements.requiresCIBA}`);
            // Step 2: CIBA step-up consent (if insurer requires it)
            if (requirements.requiresCIBA && !input.useDemo) {
                await requestStoreLib.updateStatus(requestId, 'pending_consent');
                const cibaResponse = await ciba_service_1.cibaService.initiateRequest(input.userEmail, 'openid fhir:read', `PriorAgent needs your consent to read health records for ${requirements.insurerName} authorization`);
                logger_1.logger.info(`[Workflow] CIBA initiated — waiting for patient consent...`);
                await ciba_service_1.cibaService.pollForToken(cibaResponse.auth_req_id, cibaResponse.interval);
                logger_1.logger.info(`[Workflow] Patient consented via CIBA.`);
            }
            // Step 3: Get FHIR access token
            await requestStoreLib.updateStatus(requestId, 'fetching_records');
            let fhirSnapshot;
            if (input.useDemo) {
                // Use Epic's open sandbox — no token needed
                logger_1.logger.info('[Workflow] Using Epic open sandbox (demo mode)');
                fhirSnapshot = await demoFHIR_service_1.demoFHIRService.getClinicalSnapshot(input.patientId);
            }
            else {
                // Get real SMART token from Token Vault
                logger_1.logger.info('[Workflow] Retrieving FHIR token from Auth0 Token Vault');
                const vaultToken = await tokenVault_service_1.tokenVaultService.getToken(input.userAuth0AccessToken, 'epic-fhir');
                const fhirService = (0, fhir_service_1.createFHIRService)(vaultToken.access_token);
                fhirSnapshot = await fhirService.getClinicalSnapshot(input.patientId);
            }
            const { patient, medications, conditions } = fhirSnapshot;
            // Update request with discovered clinical data
            const primaryMed = medications.find((m) => m.id === input.medicationId) || medications[0];
            if (primaryMed) {
                request.medicationName = primaryMed.medicationCodeableConcept.text;
                request.medicationCode = primaryMed.medicationCodeableConcept.coding?.[0]?.code || '';
                request.prescribingPhysician = primaryMed.requester?.display || '';
            }
            const primaryCondition = conditions[0];
            if (primaryCondition) {
                request.diagnosis = primaryCondition.code.text;
                request.diagnosisCode = primaryCondition.code.coding?.[0]?.code || '';
            }
            await requestStoreLib.setRequest(requestId, { ...request });
            // Step 4: OpenAI drafts the PA form
            await requestStoreLib.updateStatus(requestId, 'analyzing');
            logger_1.logger.info('[Workflow] OpenAI is analyzing clinical records...');
            const form = await openai_service_1.openaiService.draftPriorAuthForm(patient, medications, conditions, input.medicationId || medications[0]?.id || '');
            await requestStoreLib.updateStatus(requestId, 'draft_ready');
            const updated = (await requestStoreLib.getRequest(requestId));
            updated.aiDraftForm = form;
            await requestStoreLib.setRequest(requestId, updated);
            // Step 5: Submit to insurer
            logger_1.logger.info('[Workflow] Submitting PA to insurer...');
            const result = await submission_service_1.submissionService.submitPriorAuth(input.insurerId, form);
            await requestStoreLib.updateStatus(requestId, 'submitted');
            const final = (await requestStoreLib.getRequest(requestId));
            final.submissionResult = result;
            await requestStoreLib.setRequest(requestId, final);
            logger_1.logger.info(`[Workflow] ✅ PA workflow complete. Reference: ${result.referenceNumber}`);
            return (await requestStoreLib.getRequest(requestId));
        }
        catch (err) {
            const error = err;
            logger_1.logger.error(`[Workflow] ❌ Workflow failed: ${error.message}`);
            await requestStoreLib.updateStatus(requestId, 'error');
            throw error;
        }
    }
}
exports.PriorAuthWorkflow = PriorAuthWorkflow;
exports.priorAuthWorkflow = new PriorAuthWorkflow();
