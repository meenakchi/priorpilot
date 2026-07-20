import { Request, Response, NextFunction } from 'express';
import { demoFHIRService } from '../services/ehr/demoFHIR.service';
import { createFHIRService } from '../services/ehr/fhir.service';
import { tokenVaultService } from '../services/auth/tokenVault.service';
import { logger } from '../utils/logger';

export async function getClinicalSnapshot(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { patientId } = req.params;
    const useDemo = req.query.demo === 'true' || process.env.NODE_ENV === 'development';

    if (!patientId) {
      res.status(400).json({ error: 'patientId is required' });
      return;
    }

    let snapshot;

    if (useDemo) {
      logger.info(`[EHR Controller] Using demo FHIR for patient: ${patientId}`);
      snapshot = await demoFHIRService.getClinicalSnapshot(patientId);
    } else {
      const accessToken = req.oidc.accessToken?.access_token || '';
      const vaultToken = await tokenVaultService.getToken(accessToken, 'epic-fhir');
      const fhirService = createFHIRService(vaultToken.access_token);
      snapshot = await fhirService.getClinicalSnapshot(patientId);
    }

    res.json(snapshot);
  } catch (err) {
    next(err);
  }
}

export async function getPatient(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { patientId } = req.params;
    const useDemo = req.query.demo === 'true' || process.env.NODE_ENV === 'development';

    if (useDemo) {
      const patient = await demoFHIRService.getPatient(patientId);
      res.json(patient);
      return;
    }

    const accessToken = req.oidc.accessToken?.access_token || '';
    const vaultToken = await tokenVaultService.getToken(accessToken, 'epic-fhir');
    const fhirService = createFHIRService(vaultToken.access_token);
    const patient = await fhirService.getPatient(patientId);
    res.json(patient);
  } catch (err) {
    next(err);
  }
}

export async function getMedications(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { patientId } = req.params;
    const useDemo = req.query.demo === 'true' || process.env.NODE_ENV === 'development';

    if (useDemo) {
      const meds = await demoFHIRService.getMedicationRequests(patientId);
      res.json(meds);
      return;
    }

    const accessToken = req.oidc.accessToken?.access_token || '';
    const vaultToken = await tokenVaultService.getToken(accessToken, 'epic-fhir');
    const fhirService = createFHIRService(vaultToken.access_token);
    const meds = await fhirService.getMedicationRequests(patientId);
    res.json(meds);
  } catch (err) {
    next(err);
  }
}

export async function getConditions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { patientId } = req.params;
    const useDemo = req.query.demo === 'true' || process.env.NODE_ENV === 'development';

    if (useDemo) {
      const conditions = await demoFHIRService.getConditions(patientId);
      res.json(conditions);
      return;
    }

    const accessToken = req.oidc.accessToken?.access_token || '';
    const vaultToken = await tokenVaultService.getToken(accessToken, 'epic-fhir');
    const fhirService = createFHIRService(vaultToken.access_token);
    const conditions = await fhirService.getConditions(patientId);
    res.json(conditions);
  } catch (err) {
    next(err);
  }
}