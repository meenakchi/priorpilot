import { redis } from './redisClient';
import { PriorAuthRequest } from '../utils/types';

const KEY_PREFIX = 'pa:request:';
const PATIENT_SET_PREFIX = 'pa:patient:';

export async function setRequest(id: string, req: PriorAuthRequest): Promise<void> {
  await redis.set(`${KEY_PREFIX}${id}`, JSON.stringify(req));
  // Add to patient index for listing
  await redis.sadd(`${PATIENT_SET_PREFIX}${req.patientId}`, id);
}

export async function getRequest(id: string): Promise<PriorAuthRequest | undefined> {
  const raw = await redis.get(`${KEY_PREFIX}${id}`);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as PriorAuthRequest;
  } catch {
    return undefined;
  }
}

export async function listRequests(patientId: string): Promise<PriorAuthRequest[]> {
  const ids = await redis.smembers(`${PATIENT_SET_PREFIX}${patientId}`);
  if (!ids || ids.length === 0) return [];
  const keys = ids.map((id) => `${KEY_PREFIX}${id}`);
  const raws = await redis.mget(...keys);
  return raws.filter(Boolean).map((r) => JSON.parse(r!)) as PriorAuthRequest[];
}

export async function updateStatus(id: string, status: string): Promise<void> {
  const req = await getRequest(id);
  if (!req) return;
  req.status = status as any;
  req.updatedAt = new Date().toISOString();
  await setRequest(id, req);
}
