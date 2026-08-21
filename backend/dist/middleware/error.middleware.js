"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorMiddleware = errorMiddleware;
const logger_1 = require("../utils/logger");
function errorMiddleware(err, _req, res, _next) {
    logger_1.logger.error('Unhandled error', { message: err.message, stack: err.stack });
    const status = err.status || 500;
    res.status(status).json({
        error: err.name || 'InternalServerError',
        message: err.message || 'An unexpected error occurred',
    });
}
