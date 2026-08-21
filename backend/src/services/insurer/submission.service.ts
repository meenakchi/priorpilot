import { logger } from '../../utils/logger';
import { PriorAuthForm, SubmissionResult } from '../../utils/types';
import { portalAutomationService } from './portalAutomation.Service';

/**
 * Submission service — sends the completed PA form to the insurer.
 *
 * In production: integrate with CoverMyMeds API, Surescripts, or direct
 * insurer EDI/portal APIs. For this build, submission is a real Playwright
 * browser driving the simulated PayerConnect portal (public/portal/index.html).
 */
export class SubmissionService {
  async submitPriorAuth(insurerId: string, form: PriorAuthForm): Promise<SubmissionResult> {
    logger.info(`[Submission] Submitting PA to insurer: ${insurerId}`, {
      medication: form.medicationRequested,
      patient: form.patientName,
    });

    this.validateForm(form);

    const portalResult = await portalAutomationService.submitToPortal(form);

    const result: SubmissionResult = {
      ...portalResult,
      estimatedDecisionDate: getBusinessDaysFromNow(insurerId),
    };

    logger.info(`[Submission] PA submitted via portal automation. Reference: ${result.referenceNumber}`);
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