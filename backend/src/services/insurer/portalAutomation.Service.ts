import { chromium, Browser } from 'playwright';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { PriorAuthForm, SubmissionResult } from '../../utils/types';

export class PortalAutomationService {
  private browser: Browser | null = null;

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
    }
    return this.browser;
  }

  async submitToPortal(form: PriorAuthForm): Promise<SubmissionResult> {
    const portalUrl = `${env.backendBaseUrl}/portal/index.html`;
    logger.info(`[PortalAutomation] Launching browser -> ${portalUrl}`);

    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.goto(portalUrl, { waitUntil: 'domcontentloaded' });

      await page.fill('#patientName', form.patientName || '');
      await page.fill('#patientDOB', form.patientDOB || '');
      await page.fill('#memberId', form.memberId || '');
      await page.fill('#medicationRequested', form.medicationRequested || '');
      await page.fill('#icd10Code', form.icd10Code || '');
      await page.fill('#diagnosis', form.diagnosis || '');
      await page.fill('#clinicalJustification', form.clinicalJustification || '');
      await page.fill('#prescribingPhysician', form.prescribingPhysician || '');

      if (form.urgency) {
        await page.selectOption('#urgency', form.urgency);
      }

      logger.info('[PortalAutomation] Form filled, clicking submit...');
      await page.click('#submit-btn');

      const confirmation = page.locator('[data-testid="portal-confirmation"]');
      await confirmation.waitFor({ state: 'visible', timeout: 10000 });

      const referenceNumber = await confirmation.getAttribute('data-confirmation-ref');
      if (!referenceNumber) {
        throw new Error('Portal confirmed submission but returned no reference number');
      }

      logger.info(`[PortalAutomation] Portal confirmed submission. Reference: ${referenceNumber}`);

      return {
        referenceNumber,
        status: 'submitted',
        estimatedDecisionDate: '',
        submittedAt: new Date().toISOString(),
      };
    } finally {
      await page.close();
    }
  }

  async shutdown(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const portalAutomationService = new PortalAutomationService();