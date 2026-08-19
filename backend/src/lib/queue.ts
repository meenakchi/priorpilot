import { Queue } from 'bullmq';
import { redis } from './redisClient';

export const workflowQueue = new Queue('priorAuthQueue', {
  connection: redis as any,
});

export default workflowQueue;
