import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ArchiveStore } from '../src/core/archive.mjs';
import { SearchService } from '../src/core/search.mjs';
import { searchPeriodRange } from '../src/core/search-text-index.mjs';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const doc = (key, created, text = 'Cobalt keyboard árv íz 日本語 F13 through F24') => ({ provider: 'chatgpt', collection: 'Imported', title: `Title ${key}`, conversationKey: key, sourceFile: `${key}.json`, raw: { create_time: created }, turns: [{ user: text, turn_index: 7 }, { ai: 'The keyboard layout uses cobalt switches.', turn_index: 20 }] });
async function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-search-r2-'));
  const store = new ArchiveStore({ dataDir: path.join(root, 'archive'), cacheBytes: 0 }).init();
  const search = new SearchService({ dataDir: root, store, now: () => NOW, ...options });
  t.after(async () => { await search.close(); store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, store, search };
}

test('compact text cache preserves original scoring, Unicode, literal phrases and fuzzy semantics', async t => {
  const { root, store, search } = await fixture(t);
  store.upsert(doc('old', '2020-01-01')); store.upsert(doc('recent', '2026-10-18'));
  store.upsert(doc('negated', '2026-10-17', 'A piano keyboard with F13 through F24 and Hungarian árvíz.'));
  const uncached = new SearchService({ dataDir: path.join(root, 'uncached'), store: { revision: () => store.searchRevision(), iterPassages: options => store.iterPassages(options) } });
  try {
    for (const options of [{ q: 'cobalt keyboard' }, { q: '"keyboard layout" -piano' }, { q: 'F13 through F24', mode: 'exact' }, { q: 'keybaord', mode: 'fuzzy' }, { q: 'árvíz 日本語' }]) {
      assert.deepEqual(await search.search(options), await uncached.search(options));
    }
    assert.equal((await search.status()).textIndex.passages, 6);
  } finally { await uncached.close(); }
});

test('periods use original conversation creation, exclude undated/future records and prefilter compressed text', async t => {
  const { store, search } = await fixture(t);
  const old = store.upsert(doc('old', '2018-01-01')).summary.id;
  store.upsert(doc('recent', '2026-10-18')); store.upsert(doc('undated', null)); store.upsert(doc('future', '2027-01-01'));
  assert.equal((await search.search({ q: 'cobalt', period: 'all' })).total, 8);
  assert.equal((await search.search({ q: 'cobalt', period: 'week' })).total, 2);
  assert.equal((await search.files({ q: 'cobalt', period: 'week' })).total, 1);
  // A corrupt old text block must not even be opened by the metadata predicate.
  search.textIndex.db.prepare('UPDATE blocks SET data=? WHERE conversation=?').run(Buffer.from('broken'), old);
  assert.equal((await search.search({ q: 'cobalt', period: 'month' })).total, 2);
  await assert.rejects(search.search({ q: 'cobalt' }), /damaged.*cleared/);
  assert.equal((await search.search({ q: 'cobalt' })).total, 8, 'retry recovers from original archive');
});

test('period cutoffs clamp calendar months and reject arbitrary custom inputs', () => {
  const range = searchPeriodRange('month', new Date(2026, 2, 31, 12).getTime());
  assert.equal(new Date(range.start).getMonth(), 1); assert.equal(new Date(range.start).getDate(), 28);
  assert.equal(searchPeriodRange('all', NOW), null);
  assert.throws(() => searchPeriodRange('yesterday', NOW), /supported search period/);
});

test('incremental indexing reuses unchanged conversations, survives cancellation and repairs damaged SQLite', async t => {
  const { root, store, search } = await fixture(t);
  store.upsert(doc('one', '2026-10-18')); store.upsert(doc('two', '2026-10-17'));
  await search.prepareText(); const reads = store.cacheStats().decodedObjects;
  assert.equal((await search.search({ q: 'cobalt' })).total, 4); assert.equal(store.cacheStats().decodedObjects, reads);
  store.upsert(doc('two', '2026-10-17', 'Changed cobalt content'));
  await search.prepareText(); assert.equal(search.textIndex.stats.decodedConversations, 1); assert.equal(search.textIndex.stats.reusedConversations, 1);
  const revision = search.textIndex.db.prepare("SELECT value FROM metadata WHERE key='revision'").get().value;
  store.upsert(doc('three', '2026-10-19'));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(search.prepareText({ signal: controller.signal }), { name: 'AbortError' });
  assert.equal(search.textIndex.db.prepare("SELECT value FROM metadata WHERE key='revision'").get().value, revision);
  await search.prepareText(); search.textIndex.close(); fs.writeFileSync(path.join(root, 'search/text-v1.sqlite'), 'broken database');
  assert.equal((await search.search({ q: 'cobalt' })).total, 6); assert.equal(search.textIndex.stats.recovery, 'rebuilt-cache');
});

