"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiService = exports.claudeService = exports.PriorAuthAIService = void 0;
const openai_service_1 = require("./openai.service");
class PriorAuthAIService {
    async draftPriorAuthForm(patient, medications, conditions, targetMedicationId) {
        return openai_service_1.openaiService.draftPriorAuthForm(patient, medications, conditions, targetMedicationId);
    }
    async generateClinicalJustification(patient, medication, conditions) {
        return openai_service_1.openaiService.generateClinicalJustification(patient, medication, conditions);
    }
}
exports.PriorAuthAIService = PriorAuthAIService;
exports.claudeService = new PriorAuthAIService();
exports.aiService = exports.claudeService;
