import {recoverOwnedVideoOperation} from './recover-owned-video-operation.js';

/**
 * Bounded, recovery-only batch coordinator. IDs must come from a privileged
 * server-side operation query; never from browser-supplied job identities.
 * This is NOT a durable worker, transaction claim or cross-instance lock.
 * No retries or paid submissions are performed by this module.
 */
export async function recoverOwnedVideoBatch({ownerUserId, operationIds, db, apiKey,
  recover = recoverOwnedVideoOperation, maxOperations = 7, ...deps} = {}) {
  if (!Array.isArray(operationIds) || operationIds.length > maxOperations ||
      !Number.isInteger(maxOperations) || maxOperations < 1 || maxOperations > 50 ||
      operationIds.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) ||
      new Set(operationIds).size !== operationIds.length) {
    throw new Error('invalid-recovery-batch');
  }
  if (typeof recover !== 'function' || !db?.from || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ownerUserId || '') || typeof apiKey !== 'string' || !apiKey.trim())
    throw new Error('trusted-recovery-context-required');
  const results=[];
  for (const operationId of operationIds) {
    try {
      const value=await recover({ownerUserId, operationId, db, apiKey, ...deps});
      // A recovery adapter must explicitly confirm durable adoption.
      // A returned pending or ambiguous value must never inflate Ready counts.
      if (value?.adopted === true && value?.operationId === operationId &&
          /^[a-f0-9]{64}$/i.test(value?.sha256 || '') &&
          Number.isSafeInteger(value?.sizeBytes) && value.sizeBytes > 0) {
        results.push({operationId, outcome:'adopted', value});
      } else {
        results.push({operationId, outcome:'preserved-needs-review', reason:'adoption-not-confirmed'});
      }
    } catch (error) {
      // Never classify an unknown provider or database failure as permission
      // to create another generation. Keep the original operation for review.
      results.push({operationId, outcome:'preserved-needs-review',
        reason: error?.name === 'PreservedInteractionNeedsReview' ? error.message : 'recovery-unavailable'});
    }
  }
  return {results, adopted:results.filter(x=>x.outcome==='adopted').length,
    preserved:results.filter(x=>x.outcome!=='adopted').length};
}
