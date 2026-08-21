"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEHRToken = getEHRToken;
exports.initiateEHRLink = initiateEHRLink;
exports.checkConnectionStatus = checkConnectionStatus;
const tokenVault_service_1 = require("../services/auth/tokenVault.service");
const logger_1 = require("../utils/logger");
async function getEHRToken(req, res, next) {
    try {
        const accessToken = req.oidc.accessToken?.access_token;
        if (!accessToken) {
            res.status(401).json({ error: 'No Auth0 access token available. Please log in.' });
            return;
        }
        const { connection = 'epic-fhir' } = req.query;
        logger_1.logger.info(`[TokenVault Controller] Fetching token for connection: ${connection}`);
        const token = await tokenVault_service_1.tokenVaultService.getToken(accessToken, connection);
        res.json({
            connection,
            tokenType: token.token_type,
            expiresIn: token.expires_in,
            scope: token.scope,
            // Never expose access_token directly to frontend
        });
    }
    catch (err) {
        next(err);
    }
}
async function initiateEHRLink(req, res, next) {
    try {
        const accessToken = req.oidc.accessToken?.access_token;
        if (!accessToken) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        const { connection = 'epic-fhir' } = req.body;
        const result = await tokenVault_service_1.tokenVaultService.initiateLink(accessToken, connection);
        res.json(result);
    }
    catch (err) {
        next(err);
    }
}
async function checkConnectionStatus(req, res, next) {
    try {
        const accessToken = req.oidc.accessToken?.access_token;
        if (!accessToken) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        const { connection = 'epic-fhir' } = req.query;
        try {
            await tokenVault_service_1.tokenVaultService.getToken(accessToken, connection);
            res.json({ connected: true, connection });
        }
        catch {
            res.json({ connected: false, connection });
        }
    }
    catch (err) {
        next(err);
    }
}
