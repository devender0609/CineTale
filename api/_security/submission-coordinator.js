/**
 * Provider-neutral paid submission coordination. Not wired into a public route.
 * All storage methods MUST be backed by atomic, durable database transactions.
 * An ambiguous submission is NEVER retried automatically.
 */
export async function coordinatePaidSubmission({reservation, store, submit, workerId, now = () => new Date().toISOString()}) {
  if (!reservation?.id || !reservation?.approvalId || !workerId) throw new TypeError('Missing server-owned reservation identity');
  if (!store || typeof store.claim !== 'function' || typeof store.markSubmitted !== 'function' || typeof store.markUncertain !== 'function') {
    throw new TypeError('Durable atomic store required');
  }
  if (typeof submit !== 'function') throw new TypeError('Provider adapter required');
  // Claim MUST atomically enforce revision, authorization, single active lease,
  // and refusal to reclaim uncertain/submitted operations.
  const claim = await store.claim({reservationId: reservation.id, approvalId: reservation.approvalId, workerId});
  if (!claim || claim.status !== 'claimed' || !claim.leaseToken) {
    return {submitted: false, state: claim?.status || 'unavailable'};
  }
  // A malformed or incomplete claim must fail *before* any billable provider call.
  // This avoids submitting against an unfrozen revision or non-idempotent provider key.
  if (typeof claim.leaseToken !== 'string' || !claim.leaseToken.trim()
      || typeof claim.approvedRevision !== 'string' || !/^[a-f0-9]{64}$/i.test(claim.approvedRevision)
      || typeof claim.idempotencyKey !== 'string' || !claim.idempotencyKey.trim()) {
    try {
      await store.markUncertain({reservationId: reservation.id, leaseToken: claim.leaseToken, workerId, at: now(), reason: 'incomplete_claim_contract'});
    } catch {
      return {submitted: false, state: 'reconciliation-required', retryAutomatically: false, persistenceConfirmed: false};
    }
    return {submitted: false, state: 'invalid-claim', retryAutomatically: false};
  }
  const claimRef = {reservationId: reservation.id, leaseToken: claim.leaseToken, workerId};
  let result;
  try {
    result = await submit({reservationId: reservation.id, approvedRevision: claim.approvedRevision, idempotencyKey: claim.idempotencyKey});
  } catch (error) {
    // Transport errors can happen after a provider accepted a paid job.
    try {
      await store.markUncertain({...claimRef, at: now(), reason: 'submission_outcome_unknown'});
    } catch {
      // A claimed/submitting reservation remains protected. Do not retry the POST.
      return {submitted: false, state: 'reconciliation-required', retryAutomatically: false, persistenceConfirmed: false};
    }
    return {submitted: false, state: 'submission-uncertain', retryAutomatically: false};
  }
  const providerOperationId = typeof result?.providerOperationId === 'string' ? result.providerOperationId.trim() : '';
  if (!providerOperationId) {
    try {
      await store.markUncertain({...claimRef, at: now(), reason: 'provider_id_missing'});
    } catch {
      return {submitted: false, state: 'reconciliation-required', retryAutomatically: false, persistenceConfirmed: false};
    }
    return {submitted: false, state: 'submission-uncertain', retryAutomatically: false};
  }
  try {
    await store.markSubmitted({...claimRef, providerOperationId, at: now()});
  } catch (error) {
    // Inability to persist an accepted job must not trigger another paid submission.
    return {submitted: true, state: 'reconciliation-required', providerOperationId, retryAutomatically: false, persistenceConfirmed: false};
  }
  return {submitted: true, state: 'submitted', providerOperationId, retryAutomatically: false};
}
