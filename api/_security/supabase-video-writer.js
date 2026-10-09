/** Server-only, create-once private media writer. No browser routes or provider requests.
 * A 409 conflict is not success: a separate trusted read/verify/adopt step is required.
 */
export function createSupabaseVideoWriter({ env = process.env, fetchImpl = globalThis.fetch, bucket = 'cinetale-videos', maxBytes = 500 * 1024 * 1024 } = {}) {
  const origin = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!/^https:\/\/[^/?#]+$/i.test(origin)) throw Error('storage-url-not-configured');
  if (!serviceKey) throw Error('storage-server-credential-not-configured');
  if (typeof fetchImpl !== 'function') throw Error('storage-fetch-required');
  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/i.test(bucket)) throw Error('invalid-storage-bucket');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw Error('invalid-storage-size-limit');
  return async function writeVideoOnce(path, bytes, {mime = 'video/mp4'} = {}) {
    if (typeof path !== 'string' || !path || path.length > 512 || path.startsWith('/') ||
      path.split('/').some(part => !part || part === '.' || part === '..' || !/^[a-zA-Z0-9._-]+$/.test(part))) throw Error('invalid-storage-object-path');
    if (!(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > maxBytes) throw Error('invalid-video-bytes');
    if (!['video/mp4', 'video/webm'].includes(mime)) throw Error('unsupported-video-mime');
    const resource = `${origin}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`;
    let response;
    try {
      response = await fetchImpl(resource, {
        method: 'POST',
        headers: { authorization:`Bearer ${serviceKey}`, apikey:serviceKey,
          'content-type':mime, 'content-length':String(bytes.byteLength), 'x-upsert':'false' },
        body:bytes, redirect:'error', signal:AbortSignal.timeout(60000),
      });
    } catch { throw Error('storage-write-outcome-uncertain'); }
    if (response.status === 409) throw Error('storage-object-already-exists-verification-required');
    if (!response.ok) throw Error('storage-write-not-confirmed');
    return Object.freeze({path, sizeBytes:bytes.byteLength, pendingVerification:true});
  };
}
