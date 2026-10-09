import { transferVerifiedProviderVideo } from './transfer-verified-provider-video.js';

const INTERACTION = /^v1_[A-Za-z0-9_-]{1,256}$/;
const LIMIT = 500 * 1024 * 1024;
const API = 'https://generativelanguage.googleapis.com';
const REVISION = '2026-05-20';

export class PreservedInteractionNeedsReview extends Error {
  constructor(code) { super(code); this.name = 'PreservedInteractionNeedsReview'; this.retryNewGeneration = false; }
}

function findVideo(result) {
  for (const step of Array.isArray(result?.steps) ? result.steps : []) {
    if (step?.type !== 'model_output') continue;
    for (const part of Array.isArray(step.content) ? step.content : []) {
      if (part?.type === 'video') return part;
    }
  }
  return null;
}
function mediaURL(video) {
  const uri = [video?.downloadUri, video?.download_uri, video?.uri, video?.url]
    .find(v => typeof v === 'string' && v.trim());
  if (uri) return uri;
  const name = String(video?.name || video?.fileName || '').trim();
  const match = name.match(/(?:^|\/)files\/([a-z0-9-]{1,120})$/i);
  return match ? `${API}/v1beta/files/${match[1]}:download?alt=media` : '';
}
async function readBounded(response) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > LIMIT) throw new PreservedInteractionNeedsReview('provider-media-too-large');
  const reader = response.body?.getReader?.();
  if (!reader) throw new PreservedInteractionNeedsReview('provider-media-body-unavailable');
  let total = 0;
  const chunks = [];
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > LIMIT) throw new PreservedInteractionNeedsReview('provider-media-too-large');
      chunks.push(Buffer.from(value));
    }
  } finally { try { await reader.cancel(); } catch {} }
  if (!total) throw new PreservedInteractionNeedsReview('provider-media-empty');
  return Buffer.concat(chunks, total);
}
/**
 * Private server-only recovery of an EXISTING Omni interaction; never calls a
 * generation endpoint. The trusted caller resolves owner/operation and obtains
 * the ORIGINAL provider interaction id from the privileged operation ledger.
 * An HTTP failure retains the paid operation for manual reconciliation.
 */
export async function recoverExistingOmniVideo({interactionId, apiKey, fetchImpl = fetch, transfer = transferVerifiedProviderVideo, timeoutMs = 30000, ...transferArgs} = {}) {
  if (!INTERACTION.test(interactionId || '')) throw new PreservedInteractionNeedsReview('invalid-saved-interaction');
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new PreservedInteractionNeedsReview('provider-credentials-unavailable');
  if (typeof fetchImpl !== 'function' || typeof transfer !== 'function') throw Error('trusted-recovery-dependencies-required');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let result;
    try {
      result = await fetchImpl(`${API}/v1beta/interactions/${encodeURIComponent(interactionId)}`, {
        method:'GET', headers: {'x-goog-api-key':apiKey, 'Api-Revision':REVISION},
        redirect:'error', signal:controller.signal,
      });
    } catch { throw new PreservedInteractionNeedsReview('interaction-retrieval-unavailable'); }
    if (!result.ok) throw new PreservedInteractionNeedsReview(`interaction-retrieval-http-${result.status}`);
    let interaction;
    try { interaction = await result.json(); } catch { throw new PreservedInteractionNeedsReview('invalid-interaction-response'); }
    if (interaction?.status !== 'completed') throw new PreservedInteractionNeedsReview('interaction-not-completed');
    const video = findVideo(interaction);
    if (!video) throw new PreservedInteractionNeedsReview('interaction-video-not-returned');
    let bytes;
    let mime = video.mime_type || video.mimeType || 'video/mp4';
    if (typeof video.data === 'string' && video.data.length) {
      if (video.data.length > Math.ceil(LIMIT * 4 / 3) + 64) throw new PreservedInteractionNeedsReview('provider-media-too-large');
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(video.data) || video.data.length % 4 !== 0) throw new PreservedInteractionNeedsReview('invalid-inline-video');
      bytes = Buffer.from(video.data, 'base64');
    } else {
      const url = mediaURL(video);
      let parsed;
      try { parsed = new URL(url); } catch { throw new PreservedInteractionNeedsReview('missing-provider-media-uri'); }
      if (parsed.protocol !== 'https:' || !['generativelanguage.googleapis.com', 'storage.googleapis.com'].includes(parsed.hostname) || parsed.username || parsed.password) {
        throw new PreservedInteractionNeedsReview('untrusted-provider-media-uri');
      }
      let media;
      try { media = await fetchImpl(parsed.href, {method:'GET', headers:{'x-goog-api-key':apiKey}, redirect:'error', signal:controller.signal}); }
      catch { throw new PreservedInteractionNeedsReview('provider-media-download-unavailable'); }
      if (!media.ok) throw new PreservedInteractionNeedsReview(`provider-media-download-http-${media.status}`);
      bytes = await readBounded(media);
      mime = media.headers?.get?.('content-type')?.split(';')[0] || mime;
    }
    if (!bytes.length || bytes.length > LIMIT) throw new PreservedInteractionNeedsReview('provider-media-invalid-size');
    if (!['video/mp4','video/webm'].includes(mime)) throw new PreservedInteractionNeedsReview('unsupported-provider-media-type');
    return await transfer({...transferArgs, bytes, mime});
  } finally { clearTimeout(timeout); }
}
