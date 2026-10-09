import {randomUUID} from 'node:crypto';
import {recoverOwnedVideoOperation} from './recover-owned-video-operation.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/**
 * Privileged, recovery-only worker iteration. Requires a service-role database
 * connected to the undeployed claim/defer RPC contract. No paid submissions.
 * Calling infrastructure must enforce worker authentication and scheduling.
 */
export async function runClaimedRecoveryBatch({db, apiKey, recover=recoverOwnedVideoOperation,
  workerToken=randomUUID(), limit=7, leaseSeconds=90, ...deps}={}) {
  if(typeof db?.rpc!=='function'||typeof db?.from!=='function'||
     typeof apiKey!=='string'||!apiKey.trim()||typeof recover!=='function'||
     !UUID.test(workerToken)||!Number.isInteger(limit)||limit<1||limit>50||
     !Number.isInteger(leaseSeconds)||leaseSeconds<30||leaseSeconds>300)
    throw new Error('trusted-recovery-worker-required');
  const claim=await db.rpc('cinetale_claim_video_recovery',{
    p_worker_token:workerToken,p_limit:limit,p_lease_seconds:leaseSeconds
  });
  if(claim?.error||!Array.isArray(claim?.data))throw new Error('recovery-claim-unavailable');
  if(claim.data.length>limit)throw new Error('invalid-recovery-claim-result');
  const seen=new Set();
  const results=[];
  for(const row of claim.data){
    // Fail closed on inconsistent privileged RPC output. Never invoke provider.
    if(!UUID.test(row?.operation_id)||!UUID.test(row?.owner_user_id)||
       seen.has(row.operation_id)||row?.provider!=='google-gemini-omni'||typeof row?.provider_operation_id!=='string'||
       !row.provider_operation_id.trim())throw new Error('invalid-recovery-claim-result');
    seen.add(row.operation_id);
    let adopted=false;
    let reason='RECOVERY_REQUIRES_REVIEW';
    try{
      const result=await recover({...deps,ownerUserId:row.owner_user_id,
        operationId:row.operation_id,expectedProviderOperationId:row.provider_operation_id,db,apiKey});
      adopted=result?.adopted===true && result?.operationId===row.operation_id &&
        /^[a-f0-9]{64}$/i.test(result?.sha256||'') &&
        Number.isSafeInteger(result?.sizeBytes)&&result.sizeBytes>0;
    }catch{reason='RECOVERY_UNAVAILABLE';}
    if(adopted){
      results.push({operationId:row.operation_id,outcome:'adopted'});
      continue;
    }
    // A failed defer call is NOT a successful recovery. The existing lease
    // expires and a later privileged reconciliation can settle the state.
    const settled=await db.rpc('cinetale_defer_video_recovery',{
      p_operation_id:row.operation_id,p_worker_token:workerToken,p_reason:reason
    });
    results.push({operationId:row.operation_id,
      outcome:settled?.error||settled?.data!==true?'settlement-uncertain':'deferred'});
  }
  return {claimed:results.length,adopted:results.filter(r=>r.outcome==='adopted').length,
    deferred:results.filter(r=>r.outcome==='deferred').length,
    unsettled:results.filter(r=>r.outcome==='settlement-uncertain').length,results};
}
