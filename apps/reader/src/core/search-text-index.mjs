/** Disposable search accelerator. Only compressed searchable strings and source
 * metadata live here; archive objects and their schema remain unchanged. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { conversationCreatedAt } from './conversation-date.mjs';

const CREATION_VERSION = '2'; // Explicit ThreadShelf creation alias; no Activity estimates.
const VERSION = 1, APPLICATION_ID = 0x54535431, BLOCK_BYTES = 512 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const tick = () => new Promise(resolve => setImmediate(resolve));
const abort = signal => { if (signal?.aborted) throw Object.assign(new Error('Search preparation cancelled.'), { name: 'AbortError' }); };
export const SEARCH_PERIODS = ['all', 'week', 'month', '3months', '6months', 'year', '2years', '5years'];
export function searchPeriodRange(period = 'all', now = Date.now()) {
  if (!SEARCH_PERIODS.includes(period)) throw new Error('Choose a supported search period.');
  if (period === 'all') return null;
  const end = new Date(now), start = new Date(now);
  if (!Number.isFinite(end.getTime())) throw new Error('Invalid search date.');
  if (period === 'week') start.setDate(start.getDate() - 7);
  else {
    const months = { month: 1, '3months': 3, '6months': 6, year: 12, '2years': 24, '5years': 60 }[period];
    const day = start.getDate(); start.setDate(1); start.setMonth(start.getMonth() - months);
    const last = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate(); start.setDate(Math.min(day, last));
  }
  return { start: start.getTime(), end: end.getTime() };
}
export function matchesSearchPeriod(created, range) { return !range || Number.isFinite(created) && created >= range.start && created <= range.end; }

export class SearchTextIndex {
  constructor({ store, root, onProgress = () => {} }) {
    this.store = store; this.root = root; this.path = path.join(root, 'text-v1.sqlite'); this.db = null; this.queue = Promise.resolve(); this.onProgress = onProgress;
    this.supported = typeof store._open === 'function' && typeof store.iterPassages === 'function' && Boolean(store.content?.readBlob);
    this.stats = { decodedConversations: 0, reusedConversations: 0, recovery: '' };
  }
  open() {
    if (this.db || !this.supported) return this.db;
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    const initialize = () => {
      this.db = new DatabaseSync(this.path);
      if (process.platform !== 'win32') fs.chmodSync(this.path, 0o600);
      const version = this.db.prepare('PRAGMA user_version').get().user_version;
      if (version && (version !== VERSION || this.db.prepare('PRAGMA application_id').get().application_id !== APPLICATION_ID || this.db.prepare('PRAGMA quick_check').get().quick_check !== 'ok')) throw new Error('Invalid search text cache.');
      this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON; PRAGMA cache_size=-4096; PRAGMA mmap_size=0; PRAGMA temp_store=FILE;`);
      if (!version) this.db.exec(`PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=${VERSION};
        CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE conversations(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,collection TEXT NOT NULL,provider TEXT NOT NULL,title TEXT NOT NULL,created REAL,passages INTEGER NOT NULL,ordinal INTEGER NOT NULL,seen INTEGER NOT NULL);
        CREATE INDEX conversation_dates ON conversations(created,collection,provider);
        CREATE TABLE blocks(conversation TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,part INTEGER NOT NULL,expanded INTEGER NOT NULL,checksum TEXT NOT NULL,data BLOB NOT NULL,PRIMARY KEY(conversation,part));`);
    };
    try { initialize(); }
    catch {
      this.db?.close(); this.db = null;
      for (const suffix of ['', '-journal', '-wal', '-shm']) fs.rmSync(this.path + suffix, { force: true });
      this.stats.recovery = 'rebuilt-cache'; initialize();
    }
    return this.db;
  }
  status(revision) {
    if (!this.supported) return { ready: false, needsIndexing: true, available: false, passages: 0, conversations: 0, bytes: 0 };
    this.open();
    const previous = this.db.prepare("SELECT value FROM metadata WHERE key='revision'").get()?.value;
    const counts = this.db.prepare('SELECT count(*) AS conversations,coalesce(sum(passages),0) AS passages FROM conversations').get();
    return { ready: Boolean(previous), needsIndexing: previous !== revision || this.db.prepare("SELECT value FROM metadata WHERE key='creationVersion'").get()?.value !== CREATION_VERSION, available: true, ...counts, bytes: fs.statSync(this.path).size,
      updated: this.db.prepare("SELECT value FROM metadata WHERE key='updated'").get()?.value || null, ...this.stats };
  }
  invalidate() { if (this.db) this.db.prepare("DELETE FROM metadata WHERE key='revision'").run(); }
  ensure({ signal, revision, progress } = {}) {
    const run = this.queue.then(() => this._ensure({ signal, revision, progress })); this.queue = run.catch(() => {}); return run;
  }
  async _ensure({ signal, revision = String(this.store.searchRevision()), progress = this.onProgress } = {}) {
    if (!this.supported) return false;
    abort(signal); this.open();
    const previous = this.db.prepare("SELECT value FROM metadata WHERE key='revision'").get()?.value;
    const refreshDates = this.db.prepare("SELECT value FROM metadata WHERE key='creationVersion'").get()?.value !== CREATION_VERSION;
    if (previous === revision && !refreshDates) {
      const actual = this.store._open().prepare('SELECT count(*) AS conversations,coalesce(sum(passage_count),0) AS passages FROM conversations').get();
      const indexed = this.db.prepare('SELECT count(*) AS conversations,coalesce(sum(passages),0) AS passages FROM conversations').get();
      if (actual.conversations === indexed.conversations && actual.passages === indexed.passages) return true;
    }
    let decoded = 0, reused = 0, ordinal = 0;
    const source = this.store._open(), total = source.prepare('SELECT count(*) AS n FROM conversations').get().n;
    progress({ phase: 'search-index', current: 0, total, message: 'Preparing the compact text search index.' });
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec('UPDATE conversations SET seen=0');
      const old = this.db.prepare('SELECT fingerprint,passages FROM conversations WHERE id=?');
      const metadata = this.db.prepare('UPDATE conversations SET collection=?,provider=?,title=?,ordinal=?,seen=1 WHERE id=?');
      const insert = this.db.prepare('INSERT INTO conversations VALUES (?,?,?,?,?,?,?,?,1)');
      const block = this.db.prepare('INSERT INTO blocks VALUES (?,?,?,?,?)');
      for (const row of source.prepare('SELECT id,content_hash,content_ref,collection,provider,title,passage_count FROM conversations ORDER BY rowid').iterate()) {
        abort(signal); ordinal++;
        const prior = old.get(row.id);
        if (prior?.fingerprint === row.content_hash && prior?.passages === row.passage_count) {
          metadata.run(row.collection, row.provider, row.title, ordinal, row.id); reused++;
          // R2 could miss threadCreatedAt or use an outer wrapper's date.
          // Refresh source dates from every unchanged header once so retained
          // source precedence agrees with a fresh index. Compressed search
          // blocks stay intact; message dates never supply search creation.
          if (refreshDates) {
            const ref = JSON.parse(row.content_ref), header = JSON.parse(this.store.content.readBlob(ref.header).toString('utf8'));
            this.db.prepare('UPDATE conversations SET created=? WHERE id=?').run(conversationCreatedAt(header), row.id);
          }
        }
        else {
          // The archive header carries original creation fields; SQL created_at
          // is import time and must never stand in for original creation.
          const ref = JSON.parse(row.content_ref), header = JSON.parse(this.store.content.readBlob(ref.header).toString('utf8'));
          const created = conversationCreatedAt(header);
          this.db.prepare('DELETE FROM conversations WHERE id=?').run(row.id);
          insert.run(row.id, row.content_hash, row.collection, row.provider, row.title, created, 0, ordinal);
          let parts = [], bytes = 2, part = 0, passages = 0;
          const flush = () => {
            if (!parts.length) return;
            const raw = Buffer.from('[' + parts.join(',') + ']'), packed = deflateSync(raw, { level: 6 });
            block.run(row.id, part++, raw.length, hash(raw), packed); parts = []; bytes = 2;
          };
          for (const passage of this.store.iterPassages({ conversationId: row.id })) {
            abort(signal); passages++;
            // Split unusually large messages across bounded compressed blocks,
            // preserving their exact text for the existing search scorer.
            const text = String(passage.text);
            for (let at = 0; at < text.length; at += 32768) {
              const end = Math.min(text.length, at + 32768), data = JSON.stringify([passage.id, passage.turnIndex, passage.role, text.slice(at, end), end === text.length]);
              const size = Buffer.byteLength(data);
              if (parts.length && bytes + size + 1 > BLOCK_BYTES) flush();
              parts.push(data); bytes += size + 1;
            }
            if (passages % 256 === 0) { await tick(); abort(signal); }
          }
          flush(); this.db.prepare('UPDATE conversations SET passages=? WHERE id=?').run(passages, row.id); decoded++;
        }
        if (ordinal % 8 === 0) { progress({ phase: 'search-index', current: ordinal, total, message: `Prepared ${ordinal} of ${total} conversations.` }); await tick(); }
      }
      abort(signal);
      if (String(this.store.searchRevision()) !== revision) throw new Error('The archive changed while preparing search. Please retry.');
      this.db.exec('DELETE FROM conversations WHERE seen=0');
      this.db.prepare("INSERT OR REPLACE INTO metadata VALUES ('revision',?)").run(revision);
      this.db.prepare("INSERT OR REPLACE INTO metadata VALUES ('updated',?)").run(new Date().toISOString());
      this.db.prepare("INSERT OR REPLACE INTO metadata VALUES ('creationVersion',?)").run(CREATION_VERSION);
      this.db.exec('COMMIT'); this.stats.decodedConversations = decoded; this.stats.reusedConversations = reused;
      progress({ phase: 'search-index-ready', current: total, total, message: 'Compact text search index is current.' }); return true;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  filters({ collection = 'all', provider, conversationId, periodRange } = {}) {
    const clauses = [], parameters = [];
    if (collection && collection !== 'all') { clauses.push('collection=?'); parameters.push(collection); }
    if (provider && provider !== 'all') { clauses.push('provider=?'); parameters.push(provider); }
    if (conversationId) { clauses.push('id=?'); parameters.push(conversationId); }
    if (periodRange) { clauses.push('created>=? AND created<=?'); parameters.push(periodRange.start, periodRange.end); }
    return { where: clauses.length ? 'WHERE ' + clauses.join(' AND ') : '', parameters };
  }
  count(options) { const { where, parameters } = this.filters(options); return this.db.prepare(`SELECT coalesce(sum(passages),0) AS n FROM conversations ${where}`).get(...parameters).n; }
  created(id) { return this.db?.prepare('SELECT created FROM conversations WHERE id=?').get(id)?.created ?? null; }
  *passages(options = {}) {
    const { where, parameters } = this.filters(options);
    for (const row of this.db.prepare(`SELECT id,collection,provider,title,created,passages FROM conversations ${where} ORDER BY ordinal`).iterate(...parameters)) {
      let current = null, fragments = [], part = 0, completed = 0;
      for (const block of this.db.prepare('SELECT * FROM blocks WHERE conversation=? ORDER BY part').iterate(row.id)) {
        let records;
        try {
          if (block.part !== part++) throw new Error('Missing text block.');
          if (!Number.isSafeInteger(block.expanded) || block.expanded < 2 || block.expanded > BLOCK_BYTES + 262144) throw new Error('Invalid block size.');
          const raw = inflateSync(block.data, { maxOutputLength: block.expanded });
          if (raw.length !== block.expanded || hash(raw) !== block.checksum) throw new Error('Search text checksum differs.');
          records = JSON.parse(raw.toString('utf8')); if (!Array.isArray(records)) throw new Error('Invalid text block.');
        } catch (error) { throw Object.assign(new Error('The compact search index is damaged. Prepare the search index again.', { cause: error }), { code: 'SEARCH_CACHE_CORRUPT' }); }
        for (const [id, turnIndex, role, text, last] of records) {
          if (!current) current = { id, conversationId: row.id, collection: row.collection, provider: row.provider, title: row.title, created: row.created, turnIndex, role };
          if (current.id !== id || typeof text !== 'string') throw Object.assign(new Error('Invalid compact search text sequence.'), { code: 'SEARCH_CACHE_CORRUPT' });
          fragments.push(text);
          if (last) { completed++; const passage = { ...current, text: fragments.join('') }; current = null; fragments = []; if (!options.role || options.role === 'all' || options.role === passage.role) yield passage; }
        }
      }
      if (current || completed !== row.passages) throw Object.assign(new Error('Incomplete compact search text sequence.'), { code: 'SEARCH_CACHE_CORRUPT' });
    }
  }
  discard() { this.db?.close(); this.db = null; for (const suffix of ['', '-journal', '-wal', '-shm']) fs.rmSync(this.path + suffix, { force: true }); }
  close() { this.db?.close(); this.db = null; }
}
