import { Router } from 'express';
import { Request, Response } from 'express';
// NOTE: No /callback route — express-openid-connect owns that automatically

const router = Router();

// Login — redirect to Auth0
router.get('/login', (req: Request, res: Response) => {
  res.oidc.login({
    returnTo: process.env.FRONTEND_URL || 'http://localhost:5173',
    authorizationParams: {
      prompt: 'login',
    },
  });
});

// Logout
router.get('/logout', (req: Request, res: Response) => {
  res.oidc.logout({ returnTo: process.env.FRONTEND_URL || 'http://localhost:5173' });
});

// ⚠️  DO NOT add a /callback route here.
// express-openid-connect automatically registers GET /callback on the baseURL.
// If you add your own handler, it intercepts before the OIDC middleware can
// process the authorization code — breaking the login flow entirely.
//
// Auth0 Dashboard → Application → Allowed Callback URLs must be:
//   http://localhost:3001/callback     (NOT /api/auth/callback)

// Current user info
router.get('/me', (req: Request, res: Response) => {
  if (!req.oidc.isAuthenticated()) {
    res.json({ authenticated: false });
    return;
  }
  res.json({
    authenticated: true,
    user: {
      sub: req.oidc.user?.sub,
      name: req.oidc.user?.name,
      email: req.oidc.user?.email,
      picture: req.oidc.user?.picture,
    },
    // Only expose access token here for demo; in prod keep it server-side
    accessToken: req.oidc.accessToken?.access_token,
  });
});

export default router;