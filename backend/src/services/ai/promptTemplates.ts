import { FHIRCondition, FHIRMedication, PatientContext } from '../../utils/types';

export function buildPriorAuthPrompt(
  patient: PatientContext,
  medication: FHIRMedication,
  conditions: FHIRCondition[]
): string {
  const conditionsList = conditions
    .map((c) => {
      const coding = c.code.coding[0];
      return `- ${c.code.text} (ICD-10: ${coding?.code || 'unknown'}) — onset: ${c.onsetDateTime || 'unknown'}`;
    })
    .join('\n');

  const medName = medication.medicationCodeableConcept.text;
  const medCoding = medication.medicationCodeableConcept.coding[0];
  const dosage = medication.dosageInstruction?.[0]?.text || 'Per prescriber instructions';
  const reason = medication.reasonCode?.[0]?.text || 'See conditions';

  return `You are drafting a prior authorization request. Using ONLY the clinical data below, output a JSON object.

PATIENT FHIR DATA:
- Name: ${patient.name}
- DOB: ${patient.dateOfBirth}
- Gender: ${patient.gender}
- Insurance Member ID: ${patient.memberId}

REQUESTED MEDICATION:
- Name: ${medName}
- RxNorm Code: ${medCoding?.code || 'N/A'}
- Prescribing Physician: ${medication.requester?.display || 'Unknown'}
- Dosage: ${dosage}
- Clinical Reason: ${reason}

ACTIVE DIAGNOSES:
${conditionsList || '- No active conditions on file'}

Output ONLY this JSON (no markdown, no explanation):
{
  "patientName": "${patient.name}",
  "patientDOB": "${patient.dateOfBirth}",
  "memberId": "${patient.memberId}",
  "medicationRequested": "<full medication name and strength>",
  "ndc": "<NDC code if known, else 'N/A'>",
  "icd10Code": "<primary ICD-10 code>",
  "diagnosis": "<full diagnosis name>",
  "clinicalJustification": "<2-3 paragraph clinical justification explaining medical necessity, severity, failed alternatives, and evidence basis>",
  "previousTreatments": "<list treatments already tried and failed, or 'None documented in records'>",
  "prescribingPhysician": "<physician name>",
  "physicianNPI": "<NPI if available, else 'On file with prescriber'>",
  "urgency": "<'routine' | 'urgent' | 'emergent' based on clinical picture>",
  "supportingDocumentation": ["<list of documents that would strengthen the PA, e.g. 'Lab results showing severity', 'Photos of skin lesions'"]
}`;
}

export function buildJustificationPrompt(
  patient: PatientContext,
  medication: FHIRMedication,
  conditions: FHIRCondition[]
): string {
  const primaryCondition = conditions[0];
  const icd10 = primaryCondition?.code.coding[0]?.code || 'N/A';
  const diagnosisName = primaryCondition?.code.text || 'documented condition';

  return `Write a formal medical necessity letter for prior authorization.

Patient: ${patient.name}, DOB ${patient.dateOfBirth}
Requested Treatment: ${medication.medicationCodeableConcept.text}
Primary Diagnosis: ${diagnosisName} (${icd10})
Prescriber: ${medication.requester?.display || 'Attending physician'}

Active comorbidities:
${conditions.map((c) => `- ${c.code.text}`).join('\n')}

Write a formal 3-paragraph medical necessity letter covering:
1. Patient's diagnosis, severity, and clinical presentation
2. Rationale for this specific medication (mechanism, appropriateness, evidence base)
3. Why alternatives are inadequate and why approval is medically necessary

Use formal clinical language appropriate for insurance review.`;
}