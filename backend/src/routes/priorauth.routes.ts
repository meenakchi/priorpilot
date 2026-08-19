import { v4 as uuidv4 } from 'uuid';
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { priorAuthWorkflow } from '../workflows/priorAuth.workflow';
import workflowQueue from '../lib/queue';
import * as requestStoreLib from '../lib/requestStore';
import { insurerRequirementsService } from '../services/insurer/requirements.service';
import { priorAuthAgentLoop } from '../services/ai/agentLoop.service';
import { PriorAuthRequest } from '../utils/types';
import { logger } from '../utils/logger';
import { env } from '../config/env';

const router = Router();

// List available insurers
router.get('/insurers', (_req: Request, res: Response) => {
  res.json(insurerRequirementsService.listInsurers());
});

// Get insurer requirements
router.get('/insurers/:insurerId/requirements', (req: Request, res: Response) => {
  const requirements = insurerRequirementsService.getRequirements(req.params.insurerId);
  res.json(requirements);
});

// Start a new prior auth workflow
router.post('/start', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { patientId, insurerId, medicationId, useDemo } = req.body;

    if (!patientId || !insurerId) {
      res.status(400).json({ error: 'patientId and insurerId are required' });
      return;
    }

    const accessToken = req.oidc.accessToken?.access_token || '';
    const userEmail = req.oidc.user?.email || '';

    logger.info(`[Route] Starting PA workflow for patient: ${patientId}, insurer: ${insurerId}`);

    // Start workflow as background job and return a stable ID for polling
    const requestId = uuidv4();
    const initial = {
      id: requestId,
      patientId,
      medicationName: '',
      medicationCode: '',
      diagnosis: '',
      diagnosisCode: '',
      prescribingPhysician: '',
      insurerId,
      status: 'pending_consent',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await requestStoreLib.setRequest(requestId, initial as any);
    await workflowQueue.add('runPriorAuth', {
      patientId,
      insurerId,
      medicationId,
      userAuth0AccessToken: accessToken,
      userEmail,
      useDemo: useDemo ?? env.useDemoFhirDefault,
      requestId,
    });

    res.json({ message: 'Prior authorization workflow started', requestId, status: 'pending_consent' });
  } catch (err) {
    next(err);
  }
});

// Full synchronous workflow (for demo/hackathon — returns complete result)
router.post('/run', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { patientId, insurerId, medicationId, useDemo } = req.body;

    if (!patientId || !insurerId) {
      res.status(400).json({ error: 'patientId and insurerId are required' });
      return;
    }

    const accessToken = req.oidc.accessToken?.access_token || '';
    const userEmail = req.oidc.user?.email || '';

    const result = await priorAuthWorkflow.execute({
      patientId,
      insurerId,
      medicationId,
      userAuth0AccessToken: accessToken,
      userEmail,
      useDemo: useDemo ?? env.useDemoFhirDefault,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get a specific PA request
router.get('/request/:requestId', requireAuth, async (req: Request, res: Response) => {
  const request = await requestStoreLib.getRequest(req.params.requestId);
  if (!request) {
    res.status(404).json({ error: 'Prior auth request not found' });
    return;
  }
  res.json(request);
});

// List all PA requests for a patient
router.get('/patient/:patientId', requireAuth, async (req: Request, res: Response) => {
  const requests = await requestStoreLib.listRequests(req.params.patientId);
  res.json(requests);
});
// Agentic endpoint — OpenAI drives the full workflow autonomously via tool-calling.
// Response is adapted into the same PriorAuthRequest shape /run returns, so the
// frontend can render either path without knowing which one produced the result.
router.post('/agent/run', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { patientId, insurerId, medicationId } = req.body;

    if (!patientId || !insurerId) {
      res.status(400).json({ error: 'patientId and insurerId are required' });
      return;
    }

    logger.info(`[Agent Route] Running autonomous agent for patient=${patientId}`);

    const agentResult = await priorAuthAgentLoop.run({
      patientId,
      insurerId,
      medicationId,
      onStatusUpdate: (tool, detail) => {
        logger.info(`[Agent] Using tool: ${tool} — ${detail.slice(0, 100)}`);
      },
    });

    const primaryMed = agentResult.medications?.find((m) => m.id === medicationId) || agentResult.medications?.[0];
    const primaryCondition = agentResult.conditions?.[0];
    const now = new Date().toISOString();

    const response: PriorAuthRequest & { agentLog: typeof agentResult.agentLog; error?: string } = {
      id: uuidv4(),
      patientId,
      medicationName: agentResult.form?.medicationRequested || primaryMed?.medicationCodeableConcept.text || '',
      medicationCode: primaryMed?.medicationCodeableConcept.coding?.[0]?.code || '',
      diagnosis: agentResult.form?.diagnosis || primaryCondition?.code.text || '',
      diagnosisCode: agentResult.form?.icd10Code || primaryCondition?.code.coding?.[0]?.code || '',
      prescribingPhysician: agentResult.form?.prescribingPhysician || primaryMed?.requester?.display || '',
      insurerId,
      status: agentResult.success ? 'submitted' : 'error',
      createdAt: now,
      updatedAt: now,
      aiDraftForm: agentResult.form,
      submissionResult: agentResult.submissionResult,
      agentLog: agentResult.agentLog,
      error: agentResult.error,
    };

    res.json(response);
  } catch (err) {
    next(err);
  }
});
export default router;