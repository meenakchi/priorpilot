import axios, { AxiosInstance } from 'axios';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import {
  FHIRBundle,
  FHIRMedication,
  FHIRCondition,
  PatientContext,
} from '../../utils/types';

/**
 * FHIR R4 Service — connects to Epic's real sandbox
 *
 * Epic Public Sandbox: https://fhir.epic.com
 * - No credentials needed for the sandbox patient data
 * - Uses SMART on FHIR OAuth for production
 * - Token Vault holds the SMART token; we receive it pre-exchanged
 *
 * Test patient IDs for Epic sandbox:
 *   Patient/eQMSMe9j-O23nW7ovHXWnkA3 (Camila Lopez)
 *   Patient/erXuFYUfucBZaryVksYEcMg3 (Derrick Lin)
 */
export class FHIRService {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(accessToken: string) {
    this.baseUrl = env.epicFhirBaseUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/fhir+json',
        'Content-Type': 'application/fhir+json',
        'Epic-Client-ID': env.auth0ClientId,
      },
    });
  }

  /**
   * Fetch patient demographics from FHIR.
   */
  async getPatient(patientId: string): Promise<PatientContext> {
    logger.info(`[FHIR] Fetching patient: ${patientId}`);

    const response = await this.client.get(`/Patient/${patientId}`);
    const p = response.data;

    const name = p.name?.[0];
    const fullName = [
      name?.prefix?.join(' '),
      name?.given?.join(' '),
      name?.family,
    ]
      .filter(Boolean)
      .join(' ');

    const memberId =
      p.identifier?.find(
        (id: { system?: string }) =>
          id.system?.includes('member') || id.system?.includes('insurance')
      )?.value || `MBR-${patientId.slice(0, 8).toUpperCase()}`;

    return {
      patientId,
      name: fullName,
      dateOfBirth: p.birthDate || '',
      gender: p.gender || 'unknown',
      memberId,
    };
  }

  /**
   * Fetch active medication requests for the patient.
   */
  async getMedicationRequests(patientId: string): Promise<FHIRMedication[]> {
    logger.info(`[FHIR] Fetching medication requests for patient: ${patientId}`);

    const response = await this.client.get<FHIRBundle<FHIRMedication>>(
      `/MedicationRequest?patient=${patientId}&status=active&_count=50`
    );

    return (
      response.data.entry
        ?.map((e) => e.resource)
        .filter((r) => r.resourceType === 'MedicationRequest') || []
    );
  }

  /**
   * Fetch active diagnoses/conditions for the patient.
   */
  async getConditions(patientId: string): Promise<FHIRCondition[]> {
    logger.info(`[FHIR] Fetching conditions for patient: ${patientId}`);

    const response = await this.client.get<FHIRBundle<FHIRCondition>>(
      `/Condition?patient=${patientId}&clinical-status=active&_count=50`
    );

    return (
      response.data.entry
        ?.map((e) => e.resource)
        .filter((r) => r.resourceType === 'Condition') || []
    );
  }

  /**
   * Collect all relevant clinical data for prior auth in one call.
   */
  async getClinicalSnapshot(patientId: string) {
    const [patient, medications, conditions] = await Promise.all([
      this.getPatient(patientId),
      this.getMedicationRequests(patientId),
      this.getConditions(patientId),
    ]);

    return { patient, medications, conditions };
  }
}

export function createFHIRService(accessToken: string): FHIRService {
  return new FHIRService(accessToken);
}