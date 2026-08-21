"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.portalAutomationService = exports.PortalAutomationService = void 0;
const playwright_1 = require("playwright");
const env_1 = require("../../config/env");
const logger_1 = require("../../utils/logger");
class PortalAutomationService {
    constructor() {
        this.browser = null;
    }
    async getBrowser() {
        if (!this.browser) {
            this.browser = await playwright_1.chromium.launch({ headless: true });
        }
        return this.browser;
    }
    async submitToPortal(form) {
        const portalUrl = `${env_1.env.backendBaseUrl}/portal/index.html`;
        logger_1.logger.info(`[PortalAutomation] Launching browser -> ${portalUrl}`);
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
            logger_1.logger.info('[PortalAutomation] Form filled, clicking submit...');
            await page.click('#submit-btn');
            const confirmation = page.locator('[data-testid="portal-confirmation"]');
            await confirmation.waitFor({ state: 'visible', timeout: 10000 });
            const referenceNumber = await confirmation.getAttribute('data-confirmation-ref');
            if (!referenceNumber) {
                throw new Error('Portal confirmed submission but returned no reference number');
            }
            logger_1.logger.info(`[PortalAutomation] Portal confirmed submission. Reference: ${referenceNumber}`);
            return {
                referenceNumber,
                status: 'submitted',
                estimatedDecisionDate: '',
                submittedAt: new Date().toISOString(),
            };
        }
        finally {
            await page.close();
        }
    }
    async shutdown() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}
exports.PortalAutomationService = PortalAutomationService;
exports.portalAutomationService = new PortalAutomationService();
