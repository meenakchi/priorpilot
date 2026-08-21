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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const uuid_1 = require("uuid");
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const priorAuth_workflow_1 = require("../workflows/priorAuth.workflow");
const queue_1 = __importDefault(require("../lib/queue"));
const requestStoreLib = __importStar(require("../lib/requestStore"));
const requirements_service_1 = require("../services/insurer/requirements.service");
const agentLoop_service_1 = require("../services/ai/agentLoop.service");
const logger_1 = require("../utils/logger");
const env_1 = require("../config/env");
const router = (0, express_1.Router)();
// List available insurers
router.get('/insurers', (_req, res) => {
    res.json(requirements_service_1.insurerRequirementsService.listInsurers());
});
// Get insurer requirements
router.get('/insurers/:insurerId/requirements', (req, res) => {
    const requirements = requirements_service_1.insurerRequirementsService.getRequirements(req.params.insurerId);
    res.json(requirements);
});
// Start a new prior auth workflow
router.post('/start', auth_middleware_1.requireAuth, async (req, res, next) => {
    try {
        const { patientId, insurerId, medicationId, useDemo } = req.body;
        if (!patientId || !insurerId) {
            res.status(400).json({ error: 'patientId and insurerId are required' });
            return;
        }
        const accessToken = req.oidc.accessToken?.access_token || '';
        const userEmail = req.oidc.user?.email || '';
        logger_1.logger.info(`[Route] Starting PA workflow for patient: ${patientId}, insurer: ${insurerId}`);
        // Start workflow as background job and return a stable ID for polling
        const requestId = (0, uuid_1.v4)();
        const initial = {
            id: requestId,
            patientId,
            medicationName: '',
            medicationCode: '',
            diagnosis: '',
            diagnosisCode: '',
            prescribingPhysician: '',
            insurerId,
            status: 'pending_consent',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        await requestStoreLib.setRequest(requestId, initial);
        await queue_1.default.add('runPriorAuth', {
            patientId,
            insurerId,
            medicationId,
            userAuth0AccessToken: accessToken,
            userEmail,
            useDemo: useDemo ?? env_1.env.useDemoFhirDefault,
            requestId,
        });
        res.json({ message: 'Prior authorization workflow started', requestId, status: 'pending_consent' });
    }
    catch (err) {
        next(err);
    }
});
// Full synchronous workflow (for demo/hackathon — returns complete result)
router.post('/run', auth_middleware_1.requireAuth, async (req, res, next) => {
    try {
        const { patientId, insurerId, medicationId, useDemo } = req.body;
        if (!patientId || !insurerId) {
            res.status(400).json({ error: 'patientId and insurerId are required' });
            return;
        }
        const accessToken = req.oidc.accessToken?.access_token || '';
        const userEmail = req.oidc.user?.email || '';
        const result = await priorAuth_workflow_1.priorAuthWorkflow.execute({
            patientId,
            insurerId,
            medicationId,
            userAuth0AccessToken: accessToken,
            userEmail,
            useDemo: useDemo ?? env_1.env.useDemoFhirDefault,
        });
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
// Get a specific PA request
router.get('/request/:requestId', auth_middleware_1.requireAuth, async (req, res) => {
    const request = await requestStoreLib.getRequest(req.params.requestId);
    if (!request) {
        res.status(404).json({ error: 'Prior auth request not found' });
        return;
    }
    res.json(request);
});
// List all PA requests for a patient
router.get('/patient/:patientId', auth_middleware_1.requireAuth, async (req, res) => {
    const requests = await requestStoreLib.listRequests(req.params.patientId);
    res.json(requests);
});
// Agentic endpoint — OpenAI drives the full workflow autonomously via tool-calling.
// Response is adapted into the same PriorAuthRequest shape /run returns, so the
// frontend can render either path without knowing which one produced the result.
router.post('/agent/run', auth_middleware_1.requireAuth, async (req, res, next) => {
    try {
        const { patientId, insurerId, medicationId } = req.body;
        if (!patientId || !insurerId) {
            res.status(400).json({ error: 'patientId and insurerId are required' });
            return;
        }
        logger_1.logger.info(`[Agent Route] Running autonomous agent for patient=${patientId}`);
        const agentResult = await agentLoop_service_1.priorAuthAgentLoop.run({
            patientId,
            insurerId,
            medicationId,
            onStatusUpdate: (tool, detail) => {
                logger_1.logger.info(`[Agent] Using tool: ${tool} — ${detail.slice(0, 100)}`);
            },
        });
        const primaryMed = agentResult.medications?.find((m) => m.id === medicationId) || agentResult.medications?.[0];
        const primaryCondition = agentResult.conditions?.[0];
        const now = new Date().toISOString();
        const response = {
            id: (0, uuid_1.v4)(),
            patientId,
            medicationName: agentResult.form?.medicationRequested || primaryMed?.medicationCodeableConcept.text || '',
            medicationCode: primaryMed?.medicationCodeableConcept.coding?.[0]?.code || '',
            diagnosis: agentResult.form?.diagnosis || primaryCondition?.code.text || '',
            diagnosisCode: agentResult.form?.icd10Code || primaryCondition?.code.coding?.[0]?.code || '',
            prescribingPhysician: agentResult.form?.prescribingPhysician || primaryMed?.requester?.display || '',
            insurerId,
            status: agentResult.success ? 'submitted' : 'error',
            createdAt: now,
            updatedAt: now,
            aiDraftForm: agentResult.form,
            submissionResult: agentResult.submissionResult,
            agentLog: agentResult.agentLog,
            error: agentResult.error,
        };
        res.json(response);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
