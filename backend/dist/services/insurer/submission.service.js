"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubmissionService = void 0;
const logger_1 = require("../../utils/logger");
const portalAutomation_Service_1 = require("./portalAutomation.Service");
class SubmissionService {
    async submitPriorAuth(insurerId, form) {
        logger_1.logger.info(`[Submission] Submitting PA to insurer: ${insurerId}`, {
            medication: form.medicationRequested,
            patient: form.patientName,
        });
        this.validateForm(form);
        const portalResult = await portalAutomation_Service_1.portalAutomationService.submitToPortal(form);
        const result = {
            ...portalResult,
            estimatedDecisionDate: getBusinessDaysFromNow(insurerId),
        };
        logger_1.logger.info(`[Submission] PA submitted via portal automation. Reference: ${result.referenceNumber}`);
        return result;
    }
}
exports.SubmissionService = SubmissionService;
// ...validateForm and getBusinessDaysFromNow stay the same, just delete the old `sleep()` helper, it's unused now
