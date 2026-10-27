import './onnx-privacy.cjs';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { createOllamaManager, isLoopbackOllama, normalizeOllamaUrl as localOllamaUrl, deleteOllamaModel, enrichOllamaModels, modelCacheBytes, ollamaIndexStatus } from './ollama.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import { initializeVectorCatalog, VectorBlockReader, VectorBlockWriter } from './search-index.mjs';
import { SearchSpill } from './search-spill.mjs';
import { SearchTextIndex, searchPeriodRange, matchesSearchPeriod } from './search-text-index.mjs';

export const SEMANTIC_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const MODEL_KEY = `${SEMANTIC_MODEL}:q8:chunks-v1`;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
const tick = () => new Promise(resolve => setImmediate(resolve));
const sha = value => createHash('sha256').update(value).digest('hex');
const fold = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
const archiveRole = value => value === 'assistant' ? 'ai' : value;
const words = value => Array.from(segmenter.segment(fold(value)), v => v.isWordLike ? v.segment : '').filter(Boolean);
const abortError = () => Object.assign(new Error('Operation cancelled.'), { name: 'AbortError' });
function checkAbort(signal) { if (signal?.aborted) throw abortError(); }
function parseQuery(q) {
  const phrases = [], negatives = [], tokens = [];
  for (const match of q.matchAll(/(-?)"([^"]+)"|(-?)(\S+)/g)) {
    const negative = match[1] === '-' || match[3] === '-';
    const value = fold(match[2] ?? match[4]);
    if (negative) negatives.push(value);
    else if (match[2]) { phrases.push(value); tokens.push(...words(value)); }
    else tokens.push(...words(value));
  }
  return { phrases, negatives, tokens: [...new Set(tokens)].slice(0, 40) };
}
function oneEdit(a, b) {
  if (a === b) return 0;
  if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1) return 2;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return 2;
    if (a.length === b.length && a[i] === b[j + 1] && a[i + 1] === b[j]) { i += 2; j += 2; }
    else if (a.length >= b.length) { i++; if (a.length === b.length) j++; }
    else j++;
  }
  return edits + (i < a.length || j < b.length ? 1 : 0);
}
export function excerpt(text, q, maximum = 360) {
  const source = String(text ?? '');
  if (source.length <= maximum) return source;
  const query = parseQuery(q), normalized = fold(source);
  const positions = [fold(q.trim()), ...query.phrases, ...query.tokens].map(term => normalized.indexOf(term)).filter(i => i >= 0);
  const hit = positions.length ? Math.min(...positions) : 0;
  // Normalization may change code-point counts; an approximate snippet is harmless,
  // while navigation always uses the original turnIndex, never this text offset.
  const start = Math.max(0, hit - 90), end = Math.min(source.length, start + maximum);
  return `${start ? '…' : ''}${source.slice(start, end)}${end < source.length ? '…' : ''}`;
}
export function* iterPassageChunks(text) {
  const source = String(text ?? '');
  // Character windows prevent late content being lost to the model's token limit.
  // A 100-character overlap keeps sentence fragments together between windows.
  for (let start = 0; start < source.length; start += 400) {
    const chunk = source.slice(start, start + 500);
    if (chunk.trim()) yield { text: chunk, offset: start };
    if (start + 500 >= source.length) break;
  }
}
export function splitPassage(text) { return Array.from(iterPassageChunks(text)); }
function normalizeVector(vector) {
  const out = Array.from(vector ?? [], Number);
  if (!out.length || out.length > 65536 || out.some(value => !Number.isFinite(value))) throw new Error('The embedding provider returned an invalid vector.');
  const length = Math.sqrt(out.reduce((sum, n) => sum + n * n, 0));
  if (!length) throw new Error('The embedding provider returned an empty vector.');
  return out.map(value => value / length);
}
function vectorBlob(vector) {
  const buffer = Buffer.allocUnsafe(vector.length * 4);
  vector.forEach((v, i) => buffer.writeFloatLE(v, i * 4));
  return buffer;
}
function cosineBlob(vector, bytes) {
  const buffer = Buffer.from(bytes);
  if (buffer.length !== vector.length * 4) return null;
  let sum = 0;
  for (let i = 0; i < vector.length; i++) sum += vector[i] * buffer.readFloatLE(i * 4);
  return sum;
}

class ModelWorker {
  constructor({ cacheDir, model, onProgress }) {
    this.worker = new Worker(new URL('./search-worker.mjs', import.meta.url), {
      workerData: { cacheDir, model }, execArgv: process.execArgv.filter(argument => !argument.startsWith('--input-type')),
    });
    this.pending = new Map();
    this.sequence = 0;
    this.worker.on('message', message => {
      if (message.event === 'progress') { onProgress(message.progress); return; }
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      request.cleanup();
      if (message.error) request.reject(Object.assign(new Error(message.error.message), { name: message.error.name }));
      else request.resolve(message.result);
    });
    this.worker.on('error', error => this.fail(error));
    this.worker.on('exit', code => { if (this.pending.size) this.fail(new Error(`Embedding worker stopped (exit ${code}).`)); });
  }
  fail(error) { for (const request of this.pending.values()) { request.cleanup(); request.reject(error); } this.pending.clear(); }
  call(operation, texts, signal) {
    checkAbort(signal);
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const abort = () => { this.fail(abortError()); this.worker.terminate(); };
      this.pending.set(id, { resolve, reject, cleanup: () => signal?.removeEventListener('abort', abort) });
      signal?.addEventListener('abort', abort, { once: true });
      this.worker.postMessage({ id, operation, texts });
    });
  }
  async close() { this.fail(abortError()); await this.worker.terminate(); }
}

