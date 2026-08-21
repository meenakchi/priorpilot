"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const supertest_1 = __importDefault(require("supertest"));
// Mock auth middleware to inject req.oidc and allow all requests
jest.mock('../middleware/auth.middleware', () => ({
    requireAuth: (req, _res, next) => {
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
const priorauth_routes_1 = __importDefault(require("../routes/priorauth.routes"));
describe('priorauth routes (basic)', () => {
    let app;
    beforeEach(() => {
        app = (0, express_1.default)();
        app.use(express_1.default.json());
        app.use('/', priorauth_routes_1.default);
    });
    it('POST /agent/run returns agent result', async () => {
        const res = await (0, supertest_1.default)(app).post('/agent/run').send({ patientId: 'p1', insurerId: 'ins1', medicationId: 'm1' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('status', 'submitted');
        expect(res.body).toHaveProperty('aiDraftForm');
        expect(res.body.aiDraftForm.medicationRequested).toBe('TestMed');
    });
});
