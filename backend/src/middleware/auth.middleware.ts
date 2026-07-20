import { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.oidc?.isAuthenticated()) {
    res.status(401).json({ error: 'Unauthorized', message: 'You must be logged in.' });
    return;
  }
  next();
}

export function requireAuthOrApiKey(req: Request, res: Response, next: NextFunction): void {
  // Allow Bearer token for API-to-API calls (e.g., agent sub-requests)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }
  requireAuth(req, res, next);
}