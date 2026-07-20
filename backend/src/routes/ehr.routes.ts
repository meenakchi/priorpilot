import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import {
  getClinicalSnapshot,
  getPatient,
  getMedications,
  getConditions,
} from '../controllers/ehr.controller';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'EHR' });
});

router.get('/patient/:patientId', requireAuth, getPatient);
router.get('/patient/:patientId/snapshot', requireAuth, getClinicalSnapshot);
router.get('/patient/:patientId/medications', requireAuth, getMedications);
router.get('/patient/:patientId/conditions', requireAuth, getConditions);

export default router;