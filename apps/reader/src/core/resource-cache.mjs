import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import sharp from 'sharp';

export const RESOURCE_CACHE_LIMITS = Object.freeze({ imageBytes: 16 * 1024 * 1024, pixels: 40_000_000,
  totalBytes: 1024 * 1024 * 1024, concurrency: 4, queued: 64, timeoutMs: 20_000,
  redirects: 5, resources: 5000, conversations: 10_000, references: 50_000, indexBytes: 8 * 1024 * 1024 });
const HEX = /^[a-f0-9]{64}$/;
const MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);
const sha = value => createHash('sha256').update(value).digest('hex');
const failure = (code, message) => Object.assign(new Error(message), { code });
const aborted = () => failure('ABORT_ERR', 'Image request was cancelled.');
const emptyIndex = () => ({ schemaVersion: 1, resources: {}, conversations: {} });
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const sleepUntilAbort = signal => new Promise((_, reject) => {
  if (signal.aborted) reject(aborted());
  else signal.addEventListener('abort', () => reject(aborted()), { once: true });
});

export function normalizeResourceUrl(value) {
  if (typeof value !== 'string' || !value || value.length > 16_384 || /[\s\u0000-\u001f\u007f]/u.test(value)) {
    throw failure('URL', 'Invalid image address.');
  }
  let url;
  try { url = new URL(value); } catch { throw failure('URL', 'Invalid image address.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) {
    throw failure('URL', 'Only public HTTP(S) images without credentials are supported.');
  }
  url.hash = '';
  return url.href;
}

// Only public unicast addresses may be contacted. Conservative exclusions also
// block IPv4 transition/translation ranges, which could reach a private network.
export function isPublicResourceAddress(value) {
  const family = isIP(value);
  if (family === 4) {
    const [a, b, c] = value.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2) || (b === 88 && c === 99)))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113));
  }
  if (family !== 6 || value.includes('%') || value.includes('.')) return false;
  const groups = value.toLowerCase().split(':');
  const first = parseInt(groups[0] || '0', 16), second = parseInt(groups[1] || '0', 16);
  return first >= 0x2000 && first <= 0x3fff
    && !(first === 0x2001 && (second <= 0x1ff || second === 0xdb8))
    && first !== 0x2002 && !(first === 0x3fff && second <= 0xfff);
}

function ownerValue(value) {
  if (!plain(value)) throw failure('OWNER', 'Invalid image conversation.');
  const result = {};
  for (const [key, max] of [['key', 16_384], ['title', 2000], ['source', 2000], ['sourceId', 8192]]) {
    const text = value[key] ?? (key === 'title' ? 'Untitled' : '');
    if (typeof text !== 'string' || text.length > max || /[\u0000-\u001f\u007f]/u.test(text) || (key === 'key' && !text)) {
      throw failure('OWNER', 'Invalid image conversation.');
    }
    result[key] = text;
  }
  return result;
}

function sniffMime(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 13 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'image/gif';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 16 && bytes.toString('ascii', 4, 8) === 'ftyp') {
    const boxSize = bytes.readUInt32BE(0);
    if (boxSize >= 16 && boxSize <= Math.min(bytes.length, 4096)) {
      const brands = [bytes.toString('ascii', 8, 12)];
      for (let i = 16; i + 4 <= boxSize; i += 4) brands.push(bytes.toString('ascii', i, i + 4));
      if (brands.includes('avif') || brands.includes('avis')) return 'image/avif';
    }
  }
  return '';
}

function pngFrameCount(bytes) {
  // libvips can expose APNG as one PNG page; browsers still play its animation.
  // Read the bounded PNG chunk stream so that the animation shares the same
  // aggregate pixel ceiling as GIF, animated WebP and AVIF.
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const size = bytes.readUInt32BE(offset);
    if (size > bytes.length - offset - 12) throw new Error('Incomplete PNG chunk.');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'acTL') {
      if (size !== 8 || !bytes.readUInt32BE(offset + 8)) throw new Error('Invalid PNG animation.');
      return bytes.readUInt32BE(offset + 8);
    }
    if (type === 'IEND') break;
    offset += size + 12;
  }
  return 1;
}

