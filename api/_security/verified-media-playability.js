import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { verifyStoredVideo } from './verified-media.js';

const MAX_BYTES = 500 * 1024 * 1024;

export async function runVideoProbe(filename, { command = 'ffprobe', timeoutMs = 15000 } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) throw Error('invalid-probe-timeout');
  return await new Promise((resolve, reject) => {
    const child = spawn(command, ['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,width,height,duration','-of','json',filename], { stdio:['ignore','pipe','pipe'], windowsHide:true });
    let stdout = '', stderr = '', settled = false;
    const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve(result); };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(Error('media-probe-timeout')); }, timeoutMs);
    child.on('error', () => finish(Error('media-probe-unavailable')));
    child.stdout.on('data', b => { stdout += b; if (stdout.length > 65536) {child.kill('SIGKILL'); finish(Error('media-probe-oversized-output'));} });
    child.stderr.on('data', b => { stderr += b; if (stderr.length > 65536) {child.kill('SIGKILL'); finish(Error('media-probe-oversized-output'));} });
    child.on('close', code => {
      if (settled) return;
      if (code !== 0) return finish(Error('media-probe-failed'));
      try {
        const parsed = JSON.parse(stdout);
        const stream = parsed?.streams?.[0];
        if (!stream || !stream.codec_name || !Number.isInteger(stream.width) || stream.width <= 0 || !Number.isInteger(stream.height) || stream.height <= 0) throw Error();
        finish(null, Object.freeze({ codec:stream.codec_name, width:stream.width, height:stream.height }));
      } catch { finish(Error('media-no-decodable-video-stream')); }
    });
  });
}

/** Probe actual trusted storage bytes, not metadata from a browser. No database status changes. */
export async function verifyStoredPlayableVideo({ openReadStream, path, expectedSha256, expectedSizeBytes, maxBytes = MAX_BYTES, probe = runVideoProbe }) {
  if (typeof openReadStream !== 'function' || typeof path !== 'string' || !path.trim()) throw Error('trusted-storage-reader-required');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw Error('invalid-size-limit');
  if (typeof probe !== 'function') throw Error('trusted-probe-required');
  const dir = await mkdtemp(join(tmpdir(), 'cinetale-probe-'));
  const file = join(dir, 'media.bin');
  try {
    const source = await openReadStream(path);
    if (!source || typeof source[Symbol.asyncIterator] !== 'function') throw Error('invalid-storage-stream');
    let transferred = 0;
    const bounded = Readable.from((async function* () {
      for await (const chunk of source) {
        if (!(Buffer.isBuffer(chunk) || chunk instanceof Uint8Array)) throw Error('invalid-media-chunk');
        transferred += chunk.length;
        if (transferred > maxBytes) throw Error('media-exceeds-size-limit');
        yield chunk;
      }
    })());
    await pipeline(bounded, createWriteStream(file, { flags:'wx', mode:0o600 }));
    const evidence = await verifyStoredVideo({openReadStream: () => import('node:fs').then(fs => fs.createReadStream(file)), path, expectedSha256, expectedSizeBytes, maxBytes});
    const playable = await probe(file);
    if (!playable || !playable.codec || !Number.isInteger(playable.width) || playable.width <= 0 || !Number.isInteger(playable.height) || playable.height <= 0) throw Error('media-no-decodable-video-stream');
    return Object.freeze({ ...evidence, video: Object.freeze({...playable}) });
  } finally { await rm(dir, {recursive:true, force:true}); }
}
