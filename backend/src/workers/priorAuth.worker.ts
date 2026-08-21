/**
 * Previously a BullMQ Worker that pulled jobs off a Redis queue.
 *
 * Job execution now happens directly inside `lib/queue.ts` (in-process,
 * no Redis) — see that file for details. This file is kept as a no-op so
 * `index.ts`'s `import './workers/priorAuth.worker'` doesn't need to
 * change. It can be deleted entirely once that import line is removed.
 */
export {};
