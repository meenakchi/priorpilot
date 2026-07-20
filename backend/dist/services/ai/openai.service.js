"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openaiService = exports.OpenAIService = void 0;
const openai_1 = __importDefault(require("openai"));
const env_1 = require("../../config/env");
const logger_1 = require("../../utils/logger");
const promptTemplates_1 = require("./promptTemplates");
class OpenAIService {
    constructor() {
        this.client = new openai_1.default({ apiKey: env_1.env.openaiApiKey });
    }
    async draftPriorAuthForm(patient, medications, conditions, targetMedicationId) {
        logger_1.logger.info(`[OpenAI] Drafting prior auth form for patient: ${patient.patientId}`);
        const targetMed = medications.find((m) => m.id === targetMedicationId) || medications[0];
        const prompt = (0, promptTemplates_1.buildPriorAuthPrompt)(patient, targetMed, conditions);
        const response = await this.client.chat.completions.create({
            model: env_1.env.openaiModel,
            temperature: 0.2,
            max_tokens: 2000,
            messages: [
                {
                    role: 'system',
                    content: `You are a clinical documentation specialist AI helping draft insurance prior authorization forms.
You have deep knowledge of ICD-10 codes, NDC numbers, medical necessity criteria, and insurer PA requirements.
Always output valid JSON matching the exact schema requested. Be thorough in clinical justification.
Never fabricate clinical data — only use what is provided in the FHIR records.`,
                },
                { role: 'user', content: prompt },
            ],
        });
        const text = response.choices[0]?.message?.content ?? '';
        if (!text)
            throw new Error('No response received from OpenAI');
        try {
            const jsonStr = text.replace(/```(?:json)?\n?/g, '').trim();
            const form = JSON.parse(jsonStr);
            logger_1.logger.info('[OpenAI] Prior auth form drafted successfully');
            return form;
        }
        catch {
            logger_1.logger.error('[OpenAI] Failed to parse JSON response', { raw: text });
            throw new Error('Failed to parse OpenAI response as prior auth form JSON');
        }
    }
    async generateClinicalJustification(patient, medication, conditions) {
        logger_1.logger.info('[OpenAI] Generating clinical justification narrative');
        const prompt = (0, promptTemplates_1.buildJustificationPrompt)(patient, medication, conditions);
        const response = await this.client.chat.completions.create({
            model: env_1.env.openaiModel,
            temperature: 0.2,
            max_tokens: 1500,
            messages: [
                {
                    role: 'system',
                    content: `You are a physician writing a medical necessity letter for insurance prior authorization.
Write in formal clinical language. Be specific about diagnosis codes, failed alternative treatments,
evidence-based guidelines, and clinical severity. This is a real patient document — be accurate and thorough.`,
                },
                { role: 'user', content: prompt },
            ],
        });
        return response.choices[0]?.message?.content ?? '';
    }
}
exports.OpenAIService = OpenAIService;
exports.openaiService = new OpenAIService();
