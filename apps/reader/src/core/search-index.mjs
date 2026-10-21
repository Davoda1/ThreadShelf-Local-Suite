import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { encodeBuffer, decodeBuffer } from './codec.mjs';

// The SQLite file contains only model metadata and pointers. Vector bytes live
// in independently compressed immutable blocks; at most one block is cached.
export const VECTOR_BLOCK_BYTES = 4 * 1024 * 1024;
const FORMAT = 'threadshelf-vector-block-v2';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const profileName = value => { if (value === 'zip' || value === 'zip6') return 'zip6'; if (value === '7z') return value; throw new Error('Unsupported semantic vector compression profile.'); };
const codecName = value => value === 'zip6' ? 'zip' : value;
const abort = signal => signal?.throwIfAborted();
const safeFile = value => /^vector-[a-f0-9]{64}\.(7z|zip)$/.test(value);

export function initializeVectorCatalog(db) {
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA cache_size=-4096;
    CREATE TABLE IF NOT EXISTS indexes (model TEXT PRIMARY KEY, revision TEXT NOT NULL, passages INTEGER NOT NULL, chunks INTEGER NOT NULL, updated TEXT NOT NULL, generation TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS vector_segments (model TEXT NOT NULL,generation TEXT NOT NULL,ordinal INTEGER NOT NULL,file TEXT NOT NULL,profile TEXT NOT NULL,sha256 TEXT NOT NULL,contentHash TEXT NOT NULL,expandedBytes INTEGER NOT NULL,records INTEGER NOT NULL,PRIMARY KEY(model,generation,ordinal));
    CREATE TABLE IF NOT EXISTS vector_chunks (model TEXT NOT NULL,generation TEXT NOT NULL,passage TEXT NOT NULL,part INTEGER NOT NULL,fingerprint TEXT NOT NULL,segment INTEGER NOT NULL,position INTEGER NOT NULL,PRIMARY KEY(model,generation,passage,part));`);
}

export function readVectorBlock(directory, descriptor) {
  if (!safeFile(descriptor.file) || !['zip6', '7z'].includes(descriptor.profile) || !Number.isSafeInteger(descriptor.expandedBytes) || descriptor.expandedBytes < 1 || descriptor.expandedBytes > VECTOR_BLOCK_BYTES) throw new Error('Invalid semantic vector block descriptor.');
  const target = path.join(directory, descriptor.file), stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > VECTOR_BLOCK_BYTES * 2) throw new Error('Invalid semantic vector block file.');
  const compressed = fs.readFileSync(target);
  if (hash(compressed) !== descriptor.sha256) throw new Error('Semantic vector block checksum mismatch.');
  const bytes = decodeBuffer(compressed, codecName(descriptor.profile), { maxBytes: VECTOR_BLOCK_BYTES, expectedBytes: descriptor.expandedBytes });
  if (bytes.length !== descriptor.expandedBytes || hash(bytes) !== descriptor.contentHash) throw new Error('Semantic vector block content checksum mismatch.');
  let payload; try { payload = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('Invalid semantic vector block JSON.'); }
  if (payload.format !== FORMAT || !Array.isArray(payload.rows) || payload.rows.length !== descriptor.records) throw new Error('Invalid semantic vector block records.');
  for (const row of payload.rows) {
    if (!row || typeof row.passage !== 'string' || typeof row.conversationId !== 'string' || !Number.isSafeInteger(row.turnIndex) || typeof row.role !== 'string' || !Number.isSafeInteger(row.offset) || row.offset < 0 || !Number.isSafeInteger(row.part) || row.part < 0 || !/^[a-f0-9]{64}$/.test(row.fingerprint) || typeof row.vector !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(row.vector)) throw new Error('Invalid semantic vector record.');
    const vector = Buffer.from(row.vector, 'base64');
    if (!vector.length || vector.length % 4 || vector.length > 65536 * 4) throw new Error('Invalid semantic vector dimensions.');
    for (let i = 0; i < vector.length; i += 4) if (!Number.isFinite(vector.readFloatLE(i))) throw new Error('Invalid semantic vector value.');
  }
  return payload.rows;
}

function writeBlock(directory, rows, profile) {
  const bytes = Buffer.from(JSON.stringify({ format: FORMAT, rows }));
  if (bytes.length > VECTOR_BLOCK_BYTES) throw new Error('Semantic vector block exceeded its bounded size.');
  const compressed = encodeBuffer(bytes, codecName(profile), { maxBytes: VECTOR_BLOCK_BYTES });
  const sha256 = hash(compressed), file = `vector-${sha256}.${profile === 'zip6' ? 'zip' : '7z'}`;
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, file);
  if (!fs.existsSync(target)) {
    const temporary = `${target}.${randomUUID()}.part`;
    try {
      const fd = fs.openSync(temporary, 'wx', 0o600);
      try { fs.writeFileSync(fd, compressed); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(temporary, target);
      if (process.platform !== 'win32') { const fd = fs.openSync(directory, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
    } finally { fs.rmSync(temporary, { force: true }); }
  }
  const descriptor = { file, profile, sha256, contentHash: hash(bytes), expandedBytes: bytes.length, records: rows.length };
  readVectorBlock(directory, descriptor);
  return descriptor;
}

export class VectorBlockWriter {
  constructor({ db, objectsDir, model, generation, profile = '7z', maxBytes = VECTOR_BLOCK_BYTES }) {
    Object.assign(this, { db, objectsDir, model, generation });
    this.profile = profileName(profile); this.maximum = Math.min(VECTOR_BLOCK_BYTES, Math.max(4096, maxBytes));
    this.rows = []; this.bytes = 100; this.ordinal = 0;
    this.writeChunk = db.prepare('INSERT INTO vector_chunks VALUES(?,?,?,?,?,?,?)');
    this.writeSegment = db.prepare('INSERT INTO vector_segments VALUES(?,?,?,?,?,?,?,?,?)');
  }
  add(row) {
    const size = Buffer.byteLength(JSON.stringify(row)) + 1;
    if (size + 100 > this.maximum) throw new Error('Embedding vector exceeds the configured block limit.');
    if (this.rows.length && this.bytes + size > this.maximum) this.flush();
    this.rows.push(row); this.bytes += size;
  }
  flush() {
    if (!this.rows.length) return;
    const descriptor = writeBlock(this.objectsDir, this.rows, this.profile);
    this.db.exec('BEGIN');
    try {
      this.writeSegment.run(this.model, this.generation, this.ordinal, descriptor.file, descriptor.profile, descriptor.sha256, descriptor.contentHash, descriptor.expandedBytes, descriptor.records);
      this.rows.forEach((row, position) => this.writeChunk.run(this.model, this.generation, row.passage, row.part, row.fingerprint, this.ordinal, position));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    this.ordinal++; this.rows = []; this.bytes = 100;
  }
}

export class VectorBlockReader {
  constructor(db, objectsDir) { this.db = db; this.objectsDir = objectsDir; this.cached = null; }
  rows(descriptor) {
    if (this.cached?.file !== descriptor.file) this.cached = { file: descriptor.file, rows: readVectorBlock(this.objectsDir, descriptor) };
    return this.cached.rows;
  }
  lookup(model, generation, passage, part, fingerprint) {
    const entry = this.db.prepare('SELECT * FROM vector_chunks WHERE model=? AND generation=? AND passage=? AND part=? AND fingerprint=?').get(model, generation, passage, part, fingerprint);
    if (!entry) return null;
    const descriptor = this.db.prepare('SELECT * FROM vector_segments WHERE model=? AND generation=? AND ordinal=?').get(model, generation, entry.segment);
    const row = descriptor && this.rows(descriptor)[entry.position];
    if (!row || row.passage !== passage || row.part !== part || row.fingerprint !== fingerprint) throw new Error('Semantic vector reference mismatch.');
    return row.vector;
  }
  *iterate(model, generation) {
    for (const descriptor of this.db.prepare('SELECT * FROM vector_segments WHERE model=? AND generation=? ORDER BY ordinal').iterate(model, generation)) yield* this.rows(descriptor);
    this.cached = null;
  }
  close() { this.cached = null; }
}

function withCatalog(filename, callback, writable = false) {
  if (!fs.existsSync(filename)) return undefined;
  const db = new DatabaseSync(filename, { readOnly: !writable });
  try {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='vector_segments'").get()) return undefined;
    return callback(db);
  } finally { db.close(); }
}
async function withCatalogAsync(filename, callback, writable = false) {
  if (!fs.existsSync(filename)) return undefined;
  const db = new DatabaseSync(filename, { readOnly: !writable });
  try {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='vector_segments'").get()) return undefined;
    return await callback(db);
  } finally { db.close(); }
}
export function referencedVectorObjects(filename) {
  return withCatalog(filename, db => db.prepare('SELECT DISTINCT s.file FROM vector_segments s JOIN indexes i ON i.model=s.model AND i.generation=s.generation').all().map(row => { if (!safeFile(row.file)) throw new Error('Invalid semantic vector object reference.'); return row.file; })) ?? [];
}
export async function verifyVectorCatalog(filename, objectsDir, { signal } = {}) {
  return await withCatalogAsync(filename, async db => {
    let segments = 0, chunks = 0, logicalBytes = 0;
    for (const descriptor of db.prepare('SELECT s.* FROM vector_segments s JOIN indexes i ON i.model=s.model AND i.generation=s.generation').iterate()) {
      await new Promise(resolve => setImmediate(resolve)); abort(signal); const rows = readVectorBlock(objectsDir, descriptor);
      const positions = new Set();
      for (const entry of db.prepare('SELECT * FROM vector_chunks WHERE model=? AND generation=? AND segment=?').iterate(descriptor.model, descriptor.generation, descriptor.ordinal)) {
        if (!Number.isSafeInteger(entry.position) || entry.position < 0 || positions.has(entry.position)) throw new Error('Semantic vector position reference mismatch.');
        positions.add(entry.position); const row = rows[entry.position];
        if (!row || row.passage !== entry.passage || row.part !== entry.part || row.fingerprint !== entry.fingerprint) throw new Error('Semantic vector reference mismatch.');
      }
      if (positions.size !== rows.length) throw new Error('Semantic vector block contains unreferenced records.');
      segments++; chunks += rows.length; logicalBytes += descriptor.expandedBytes;
    }
    for (const info of db.prepare('SELECT * FROM indexes').iterate()) {
      const count = db.prepare('SELECT COUNT(*) AS n FROM vector_chunks WHERE model=? AND generation=?').get(info.model, info.generation).n;
      const packs = db.prepare('SELECT COALESCE(SUM(records),0) AS n FROM vector_segments WHERE model=? AND generation=?').get(info.model, info.generation).n;
      if (count !== info.chunks || packs !== info.chunks) throw new Error('Semantic index record count mismatch.');
    }
    return { ok: true, segments, chunks, logicalBytes };
  }) ?? { ok: true, segments: 0, chunks: 0, logicalBytes: 0 };
}
export async function transcodeVectorCatalog(filename, objectsDir, targetProfile, { signal, onProgress = () => {} } = {}) {
  const profile = profileName(targetProfile);
  return await withCatalogAsync(filename, async db => {
    const descriptors = db.prepare('SELECT s.* FROM vector_segments s JOIN indexes i ON i.model=s.model AND i.generation=s.generation');
    const update = db.prepare('UPDATE vector_segments SET file=?,profile=?,sha256=?,contentHash=?,expandedBytes=?,records=? WHERE model=? AND generation=? AND ordinal=?');
    let current = 0;
    for (const descriptor of descriptors.iterate()) {
      await new Promise(resolve => setImmediate(resolve)); abort(signal); const rows = readVectorBlock(objectsDir, descriptor), converted = writeBlock(objectsDir, rows, profile);
      update.run(converted.file, converted.profile, converted.sha256, converted.contentHash, converted.expandedBytes, converted.records, descriptor.model, descriptor.generation, descriptor.ordinal);
      onProgress({ phase: 'vectors', current: ++current, message: `Converted ${current} semantic vector blocks.` });
    }
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    return { segments: current };
  }, true) ?? { segments: 0 };
}
