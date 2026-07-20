"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenVaultService = exports.TokenVaultService = void 0;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../../config/env");
const logger_1 = require("../../utils/logger");
/**
 * Auth0 Token Vault Service
 *
 * Token Vault stores third-party OAuth tokens (like Epic FHIR tokens) on behalf
 * of your users. Your agent never sees raw credentials — it makes a signed request
 * to Token Vault with the user's Auth0 access token, and Token Vault returns a
 * fresh third-party token scoped to that connection.
 *
 * Docs: https://auth0.com/docs/secure/tokens/token-vault
 */
class TokenVaultService {
    constructor() {
        this.baseUrl = env_1.env.auth0TokenVaultUrl;
    }
    /**
     * Retrieve a stored token for a given user + connection from Token Vault.
     * @param auth0AccessToken - The user's Auth0 access token (proves identity)
     * @param connection - The Token Vault connection name (e.g. "epic-fhir")
     */
    async getToken(auth0AccessToken, connection) {
        try {
            logger_1.logger.info(`[TokenVault] Requesting token for connection: ${connection}`);
            const response = await axios_1.default.get(`${this.baseUrl}/connections/${connection}/token`, {
                headers: {
                    Authorization: `Bearer ${auth0AccessToken}`,
                    'Content-Type': 'application/json',
                },
            });
            logger_1.logger.info(`[TokenVault] Token retrieved successfully for connection: ${connection}`);
            return response.data;
        }
        catch (error) {
            const err = error;
            logger_1.logger.error('[TokenVault] Failed to retrieve token', {
                connection,
                status: err.response?.status,
                data: err.response?.data,
            });
            if (err.response?.status === 401) {
                throw new Error('Token Vault: User has not linked their Epic FHIR account. CIBA consent required.');
            }
            if (err.response?.status === 404) {
                throw new Error(`Token Vault: Connection "${connection}" not found. Check your Auth0 Token Vault configuration.`);
            }
            throw new Error(`Token Vault error: ${err.message}`);
        }
    }
    /**
     * Initiate the OAuth linking flow for a user to connect their EHR.
     * Returns the authorization URL to redirect the user to.
     */
    async initiateLink(auth0AccessToken, connection) {
        try {
            const response = await axios_1.default.post(`${this.baseUrl}/connections/${connection}/link`, {}, {
                headers: {
                    Authorization: `Bearer ${auth0AccessToken}`,
                },
            });
            return { authorizationUrl: response.data.authorization_url };
        }
        catch (error) {
            const err = error;
            throw new Error(`Failed to initiate Token Vault link: ${err.message}`);
        }
    }
}
exports.TokenVaultService = TokenVaultService;
exports.tokenVaultService = new TokenVaultService();
