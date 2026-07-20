import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { PriorAuthRequest, PriorAuthStatus } from '../utils/types';
import { tokenVaultService } from '../services/auth/tokenVault.service';
import { cibaService } from '../services/auth/ciba.service';
import { demoFHIRService } from '../services/ehr/demoFHIR.service';
import { createFHIRService } from '../services/ehr/fhir.service';
import { claudeService } from '../services/ai/claude.service';
import { submissionService } from '../services/insurer/submission.service';
import { insurerRequirementsService } from '../services/insurer/requirements.service';

// In-memory store for hackathon — use DB in production
const requestStore = new Map<string, PriorAuthRequest>();

export interface WorkflowInput {
  patientId: string;
  insurerId: string;
  medicationId?: string;
  userAuth0AccessToken: string;
  userEmail: string;
  useDemo?: boolean; // If true, skip Token Vault and use Epic open sandbox
}

export class PriorAuthWorkflow {
  /**
   * Full end-to-end prior authorization workflow:
   * 1. Check insurer requirements
   * 2. CIBA step-up consent from patient
   * 3. Get FHIR token from Token Vault (or use demo)
   * 4. Fetch clinical data from Epic FHIR
   * 5. Claude analyzes & drafts PA form
   * 6. Submit to insurer
   */
  async execute(input: WorkflowInput): Promise<PriorAuthRequest> {
    const requestId = uuidv4();

    // Create initial record
    const request: PriorAuthRequest = {
      id: requestId,
      patientId: input.patientId,
      medicationName: '',
      medicationCode: '',
      diagnosis: '',
      diagnosisCode: '',
      prescribingPhysician: '',
      insurerId: input.insurerId,
      status: 'pending_consent',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    requestStore.set(requestId, request);
    logger.info(`[Workflow] Started PA workflow. Request ID: ${requestId}`);

    try {
      // Step 1: Get insurer requirements
      const requirements = insurerRequirementsService.getRequirements(input.insurerId);
      logger.info(`[Workflow] Insurer: ${requirements.insurerName}, CIBA required: ${requirements.requiresCIBA}`);

      // Step 2: CIBA step-up consent (if insurer requires it)
      if (requirements.requiresCIBA && !input.useDemo) {
        this.updateStatus(requestId, 'pending_consent');

        const cibaResponse = await cibaService.initiateRequest(
          input.userEmail,
          'openid fhir:read',
          `PriorAgent needs your consent to read health records for ${requirements.insurerName} authorization`
        );

        logger.info(`[Workflow] CIBA initiated — waiting for patient consent...`);
        await cibaService.pollForToken(cibaResponse.auth_req_id, cibaResponse.interval);
        logger.info(`[Workflow] Patient consented via CIBA.`);
      }

      // Step 3: Get FHIR access token
      this.updateStatus(requestId, 'fetching_records');
      let fhirSnapshot: Awaited<ReturnType<typeof demoFHIRService.getClinicalSnapshot>>;

      if (input.useDemo) {
        // Use Epic's open sandbox — no token needed
        logger.info('[Workflow] Using Epic open sandbox (demo mode)');
        fhirSnapshot = await demoFHIRService.getClinicalSnapshot(input.patientId);
      } else {
        // Get real SMART token from Token Vault
        logger.info('[Workflow] Retrieving FHIR token from Auth0 Token Vault');
        const vaultToken = await tokenVaultService.getToken(
          input.userAuth0AccessToken,
          'epic-fhir'
        );

        const fhirService = createFHIRService(vaultToken.access_token);
        fhirSnapshot = await fhirService.getClinicalSnapshot(input.patientId);
      }

      const { patient, medications, conditions } = fhirSnapshot;

      // Update request with discovered clinical data
      const primaryMed = medications.find((m) => m.id === input.medicationId) || medications[0];
      if (primaryMed) {
        request.medicationName = primaryMed.medicationCodeableConcept.text;
        request.medicationCode = primaryMed.medicationCodeableConcept.coding[0]?.code || '';
        request.prescribingPhysician = primaryMed.requester?.display || '';
      }
      const primaryCondition = conditions[0];
      if (primaryCondition) {
        request.diagnosis = primaryCondition.code.text;
        request.diagnosisCode = primaryCondition.code.coding[0]?.code || '';
      }
      requestStore.set(requestId, { ...request });

      // Step 4: Claude drafts the PA form
      this.updateStatus(requestId, 'analyzing');
      logger.info('[Workflow] Claude is analyzing clinical records...');

      const form = await claudeService.draftPriorAuthForm(
        patient,
        medications,
        conditions,
        input.medicationId || medications[0]?.id || ''
      );

      this.updateStatus(requestId, 'draft_ready');
      const updated = requestStore.get(requestId)!;
      updated.aiDraftForm = form;
      requestStore.set(requestId, updated);

      // Step 5: Submit to insurer
      logger.info('[Workflow] Submitting PA to insurer...');
      const result = await submissionService.submitPriorAuth(input.insurerId, form);

      this.updateStatus(requestId, 'submitted');
      const final = requestStore.get(requestId)!;
      final.submissionResult = result;
      requestStore.set(requestId, final);

      logger.info(`[Workflow] ✅ PA workflow complete. Reference: ${result.referenceNumber}`);
      return requestStore.get(requestId)!;

    } catch (err: unknown) {
      const error = err as Error;
      logger.error(`[Workflow] ❌ Workflow failed: ${error.message}`);
      this.updateStatus(requestId, 'error');
      throw error;
    }
  }

  getRequest(requestId: string): PriorAuthRequest | undefined {
    return requestStore.get(requestId);
  }

  listRequests(patientId: string): PriorAuthRequest[] {
    return Array.from(requestStore.values()).filter((r) => r.patientId === patientId);
  }

  private updateStatus(requestId: string, status: PriorAuthStatus): void {
    const req = requestStore.get(requestId);
    if (req) {
      req.status = status;
      req.updatedAt = new Date().toISOString();
      requestStore.set(requestId, req);
    }
  }
}

export const priorAuthWorkflow = new PriorAuthWorkflow();