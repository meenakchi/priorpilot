"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
// Create a Redis client instance. If REDIS_URL is not provided, the client
// will attempt localhost:6379 which is convenient for local development.
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
exports.redis = new ioredis_1.default(redisUrl);
exports.redis.on('error', (err) => {
    // Don't log sensitive data here — upstream logger will handle redaction
    // but emitting an error to console is useful during development.
    // eslint-disable-next-line no-console
    console.error('[Redis] connection error', err.message || err);
});
exports.default = exports.redis;
