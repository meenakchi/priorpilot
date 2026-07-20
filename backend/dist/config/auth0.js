"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth0Config = void 0;
const env_1 = require("./env");
exports.auth0Config = {
    authRequired: false,
    auth0Logout: true,
    secret: env_1.env.sessionSecret,
    baseURL: env_1.env.auth0BaseUrl, // http://localhost:3001
    clientID: env_1.env.auth0ClientId,
    issuerBaseURL: `https://${env_1.env.auth0Domain}`,
    clientSecret: env_1.env.auth0ClientSecret,
    authorizationParams: {
        response_type: 'code',
        audience: env_1.env.auth0Audience,
        scope: 'openid profile email offline_access',
    },
    routes: {
        login: false, // we handle /api/auth/login manually
        logout: false, // we handle /api/auth/logout manually
    },
};