test('ranked pagination reuses frozen results, clamps pages and invalidates on revision or query changes', async t => {
  const { store, search } = await fixture(t);
  for (let i = 0; i < 15; i++) store.upsert(doc(String(i), '2026-10-18'));
  const first = await search.search({ q: 'cobalt', page: 1, pageSize: 7 });
  const reads = store.cacheStats().decodedObjects;
  const original = search._keyword; search._keyword = () => { throw new Error('Must not rerun a cached query'); };
  const second = await search.search({ q: 'cobalt', page: 2, pageSize: 7, searchSession: first.searchSession });
  assert.equal(second.searchSession, first.searchSession); assert.equal(second.page, 2); assert.equal(second.results.length, 7);
  assert.equal(new Set([...first.results, ...second.results].map(r => r.passageId)).size, 14); assert.equal(store.cacheStats().decodedObjects, reads);
  assert.equal((await search.search({ q: 'cobalt', page: 999, pageSize: 7, searchSession: first.searchSession })).page, 5);
  search._keyword = original;
  store.upsert(doc('new', '2026-10-19'));
  const revised = await search.search({ q: 'cobalt', page: 2, pageSize: 7, searchSession: first.searchSession });
  assert.notEqual(revised.searchSession, first.searchSession); assert.equal(revised.sessionRestarted, true); assert.equal(revised.page, 1); assert.equal(revised.matchedTotal, 32);
  const changed = await search.search({ q: 'absent', page: 2, pageSize: 7, searchSession: revised.searchSession });
  assert.equal(changed.page, 1); assert.equal(changed.total, 0); assert.equal(changed.sessionRestarted, true);
});

test('title/list sessions preserve fullbody literal matching and metadata ordering without rescans', async t => {
  const { store, search } = await fixture(t);
  for (let i = 0; i < 12; i++) store.upsert(doc(String(i).padStart(2, '0'), '2026-10-18'));
  const expected = store.files({ q: 'cobalt', sort: 'title', page: 2, pageSize: 5 });
  const first = await search.files({ q: 'cobalt', sort: 'title', page: 1, pageSize: 5 });
  const original = search.textIndex.passages; search.textIndex.passages = () => { throw new Error('Cached page must not decode'); };
  const second = await search.files({ q: 'cobalt', sort: 'title', page: 2, pageSize: 5, searchSession: first.searchSession });
  assert.deepEqual(second.files, expected.files); assert.equal(second.total, expected.total); assert.equal(second.searchSession, first.searchSession);
  search.textIndex.passages = original;
  const none = await search.files({ q: 'ÁRV', searchSession: first.searchSession });
  assert.equal(none.total, 0, 'the old literal list policy is ASCII-only, unlike ranked search');
});

test('fast searches publish no partials; slow searches append stable unique batches and abort removes spill files', async t => {
  let clock = NOW; const events = [], controller = new AbortController();
  const { root, store, search } = await fixture(t, { now: () => clock, onProgress: event => events.push(event) });
  store.upsert({ ...doc('large', '2026-10-18'), turns: Array.from({ length: 600 }, (_, i) => ({ user: `Cobalt keyboard ${i}`, turn_index: i })) });
  await search.prepareText();
  await search.search({ q: 'cobalt', searchId: 'fast' }); assert.equal(events.some(e => e.phase === 'search-results'), false);
  search.onProgress = event => { events.push(event); if (event.phase === 'searching') clock += 46000; if (event.phase === 'search-results' && event.searchId === 'slow' && events.filter(e => e.phase === 'search-results').length === 2) controller.abort(); };
  await assert.rejects(search.search({ q: 'cobalt', searchId: 'slow', signal: controller.signal }), { name: 'AbortError' });
  const partial = events.filter(e => e.phase === 'search-results');
  assert.equal(partial.length, 2); assert.ok(partial.every(e => e.searchId === 'slow' && e.provisional));
  const ids = partial.flatMap(e => e.results.map(r => r.passageId)); assert.equal(new Set(ids).size, ids.length); assert.ok(ids.length > 0);
  // SearchSpill uses the configured private directory in this test.
  search.tempRoot = path.join(root, 'spill'); clock = NOW;
  await search.search({ q: 'cobalt', searchId: 'new' }); assert.deepEqual(fs.readdirSync(search.tempRoot), []);
});

