import { verifyOwnedVideo } from './verify-owned-video.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/**
 * Internal, server-only media adoption boundary (NOT exposed as an API route).
 * Caller must authenticate the owner and supply a privileged RPC client.
 * The RPC must atomically check operation ownership/state/path and commit the
 * server-derived evidence, rejecting conflicting or stale attempts.
 * No provider calls, paid generation or browser-supplied Ready flags.
 */
export async function adoptVerifiedOwnedVideo({db, operationId, ownerUserId, storagePath, expectedSha256, expectedSizeBytes, env, openReadStream, probe, verify = verifyOwnedVideo} = {}) {
  if (!db || typeof db.rpc !== 'function') throw Error('privileged-operation-ledger-required');
  if (!UUID.test(operationId || '') || !UUID.test(ownerUserId || '')) throw Error('authenticated-operation-owner-required');
  if (typeof verify !== 'function') throw Error('trusted-verifier-required');
  // Verification never changes ledger state. A failed probe cannot mark READY.
  const evidence = await verify({storagePath, expectedSha256, expectedSizeBytes, env, openReadStream, probe});
  if (!evidence || evidence.storagePath !== storagePath || evidence.sha256 !== expectedSha256 || evidence.sizeBytes !== expectedSizeBytes ||
    !evidence.video || !evidence.video.codec || !Number.isInteger(evidence.video.width) || evidence.video.width <= 0 ||
    !Number.isInteger(evidence.video.height) || evidence.video.height <= 0 || !Number.isFinite(Date.parse(evidence.verifiedAt))) {
    throw Error('trusted-media-evidence-invalid');
  }
  const {data, error} = await db.rpc('cinetale_adopt_verified_video', {
    p_operation_id: operationId, p_owner_user_id: ownerUserId, p_storage_path: evidence.storagePath,
    p_sha256: evidence.sha256, p_size_bytes: evidence.sizeBytes, p_verified_at: evidence.verifiedAt,
  });
  if (error) throw new Error('media-adoption-not-confirmed', {cause:error});
  if (data !== true) throw Error('media-adoption-not-confirmed');
  return Object.freeze({operationId, adopted:true, sha256:evidence.sha256, sizeBytes:evidence.sizeBytes});
}
