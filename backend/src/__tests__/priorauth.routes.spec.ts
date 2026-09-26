import express from 'express';
import request from 'supertest';

// Mock auth middleware to inject req.oidc and allow all requests
jest.mock('../middleware/auth.middleware', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.oidc = { accessToken: { access_token: 'fake-token' }, user: { email: 'test@example.com' } };
    next();
  },
}));

// Mock the agent loop to return a deterministic result
jest.mock('../services/ai/agentLoop.service', () => ({
  priorAuthAgentLoop: {
    run: jest.fn().mockResolvedValue({
      medications: [
        { id: 'm1', medicationCodeableConcept: { text: 'TestMed', coding: [{ code: 'C1' }] }, requester: { display: 'Dr. Who' } },
      ],
      conditions: [{ code: { text: 'Hypertension', coding: [{ code: 'I10' }] } }],
      form: { medicationRequested: 'TestMed', diagnosis: 'Hypertension', icd10Code: 'I10', prescribingPhysician: 'Dr. Who' },
      success: true,
      agentLog: [],
      submissionResult: null,
      error: null,
    }),
  },
}));

import router from '../routes/priorauth.routes';
import { priorAuthAgentLoop } from '../services/ai/agentLoop.service';

describe('priorauth routes (basic)', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/', router);
  });

  it('POST /agent/run returns agent result', async () => {
    const res = await request(app).post('/agent/run').send({ patientId: 'p1', insurerId: 'ins1', medicationId: 'm1' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'submitted');
    expect(res.body).toHaveProperty('aiDraftForm');
    expect(res.body.aiDraftForm.medicationRequested).toBe('TestMed');
  });

  it('POST /agent/manual adapts entered clinical details for the shared agent', async () => {
    const res = await request(app).post('/agent/manual').send({
      patientName: 'Jamie Smith',
      patientDOB: '1985-04-12',
      memberId: 'MEM-42',
      diagnosis: 'Rheumatoid arthritis',
      icd10Code: 'M06.9',
      medicationRequested: 'Methotrexate 15 mg',
      clinicalNotes: 'Symptoms persist despite first-line treatment.',
      prescribingPhysician: 'Dr. Patel',
      insurerId: 'AETNA',
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'submitted');
    expect(priorAuthAgentLoop.run).toHaveBeenLastCalledWith(expect.objectContaining({
      insurerId: 'AETNA',
      clinicalData: expect.objectContaining({
        patient: expect.objectContaining({ name: 'Jamie Smith', memberId: 'MEM-42' }),
        medications: [expect.objectContaining({
          medicationCodeableConcept: expect.objectContaining({ text: 'Methotrexate 15 mg' }),
          reasonCode: [{ text: 'Symptoms persist despite first-line treatment.' }],
        })],
        conditions: [expect.objectContaining({
          code: expect.objectContaining({ text: 'Rheumatoid arthritis', coding: [expect.objectContaining({ code: 'M06.9' })] }),
        })],
      }),
    }));
  });

  it('POST /agent/manual rejects missing clinical details', async () => {
    const res = await request(app).post('/agent/manual').send({ insurerId: 'AETNA' });

    expect(res.status).toBe(400);
    expect(res.body.missingFields).toContain('clinicalNotes');
  });
});
