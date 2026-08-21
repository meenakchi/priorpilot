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
});
