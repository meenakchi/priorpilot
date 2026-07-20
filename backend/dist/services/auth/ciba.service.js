"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cibaService = exports.CIBAService = void 0;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../../config/env");
const logger_1 = require("../../utils/logger");
/**
 * CIBA (Client-Initiated Backchannel Authentication) Service
 *
 * CIBA lets the backend request step-up authentication from the patient
 * WITHOUT redirecting their browser. Auth0 sends a push notification /
 * out-of-band request to the patient's device. The patient approves, and
 * the backend polls for the resulting token.
 *
 * This is the key consent gate before any medical data moves.
 *
 * Flow:
 *   1. Backend calls /bc-authorize with patient's login_hint
 *   2. Auth0 sends push to patient's device
 *   3. Backend polls /oauth/token until patient approves or timeout
 *   4. On approval, backend receives scoped access token
 */
class CIBAService {
    constructor() {
        this.domain = env_1.env.auth0Domain;
        this.clientId = env_1.env.auth0ClientId;
        this.clientSecret = env_1.env.auth0ClientSecret;
    }
    /**
     * Initiate a CIBA request — sends consent push to patient's device.
     * @param loginHint - The patient's email or Auth0 user ID (sub)
     * @param scope - The scopes being requested (e.g., "openid fhir:read")
     * @param bindingMessage - Short message shown on patient's device
     */
    async initiateRequest(loginHint, scope, bindingMessage) {
        logger_1.logger.info(`[CIBA] Initiating backchannel auth request for: ${loginHint}`);
        const params = new URLSearchParams({
            client_id: this.clientId,
            client_secret: this.clientSecret,
            login_hint: loginHint,
            scope,
            binding_message: bindingMessage,
            request_expiry: '300', // 5 minutes for patient to respond
        });
        const response = await axios_1.default.post(`https://${this.domain}/bc-authorize`, params.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        logger_1.logger.info(`[CIBA] Auth request initiated. auth_req_id: ${response.data.auth_req_id}`);
        return response.data;
    }
    /**
     * Poll for the CIBA token after patient approves on their device.
     * Implements exponential back-off per the CIBA spec.
     */
    async pollForToken(authReqId, intervalSeconds = 5, maxWaitSeconds = 300) {
        logger_1.logger.info(`[CIBA] Polling for token. auth_req_id: ${authReqId}`);
        const deadline = Date.now() + maxWaitSeconds * 1000;
        let currentInterval = intervalSeconds * 1000;
        while (Date.now() < deadline) {
            await sleep(currentInterval);
            try {
                const params = new URLSearchParams({
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    grant_type: 'urn:openid:params:grant-type:ciba',
                    auth_req_id: authReqId,
                });
                const response = await axios_1.default.post(`https://${this.domain}/oauth/token`, params.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
                logger_1.logger.info('[CIBA] Token obtained — patient approved consent.');
                return response.data;
            }
            catch (error) {
                const err = error;
                const errCode = err.response?.data?.error;
                if (errCode === 'authorization_pending') {
                    // Normal — patient hasn't responded yet, keep polling
                    logger_1.logger.debug('[CIBA] Authorization pending, continuing to poll...');
                    continue;
                }
                if (errCode === 'slow_down') {
                    // Server asking us to back off
                    currentInterval = Math.min(currentInterval * 1.5, 30000);
                    logger_1.logger.warn(`[CIBA] Slow down requested. New interval: ${currentInterval}ms`);
                    continue;
                }
                if (errCode === 'access_denied') {
                    throw new Error('CIBA: Patient denied the consent request.');
                }
                if (errCode === 'expired_token') {
                    throw new Error('CIBA: The consent request expired. Please try again.');
                }
                throw new Error(`CIBA polling error: ${errCode || 'unknown'}`);
            }
        }
        throw new Error('CIBA: Timed out waiting for patient consent.');
    }
}
exports.CIBAService = CIBAService;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
exports.cibaService = new CIBAService();
