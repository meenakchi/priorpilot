import axios from 'axios';
import { logger } from '../../utils/logger';
import { FHIRMedication, FHIRCondition, PatientContext } from '../../utils/types';

/**
 * Epic Open FHIR Sandbox - No OAuth required for these read-only endpoints.
 * Use these for development and hackathon demo.
 *
 * Base URL: https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4
 *
 * Known sandbox patients:
 *   eQMSMe9j-O23nW7ovHXWnkA3  → Camila Lopez
 *   erXuFYUfucBZaryVksYEcMg3  → Derrick Lin
 *   eq081-VQEgP8drUUqCWzHfw3  → Jason Argonaut (well-known test patient)
 */

const EPIC_OPEN_BASE = 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4';

// These test patient IDs are publicly documented by Epic
export const DEMO_PATIENTS = {
  'camila-lopez': 'eQMSMe9j-O23nW7ovHXWnkA3',
  'derrick-lin': 'erXuFYUfucBZaryVksYEcMg3',
  'jason-argonaut': 'eq081-VQEgP8drUUqCWzHfw3',
} as const;

export type DemoPatientKey = keyof typeof DEMO_PATIENTS;

export class DemoFHIRService {
  private client = axios.create({
    baseURL: EPIC_OPEN_BASE,
    headers: {
      Accept: 'application/fhir+json',
    },
  });

  async getPatient(patientId: string): Promise<PatientContext> {
    logger.info(`[DemoFHIR] Fetching patient from Epic sandbox: ${patientId}`);

    try {
      const { data } = await this.client.get(`/Patient/${patientId}`);

      const name = data.name?.[0];
      const fullName = [name?.given?.join(' '), name?.family].filter(Boolean).join(' ');

      return {
        patientId,
        name: fullName || 'Unknown Patient',
        dateOfBirth: data.birthDate || 'Unknown',
        gender: data.gender || 'unknown',
        memberId: data.identifier?.find(
          (id: { system?: string }) => id.system?.includes('fhir') || id.system?.includes('urn')
        )?.value || `EPIC-${patientId.slice(0, 6)}`,
      };
    } catch (err) {
      logger.warn('[DemoFHIR] Could not fetch patient — using local fallback');
      return getDemoPatientFallback(patientId);
    }
  }

  async getMedicationRequests(patientId: string): Promise<FHIRMedication[]> {
    logger.info(`[DemoFHIR] Fetching medications for: ${patientId}`);

    try {
      const { data } = await this.client.get(
        `/MedicationRequest?patient=${patientId}&status=active`
      );
      return data.entry?.map((e: { resource: FHIRMedication }) => e.resource) || getDemoMedications();
    } catch {
      logger.warn('[DemoFHIR] Could not fetch meds — using demo data');
      return getDemoMedications();
    }
  }

  async getConditions(patientId: string): Promise<FHIRCondition[]> {
    logger.info(`[DemoFHIR] Fetching conditions for: ${patientId}`);

    try {
      const { data } = await this.client.get(
        `/Condition?patient=${patientId}&clinical-status=active`
      );
      return data.entry?.map((e: { resource: FHIRCondition }) => e.resource) || getDemoConditions();
    } catch {
      logger.warn('[DemoFHIR] Could not fetch conditions — using demo data');
      return getDemoConditions();
    }
  }

  async getClinicalSnapshot(patientId: string) {
    const [patient, medications, conditions] = await Promise.all([
      this.getPatient(patientId),
      this.getMedicationRequests(patientId),
      this.getConditions(patientId),
    ]);
    return { patient, medications, conditions };
  }
}

// --- Fallback demo data (realistic, based on Epic sandbox records) ---

function getDemoPatientFallback(patientId: string): PatientContext {
  return {
    patientId,
    name: 'Camila Lopez',
    dateOfBirth: '1987-08-14',
    gender: 'female',
    memberId: 'BCBS-987654321',
  };
}

function getDemoMedications(): FHIRMedication[] {
  return [
    {
      resourceType: 'MedicationRequest',
      id: 'med-001',
      status: 'active',
      medicationCodeableConcept: {
        coding: [
          {
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: '2200644',
            display: 'Dupilumab 300 MG/2ML Prefilled Syringe [Dupixent]',
          },
        ],
        text: 'Dupilumab (Dupixent) 300mg injection every 2 weeks',
      },
      subject: { reference: `Patient/${getDemoPatientFallback('').patientId}` },
      requester: { display: 'Dr. Sarah Chen, MD (Dermatology)' },
      reasonCode: [{ text: 'Moderate-to-severe atopic dermatitis, inadequate response to topical corticosteroids' }],
      dosageInstruction: [{ text: '300mg SC every 2 weeks after 600mg loading dose' }],
    },
  ];
}

function getDemoConditions(): FHIRCondition[] {
  return [
    {
      resourceType: 'Condition',
      id: 'cond-001',
      clinicalStatus: { coding: [{ code: 'active' }] },
      code: {
        coding: [
          {
            system: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: 'L20.9',
            display: 'Atopic dermatitis, unspecified',
          },
        ],
        text: 'Atopic Dermatitis (Eczema) - Moderate to Severe',
      },
      onsetDateTime: '2019-03-15',
    },
    {
      resourceType: 'Condition',
      id: 'cond-002',
      clinicalStatus: { coding: [{ code: 'active' }] },
      code: {
        coding: [
          {
            system: 'http://hl7.org/fhir/sid/icd-10-cm',
            code: 'J45.50',
            display: 'Severe persistent asthma, uncomplicated',
          },
        ],
        text: 'Severe persistent asthma',
      },
      onsetDateTime: '2016-07-20',
    },
  ];
}

export const demoFHIRService = new DemoFHIRService();