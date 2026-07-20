"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const log = (level, message, meta) => {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    if (meta) {
        console[level === 'debug' ? 'log' : level](`${prefix} ${message}`, meta);
    }
    else {
        console[level === 'debug' ? 'log' : level](`${prefix} ${message}`);
    }
};
exports.logger = {
    info: (msg, meta) => log('info', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    error: (msg, meta) => log('error', msg, meta),
    debug: (msg, meta) => log('debug', msg, meta),
};