async function validateRaster(bytes, mime, limits) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > limits.imageBytes) throw failure('IMAGE_SIZE', 'Image exceeds its size limit.');
  if (!MIME.has(mime) || sniffMime(bytes) !== mime) throw failure('IMAGE_TYPE', 'Only valid PNG, JPEG, GIF, WebP, or AVIF images are supported.');
  try {
    const decoder = sharp(bytes, { limitInputPixels: limits.pixels, failOn: 'warning', animated: false })
      .timeout({ seconds: Math.max(1, Math.ceil(limits.timeoutMs / 1000)) });
    const metadata = await decoder.metadata();
    const pages = Math.max(metadata.pages || 1, mime === 'image/png' ? pngFrameCount(bytes) : 1);
    const expected = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'heif' }[mime];
    if (metadata.format !== expected || (mime === 'image/avif' && metadata.compression !== 'av1') || !metadata.width || !metadata.height
      || metadata.width * metadata.height * pages > limits.pixels) throw new Error('Invalid dimensions.');
    // Force decoding, rather than accepting a convincing file header alone.
    await decoder.resize(1, 1, { fit: 'fill' }).raw().toBuffer();
  } catch { throw failure('IMAGE_INVALID', 'Image data is invalid or exceeds its pixel limit.'); }
}

/** A separate, optional byte cache. No conversation/archive files are modified.
 * lookup and request are trusted test seams; never expose them over IPC.
 * setEnabled must receive the current service preference before load calls.
 */
export class ResourceCache {
  constructor({ dataDir, lookup = dnsLookup, request, limits = {} } = {}) {
    if (typeof dataDir !== 'string' || !path.isAbsolute(dataDir)) throw failure('PATH', 'An absolute profile directory is required.');
    this.dataDir = dataDir;
    this.directory = path.join(dataDir, 'resource-cache-v1');
    this.objects = path.join(this.directory, 'objects');
    this.indexFile = path.join(this.directory, 'index.json');
    this.lookup = lookup;
    this.request = request || ((url, options, cb) => (url.protocol === 'https:' ? https : http).request(url, options, cb));
    this.limits = { ...RESOURCE_CACHE_LIMITS };
    for (const [key, value] of Object.entries(limits)) {
      if (!Object.hasOwn(this.limits, key) || !Number.isSafeInteger(value) || value < 1 || value > this.limits[key]) throw failure('LIMIT', 'Invalid cache limit.');
      this.limits[key] = value;
    }
    this.index = emptyIndex(); this.queue = Promise.resolve(); this.inflight = new Map();
    this.enabled = false; this.policyEpoch = 0; this.clearEpoch = 0; this.ownerEpochs = new Map();
    this.active = 0; this.waiters = []; this.loadCount = 0; this.closed = false; this.notice = ''; this.initialized = false;
  }

  async init() {
    if (this.initialized) return this;
    if (!this.initializing) this.initializing = this.initialize().catch(error => { this.initializing = null; throw error; });
    return this.initializing;
  }

  async initialize() {
    await fs.mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    this.parents = [];
    for (const directory of [this.dataDir, this.directory, this.objects]) {
      if (directory !== this.dataDir) await fs.mkdir(directory, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
      const stat = await fs.lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw failure('PATH', 'Cache folders must be real directories.');
      this.parents.push({ directory, dev: stat.dev, ino: stat.ino });
    }
    try {
      const bytes = await this.readRegular(this.indexFile, this.limits.indexBytes);
      this.index = this.validateIndex(JSON.parse(bytes.toString('utf8')));
    } catch (error) {
      if (error.code !== 'ENOENT') this.notice = 'cache-corrupt';
    }
    if (!this.notice) await this.cleanupOrphans();
    this.initialized = true;
    return this;
  }

  setEnabled(enabled) {
    if (typeof enabled !== 'boolean') throw failure('SETTING', 'Invalid resource cache preference.');
    if (this.enabled !== enabled) this.policyEpoch++;
    this.enabled = enabled;
  }

  async guard() {
    if (this.closed) throw aborted();
    for (const { directory, dev, ino } of this.parents || []) {
      const stat = await fs.lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== dev || stat.ino !== ino) throw failure('PATH', 'Cache directory changed unexpectedly.');
    }
  }

