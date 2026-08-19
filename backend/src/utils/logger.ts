import pino from 'pino';

const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});

function redactPHI(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  try {
    const copy: any = Array.isArray(obj) ? [] : {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === 'string') {
        if (/name|patient|memberId|mrn|ssn|dob/i.test(k)) {
          copy[k] = '[REDACTED]';
          continue;
        }
        copy[k] = v;
      } else if (typeof v === 'object' && v !== null) {
        copy[k] = redactPHI(v);
      } else {
        copy[k] = v;
      }
    }
    return copy;
  } catch {
    return obj;
  }
}

export const logger = {
  info: (msg: string, meta?: unknown) => baseLogger.info(redactPHI(meta), msg),
  warn: (msg: string, meta?: unknown) => baseLogger.warn(redactPHI(meta), msg),
  error: (msg: string, meta?: unknown) => baseLogger.error(redactPHI(meta), msg),
  debug: (msg: string, meta?: unknown) => baseLogger.debug(redactPHI(meta), msg),
};