export class SearchService {
  constructor({ store, dataDir, databasePath, objectsDir, compressionProfile = '7z', tempRoot, searchWorkspaceBytes, vectorBlockBytes, lazy = false, partialAfterMs = 45000, now = () => Date.now(), onProgress = () => {}, runtimeFactory, fetchImpl = globalThis.fetch, ollamaManager = createOllamaManager() }) {
    this.store = store;
    this.objectsDir = objectsDir || path.join(dataDir, 'local-storage-v2', 'objects');
    this.compressionProfile = compressionProfile;
    this.tempRoot = tempRoot; this.searchWorkspaceBytes = searchWorkspaceBytes; this.vectorBlockBytes = vectorBlockBytes;
    this.root = path.join(dataDir, 'search');
    this.cacheDir = path.join(this.root, 'models');
    this.statePath = path.join(this.root, 'semantic.json');
    this.onProgress = onProgress;
    this.partialAfterMs = partialAfterMs; this.now = now; this.sessions = new Map(); this.fileSessions = new Map();
    this.textIndex = new SearchTextIndex({ store, root: this.root, onProgress: event => this._progress(event) });
    this.fetch = fetchImpl;
    this.ollamaManager = ollamaManager;
    this.ollamaVerified = new Map();
    this.runtimeFactory = runtimeFactory ?? (options => new ModelWorker(options));
    this.state = { model: SEMANTIC_MODEL, modelReady: false, error: null };
    this.busy = null;
    fs.mkdirSync(this.cacheDir, { recursive: true });
    try {
      const state = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      if (state.model === SEMANTIC_MODEL) this.state = { ...this.state, ...state };
    } catch { /* Missing or malformed state does not affect text search. */ }
    this.databasePath = databasePath || path.join(this.root, 'vectors.sqlite');
    this._db = null;
    if (!lazy) this.openDatabase();
  }
  get db() { return this.openDatabase(); }
  openDatabase() {
    if (this._db) return this._db;
    fs.mkdirSync(path.dirname(this.databasePath), { recursive: true, mode: 0o700 });
    this._db = new DatabaseSync(this.databasePath);
    initializeVectorCatalog(this._db);
    return this._db;
  }
  _saveState() {
    const temporary = `${this.statePath}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.state, null, 2));
    fs.renameSync(temporary, this.statePath);
  }
  _progress(event) { this.onProgress({ operation: this.busy ?? 'search', ...event }); }
  async _revision() {
    if (typeof this.store.searchRevision === 'function') return String(await this.store.searchRevision());
    if (typeof this.store.revision === 'function') return String(await this.store.revision());
    const digest = createHash('sha256');
    for await (const passage of this._passages()) digest.update(`${passage.id}:${sha(passage.text)}\n`);
    return digest.digest('hex');
  }
  async status() {
    const info = this._db ? this._db.prepare('SELECT * FROM indexes WHERE model=?').get(MODEL_KEY) : this.state.indexSummary;
    const revision = await this._revision();
    return { ...this.state, modelBytes: await modelCacheBytes(this.cacheDir), indexBytes: (await ollamaIndexStatus(this, MODEL_KEY, revision)).bytes, ready: this.state.modelReady, busy: this.busy, cacheDir: this.cacheDir,
      indexedPassages: info?.passages ?? 0, indexedChunks: info?.chunks ?? 0,
      needsIndexing: !info || info.revision !== revision, indexedAt: info?.updated ?? null,
      textIndex: this.textIndex.status(revision),
      modes: ['keyword', 'exact', 'fuzzy', 'semantic', 'hybrid', 'ollama'] };
  }
  _runtime() {
    if (!this.runtime) this.runtime = this.runtimeFactory({ cacheDir: this.cacheDir, model: SEMANTIC_MODEL, onProgress: event => this._progress(event) });
    return this.runtime;
  }
  _removeTempFiles(directory = this.cacheDir) {
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) this._removeTempFiles(target);
      else if (entry.isFile() && /\.tmp\./.test(entry.name)) {
        try { fs.unlinkSync(target); } catch { /* A failed temporary-file cleanup never hides the original error. */ }
      }
    }
  }
  async _dropRuntime() {
    const runtime = this.runtime; this.runtime = null;
    if (runtime) await runtime.close();
    this._removeTempFiles();
  }
  async setupSemantic({ signal } = {}) {
    if (this.busy) throw new Error('Another search operation is running. Wait for it or cancel it first.');
    checkAbort(signal);
    this.busy = 'semantic.setup'; this.state.error = null;
    try {
      this._progress({ phase: 'loading', message: 'Preparing the multilingual semantic model.' });
      const result = await this._runtime().call('setup', undefined, signal);
      checkAbort(signal);
      this._removeTempFiles();
      this.state = { ...this.state, modelReady: true, dimension: result.dimension, setupAt: new Date().toISOString(), error: null };
      this._saveState();
      this._progress({ phase: 'complete', message: 'Semantic model is ready for offline indexing and search.' });
    } catch (error) {
      await this._dropRuntime();
      this.state.error = error.name === 'AbortError' ? 'Semantic setup cancelled. Text search remains available.' : `Semantic setup failed: ${error.message}. Text search remains available; retry setup when the model host is reachable.`;
      this._saveState();
      throw error.name === 'AbortError' ? error : new Error(this.state.error);
    } finally { this.busy = null; }
    return this.status();
  }
  async *_passages(options = {}) {
    const source = options.useTextIndex && this.textIndex.supported ? this.textIndex.passages(options) : typeof this.store.iterPassages === 'function' ? this.store.iterPassages(options) : await this.store.passages();
    for await (const passage of source) if (this._matchesFilter(passage, options)) yield passage;
  }
  _matchesFilter(p, { collection = 'all', provider, role, periodRange } = {}) {
    return matchesSearchPeriod(p.created ?? this.textIndex.created(p.conversationId), periodRange) && (collection === 'all' || !collection || p.collection === collection) && (!provider || provider === 'all' || p.provider === provider) && (!role || role === 'all' || archiveRole(p.role) === archiveRole(role));
  }
  async _index({ key, embed, signal, operation }) {
    if (this.busy) throw new Error('Another search operation is running. Wait for it or cancel it first.');
    checkAbort(signal); this.busy = operation;
    const generation = randomUUID();
    let reader;
    try {
      const revision = await this._revision();
      await this.textIndex.ensure({ signal, revision });
      const previous = this.db.prepare('SELECT * FROM indexes WHERE model=?').get(key);
      // Reusing a complete current generation requires no decode or model calls.
      if (previous?.revision === revision) return;
      reader = new VectorBlockReader(this.db, this.objectsDir);
      const writer = new VectorBlockWriter({ db: this.db, objectsDir: this.objectsDir, model: key, generation,
        profile: typeof this.compressionProfile === 'function' ? this.compressionProfile() : this.compressionProfile, maxBytes: this.vectorBlockBytes });
      let chunks = 0, current = 0, dimension;
      for await (const passage of this._passages({ useTextIndex: this.textIndex.supported })) {
        checkAbort(signal); let part = 0;
        for (const { text, offset } of iterPassageChunks(passage.text)) {
          checkAbort(signal); const fingerprint = sha(`${key}\0${text}`);
          let vector = previous && reader.lookup(key, previous.generation, passage.id, part, fingerprint);
          if (!vector) {
            const [embedded] = await embed([text], signal); checkAbort(signal);
            vector = vectorBlob(normalizeVector(embedded)).toString('base64');
          }
          const size = Buffer.from(vector, 'base64').length;
          if (dimension !== undefined && size !== dimension) throw new Error('The embedding provider changed vector dimensions during indexing.');
          dimension = size;
          writer.add({ passage: passage.id, conversationId: passage.conversationId, turnIndex: passage.turnIndex, role: passage.role, part, fingerprint, offset, vector });
          chunks++; part++;
        }
        current++;
        this._progress({ phase: 'indexing', current, message: `Indexed ${current} messages (${chunks} passages).` });
        if (current % 16 === 0) await tick();
      }
      checkAbort(signal); writer.flush();
      if (revision !== await this._revision()) throw new Error('The archive changed during indexing. Run indexing again to include the new content.');
      this.db.exec('BEGIN');
      try {
        this.db.prepare('INSERT OR REPLACE INTO indexes VALUES(?,?,?,?,?,?)').run(key, revision, current, chunks, new Date().toISOString(), generation);
        this.db.prepare('DELETE FROM vector_chunks WHERE model=? AND generation<>?').run(key, generation);
        this.db.prepare('DELETE FROM vector_segments WHERE model=? AND generation<>?').run(key, generation);
        this.db.exec('COMMIT');
      } catch (error) { this.db.exec('ROLLBACK'); throw error; }
      if (key === MODEL_KEY) { this.state.indexSummary = this.db.prepare('SELECT * FROM indexes WHERE model=?').get(MODEL_KEY); this._saveState(); }
      this._progress({ phase: 'complete', current, total: current, message: 'Search index is current.' });
    } catch (error) {
      // The previous generation remains usable if a rebuild is cancelled/failed.
      this.db.prepare('DELETE FROM vector_chunks WHERE model=? AND generation=?').run(key, generation);
      this.db.prepare('DELETE FROM vector_segments WHERE model=? AND generation=?').run(key, generation);
      throw error;
    } finally { reader?.close(); this.busy = null; }
  }
  async indexSemantic({ signal } = {}) {
    if (!this.state.modelReady) throw new Error('Set up the semantic model before indexing. Ordinary text search already works.');
    try {
      await this._index({ key: MODEL_KEY, embed: (texts, signal) => this._runtime().call('embed', texts, signal), signal, operation: 'semantic.index' });
      this.state.error = null;
    } catch (error) {
      await this._dropRuntime();
      this.state.error = error.name === 'AbortError' ? 'Indexing cancelled. The previous completed index was preserved.' : `Semantic indexing failed: ${error.message}. Text search remains available.`;
      this._saveState();
      throw error;
    }
    return this.status();
  }
  _result(passage, score, q, extra = {}) {
    return { conversationId: passage.conversationId, turnIndex: passage.turnIndex, role: passage.role,
      title: passage.title, collection: passage.collection, provider: passage.provider,
      text: excerpt(passage.text, q), score, passageId: passage.id, ...extra };
  }
  async _keyword(options, spill) {
    const { q, mode = 'keyword', signal } = options, query = parseQuery(q), exact = fold(q.trim());
    if (!query.tokens.length && mode !== 'exact') return;
    const expected = options.useTextIndex ? this.textIndex.count(options) : this.store.passageCount?.();
    const df = new Map(); let lengthSum = 0, matches = 0, total = 0;
    for await (const passage of this._passages(options)) {
      checkAbort(signal); total++;
      if (total % 128 === 0) { await this._searchProgress(options, spill, total, expected); await tick(); }
      const text = fold(passage.text), title = fold(passage.title), combined = `${title}\n${text}`;
      if (mode !== 'exact' && (query.negatives.some(term => combined.includes(term)) || query.phrases.some(phrase => !combined.includes(phrase)))) continue;
      if (mode === 'exact') {
        if (combined.includes(exact)) spill.keywordMatch(this._result(passage, 100 + (title.includes(exact) ? 20 : 0) + (text.includes(exact) ? 10 : 0), q));
        continue;
      }
      if (mode !== 'fuzzy' && !query.tokens.some(term => combined.includes(term))) continue;
      // Counters scale with the (at most 40 token) query, not passage vocabulary.
      const counts = new Map(query.tokens.map(term => [term, 0])), fuzzy = new Map(query.tokens.map(term => [term, 0]));
      let length = 0;
      for (const [source, weight] of [[text, 1], [title, 3]]) for (const segment of segmenter.segment(source)) {
        if (!segment.isWordLike) continue;
        length += weight;
        if (counts.has(segment.segment)) counts.set(segment.segment, counts.get(segment.segment) + weight);
        if (mode === 'fuzzy') for (const term of query.tokens) if (oneEdit(term, segment.segment) <= 1) fuzzy.set(term, fuzzy.get(term) + weight);
      }
      const hits = [];
      for (const term of query.tokens) {
        const exactCount = counts.get(term), count = exactCount || (mode === 'fuzzy' ? fuzzy.get(term) : 0);
        if (count) { hits.push({ term, count, quality: exactCount ? 1 : 0.62 }); df.set(term, (df.get(term) ?? 0) + 1); }
      }
      if (!hits.length) continue;
      lengthSum += length; matches++;
      spill.keywordMatch(this._result(passage, 0, q), { hits, length, phrase: text.includes(exact), titleMatch: title.includes(exact) });
    }
    await this._searchProgress(options, spill, total, expected || total);
    if (mode === 'exact') return;
    const average = lengthSum / Math.max(matches, 1);
    let current = 0;
    for (const row of spill.statistics()) {
      checkAbort(signal); if (++current % 256 === 0) await tick();
      const match = JSON.parse(row.stats); let score = 0;
      for (const { term, count, quality } of match.hits) {
        const idf = Math.log(1 + (total - df.get(term) + 0.5) / (df.get(term) + 0.5));
        score += quality * idf * count * 2.2 / (count + 1.2 * (0.25 + 0.75 * match.length / Math.max(average, 1)));
      }
      const coverage = match.hits.length / query.tokens.length;
      score = score * (0.35 + coverage * coverage) + (coverage === 1 ? 3 : 0) + (match.phrase ? 5 : 0) + (match.titleMatch ? 4 : 0);
      spill.score.run(score, row.seq);
    }
  }
  async _semantic(options, key, embed, spill) {
    const info = this.db.prepare('SELECT * FROM indexes WHERE model=?').get(key);
    if (!info || info.revision !== await this._revision()) throw new Error('The semantic index is missing or outdated. Run Index conversations in settings.');
    const [vector] = await embed([options.q], options.signal), query = normalizeVector(vector);
    const reader = new VectorBlockReader(this.db, this.objectsDir);
    // Real archives supply a metadata-only lookup. Minimal third-party/test
    // stores can still participate through a bounded on-disk metadata table.
    if (typeof this.store.getPassageMetadata !== 'function') {
      spill.db.exec('CREATE TABLE metadata(id TEXT PRIMARY KEY,data TEXT NOT NULL)');
      const write = spill.db.prepare('INSERT OR REPLACE INTO metadata VALUES(?,?)');
      for await (const passage of this._passages(options)) { checkAbort(options.signal); const { text, ...metadata } = passage; write.run(passage.id, JSON.stringify(metadata)); }
    }
    const lookup = typeof this.store.getPassageMetadata !== 'function' && spill.db.prepare('SELECT data FROM metadata WHERE id=?');
    let processed = 0;
    try {
      for (const row of reader.iterate(key, info.generation)) {
        checkAbort(options.signal);
        if (++processed % 256 === 0) { await this._searchProgress(options, spill, processed, info.chunks, true); await tick(); }
        const found = lookup ? lookup.get(row.passage) : null;
        const passage = lookup ? found && JSON.parse(found.data) : await this.store.getPassageMetadata({ id: row.passage, conversationId: row.conversationId, turnIndex: row.turnIndex, role: row.role });
        if (!passage || !this._matchesFilter(passage, options)) continue;
        const score = cosineBlob(query, Buffer.from(row.vector, 'base64'));
        if (score === null) throw new Error('The embedding model dimensions changed. Rebuild its semantic index.');
        spill.semanticMatch(this._result(passage, score, options.q), row.offset);
      }
      await this._searchProgress(options, spill, processed, info.chunks, true);
    } finally { reader.close(); }
  }
  _spill() { return new SearchSpill({ tempRoot: this.tempRoot, maximumBytes: this.searchWorkspaceBytes }); }
  async _page(spill, mode, options) {
    const result = spill.page(mode, Math.max(1, Math.min(1000, Number(options.limit) || 100)), Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(options.offset) || 0))));
    const needed = new Map(result.results.filter(row => row._needsText).map(row => [row.passageId, row]));
    const fill = (row, passage) => {
      row.text = excerpt(String(passage.text ?? '').slice(Math.max(0, (row.matchOffset || 0) - 60)), options.q);
      delete row._needsText;
    };
    if (needed.size && options.useTextIndex) {
      const conversations = new Set([...needed.values()].map(row => row.conversationId));
      for (const conversationId of conversations) { const ids = new Set([...needed.values()].filter(row => row.conversationId === conversationId).map(row => row.passageId)); for (const passage of this.textIndex.passages({ conversationId })) { checkAbort(options.signal); const row = needed.get(passage.id); if (row) { fill(row, passage); needed.delete(passage.id); ids.delete(passage.id); } if (!ids.size) break; } }
    } else if (needed.size && typeof this.store.getPassage === 'function') {
      for (const [id, row] of needed) { checkAbort(options.signal); const passage = await this.store.getPassage(id); if (passage) fill(row, passage); else delete row._needsText; }
    } else if (needed.size) for await (const passage of this._passages(options)) {
      checkAbort(options.signal); const row = needed.get(passage.id); if (row) { fill(row, passage); needed.delete(passage.id); if (!needed.size) break; }
    }
    for (const row of result.results) delete row._needsText;
    return result;
  }
  async prepareText({ signal } = {}) {
    if (this.busy) throw new Error('Another search operation is running. Wait for it or cancel it first.');
    this.busy = 'search.prepare';
    try {
      const revision = await this._revision();
      await this.textIndex.ensure({ signal, revision });
      if (this.textIndex.supported) {
        try { let count = 0; for (const ignored of this.textIndex.passages()) { checkAbort(signal); if (++count % 128 === 0) await tick(); } }
        catch (error) { if (error.code !== 'SEARCH_CACHE_CORRUPT') throw error; this.textIndex.discard(); this.sessions.clear(); this._clearFileSessions(); await this.textIndex.ensure({ signal, revision }); }
      }
      return this.status();
    }
    finally { this.busy = null; }
  }
  async _prepareSearch(options, revision) {
    return this.textIndex.ensure({ signal: options.signal, revision, progress: event => {
      this._progress({ ...event, searchId: options.searchId });
      if (!options.stream.activated && this.now() - options.stream.started >= this.partialAfterMs) {
        options.stream.activated = true;
        this._progress({ operation: 'search', phase: 'search-results', searchId: options.searchId, results: [], provisional: true, fraction: 0, current: 0, message: 'Preparing search data.' });
      }
    } });
  }
  _signature(options, revision) {
    return JSON.stringify([revision, options.q, options.mode, options.collection || 'all', options.provider || '', options.role || '', options.period || 'all', options.url || '', options.model || '']);
  }
  _sessionPage(session, options, restarted = false) {
    const pageSize = Math.max(1, Math.min(500, Math.floor(Number(options.pageSize) || 50)));
    const total = session.results.length, page = Math.min(Math.max(1, Math.floor(Number(restarted ? 1 : options.page) || 1)), Math.max(1, Math.ceil(total / pageSize)));
    session.used = this.now();
    return { results: session.results.slice((page - 1) * pageSize, page * pageSize), total, matchedTotal: session.total, page, pageSize,
      searchSession: session.id, hasMore: page * pageSize < total, totalKnown: true, complete: true,
      ...(restarted ? { sessionRestarted: true } : {}), ...(session.notice ? { notice: session.notice } : {}),
      searchInfo: { truncated: session.total > total, limit: 1000 } };
  }
  _session(options, revision) {
    const now = this.now();
    for (const [id, session] of this.sessions) if (now - session.used > 600000 || session.revision !== revision) this.sessions.delete(id);
    const session = this.sessions.get(options.searchSession);
    return session?.signature === this._signature(options, revision) ? session : null;
  }
  async _searchProgress(options, spill, current, total, semantic = false) {
    const stream = options.stream;
    if (!stream) return;
    let fraction = total ? Math.min(1, current / total) : null;
    if (options.hybridProgress && fraction !== null) fraction = semantic ? fraction * 0.5 : 0.5 + fraction * 0.5;
    this._progress({ operation: 'search', phase: 'searching', searchId: options.searchId,
      current, total, ...(fraction !== null ? { fraction } : {}), message: `Searched ${current} ${semantic ? 'semantic passages' : 'messages'}.` });
    const now = this.now();
    if (now - stream.started < this.partialAfterMs || now - stream.sentAt < 400 || stream.count >= 1000) return;
    const rows = spill.provisional(stream.after, Math.min(100, 1000 - stream.count));
    if (!rows.length && stream.activated) return;
    stream.activated = true;
    // Semantic candidates need a snippet, but only the newly displayed batch is
    // hydrated. The compressed text cache avoids opening original objects.
    const results = rows.map(row => { const result = row.result; if (options.mode === 'titles') { delete result.passageId; delete result.turnIndex; delete result.score; } return result; });
    const needed = new Map(results.filter(row => row._needsText).map(row => [row.passageId, row]));
    const fill = (row, found) => { if (found) row.text = excerpt(String(found.text || '').slice(Math.max(0, (row.matchOffset || 0) - 60)), options.q); delete row._needsText; };
    if (options.useTextIndex) {
      const groups = new Map();
      for (const row of needed.values()) { if (!groups.has(row.conversationId)) groups.set(row.conversationId, new Set()); groups.get(row.conversationId).add(row.passageId); }
      for (const [conversationId, ids] of groups) for (const passage of this.textIndex.passages({ conversationId })) {
        checkAbort(options.signal); const row = needed.get(passage.id); if (row) { fill(row, passage); ids.delete(passage.id); } if (!ids.size) break;
      }
    } else for (const row of needed.values()) { checkAbort(options.signal); fill(row, await this.store.getPassage?.(row.passageId)); }
    for (const row of results) delete row._needsText;
    stream.after = rows.at(-1)?.seq ?? stream.after; stream.count += results.length; stream.sentAt = now;
    this._progress({ operation: 'search', phase: 'search-results', searchId: options.searchId, results, provisional: true, current, total, ...(fraction !== null ? { fraction } : {}) });
  }
  async search(options = {}) {
    const q = String(options.q ?? '').trim();
    if (!q) return { results: [], total: 0 };
    if (q.length > 4000) throw new Error('Search queries are limited to 4,000 characters.');
    const mode = options.mode ?? 'keyword';
    if (!['keyword', 'exact', 'fuzzy', 'semantic', 'hybrid'].includes(mode)) throw new Error(`Unsupported search mode: ${mode}`);
    options = { ...options, q, mode, role: archiveRole(options.role), periodRange: searchPeriodRange(options.period, this.now()),
      stream: { started: this.now(), sentAt: -Infinity, after: 0, count: 0 }, hybridProgress: mode === 'hybrid' };
    const revision = await this._revision(), paged = options.page !== undefined || options.pageSize !== undefined || options.searchSession !== undefined;
    checkAbort(options.signal);
    const cached = paged && this._session(options, revision); if (cached) return this._sessionPage(cached, options);
    await this._prepareSearch(options, revision);
    options.useTextIndex = this.textIndex.supported;
    let spill = this._spill(), ranking = mode, notice, runtimeUsed = false;
    try {
      if (mode === 'semantic' || mode === 'hybrid') {
        try {
          if (this.busy) throw new Error('Semantic setup or indexing is running. Wait for it to finish before using model search.');
          if (!this.state.modelReady) throw new Error('Semantic search needs its optional model setup and index first.');
          await this._semantic(options, MODEL_KEY, (texts, signal) => { runtimeUsed = true; return this._runtime().call('embed', texts, signal); }, spill);
          if (mode === 'hybrid') await this._keyword({ ...options, mode: 'keyword' }, spill);
        } catch (error) {
          if (error.name === 'AbortError') { if (runtimeUsed) await this._dropRuntime(); throw error; }
          if (runtimeUsed) await this._dropRuntime();
          if (error.code === 'SEARCH_CACHE_CORRUPT') throw error;
          notice = `${error.message} Showing ranked text results.`; ranking = 'keyword';
          await this._keyword({ ...options, mode: 'keyword', hybridProgress: false }, spill);
        }
      } else await this._keyword(options, spill);
      const result = await this._page(spill, ranking, paged ? { ...options, limit: 1000, offset: 0 } : options);
      if (revision !== await this._revision()) throw new Error('The archive changed during search. Run the search again to use its current contents.');
      checkAbort(options.signal);
      if (!paged) return { ...result, ...(notice ? { notice } : {}) };
      const session = { ...result, id: randomUUID(), signature: this._signature(options, revision), revision, used: this.now(), notice };
      while (this.sessions.size >= 2) this.sessions.delete([...this.sessions.values()].sort((a, b) => a.used - b.used)[0].id);
      this.sessions.set(session.id, session); return this._sessionPage(session, options, Boolean(options.searchSession));
    } catch (error) {
      if (error.code === 'SEARCH_CACHE_CORRUPT') {
        this.textIndex.discard(); this.sessions.clear();
        throw new Error('The compact search index was damaged and has been cleared. Retry the search to rebuild it from the preserved archive.');
      }
      if (error.errcode === 13 || error.sqliteErrorCode === 13 || /database or disk is full/i.test(error.message)) throw new Error('Search working space is full. Narrow the query or collection, or free temporary disk space and retry.');
      throw error;
    } finally { spill.close(); }
  }
  _clearFileSessions() { for (const session of this.fileSessions.values()) session.spill.close(); this.fileSessions.clear(); }
  _filePage(session, options, restarted = false) {
    const pageSize = Math.min(500, Math.max(1, Math.trunc(Number(options.pageSize)) || 50));
    const page = Math.min(Math.max(1, Math.trunc(Number(restarted ? 1 : options.page)) || 1), Math.max(1, Math.ceil(session.total / pageSize)));
    session.used = this.now();
    return { files: session.spill.page('keyword', pageSize, (page - 1) * pageSize).results.map(({passageId,turnIndex,score,...summary})=>summary), total: session.total, page, pageSize,
      searchSession: session.id, hasMore: page * pageSize < session.total, totalKnown: true, complete: true, ...(restarted ? { sessionRestarted: true } : {}) };
  }
  async files(options = {}) {
    // Normal archive browsing is deliberately untouched. The named title/list
    // search keeps its established ASCII-only literal title/source/body match.
    const q = String(options.query ?? options.q ?? '').trim();
    if (!q || !this.textIndex.supported) return this.store.files(options);
    if (q.length > 8192) throw new Error('Search text must contain at most 8192 characters.');
    const revision = await this._revision(), periodRange = searchPeriodRange(options.period, this.now());
    options = { ...options, q, mode: 'titles', periodRange, stream: { started: this.now(), sentAt: -Infinity, after: 0, count: 0 } };
    const signature = this._signature(options, revision) + JSON.stringify([options.sort || 'updated', options.collectionId || '']);
    for (const [id, session] of this.fileSessions) if (this.now() - session.used > 600000 || session.revision !== revision) { session.spill.close(); this.fileSessions.delete(id); }
    checkAbort(options.signal);
    const cached = this.fileSessions.get(options.searchSession);
    if (cached?.signature === signature) return this._filePage(cached, options);
    await this._prepareSearch(options, revision);
    const folded = value => String(value).replace(/[A-Z]/g, letter => letter.toLowerCase()), query = folded(q);
    const order = options.sort === 'title' ? 'title COLLATE NOCASE,id' : options.sort === 'length' ? 'turn_count DESC,title COLLATE NOCASE,id' : 'sort_time DESC,updated_at DESC,id';
    const clauses = [], args = [];
    if (options.collectionId) { clauses.push('collection_id=?'); args.push(options.collectionId); }
    else if (options.collection && options.collection !== 'all') { clauses.push('collection=?'); args.push(options.collection); }
    if (options.provider && options.provider !== 'all') { clauses.push('provider=?'); args.push(String(options.provider).toLowerCase()); }
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
    const spill = this._spill(); let keep = false, current = 0, total = 0;
    try {
      const expected = this.store._open().prepare(`SELECT count(*) AS n FROM conversations ${where}`).get(...args).n;
      for (const row of this.store._open().prepare(`SELECT id,title,source_file FROM conversations ${where} ORDER BY ${order}`).iterate(...args)) {
        checkAbort(options.signal); current++;
        if (current % 64 === 0) { await this._searchProgress(options, spill, current, expected); await tick(); }
        if (!matchesSearchPeriod(this.textIndex.created(row.id), periodRange)) continue;
        let match = folded(row.title).includes(query) || folded(row.source_file).includes(query);
        if (!match) for (const passage of this.textIndex.passages({ conversationId: row.id })) { checkAbort(options.signal); if (folded(passage.text).includes(query)) { match = true; break; } }
        if (match) { const summary = this.store.getConversationSummary(row.id); spill.keywordMatch({ ...summary, passageId: row.id, turnIndex: 0, score: 0 }); total++; }
      }
      await this._searchProgress(options, spill, current, expected);
      checkAbort(options.signal);
      if (revision !== await this._revision()) throw new Error('The archive changed during search. Please retry.');
      const session = { spill, total, id: randomUUID(), signature, revision, used: this.now() };
      this._clearFileSessions(); this.fileSessions.set(session.id, session); keep = true;
      return this._filePage(session, options, Boolean(options.searchSession));
    } catch (error) {
      if (error.code === 'SEARCH_CACHE_CORRUPT') { this.textIndex.discard(); throw new Error('The compact search index was damaged and has been cleared. Retry the search to rebuild it from the preserved archive.'); }
      if (error.errcode === 13 || error.sqliteErrorCode === 13 || /database or disk is full/i.test(error.message)) throw new Error('Search working space is full. Narrow the query or collection, or free temporary disk space and retry.');
      throw error;
    } finally { if (!keep) spill.close(); }
  }
  async _ollamaRequest(base, endpoint, options = {}) {
    checkAbort(options.signal);
    const { timeoutMs = 120000, ...request } = options;
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    let response;
    try { response = await this.fetch(new URL(endpoint, base), { ...request, signal, redirect: 'error' }); }
    catch (error) {
      checkAbort(options.signal);
      throw new Error(`Cannot reach Ollama at ${base.origin}: ${error.message}. Start Ollama and check its address.`);
    }
    const text = await response.text();
    let body; try { body = JSON.parse(text); } catch { body = null; }
    if (!response.ok) throw Object.assign(new Error(`Ollama ${response.status}: ${body?.error ?? text.slice(0, 300) ?? response.statusText}`), { status: response.status });
    if (!body || typeof body !== 'object') throw new Error('Ollama returned an invalid JSON response. Check that this address belongs to an Ollama server.');
    return body;
  }
  async _ollamaTags(base, signal) {
    const body = await this._ollamaRequest(base, 'api/tags', { signal, timeoutMs: 4000 });
    if (!Array.isArray(body.models)) throw new Error('The Ollama address returned an invalid installed-model list.');
    return body.models.filter(row => row && typeof (row.name ?? row.model) === 'string');
  }
  _ollamaKey(base, tag) {
    return `ollama:${base.href}:${tag.name ?? tag.model}:${tag.digest ?? tag.modified_at ?? 'unknown'}:chunks-v1`;
  }
  async _ollamaModelInfo(base, tag, signal) {
    const name = tag.name ?? tag.model, key = this._ollamaKey(base, tag);
    let details;
    try {
      details = await this._ollamaRequest(base, 'api/show', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: name }), signal, timeoutMs: 6000 });
    } catch (error) {
      checkAbort(signal);
      return { name, capabilities: [], embedding: this.ollamaVerified.has(key) ? 'supported' : 'unknown',
        reason: this.ollamaVerified.has(key) ? 'Embedding support was verified with a test request.' : `The server did not report capabilities. Test this model before using it. ${error.message}` };
    }
    const capabilities = Array.isArray(details.capabilities) ? details.capabilities.filter(v => typeof v === 'string') : [];
    if (details.remote_host || details.remote_model) return { name, capabilities, embedding: 'unsupported', reason: 'This model uses a remote cloud service. Choose an installed local embedding model.' };
    const embedding = capabilities.length ? capabilities.includes('embedding') ? 'supported' : 'unsupported'
      : this.ollamaVerified.has(key) ? 'supported' : 'unknown';
    return { name, capabilities, embedding, reason: embedding === 'supported' ? 'Supports semantic-search embeddings.'
      : embedding === 'unsupported' ? 'This model does not support embeddings. A chat or title-generation model cannot be used for Reader search.'
      : 'This server does not report model capabilities. Use Test model to verify embedding support.' };
  }
  _ollamaEmbedder(base, model) {
    return async (texts, signal) => {
      const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal };
      try {
        const body = await this._ollamaRequest(base, 'api/embed', { ...init, body: JSON.stringify({ model, input: texts, truncate: true }) });
        if (!Array.isArray(body.embeddings) || body.embeddings.length !== texts.length) throw new Error('Ollama did not return an embedding for every input. Choose an embedding-capable model and use Test model.');
        return body.embeddings.map(normalizeVector);
      } catch (error) {
        if (error.status !== 404) throw error;
        const rows = [];
        for (const text of texts) {
          const body = await this._ollamaRequest(base, 'api/embeddings', { ...init, body: JSON.stringify({ model, prompt: text }) });
          rows.push(normalizeVector(body.embedding));
        }
        return rows;
      }
    };
  }
  async ollamaModels({ url, signal } = {}) {
    const base = localOllamaUrl(url), isLocal = isLoopbackOllama(base);
    const executable = isLocal ? await this.ollamaManager.findExecutable() : null;
    const common = { url: base.href, installed: Boolean(executable), isLocal, suggestedModel: 'embeddinggemma' };
    let tags;
    try { tags = await this._ollamaTags(base, signal); }
    catch (error) {
      checkAbort(signal);
      return { ...common, available: false, models: [], details: [],
        message: isLocal ? executable ? 'Ollama is installed but is not running. Use Start installed Ollama, then refresh models.' : 'Ollama is unavailable. Install or start it separately; text search and the built-in semantic model do not require Ollama.'
          : 'The remote Ollama server is unavailable. Start it on that computer and check its address.', detail: error.message };
    }
    let details = [];
    for (let offset = 0; offset < tags.length; offset += 4) {
      checkAbort(signal);
      details.push(...await Promise.all(tags.slice(offset, offset + 4).map(tag => this._ollamaModelInfo(base, tag, signal))));
    }
    details = await enrichOllamaModels(this, base, tags, details);
    details.sort((a, b) => a.name.localeCompare(b.name));
    const models = details.filter(model => model.embedding === 'supported').map(model => model.name);
    return { ...common, available: true, models, details,
      message: models.length ? 'Ollama is ready. Select an embedding model and use Test model.'
        : details.some(model => model.embedding === 'unknown') ? 'Ollama is running. Test a model whose embedding capability is unknown, or download an embedding model.'
        : tags.length ? 'Ollama is running, but the installed models do not support embeddings. Download an embedding model; chat and title-generation models are different.'
        : 'Ollama is running but has no installed models. Download an embedding model to use Ollama search.' };
  }
  async ollamaDelete(args) { this.sessions.clear(); return deleteOllamaModel(this, args); }
  async ollamaTest({ url, model, signal } = {}) {
    const base = localOllamaUrl(url), started = Date.now();
    if (!model) return this.ollamaModels({ url, signal });
    let tags;
    try { tags = await this._ollamaTags(base, signal); }
    catch (error) { checkAbort(signal); return { available: false, compatible: false, model, message: error.message }; }
    const tag = tags.find(tag => (tag.name ?? tag.model) === model || (tag.name ?? tag.model) === `${model}:latest`);
    if (!tag) return { available: true, compatible: false, model, message: `Model ${model} is not installed. Refresh models or download an embedding model.` };
    const info = await this._ollamaModelInfo(base, tag, signal);
    if (info.embedding === 'unsupported') return { available: true, compatible: false, model: info.name, capabilities: info.capabilities, message: info.reason };
    try {
      const [vector] = await this._ollamaEmbedder(base, info.name)(['ThreadShelf Local Reader embedding capability test.'], signal);
      this.ollamaVerified.set(this._ollamaKey(base, tag), vector.length);
      return { available: true, compatible: true, model: info.name, dimensions: vector.length, elapsedMs: Date.now() - started,
        capabilities: [...new Set([...info.capabilities, 'embedding'])], message: `Embedding test passed (${vector.length} dimensions). This test sent only synthetic text, not conversation content.` };
    } catch (error) {
      checkAbort(signal);
      return { available: true, compatible: false, model: info.name, message: `Embedding test failed: ${error.message}. Select or download an embedding model; text search and the built-in semantic model still work.` };
    }
  }
  async ollamaStart({ url, signal } = {}) {
    const base = localOllamaUrl(url);
    if (!isLoopbackOllama(base)) throw new Error('Start Ollama on the remote computer. The desktop app only starts an installation on this computer.');
    const before = await this.ollamaModels({ url, signal });
    if (before.available) return before;
    this._progress({ operation: 'ollama.start', phase: 'starting', message: 'Starting the installed local Ollama server.' });
    await this.ollamaManager.start(base, { signal });
    for (let attempt = 0; attempt < 30; attempt++) {
      checkAbort(signal);
      await delay(250, undefined, { signal });
      try { await this._ollamaTags(base, signal); return this.ollamaModels({ url, signal }); }
      catch (error) { checkAbort(signal); }
    }
    throw new Error('Ollama was started but its API is not ready. Check the installation and address, then refresh models.');
  }
  async ollamaPull({ url, model = 'embeddinggemma', signal } = {}) {
    const base = localOllamaUrl(url);
    model = String(model).trim();
    if (!/^[A-Za-z0-9_.:/-]{1,160}$/.test(model) || model.includes('..') || model.startsWith('-')) throw new Error('Enter a valid Ollama model name, for example embeddinggemma.');
    await this._ollamaTags(base, signal);
    const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(7200000)]) : AbortSignal.timeout(7200000);
    this._progress({ operation: 'ollama.pull', phase: 'download', message: `Downloading ${model} through the configured Ollama server.` });
    const response = await this.fetch(new URL('api/pull', base), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: model, stream: true }), signal: combined, redirect: 'error' });
    if (!response.ok || !response.body) throw new Error(`Ollama model download failed: HTTP ${response.status}. Start Ollama and check the model name.`);
    let pending = '', succeeded = false;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const consume = line => {
      if (!line.trim()) return;
      let event; try { event = JSON.parse(line); } catch { throw new Error('Ollama returned invalid model-download progress.'); }
      if (!event || typeof event !== 'object') throw new Error('Ollama returned invalid model-download progress.');
      if (event.error) throw new Error(`Ollama model download failed: ${event.error}`);
      if (event.status === 'success') succeeded = true;
      this._progress({ operation: 'ollama.pull', phase: 'download', current: Number(event.completed) || 0, total: Number(event.total) || undefined, message: event.status || `Downloading ${model}.` });
    };
    try {
      for await (const chunk of response.body) {
        checkAbort(combined); pending += decoder.decode(chunk, { stream: true });
        let end; while ((end = pending.indexOf('\n')) !== -1) { consume(pending.slice(0, end)); pending = pending.slice(end + 1); }
        if (pending.length > 1_048_576) throw new Error('Ollama returned an oversized model-download progress record.');
      }
      pending += decoder.decode(); if (pending.trim()) consume(pending); checkAbort(combined);
    } catch (error) { checkAbort(signal); throw error; }
    if (!succeeded) throw new Error('Ollama model download ended without confirmation. Retry to resume the download.');
    const status = await this.ollamaModels({ url, signal });
    const detail = status.details.find(row => row.name === model || row.name === `${model}:latest`);
    return { ...status, pulledModel: detail?.name ?? model, compatible: detail?.embedding === 'supported',
      message: detail?.embedding === 'supported' ? 'Embedding model downloaded. Select it and use Test model.'
        : detail?.embedding === 'unsupported' ? `Model downloaded, but it cannot be used for Reader search. ${detail.reason}`
        : 'Model downloaded. Its embedding capability is not confirmed; use Test model before search.' };
  }
  async searchOllama(options = {}) {
    options = { ...options, mode: 'ollama', role: archiveRole(options.role), periodRange: searchPeriodRange(options.period, this.now()), stream: { started: this.now(), sentAt: -Infinity, after: 0, count: 0 } };
    const q = String(options.q ?? '').trim();
    if (!q) return { results: [], total: 0 };
    if (q.length > 4000) throw new Error('Search queries are limited to 4,000 characters.');
    options.q = q;
    const model = String(options.model ?? options.ollamaModel ?? '').trim();
    if (!model) throw new Error('Select an installed Ollama embedding model in settings first.');
    const base = localOllamaUrl(options.url ?? options.ollamaUrl);
    options.url = base.href; options.model = model;
    const revision = await this._revision(), paged = options.page !== undefined || options.pageSize !== undefined || options.searchSession !== undefined;
    checkAbort(options.signal);
    const cached = paged && this._session(options, revision); if (cached) return this._sessionPage(cached, options);
    await this._prepareSearch(options, revision);
    options.useTextIndex = this.textIndex.supported;
    const tags = await this._ollamaTags(base, options.signal);
    const tag = tags.find(row => (row.name ?? row.model) === model);
    if (!tag) throw new Error(`Ollama model ${model} is not installed. Install an embedding model in Ollama, then refresh the model list.`);
    const capability = await this._ollamaModelInfo(base, tag, options.signal);
    if (capability.embedding === 'unsupported') throw new Error(capability.reason);
    const key = this._ollamaKey(base, tag), embed = this._ollamaEmbedder(base, model);
    if (capability.embedding === 'unknown' && !this.ollamaVerified.has(key)) {
      const tested = await this.ollamaTest({ url: base.href, model, signal: options.signal });
      if (!tested.compatible) throw new Error(tested.message);
    }
    const info = this.db.prepare('SELECT * FROM indexes WHERE model=?').get(key);
    if (!info || info.revision !== await this._revision()) await this._index({ key, embed, signal: options.signal, operation: 'ollama.index' });
    const spill = this._spill();
    try {
      await this._semantic({ ...options, q }, key, embed, spill);
      const result = await this._page(spill, 'semantic', { ...options, q, ...(paged ? { limit: 1000, offset: 0 } : {}) });
      if (revision !== await this._revision()) throw new Error('The archive changed during search. Run the search again to use its current contents.');
      checkAbort(options.signal);
      if (!paged) return result;
      const session = { ...result, id: randomUUID(), signature: this._signature(options, revision), revision, used: this.now() };
      while (this.sessions.size >= 2) this.sessions.delete([...this.sessions.values()].sort((a, b) => a.used - b.used)[0].id);
      this.sessions.set(session.id, session); return this._sessionPage(session, options, Boolean(options.searchSession));
    }
    catch (error) {
      if (error.code === 'SEARCH_CACHE_CORRUPT') { this.textIndex.discard(); this.sessions.clear(); this._clearFileSessions(); throw new Error('The compact search index was damaged and has been cleared. Retry the search to rebuild it from the preserved archive.'); }
      throw error;
    } finally { spill.close(); }
  }
  clearIndex() { this.sessions.clear(); this._clearFileSessions(); this.textIndex.discard(); this.db.exec('BEGIN; DELETE FROM vector_chunks; DELETE FROM vector_segments; DELETE FROM indexes; COMMIT;'); delete this.state.indexSummary; this._saveState(); }
  async close() { this.sessions.clear(); this._clearFileSessions(); await this.textIndex.queue; this.textIndex.close(); await this._dropRuntime(); this._db?.close(); this._db = null; }
}
