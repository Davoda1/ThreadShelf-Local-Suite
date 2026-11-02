import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { connect } from '@lancedb/lancedb';
import express from 'express';

// Only synthetic rows, in isolated storage. No actual chat files or user DBs.
const temp = await mkdtemp(join(tmpdir(), 'threadshelf-reader-pagination-'));
process.env.LANCEDB_PATH = join(temp, 'lancedb');
process.env.COLLECTIONS_PATH = join(temp, 'collections.json');
const { createReaderSearchRouter } = await import('../src/routes/reader-search.js');
const { default: searchRouter } = await import('../src/routes/search.js');
const { requireLocalOrigin } = await import('../src/routes/local-origin.js');
const { readerSearchCollectionSnapshot } = await import('../src/store.js');
const database = await connect(process.env.LANCEDB_PATH, { readConsistencyInterval: 0 });
let server;
let base;
let embeddingCalls = 0;
let embeddingGate;
const query = 'paginationneedle';
const row = (collection, i) => ({
  id: `${collection}-${String(i).padStart(4, '0')}`,
  vector: [1, 0, 0],
  document: `${query} synthetic document ${i}`,
  sourceFile: `${collection}-fixture.json`,
  provider: i % 2 ? 'anthropic' : 'openai',
  conversationKey: `conversation-${i}`,
  title: `Synthetic title ${i}`,
  role: i % 2 ? 'ai' : 'user',
  turnIndex: '0',
  model: i % 10 ? 'ordinary-model' : 'rare-model',
  createdAt: i % 2 ? '2026-01-05T12:00:00.000Z' : '2026-01-03T12:00:00.000Z',
  createdInThreadShelf: i % 3 === 0,
  generationProvider: '',
});
const identity = (r) => `${r.metadata.collection}/${r.id}`;
const request = async (options = {}, path = '/api/reader/search') => {
  const url = new URL(path, base);
  for (const [key, value] of Object.entries({ q: query, collection: 'all', n: 50, mode: 'keyword', ...options })) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url);
  return { status: response.status, body: await response.json() };
};
const allPages = async (options = {}) => {
  let cursor;
  let expectedTotal;
  const results = [];
  let pages = 0;
  do {
    assert.ok(++pages < 1000, 'cursor must make finite progress');
    const { status, body } = await request({ ...options, cursor });
    assert.equal(status, 200, JSON.stringify(body));
    expectedTotal ??= body.total;
    assert.equal(body.total, expectedTotal);
    assert.ok(body.results.length <= Number(options.n ?? 50));
    assert.equal(body.hasMore, body.nextCursor !== null);
    results.push(...body.results);
    cursor = body.nextCursor;
  } while (cursor);
  assert.equal(results.length, expectedTotal);
  assert.equal(new Set(results.map(identity)).size, expectedTotal, 'pages cannot overlap');
  return results;
};
before(async () => {
  for (const collection of ['alpha', 'beta']) {
    await database.createTable(collection, Array.from({ length: 260 }, (_, i) => row(collection, i)));
  }
  const app = express();
  app.use('/api', requireLocalOrigin);
  app.use(createReaderSearchRouter(async () => {
    embeddingCalls++;
    if (embeddingGate) await embeddingGate();
    return [1, 0, 0];
  }));
  app.use(searchRouter);
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(temp, { recursive: true, force: true });
});

