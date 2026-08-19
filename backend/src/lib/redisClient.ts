import Redis from 'ioredis';
import { env } from '../../config/env';

// Create a Redis client instance. If REDIS_URL is not provided, the client
// will attempt localhost:6379 which is convenient for local development.
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const redis = new Redis(redisUrl);

redis.on('error', (err) => {
  // Don't log sensitive data here — upstream logger will handle redaction
  // but emitting an error to console is useful during development.
  // eslint-disable-next-line no-console
  console.error('[Redis] connection error', err.message || err);
});

export default redis;
