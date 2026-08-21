"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setRequest = setRequest;
exports.getRequest = getRequest;
exports.listRequests = listRequests;
exports.updateStatus = updateStatus;
/**
 * In-memory request store.
 *
 * This replaces the previous Redis-backed implementation. Redis added an
 * external infra dependency that isn't worth it for a single-process demo —
 * this app has no horizontal scaling or multi-worker needs. State lives in
 * memory and resets on server restart, which is fine for this use case.
 *
 * If you later need persistence across restarts or multiple processes,
 * swap this module back to a Redis (or Postgres/SQLite) implementation —
 * every other file imports only the functions below, not this file's
 * internals, so the swap is contained here.
 */
const requests = new Map();
const patientIndex = new Map();
async function setRequest(id, req) {
    requests.set(id, req);
    if (!patientIndex.has(req.patientId)) {
        patientIndex.set(req.patientId, new Set());
    }
    patientIndex.get(req.patientId).add(id);
}
async function getRequest(id) {
    return requests.get(id);
}
async function listRequests(patientId) {
    const ids = patientIndex.get(patientId);
    if (!ids || ids.size === 0)
        return [];
    return Array.from(ids)
        .map((id) => requests.get(id))
        .filter((r) => r !== undefined);
}
async function updateStatus(id, status) {
    const req = requests.get(id);
    if (!req)
        return;
    req.status = status;
    req.updatedAt = new Date().toISOString();
    requests.set(id, req);
}
