import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';
import { PriorAuthForm, SubmissionResult } from '../../utils/types';

/**
 * Submission service — sends the completed PA form to the insurer.
 *
 * In production: integrate with CoverMyMeds API, Surescripts, or direct
 * insurer EDI/portal APIs. For hackathon: realistic simulation with
 * proper response structure.
 */
export class SubmissionService {
  async submitPriorAuth(
    insurerId: string,
    form: PriorAuthForm
  ): Promise<SubmissionResult> {
    logger.info(`[Submission] Submitting PA to insurer: ${insurerId}`, {
      medication: form.medicationRequested,
      patient: form.patientName,
    });

    // Validate required fields before submission
    this.validateForm(form);

    // In production, make HTTP call to insurer API or EDI endpoint
    // await this.callInsurerAPI(insurerId, form);

    // Simulate realistic network latency
    await sleep(1500);

    const referenceNumber = `PA-${Date.now()}-${uuidv4().slice(0, 6).toUpperCase()}`;
    const estimatedDecisionDate = getBusinessDaysFromNow(insurerId);

    const result: SubmissionResult = {
      referenceNumber,
      status: 'submitted',
      estimatedDecisionDate,
      submittedAt: new Date().toISOString(),
    };

    logger.info(`[Submission] PA submitted. Reference: ${referenceNumber}`);
    return result;
  }

  private validateForm(form: PriorAuthForm): void {
    const required: (keyof PriorAuthForm)[] = [
      'patientName',
      'patientDOB',
      'memberId',
      'medicationRequested',
      'icd10Code',
      'diagnosis',
      'clinicalJustification',
      'prescribingPhysician',
    ];

    const missing = required.filter((f) => !form[f]);
    if (missing.length > 0) {
      throw new Error(`PA form validation failed. Missing fields: ${missing.join(', ')}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getBusinessDaysFromNow(insurerId: string): string {
  const daysMap: Record<string, number> = {
    BCBS: 5,
    AETNA: 3,
    UNITEDHEALTHCARE: 2,
    CIGNA: 5,
  };
  const days = daysMap[insurerId.toUpperCase()] || 5;

  const date = new Date();
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) added++; // skip weekends
  }
  return date.toISOString().split('T')[0];
}

export const submissionService = new SubmissionService();