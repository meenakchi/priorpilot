import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { auth } from 'express-openid-connect';
import { auth0Config } from './config/auth0';
import { env } from './config/env';
import authRoutes from './routes/auth.routes';
import ehrRoutes from './routes/ehr.routes';
import priorAuthRoutes from './routes/priorauth.routes';
import tokenVaultRoutes from './routes/tokenVault.routes';
import { errorMiddleware } from './middleware/error.middleware';
import { logger } from './utils/logger';

const app = express();

// ── CORS ─────────────────────────────────────────────────────────────────────
// Must come before everything else so OPTIONS pre-flight requests work
app.use(cors({
  origin: env.frontendUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Session ───────────────────────────────────────────────────────────────────
// MUST come before express-openid-connect
// Use SESSION_SECRET (not auth0Secret) so it doesn't change with Auth0 config

app.use(session({
  secret: env.sessionSecret,    // must match auth0Config.secret
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: env.nodeEnv === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
  },
}));

app.use(auth(auth0Config)); // <-- after session
// ── Auth0 OIDC middleware ─────────────────────────────────────────────────────
// This automatically registers:
//   GET /callback  — handles the authorization code from Auth0
// Do NOT define your own /callback route anywhere.

// ── Request logging ───────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/ehr', ehrRoutes);
app.use('/api/prior-auth', priorAuthRoutes);
app.use('/api/token-vault', tokenVaultRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'PriorAgent', timestamp: new Date().toISOString() });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorMiddleware);

export default app;