import { Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { demoFHIRService } from '../ehr/demoFHIR.service';
import { claudeService } from './claude.service';
import { submissionService } from '../insurer/submission.service';
// import { PA_TOOLS_MINIMAL } from './tools';

const client = new Anthropic({ apiKey: env.anthropicApiKey });

export async function streamAgentWorkflow(
  patientId: string,
  insurerId: string,
  res: Response
): Promise<void> {
  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send('start', { message: 'PriorAgent starting autonomous workflow...' });

  try {
    send('status', { step: 'fetching_records', message: 'Fetching FHIR clinical records...' });
    const snapshot = await demoFHIRService.getClinicalSnapshot(patientId);
    send('records', {
      patient: snapshot.patient.name,
      medications: snapshot.medications.length,
      conditions: snapshot.conditions.length,
    });

    send('status', { step: 'analyzing', message: 'Claude analyzing clinical data...' });
    const form = await claudeService.draftPriorAuthForm(
      snapshot.patient,
      snapshot.medications,
      snapshot.conditions,
      snapshot.medications[0]?.id || ''
    );
    send('draft', { form });

    send('status', { step: 'submitting', message: 'Submitting to insurer...' });
    const result = await submissionService.submitPriorAuth(insurerId, form);
    send('submitted', { result });

    send('complete', { success: true, referenceNumber: result.referenceNumber });
  } catch (err) {
    const error = err as Error;
    logger.error('[AgentStream] Error:', error.message);
    send('error', { message: error.message });
  } finally {
    res.end();
  }
}