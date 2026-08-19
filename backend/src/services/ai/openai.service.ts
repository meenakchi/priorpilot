import OpenAI from 'openai';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { FHIRCondition, FHIRMedication, PatientContext, PriorAuthForm } from '../../utils/types';
import { buildPriorAuthPrompt, buildJustificationPrompt } from './promptTemplates';
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, coerceTypes: true });

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

const validateForm = ajv.compile(priorAuthFormSchema as any);

export class OpenAIService {
  private client?: OpenAI;

  private ensureClient(): OpenAI {
    if (!env.openaiApiKey) {
      throw new Error('Missing OpenAI API key. Set OPENAI_API_KEY in backend/.env or your shell before invoking AI routes.');
    }

    if (!this.client) {
      this.client = new OpenAI({ apiKey: env.openaiApiKey });
    }

    return this.client;
  }

  async draftPriorAuthForm(
    patient: PatientContext,
    medications: FHIRMedication[],
    conditions: FHIRCondition[],
    targetMedicationId: string
  ): Promise<PriorAuthForm> {
    logger.info(`[OpenAI] Drafting prior auth form for patient: ${patient.patientId}`);

    const targetMed = medications.find((m) => m.id === targetMedicationId) || medications[0];
    const prompt = buildPriorAuthPrompt(patient, targetMed, conditions);
    const client = this.ensureClient();

    const response = await client.chat.completions.create({
      model: env.openaiModel,
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
    let lastError: Error | null = null;

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
          if (ch === '{') depth++;
          else if (ch === '}') depth--;
          if (depth === 0) { end = i; break; }
        }

        if (end === -1) throw new Error('OpenAI response JSON object was not well-formed');

        const jsonStr = text.slice(start, end + 1).replace(/```(?:json)?\n?/g, '').trim();
        const parsed = JSON.parse(jsonStr) as unknown;

        // Validate using AJV
        const valid = validateForm(parsed as any);
        if (!valid) {
          const errText = ajv.errorsText(validateForm.errors);
          throw new Error(`Validation failed: ${errText}`);
        }

        const asForm = parsed as PriorAuthForm;
        // Normalize confidenceScore if it's a string
        if ((asForm as any).confidenceScore && typeof (asForm as any).confidenceScore === 'string') {
          const s = (asForm as any).confidenceScore as string;
          const num = parseFloat(s.replace('%', ''));
          (asForm as any).confidenceScore = isNaN(num) ? undefined : (num > 1 ? num / 100 : num);
        }

        logger.info('[OpenAI] Prior auth form drafted and validated');
        return asForm;
      } catch (err: unknown) {
        lastError = err as Error;
        logger.warn(`[OpenAI] Attempt ${attempts} failed to parse/validate`, { error: lastError.message });
        if (attempts < maxAttempts) {
          // Try again with a stricter system prompt
          const client = this.ensureClient();
          const retryResponse = await client.chat.completions.create({
            model: env.openaiModel,
            temperature: 0.0,
            max_tokens: 2000,
            messages: [
              { role: 'system', content: 'Output exactly one JSON object and nothing else. No explanation. Respond only with the JSON.' },
              { role: 'user', content: buildPriorAuthPrompt(patient, targetMed, conditions) },
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

    logger.error('[OpenAI] All attempts failed to produce a valid form', { error: lastError?.message });
    throw new Error('Failed to parse OpenAI response as prior auth form JSON');
  }

  async generateClinicalJustification(
    patient: PatientContext,
    medication: FHIRMedication,
    conditions: FHIRCondition[]
  ): Promise<string> {
    logger.info('[OpenAI] Generating clinical justification narrative');

    const prompt = buildJustificationPrompt(patient, medication, conditions);
    const client = this.ensureClient();
    const response = await client.chat.completions.create({
      model: env.openaiModel,
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

export const openaiService = new OpenAIService();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
