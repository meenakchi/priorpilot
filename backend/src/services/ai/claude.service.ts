import { openaiService } from './openai.service';
import { FHIRCondition, FHIRMedication, PatientContext, PriorAuthForm } from '../../utils/types';

export class PriorAuthAIService {
  async draftPriorAuthForm(
    patient: PatientContext,
    medications: FHIRMedication[],
    conditions: FHIRCondition[],
    targetMedicationId: string
  ): Promise<PriorAuthForm> {
    return openaiService.draftPriorAuthForm(patient, medications, conditions, targetMedicationId);
  }

  async generateClinicalJustification(
    patient: PatientContext,
    medication: FHIRMedication,
    conditions: FHIRCondition[]
  ): Promise<string> {
    return openaiService.generateClinicalJustification(patient, medication, conditions);
  }
}

export const claudeService = new PriorAuthAIService();
export const aiService = claudeService;