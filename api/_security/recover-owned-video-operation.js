import {recoverExistingOmniVideo, PreservedInteractionNeedsReview} from './recover-existing-omni-video.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECOVERABLE=new Set(['submitted','recovering','recovery-deferred']);
/**
 * Privileged, server-only recovery boundary. The caller authenticates the owner
 * independently; the ledger—not a browser payload—supplies the provider ID.
 * Never invokes paid generation. No public API route currently uses this module.
 */
export async function recoverOwnedVideoOperation({ownerUserId,operationId,db,apiKey,
    recovery=recoverExistingOmniVideo, expectedProviderOperationId, ...deps}={}) {
  if(!UUID.test(ownerUserId||'')||!UUID.test(operationId||'')) throw Error('trusted-owner-and-operation-required');
  if(!db?.from || typeof recovery!=='function') throw Error('trusted-ledger-and-recovery-required');
  const {data:row,error}=await db.from('cinetale_video_operations')
    .select('id,owner_user_id,state,provider,provider_operation_id')
    .eq('id',operationId).eq('owner_user_id',ownerUserId).maybeSingle();
  if(error||!row||row.id!==operationId||row.owner_user_id!==ownerUserId)
    throw new PreservedInteractionNeedsReview('operation-not-authorized-or-unavailable');
  if(!RECOVERABLE.has(row.state)) throw new PreservedInteractionNeedsReview('operation-not-recoverable');
  if(row.provider!=='google-gemini-omni'||typeof row.provider_operation_id!=='string')
    throw new PreservedInteractionNeedsReview('provider-binding-unavailable');
  // A claimed worker must not switch to a different provider operation between
  // database claim and retrieval. Preserve the original claim on mismatch.
  if(expectedProviderOperationId !== undefined &&
     row.provider_operation_id !== expectedProviderOperationId)
    throw new PreservedInteractionNeedsReview('provider-operation-changed-after-claim');
  const match=/^(?:interaction-)?(v1_[A-Za-z0-9_-]{1,256})$/.exec(row.provider_operation_id);
  if(!match) throw new PreservedInteractionNeedsReview('original-interaction-id-unavailable');
  // Explicit fields come last so injected dependencies cannot replace ledger identity.
  return recovery({...deps,apiKey,db,ownerUserId,operationId,interactionId:match[1]});
}