describe('Reader v1 cursor extension on actual ThreadShelf 1.4.1 code', () => {
  it('advertises the original capability contract', async () => {
    const { body } = await request({}, '/api/reader/capabilities');
    assert.equal(body.readerSearch.version, 1);
    assert.equal(body.readerSearch.path, '/api/reader/search');
    assert.equal(body.readerSearch.maxPageSize, 50);
    assert.equal(body.readerSearch.cursor, true);
    assert.equal(body.readerSearch.exactTotal, true);
  });
  for (const [label, options] of [
    ['keyword', { mode: 'keyword' }],
    ['meaning', { mode: 'semantic' }],
    ['smart', { mode: 'semantic', keywordBoost: true }],
  ]) {
    it(`${label} reaches all 520 chunks beyond the old 50/200 cutoffs, without duplicates`, async () => {
      const beforeCalls = embeddingCalls;
      const rows = await allPages(options);
      assert.equal(rows.length, 520);
      assert.equal(embeddingCalls - beforeCalls, options.mode === 'semantic' ? 1 : 0);
      const again = await request(options);
      assert.deepEqual(again.body.results.map(identity), rows.slice(0, 50).map(identity), 'equal-rank ordering must be repeatable');
    });
  }
  it('single-collection pages and final short page are exact', async () => {
    const rows = await allPages({ collection: 'alpha', n: 17 });
    assert.equal(rows.length, 260);
    assert.ok(rows.every((r) => r.metadata.collection === 'alpha'));
  });
  it('rare model matches past rank 200 are preserved in semantic searches', async () => {
    const rows = await allPages({ mode: 'semantic', model: 'rare-model', n: 7 });
    assert.equal(rows.length, 52);
    assert.ok(rows.every((r) => r.metadata.model === 'rare-model'));
  });
  it('applies provider, role, date and origin filters before pagination', async () => {
    const opts = { provider: 'openai', roles: 'user', from: '2026-01-03', to: '2026-01-03', origin: 'threadshelf', n: 13 };
    const rows = await allPages(opts);
    assert.equal(rows.length, 88);
    assert.ok(rows.every((r) => r.metadata.provider === 'openai' && r.metadata.role === 'user' && r.metadata.createdInThreadShelf));
    const archive = await allPages({ origin: 'archive' });
    assert.equal(archive.length, 346);
  });
  it('returns an empty complete page when there are no matches', async () => {
    const { status, body } = await request({ q: 'unmatched-synthetic-token' });
    assert.equal(status, 200);
    assert.deepEqual(body, { results: [], total: 0, hasMore: false, nextCursor: null });
  });
  it('rejects altered query/filter cursors, invalid offsets and invalid page sizes', async () => {
    const { body } = await request();
    const cursor = body.nextCursor;
    for (const change of [{ q: 'other' }, { model: 'rare-model' }, { provider: 'openai' }, { origin: 'archive' }]) {
      assert.equal((await request({ cursor, ...change })).status, 400);
    }
    assert.equal((await request({ cursor: 'invalid' })).status, 400);
    assert.equal((await request({ cursor: `${cursor.split('.')[0]}.999999` })).status, 400);
    assert.equal((await request({ n: 51 })).status, 400);
    assert.equal((await request({ n: -1 })).status, 400);
    assert.equal((await request({ origin: 'invalid' })).status, 400);
    assert.equal((await request({ cursor: `${'0'.repeat(48)}.50` })).status, 410);
  });
  it('deleting a snapshot makes its cursor expire explicitly', async () => {
    const { body } = await request();
    const deleted = await fetch(`${base}/api/reader/search?cursor=${encodeURIComponent(body.nextCursor)}`, { method: 'DELETE' });
    assert.equal(deleted.status, 204);
    assert.equal((await request({ cursor: body.nextCursor })).status, 410);
  });
  it('preserves the upstream search response and validation contract', async () => {
    const result = await request({}, '/api/search');
    assert.equal(result.status, 200);
    assert.deepEqual(Object.keys(result.body), ['results']);
    assert.equal(result.body.results.length, 50);
    assert.equal((await request({ n: 51 }, '/api/search')).status, 400);
  });
  it('keeps an active result snapshot stable when database rows change', async () => {
    const { body: first } = await request({ collection: 'alpha' });
    const table = await database.openTable('alpha');
    await table.add([row('alpha', 999)]);
    const { body: next } = await request({ collection: 'alpha', cursor: first.nextCursor });
    assert.equal(next.total, 260);
    assert.ok(!next.results.some((r) => r.id === 'alpha-0999'));
    const fresh = await request({ collection: 'alpha' });
    assert.equal(fresh.body.total, 261);
  });

  it('supports the Alternative first-page cursor and resized pages without changing the snapshot', async () => {
    const options = { collection: 'beta', n: 17 };
    const { body: first } = await request(options);
    assert.match(first.nextCursor, /^[a-f0-9]{48}\.17$/);
    const { status, body: second } = await request({ ...options, n: 23, cursor: first.nextCursor });
    assert.equal(status, 200);
    assert.equal(second.total, 260);
    assert.equal(second.results.length, 23);
    assert.equal(second.nextCursor, first.nextCursor.replace(/\.17$/, '.40'));
    const rewind = first.nextCursor.replace(/\.17$/, '.0');
    const { body: again } = await request({ ...options, cursor: rewind });
    assert.deepEqual(again.results, first.results);
    const { status: endStatus, body: end } = await request({ ...options, cursor: rewind.replace(/\.0$/, '.260') });
    assert.equal(endStatus, 200);
    assert.deepEqual(end, { results: [], total: 260, hasMore: false, nextCursor: null });
  });

  it('expires at the fixed 15-minute deadline even after a successful continuation', async (t) => {
    let now = Date.now();
    t.mock.method(Date, 'now', () => now);
    const { body: first } = await request({ collection: 'beta' });
    now += 14 * 60 * 1000;
    assert.equal((await request({ collection: 'beta', cursor: first.nextCursor })).status, 200);
    now += 60 * 1000 + 1;
    assert.equal((await request({ collection: 'beta', cursor: first.nextCursor })).status, 410);
  });

  it('evicts the least recently used snapshot and preserves a recently touched snapshot', async () => {
    const cursors = [];
    for (let i = 0; i < 8; i++) cursors.push((await request({ collection: 'beta' })).body.nextCursor);
    assert.equal((await request({ collection: 'beta', cursor: cursors[0] })).status, 200);
    await request({ collection: 'beta' });
    assert.equal((await request({ collection: 'beta', cursor: cursors[1] })).status, 410);
    assert.equal((await request({ collection: 'beta', cursor: cursors[0] })).status, 200);
  });

  it('rejects a third simultaneous snapshot build and releases admission after completion', async () => {
    const releases = [];
    embeddingGate = () => new Promise((resolve) => releases.push(resolve));
    const first = request({ collection: 'beta', mode: 'semantic' });
    const second = request({ collection: 'beta', mode: 'semantic' });
    try {
      for (let attempt = 0; releases.length < 2 && attempt < 200; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(releases.length, 2, 'both builds reached the embedding gate');
      const blocked = await request({ collection: 'beta', mode: 'semantic' });
      assert.equal(blocked.status, 503);
    } finally {
      embeddingGate = undefined;
      for (const release of releases) release();
    }
    assert.equal((await first).status, 200);
    assert.equal((await second).status, 200);
    assert.equal((await request({ collection: 'beta', mode: 'semantic' })).status, 200);
  });

  it('retains upstream Host and Origin protections for capabilities, reads, and deletion', async () => {
    for (const endpoint of ['/api/reader/capabilities', '/api/reader/search?q=test']) {
      const badOrigin = await fetch(`${base}${endpoint}`, { headers: { Origin: 'https://untrusted.invalid' } });
      assert.equal(badOrigin.status, 403);
      // Node fetch rewrites Host; use the native HTTP client to actually send
      // a hostile Host header through the unchanged upstream middleware.
      const badHostStatus = await new Promise((resolve, reject) => {
        const req = httpRequest(`${base}${endpoint}`, { headers: { Host: 'untrusted.invalid' } }, (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode));
        });
        req.on('error', reject);
        req.end();
      });
      assert.equal(badHostStatus, 403);
    }
    const { body } = await request({ collection: 'beta' });
    const blocked = await fetch(`${base}/api/reader/search?cursor=${body.nextCursor}`, {
      method: 'DELETE', headers: { Origin: 'https://untrusted.invalid' },
    });
    assert.equal(blocked.status, 403);
    assert.equal((await request({ collection: 'beta', cursor: body.nextCursor })).status, 200);
    const allowed = await fetch(`${base}/api/reader/capabilities`, { headers: { Origin: base } });
    assert.equal(allowed.status, 200);
  });

  it('keeps keyword wildcard characters and SQL-looking text literal', async () => {
    const collection = 'literal_search';
    const documents = [
      "Synthetic literal token load%_\\folder and O'Reilly",
      'Synthetic ordinary token loadXXfolder and OReilly',
      "Synthetic literal SQL text ' OR true -- stays text",
    ];
    await database.createTable(collection, documents.map((document, i) => ({
      ...row(collection, i), document, provider: i === 0 ? "provider'quoted" : 'ordinary',
    })));
    try {
      for (const q of ['%', '_', '\\', "O'Reilly", 'load%_\\folder']) {
        const result = await allPages({ collection, q });
        assert.deepEqual(result.map((item) => item.id), [`${collection}-0000`], q);
      }
      assert.deepEqual((await allPages({ collection, q: "' OR true --" })).map((item) => item.id), [`${collection}-0002`]);
      assert.equal((await allPages({ collection, q: 'synthetic', provider: "provider'quoted" })).length, 1);
      assert.equal((await allPages({ collection, q: 'synthetic', provider: "' OR true --" })).length, 0);
      assert.equal((await request({ collection, q: 'synthetic', roles: "user') OR true --" })).status, 400);
    } finally { await database.dropTable(collection); }
  });

  it('searches legacy tables without optional metadata and gives empty filtered results instead of errors', async () => {
    const collection = 'legacy_search';
    const modern = row(collection, 0);
    const legacy = Object.fromEntries(['id', 'vector', 'document', 'sourceFile', 'role', 'turnIndex'].map((key) => [key, modern[key]]));
    const table = await database.createTable(collection, [legacy]);
    try {
      for (const mode of ['keyword', 'semantic']) {
        const result = await allPages({ collection, mode });
        assert.equal(result.length, 1);
        assert.equal(result[0].metadata.createdInThreadShelf, false);
        for (const filter of [{ provider: 'openai' }, { model: 'unknown' }, { from: '2026-01-01' }, { origin: 'threadshelf' }]) {
          assert.equal((await allPages({ collection, mode, ...filter })).length, 0);
        }
        assert.equal((await allPages({ collection, mode, origin: 'archive' })).length, 1);
      }
      const names = (await table.schema()).fields.map((field) => field.name);
      assert.ok(names.includes('model') && names.includes('provider'), 'upstream additive metadata handling was reused');
    } finally { await database.dropTable(collection); }
  });

  it('uses portable model labels and exact Unicode checks after the raw-column prefilter', async () => {
    const collection = 'model_search';
    const models = [
      '/synthetic/models/Needle-Q4.gguf',
      'D:\\synthetic\\models\\Needle-Q8.gguf',
      '/synthetic/needle/Unrelated.gguf',
      'vendor/model-beta',
      'Árvíz-Q4',
    ];
    await database.createTable(collection, models.map((model, i) => ({ ...row(collection, i), model })));
    try {
      for (const mode of ['keyword', 'semantic']) {
        const results = await allPages({ collection, mode, model: 'NEEDLE' });
        assert.deepEqual(results.map((result) => result.metadata.model).sort(), ['Needle-Q4', 'Needle-Q8']);
        assert.equal((await allPages({ collection, mode, model: '/different/path/Needle-Q4.gguf' })).length, 1);
        assert.equal((await allPages({ collection, mode, model: 'ÁRVÍZ' })).length, 1);
        assert.equal((await allPages({ collection, mode, model: 'vendor/model-beta' }))[0].metadata.model, 'vendor/model-beta');
      }
    } finally { await database.dropTable(collection); }
  });

  it('finds the strongest keyword result after the old storage-order candidate window', async () => {
    const collection = 'late_keyword';
    const rows = Array.from({ length: 350 }, (_, i) => ({ ...row(collection, i), document: 'latekeyword ordinary searchable text' }));
    rows[349].document = 'latekeyword latekeyword latekeyword latekeyword strongest result';
    await database.createTable(collection, rows);
    try {
      const result = await request({ collection, q: 'latekeyword', n: 1 });
      assert.equal(result.status, 200);
      assert.equal(result.body.total, 350);
      assert.equal(result.body.results[0].id, `${collection}-0349`);
      assert.equal((await allPages({ collection, q: 'latekeyword' })).length, 350);
    } finally { await database.dropTable(collection); }
  });

  it('pages every semantic result beyond upstream 1.4.1’s 12,800 candidate ceiling', async () => {
    const collection = 'deep_semantic';
    const count = 13_017;
    await database.createTable(collection, Array.from({ length: count }, (_, i) => ({
      ...row(collection, i), vector: [1, i / count, 0],
    })));
    try {
      const results = await allPages({ collection, mode: 'semantic' });
      assert.equal(results.length, count);
      assert.equal(results.at(-1).id, `${collection}-13016`);
      assert.ok(results.every((result) => Number.isFinite(result.distance)));
      assert.ok(results.every((result, i) => i === 0 || result.distance >= results[i - 1].distance));
    } finally { await database.dropTable(collection); }
  });

  it('preserves the captured native table version during concurrent writes and leaves later writes usable', async () => {
    const collection = 'concurrent_scan';
    const count = 2_500;
    const table = await database.createTable(collection, Array.from({ length: count }, (_, i) => row(collection, i)));
    let mutation;
    try {
      const snapshot = await readerSearchCollectionSnapshot(collection, query, {
        mode: 'keyword',
        onResult: () => {
          mutation ??= table.delete("id = 'concurrent_scan-2499'").then(() => table.add([row(collection, 3000)]));
        },
      });
      await mutation;
      assert.equal(snapshot.length, count);
      assert.ok(snapshot.some((item) => item.id === 'concurrent_scan-2499'));
      assert.ok(!snapshot.some((item) => item.id === 'concurrent_scan-3000'));
      const current = await allPages({ collection });
      assert.equal(current.length, count);
      assert.ok(!current.some((item) => item.id === 'concurrent_scan-2499'));
      assert.ok(current.some((item) => item.id === 'concurrent_scan-3000'));
      await table.add([row(collection, 3001)]);
      assert.equal((await allPages({ collection })).length, count + 1);
    } finally {
      await mutation;
      await database.dropTable(collection);
    }
  });

  it('applies full-replacement, deletion, invalid-thread and collection-reset masks before totals', async () => {
    const collection = 'pending_search';
    const records = Array.from({ length: 6 }, (_, i) => ({
      ...row(collection, i), sourceFile: ['ready.json', 'all.json', 'delete.json', 'invalid.json', 'invalid.json', 'local.json'][i],
    }));
    await database.createTable(collection, records);
    const pending = await database.createTable('__threads', [
      { collection, sourceFile: 'all.json', conversationKey: 'conversation-1', indexPending: 'all' },
      { collection, sourceFile: 'delete.json', conversationKey: 'conversation-2', indexPending: 'delete' },
      { collection, sourceFile: 'invalid.json', conversationKey: 'conversation-3', indexPending: 'invalid' },
      { collection, sourceFile: 'local.json', conversationKey: 'conversation-5', indexPending: 'local' },
    ]);
    try {
      for (const mode of ['keyword', 'semantic']) {
        assert.deepEqual((await allPages({ collection, mode })).map((result) => result.id).sort(), [0, 4, 5].map((i) => `${collection}-${String(i).padStart(4, '0')}`));
      }
      await pending.update({ where: "indexPending = 'all'", values: { indexPending: '' } });
      assert.equal((await allPages({ collection })).length, 4, 'new requests see readiness changes');
      await pending.update({ where: "indexPending = 'delete'", values: { indexPending: 'reset' } });
      for (const mode of ['keyword', 'semantic']) {
        assert.equal((await allPages({ collection, mode })).length, 0, 'a pending reset masks the whole collection');
      }
    } finally { await database.dropTable(collection); }
  });
});
