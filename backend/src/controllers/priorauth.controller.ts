import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import workflowQueue from '../lib/queue';
import * as requestStoreLib from '../lib/requestStore';
import { priorAuthWorkflow } from '../workflows/priorAuth.workflow';
import { openaiService } from '../services/ai/openai.service';
import { demoFHIRService } from '../services/ehr/demoFHIR.service';
import { submissionService } from '../services/insurer/submission.service';
import { insurerRequirementsService } from '../services/insurer/requirements.service';
import { logger } from '../utils/logger';
import { env } from '../config/env';

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

    const requestId = uuidv4();

    // Create initial request record in Redis so callers can poll immediately
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

    // Enqueue the background job; the worker will run the workflow and update the record
    await workflowQueue.add('runPriorAuth', {
      ...{
        patientId,
        insurerId,
        medicationId,
        userAuth0AccessToken: accessToken,
        userEmail,
        useDemo: useDemo ?? env.useDemoFhirDefault,
        requestId,
      },
    });

    res.json({ message: 'Prior authorization workflow started', requestId, status: 'pending_consent' });
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
      useDemo: useDemo ?? env.useDemoFhirDefault,
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
    const request = await requestStoreLib.getRequest(requestId);
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
    const requests = await requestStoreLib.listRequests(patientId);
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
    const form = await openaiService.draftPriorAuthForm(
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