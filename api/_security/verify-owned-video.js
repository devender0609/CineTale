import { createSupabaseVideoReader } from './supabase-video-reader.js';
import { verifyStoredPlayableVideo } from './verified-media-playability.js';

/** Server-only precondition for adopting an existing, privately stored video.
 * This function deliberately does not change any operation state or expose a signed URL.
 * Callers must authenticate ownership and persist the verification result atomically.
 */
export async function verifyOwnedVideo({ storagePath, expectedSha256, expectedSizeBytes, env = process.env, openReadStream, probe } = {}) {
  if (typeof storagePath !== 'string' || !storagePath.trim()) throw new Error('storage-path-required');
  if (!/^[a-f0-9]{64}$/.test(expectedSha256 || '')) throw new Error('expected-sha256-required');
  if (!Number.isSafeInteger(expectedSizeBytes) || expectedSizeBytes <= 0) throw new Error('expected-size-required');
  const reader = openReadStream || createSupabaseVideoReader({env});
  const evidence = await verifyStoredPlayableVideo({
    openReadStream: reader,
    path: storagePath,
    expectedSha256,
    expectedSizeBytes,
    ...(probe ? {probe} : {}),
  });
  return Object.freeze({
    storagePath,
    sha256: evidence.sha256,
    sizeBytes: evidence.sizeBytes,
    mime: evidence.mime,
    verifiedAt: evidence.verifiedAt,
    video: evidence.video,
  });
}
