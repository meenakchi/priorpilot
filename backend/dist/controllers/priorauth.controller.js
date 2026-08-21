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
exports.startWorkflow = startWorkflow;
exports.runWorkflow = runWorkflow;
exports.getRequest = getRequest;
exports.listPatientRequests = listPatientRequests;
exports.getDraftForm = getDraftForm;
exports.submitForm = submitForm;
exports.listInsurers = listInsurers;
exports.getInsurerRequirements = getInsurerRequirements;
const uuid_1 = require("uuid");
const queue_1 = __importDefault(require("../lib/queue"));
const requestStoreLib = __importStar(require("../lib/requestStore"));
const priorAuth_workflow_1 = require("../workflows/priorAuth.workflow");
const openai_service_1 = require("../services/ai/openai.service");
const demoFHIR_service_1 = require("../services/ehr/demoFHIR.service");
const submission_service_1 = require("../services/insurer/submission.service");
const requirements_service_1 = require("../services/insurer/requirements.service");
const logger_1 = require("../utils/logger");
const env_1 = require("../config/env");
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
        const requestId = (0, uuid_1.v4)();
        // Create initial request record in Redis so callers can poll immediately
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
        // Enqueue the background job; the worker will run the workflow and update the record
        await queue_1.default.add('runPriorAuth', {
            ...{
                patientId,
                insurerId,
                medicationId,
                userAuth0AccessToken: accessToken,
                userEmail,
                useDemo: useDemo ?? env_1.env.useDemoFhirDefault,
                requestId,
            },
        });
        res.json({ message: 'Prior authorization workflow started', requestId, status: 'pending_consent' });
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
            useDemo: useDemo ?? env_1.env.useDemoFhirDefault,
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
        const request = await requestStoreLib.getRequest(requestId);
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
        const requests = await requestStoreLib.listRequests(patientId);
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
