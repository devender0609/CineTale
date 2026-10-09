// Server-only canonical shot revision identity. NOT authorization or approval by itself.
import { createHash } from 'node:crypto';

const MAX_DEPTH = 48;
const MAX_BYTES = 262144;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function normalize(value, depth = 0) {
  if (depth > MAX_DEPTH) throw new TypeError('SHOT_REVISION_TOO_DEEP');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('SHOT_REVISION_NON_FINITE_NUMBER');
    return value;
  }
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw new TypeError('SHOT_REVISION_SPARSE_ARRAY');
    return value.map(item => normalize(item, depth + 1));
  }
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new TypeError('SHOT_REVISION_INVALID_TYPE');
  }
  const result = Object.create(null);
  for (const key of Object.keys(value).sort()) {
    if (FORBIDDEN_KEYS.has(key)) throw new TypeError('SHOT_REVISION_FORBIDDEN_KEY');
    result[key] = normalize(value[key], depth + 1);
  }
  return result;
}

export function canonicalShotRevision(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('SHOT_REVISION_OBJECT_REQUIRED');
  const serialized = JSON.stringify(normalize(payload));
  if (Buffer.byteLength(serialized, 'utf8') > MAX_BYTES) throw new TypeError('SHOT_REVISION_TOO_LARGE');
  return serialized;
}

export function shotRevisionHash(payload) {
  return createHash('sha256').update(canonicalShotRevision(payload), 'utf8').digest('hex');
}

export function verifyApprovedRevision(payload, expectedHash) {
  return typeof expectedHash === 'string' && /^[a-f0-9]{64}$/.test(expectedHash) && shotRevisionHash(payload) === expectedHash;
}
