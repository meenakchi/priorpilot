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
const ajv_1 = __importDefault(require("ajv"));
const ajv = new ajv_1.default({ allErrors: true, coerceTypes: true });
const priorAuthFormSchema = {
    type: 'object',
    required: ['patientName', 'patientDOB', 'medicationRequested'],
    properties: {
        patientName: { type: 'string' },
        patientDOB: { type: 'string' },
        memberId: { type: 'string' },
        medicationRequested: { type: 'string' },
        ndc: { type: 'string' },
        icd10Code: { type: 'string' },
        diagnosis: { type: 'string' },
        clinicalJustification: { type: 'string' },
        previousTreatments: { type: 'string' },
        prescribingPhysician: { type: 'string' },
        physicianNPI: { type: 'string' },
        urgency: { enum: ['routine', 'urgent', 'emergent'] },
        supportingDocumentation: { type: 'array', items: { type: 'string' } },
        confidenceScore: { type: ['number', 'null'] },
        evidence: { type: 'array', items: { type: 'object', properties: { resourceId: { type: 'string' }, excerpt: { type: 'string' } } } },
        sourceResourceIds: { type: 'array', items: { type: 'string' } },
    },
};
const validateForm = ajv.compile(priorAuthFormSchema);
class OpenAIService {
    ensureClient() {
        if (!env_1.env.openaiApiKey) {
            throw new Error('Missing OpenAI API key. Set OPENAI_API_KEY in backend/.env or your shell before invoking AI routes.');
        }
        if (!this.client) {
            this.client = new openai_1.default({ apiKey: env_1.env.openaiApiKey });
        }
        return this.client;
    }
    async draftPriorAuthForm(patient, medications, conditions, targetMedicationId) {
        logger_1.logger.info(`[OpenAI] Drafting prior auth form for patient: ${patient.patientId}`);
        const targetMed = medications.find((m) => m.id === targetMedicationId) || medications[0];
        const prompt = (0, promptTemplates_1.buildPriorAuthPrompt)(patient, targetMed, conditions);
        const client = this.ensureClient();
        const response = await client.chat.completions.create({
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
        let attempts = 0;
        const maxAttempts = 3;
        let lastError = null;
        while (attempts < maxAttempts) {
            attempts++;
            const text = response.choices[0]?.message?.content ?? '';
            if (!text) {
                lastError = new Error('No response received from OpenAI');
                break;
            }
            try {
                const start = text.indexOf('{');
                if (start === -1) {
                    throw new Error('OpenAI response did not contain a JSON object');
                }
                let depth = 0;
                let end = -1;
                for (let i = start; i < text.length; i++) {
                    const ch = text[i];
                    if (ch === '{')
                        depth++;
                    else if (ch === '}')
                        depth--;
                    if (depth === 0) {
                        end = i;
                        break;
                    }
                }
                if (end === -1)
                    throw new Error('OpenAI response JSON object was not well-formed');
                const jsonStr = text.slice(start, end + 1).replace(/```(?:json)?\n?/g, '').trim();
                const parsed = JSON.parse(jsonStr);
                // Validate using AJV
                const valid = validateForm(parsed);
                if (!valid) {
                    const errText = ajv.errorsText(validateForm.errors);
                    throw new Error(`Validation failed: ${errText}`);
                }
                const asForm = parsed;
                // Normalize confidenceScore if it's a string
                if (asForm.confidenceScore && typeof asForm.confidenceScore === 'string') {
                    const s = asForm.confidenceScore;
                    const num = parseFloat(s.replace('%', ''));
                    asForm.confidenceScore = isNaN(num) ? undefined : (num > 1 ? num / 100 : num);
                }
                logger_1.logger.info('[OpenAI] Prior auth form drafted and validated');
                return asForm;
            }
            catch (err) {
                lastError = err;
                logger_1.logger.warn(`[OpenAI] Attempt ${attempts} failed to parse/validate`, { error: lastError.message });
                if (attempts < maxAttempts) {
                    // Try again with a stricter system prompt
                    const client = this.ensureClient();
                    const retryResponse = await client.chat.completions.create({
                        model: env_1.env.openaiModel,
                        temperature: 0.0,
                        max_tokens: 2000,
                        messages: [
                            { role: 'system', content: 'Output exactly one JSON object and nothing else. No explanation. Respond only with the JSON.' },
                            { role: 'user', content: (0, promptTemplates_1.buildPriorAuthPrompt)(patient, targetMed, conditions) },
                        ],
                    });
                    // replace response with retryResponse for next loop
                    // @ts-ignore
                    response.choices[0].message.content = retryResponse.choices[0]?.message?.content ?? '';
                    await sleep(400 * attempts); // backoff
                    continue;
                }
            }
        }
        logger_1.logger.error('[OpenAI] All attempts failed to produce a valid form', { error: lastError?.message });
        throw new Error('Failed to parse OpenAI response as prior auth form JSON');
    }
    async generateClinicalJustification(patient, medication, conditions) {
        logger_1.logger.info('[OpenAI] Generating clinical justification narrative');
        const prompt = (0, promptTemplates_1.buildJustificationPrompt)(patient, medication, conditions);
        const client = this.ensureClient();
        const response = await client.chat.completions.create({
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
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
