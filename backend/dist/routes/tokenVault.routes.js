"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const tokenVault_controller_1 = require("../controllers/tokenVault.controller");
const router = (0, express_1.Router)();
router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'Token Vault' });
});
router.get('/token', auth_middleware_1.requireAuth, tokenVault_controller_1.getEHRToken);
router.post('/link', auth_middleware_1.requireAuth, tokenVault_controller_1.initiateEHRLink);
router.get('/status', auth_middleware_1.requireAuth, tokenVault_controller_1.checkConnectionStatus);
exports.default = router;
