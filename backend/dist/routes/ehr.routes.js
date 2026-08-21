"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const ehr_controller_1 = require("../controllers/ehr.controller");
const router = (0, express_1.Router)();
router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'EHR' });
});
router.get('/patient/:patientId', auth_middleware_1.requireAuth, ehr_controller_1.getPatient);
router.get('/patient/:patientId/snapshot', auth_middleware_1.requireAuth, ehr_controller_1.getClinicalSnapshot);
router.get('/patient/:patientId/medications', auth_middleware_1.requireAuth, ehr_controller_1.getMedications);
router.get('/patient/:patientId/conditions', auth_middleware_1.requireAuth, ehr_controller_1.getConditions);
exports.default = router;
