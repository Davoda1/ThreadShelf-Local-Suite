import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { ContentStore, contentObjects, validateContentRef } from './content-packs.mjs';
import { describeDeduplication, planDeduplication, stripDeduplicationHistory, hasDeduplicationHistory, deduplicationTurnMap } from './deduplication.mjs';
import { canonicalProvider, reliableConversationIdentity } from './conversation-identity.mjs';
import { ArchiveWorkPool } from './archive-work-pool.mjs';

const SCHEMA_VERSION = 3;
const APPLICATION_ID = 0x54534c52;
const DEFAULT_COLLECTION = 'Imported';
const sha256 = value => createHash('sha256').update(value).digest('hex');
// Match SQLite LIKE's original literal-list filter: ASCII case insensitive,
// non-ASCII case sensitive. Keyword search has its own normalized policy.
const literalFold = value => value.replace(/[A-Z]/g, letter => letter.toLowerCase());

// Object key order is not a source identity. Arrays retain source order exactly.
function stableJSON(value) {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJSON(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function scalar(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value);
}

function canonicalServerURL(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
    // A credential change is not a different server. Credentials stay in the
    // original provenance record, never in a public conversation ID.
    url.username = '';
    url.password = '';
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.href.replace(/\/$/, '');
  } catch {
    throw new TypeError('ThreadShelf provenance needs a valid HTTP(S) server URL.');
  }
}

function conversationIdentity(document) {
  const source = document.sourceIdentity;
  if (source && typeof source === 'object' && (source.serverUrl || source.kind === 'threadshelf' || source.kind === 'server')) {
    return stableJSON({
      kind: 'threadshelf',
      serverUrl: canonicalServerURL(source.serverUrl ?? source.url),
      serverCollection: scalar(source.collection),
      sourceFile: scalar(source.sourceFile, document.sourceFile),
      conversationKey: scalar(source.conversationKey, document.conversationKey),
    });
  }
  if (source && typeof source === 'string') {
    return stableJSON({ kind: 'explicit', provider: document.provider, source });
  }
  return stableJSON({
    kind: 'native', provider: document.provider,
    key: document.conversationKey || sha256(stableJSON({
      turns: document.turns, raw: document.raw ?? null,
    })),
  });
}

function parseDate(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value))) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number < 100000000000 ? number * 1000 : number) : 0;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? date : 0;
}

function latestTime(document) {
  let value = parseDate(document.lastTurnAt);
  for (const turn of document.turns) value = Math.max(value, parseDate(turn.createdAt ?? turn.created_at ?? turn.timestamp));
  return value;
}

function normalize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('A conversation must be an object.');
  if (!Array.isArray(input.turns)) throw new TypeError('A conversation must contain a turns array.');
  if (!input.turns.length) throw new TypeError('An empty conversation cannot be imported.');
  if (!input.provider || !String(input.provider).trim()) throw new TypeError('A conversation must identify its provider.');
  for (const turn of input.turns) {
    if (!turn || typeof turn !== 'object' || Array.isArray(turn)) throw new TypeError('Each conversation turn must be an object.');
    if (turn.turn_index !== undefined && (!Number.isSafeInteger(turn.turn_index) || turn.turn_index < 0)) {
      throw new TypeError('turn_index must be a non-negative safe integer when present.');
    }
  }
  // Clone before any write: circular/BigInt values fail without changing the DB.
  // Importers stringify unsafe integer IDs losslessly before reaching this layer.
  const document = stripDeduplicationHistory(JSON.parse(JSON.stringify(input)));
  document.collection = scalar(document.collection, DEFAULT_COLLECTION).trim() || DEFAULT_COLLECTION;
  document.provider = scalar(document.provider).trim().toLowerCase();
  document.sourceFile = scalar(document.sourceFile);
  document.conversationKey = scalar(document.conversationKey);
  document.title = scalar(document.title, 'Untitled conversation');
  // Electron IPC can roundtrip an existing thread. Its derived DB fields must
  // not become part of the source document or trigger a spurious update.
  for (const key of ['id', 'collectionId', 'turnCount', 'importedAt', 'updatedAt']) delete document[key];
  return document;
}

function* passageRows(document, conversationId) {
  const identities = new Map();
  let index = 0;
  for (const turn of document.turns) {
    const turnIndex = turn.turn_index ?? index;
    const contents = [];
    for (const [key, role] of [['user', 'user'], ['ai', 'ai'], ['thinking', 'thinking'], ['assistant', 'ai'], ['system', 'system'], ['tool', 'tool'], ['function', 'tool']]) {
      const sourceRole = String(turn.source_role ?? '').toLowerCase();
      const effectiveRole = role === 'ai' && ['tool', 'function', 'system'].includes(sourceRole) ? (sourceRole === 'function' ? 'tool' : sourceRole) : role;
      if (typeof turn[key] === 'string') contents.push([effectiveRole, turn[key]]);
    }
    // Be tolerant of normalized records produced outside the built-in importers.
    if (!contents.length && (typeof turn.text === 'string' || typeof turn.content === 'string')) {
      const role = turn.role === 'assistant' ? 'ai' : scalar(turn.role, 'unknown');
      contents.push([role, turn.text ?? turn.content]);
    }
    for (const [role, text] of contents) {
      if (!text.trim()) continue; // Do not renumber the later source turns.
      const key = `${turnIndex}:${role}`;
      const ordinal = identities.get(key) ?? 0;
      identities.set(key, ordinal + 1);
      yield {
        id: `${conversationId}:${turnIndex}:${role}:${ordinal}`,
        conversationId, collection: document.collection, title: document.title,
        provider: document.provider, role, turnIndex, text,
      };
    }
    index++;
  }
}

function summary(row) {
  if (!row) return null;
  const result = {
    id: row.id, collectionId: row.collection_id, collection: row.collection, sourceFile: row.source_file,
    conversationKey: row.conversation_key, title: row.title, provider: row.provider,
    turnCount: row.turn_count, importedAt: row.created_at, updatedAt: row.updated_at,
  };
  if (row.last_turn_at !== null) result.lastTurnAt = JSON.parse(row.last_turn_at);
  return result;
}

const SUMMARY_COLUMNS = 'id, collection_id, collection, source_file, conversation_key, title, provider, turn_count, last_turn_at, created_at, updated_at';

/** Persistent standalone archive; every file is inside the supplied userData directory.
 * Methods are synchronous (and await-compatible). Run imports in a worker so the
 * UI remains responsive. SQLite transactions never expose partial conversations.
 */
export class ArchiveStore {
  constructor(options) {
    const dataDir = typeof options === 'string' ? options : options?.dataDir;
    if (!dataDir || typeof dataDir !== 'string') throw new TypeError('ArchiveStore requires a dataDir.');
    this.dataDir = resolve(dataDir);
    this.path = join(this.dataDir, 'archive.sqlite');
    this.db = null;
    this.contentDir = resolve(options?.contentDir ?? join(this.dataDir, 'objects'));
    this.content = new ContentStore({ directory: this.contentDir, compression: options?.compression ?? '7z', cacheBytes: options?.cacheBytes, blockBytes: options?.blockBytes });
    this.cleanupPlan = null;
    this.workers = null;
  }

