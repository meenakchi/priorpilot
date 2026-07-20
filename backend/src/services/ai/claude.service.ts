import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { FHIRCondition, FHIRMedication, PatientContext, PriorAuthForm } from '../../utils/types';
import { buildPriorAuthPrompt, buildJustificationPrompt } from './promptTemplates';

export class ClaudeService {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: env.anthropicApiKey });
  }

  /**
   * Analyze clinical records and draft a complete prior authorization form.
   * Returns structured JSON that maps directly to the PA form fields.
   */
  async draftPriorAuthForm(
    patient: PatientContext,
    medications: FHIRMedication[],
    conditions: FHIRCondition[],
    targetMedicationId: string
  ): Promise<PriorAuthForm> {
    logger.info(`[Claude] Drafting prior auth form for patient: ${patient.patientId}`);

    const targetMed = medications.find((m) => m.id === targetMedicationId) || medications[0];
    const prompt = buildPriorAuthPrompt(patient, targetMed, conditions);

    const message = await this.client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2000,
      system: `You are a clinical documentation specialist AI helping draft insurance prior authorization forms.
You have deep knowledge of ICD-10 codes, NDC numbers, medical necessity criteria, and insurer PA requirements.
Always output valid JSON matching the exact schema requested. Be thorough in clinical justification.
Never fabricate clinical data — only use what is provided in the FHIR records.`,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response type from Claude');

    try {
      // Strip markdown code fences if present
      const jsonStr = content.text.replace(/```(?:json)?\n?/g, '').trim();
      const form = JSON.parse(jsonStr) as PriorAuthForm;
      logger.info('[Claude] Prior auth form drafted successfully');
      return form;
    } catch {
      logger.error('[Claude] Failed to parse JSON response', { raw: content.text });
      throw new Error('Failed to parse Claude response as prior auth form JSON');
    }
  }

  /**
   * Generate a detailed clinical justification narrative for an appeal or complex case.
   */
  async generateClinicalJustification(
    patient: PatientContext,
    medication: FHIRMedication,
    conditions: FHIRCondition[]
  ): Promise<string> {
    logger.info('[Claude] Generating clinical justification narrative');

    const prompt = buildJustificationPrompt(patient, medication, conditions);

    const message = await this.client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1500,
      system: `You are a physician writing a medical necessity letter for insurance prior authorization.
Write in formal clinical language. Be specific about diagnosis codes, failed alternative treatments,
evidence-based guidelines, and clinical severity. This is a real patient document — be accurate and thorough.`,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response type');
    return content.text;
  }
}

export const claudeService = new ClaudeService();