  serial(fn) {
    const task = this.queue.catch(() => {}).then(fn);
    this.queue = task; return task;
  }

  async readRegular(file, maxBytes) {
    await this.guard();
    const before = await fs.lstat(file);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > maxBytes) throw failure('PATH', 'Unsafe or oversized cache file.');
    const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.dev !== before.dev || stat.ino !== before.ino || stat.size > maxBytes) throw failure('PATH', 'Cache file changed unexpectedly.');
      const buffer = Buffer.alloc(stat.size);
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
        if (!bytesRead) throw failure('CORRUPT', 'Incomplete cache file.');
        offset += bytesRead;
      }
      if ((await handle.stat()).size !== stat.size) throw failure('CORRUPT', 'Cache file changed unexpectedly.');
      await this.guard();
      return buffer;
    } finally { await handle.close(); }
  }

  validateIndex(value) {
    if (!plain(value) || value.schemaVersion !== 1 || !plain(value.resources) || !plain(value.conversations)) throw failure('CORRUPT', 'Invalid resource cache index.');
    const resources = Object.entries(value.resources), owners = Object.entries(value.conversations);
    if (resources.length > this.limits.resources || owners.length > this.limits.conversations) throw failure('CORRUPT', 'Resource cache index exceeds its limit.');
    const result = emptyIndex(); let refs = 0;
    for (const [id, owner] of owners) {
      const valid = ownerValue(owner);
      if (!HEX.test(id) || sha(valid.key) !== id) throw failure('CORRUPT', 'Invalid resource cache owner.');
      result.conversations[id] = valid;
    }
    const sizes = new Map();
    for (const [id, entry] of resources) {
      if (!HEX.test(id) || !plain(entry) || normalizeResourceUrl(entry.url) !== entry.url || sha(entry.url) !== id
        || !HEX.test(entry.digest) || !MIME.has(entry.mime) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > this.limits.imageBytes
        || !Array.isArray(entry.owners) || !entry.owners.length || new Set(entry.owners).size !== entry.owners.length
        || entry.owners.some(owner => !HEX.test(owner) || !Object.hasOwn(result.conversations, owner))) throw failure('CORRUPT', 'Invalid cached resource.');
      refs += entry.owners.length;
      if (sizes.has(entry.digest) && sizes.get(entry.digest) !== entry.bytes) throw failure('CORRUPT', 'Invalid cached byte count.');
      sizes.set(entry.digest, entry.bytes);
      result.resources[id] = { url: entry.url, digest: entry.digest, mime: entry.mime, bytes: entry.bytes, owners: [...entry.owners] };
    }
    if (refs > this.limits.references || [...sizes.values()].reduce((a, b) => a + b, 0) > this.limits.totalBytes) throw failure('CORRUPT', 'Resource cache exceeds its limit.');
    return result;
  }

  async atomic(file, bytes, mayCommit = () => true) {
    await this.guard();
    if (!mayCommit()) throw failure('STALE_STORE', 'Image cache policy changed.');
    const tmp = path.join(path.dirname(file), `${path.basename(file)}.${randomBytes(12).toString('hex')}.tmp`);
    let handle;
    try {
      handle = await fs.open(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
      await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
      await this.guard();
      // Existing destinations must also be owned regular files. rename replaces
      // rather than follows them, but refusing links makes corruption explicit.
      const existing = await fs.lstat(file).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (existing && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1)) throw failure('PATH', 'Unsafe cache destination.');
      if (!mayCommit()) throw failure('STALE_STORE', 'Image cache policy changed.');
      await fs.rename(tmp, file);
      // Flush directory metadata where the platform supports directory handles.
      const parent = await fs.open(path.dirname(file), constants.O_RDONLY).catch(() => null);
      if (parent) { try { await parent.sync().catch(() => {}); } finally { await parent.close().catch(() => {}); } }
    } finally { await handle?.close().catch(() => {}); await fs.unlink(tmp).catch(() => {}); }
  }

  async commit(next, mayCommit) {
    this.validateIndex(next);
    const bytes = Buffer.from(JSON.stringify(next));
    if (bytes.length > this.limits.indexBytes) throw failure('CACHE_FULL', 'Resource cache is full.');
    await this.atomic(this.indexFile, bytes, mayCommit);
    this.index = next;
  }

  async slot(signal, work) {
    if (this.active >= this.limits.concurrency) {
      if (this.waiters.length >= this.limits.queued) throw failure('BUSY', 'Too many image requests.');
      await new Promise((resolve, reject) => {
        const waiter = { resolve, reject, signal, abort: null };
        waiter.abort = () => { const index = this.waiters.indexOf(waiter); if (index >= 0) this.waiters.splice(index, 1); reject(aborted()); };
        this.waiters.push(waiter); signal.addEventListener('abort', waiter.abort, { once: true });
        if (signal.aborted) waiter.abort();
      });
    } else this.active++;
    try { if (signal.aborted || this.closed) throw aborted(); return await work(); }
    finally {
      const waiter = this.waiters.shift();
      if (waiter) { waiter.signal.removeEventListener('abort', waiter.abort); waiter.resolve(); }
      else this.active--;
    }
  }

  async publicAddress(url, signal) {
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    if (/^(?:localhost|.*\.(?:localhost|local|internal|home\.arpa))\.?$/i.test(hostname)) throw failure('NETWORK', 'Private image addresses are blocked.');
    let answers;
    if (isIP(hostname)) answers = [{ address: hostname, family: isIP(hostname) }];
    else answers = await Promise.race([this.lookup(hostname, { all: true, verbatim: true }), sleepUntilAbort(signal)]);
    if (!Array.isArray(answers) || !answers.length || answers.length > 64
      || answers.some(answer => !isPublicResourceAddress(answer.address) || isIP(answer.address) !== answer.family)) throw failure('NETWORK', 'Private image addresses are blocked.');
    return answers[0];
  }

  async fetchImage(address, signal) {
    let url = new URL(address);
    for (let hop = 0; hop <= this.limits.redirects; hop++) {
      if (signal.aborted) throw aborted();
      const pinned = await this.publicAddress(url, signal);
      const response = await new Promise((resolve, reject) => {
        const options = { method: 'GET', agent: false, signal, headers: { Accept: 'image/png,image/jpeg,image/gif,image/webp,image/avif', 'Accept-Encoding': 'identity', 'User-Agent': 'ThreadShelf-Local-Reader' },
          lookup: (_hostname, opts, callback) => {
            if (typeof opts === 'function') { callback = opts; opts = {}; }
            callback(null, opts?.all ? [pinned] : pinned.address, pinned.family);
          } };
        const request = this.request(url, options, resolve);
        request.on('error', reject); request.end();
      });
      const status = response.statusCode;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location; response.destroy();
        if (hop === this.limits.redirects || typeof location !== 'string' || /[\u0000-\u001f\u007f]/u.test(location)) throw failure('REDIRECT', 'Image redirect limit exceeded.');
        let next;
        try { next = new URL(location, url).href; } catch { throw failure('REDIRECT', 'Invalid image redirect.'); }
        url = new URL(normalizeResourceUrl(next)); continue;
      }
      if (status !== 200) { response.destroy(); throw failure('HTTP', 'Image server did not return an image.'); }
      const mime = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const length = response.headers['content-length'];
      if (!MIME.has(mime) || (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')) {
        response.destroy(); throw failure('IMAGE_TYPE', 'Only raster image responses are supported.');
      }
      if (length !== undefined && (!/^\d+$/.test(String(length)) || Number(length) > this.limits.imageBytes)) {
        response.destroy(); throw failure('IMAGE_SIZE', 'Image exceeds its size limit.');
      }
      const chunks = []; let size = 0;
      try {
        for await (const chunk of response) {
          if (signal.aborted) throw aborted();
          size += chunk.length;
          if (size > this.limits.imageBytes) throw failure('IMAGE_SIZE', 'Image exceeds its size limit.');
          chunks.push(Buffer.from(chunk));
        }
      } finally { response.destroy(); }
      const bytes = Buffer.concat(chunks, size);
      if (length !== undefined && size !== Number(length)) throw failure('IMAGE_INVALID', 'Image response was incomplete.');
      await validateRaster(bytes, mime, this.limits);
      if (signal.aborted) throw aborted();
      return { bytes, mime, digest: sha(bytes) };
    }
    throw failure('REDIRECT', 'Image redirect limit exceeded.');
  }

  async sharedFetch(url, signal) {
    const id = sha(url);
    let entry = this.inflight.get(id);
    if (entry?.controller.signal.aborted) { this.inflight.delete(id); entry = null; }
    if (!entry) {
      if (this.inflight.size >= this.limits.concurrency + this.limits.queued) throw failure('BUSY', 'Too many image requests.');
      const controller = new AbortController();
      const timeout = AbortSignal.timeout(this.limits.timeoutMs);
      const combined = AbortSignal.any([controller.signal, timeout]);
      entry = { controller, subscribers: 0, promise: null };
      entry.promise = this.slot(combined, () => this.fetchImage(url, combined)).catch(error => {
        if (['ABORT_ERR', 'BUSY', 'URL', 'NETWORK', 'REDIRECT', 'HTTP', 'IMAGE_SIZE', 'IMAGE_TYPE', 'IMAGE_INVALID'].includes(error.code)) throw error;
        throw failure('NETWORK', 'The image server could not be reached.');
      }).finally(() => {
        if (this.inflight.get(id) === entry) this.inflight.delete(id);
      });
      // Subscribers attach below in the same turn, including rejection handlers.
      this.inflight.set(id, entry);
    }
    entry.subscribers++;
    let onAbort;
    try {
      return await Promise.race([entry.promise, new Promise((_, reject) => {
        onAbort = () => reject(aborted()); signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) onAbort();
      })]);
    } finally {
      signal.removeEventListener('abort', onAbort);
      entry.subscribers--;
      if (!entry.subscribers) entry.controller.abort();
    }
  }

  async load(options = {}) {
    if (this.loadCount >= this.limits.concurrency + this.limits.queued) throw failure('BUSY', 'Too many image requests.');
    const ownerId = sha(ownerValue(options.conversation).key);
    this.loadCount++;
    let token = this.ownerEpochs.get(ownerId);
    if (!token) { token = { epoch: 0, active: 0 }; this.ownerEpochs.set(ownerId, token); }
    token.active++;
    try { return await this.loadResource(options, token); }
    finally {
      this.loadCount--; token.active--;
      if (!token.active && this.ownerEpochs.get(ownerId) === token) this.ownerEpochs.delete(ownerId);
    }
  }

  async loadResource({ url, conversation, enabled = this.enabled, signal } = {}, ownerToken) {
    if (!this.initialized) await this.init();
    if (typeof enabled !== 'boolean') throw failure('SETTING', 'Invalid resource cache preference.');
    if (this.closed) throw aborted();
    if (this.notice) throw failure('CORRUPT', 'The resource cache is unreadable. Clear it to start again; archive data is unaffected.');
    const normalized = normalizeResourceUrl(url), id = sha(normalized), owner = ownerValue(conversation), ownerId = sha(owner.key);
    const localSignal = signal || new AbortController().signal;
    const epoch = this.clearEpoch, ownerEpoch = ownerToken.epoch, policyEpoch = this.policyEpoch;
    const valid = () => !this.closed && !localSignal.aborted && epoch === this.clearEpoch && ownerEpoch === ownerToken.epoch;
    const canStore = () => valid() && enabled && this.enabled && policyEpoch === this.policyEpoch;
    if (!valid()) throw aborted();
    let image = null, cached = false, warning = '';
    await this.serial(async () => {
      if (!valid()) throw aborted();
      const entry = this.index.resources[id];
      if (!entry) return;
      try {
        const bytes = await this.readRegular(path.join(this.objects, `${entry.digest}.bin`), this.limits.imageBytes);
        if (bytes.length !== entry.bytes || sha(bytes) !== entry.digest) throw failure('CORRUPT', 'Cached image is damaged.');
        await this.slot(localSignal, () => validateRaster(bytes, entry.mime, this.limits));
        image = { bytes, mime: entry.mime, digest: entry.digest }; cached = true;
      } catch (error) {
        if (error.code === 'ABORT_ERR' || error.code === 'PATH') throw error;
        // Preserve corrupt cache files until the user clears them. Never return
        // corrupted bytes or silently replace the user's retained resource.
        throw failure('CORRUPT', 'Cached image is damaged. Clear this conversation’s cached resources to reload it.');
      }
    });
    if (!image) image = await this.sharedFetch(normalized, localSignal);
    if (!valid()) throw aborted();
    let stored = cached;
    if (canStore()) await this.serial(async () => {
      if (!canStore()) return;
      const next = structuredClone(this.index);
      const existing = next.resources[id];
      if (existing && existing.digest !== image.digest) throw failure('CORRUPT', 'Conflicting cached image.');
      const entry = existing || { url: normalized, digest: image.digest, mime: image.mime, bytes: image.bytes.length, owners: [] };
      if (!entry.owners.includes(ownerId)) entry.owners.push(ownerId);
      next.resources[id] = entry; next.conversations[ownerId] = owner;
      try {
        this.validateIndex(next);
        if (Buffer.byteLength(JSON.stringify(next)) > this.limits.indexBytes) throw failure('CACHE_FULL', 'Resource cache is full.');
      } catch { warning = 'cache-full'; return; }
      const objectFile = path.join(this.objects, `${image.digest}.bin`);
      let added = false;
      try {
        try {
          const existingBytes = await this.readRegular(objectFile, this.limits.imageBytes);
          if (sha(existingBytes) !== image.digest) throw failure('CORRUPT', 'Cached image is damaged.');
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          await this.atomic(objectFile, image.bytes, canStore); added = true;
        }
        if (!canStore()) {
          if (added && !Object.values(this.index.resources).some(resource => resource.digest === image.digest)) await this.removeObject(image.digest);
          return;
        }
        await this.commit(next, canStore); stored = true;
      } catch (error) {
        if (added && !Object.values(this.index.resources).some(resource => resource.digest === image.digest)) await this.removeObject(image.digest).catch(() => {});
        if (error.code !== 'STALE_STORE') throw error;
      }
    });
    if (!valid()) throw aborted();
    return { dataUrl: `data:${image.mime};base64,${image.bytes.toString('base64')}`, mime: image.mime,
      bytes: image.bytes.length, cached, stored, url: normalized, resourceId: id, ...(warning ? { warning } : {}) };
  }

  async status() {
    if (!this.initialized) await this.init();
    return this.serial(async () => {
      await this.guard();
      const resources = Object.entries(this.index.resources), unique = new Map(), ownerStats = new Map();
      for (const [, value] of resources) {
        unique.set(value.digest, value.bytes);
        for (const id of value.owners) {
          let stats = ownerStats.get(id);
          if (!stats) { stats = { count: 0, blobs: new Map() }; ownerStats.set(id, stats); }
          stats.count++; stats.blobs.set(value.digest, value.bytes);
        }
      }
      const conversations = [...ownerStats].map(([id, stats]) => ({ ...this.index.conversations[id],
        resourceCount: stats.count, bytes: [...stats.blobs.values()].reduce((a, b) => a + b, 0) }));
      return { resourceCount: resources.length, totalBytes: [...unique.values()].reduce((a, b) => a + b, 0),
        maxBytes: this.limits.totalBytes, conversations, ...(this.notice ? { notice: this.notice } : {}) };
    });
  }
  list() { return this.status(); }

  async cleanupOrphans() {
    await this.guard();
    const keep = new Set(Object.values(this.index.resources).map(entry => entry.digest));
    for (const name of await fs.readdir(this.objects)) {
      const blob = /^([a-f0-9]{64})\.bin$/.exec(name);
      if (blob && !keep.has(blob[1])) await this.removeObject(blob[1]);
      else if (/^[a-f0-9]{64}\.bin\.[a-f0-9]{24}\.tmp$/.test(name)) await this.removeTemporary(this.objects, name);
    }
    for (const name of await fs.readdir(this.directory)) {
      if (/^index\.json\.[a-f0-9]{24}\.tmp$/.test(name)) await this.removeTemporary(this.directory, name);
    }
  }

  async removeTemporary(directory, name) {
    await this.guard();
    const file = path.join(directory, name), stat = await fs.lstat(file);
    if (stat.isFile() || stat.isSymbolicLink()) await fs.unlink(file);
    else throw failure('PATH', 'Unexpected cache temporary file.');
  }

  async removeObject(digest) {
    if (!HEX.test(digest)) throw failure('PATH', 'Invalid cache filename.');
    await this.guard();
    const file = path.join(this.objects, `${digest}.bin`);
    const stat = await fs.lstat(file).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    // Unlinking a symbolic link does not follow it; never traverse directories.
    if (stat && (stat.isFile() || stat.isSymbolicLink())) await fs.unlink(file);
    else if (stat) throw failure('PATH', 'Unexpected cache object.');
  }

  async clear({ conversationKey, all = false } = {}) {
    if (!this.initialized) await this.init();
    if (all !== true && (typeof conversationKey !== 'string' || !conversationKey || conversationKey.length > 16_384)) throw failure('OWNER', 'Choose a cached conversation.');
    if (all && conversationKey !== undefined) throw failure('OWNER', 'Choose one cache deletion scope.');
    const ownerId = all ? null : sha(conversationKey);
    if (all) {
      this.clearEpoch++;
      for (const entry of this.inflight.values()) entry.controller.abort();
      this.inflight.clear();
    } else { const token = this.ownerEpochs.get(ownerId); if (token) token.epoch++; }
    await this.serial(async () => {
      await this.guard();
      if (this.notice && !all) throw failure('CORRUPT', 'Clear all cached resources to repair the cache.');
      const previous = this.index, next = all ? emptyIndex() : structuredClone(previous);
      if (!all) {
        delete next.conversations[ownerId];
        for (const [id, entry] of Object.entries(next.resources)) {
          entry.owners = entry.owners.filter(owner => owner !== ownerId);
          if (!entry.owners.length) delete next.resources[id];
        }
      }
      // Explicit clear-all can remove an unsafe index link itself, never its
      // target. This repairs corruption without following anything outside cache.
      if (all) {
        const indexStat = await fs.lstat(this.indexFile).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
        if (indexStat && (indexStat.isSymbolicLink() || (indexStat.isFile() && indexStat.nlink > 1))) await fs.unlink(this.indexFile);
      }
      await this.commit(next); this.notice = '';
      const keep = new Set(Object.values(next.resources).map(entry => entry.digest));
      const names = all ? await fs.readdir(this.objects) : [...new Set(Object.values(previous.resources).map(entry => `${entry.digest}.bin`))];
      for (const name of names) {
        const match = /^([a-f0-9]{64})\.bin$/.exec(name);
        if (match && !keep.has(match[1])) await this.removeObject(match[1]);
      }
    });
    return this.status();
  }

  async close() {
    if (this.closePromise) return this.closePromise;
    this.closed = true; this.clearEpoch++;
    const pending = [...this.inflight.values()];
    for (const entry of pending) entry.controller.abort();
    for (const waiter of this.waiters.splice(0)) { waiter.signal.removeEventListener('abort', waiter.abort); waiter.reject(aborted()); }
    this.closePromise = Promise.allSettled([this.queue, ...pending.map(entry => entry.promise)]).then(() => {});
    return this.closePromise;
  }
}
