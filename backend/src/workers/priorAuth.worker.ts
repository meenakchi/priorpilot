import { Worker } from 'bullmq';
import { redis } from '../lib/redisClient';
import { PriorAuthWorkflow } from '../workflows/priorAuth.workflow';
import { logger } from '../utils/logger';

const workflow = new PriorAuthWorkflow();

// Worker will process jobs enqueued by the controller. We run this in the same
// process for the demo, but in production you'd run workers separately.
export const worker = new Worker(
  'priorAuthQueue',
  async (job) => {
    logger.info('[Worker] Processing prior auth job', { jobId: job.id, data: job.data });
    try {
      await workflow.execute(job.data);
      logger.info('[Worker] Job complete', { jobId: job.id });
    } catch (err) {
      logger.error('[Worker] Job failed', { jobId: job.id, error: (err as Error).message });
      throw err;
    }
  },
  { connection: redis as any }
);

worker.on('failed', (job, err) => {
  logger.error('[Worker] Job failed event', { jobId: job?.id, error: err?.message });
});

worker.on('completed', (job) => {
  logger.info('[Worker] Job completed event', { jobId: job.id });
});

export default worker;