  init() {
    if (this.db) return this;
    mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') chmodSync(this.dataDir, 0o700);
    let db;
    try {
      db = new DatabaseSync(this.path);
      // Apply before opening WAL: SQLite uses the database mode for its sidecars.
      if (process.platform !== 'win32') chmodSync(this.path, 0o600);
      const appId = db.prepare('PRAGMA application_id').get().application_id;
      const version = db.prepare('PRAGMA user_version').get().user_version;
      if (appId && appId !== APPLICATION_ID) throw new Error('This database belongs to another application.');
      if (version > SCHEMA_VERSION) throw new Error('The archive was created by a newer application version.');
      if (version && version !== SCHEMA_VERSION) throw new Error('This is a 1.x archive. Version 2.0.0 uses a separate storage format; import from the original export or server. Existing files were preserved.');
      db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA temp_store=MEMORY;');
      if (version === 0) {
        db.exec(`BEGIN IMMEDIATE;
          CREATE TABLE metadata (key TEXT PRIMARY KEY, value NOT NULL);
          INSERT INTO metadata VALUES ('revision', 0);
          CREATE TABLE collections (
            id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL CHECK(length(name)>0),
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
          );
          CREATE TABLE conversations (
            id TEXT PRIMARY KEY, identity_json TEXT UNIQUE NOT NULL,
            collection_id TEXT NOT NULL REFERENCES collections(id), source_identity_json TEXT NOT NULL,
            collection TEXT NOT NULL, provider TEXT NOT NULL,
            source_file TEXT NOT NULL, conversation_key TEXT NOT NULL,
            title TEXT NOT NULL, turn_count INTEGER NOT NULL CHECK(turn_count > 0),
            passage_count INTEGER NOT NULL CHECK(passage_count >= 0),
            last_turn_at TEXT, sort_time INTEGER NOT NULL,
            content_hash TEXT NOT NULL, content_ref TEXT NOT NULL,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
          );
          CREATE INDEX conversations_collection ON conversations(collection);
          CREATE INDEX conversations_provider ON conversations(provider);
          CREATE INDEX conversations_updated ON conversations(sort_time DESC, id);
          CREATE INDEX conversations_title ON conversations(title COLLATE NOCASE, id);
          CREATE INDEX conversations_collection_id ON conversations(collection_id);
          CREATE INDEX conversations_source_identity ON conversations(collection_id,source_identity_json,content_hash);
          CREATE TABLE applied_operations (op_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, result_json TEXT NOT NULL);
          PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=${SCHEMA_VERSION};
          COMMIT;`);
      }
      // Scope derived indexes to this archive lineage as well as its content
      // revision. A restored different archive can have the same numeric count.
      db.prepare("INSERT OR IGNORE INTO metadata(key,value) VALUES ('archiveIdentity',?)").run(randomUUID());
      // Additive migration preserves the existing catalogue and journal format.
      // Provider IDs are indexed independently of a file path or server URL.
      const columns = new Set(db.prepare('PRAGMA table_info(conversations)').all().map(row => row.name));
      if (!columns.has('native_identity')) {
        db.exec("BEGIN IMMEDIATE; ALTER TABLE conversations ADD COLUMN native_identity TEXT; ALTER TABLE conversations ADD COLUMN canonical_provider TEXT NOT NULL DEFAULT ''; ALTER TABLE conversations ADD COLUMN cleanup_version INTEGER NOT NULL DEFAULT 0;");
        try {
          const update = db.prepare('UPDATE conversations SET native_identity=?,canonical_provider=? WHERE id=?');
          for (const row of db.prepare('SELECT id,provider,conversation_key FROM conversations').all())
            update.run(reliableConversationIdentity({ provider: row.provider, conversationKey: row.conversation_key }), canonicalProvider(row.provider), row.id);
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      }
      db.exec('CREATE INDEX IF NOT EXISTS conversations_native_identity ON conversations(collection_id,native_identity); CREATE INDEX IF NOT EXISTS conversations_cleanup_group ON conversations(collection_id,canonical_provider,trim(title));');
      this.db = db;
      return this;
    } catch (error) {
      try { db?.close(); } catch { /* Preserve the original initialization error. */ }
      throw new Error(`Cannot open local archive at ${this.path}: ${error.message}`, { cause: error });
    }
  }

  _open() {
    if (!this.db) throw new Error('The local archive is not open. Call init() first.');
    return this.db;
  }

  migrationInfo() { return []; }

  clearCache() { return this.content.clearCache(); }
  cacheStats() { return this.content.status(); }
  verifyContent(options = {}) { return verifyCatalog(this._open(), this.contentDir, options); }
  *contentReferences() { for (const row of this._open().prepare('SELECT content_ref FROM conversations').iterate()) yield JSON.parse(row.content_ref); }

  _contentHash(document) {
    const fingerprint = { ...document };
    for (const key of ['collection', 'collectionId', 'sourceFile', 'id', 'turnCount', 'importedAt', 'updatedAt', 'deduplicationHistory']) delete fingerprint[key];
    return sha256(stableJSON(fingerprint));
  }

  _name(value) {
    if (typeof value !== 'string') throw new TypeError('A collection name is required.');
    const name = value.trim();
    if (!name || name.length > 200 || /[\u0000-\u001f\u007f]/u.test(name)) throw new TypeError('Use a collection name of 1–200 characters without control characters.');
    if (name === 'all') throw new TypeError('The collection name “all” is reserved for the All collections filter.');
    return name;
  }

  _collection(value, required = true, byName = false) {
    const row = typeof value !== 'string' ? null : byName
      ? this._open().prepare('SELECT * FROM collections WHERE name=?').get(value)
      : this._open().prepare('SELECT * FROM collections WHERE id=? OR name=? ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END LIMIT 1').get(value, value, value);
    if (!row && required) throw new Error('The selected collection is no longer present. Refresh the Database Manager.');
    return row ? { ...row } : null;
  }

  _record(kind, args = {}) {
    const revision = this.revision();
    if (args.expectedRevision !== undefined && args.expectedRevision !== revision) throw new Error('The local archive changed after the preview. Review the selection and try again.');
    return { version: 1, kind, opId: randomUUID(), baseRevision: revision, at: new Date().toISOString() };
  }

  _workPool() {
    return this.workers ||= new ArchiveWorkPool(this.contentDir, { compression: this.content.compression, blockBytes: this.content.blockBytes });
  }

  _upsertContext(input, options = {}) {
    const document = normalize(input), record = this._record('upsert');
    let collection = input.collectionId ? this._collection(input.collectionId) : this._collection(document.collection, false, true);
    if (!collection) collection = { id: `collection:${randomUUID()}`, name: this._name(document.collection), create: true };
    document.collection = collection.name;
    const provider = canonicalProvider(document.provider), nativeIdentity = reliableConversationIdentity(document);
    const sourceIdentity = conversationIdentity(document), contentHash = this._contentHash(document), rows = new Map();
    const columns = `${SUMMARY_COLUMNS},native_identity,cleanup_version,content_hash,content_ref,source_identity_json`;
    if (nativeIdentity) for (const row of this._open().prepare(`SELECT ${columns} FROM conversations WHERE collection_id=? AND native_identity=? ORDER BY created_at,id`).all(collection.id, nativeIdentity)) rows.set(row.id, row);
    // Provenance is only a fallback when a provider supplies no usable native ID.
    if (!nativeIdentity && provider !== 'venice') for (const row of this._open().prepare(`SELECT ${columns} FROM conversations WHERE collection_id=? AND source_identity_json=? ORDER BY created_at,id`).all(collection.id, sourceIdentity)) rows.set(row.id, row);
    if (provider === 'venice' || provider === 'grok') for (const row of this._open().prepare(`SELECT ${columns} FROM conversations WHERE collection_id=? AND canonical_provider=? AND trim(title)=? ORDER BY created_at,id`).all(collection.id, provider, document.title.trim())) rows.set(row.id, row);
    const candidates = [...rows.values()];
    const exact = candidates.length === 1 && candidates[0].content_hash === contentHash && candidates[0].cleanup_version === 1 && provider !== 'grok' && !options.deletePromptOnly ? candidates[0] : null;
    return { document, record, collection, provider, nativeIdentity, sourceIdentity, contentHash, candidates, options,
      immediate: exact ? { ...record, collection, sourceIdentity, contentHash, id: exact.id, previousId: exact.id, unchanged: true, summary: summary(exact), deduplication: { duplicates: 0, promptOnly: 0, superseded: 0, removed: 0 } } : null };
  }

  _upsertSelection(context, descriptions) {
    const { document, record, collection, nativeIdentity, sourceIdentity, provider, candidates, options } = context;
    const incoming = descriptions.at(-1);
    // Legacy records without a provider ID retain R12's exact source identity
    // update behavior. Venice deliberately never takes that fallback.
    if (!nativeIdentity && provider !== 'venice') {
      incoming.identity = `source:${sourceIdentity}`;
      for (let i = 0; i < candidates.length; i++) if (candidates[i].source_identity_json === sourceIdentity && !descriptions[i].identity)
        descriptions[i].identity = incoming.identity;
    }
    const plan = planDeduplication(descriptions, { deletePromptOnly: options.deletePromptOnly === true });
    const incomingRemoval = plan.find(entry => entry.remove.id === incoming.id);
    const winner = incomingRemoval ? incomingRemoval.keep : incoming;
    const related = plan.filter(entry => entry.remove.id !== incoming.id && (!entry.keep || winner && entry.keep.id === winner.id));
    const winnerRow = winner && candidates.find(row => row.id === winner.id);
    const previous = winnerRow || (winner ? candidates.find(row => nativeIdentity && row.native_identity === nativeIdentity)
      || candidates.find(row => related.some(entry => entry.keep && entry.remove.id === row.id)) : null);
    const survivorId = winner ? previous?.id || `local:${randomUUID()}` : null;
    const removeIds = related.map(entry => entry.remove.id).filter(id => id !== survivorId);
    const remap = {}, turnRemap = {};
    for (const entry of related) if (entry.keep && survivorId) {
      if (entry.remove.id !== survivorId) remap[entry.remove.id] = survivorId;
      turnRemap[entry.remove.id] = deduplicationTurnMap(entry.remove, winner);
    }
    if (previous && winner) {
      const before = descriptions.find(item => item.id === previous.id);
      turnRemap[previous.id] = deduplicationTurnMap(before, winner);
    }
    const discarded = incomingRemoval ? 1 : 0;
    const promptOnly = related.filter(entry => !entry.keep).length + (incomingRemoval && !winner ? 1 : 0);
    const superseded = related.filter(entry => entry.reason === 'grok-superseded').length + (incomingRemoval?.reason === 'grok-superseded' ? 1 : 0);
    const duplicates = related.filter(entry => entry.keep).length + (incomingRemoval?.keep ? 1 : 0);
    // Updating the retained local row also removes its superseded payload; it
    // must be counted even though keeping that row ID preserves bookmarks.
    const deduplication = { duplicates, promptOnly, superseded, removed: related.length + discarded, discarded };
    return { ...context, winner, winnerRow, previous, survivorId, removeIds, remap, turnRemap, deduplication,
      skip: !winner, description: incoming,
      mutation: { ...record, collection, id: survivorId, previousId: previous?.id || null, removeIds, remap, turnRemap, deduplication, conflict: false } };
  }

  _finishUpsert(selection, document, contentRef) {
    const { mutation, previous, removeIds } = selection;
    if (!document) return { ...mutation, skip: true, unchanged: !removeIds.length, summary: null };
    document = normalize(document); document.collection = selection.collection.name;
    const contentHash = this._contentHash(document);
    let passageCount = 0; for (const ignored of passageRows(document, 'count')) passageCount++;
    const metadata = { provider: document.provider, sourceFile: document.sourceFile, conversationKey: document.conversationKey,
      title: document.title, turnCount: document.turns.length, lastTurnAt: document.lastTurnAt, sortTime: latestTime(document), passageCount };
    return { ...mutation, document: metadata, contentRef, sourceIdentity: conversationIdentity(document), contentHash,
      nativeIdentity: reliableConversationIdentity(document), unchanged: previous?.content_hash === contentHash && previous.cleanup_version === 1 && !removeIds.length,
      summary: previous ? summary(previous) : null };
  }

  prepareUpsert(input, options = {}) {
    const context = this._upsertContext(input, options); if (context.immediate) return context.immediate;
    const documents = context.candidates.map(row => this.content.readDocument(JSON.parse(row.content_ref)));
    const descriptions = documents.map((doc, index) => describeDeduplication(doc, summary(context.candidates[index])));
    descriptions.push(describeDeduplication(context.document, { id: '__incoming__', collectionId: context.collection.id, importedAt: context.record.at, updatedAt: context.record.at }));
    const selection = this._upsertSelection(context, descriptions);
    if (selection.skip) return this._finishUpsert(selection, null, null);
    const document = normalize(selection.winner.id === '__incoming__' ? context.document : documents[context.candidates.findIndex(row => row.id === selection.winner.id)]);
    const hash = this._contentHash(document);
    const contentRef = selection.previous?.content_hash === hash && selection.previous.cleanup_version === 1
      ? JSON.parse(selection.previous.content_ref) : this.content.writeDocument(document);
    return this._finishUpsert(selection, document, contentRef);
  }

  async prepareUpsertAsync(input, options = {}) {
    options.signal?.throwIfAborted();
    const context = this._upsertContext(input, options); if (context.immediate) return context.immediate;
    const pool = this._workPool();
    const descriptions = [];
    // Each worker handles at most one bounded document at a time. Queue no raw
    // archive bodies: existing records are passed as immutable references.
    for (let start = 0; start < context.candidates.length; start += pool.concurrency) {
      const batch = context.candidates.slice(start, start + pool.concurrency);
      const values = await Promise.all(batch.map(row => pool.run({ kind: 'describe', contentRef: JSON.parse(row.content_ref), row: summary(row) }, options)));
      descriptions.push(...values.map(value => value.description));
    }
    descriptions.push((await pool.run({ kind: 'describe', document: context.document,
      row: { id: '__incoming__', collectionId: context.collection.id, importedAt: context.record.at, updatedAt: context.record.at } }, options)).description);
    const selection = this._upsertSelection(context, descriptions);
    if (selection.skip) return this._finishUpsert(selection, null, null);
    const document = normalize(selection.winner.id === '__incoming__' ? context.document
      : await pool.run({ kind: 'read', contentRef: JSON.parse(selection.winnerRow.content_ref) }, options));
    const hash = this._contentHash(document);
    let contentRef;
    if (selection.previous?.content_hash === hash && selection.previous.cleanup_version === 1) contentRef = JSON.parse(selection.previous.content_ref);
    else {
      const expandedBytes = Buffer.byteLength(JSON.stringify(document));
      await options.beforeWrite?.({ expandedBytes, sourceFile: document.sourceFile });
      contentRef = await pool.run({ kind: 'write', document, estimatedBytes: expandedBytes }, options);
    }
    options.signal?.throwIfAborted();
    if (this.revision() !== context.record.baseRevision) throw new Error('The local archive changed during import. Retry the operation.');
    return this._finishUpsert(selection, document, contentRef);
  }

  _selection(args) {
    const db = this._open();
    const selection = args.selection && typeof args.selection === 'object' ? args.selection : {};
    const ids = args.ids ?? selection.ids;
    if (ids !== undefined) {
      if (!Array.isArray(ids) || ids.length > 1000000 || ids.some(id => typeof id !== 'string' || id.length > 512)) throw new TypeError('Conversation IDs must be a bounded array of strings.');
      const unique = [...new Set(ids)];
      const exists = db.prepare('SELECT id FROM conversations WHERE id=?');
      if (unique.some(id => !exists.get(id))) throw new Error('One or more selected conversations are no longer present. Refresh the selection.');
      return unique;
    }
    if (!(args.allMatching || selection.allMatching)) throw new TypeError('Select conversations or explicitly select all matching results.');
    const filters = { ...(args.filters || {}), ...selection };
    const collectionId = filters.collectionId ?? args.collectionId;
    const collection = filters.collection ?? args.collection;
    const clauses = [];
    const values = [];
    if (collectionId || collection && collection !== 'all') {
      clauses.push('c.collection_id=?'); values.push(this._collection(collectionId || collection).id);
    }
    const provider = filters.provider ?? args.provider;
    if (provider && provider !== 'all') { clauses.push('c.provider=?'); values.push(String(provider).toLowerCase()); }
    const query = filters.query ?? filters.q ?? args.query ?? args.q ?? '';
    if (typeof query !== 'string' || query.length > 10000) throw new TypeError('The selection filter is too long.');
    const rows = db.prepare(`SELECT c.id,c.title,c.source_file,c.content_ref FROM conversations c ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY c.id`).iterate(...values);
    const queryText = literalFold(query.trim());
    const matching = this._matchingRows(rows, queryText);
    return this._boundedIds(matching);
  }

  *_matchingRows(rows, queryText) {
    for (const row of rows) {
      if (!queryText || literalFold(row.title).includes(queryText) || literalFold(row.source_file).includes(queryText)) { yield row; continue; }
      const document = { turns: this.content.iterateTurns(JSON.parse(row.content_ref)), collection: '', title: '', provider: '' };
      for (const passage of passageRows(document, row.id)) {
        if (literalFold(passage.text).includes(queryText)) { yield row; break; }
      }
    }
  }

  _boundedIds(rows, result = []) {
    for (const row of rows) {
      if (result.length >= 1000000) throw new RangeError('This operation exceeds 1,000,000 conversations. Use smaller selections or narrower filters.');
      result.push(row.id);
    }
    return result;
  }

  prepareMutation(args = {}) {
    const record = this._record('manage', args);
    const action = args.action ?? args.operation ?? args.type;
    if (!['create', 'rename', 'move', 'copy', 'merge', 'deleteConversations', 'deleteCollection', 'clear'].includes(action)) throw new TypeError('Unknown Database Manager operation.');
    record.action = action;
    record.removedCollections = [];
    record.ids = [];
    if (action === 'create' || action === 'rename') {
      record.name = this._name(args.name);
      if (action === 'rename') record.collectionId = this._collection(args.collectionId ?? args.collection).id;
      const existing = this._collection(record.name, false, true);
      if (existing && existing.id !== record.collectionId) throw new Error('A collection with this name already exists.');
      if (action === 'create') record.collectionId = `collection:${randomUUID()}`;
    }
    if (['move', 'copy', 'merge'].includes(action) || action === 'deleteCollection' && (args.targetId || args.targetName || args.targetCollection)) {
      if (args.targetId || args.targetCollection) record.target = this._collection(args.targetId ?? args.targetCollection);
      else {
        const name = this._name(args.targetName);
        record.target = this._collection(name, false, true) ?? { id: `collection:${randomUUID()}`, name, create: true };
      }
    }
    if (['move', 'copy', 'deleteConversations'].includes(action)) record.ids = this._selection(args);
    if (action === 'merge') {
      if (!Array.isArray(args.collectionIds) || !args.collectionIds.length || args.collectionIds.length > 100000 || args.collectionIds.some(id => typeof id !== 'string')) throw new TypeError('Select the collections to merge.');
      record.collectionIds = [...new Set(args.collectionIds.map(id => this._collection(id).id))];
      const select = this._open().prepare('SELECT id FROM conversations WHERE collection_id=? ORDER BY id');
      for (const id of record.collectionIds) if (id !== record.target.id) this._boundedIds(select.iterate(id), record.ids);
      if (args.removeEmpty !== false && args.deleteSources !== false && args.keepEmpty !== true) record.removedCollections = record.collectionIds.filter(id => id !== record.target.id);
    }
    if (action === 'deleteCollection') {
      record.collectionId = this._collection(args.collectionId ?? args.collection).id;
      if (record.target?.id === record.collectionId) throw new Error('Choose a different destination collection.');
      record.ids = this._boundedIds(this._open().prepare('SELECT id FROM conversations WHERE collection_id=? ORDER BY id LIMIT 1000001').iterate(record.collectionId));
      record.removedCollections = [record.collectionId];
    }
    if (action === 'clear') {
      record.count = this._open().prepare('SELECT count(*) AS count FROM conversations').get().count;
      record.collectionCount = this._open().prepare('SELECT count(*) AS count FROM collections').get().count;
      record.clearAll = true;
    }
    if (action === 'copy') {
      record.copyIds = Object.fromEntries(record.ids.map(id => [id, `local:${randomUUID()}`]));
      record.copyBookmarks = args.copyBookmarks === true;
    }
    return record;
  }

  previewMutation(args = {}) {
    if ((args.action ?? args.operation) === 'deduplicate') return this.previewDeduplication(args);
    const record = this.prepareMutation(args);
    let duplicates = 0;
    let conflicts = 0;
    if (record.target) {
      const seen = new Map();
      for (const row of this._open().prepare('SELECT id,source_identity_json,content_hash FROM conversations WHERE collection_id=?').all(record.target.id)) {
        if (!seen.has(row.source_identity_json)) seen.set(row.source_identity_json, new Set());
        seen.get(row.source_identity_json).add(row.content_hash);
      }
      const source = this._open().prepare('SELECT collection_id,source_identity_json,content_hash FROM conversations WHERE id=?');
      for (const id of record.ids) {
        const row = source.get(id);
        if (row.collection_id === record.target.id) continue;
        const hashes = seen.get(row.source_identity_json);
        if (hashes?.has(row.content_hash)) duplicates++;
        else {
          if (hashes?.size) conflicts++;
          if (!hashes) seen.set(row.source_identity_json, new Set([row.content_hash]));
          else hashes.add(row.content_hash);
        }
      }
    }
    return { action: record.action, count: record.count ?? record.ids.length, collectionCount: record.collectionCount, duplicates, conflicts,
      removedCollections: record.removedCollections, revision: record.baseRevision, target: record.target ?? null };
  }

  manage(args = {}) {
    return this.applyMutation(args.kind === 'manage' && args.opId ? args : (args.action ?? args.operation) === 'deduplicate' ? this.prepareDeduplication(args) : this.prepareMutation(args));
  }

  _cleanupScope(args = {}) {
    this._record('manage', args);
    let collections;
    if (args.collectionIds !== undefined) {
      if (!Array.isArray(args.collectionIds) || args.collectionIds.length > 100000 || args.collectionIds.some(id => typeof id !== 'string')) throw new TypeError('Deduplication needs valid collection IDs.');
      collections = [...new Set(args.collectionIds.map(id => this._collection(id).id))].sort();
    } else if (args.collectionId || args.collection && args.collection !== 'all') collections = [this._collection(args.collectionId || args.collection).id];
    const key = stableJSON({ collections: collections ?? null, deletePromptOnly: args.deletePromptOnly === true });
    const revision = this.revision();
    if (this.cleanupPlan?.revision === revision && this.cleanupPlan.key === key) return { cached: this.cleanupPlan };
    const clauses = collections?.length && collections.length < 900 ? ` WHERE collection_id IN (${collections.map(() => '?').join(',')})` : '';
    const selected = collections ? new Set(collections) : null;
    const rows = collections && !collections.length ? [] : this._open().prepare(`SELECT ${SUMMARY_COLUMNS},native_identity,canonical_provider,cleanup_version,source_identity_json,content_ref FROM conversations${clauses} ORDER BY collection_id,id`).all(...(clauses ? collections : []))
      .filter(row => !selected || selected.has(row.collection_id));
    // Only connected identity/content groups can interact. Unique, already
    // repaired stable-ID conversations do not need body decompression again.
    const parent = rows.map((_, i) => i), identities = new Map(), contentGroups = new Map(), unresolved = new Map();
    const find = value => { while (parent[value] !== value) { parent[value] = parent[parent[value]]; value = parent[value]; } return value; };
    const unite = (map, key, index) => { if (map.has(key)) parent[find(index)] = find(map.get(key)); else map.set(key, index); };
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i], provider = row.canonical_provider || canonicalProvider(row.provider);
      const identity = row.native_identity || (provider !== 'venice' ? `source:${row.source_identity_json}` : null);
      if (identity) unite(identities, stableJSON([row.collection_id, identity]), i);
      if (!row.native_identity && provider !== 'venice') unite(unresolved, stableJSON([row.collection_id, provider]), i);
      if (provider === 'venice' || provider === 'grok') unite(contentGroups, stableJSON([row.collection_id, provider, row.title.trim()]), i);
    }
    const components = new Map();
    rows.forEach((row, index) => { const key = find(index); if (!components.has(key)) components.set(key, []); components.get(key).push(row); });
    const groups = [...components.values()].filter(group => group.length > 1 || group.some(row => row.cleanup_version !== 1 || canonicalProvider(row.provider) === 'grok') || args.deletePromptOnly === true);
    return { key, revision, scanned: rows.length, groups, inspectCount: groups.reduce((n, group) => n + group.length, 0) };
  }

  _selectCleanupPlan(plan, args) {
    if (args.ids === undefined) return plan;
    if (!Array.isArray(args.ids) || args.ids.length > 1000000 || args.ids.some(id => typeof id !== 'string')) throw new TypeError('Select valid cleanup candidates.');
    const selected = new Set(args.ids), eligible = new Set([...plan.entries.map(entry => entry.remove.id), ...plan.historyEntries.map(entry => entry.id)]);
    if ([...selected].some(id => !eligible.has(id))) throw new Error('A selected cleanup candidate changed. Review the list again.');
    return { ...plan, entries: plan.entries.filter(entry => selected.has(entry.remove.id)), historyEntries: plan.historyEntries.filter(entry => selected.has(entry.id)) };
  }

  _finishCleanupPlan(scope, entries, histories, inspectedIds) {
    const removed = new Set(entries.map(entry => entry.remove.id));
    const plan = { key: scope.key, revision: scope.revision, scanned: scope.scanned, entries,
      historyEntries: histories.filter(item => !removed.has(item.id)), historyBearingIds: histories.map(item => item.id), inspectedIds };
    this.cleanupPlan = plan; return plan;
  }

  _deduplicationPlan(args = {}) {
    const scope = this._cleanupScope(args); if (scope.cached) return this._selectCleanupPlan(scope.cached, args);
    const entries = [], histories = [], inspectedIds = [];
    for (const group of scope.groups) {
      const descriptions = group.map(row => {
        const document = this.content.readDocument(JSON.parse(row.content_ref)), description = describeDeduplication(document, summary(row));
        if (!description.identity && canonicalProvider(row.provider) !== 'venice') description.identity = `source:${row.source_identity_json}`;
        if (hasDeduplicationHistory(document)) histories.push(description);
        inspectedIds.push(row.id); return description;
      });
      entries.push(...planDeduplication(descriptions, { deletePromptOnly: args.deletePromptOnly === true }));
    }
    return this._selectCleanupPlan(this._finishCleanupPlan(scope, entries, histories, inspectedIds), args);
  }

  async _deduplicationPlanAsync(args = {}, options = {}) {
    options.signal?.throwIfAborted();
    const scope = this._cleanupScope(args);
    if (scope.cached) { options.onProgress?.({ phase: 'deduplicating', current: scope.cached.scanned, total: scope.cached.scanned, message: 'Review ready' }); return this._selectCleanupPlan(scope.cached, args); }
    const pool = this._workPool(), entries = [], histories = [], inspectedIds = [];
    let current = scope.scanned - scope.inspectCount, next = 0;
    const progress = () => options.onProgress?.({ phase: 'deduplicating', current, total: scope.scanned, message: 'Reviewing conversations' });
    progress();
    const consume = async () => {
      while (next < scope.groups.length) {
        const group = scope.groups[next++], descriptions = [];
        for (let start = 0; start < group.length; start += pool.concurrency) {
          options.signal?.throwIfAborted();
          const batch = group.slice(start, start + pool.concurrency);
          const values = await Promise.all(batch.map(row => pool.run({ kind: 'describe', contentRef: JSON.parse(row.content_ref), row: summary(row) }, options)));
          for (let i = 0; i < batch.length; i++) {
            const row = batch[i], value = values[i];
            if (!value.description.identity && canonicalProvider(row.provider) !== 'venice') value.description.identity = `source:${row.source_identity_json}`;
            descriptions.push(value.description);
            if (value.hasHistory) histories.push(value.description);
            inspectedIds.push(row.id); current++; progress();
          }
        }
        entries.push(...planDeduplication(descriptions, { deletePromptOnly: args.deletePromptOnly === true }));
      }
    };
    await Promise.all(Array.from({ length: Math.min(pool.concurrency, scope.groups.length) }, consume));
    options.signal?.throwIfAborted();
    if (this.revision() !== scope.revision) throw new Error('The local archive changed during review. Review the collection again.');
    progress();
    return this._selectCleanupPlan(this._finishCleanupPlan(scope, entries, histories, inspectedIds), args);
  }

  _deduplicationPreview(plan) {
    const describe = (remove, keep, reason, historyOnly = false) => ({
      id: remove.id, title: remove.title, provider: remove.provider, model: remove.model, collection: remove.collection, collectionId: remove.collectionId,
      sourceFile: remove.sourceFile, importedAt: remove.importedAt, turnCount: remove.events.length,
      snippet: remove.events.at(-1)?.text.slice(0, 260) || '', reason, ...(historyOnly ? { historyOnly: true } : {}),
      keepId: keep?.id || null, keepTitle: keep?.title || '', keepTurnCount: keep?.events.length || 0,
      keepSnippet: keep?.events.at(-1)?.text.slice(0, 260) || '', keepSourceFile: keep?.sourceFile || '',
    });
    const entries = plan.entries.map(({ remove, keep, reason }) => describe(remove, keep, reason));
    entries.push(...plan.historyEntries.map(item => describe(item, item, 'stored-history', true)));
    return { action: 'deduplicate', revision: plan.revision, scanned: plan.scanned, count: entries.length,
      duplicates: plan.entries.filter(entry => entry.keep).length,
      superseded: plan.entries.filter(entry => entry.reason === 'grok-superseded').length,
      promptOnly: plan.entries.filter(entry => !entry.keep).length, historyRecords: plan.historyEntries.length, entries, truncated: false };
  }

  previewDeduplication(args = {}) { return this._deduplicationPreview(this._deduplicationPlan(args)); }
  async previewDeduplicationAsync(args = {}, options = {}) { return this._deduplicationPreview(await this._deduplicationPlanAsync(args, options)); }

  _cleanupMutation(args, plan) {
    const record = this._record('manage', args), preview = this._deduplicationPreview(plan), remap = {}, turnRemap = {};
    for (const entry of plan.entries) if (entry.keep) {
      remap[entry.remove.id] = entry.keep.id; turnRemap[entry.remove.id] = deduplicationTurnMap(entry.remove, entry.keep);
    }
    // Reuse the reviewed plan. No loser body is read or copied into a winner.
    const historyIds = new Set(plan.historyEntries.map(item => item.id));
    const allHistories = new Set((this.cleanupPlan?.historyEntries || []).map(item => item.id));
    for (const entry of plan.entries) if (entry.keep && allHistories.has(entry.keep.id)) historyIds.add(entry.keep.id);
    const removedIds = plan.entries.map(entry => entry.remove.id), removed = new Set(removedIds);
    const pendingHistory = new Set(plan.historyBearingIds.filter(id => !historyIds.has(id) && !removed.has(id)));
    return { ...record, action: 'deduplicate', ids: removedIds, historyIds: [...historyIds], inspectedIds: plan.inspectedIds.filter(id => !pendingHistory.has(id)),
      replacements: [], remap, turnRemap, removedCollections: [], preview };
  }

  _cleanupReplacement(id, document, contentRef) {
    const previous = this._open().prepare('SELECT * FROM conversations WHERE id=?').get(id);
    if (!previous) throw new Error('A retained conversation changed. Review cleanup again.');
    let passageCount = 0; for (const ignored of passageRows(document, id)) passageCount++;
    return { id, collection: this._collection(previous.collection_id), sourceIdentity: previous.source_identity_json,
      nativeIdentity: reliableConversationIdentity(document), contentHash: this._contentHash(document), contentRef,
      document: { provider: document.provider, sourceFile: document.sourceFile, conversationKey: document.conversationKey,
        title: document.title, turnCount: document.turns.length, lastTurnAt: document.lastTurnAt, sortTime: latestTime(document), passageCount } };
  }

  prepareDeduplication(args = {}) {
    const record = this._cleanupMutation(args, this._deduplicationPlan(args));
    for (const id of record.historyIds) {
      const document = normalize(this.thread({ id }));
      record.replacements.push(this._cleanupReplacement(id, document, this.content.writeDocument(document)));
    }
    return record;
  }

  async prepareDeduplicationAsync(args = {}, options = {}) {
    const plan = await this._deduplicationPlanAsync(args, options), record = this._cleanupMutation(args, plan), pool = this._workPool();
    for (let index = 0; index < record.historyIds.length; index++) {
      options.signal?.throwIfAborted(); const id = record.historyIds[index];
      const row = this._open().prepare('SELECT content_ref FROM conversations WHERE id=?').get(id);
      const document = normalize(await pool.run({ kind: 'read', contentRef: JSON.parse(row.content_ref) }, options));
      const expandedBytes = Buffer.byteLength(JSON.stringify(document));
      await options.beforeWrite?.({ expandedBytes, sourceFile: document.sourceFile });
      const contentRef = await pool.run({ kind: 'write', document, estimatedBytes: expandedBytes }, options);
      record.replacements.push(this._cleanupReplacement(id, document, contentRef));
      options.onProgress?.({ phase: 'deduplicating', current: index + 1, total: record.historyIds.length, message: 'Removing stored superseded copies' });
    }
    options.signal?.throwIfAborted();
    if (this.revision() !== record.baseRevision) throw new Error('The local archive changed after the review. Review cleanup again.');
    return record;
  }

  applyMutation(record) {
    const db = this._open();
    if (!record || record.version !== 1 || !['upsert', 'manage'].includes(record.kind) || typeof record.opId !== 'string' || !record.opId || record.opId.length > 200 || !Number.isSafeInteger(record.baseRevision)) throw new TypeError('Unsupported or malformed archive mutation record.');
    db.exec('BEGIN IMMEDIATE');
    try {
      const applied = db.prepare('SELECT result_json FROM applied_operations WHERE op_id=?').get(record.opId);
      if (applied) { db.exec('COMMIT'); return JSON.parse(applied.result_json); }
      if (this.revision() !== record.baseRevision) throw new Error('The local archive changed before this operation could be applied. Refresh and retry.');
      const result = record.kind === 'upsert' ? this._applyUpsert(record) : this._applyManager(record);
      if (result.changed) db.prepare("UPDATE metadata SET value=value+1 WHERE key='revision'").run();
      result.revision = this.revision();
      db.prepare('INSERT INTO applied_operations VALUES (?,?,?)').run(record.opId, result.revision, JSON.stringify(result));
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* Original error remains actionable. */ }
      throw error;
    }
  }

  _ensureCollection(collection, at) {
    if (collection.create) this._open().prepare('INSERT INTO collections VALUES (?,?,?,?)').run(collection.id, collection.name, at, at);
  }

  _insertDocument({ id, collection, document, contentRef, sourceIdentity, contentHash, nativeIdentity, at, previous }) {
    const db = this._open();
    validateContentRef(contentRef);
    this.content.assertPresent(contentRef);
    if (document.turnCount !== contentRef.turnCount) throw new Error('Mutation metadata and content turn counts differ.');
    db.prepare(`INSERT INTO conversations
      (id,identity_json,collection_id,source_identity_json,collection,provider,source_file,conversation_key,title,turn_count,passage_count,last_turn_at,sort_time,content_hash,content_ref,created_at,updated_at,native_identity,canonical_provider,cleanup_version)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        collection_id=excluded.collection_id,source_identity_json=excluded.source_identity_json,
        collection=excluded.collection,provider=excluded.provider,source_file=excluded.source_file,
        conversation_key=excluded.conversation_key,title=excluded.title,turn_count=excluded.turn_count,
        passage_count=excluded.passage_count,last_turn_at=excluded.last_turn_at,sort_time=excluded.sort_time,content_hash=excluded.content_hash,
        content_ref=excluded.content_ref,updated_at=excluded.updated_at,native_identity=excluded.native_identity,
        canonical_provider=excluded.canonical_provider,cleanup_version=excluded.cleanup_version
    `).run(id, previous?.identity_json ?? stableJSON({ localId: id }), collection.id, sourceIdentity,
      collection.name, document.provider, document.sourceFile, document.conversationKey, document.title,
      document.turnCount, document.passageCount, document.lastTurnAt === undefined ? null : JSON.stringify(document.lastTurnAt),
      document.sortTime, contentHash, JSON.stringify(contentRef), previous?.created_at ?? at, at,
      nativeIdentity ?? reliableConversationIdentity(document), canonicalProvider(document.provider), 1);
  }

  _applyUpsert(record) {
    const db = this._open();
    const previous = db.prepare('SELECT * FROM conversations WHERE id=?').get(record.id);
    const same = previous?.content_hash === record.contentHash && previous?.cleanup_version === 1;
    if (!record.skip && !same) {
      this._ensureCollection(record.collection, record.at);
      this._insertDocument({ ...record, previous });
    }
    const removedIds = [];
    for (const id of record.removeIds || []) {
      if (id === record.id) throw new Error('Cleanup cannot delete its retained conversation.');
      const row = db.prepare('SELECT collection_id FROM conversations WHERE id=?').get(id);
      if (!row || row.collection_id !== record.collection.id) throw new Error('An imported cleanup candidate changed collection.');
      db.prepare('DELETE FROM conversations WHERE id=?').run(id); removedIds.push(id);
    }
    return { status: record.skip || same && !removedIds.length ? 'skipped' : previous ? 'updated' : 'imported', conflict: false,
      summary: record.skip ? null : summary(db.prepare(`SELECT ${SUMMARY_COLUMNS} FROM conversations WHERE id=?`).get(record.id)),
      changed: !record.skip && !same || removedIds.length > 0, removedIds, remap: record.remap || {}, turnRemap: record.turnRemap || {},
      deduplication: record.deduplication || { duplicates: 0, promptOnly: 0, superseded: 0, removed: 0 } };
  }

  _setCollection(id, target, at) {
    this._open().prepare('UPDATE conversations SET collection_id=?,collection=?,updated_at=? WHERE id=?').run(target.id, target.name, at, id);
  }

  _copyConversation(row, id, collection, at) {
    // Payload references are immutable and deliberately independent of membership.
    // Copying a conversation changes its logical ID; its content stays shared.
    const columns = Object.keys(row), values = { ...row, id, identity_json: stableJSON({ localId: id }),
      collection_id: collection.id, collection: collection.name, created_at: at, updated_at: at };
    this._open().prepare(`INSERT INTO conversations (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...columns.map(name => values[name]));
  }

  _applyManager(record) {
    const db = this._open();
    const result = { operation: record.action, count: record.count ?? record.ids.length, moved: 0, copied: 0,
      duplicates: 0, conflicts: 0, removedIds: [], remap: {}, copies: {},
      copyBookmarks: record.copyBookmarks === true, removedCollections: record.removedCollections, changed: false };
    if (record.action === 'deduplicate') {
      const seen = new Set(record.ids);
      for (const replacement of record.replacements || []) {
        if (seen.has(replacement.id)) throw new Error('Deduplication cannot remove its retained conversation.');
        const previous = db.prepare('SELECT * FROM conversations WHERE id=?').get(replacement.id);
        if (!previous || previous.collection_id !== replacement.collection.id) throw new Error('A retained conversation changed. Review cleanup again.');
        this._insertDocument({ ...replacement, previous, at: record.at });
      }
      for (const id of record.ids) {
        const row = db.prepare('SELECT collection_id,provider FROM conversations WHERE id=?').get(id);
        if (!row) throw new Error('A cleanup candidate is no longer present. Review cleanup again.');
        const targetId = record.remap?.[id];
        if (targetId) {
          const target = db.prepare('SELECT collection_id,provider FROM conversations WHERE id=?').get(targetId);
          if (!target || target.collection_id !== row.collection_id) throw new Error('Deduplication cannot cross collection boundaries.');
        }
        db.prepare('DELETE FROM conversations WHERE id=?').run(id);
      }
      const inspected = db.prepare('UPDATE conversations SET cleanup_version=1 WHERE id=?');
      for (const id of record.inspectedIds || []) inspected.run(id);
      return { ...result, ...record.preview, operation: 'deduplicate', removedIds: [...record.ids],
        remap: record.remap || {}, turnRemap: record.turnRemap || {}, recordsChanged: record.ids.length + (record.replacements || []).length,
        historyCleaned: (record.replacements || []).length,
        changed: record.ids.length > 0 || (record.replacements || []).length > 0 };
    }
    if (record.action === 'create') {
      this._ensureCollection({ id: record.collectionId, name: record.name, create: true }, record.at);
      result.collection = { id: record.collectionId, name: record.name, count: 0 };
      result.changed = true;
    }
    if (record.action === 'rename') {
      const current = this._collection(record.collectionId);
      if (current.name !== record.name) {
        db.prepare('UPDATE collections SET name=?,updated_at=? WHERE id=?').run(record.name, record.at, current.id);
        for (const row of db.prepare('SELECT id FROM conversations WHERE collection_id=?').all(current.id)) this._setCollection(row.id, { id: current.id, name: record.name }, record.at);
        result.changed = true;
      }
      result.collection = { id: current.id, name: record.name };
    }
    if (record.target) {
      this._ensureCollection(record.target, record.at);
      result.target = { id: record.target.id, name: record.target.name };
      if (record.target.create) result.changed = true;
      const source = db.prepare('SELECT * FROM conversations WHERE id=?');
      const candidates = db.prepare('SELECT id,content_hash FROM conversations WHERE collection_id=? AND source_identity_json=? ORDER BY id');
      for (const id of record.ids) {
        const row = source.get(id);
        if (!row) throw new Error('A selected conversation is no longer present.');
        if (row.collection_id === record.target.id) continue;
        const matches = candidates.all(record.target.id, row.source_identity_json);
        const exact = matches.find(match => match.content_hash === row.content_hash);
        if (exact) {
          result.duplicates++;
          if (record.action === 'copy') result.copies[id] = exact.id;
          else {
            db.prepare('DELETE FROM conversations WHERE id=?').run(id);
            result.removedIds.push(id);
            result.remap[id] = exact.id;
            result.changed = true;
          }
          continue;
        }
        if (matches.length) result.conflicts++;
        if (record.action === 'copy') {
          const newId = record.copyIds[id];
          this._copyConversation(row, newId, record.target, record.at);
          result.copies[id] = newId;
          result.copied++;
        } else {
          this._setCollection(id, record.target, record.at);
          result.moved++;
        }
        result.changed = true;
      }
    }
    if (record.action === 'clear') {
      db.exec('DELETE FROM conversations; DELETE FROM collections; DELETE FROM applied_operations;');
      result.clearAll = true;
      result.changed = record.count > 0 || record.collectionCount > 0;
    }
    if (record.action === 'deleteConversations' || record.action === 'deleteCollection' && !record.target) {
      const remove = db.prepare('DELETE FROM conversations WHERE id=?');
      for (const id of record.ids) {
        if (remove.run(id).changes) { result.removedIds.push(id); result.changed = true; }
      }
    }
    for (const id of record.removedCollections) {
      if (db.prepare('SELECT 1 FROM conversations WHERE collection_id=? LIMIT 1').get(id)) throw new Error('Cannot remove a collection that still contains conversations.');
      if (db.prepare('DELETE FROM collections WHERE id=?').run(id).changes) result.changed = true;
    }
    return result;
  }

  searchRevision() {
    const identity = this._open().prepare("SELECT value FROM metadata WHERE key='archiveIdentity'").get().value;
    return `${identity}:${this.revision()}`;
  }

  revision() {
    return this._open().prepare("SELECT value FROM metadata WHERE key='revision'").get().value;
  }

  collections({ includeEmpty = false } = {}) {
    const rows = this._open().prepare(`SELECT k.id,k.name,count(c.id) AS count,
      coalesce(sum(c.turn_count),0) AS turnCount FROM collections k LEFT JOIN conversations c ON c.collection_id=k.id
      GROUP BY k.id ${includeEmpty ? '' : 'HAVING count(c.id)>0'} ORDER BY k.name COLLATE NOCASE,k.name`).all();
    return rows.map(row => includeEmpty ? { ...row } : { name: row.name, count: row.count });
  }

  providers({ collection = 'all', collectionId } = {}) {
    if (collectionId) collection = this._collection(collectionId).name;
    const clause = collection && collection !== 'all' ? 'WHERE collection=?' : '';
    return this._open().prepare(`SELECT provider, count(*) AS count FROM conversations ${clause} GROUP BY provider ORDER BY provider`).all(...(clause ? [collection] : [])).map(row => ({ ...row }));
  }

  files({ collection = 'all', collectionId, provider, q = '', query, page = 1, pageSize = 50, sort = 'updated' } = {}) {
    const db = this._open();
    if (collectionId) collection = this._collection(collectionId).name;
    if (query !== undefined) q = query;
    pageSize = Math.min(500, Math.max(1, Math.trunc(Number(pageSize)) || 50));
    page = Math.max(1, Math.trunc(Number(page)) || 1);
    const clauses = [];
    const args = [];
    if (collection && collection !== 'all') { clauses.push('c.collection=?'); args.push(collection); }
    if (provider && provider !== 'all') { clauses.push('c.provider=?'); args.push(String(provider).toLowerCase()); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const order = sort === 'title' ? 'c.title COLLATE NOCASE, c.id' : sort === 'length' ? 'c.turn_count DESC, c.title COLLATE NOCASE, c.id' : 'c.sort_time DESC, c.updated_at DESC, c.id';
    const columns = SUMMARY_COLUMNS.split(', ').map(column => `c.${column}`).join(', ');
    if (!String(q).trim()) {
      const total = db.prepare(`SELECT count(*) AS total FROM conversations c ${where}`).get(...args).total;
      page = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
      const rows = db.prepare(`SELECT ${columns} FROM conversations c ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, pageSize, (page - 1) * pageSize);
      return { files: rows.map(summary), total, page, pageSize };
    }
    // Preserve the old literal full-body list filter without putting bodies into
    // the catalog. Two bounded scans provide accurate counts and clamped pages.
    const queryText = literalFold(String(q).trim());
    const statement = db.prepare(`SELECT ${columns},c.content_ref FROM conversations c ${where} ORDER BY ${order}`);
    let total = 0;
    for (const ignored of this._matchingRows(statement.iterate(...args), queryText)) total++;
    page = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
    const rows = [], offset = (page - 1) * pageSize; let index = 0;
    for (const row of this._matchingRows(statement.iterate(...args), queryText)) { if (index++ >= offset) rows.push(summary(row)); if (rows.length >= pageSize) break; }
    return { files: rows, total, page, pageSize };
  }

  thread({ id } = {}) {
    if (!id) throw new TypeError('A local conversation ID is required.');
    const row = this._open().prepare('SELECT * FROM conversations WHERE id=?').get(id);
    if (!row) throw new Error('This conversation is no longer present in the local archive.');
    return { ...this.content.readDocument(JSON.parse(row.content_ref)), ...summary(row) };
  }

  get(id) { return this.thread({ id }); }

  getConversationSummary(id) {
    return summary(this._open().prepare(`SELECT ${SUMMARY_COLUMNS} FROM conversations WHERE id=?`).get(id));
  }

  getPassageMetadata({ id, conversationId, turnIndex, role } = {}) {
    const row = this.getConversationSummary(conversationId);
    return row ? { ...row, id, conversationId, turnIndex, role } : null;
  }

  getPassage(id) {
    if (typeof id !== 'string') return null;
    const match = /^(.+):(\d+):([^:]+):(\d+)$/.exec(id);
    if (!match) return null;
    for (const passage of this.iterPassages({ conversationId: match[1] })) if (passage.id === id) return passage;
    return null;
  }

  upsert(input) {
    return this.applyMutation(this.prepareUpsert(input));
  }

  *iterPassages({ collection = 'all', collectionId, provider, role, conversationId } = {}) {
    if (role === 'assistant') role = 'ai';
    const clauses = [], args = [];
    if (collectionId) { clauses.push('collection_id=?'); args.push(collectionId); }
    else if (collection && collection !== 'all') { clauses.push('collection=?'); args.push(collection); }
    if (provider && provider !== 'all') { clauses.push('provider=?'); args.push(provider); }
    if (conversationId) { clauses.push('id=?'); args.push(conversationId); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const statement = this._open().prepare(`SELECT id,collection,title,provider,content_ref FROM conversations ${where} ORDER BY rowid`);
    for (const row of statement.iterate(...args)) {
      const document = { ...row, turns: this.content.iterateTurns(JSON.parse(row.content_ref)) };
      for (const passage of passageRows(document, row.id)) if (!role || role === 'all' || passage.role === role) yield passage;
    }
  }

  *iteratePassages(options = {}) { yield* this.iterPassages(options); }
  passages(options = {}) { return [...this.iterPassages(options)]; }
  passageCount() { return this._open().prepare('SELECT coalesce(sum(passage_count),0) AS count FROM conversations').get().count; }

  // Compatibility for callers outside the UI. Main search performs global
  // bounded ranking on iterPassages; these candidates remain literal tokens.
  keywordCandidates({ terms = [], collection = 'all', provider, role, limit = 5000 } = {}) {
    if (!Array.isArray(terms)) throw new TypeError('Search terms must be an array.');
    const fold = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const tokens = [...new Set(terms.filter(value => typeof value === 'string').map(value => fold(value.replace(/\0/g, '').trim())).filter(Boolean))].slice(0, 128);
    if (!tokens.length) return [];
    limit = Math.min(20000, Math.max(1, Math.trunc(Number(limit)) || 5000));
    const rows = [];
    for (const row of this.iterPassages({ collection, provider, role })) {
      const text = fold(row.text), title = fold(row.title);
      if (tokens.some(token => text.includes(token) || title.includes(token))) rows.push({ ...row, ftsRank: -tokens.reduce((score, token) => score + (text.includes(token) ? 1 : 0) + (title.includes(token) ? 3 : 0), 0) });
      if (rows.length >= limit) break;
    }
    return rows.sort((a, b) => a.ftsRank - b.ftsRank);
  }

  close() {
    const closing = this.workers?.close(); this.workers = null; this.cleanupPlan = null;
    this.content.clearCache();
    if (!this.db) return closing;
    const db = this.db;
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.close();
    this.db = null;
    return closing;
  }
}

