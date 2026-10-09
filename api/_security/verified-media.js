import { createHash } from 'node:crypto';

const DEFAULT_MAX_BYTES = 500 * 1024 * 1024;
function detectContainer(header) {
  if (header.length >= 12 && header.subarray(4, 8).toString('ascii') === 'ftyp') return 'video/mp4';
  if (header.length >= 4 && header.subarray(0, 4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))) return 'video/webm';
  return null;
}
/**
 * Compute evidence from real bytes read from trusted storage, not caller-supplied metadata.
 * The caller must provide an authenticated storage reader and separately ensure that the
 * storage object remains immutable/retained; this does not prove playback or decodability.
 */
export async function verifyStoredVideo({ openReadStream, path, expectedSha256, expectedSizeBytes, maxBytes = DEFAULT_MAX_BYTES }) {
  if (typeof openReadStream !== 'function' || typeof path !== 'string' || !path.trim()) throw new Error('trusted-storage-reader-required');
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('invalid-size-limit');
  if (expectedSha256 !== undefined && !/^[0-9a-f]{64}$/.test(expectedSha256)) throw new Error('invalid-expected-digest');
  if (expectedSizeBytes !== undefined && (!Number.isSafeInteger(expectedSizeBytes) || expectedSizeBytes <= 0)) throw new Error('invalid-expected-size');
  const stream = await openReadStream(path);
  if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') throw new Error('invalid-storage-stream');
  const hash = createHash('sha256');
  let total = 0;
  let header = Buffer.alloc(0);
  try {
    for await (const chunk of stream) {
      if (!(Buffer.isBuffer(chunk) || chunk instanceof Uint8Array || typeof chunk === 'string')) throw new Error('invalid-media-chunk');
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += bytes.length;
      if (!Number.isSafeInteger(total) || total > maxBytes) throw new Error('media-exceeds-size-limit');
      hash.update(bytes);
      if (header.length < 16) header = Buffer.concat([header, bytes.subarray(0, 16 - header.length)]);
    }
  } catch (error) {
    if (typeof stream.destroy === 'function') stream.destroy();
    throw error;
  }
  if (total === 0) throw new Error('empty-media');
  const mime = detectContainer(header);
  if (!mime) throw new Error('unsupported-media-container');
  const sha256 = hash.digest('hex');
  if (expectedSha256 !== undefined && sha256 !== expectedSha256) throw new Error('media-digest-mismatch');
  if (expectedSizeBytes !== undefined && total !== expectedSizeBytes) throw new Error('media-size-mismatch');
  return Object.freeze({ sha256, sizeBytes: total, mime, verifiedAt: new Date().toISOString() });
}
