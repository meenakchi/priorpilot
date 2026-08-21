"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const pino_1 = __importDefault(require("pino"));
const baseLogger = (0, pino_1.default)({
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});
function redactPHI(obj) {
    if (!obj || typeof obj !== 'object')
        return obj;
    try {
        const copy = Array.isArray(obj) ? [] : {};
        for (const [k, v] of Object.entries(obj)) {
            if (typeof v === 'string') {
                if (/name|patient|memberId|mrn|ssn|dob/i.test(k)) {
                    copy[k] = '[REDACTED]';
                    continue;
                }
                copy[k] = v;
            }
            else if (typeof v === 'object' && v !== null) {
                copy[k] = redactPHI(v);
            }
            else {
                copy[k] = v;
            }
        }
        return copy;
    }
    catch {
        return obj;
    }
}
exports.logger = {
    info: (msg, meta) => baseLogger.info(redactPHI(meta), msg),
    warn: (msg, meta) => baseLogger.warn(redactPHI(meta), msg),
    error: (msg, meta) => baseLogger.error(redactPHI(meta), msg),
    debug: (msg, meta) => baseLogger.debug(redactPHI(meta), msg),
};