/** Object inventory is derived from the catalog; neither directory scanning nor
 * current cache contents can establish which compressed objects are live. */
export function objectMetadata(db) {
  const objects = new Map();
  for (const row of db.prepare('SELECT content_ref FROM conversations').iterate()) {
    for (const object of contentObjects(JSON.parse(row.content_ref))) {
      const previous = objects.get(object.file);
      if (previous && JSON.stringify(previous) !== JSON.stringify(object)) throw new Error('The catalog contains conflicting descriptors for one content object.');
      objects.set(object.file, object);
    }
  }
  return [...objects.values()];
}

export function referencedObjectFiles(db) { return objectMetadata(db).map(object => object.file); }

export async function verifyCatalog(db, objectsDir, { signal, onProgress } = {}) {
  const store = new ContentStore({ directory: objectsDir, cacheBytes: 0 });
  const objects = objectMetadata(db);
  let logicalBytes = 0, compressedBytes = 0, done = 0;
  for (const object of objects) {
    signal?.throwIfAborted(); store.readBlock(object, { bypassCache: true });
    logicalBytes += object.bytes; compressedBytes += object.packedBytes;
    onProgress?.({ phase: 'verifying-content', done: ++done, total: objects.length, file: object.file });
    await new Promise(resolve => setImmediate(resolve));
  }
  let conversations = 0, turns = 0;
  for (const row of db.prepare('SELECT turn_count,content_ref FROM conversations').iterate()) {
    const ref = validateContentRef(JSON.parse(row.content_ref));
    if (ref.turnCount !== row.turn_count) throw new Error('Catalog conversation count does not match its content reference.');
    conversations++; turns += ref.turnCount;
  }
  return { ok: true, objects: objects.length, conversations, turns, logicalBytes, compressedBytes };
}

