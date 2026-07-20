import { Request, Response, NextFunction } from 'express';
import { tokenVaultService } from '../services/auth/tokenVault.service';
import { logger } from '../utils/logger';

export async function getEHRToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const accessToken = req.oidc.accessToken?.access_token;

    if (!accessToken) {
      res.status(401).json({ error: 'No Auth0 access token available. Please log in.' });
      return;
    }

    const { connection = 'epic-fhir' } = req.query;
    logger.info(`[TokenVault Controller] Fetching token for connection: ${connection}`);

    const token = await tokenVaultService.getToken(accessToken, connection as string);
    res.json({
      connection,
      tokenType: token.token_type,
      expiresIn: token.expires_in,
      scope: token.scope,
      // Never expose access_token directly to frontend
    });
  } catch (err) {
    next(err);
  }
}

export async function initiateEHRLink(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const accessToken = req.oidc.accessToken?.access_token;

    if (!accessToken) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { connection = 'epic-fhir' } = req.body;
    const result = await tokenVaultService.initiateLink(accessToken, connection);

    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function checkConnectionStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const accessToken = req.oidc.accessToken?.access_token;

    if (!accessToken) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { connection = 'epic-fhir' } = req.query;

    try {
      await tokenVaultService.getToken(accessToken, connection as string);
      res.json({ connected: true, connection });
    } catch {
      res.json({ connected: false, connection });
    }
  } catch (err) {
    next(err);
  }
}