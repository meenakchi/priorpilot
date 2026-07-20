import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import {
  getEHRToken,
  initiateEHRLink,
  checkConnectionStatus,
} from '../controllers/tokenVault.controller';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Token Vault' });
});

router.get('/token', requireAuth, getEHRToken);
router.post('/link', requireAuth, initiateEHRLink);
router.get('/status', requireAuth, checkConnectionStatus);

export default router;