import OpenAI from 'openai';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { demoFHIRService } from '../ehr/demoFHIR.service';
import { openaiService } from './openai.service';
import { insurerRequirementsService } from '../insurer/requirements.service';
import { submissionService } from '../insurer/submission.service';
import { PatientContext, FHIRMedication, FHIRCondition, PriorAuthForm } from '../../utils/types';

// Tool definitions for OpenAI function-calling. Use `parameters` to match OpenAI's function schema.
const PA_TOOLS: Array<{ name: string; description: string; parameters: Record<string, unknown> }> = [
  {
    name: 'get_patient_context',
    description: 'Fetch patient demographics and insurance info from FHIR',
    parameters: {
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
    parameters: {
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
    parameters: {
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
    parameters: {
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
    parameters: {
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
    parameters: {
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
    parameters: {
      type: 'object',
      properties: {
        form: { type: 'object', description: 'The PA form to validate' },
        insurer_requirements: { type: 'object', description: 'Requirements from the insurer' },
      },
      required: ['form'],
    },
  },
];

interface AgentContext {
  patientId: string;
  insurerId: string;
  medicationId?: string;
  onStatusUpdate?: (status: string, detail: string) => void;
}

interface AgentResult {
  success: boolean;
  form?: PriorAuthForm;
  submissionResult?: {
    referenceNumber: string;
    status: string;
    estimatedDecisionDate: string;
    submittedAt: string;
  };
  patient?: PatientContext;
  medications?: FHIRMedication[];
  conditions?: FHIRCondition[];
  agentLog: Array<{ role: string; content: string }>;
  error?: string;
}

// OpenAI's legacy function-calling message shape isn't fully expressed by the
// SDK's ChatCompletionMessageParam union once you're hand-assembling turns,
// so we track messages loosely and let the SDK call itself do the validation.
type AgentMessage = { role: 'system' | 'user' | 'assistant' | 'function'; content: string | null; name?: string; function_call?: { name: string; arguments: string } };

// Local cache for agent session data
const sessionCache = new Map<string, {
  patient?: PatientContext;
  medications?: FHIRMedication[];
  conditions?: FHIRCondition[];
  form?: PriorAuthForm;
}>();

export class PriorAuthAgentLoop {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: env.openaiApiKey });
  }

  async run(context: AgentContext): Promise<AgentResult> {
    const sessionId = `${context.patientId}-${context.insurerId}-${Date.now()}`;
    sessionCache.set(sessionId, {});

    const agentLog: Array<{ role: string; content: string }> = [];
    const messages: AgentMessage[] = [];

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

    let finalForm: PriorAuthForm | undefined;
    let submissionResult: AgentResult['submissionResult'] | undefined;
    let iterations = 0;
    const MAX_ITERATIONS = 10;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      logger.info(`[AgentLoop] Iteration ${iterations}`);

      // Call chat completions with function definitions so the model can request tool executions.
      const chatResponse = await this.client.chat.completions.create({
        model: env.openaiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content, name: m.name, function_call: m.function_call } as any)),
        ],
        functions: PA_TOOLS as any,
        function_call: 'auto',
        temperature: 0.0,
      });

      const choice = chatResponse.choices?.[0];
      const message = choice?.message;

      if (!message) {
        logger.info('[AgentLoop] No message from model; ending loop');
        break;
      }

      // If the model requested a function call, execute it and provide the result back to the model.
      if (message.function_call) {
        const fn = message.function_call;
        const fnName: string = fn.name;
        let fnArgs: Record<string, unknown> = {};

        try {
          fnArgs = JSON.parse(fn.arguments || '{}');
        } catch (err) {
          logger.error('[AgentLoop] Failed to parse function arguments', err);
        }

        logger.info(`[AgentLoop] Model requested function: ${fnName}`);
        agentLog.push({ role: 'assistant', content: `Calling ${fnName}(${JSON.stringify(fnArgs)})` });

        // Record the assistant's function_call turn itself — OpenAI requires this
        // to precede the matching `function` role message, or the next call 400s.
        messages.push({ role: 'assistant', content: null, function_call: { name: fnName, arguments: fn.arguments || '{}' } });

        const toolResult = await this.executeTool(fnName, fnArgs, sessionId, context) as unknown;

        // Capture terminal artifacts as they're produced — this is what the
        // caller actually needs back, not just the transcript.
        if (fnName === 'draft_pa_form') {
          finalForm = toolResult as PriorAuthForm;
        }
        if (fnName === 'submit_pa_form') {
          submissionResult = toolResult as AgentResult['submissionResult'];
        }

        // Add the function result to messages so the model can continue reasoning.
        // The `function` role message MUST carry `name`, or OpenAI rejects the request.
        const functionResultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
        messages.push({ role: 'function', name: fnName, content: functionResultStr });
        agentLog.push({ role: 'function', content: functionResultStr });

        // Continue to next iteration to let the model incorporate the tool output.
        continue;
      }

      // If the model replied with assistant content (no function call), record it and break.
      const assistantText = message.content ?? '';
      if (assistantText) {
        logger.info(`[AgentLoop] Assistant: ${assistantText.slice(0, 200)}`);
        agentLog.push({ role: 'assistant', content: assistantText });
        messages.push({ role: 'assistant', content: assistantText });
      }

      break;
    }

    if (iterations >= MAX_ITERATIONS && !submissionResult) {
      logger.info(`[AgentLoop] Hit MAX_ITERATIONS (${MAX_ITERATIONS}) without a submission`);
      agentLog.push({ role: 'system', content: `Stopped after ${MAX_ITERATIONS} iterations without completing submission.` });
    }

    const session = sessionCache.get(sessionId);
    sessionCache.delete(sessionId);

    return {
      success: !!submissionResult,
      form: finalForm,
      submissionResult,
      patient: session?.patient,
      medications: session?.medications,
      conditions: session?.conditions,
      agentLog,
      error: !submissionResult ? 'Agent did not reach submission before the conversation ended' : undefined,
    };
  }

  private async executeTool(
    name: string,
    input: Record<string, unknown>,
    sessionId: string,
    _context: AgentContext
  ): Promise<unknown> {
    const session = sessionCache.get(sessionId) || {};

    switch (name) {
      case 'get_patient_context': {
        const patient = await demoFHIRService.getPatient(input.patient_id as string);
        session.patient = patient;
        sessionCache.set(sessionId, session);
        return patient;
      }

      case 'get_medications': {
        const meds = await demoFHIRService.getMedicationRequests(input.patient_id as string);
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
        const conditions = await demoFHIRService.getConditions(input.patient_id as string);
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
        return insurerRequirementsService.getRequirements(input.insurer_id as string);
      }

      case 'draft_pa_form': {
        const snap = await demoFHIRService.getClinicalSnapshot(input.patient_id as string);
        const form = await openaiService.draftPriorAuthForm(
          snap.patient,
          snap.medications,
          snap.conditions,
          (input.medication_id as string) || snap.medications[0]?.id || ''
        );
        session.form = form;
        sessionCache.set(sessionId, session);
        return form;
      }

      case 'check_completeness': {
        const form = input.form as Record<string, unknown>;
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
        const result = await submissionService.submitPriorAuth(
          input.insurer_id as string,
          input.form as PriorAuthForm
        );
        return result;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}

export const priorAuthAgentLoop = new PriorAuthAgentLoop();