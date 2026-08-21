"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.priorAuthAgentLoop = exports.PriorAuthAgentLoop = void 0;
const openai_1 = __importDefault(require("openai"));
const env_1 = require("../../config/env");
const logger_1 = require("../../utils/logger");
const demoFHIR_service_1 = require("../ehr/demoFHIR.service");
const openai_service_1 = require("./openai.service");
const requirements_service_1 = require("../insurer/requirements.service");
const submission_service_1 = require("../insurer/submission.service");
// Tool definitions for OpenAI to call
const PA_TOOLS = [
    {
        name: 'get_patient_context',
        description: 'Fetch patient demographics and insurance info from FHIR',
        input_schema: {
            type: 'object',
            properties: {
                patient_id: { type: 'string', description: 'The FHIR patient ID' },
            },
            required: ['patient_id'],
        },
    },
    {
        name: 'get_medications',
        description: 'Fetch active medication requests for a patient',
        input_schema: {
            type: 'object',
            properties: {
                patient_id: { type: 'string', description: 'The FHIR patient ID' },
            },
            required: ['patient_id'],
        },
    },
    {
        name: 'get_conditions',
        description: 'Fetch active diagnoses and conditions for a patient',
        input_schema: {
            type: 'object',
            properties: {
                patient_id: { type: 'string', description: 'The FHIR patient ID' },
            },
            required: ['patient_id'],
        },
    },
    {
        name: 'get_insurer_requirements',
        description: 'Get the PA requirements for a specific insurer',
        input_schema: {
            type: 'object',
            properties: {
                insurer_id: { type: 'string', description: 'The insurer ID (e.g. BCBS, AETNA)' },
            },
            required: ['insurer_id'],
        },
    },
    {
        name: 'draft_pa_form',
        description: 'Draft the prior authorization form using patient clinical data',
        input_schema: {
            type: 'object',
            properties: {
                patient_id: { type: 'string' },
                medication_id: { type: 'string', description: 'Target medication to authorize' },
                insurer_id: { type: 'string' },
            },
            required: ['patient_id', 'insurer_id'],
        },
    },
    {
        name: 'submit_pa_form',
        description: 'Submit the completed PA form to the insurer',
        input_schema: {
            type: 'object',
            properties: {
                insurer_id: { type: 'string' },
                form: { type: 'object', description: 'The completed PA form data' },
            },
            required: ['insurer_id', 'form'],
        },
    },
    {
        name: 'check_completeness',
        description: 'Verify that all required fields are present before submission',
        input_schema: {
            type: 'object',
            properties: {
                form: { type: 'object', description: 'The PA form to validate' },
                insurer_requirements: { type: 'object', description: 'Requirements from the insurer' },
            },
            required: ['form'],
        },
    },
];
// Local cache for agent session data
const sessionCache = new Map();
class PriorAuthAgentLoop {
    constructor() {
        this.client = new openai_1.default({ apiKey: env_1.env.openaiApiKey });
    }
    async run(context) {
        const sessionId = `${context.patientId}-${context.insurerId}-${Date.now()}`;
        sessionCache.set(sessionId, {});
        const agentLog = [];
        const messages = [];
        const systemPrompt = `You are PriorAgent, an autonomous AI agent that handles insurance prior authorization requests end-to-end.

Your job:
1. Gather patient clinical data (demographics, medications, conditions) from FHIR
2. Understand the insurer's specific requirements
3. Draft a complete, accurate PA form based on the clinical evidence
4. Validate completeness
5. Submit the form

Patient ID: ${context.patientId}
Insurer ID: ${context.insurerId}
${context.medicationId ? `Target Medication ID: ${context.medicationId}` : ''}

Be systematic. Use each tool in sequence. Never fabricate clinical data. If data is missing, note it clearly in the form. Always verify completeness before submitting.`;
        const userMessage = `Please process a prior authorization request for patient ${context.patientId} with insurer ${context.insurerId}. 
Complete the full workflow: gather records, draft the PA form, validate it, and submit it.`;
        messages.push({ role: 'user', content: userMessage });
        agentLog.push({ role: 'user', content: userMessage });
        let finalForm;
        let submissionResult;
        let iterations = 0;
        const MAX_ITERATIONS = 10;
        while (iterations < MAX_ITERATIONS) {
            iterations++;
            logger_1.logger.info(`[AgentLoop] Iteration ${iterations}`);
            const response = await this.client.responses.create({
                model: env_1.env.openaiModel,
                input: [
                    { role: 'system', content: systemPrompt },
                    ...messages.map((message) => ({ role: message.role, content: message.content }))
                ],
            });
            const responseText = typeof response.output_text === 'string' ? response.output_text : '';
            if (responseText) {
                logger_1.logger.info(`[AgentLoop] Agent: ${responseText.slice(0, 200)}`);
                agentLog.push({ role: 'assistant', content: responseText });
                messages.push({ role: 'assistant', content: responseText });
            }
            if (!responseText) {
                logger_1.logger.info('[AgentLoop] Agent completed task');
                break;
            }
            // For the simplified OpenAI flow, we treat the assistant output as the final step and continue
            // by invoking the drafting/submission tools directly from the workflow service.
            break;
        }
        sessionCache.delete(sessionId);
        return {
            success: !!submissionResult,
            form: finalForm,
            submissionResult,
            agentLog,
        };
    }
    async executeTool(name, input, sessionId, _context) {
        const session = sessionCache.get(sessionId) || {};
        switch (name) {
            case 'get_patient_context': {
                const patient = await demoFHIR_service_1.demoFHIRService.getPatient(input.patient_id);
                session.patient = patient;
                sessionCache.set(sessionId, session);
                return patient;
            }
            case 'get_medications': {
                const meds = await demoFHIR_service_1.demoFHIRService.getMedicationRequests(input.patient_id);
                session.medications = meds;
                sessionCache.set(sessionId, session);
                return meds.map(m => ({
                    id: m.id,
                    name: m.medicationCodeableConcept.text,
                    prescriber: m.requester?.display,
                    reason: m.reasonCode?.[0]?.text,
                }));
            }
            case 'get_conditions': {
                const conditions = await demoFHIR_service_1.demoFHIRService.getConditions(input.patient_id);
                session.conditions = conditions;
                sessionCache.set(sessionId, session);
                return conditions.map(c => ({
                    id: c.id,
                    diagnosis: c.code.text,
                    icd10: c.code.coding[0]?.code,
                    onset: c.onsetDateTime,
                }));
            }
            case 'get_insurer_requirements': {
                return requirements_service_1.insurerRequirementsService.getRequirements(input.insurer_id);
            }
            case 'draft_pa_form': {
                const snap = await demoFHIR_service_1.demoFHIRService.getClinicalSnapshot(input.patient_id);
                const form = await openai_service_1.openaiService.draftPriorAuthForm(snap.patient, snap.medications, snap.conditions, input.medication_id || snap.medications[0]?.id || '');
                session.form = form;
                sessionCache.set(sessionId, session);
                return form;
            }
            case 'check_completeness': {
                const form = input.form;
                const required = ['patientName', 'patientDOB', 'memberId', 'medicationRequested',
                    'icd10Code', 'diagnosis', 'clinicalJustification', 'prescribingPhysician'];
                const missing = required.filter(f => !form[f]);
                return {
                    isComplete: missing.length === 0,
                    missingFields: missing,
                    readyToSubmit: missing.length === 0,
                };
            }
            case 'submit_pa_form': {
                const result = await submission_service_1.submissionService.submitPriorAuth(input.insurer_id, input.form);
                return result;
            }
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
}
exports.PriorAuthAgentLoop = PriorAuthAgentLoop;
exports.priorAuthAgentLoop = new PriorAuthAgentLoop();
