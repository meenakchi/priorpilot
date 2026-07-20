"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireAuthOrApiKey = requireAuthOrApiKey;
function requireAuth(req, res, next) {
    if (!req.oidc?.isAuthenticated()) {
        res.status(401).json({ error: 'Unauthorized', message: 'You must be logged in.' });
        return;
    }
    next();
}
function requireAuthOrApiKey(req, res, next) {
    // Allow Bearer token for API-to-API calls (e.g., agent sub-requests)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        next();
        return;
    }
    requireAuth(req, res, next);
}
