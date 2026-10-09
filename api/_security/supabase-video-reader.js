import { Readable } from 'node:stream';

/** Server-only reader. Never expose the service-role key to a browser. */
export function createSupabaseVideoReader({ env = process.env, fetchImpl = globalThis.fetch, bucket = 'cinetale-videos' } = {}) {
  const origin = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!/^https:\/\/[^/?#]+$/i.test(origin)) throw new Error('storage-url-not-configured');
  if (!serviceKey) throw new Error('storage-server-credential-not-configured');
  if (typeof fetchImpl !== 'function') throw new Error('storage-fetch-required');
  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/i.test(bucket)) throw new Error('invalid-storage-bucket');

  return async function openReadStream(path) {
    if (typeof path !== 'string' || path.length > 512 || !path || path.startsWith('/') ||
        path.split('/').some(part => !part || part === '.' || part === '..' || !/^[a-zA-Z0-9._-]+$/.test(part))) {
      throw new Error('invalid-storage-object-path');
    }
    const resource = `${origin}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetchImpl(resource, {
      method: 'GET',
      headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok || !response.body) throw new Error('storage-object-unavailable');
    return Readable.fromWeb(response.body);
  };
}
