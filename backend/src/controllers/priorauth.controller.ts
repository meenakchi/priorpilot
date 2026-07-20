import { Request, Response, NextFunction } from 'express';
import { priorAuthWorkflow } from '../workflows/priorAuth.workflow';
import { claudeService } from '../services/ai/claude.service';
import { demoFHIRService } from '../services/ehr/demoFHIR.service';
import { submissionService } from '../services/insurer/submission.service';
import { insurerRequirementsService } from '../services/insurer/requirements.service';
import { logger } from '../utils/logger';

export async function startWorkflow(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { patientId, insurerId, medicationId, useDemo } = req.body;

    if (!patientId || !insurerId) {
      res.status(400).json({ error: 'patientId and insurerId are required' });
      return;
    }

    const accessToken = req.oidc.accessToken?.access_token || '';
    const userEmail = req.oidc.user?.email || '';

    logger.info(`[PA Controller] Starting workflow: patient=${patientId}, insurer=${insurerId}`);

    const requestId = `req-${Date.now()}`;

    priorAuthWorkflow
      .execute({
        patientId,
        insurerId,
        medicationId,
        userAuth0AccessToken: accessToken,
        userEmail,
        useDemo: useDemo ?? true,
      })
      .catch((err: Error) => logger.error('[PA Controller] Background workflow error', err.message));

    res.json({
      message: 'Prior authorization workflow started',
      requestId,
      status: 'pending_consent',
    });
  } catch (err) {
    next(err);
  }
}

export async function runWorkflow(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
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
}

export async function getRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { requestId } = req.params;
    const request = priorAuthWorkflow.getRequest(requestId);

    if (!request) {
      res.status(404).json({ error: 'Prior auth request not found' });
      return;
    }

    res.json(request);
  } catch (err) {
    next(err);
  }
}

export async function listPatientRequests(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { patientId } = req.params;
    const requests = priorAuthWorkflow.listRequests(patientId);
    res.json(requests);
  } catch (err) {
    next(err);
  }
}

export async function getDraftForm(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { patientId } = req.params;
    const { insurerId, medicationId } = req.query;

    if (!insurerId) {
      res.status(400).json({ error: 'insurerId query param required' });
      return;
    }

    const snapshot = await demoFHIRService.getClinicalSnapshot(patientId);
    const form = await claudeService.draftPriorAuthForm(
      snapshot.patient,
      snapshot.medications,
      snapshot.conditions,
      (medicationId as string) || snapshot.medications[0]?.id || ''
    );

    res.json(form);
  } catch (err) {
    next(err);
  }
}

export async function submitForm(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { insurerId, form } = req.body;

    if (!insurerId || !form) {
      res.status(400).json({ error: 'insurerId and form are required' });
      return;
    }

    const result = await submissionService.submitPriorAuth(insurerId, form);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export function listInsurers(
  _req: Request,
  res: Response
): void {
  res.json(insurerRequirementsService.listInsurers());
}

export function getInsurerRequirements(
  req: Request,
  res: Response
): void {
  const requirements = insurerRequirementsService.getRequirements(req.params.insurerId);
  res.json(requirements);
}