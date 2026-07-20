import { logger } from '../../utils/logger';

export interface InsurerRequirements {
  insurerId: string;
  insurerName: string;
  requiresCIBA: boolean;
  requiredDocuments: string[];
  stepTherapyRequired: boolean;
  typicalTurnaround: string;
  portalUrl?: string;
  paFormType: 'CMS-1500' | 'custom' | 'electronic';
}

/**
 * In production this would query an insurer requirements database
 * or an API like CoverMyMeds / Surescripts.
 * For the hackathon we maintain a realistic lookup table.
 */
const INSURER_DATABASE: Record<string, InsurerRequirements> = {
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

export class InsurerRequirementsService {
  getRequirements(insurerId: string): InsurerRequirements {
    const req = INSURER_DATABASE[insurerId.toUpperCase()];
    if (!req) {
      logger.warn(`[InsurerReq] Unknown insurer: ${insurerId}, using generic requirements`);
      return this.getGenericRequirements(insurerId);
    }
    logger.info(`[InsurerReq] Retrieved requirements for: ${req.insurerName}`);
    return req;
  }

  listInsurers(): Array<{ id: string; name: string }> {
    return Object.values(INSURER_DATABASE).map((i) => ({
      id: i.insurerId,
      name: i.insurerName,
    }));
  }

  private getGenericRequirements(insurerId: string): InsurerRequirements {
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

export const insurerRequirementsService = new InsurerRequirementsService();