test('simultaneous searches keep progress IDs separate and cancelling one does not cancel the other', async t => {
  const { store, search } = await fixture(t, { partialAfterMs: 0 });
  store.upsert({ ...doc('overlap', '2026-10-18'), turns: Array.from({ length: 300 }, (_, i) => ({ user: `Cobalt keyboard ${i}`, turn_index: i })) });
  await search.prepareText(); const a = new AbortController(), events = [];
  search.onProgress = event => { events.push(event); if (event.phase === 'search-results' && event.searchId === 'a') a.abort(); };
  const results = await Promise.allSettled([search.search({ q: 'cobalt', searchId: 'a', signal: a.signal }), search.search({ q: 'keyboard', searchId: 'b' })]);
  assert.equal(results[0].status, 'rejected'); assert.equal(results[0].reason.name, 'AbortError'); assert.equal(results[1].status, 'fulfilled'); assert.equal(results[1].value.total, 300);
  assert.deepEqual(new Set(events.filter(e => e.phase === 'search-results').map(e => e.searchId)), new Set(['a', 'b']));
});

test('text blocks preserve large messages exactly and clearing index removes derived copies', async t => {
  const { root, store, search } = await fixture(t);
  const text = '日本語 é keyboard '.repeat(50000) + ' unique-ending'; store.upsert(doc('large-message', '2026-10-18', text));
  await search.prepareText(); const rows = [...search.textIndex.passages()]; assert.equal(rows[0].text, text);
  assert.ok(search.textIndex.db.prepare('SELECT count(*) AS n FROM blocks').get().n > 1);
  assert.equal((await search.search({ q: 'unique-ending', mode: 'exact' })).total, 1);
  await search.files({ q: 'keyboard' }); assert.equal(search.fileSessions.size, 1);
  search.clearIndex(); assert.equal(fs.existsSync(path.join(root, 'search/text-v1.sqlite')), false); assert.equal(search.fileSessions.size, 0);
});

test('cancelled mid-build preserves the last committed text generation and explicit Prepare repairs corrupt blocks', async t => {
  const { store, search } = await fixture(t);
  for (let i = 0; i < 10; i++) store.upsert(doc(String(i), '2026-10-18'));
  await search.prepareText(); const previous = search.textIndex.db.prepare("SELECT value FROM metadata WHERE key='revision'").get().value;
  for (let i = 0; i < 10; i++) store.upsert(doc(String(i), '2026-10-18', `Changed content ${i}`));
  const controller = new AbortController(); search.onProgress = event => { if (event.phase === 'search-index' && event.current === 8) controller.abort(); };
  await assert.rejects(search.prepareText({ signal: controller.signal }), { name: 'AbortError' });
  assert.equal(search.textIndex.db.prepare("SELECT value FROM metadata WHERE key='revision'").get().value, previous);
  assert.match([...search.textIndex.passages()][0].text, /Cobalt/);
  search.onProgress = () => {}; await search.prepareText();
  search.textIndex.db.prepare('UPDATE blocks SET data=? WHERE conversation=(SELECT id FROM conversations LIMIT 1)').run(Buffer.from('broken'));
  await search.prepareText(); assert.equal((await search.search({ q: 'Changed' })).total, 10);
});

test('ranked sessions retain the existing 1000-result cap and cancelled cached pages reject', async t => {
  const { store, search } = await fixture(t);
  store.upsert({ ...doc('broad', '2026-10-18'), turns: Array.from({ length: 1101 }, (_, i) => ({ user: `Keyboard ${i}`, turn_index: i })) });
  const first = await search.search({ q: 'keyboard', page: 1, pageSize: 200 });
  assert.equal(first.total, 1000); assert.equal(first.matchedTotal, 1101); assert.equal(first.searchInfo.truncated, true);
  const last = await search.search({ q: 'keyboard', page: 6, pageSize: 200, searchSession: first.searchSession });
  assert.equal(last.page, 5); assert.equal(last.results.length, 200); assert.equal(last.hasMore, false);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(search.search({ q: 'keyboard', page: 2, pageSize: 200, searchSession: first.searchSession, signal: controller.signal }), { name: 'AbortError' });
});

test('slow no-match searches still activate provisional state after the threshold', async t => {
  let now = NOW; const events = [];
  const { store, search } = await fixture(t, { now: () => now, onProgress: event => { events.push(event); if (event.phase === 'searching') now += 46000; } });
  store.upsert({ ...doc('no-matches', '2026-10-18'), turns: Array.from({ length: 300 }, (_, i) => ({ user: `Keyboard ${i}` })) });
  await search.prepareText();
  const result = await search.search({ q: 'nonexistent', searchId: 'empty' });
  assert.equal(result.total, 0); const partials = events.filter(e => e.phase === 'search-results');
  assert.equal(partials.length, 1); assert.equal(partials[0].searchId, 'empty'); assert.deepEqual(partials[0].results, []);
});
