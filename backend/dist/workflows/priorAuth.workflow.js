"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.priorAuthWorkflow = exports.PriorAuthWorkflow = void 0;
const uuid_1 = require("uuid");
const logger_1 = require("../utils/logger");
const tokenVault_service_1 = require("../services/auth/tokenVault.service");
const ciba_service_1 = require("../services/auth/ciba.service");
const demoFHIR_service_1 = require("../services/ehr/demoFHIR.service");
const fhir_service_1 = require("../services/ehr/fhir.service");
const openai_service_1 = require("../services/ai/openai.service");
const submission_service_1 = require("../services/insurer/submission.service");
const requirements_service_1 = require("../services/insurer/requirements.service");
// In-memory store for hackathon — use DB in production
const requestStore = new Map();
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
        const requestId = (0, uuid_1.v4)();
        // Create initial record
        const request = {
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
        requestStore.set(requestId, request);
        logger_1.logger.info(`[Workflow] Started PA workflow. Request ID: ${requestId}`);
        try {
            // Step 1: Get insurer requirements
            const requirements = requirements_service_1.insurerRequirementsService.getRequirements(input.insurerId);
            logger_1.logger.info(`[Workflow] Insurer: ${requirements.insurerName}, CIBA required: ${requirements.requiresCIBA}`);
            // Step 2: CIBA step-up consent (if insurer requires it)
            if (requirements.requiresCIBA && !input.useDemo) {
                this.updateStatus(requestId, 'pending_consent');
                const cibaResponse = await ciba_service_1.cibaService.initiateRequest(input.userEmail, 'openid fhir:read', `PriorAgent needs your consent to read health records for ${requirements.insurerName} authorization`);
                logger_1.logger.info(`[Workflow] CIBA initiated — waiting for patient consent...`);
                await ciba_service_1.cibaService.pollForToken(cibaResponse.auth_req_id, cibaResponse.interval);
                logger_1.logger.info(`[Workflow] Patient consented via CIBA.`);
            }
            // Step 3: Get FHIR access token
            this.updateStatus(requestId, 'fetching_records');
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
                request.medicationCode = primaryMed.medicationCodeableConcept.coding[0]?.code || '';
                request.prescribingPhysician = primaryMed.requester?.display || '';
            }
            const primaryCondition = conditions[0];
            if (primaryCondition) {
                request.diagnosis = primaryCondition.code.text;
                request.diagnosisCode = primaryCondition.code.coding[0]?.code || '';
            }
            requestStore.set(requestId, { ...request });
            // Step 4: OpenAI drafts the PA form
            this.updateStatus(requestId, 'analyzing');
            logger_1.logger.info('[Workflow] OpenAI is analyzing clinical records...');
            const form = await openai_service_1.openaiService.draftPriorAuthForm(patient, medications, conditions, input.medicationId || medications[0]?.id || '');
            this.updateStatus(requestId, 'draft_ready');
            const updated = requestStore.get(requestId);
            updated.aiDraftForm = form;
            requestStore.set(requestId, updated);
            // Step 5: Submit to insurer
            logger_1.logger.info('[Workflow] Submitting PA to insurer...');
            const result = await submission_service_1.submissionService.submitPriorAuth(input.insurerId, form);
            this.updateStatus(requestId, 'submitted');
            const final = requestStore.get(requestId);
            final.submissionResult = result;
            requestStore.set(requestId, final);
            logger_1.logger.info(`[Workflow] ✅ PA workflow complete. Reference: ${result.referenceNumber}`);
            return requestStore.get(requestId);
        }
        catch (err) {
            const error = err;
            logger_1.logger.error(`[Workflow] ❌ Workflow failed: ${error.message}`);
            this.updateStatus(requestId, 'error');
            throw error;
        }
    }
    getRequest(requestId) {
        return requestStore.get(requestId);
    }
    listRequests(patientId) {
        return Array.from(requestStore.values()).filter((r) => r.patientId === patientId);
    }
    updateStatus(requestId, status) {
        const req = requestStore.get(requestId);
        if (req) {
            req.status = status;
            req.updatedAt = new Date().toISOString();
            requestStore.set(requestId, req);
        }
    }
}
exports.PriorAuthWorkflow = PriorAuthWorkflow;
exports.priorAuthWorkflow = new PriorAuthWorkflow();
