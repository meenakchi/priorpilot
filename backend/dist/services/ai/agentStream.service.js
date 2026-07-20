"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamAgentWorkflow = streamAgentWorkflow;
const logger_1 = require("../../utils/logger");
const demoFHIR_service_1 = require("../ehr/demoFHIR.service");
const openai_service_1 = require("./openai.service");
const submission_service_1 = require("../insurer/submission.service");
async function streamAgentWorkflow(patientId, insurerId, res) {
    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const send = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    send('start', { message: 'PriorAgent starting autonomous workflow...' });
    try {
        send('status', { step: 'fetching_records', message: 'Fetching FHIR clinical records...' });
        const snapshot = await demoFHIR_service_1.demoFHIRService.getClinicalSnapshot(patientId);
        send('records', {
            patient: snapshot.patient.name,
            medications: snapshot.medications.length,
            conditions: snapshot.conditions.length,
        });
        send('status', { step: 'analyzing', message: 'OpenAI analyzing clinical data...' });
        const form = await openai_service_1.openaiService.draftPriorAuthForm(snapshot.patient, snapshot.medications, snapshot.conditions, snapshot.medications[0]?.id || '');
        send('draft', { form });
        send('status', { step: 'submitting', message: 'Submitting to insurer...' });
        const result = await submission_service_1.submissionService.submitPriorAuth(insurerId, form);
        send('submitted', { result });
        send('complete', { success: true, referenceNumber: result.referenceNumber });
    }
    catch (err) {
        const error = err;
        logger_1.logger.error('[AgentStream] Error:', error.message);
        send('error', { message: error.message });
    }
    finally {
        res.end();
    }
}
