/** Immutable, independently decodable content objects. Collection membership and
 * logical conversation IDs live exclusively in the catalog. No body is extracted
 * to disk: decoded blocks use a byte-budgeted LRU and are verified before use. */
import { createHash, randomUUID } from 'node:crypto';
import { constants, mkdirSync, lstatSync, readFileSync, openSync, writeSync, fsyncSync, closeSync, renameSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { encodeBuffer, decodeBuffer, normalizeProfile } from './codec.mjs';

export const CONTENT_FORMAT = 'threadshelf-content-v2';
export const CONTENT_BLOCK_BYTES = 16 * 1024 * 1024;
export const DEFAULT_CONTENT_CACHE_BYTES = 256 * 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;

function syncDirectory(directory) {
  let fd;
  try { fd = openSync(directory, constants.O_RDONLY); fsyncSync(fd); }
  catch (error) { if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EINVAL', 'EISDIR', 'ENOTSUP', 'EBADF'].includes(error.code)) throw error; }
  finally { if (fd !== undefined) closeSync(fd); }
}

export function validateObject(object) {
  if (!object || !validHash(object.sha256) || !validHash(object.packedSha256) || !integer(object.bytes) || object.bytes > CONTENT_BLOCK_BYTES || !integer(object.packedBytes) || object.packedBytes > CONTENT_BLOCK_BYTES + 1024 * 1024 || !['7z', 'zip6'].includes(object.codec)) throw new Error('Invalid Local content object descriptor.');
  const extension = object.codec === '7z' ? '7z' : 'zip';
  if (object.file !== `${object.sha256}.${object.packedSha256}.${extension}`) throw new Error('Invalid Local content object filename.');
  return object;
}

function validateBlob(blob) {
  if (!blob || !integer(blob.bytes) || !Array.isArray(blob.blocks) || !blob.blocks.length || blob.blocks.length > 1000000) throw new Error('Invalid Local content record.');
  let bytes = 0;
  for (const block of blob.blocks) { validateObject(block); bytes += block.bytes; }
  if (bytes !== blob.bytes || !Number.isSafeInteger(bytes)) throw new Error('Local content record size is inconsistent.');
  return blob;
}

export function validateContentRef(ref) {
  if (!ref || ref.format !== CONTENT_FORMAT || ref.version !== 1 || !integer(ref.turnCount) || ref.turnCount < 1 || !Array.isArray(ref.groups) || !ref.groups.length || ref.groups.length > ref.turnCount) throw new Error('Unsupported Local conversation content format.');
  validateBlob(ref.header);
  let turns = 0;
  for (const group of ref.groups) {
    if (!integer(group.first) || group.first !== turns || !integer(group.count) || group.count < 1) throw new Error('Local conversation turn ordering is inconsistent.');
    validateBlob(group.blob); turns += group.count;
  }
  if (turns !== ref.turnCount) throw new Error('Local conversation turn count is inconsistent.');
  return ref;
}

export function* contentObjects(ref) {
  validateContentRef(ref);
  for (const object of ref.header.blocks) yield object;
  for (const group of ref.groups) for (const object of group.blob.blocks) yield object;
}

export class ContentStore {
  constructor({ directory, compression = '7z', cacheBytes = DEFAULT_CONTENT_CACHE_BYTES, blockBytes = CONTENT_BLOCK_BYTES } = {}) {
    if (!directory) throw new TypeError('ContentStore requires a durable content directory.');
    this.directory = resolve(directory); this.compression = normalizeProfile(compression);
    this.blockBytes = Math.min(CONTENT_BLOCK_BYTES, Math.max(1024, Math.trunc(Number(blockBytes)) || CONTENT_BLOCK_BYTES));
    this.budget = Math.min(1024 * 1024 * 1024, Math.max(0, Math.trunc(Number(cacheBytes)) || 0));
    this.cache = new Map(); this.cachedBytes = 0; this.peakBytes = 0; this.reads = 0; this.hits = 0; this.decodedBytes = 0;
  }

  _directory() {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this._assertDirectory();
  }

  _assertDirectory() {
    const stat = lstatSync(this.directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Local content directory must be a regular directory.');
  }

  _remember(key, bytes) {
    if (bytes.length > this.budget) return;
    if (this.cache.has(key)) { this.cachedBytes -= this.cache.get(key).length; this.cache.delete(key); }
    while (this.cachedBytes + bytes.length > this.budget && this.cache.size) {
      const oldest = this.cache.keys().next().value; this.cachedBytes -= this.cache.get(oldest).length; this.cache.delete(oldest);
    }
    this.cache.set(key, bytes); this.cachedBytes += bytes.length; this.peakBytes = Math.max(this.peakBytes, this.cachedBytes);
  }

  clearCache() { this.cache.clear(); this.cachedBytes = 0; return this.status(); }
  status() { return { ramBytes: this.cachedBytes, ramBudgetBytes: this.budget, peakRamBytes: this.peakBytes, cachedObjects: this.cache.size, decodedObjects: this.reads, cacheHits: this.hits, decodedBytes: this.decodedBytes, temporaryContentBytes: 0 }; }

  assertPresent(ref) {
    this._assertDirectory();
    for (const object of contentObjects(ref)) {
      const stat = lstatSync(join(this.directory, object.file));
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== object.packedBytes) throw new Error('An acknowledged Local content object is missing or has an unexpected size.');
    }
  }

  writeBlock(bytes, profile = this.compression) {
    if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
    if (bytes.length > this.blockBytes) throw new RangeError('Local content block exceeds the bounded object size.');
    this._directory();
    const codec = normalizeProfile(profile), sha256 = hash(bytes);
    const encoded = encodeBuffer(bytes, codec, { maxBytes: CONTENT_BLOCK_BYTES });
    const packedSha256 = hash(encoded), file = `${sha256}.${packedSha256}.${codec === '7z' ? '7z' : 'zip'}`, destination = join(this.directory, file);
    const object = validateObject({ file, codec, sha256, bytes: bytes.length, packedSha256, packedBytes: encoded.length });
    // Both identities belong in the filename. Different upstream builds may
    // encode the same logical bytes differently; neither representation may
    // overwrite another generation's committed checksum.
    const checked = decodeBuffer(encoded, codec, { maxBytes: CONTENT_BLOCK_BYTES, expectedBytes: bytes.length });
    if (hash(checked) !== sha256) throw new Error('New Local content object failed verification.');
    let existing;
    try { existing = lstatSync(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (existing) {
      if (!existing.isFile() || existing.isSymbolicLink() || existing.size !== encoded.length) throw new Error('Existing Local content object is unsafe or has an unexpected size.');
      if (hash(readFileSync(destination)) !== packedSha256) throw new Error('An existing Local content object is corrupt; original data was preserved.');
      return object;
    }
    const temporary = join(this.directory, `${file}.${randomUUID()}.part`);
    let fd;
    try {
      fd = openSync(temporary, 'wx', 0o600);
      let at = 0; while (at < encoded.length) { const written = writeSync(fd, encoded, at, encoded.length - at); if (!written) throw new Error('Local content write made no progress.'); at += written; }
      fsyncSync(fd); closeSync(fd); fd = undefined;
      renameSync(temporary, destination); syncDirectory(this.directory);
    } finally { if (fd !== undefined) closeSync(fd); rmSync(temporary, { force: true }); }
    return object;
  }

  readBlock(object, { bypassCache = false } = {}) {
    validateObject(object);
    this._assertDirectory();
    const key = `${object.file}:${object.packedSha256}`;
    if (!bypassCache && this.cache.has(key)) { const bytes = this.cache.get(key); this.cache.delete(key); this.cache.set(key, bytes); this.hits++; return bytes; }
    const filename = join(this.directory, object.file), stat = lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== object.packedBytes) throw new Error('Local content object is missing, unsafe, or has an unexpected size.');
    const encoded = readFileSync(filename);
    if (hash(encoded) !== object.packedSha256) throw new Error('Local compressed content checksum does not match the catalog.');
    const decoded = decodeBuffer(encoded, object.codec, { maxBytes: CONTENT_BLOCK_BYTES, expectedBytes: object.bytes });
    if (decoded.length !== object.bytes || hash(decoded) !== object.sha256) throw new Error('Local expanded content checksum does not match the catalog.');
    this.reads++; this.decodedBytes += decoded.length;
    if (!bypassCache) this._remember(key, decoded);
    return decoded;
  }

  writeBlob(bytes) {
    if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
    const blocks = [];
    for (let offset = 0; offset < bytes.length; offset += this.blockBytes) blocks.push(this.writeBlock(bytes.subarray(offset, offset + this.blockBytes)));
    if (!blocks.length) blocks.push(this.writeBlock(Buffer.alloc(0)));
    return { bytes: bytes.length, blocks };
  }

  readBlob(blob) {
    validateBlob(blob);
    if (blob.blocks.length === 1) return this.readBlock(blob.blocks[0]);
    // A single huge source record can span blocks; only that requested record is
    // assembled. The current renderer/JSON parser still materializes one record.
    const bytes = Buffer.allocUnsafe(blob.bytes); let at = 0;
    for (const object of blob.blocks) { this.readBlock(object).copy(bytes, at); at += object.bytes; }
    return bytes;
  }

  writeDocument(document) {
    const { turns, collection, collectionId, ...header } = document;
    const headerRef = this.writeBlob(Buffer.from(JSON.stringify(header)));
    const groups = []; let parts = [], bytes = 2, first = 0;
    const flush = () => { if (!parts.length) return; const encoded = Buffer.concat([Buffer.from('['), ...parts.flatMap((part, index) => index ? [Buffer.from(','), part] : [part]), Buffer.from(']')]); groups.push({ first, count: parts.length, blob: this.writeBlob(encoded) }); first += parts.length; parts = []; bytes = 2; };
    for (const turn of turns) {
      const part = Buffer.from(JSON.stringify(turn));
      if (parts.length && bytes + part.length + 1 > this.blockBytes) flush();
      parts.push(part); bytes += part.length + (parts.length > 1 ? 1 : 0);
      if (bytes >= this.blockBytes || parts.length >= 1024) flush();
    }
    flush();
    return validateContentRef({ format: CONTENT_FORMAT, version: 1, header: headerRef, groups, turnCount: turns.length });
  }

  *iterateTurns(ref) {
    validateContentRef(ref);
    for (const group of ref.groups) {
      const turns = JSON.parse(this.readBlob(group.blob).toString('utf8'));
      if (!Array.isArray(turns) || turns.length !== group.count) throw new Error('Local turn group failed structural validation.');
      for (const turn of turns) {
        if (!turn || typeof turn !== 'object' || Array.isArray(turn)) throw new Error('Invalid Local conversation turn.');
        yield turn;
      }
    }
  }

  readDocument(ref) {
    validateContentRef(ref);
    const header = JSON.parse(this.readBlob(ref.header).toString('utf8'));
    if (!header || typeof header !== 'object' || Array.isArray(header)) throw new Error('Invalid Local conversation header.');
    return { ...header, turns: [...this.iterateTurns(ref)] };
  }

  transcodeRef(ref, target, { signal, onProgress } = {}) {
    validateContentRef(ref);
    const converted = new Map();
    const block = object => { signal?.throwIfAborted(); const key = object.file; if (!converted.has(key)) { converted.set(key, target.writeBlock(this.readBlock(object))); onProgress?.({ file: object.file, bytes: object.bytes }); } return converted.get(key); };
    const blob = value => ({ bytes: value.bytes, blocks: value.blocks.map(block) });
    return { ...ref, header: blob(ref.header), groups: ref.groups.map(group => ({ ...group, blob: blob(group.blob) })) };
  }
}
