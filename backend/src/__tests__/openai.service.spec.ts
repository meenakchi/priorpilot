/* eslint-disable @typescript-eslint/no-var-requires */
process.env.OPENAI_API_KEY = 'test-key-for-ci';

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content:
                  '{"patientName":"John Doe","patientDOB":"1980-01-01","medicationRequested":"TestMed","confidenceScore":0.98}' ,
              },
            },
          ],
        }),
      },
    },
  }));
});

import { openaiService, OpenAIService } from '../services/ai/openai.service';

describe('OpenAIService', () => {
  it('parses a valid JSON response into a PriorAuthForm', async () => {
    const patient: any = { patientId: 'p1', name: 'John', dateOfBirth: '1980-01-01', gender: 'male', memberId: 'MBR-1' };
    const medications: any[] = [{ id: 'm1', medicationCodeableConcept: { text: 'TestMed' } }];
    const conditions: any[] = [];

    const form = await openaiService.draftPriorAuthForm(patient, medications, conditions, 'm1');

    expect(form).toBeDefined();
    expect(form.patientName).toBe('John Doe');
    expect(form.medicationRequested).toBe('TestMed');
  });
});
