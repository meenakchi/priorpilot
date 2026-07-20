"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClinicalSnapshot = getClinicalSnapshot;
exports.getPatient = getPatient;
exports.getMedications = getMedications;
exports.getConditions = getConditions;
const demoFHIR_service_1 = require("../services/ehr/demoFHIR.service");
const fhir_service_1 = require("../services/ehr/fhir.service");
const tokenVault_service_1 = require("../services/auth/tokenVault.service");
const logger_1 = require("../utils/logger");
async function getClinicalSnapshot(req, res, next) {
    try {
        const { patientId } = req.params;
        const useDemo = req.query.demo === 'true' || process.env.NODE_ENV === 'development';
        if (!patientId) {
            res.status(400).json({ error: 'patientId is required' });
            return;
        }
        let snapshot;
        if (useDemo) {
            logger_1.logger.info(`[EHR Controller] Using demo FHIR for patient: ${patientId}`);
            snapshot = await demoFHIR_service_1.demoFHIRService.getClinicalSnapshot(patientId);
        }
        else {
            const accessToken = req.oidc.accessToken?.access_token || '';
            const vaultToken = await tokenVault_service_1.tokenVaultService.getToken(accessToken, 'epic-fhir');
            const fhirService = (0, fhir_service_1.createFHIRService)(vaultToken.access_token);
            snapshot = await fhirService.getClinicalSnapshot(patientId);
        }
        res.json(snapshot);
    }
    catch (err) {
        next(err);
    }
}
async function getPatient(req, res, next) {
    try {
        const { patientId } = req.params;
        const useDemo = req.query.demo === 'true' || process.env.NODE_ENV === 'development';
        if (useDemo) {
            const patient = await demoFHIR_service_1.demoFHIRService.getPatient(patientId);
            res.json(patient);
            return;
        }
        const accessToken = req.oidc.accessToken?.access_token || '';
        const vaultToken = await tokenVault_service_1.tokenVaultService.getToken(accessToken, 'epic-fhir');
        const fhirService = (0, fhir_service_1.createFHIRService)(vaultToken.access_token);
        const patient = await fhirService.getPatient(patientId);
        res.json(patient);
    }
    catch (err) {
        next(err);
    }
}
async function getMedications(req, res, next) {
    try {
        const { patientId } = req.params;
        const useDemo = req.query.demo === 'true' || process.env.NODE_ENV === 'development';
        if (useDemo) {
            const meds = await demoFHIR_service_1.demoFHIRService.getMedicationRequests(patientId);
            res.json(meds);
            return;
        }
        const accessToken = req.oidc.accessToken?.access_token || '';
        const vaultToken = await tokenVault_service_1.tokenVaultService.getToken(accessToken, 'epic-fhir');
        const fhirService = (0, fhir_service_1.createFHIRService)(vaultToken.access_token);
        const meds = await fhirService.getMedicationRequests(patientId);
        res.json(meds);
    }
    catch (err) {
        next(err);
    }
}
async function getConditions(req, res, next) {
    try {
        const { patientId } = req.params;
        const useDemo = req.query.demo === 'true' || process.env.NODE_ENV === 'development';
        if (useDemo) {
            const conditions = await demoFHIR_service_1.demoFHIRService.getConditions(patientId);
            res.json(conditions);
            return;
        }
        const accessToken = req.oidc.accessToken?.access_token || '';
        const vaultToken = await tokenVault_service_1.tokenVaultService.getToken(accessToken, 'epic-fhir');
        const fhirService = (0, fhir_service_1.createFHIRService)(vaultToken.access_token);
        const conditions = await fhirService.getConditions(patientId);
        res.json(conditions);
    }
    catch (err) {
        next(err);
    }
}
