import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });

  const status = (err as { status?: number }).status || 500;
  res.status(status).json({
    error: err.name || 'InternalServerError',
    message: err.message || 'An unexpected error occurred',
  });
}