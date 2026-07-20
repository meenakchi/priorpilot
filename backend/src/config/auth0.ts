import { ConfigParams } from 'express-openid-connect';
import { env } from './env';

export const auth0Config: ConfigParams = {
  authRequired: false,
  auth0Logout: true,
  secret: env.sessionSecret,
  baseURL: env.auth0BaseUrl,           // http://localhost:3001
  clientID: env.auth0ClientId,
  issuerBaseURL: `https://${env.auth0Domain}`,
  clientSecret: env.auth0ClientSecret,
  authorizationParams: {
    response_type: 'code',
    audience: env.auth0Audience,
    scope: 'openid profile email offline_access',
  },
  routes: {
    login: false,   // we handle /api/auth/login manually
    logout: false,  // we handle /api/auth/logout manually
  },
 
};