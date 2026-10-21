import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SearchService } from '../src/core/search.mjs';
import { referencedVectorObjects, verifyVectorCatalog, transcodeVectorCatalog, VECTOR_BLOCK_BYTES } from '../src/core/search-index.mjs';

const passage = (i, text = `Keyboard rotary profile number ${i}`) => ({ id: `c:${i}:user:0`, conversationId: `c${i}`, turnIndex: i * 3 + 7, role: i % 2 ? 'ai' : 'user', title: `Topic ${i}`, collection: i % 3 ? 'Hardware' : 'Music', provider: i % 2 ? 'chatgpt' : 'claude', text });
function streamingStore(rows) {
  return { version: 1, rows, scans: 0, passageReads: 0,
    passages() { throw new Error('All-passages materialization is forbidden.'); },
    searchRevision() { return this.version; },
    async *iterPassages() { this.scans++; for (const row of this.rows) yield row; },
    getPassage(id) { this.passageReads++; return this.rows.find(row => row.id === id); },
    getPassageMetadata({ id }) { const row = this.rows.find(row => row.id === id); if (!row) return null; const { text, ...metadata } = row; return metadata; },
  };
}
async function fixture(t, rows, extra = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tslr-segmented-search-'));
  const tempRoot = path.join(dataDir, 'temporary'), store = streamingStore(rows), counts = { embeds: 0 };
  const runtimeFactory = () => ({ async call(op, texts) { if (op === 'setup') return { dimension: 8 }; counts.embeds += texts.length; return texts.map(text => text.includes('dinner') ? [0,1,0,0,0,0,0,0] : [1,0,0,0,0,0,0,0]); }, async close() {} });
  const service = new SearchService({ store, dataDir, tempRoot, runtimeFactory, vectorBlockBytes: 4096, ...extra });
  t.after(async () => { await service.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  return { service, dataDir, tempRoot, store, counts };
}

test('streaming text search visits beyond 20,000 candidates and retains exact totals and pages', async t => {
  const rows = Array.from({ length: 20011 }, (_, i) => passage(i, `keyboard ${i}`));
  rows.at(-1).text = 'keyboard keyboard rotary unique finalist';
  const { service, tempRoot, store } = await fixture(t, rows);
  const page1 = await service.search({ q: 'keyboard rotary', limit: 7 });
  const page2 = await service.search({ q: 'keyboard rotary', limit: 7, offset: 7 });
  assert.equal(page1.total, 20011); assert.equal(page1.results[0].passageId, rows.at(-1).id);
  assert.ok(page2.results.every(row => !page1.results.some(previous => previous.passageId === row.passageId)));
  assert.equal(store.scans, 2); assert.deepEqual(fs.readdirSync(tempRoot), []);
});

test('global text ranking is independent of source segment/order with phrase exclusions and filters', async t => {
  const rows = [passage(0, 'rotary USB keyboard keyboard'), passage(1, 'rotary keyboard'), passage(2, 'USB keyboard piano'), passage(3, 'A USB keyboard serves as input')];
  rows[0].title = 'USB keyboard'; rows[1].title = 'Keyboard mapping';
  const { service, store } = await fixture(t, rows);
  const first = await service.search({ q: 'keyboard rotary', limit: 100 });
  store.rows.reverse();
  const reverse = await service.search({ q: 'keyboard rotary', limit: 100 });
  assert.deepEqual(first.results.map(row => [row.passageId, row.score]), reverse.results.map(row => [row.passageId, row.score]));
  const phrase = await service.search({ q: '"USB keyboard" -piano', provider: 'claude', role: 'user' });
  assert.deepEqual(phrase.results.map(row => row.passageId), [rows.at(-1).id]);
});

test('semantic vectors stay in bounded packs and selected results alone hydrate text', async t => {
  const { service, store, counts } = await fixture(t, Array.from({ length: 70 }, (_, i) => passage(i, i === 63 ? 'Fresh dinner meal' : `keyboard hardware ${i}`)));
  await service.setupSemantic(); await service.indexSemantic();
  const descriptors = service.db.prepare('SELECT * FROM vector_segments').all();
  assert.ok(descriptors.length > 1); assert.ok(descriptors.every(row => row.expandedBytes <= 4096 && row.expandedBytes <= VECTOR_BLOCK_BYTES));
  const tables = service.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);
  assert.ok(!tables.includes('vectors'));
  assert.equal((await verifyVectorCatalog(service.databasePath, service.objectsDir)).chunks, 70);
  const previous = counts.embeds;
  const result = await service.search({ q: 'dinner', mode: 'semantic', limit: 3 });
  assert.equal(result.results[0].conversationId, 'c63'); assert.equal(result.total, 70);
  assert.equal(store.passageReads, 3); assert.equal(counts.embeds, previous + 1);
  assert.match(result.results[0].text, /dinner/);
});

test('both vector compression conversions preserve index identity, scores and model generation', async t => {
  const { service } = await fixture(t, Array.from({ length: 25 }, (_, i) => passage(i)));
  await service.setupSemantic(); await service.indexSemantic();
  const info = service.db.prepare('SELECT * FROM indexes').get();
  const expected = await service.search({ q: 'keyboard', mode: 'semantic', limit: 100 });
  for (const profile of ['zip6', '7z']) {
    service._db.close(); service._db = null;
    await transcodeVectorCatalog(service.databasePath, service.objectsDir, profile);
    assert.ok(referencedVectorObjects(service.databasePath).every(name => name.endsWith(profile === 'zip6' ? '.zip' : '.7z')));
    await verifyVectorCatalog(service.databasePath, service.objectsDir);
    assert.deepEqual(service.db.prepare('SELECT * FROM indexes').get(), info);
    assert.deepEqual(await service.search({ q: 'keyboard', mode: 'semantic', limit: 100 }), expected);
  }
});

test('cancelled rebuild retains the complete previous generation and clears pending refs', async t => {
  const { service, store } = await fixture(t, Array.from({ length: 40 }, (_, i) => passage(i)));
  await service.setupSemantic(); await service.indexSemantic();
  const old = service.db.prepare('SELECT * FROM indexes').get(), oldRefs = referencedVectorObjects(service.databasePath);
  store.version++; store.rows[0].text += ' changed';
  const controller = new AbortController(); service.onProgress = event => { if (event.phase === 'indexing' && event.current === 20) controller.abort(); };
  await assert.rejects(service.indexSemantic({ signal: controller.signal }), { name: 'AbortError' });
  assert.deepEqual(service.db.prepare('SELECT * FROM indexes').get(), old);
  assert.deepEqual(referencedVectorObjects(service.databasePath), oldRefs);
  assert.equal(service.db.prepare('SELECT COUNT(DISTINCT generation) n FROM vector_segments').get().n, 1);
  assert.equal((await service.status()).needsIndexing, true);
  service.onProgress = () => {}; await service.indexSemantic();
  assert.equal((await service.status()).needsIndexing, false);
});

test('corrupt semantic pack falls back to text and reports the checksum failure', async t => {
  const { service, tempRoot } = await fixture(t, [passage(1)]);
  await service.setupSemantic(); await service.indexSemantic();
  const [name] = referencedVectorObjects(service.databasePath), target = path.join(service.objectsDir, name);
  const bytes = fs.readFileSync(target); bytes[bytes.length - 1] ^= 1; fs.writeFileSync(target, bytes);
  await assert.rejects(verifyVectorCatalog(service.databasePath, service.objectsDir), /checksum/);
  const result = await service.search({ q: 'keyboard', mode: 'semantic' });
  assert.equal(result.total, 1); assert.match(result.notice, /checksum/); assert.deepEqual(fs.readdirSync(tempRoot), []);
});

test('hybrid global reciprocal-rank fusion remains exact beyond requested window', async t => {
  const { service } = await fixture(t, Array.from({ length: 50 }, (_, i) => passage(i, i % 7 ? `keyboard hardware ${i}` : `dinner keyboard ${i}`)));
  await service.setupSemantic(); await service.indexSemantic();
  const keyword = await service.search({ q: 'dinner', mode: 'keyword', limit: 1000 });
  const semantic = await service.search({ q: 'dinner', mode: 'semantic', limit: 1000 });
  const expected = new Map();
  for (const list of [keyword.results, semantic.results]) list.forEach((row, rank) => expected.set(row.passageId, (expected.get(row.passageId) ?? 0) + 1 / (61 + rank)));
  const actual = await service.search({ q: 'dinner', mode: 'hybrid', limit: 3, offset: 5 });
  assert.equal(actual.total, 50);
  for (const row of actual.results) assert.ok(Math.abs(row.score - expected.get(row.passageId)) < 1e-12);
  const scores = [...expected.values()].sort((a, b) => b - a).slice(5, 8);
  assert.deepEqual(actual.results.map(row => row.score), scores);
});

test('search cancellation always removes owned spill files', async t => {
  const { service, tempRoot } = await fixture(t, Array.from({ length: 300 }, (_, i) => passage(i)));
  const controller = new AbortController(); service.onProgress = event => { if (event.phase === 'searching') controller.abort(); };
  await assert.rejects(service.search({ q: 'keyboard', signal: controller.signal }), { name: 'AbortError' });
  assert.deepEqual(fs.readdirSync(tempRoot), []);
});

test('vector conversion yields between blocks so cancellation can interrupt staging', async t => {
  const { service, dataDir } = await fixture(t, Array.from({ length: 35 }, (_, i) => passage(i)));
  await service.setupSemantic(); await service.indexSemantic();
  service.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const staged = path.join(dataDir, 'staged-vectors.sqlite'); fs.copyFileSync(service.databasePath, staged);
  const controller = new AbortController(); let progress = 0;
  await assert.rejects(transcodeVectorCatalog(staged, service.objectsDir, 'zip6', { signal: controller.signal, onProgress() { progress++; setImmediate(() => controller.abort()); } }), { name: 'AbortError' });
  assert.equal(progress, 1);
  assert.ok(referencedVectorObjects(service.databasePath).every(name => name.endsWith('.7z')), 'active metadata must remain untouched');
  assert.equal((await service.search({ q: 'keyboard', mode: 'semantic' })).total, 35);
});

test('metadata-only archive and semantic index preserve sparse anchors and content through reads', async t => {
  const { ArchiveStore } = await import('../src/core/archive.mjs');
  const { service, dataDir } = await fixture(t, []);
  const store = new ArchiveStore({ dataDir: path.join(dataDir, 'archive'), contentDir: service.objectsDir }); store.init();
  try {
    service.store = store;
    store.upsert({ collection: 'Hardware', title: 'Mapping', provider: 'chatgpt', sourceFile: 'sample.json', conversationKey: 'original', turns: [{ user: 'Keyboard mapping', turn_index: 29 }, { ai: 'A fresh dinner', turn_index: 75 }] });
    store.passages = () => { throw new Error('Unbounded passage access forbidden'); };
    await service.setupSemantic(); await service.indexSemantic();
    const result = await service.search({ q: 'dinner', mode: 'semantic', role: 'assistant' });
    assert.equal(result.total, 1); assert.equal(result.results[0].turnIndex, 75); assert.equal(result.results[0].role, 'ai');
    assert.match(result.results[0].text, /dinner/);
  } finally { store.close(); }
});

test('bounded search workspace reports exhaustion and remains usable after cleanup', async t => {
  const rows = Array.from({ length: 5000 }, (_, i) => ({ ...passage(i), title: `Title ${'extended '.repeat(80)} ${i}` }));
  rows[0].text = 'Unique recovery-marker keyboard';
  const { service, tempRoot } = await fixture(t, rows, { searchWorkspaceBytes: 1024 * 1024 });
  await assert.rejects(service.search({ q: 'keyboard' }), /Search working space is full/);
  assert.deepEqual(fs.readdirSync(tempRoot), []);
  assert.equal((await service.search({ q: 'Unique recovery-marker', mode: 'exact' })).total, 1);
  assert.deepEqual(fs.readdirSync(tempRoot), []);
});

test('an import changing the archive during a yielded query discards mixed-revision results', async t => {
  const { service, store, tempRoot } = await fixture(t, Array.from({ length: 300 }, (_, i) => passage(i)));
  let changed = false;
  service.onProgress = event => { if (!changed && event.phase === 'searching') { changed = true; store.version++; store.rows[290].text = 'Imported replacement'; } };
  await assert.rejects(service.search({ q: 'keyboard' }), /archive changed during search/);
  assert.deepEqual(fs.readdirSync(tempRoot), []);
  assert.equal((await service.search({ q: 'keyboard' })).total, 299);
});

test('text fallback from a concurrent semantic query cannot terminate an active index worker', async t => {
  const { service } = await fixture(t, [passage(1), passage(2)]);
  await service.setupSemantic();
  let release, entered, closed = false;
  const started = new Promise(resolve => { entered = resolve; });
  service.runtime = { async call() { entered(); await new Promise(resolve => { release = resolve; }); if (closed) throw new Error('Worker was closed'); return [[1,0,0]]; }, async close() { closed = true; release?.(); } };
  const indexing = service.indexSemantic();
  await started;
  const concurrent = await service.search({ q: 'keyboard', mode: 'semantic' });
  assert.equal(concurrent.total, 2); assert.match(concurrent.notice, /indexing is running/); assert.equal(closed, false);
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(service.search({ q: 'keyboard', mode: 'semantic', signal: cancelled.signal }), { name: 'AbortError' });
  assert.equal(closed, false, 'cancelling fallback text must not close the indexing model');
  service.runtime.call = async () => [[1,0,0]]; release();
  await indexing; assert.equal((await service.status()).needsIndexing, false);
});
