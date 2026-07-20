"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insurerRequirementsService = exports.InsurerRequirementsService = void 0;
const logger_1 = require("../../utils/logger");
/**
 * In production this would query an insurer requirements database
 * or an API like CoverMyMeds / Surescripts.
 * For the hackathon we maintain a realistic lookup table.
 */
const INSURER_DATABASE = {
    BCBS: {
        insurerId: 'BCBS',
        insurerName: 'Blue Cross Blue Shield',
        requiresCIBA: true,
        requiredDocuments: [
            'Current prescription from licensed prescriber',
            'ICD-10 diagnosis codes',
            'Documentation of step therapy (2+ failed alternatives)',
            'Lab results or clinical assessments supporting severity',
        ],
        stepTherapyRequired: true,
        typicalTurnaround: '3–5 business days',
        portalUrl: 'https://www.bcbs.com/providers/prior-authorization',
        paFormType: 'electronic',
    },
    AETNA: {
        insurerId: 'AETNA',
        insurerName: 'Aetna',
        requiresCIBA: true,
        requiredDocuments: [
            'Completed PA request form',
            'Clinical notes from last 6 months',
            'Diagnosis with ICD-10 codes',
            'Prescriber NPI and DEA number',
        ],
        stepTherapyRequired: true,
        typicalTurnaround: '2–3 business days',
        portalUrl: 'https://www.aetna.com/health-care-professionals/prior-authorization.html',
        paFormType: 'custom',
    },
    UNITEDHEALTHCARE: {
        insurerId: 'UNITEDHEALTHCARE',
        insurerName: 'UnitedHealthcare',
        requiresCIBA: false,
        requiredDocuments: [
            'Physician attestation',
            'Diagnosis documentation',
            'Medication history',
        ],
        stepTherapyRequired: false,
        typicalTurnaround: '1–3 business days',
        paFormType: 'electronic',
    },
    CIGNA: {
        insurerId: 'CIGNA',
        insurerName: 'Cigna',
        requiresCIBA: true,
        requiredDocuments: [
            'PA request with clinical rationale',
            'Relevant lab values or diagnostic test results',
            'Patient history related to the condition',
        ],
        stepTherapyRequired: true,
        typicalTurnaround: '3–5 business days',
        paFormType: 'custom',
    },
};
class InsurerRequirementsService {
    getRequirements(insurerId) {
        const req = INSURER_DATABASE[insurerId.toUpperCase()];
        if (!req) {
            logger_1.logger.warn(`[InsurerReq] Unknown insurer: ${insurerId}, using generic requirements`);
            return this.getGenericRequirements(insurerId);
        }
        logger_1.logger.info(`[InsurerReq] Retrieved requirements for: ${req.insurerName}`);
        return req;
    }
    listInsurers() {
        return Object.values(INSURER_DATABASE).map((i) => ({
            id: i.insurerId,
            name: i.insurerName,
        }));
    }
    getGenericRequirements(insurerId) {
        return {
            insurerId,
            insurerName: insurerId,
            requiresCIBA: true,
            requiredDocuments: [
                'Physician prescription',
                'Diagnosis documentation with ICD-10 codes',
                'Clinical justification letter',
            ],
            stepTherapyRequired: true,
            typicalTurnaround: '3–7 business days',
            paFormType: 'CMS-1500',
        };
    }
}
exports.InsurerRequirementsService = InsurerRequirementsService;
exports.insurerRequirementsService = new InsurerRequirementsService();
