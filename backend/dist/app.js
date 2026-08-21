"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_session_1 = __importDefault(require("express-session"));
const express_openid_connect_1 = require("express-openid-connect");
const auth0_1 = require("./config/auth0");
const env_1 = require("./config/env");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const ehr_routes_1 = __importDefault(require("./routes/ehr.routes"));
const priorauth_routes_1 = __importDefault(require("./routes/priorauth.routes"));
const tokenVault_routes_1 = __importDefault(require("./routes/tokenVault.routes"));
const error_middleware_1 = require("./middleware/error.middleware");
const logger_1 = require("./utils/logger");
const app = (0, express_1.default)();
// ── CORS ─────────────────────────────────────────────────────────────────────
// Must come before everything else so OPTIONS pre-flight requests work
app.use((0, cors_1.default)({
    origin: env_1.env.frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// ── Session ───────────────────────────────────────────────────────────────────
// MUST come before express-openid-connect
// Use SESSION_SECRET (not auth0Secret) so it doesn't change with Auth0 config
app.use((0, express_session_1.default)({
    secret: env_1.env.sessionSecret, // must match auth0Config.secret
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: env_1.env.nodeEnv === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: env_1.env.nodeEnv === 'production' ? 'none' : 'lax',
    },
}));
app.use((0, express_openid_connect_1.auth)(auth0_1.auth0Config)); // <-- after session
// ── Auth0 OIDC middleware ─────────────────────────────────────────────────────
// This automatically registers:
//   GET /callback  — handles the authorization code from Auth0
// Do NOT define your own /callback route anywhere.
// ── Request logging ───────────────────────────────────────────────────────────
app.use((req, _res, next) => {
    logger_1.logger.info(`${req.method} ${req.path}`);
    next();
});
// ── Simulated payer portal ──────────────────────────────────────────────────────
// Static page that portalAutomation.service.ts drives with Playwright, so the
// "submit" step is a real browser filling and clicking a form rather than a
// timer + fake reference number. Clearly labeled as simulated on the page itself.
app.use('/portal', express_1.default.static(path_1.default.join(__dirname, '..', 'public', 'portal')));
// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', auth_routes_1.default);
app.use('/api/ehr', ehr_routes_1.default);
app.use('/api/prior-auth', priorauth_routes_1.default);
app.use('/api/token-vault', tokenVault_routes_1.default);
// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'PriorAgent', timestamp: new Date().toISOString() });
});
// ── Global error handler ──────────────────────────────────────────────────────
app.use(error_middleware_1.errorMiddleware);
exports.default = app;
