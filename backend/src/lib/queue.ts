import { logger } from '../utils/logger';
import { PriorAuthWorkflow } from '../workflows/priorAuth.workflow';
import * as requestStoreLib from './requestStore';
import type { WorkflowInput } from '../workflows/priorAuth.workflow';

/**
 * In-process "queue" — replaces the previous BullMQ + Redis setup.
 *
 * The original design queued jobs onto Redis and processed them in a
 * separate BullMQ Worker (see workers/priorAuth.worker.ts). For a
 * single-process demo that adds a hard external dependency (Redis) for no
 * real benefit — there's no multi-worker fan-out happening.
 *
 * This keeps the same call shape (`workflowQueue.add(name, data)`) so
 * routes/controllers that already call `.add('runPriorAuth', {...})` don't
 * need to change. Under the hood it just runs the workflow asynchronously
 * in the same process and lets the existing status-polling in
 * `requestStore` (pending_consent -> ... -> submitted/error) work exactly
 * as before.
 */

const workflow = new PriorAuthWorkflow();

class InProcessQueue {
  async add(_jobName: string, data: WorkflowInput): Promise<void> {
    // Fire-and-forget, matching the original queue's async job semantics —
    // callers get an immediate response and poll the request's status.
    setImmediate(() => {
      workflow.execute(data).catch(async (err: Error) => {
        logger.error('[Queue] In-process job failed', { error: err.message, requestId: data.requestId });
        if (data.requestId) {
          await requestStoreLib.updateStatus(data.requestId, 'error');
        }
      });
    });
  }
}

export const workflowQueue = new InProcessQueue();
export default workflowQueue;
