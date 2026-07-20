import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { priorAuthWorkflow } from '../workflows/priorAuth.workflow';
import { insurerRequirementsService } from '../services/insurer/requirements.service';
import { logger } from '../utils/logger';

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

    // Run workflow asynchronously and return request ID immediately
    const requestId = `req-${Date.now()}`;

    // Start the workflow in background
    priorAuthWorkflow
      .execute({
        patientId,
        insurerId,
        medicationId,
        userAuth0AccessToken: accessToken,
        userEmail,
        useDemo: useDemo ?? (process.env.NODE_ENV === 'development'),
      })
      .catch((err: Error) => logger.error('[Route] Background workflow error', err.message));

    res.json({
      message: 'Prior authorization workflow started',
      requestId,
      status: 'pending_consent',
    });
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
      useDemo: useDemo ?? true,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get a specific PA request
router.get('/request/:requestId', requireAuth, (req: Request, res: Response) => {
  const request = priorAuthWorkflow.getRequest(req.params.requestId);
  if (!request) {
    res.status(404).json({ error: 'Prior auth request not found' });
    return;
  }
  res.json(request);
});

// List all PA requests for a patient
router.get('/patient/:patientId', requireAuth, (req: Request, res: Response) => {
  const requests = priorAuthWorkflow.listRequests(req.params.patientId);
  res.json(requests);
});
import { priorAuthAgentLoop } from '../services/ai/agentLoop.service';

// Agentic endpoint — Claude drives the full workflow autonomously
router.post('/agent/run', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { patientId, insurerId, medicationId } = req.body;

    if (!patientId || !insurerId) {
      res.status(400).json({ error: 'patientId and insurerId are required' });
      return;
    }

    logger.info(`[Agent Route] Running autonomous agent for patient=${patientId}`);

    const result = await priorAuthAgentLoop.run({
      patientId,
      insurerId,
      medicationId,
      onStatusUpdate: (tool, detail) => {
        logger.info(`[Agent] Using tool: ${tool} — ${detail.slice(0, 100)}`);
      },
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});
export default router;