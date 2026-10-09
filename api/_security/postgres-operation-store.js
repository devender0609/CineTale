/**
 * Durable operation-store adapter for the submission coordinator.
 * Requires deployment of the reviewed RPC migration; never falls back to a
 * browser workspace, process memory, or a second provider submission.
 * The caller must supply a privileged, server-only Supabase client and a
 * cryptographically random UUID worker token. Not connected to public routes.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createPostgresOperationStore({db, workerToken, provider}) {
  if (!db || typeof db.rpc !== 'function' || !UUID.test(workerToken || '')) {
    throw new TypeError('Privileged database RPC and valid worker UUID required');
  }
  // Provider is server-bound at construction; never read it from a client payload.
  if (typeof provider !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(provider)) {
    throw new TypeError('Trusted provider binding required');
  }
  const rpc = async (name, args) => {
    const {data, error} = await db.rpc(name, args);
    if (error) throw new Error(`Ledger RPC failed: ${name}`, {cause: error});
    return data;
  };
  return {
    async claim({reservationId, approvalId}) {
      if (!UUID.test(reservationId || '') || !UUID.test(approvalId || '')) throw new TypeError('Valid reservation and approval UUID required');
      try {
        const rows = await rpc('cinetale_claim_reserved_video_operation', {p_operation_id: reservationId, p_worker_token: workerToken, p_lease_seconds: 90});
        const row = Array.isArray(rows) ? rows[0] : rows;
        // SQL draft returns only the lease; it cannot attest to the approved
        // revision or idempotency key. Fail closed until the SQL RPC contract
        // returns those fields under the same atomic claim.
        if (!row || row.approval_id !== approvalId || !/^[a-f0-9]{64}$/i.test(row.revision_hash || '') || !row.idempotency_key) {
          return {status: 'incomplete-claim'};
        }
        return {status: 'claimed', leaseToken: workerToken, approvedRevision: row.revision_hash, idempotencyKey: row.idempotency_key};
      } catch (error) {
        // A rejected claim is never permission to submit.
        if (error.cause?.code === '55000') return {status: 'not-claimable'};
        throw error;
      }
    },
    async markSubmitted({reservationId, leaseToken, providerOperationId}) {
      if (!UUID.test(reservationId || '') || leaseToken !== workerToken) throw new TypeError('Reservation or worker lease mismatch');
      if (typeof providerOperationId !== 'string' || !providerOperationId.trim() || providerOperationId.length > 1024 || /[\x00-\x1f]/.test(providerOperationId)) {
        throw new TypeError('Valid trusted provider operation ID required');
      }
      const confirmed = await rpc('cinetale_record_provider_submission', {
        p_operation_id: reservationId,
        p_worker_token: workerToken,
        p_provider: provider,
        p_provider_operation_id: providerOperationId.trim()
      });
      if (confirmed !== true) throw new Error('Provider submission was not durably confirmed');
    },
    async markUncertain({reservationId, leaseToken, reason}) {
      if (leaseToken !== workerToken) throw new TypeError('Worker lease mismatch');
      const confirmed = await rpc('cinetale_mark_submission_uncertain', {p_operation_id: reservationId,p_worker_token: workerToken,p_reason: reason});
      if (confirmed !== true) throw new Error('Uncertain state was not durably confirmed');
    }
  };
}
