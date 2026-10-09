import { createHash } from 'node:crypto';
import { createSupabaseVideoWriter } from './supabase-video-writer.js';
import { adoptVerifiedOwnedVideo } from './adopt-verified-owned-video.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES = 500 * 1024 * 1024;
/**
 * INTERNAL ONLY. The caller must have authenticated ownership and independently
 * retrieved bytes from an existing accepted provider operation. This function
 * never contacts a provider or submits paid work. An unconfirmed write is not
 * retried: the expected object is read and independently verified first.
 */
export async function transferVerifiedProviderVideo({
  ownerUserId, operationId, bytes, mime = 'video/mp4', db, env,
  writeOnce, adopt = adoptVerifiedOwnedVideo, openReadStream, probe,
} = {}) {
  if (!UUID.test(ownerUserId || '') || !UUID.test(operationId || '')) throw Error('authenticated-operation-owner-required');
  if (!db || typeof db.rpc !== 'function') throw Error('privileged-operation-ledger-required');
  if (!(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > MAX_BYTES) throw Error('invalid-provider-media-bytes');
  if (!['video/mp4', 'video/webm'].includes(mime)) throw Error('unsupported-video-mime');
  if (typeof adopt !== 'function') throw Error('adoption-service-required');
  const path = `${ownerUserId}/${operationId}/source.${mime === 'video/webm' ? 'webm' : 'mp4'}`;
  const digest = createHash('sha256').update(bytes).digest('hex');
  const writer = writeOnce || createSupabaseVideoWriter({env});
  if (typeof writer !== 'function') throw Error('storage-writer-required');
  let writeStatus = 'created';
  try {
    const result = await writer(path, bytes, {mime});
    if (!result || result.path !== path || result.sizeBytes !== bytes.byteLength || result.pendingVerification !== true) throw Error('storage-write-not-confirmed');
  } catch (error) {
    // A conflict or uncertain network outcome is NOT permission to overwrite.
    // The existing object must match the expected provider bytes and decode.
    if (error?.message !== 'storage-object-already-exists-verification-required' && error?.message !== 'storage-write-outcome-uncertain') throw error;
    writeStatus = 'existing-requires-verification';
  }
  const adopted = await adopt({ db, ownerUserId, operationId, storagePath:path,
    expectedSha256:digest, expectedSizeBytes:bytes.byteLength, env, openReadStream, probe });
  if (!adopted || adopted.adopted !== true || adopted.operationId !== operationId || adopted.sha256 !== digest || adopted.sizeBytes !== bytes.byteLength) throw Error('media-adoption-not-confirmed');
  return Object.freeze({operationId, storagePath:path, sha256:digest, sizeBytes:bytes.byteLength, writeStatus, adopted:true});
}
