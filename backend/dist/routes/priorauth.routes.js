"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const priorAuth_workflow_1 = require("../workflows/priorAuth.workflow");
const requirements_service_1 = require("../services/insurer/requirements.service");
const logger_1 = require("../utils/logger");
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
        // Run workflow asynchronously and return request ID immediately
        const requestId = `req-${Date.now()}`;
        // Start the workflow in background
        priorAuth_workflow_1.priorAuthWorkflow
            .execute({
            patientId,
            insurerId,
            medicationId,
            userAuth0AccessToken: accessToken,
            userEmail,
            useDemo: useDemo ?? (process.env.NODE_ENV === 'development'),
        })
            .catch((err) => logger_1.logger.error('[Route] Background workflow error', err.message));
        res.json({
            message: 'Prior authorization workflow started',
            requestId,
            status: 'pending_consent',
        });
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
            useDemo: useDemo ?? true,
        });
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
// Get a specific PA request
router.get('/request/:requestId', auth_middleware_1.requireAuth, (req, res) => {
    const request = priorAuth_workflow_1.priorAuthWorkflow.getRequest(req.params.requestId);
    if (!request) {
        res.status(404).json({ error: 'Prior auth request not found' });
        return;
    }
    res.json(request);
});
// List all PA requests for a patient
router.get('/patient/:patientId', auth_middleware_1.requireAuth, (req, res) => {
    const requests = priorAuth_workflow_1.priorAuthWorkflow.listRequests(req.params.patientId);
    res.json(requests);
});
const agentLoop_service_1 = require("../services/ai/agentLoop.service");
// Agentic endpoint — OpenAI drives the full workflow autonomously
router.post('/agent/run', auth_middleware_1.requireAuth, async (req, res, next) => {
    try {
        const { patientId, insurerId, medicationId } = req.body;
        if (!patientId || !insurerId) {
            res.status(400).json({ error: 'patientId and insurerId are required' });
            return;
        }
        logger_1.logger.info(`[Agent Route] Running autonomous agent for patient=${patientId}`);
        const result = await agentLoop_service_1.priorAuthAgentLoop.run({
            patientId,
            insurerId,
            medicationId,
            onStatusUpdate: (tool, detail) => {
                logger_1.logger.info(`[Agent] Using tool: ${tool} — ${detail.slice(0, 100)}`);
            },
        });
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
