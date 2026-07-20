export interface PatientContext {
  patientId: string;
  name: string;
  dateOfBirth: string;
  gender: string;
  memberId: string; // insurance member ID
}

export interface FHIRMedication {
  resourceType: 'MedicationRequest';
  id: string;
  status: string;
  medicationCodeableConcept: {
    coding: Array<{ system: string; code: string; display: string }>;
    text: string;
  };
  subject: { reference: string };
  requester: { display: string };
  reasonCode?: Array<{ text: string }>;
  dosageInstruction?: Array<{ text: string }>;
}

export interface FHIRCondition {
  resourceType: 'Condition';
  id: string;
  clinicalStatus: { coding: Array<{ code: string }> };
  code: {
    coding: Array<{ system: string; code: string; display: string }>;
    text: string;
  };
  onsetDateTime?: string;
}

export interface FHIRBundle<T> {
  resourceType: 'Bundle';
  entry?: Array<{ resource: T }>;
  total?: number;
}

export interface PriorAuthRequest {
  id: string;
  patientId: string;
  medicationName: string;
  medicationCode: string;
  diagnosis: string;
  diagnosisCode: string;
  prescribingPhysician: string;
  insurerId: string;
  status: PriorAuthStatus;
  createdAt: string;
  updatedAt: string;
  aiDraftForm?: PriorAuthForm;
  submissionResult?: SubmissionResult;
}

export type PriorAuthStatus =
  | 'pending_consent'
  | 'fetching_records'
  | 'analyzing'
  | 'draft_ready'
  | 'submitted'
  | 'approved'
  | 'denied'
  | 'error';

export interface PriorAuthForm {
  patientName: string;
  patientDOB: string;
  memberId: string;
  medicationRequested: string;
  ndc: string;
  icd10Code: string;
  diagnosis: string;
  clinicalJustification: string;
  previousTreatments: string;
  prescribingPhysician: string;
  physicianNPI: string;
  urgency: 'routine' | 'urgent' | 'emergent';
  supportingDocumentation: string[];
}

export interface SubmissionResult {
  referenceNumber: string;
  status: string;
  estimatedDecisionDate: string;
  submittedAt: string;
}

export interface TokenVaultToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface CIBAAuthResponse {
  auth_req_id: string;
  expires_in: number;
  interval: number;
}