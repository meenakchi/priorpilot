import OpenAI from 'openai';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { FHIRCondition, FHIRMedication, PatientContext, PriorAuthForm } from '../../utils/types';
import { buildPriorAuthPrompt, buildJustificationPrompt } from './promptTemplates';

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

    const text = response.choices[0]?.message?.content ?? '';
    if (!text) throw new Error('No response received from OpenAI');

    try {
      const jsonStr = text.replace(/```(?:json)?\n?/g, '').trim();
      const form = JSON.parse(jsonStr) as PriorAuthForm;
      logger.info('[OpenAI] Prior auth form drafted successfully');
      return form;
    } catch {
      logger.error('[OpenAI] Failed to parse JSON response', { raw: text });
      throw new Error('Failed to parse OpenAI response as prior auth form JSON');
    }
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