/** Run only on a staged catalog. All new objects are immutable; failure leaves
 * the active catalog untouched. Publication and reference-aware GC belong to
 * the storage generation manager. This does not change logical revisions. */
export async function transcodeCatalog(db, objectsDir, targetProfile, { signal, onProgress } = {}) {
  const source = new ContentStore({ directory: objectsDir, cacheBytes: 0 });
  const target = new ContentStore({ directory: objectsDir, compression: targetProfile, cacheBytes: 0 });
  const objects = objectMetadata(db), converted = new Map(); let done = 0;
  for (const object of objects) {
    signal?.throwIfAborted();
    converted.set(object.file, target.writeBlock(source.readBlock(object, { bypassCache: true })));
    onProgress?.({ phase: 'converting-content', done: ++done, total: objects.length, file: object.file });
    await new Promise(resolve => setImmediate(resolve));
  }
  const blob = value => ({ ...value, blocks: value.blocks.map(object => converted.get(object.file)) });
  db.exec('BEGIN IMMEDIATE');
  try {
    const update = db.prepare('UPDATE conversations SET content_ref=? WHERE id=?');
    for (const row of db.prepare('SELECT id,content_ref FROM conversations').iterate()) {
      signal?.throwIfAborted(); const ref = JSON.parse(row.content_ref);
      const next = { ...ref, header: blob(ref.header), groups: ref.groups.map(group => ({ ...group, blob: blob(group.blob) })) };
      validateContentRef(next); update.run(JSON.stringify(next), row.id);
      await new Promise(resolve => setImmediate(resolve));
    }
    db.exec('COMMIT');
  } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
  return { ok: true, compression: target.compression, objects: [...converted.values()] };
}

export default ArchiveStore;
