"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWorkflow = startWorkflow;
exports.runWorkflow = runWorkflow;
exports.getRequest = getRequest;
exports.listPatientRequests = listPatientRequests;
exports.getDraftForm = getDraftForm;
exports.submitForm = submitForm;
exports.listInsurers = listInsurers;
exports.getInsurerRequirements = getInsurerRequirements;
const priorAuth_workflow_1 = require("../workflows/priorAuth.workflow");
const openai_service_1 = require("../services/ai/openai.service");
const demoFHIR_service_1 = require("../services/ehr/demoFHIR.service");
const submission_service_1 = require("../services/insurer/submission.service");
const requirements_service_1 = require("../services/insurer/requirements.service");
const logger_1 = require("../utils/logger");
async function startWorkflow(req, res, next) {
    try {
        const { patientId, insurerId, medicationId, useDemo } = req.body;
        if (!patientId || !insurerId) {
            res.status(400).json({ error: 'patientId and insurerId are required' });
            return;
        }
        const accessToken = req.oidc.accessToken?.access_token || '';
        const userEmail = req.oidc.user?.email || '';
        logger_1.logger.info(`[PA Controller] Starting workflow: patient=${patientId}, insurer=${insurerId}`);
        const requestId = `req-${Date.now()}`;
        priorAuth_workflow_1.priorAuthWorkflow
            .execute({
            patientId,
            insurerId,
            medicationId,
            userAuth0AccessToken: accessToken,
            userEmail,
            useDemo: useDemo ?? true,
        })
            .catch((err) => logger_1.logger.error('[PA Controller] Background workflow error', err.message));
        res.json({
            message: 'Prior authorization workflow started',
            requestId,
            status: 'pending_consent',
        });
    }
    catch (err) {
        next(err);
    }
}
async function runWorkflow(req, res, next) {
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
}
async function getRequest(req, res, next) {
    try {
        const { requestId } = req.params;
        const request = priorAuth_workflow_1.priorAuthWorkflow.getRequest(requestId);
        if (!request) {
            res.status(404).json({ error: 'Prior auth request not found' });
            return;
        }
        res.json(request);
    }
    catch (err) {
        next(err);
    }
}
async function listPatientRequests(req, res, next) {
    try {
        const { patientId } = req.params;
        const requests = priorAuth_workflow_1.priorAuthWorkflow.listRequests(patientId);
        res.json(requests);
    }
    catch (err) {
        next(err);
    }
}
async function getDraftForm(req, res, next) {
    try {
        const { patientId } = req.params;
        const { insurerId, medicationId } = req.query;
        if (!insurerId) {
            res.status(400).json({ error: 'insurerId query param required' });
            return;
        }
        const snapshot = await demoFHIR_service_1.demoFHIRService.getClinicalSnapshot(patientId);
        const form = await openai_service_1.openaiService.draftPriorAuthForm(snapshot.patient, snapshot.medications, snapshot.conditions, medicationId || snapshot.medications[0]?.id || '');
        res.json(form);
    }
    catch (err) {
        next(err);
    }
}
async function submitForm(req, res, next) {
    try {
        const { insurerId, form } = req.body;
        if (!insurerId || !form) {
            res.status(400).json({ error: 'insurerId and form are required' });
            return;
        }
        const result = await submission_service_1.submissionService.submitPriorAuth(insurerId, form);
        res.json(result);
    }
    catch (err) {
        next(err);
    }
}
function listInsurers(_req, res) {
    res.json(requirements_service_1.insurerRequirementsService.listInsurers());
}
function getInsurerRequirements(req, res) {
    const requirements = requirements_service_1.insurerRequirementsService.getRequirements(req.params.insurerId);
    res.json(requirements);
}
