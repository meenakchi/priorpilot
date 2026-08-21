"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app_1 = __importDefault(require("./app"));
const logger_1 = require("./utils/logger");
const env_1 = require("./config/env");
(0, env_1.validateEnv)();
const PORT = process.env.PORT || 3001;
app_1.default.listen(PORT, () => {
    logger_1.logger.info(`PriorAgent backend running on port ${PORT}`);
});
