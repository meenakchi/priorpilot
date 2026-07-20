import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { demoFHIRService } from '../ehr/demoFHIR.service';
import { claudeService } from './claude.service';
import { insurerRequirementsService } from '../insurer/requirements.service';
import { submissionService } from '../insurer/submission.service';
import { PatientContext, FHIRMedication, FHIRCondition, PriorAuthForm } from '../../utils/types';

// Tool definitions for Claude to call
const PA_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_patient_context',
    description: 'Fetch patient demographics and insurance info from FHIR',
    input_schema: {
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
      type: 'object' as const,
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
  agentLog: Array<{ role: string; content: string }>;
  error?: string;
}

// Local cache for agent session data
const sessionCache = new Map<string, {
  patient?: PatientContext;
  medications?: FHIRMedication[];
  conditions?: FHIRCondition[];
  form?: PriorAuthForm;
}>();

export class PriorAuthAgentLoop {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: env.anthropicApiKey });
  }

  async run(context: AgentContext): Promise<AgentResult> {
    const sessionId = `${context.patientId}-${context.insurerId}-${Date.now()}`;
    sessionCache.set(sessionId, {});

    const agentLog: Array<{ role: string; content: string }> = [];
    const messages: Anthropic.MessageParam[] = [];

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

      const response = await this.client.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 4096,
        system: systemPrompt,
        tools: PA_TOOLS,
        messages,
      });

      // Add assistant response to messages
      messages.push({ role: 'assistant', content: response.content });

      // Log text blocks
      for (const block of response.content) {
        if (block.type === 'text') {
          logger.info(`[AgentLoop] Agent: ${block.text.slice(0, 200)}`);
          agentLog.push({ role: 'assistant', content: block.text });
        }
      }

      // Check stop reason
      if (response.stop_reason === 'end_turn') {
        logger.info('[AgentLoop] Agent completed task');
        break;
      }

      if (response.stop_reason !== 'tool_use') {
        break;
      }

      // Process tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        logger.info(`[AgentLoop] Tool call: ${block.name}`);
        context.onStatusUpdate?.(block.name, JSON.stringify(block.input));

        let result: unknown;

        try {
          result = await this.executeTool(block.name, block.input as Record<string, unknown>, sessionId, context);
        } catch (err) {
          const error = err as Error;
          result = { error: error.message };
          logger.error(`[AgentLoop] Tool error: ${block.name}`, error.message);
        }

        // Capture form and submission from tool results
        if (block.name === 'draft_pa_form' && result && typeof result === 'object' && 'patientName' in result) {
          finalForm = result as PriorAuthForm;
        }
        if (block.name === 'submit_pa_form' && result && typeof result === 'object' && 'referenceNumber' in result) {
          submissionResult = result as AgentResult['submissionResult'];
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });

        agentLog.push({
          role: 'tool',
          content: `${block.name}: ${JSON.stringify(result).slice(0, 300)}`,
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    sessionCache.delete(sessionId);

    return {
      success: !!submissionResult,
      form: finalForm,
      submissionResult,
      agentLog,
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
        const form = await claudeService.draftPriorAuthForm(
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