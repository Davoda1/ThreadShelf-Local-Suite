import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { ApplicationService } from '../src/core/service.mjs';
import { ThreadShelfClient } from '../src/core/server.mjs';

async function fixture(t) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tslr-lifecycle-'));
  const service = await new ApplicationService({ dataDir }).init();
  t.after(async () => { await service.handle('shutdown'); await fs.rm(dataDir, { recursive: true, force: true }); });
  return { service, dataDir };
}

test('shutdown awaits cancelled operation cleanup, rejects new work, and closes exactly once', async t => {
  const { service } = await fixture(t);
  let release;
  let cleaned = false;
  let closes = 0;
  const originalClose = service.searcher.close.bind(service.searcher);
  service.searcher.close = async () => { assert.equal(cleaned, true); closes++; await originalClose(); };
  service.importLocal = async (_args, signal) => {
    await new Promise(resolve => { release = resolve; signal.addEventListener('abort', resolve, { once: true }); });
    await nextTurn(); // Exercise the former close-before-finally race.
    assert.equal(service.store.revision(), 0);
    cleaned = true;
    return { cancelled: signal.aborted };
  };
  const operation = service.handle('import.paths', { paths: ['/synthetic'] });
  assert.equal(typeof release, 'function');
  const shutdown = service.handle('shutdown');
  await assert.rejects(service.handle('files', { mode: 'local' }), /closing/);
  const anotherShutdown = service.handle('shutdown');
  assert.equal(shutdown, anotherShutdown);
  assert.deepEqual(await operation, { cancelled: true });
  assert.deepEqual(await shutdown, { ok: true });
  assert.equal(closes, 1);
});

test('ordinary and model searches are cancellable without holding the imports lock', async t => {
  const { service } = await fixture(t);
  for (const mode of ['keyword', 'semantic', 'ollama']) {
    const method = mode === 'ollama' ? 'searchOllama' : 'search';
    const saved = service.searcher[method];
    let entered; const started = new Promise(resolve => { entered = resolve; });
    service.searcher[method] = async ({ signal }) => {
      assert.equal(service.operation, null); entered();
      await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
      signal.throwIfAborted();
    };
    const searching = service.handle('search', { mode: 'local', q: 'cobalt', searchMode: mode });
    const rejection = assert.rejects(searching, { name: 'AbortError' });
    await started;
    await service.handle('operation.cancel');
    await rejection;
    assert.equal(service.searchControllers.size, 0);
    service.searcher[method] = saved;
  }
});

test('shutdown aborts an outstanding model search and waits for its DB cleanup', async t => {
  const { service } = await fixture(t);
  let cleaned = false;
  let entered; const started = new Promise(resolve => { entered = resolve; });
  service.searcher.searchOllama = async ({ signal }) => {
    entered();
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    await nextTurn();
    assert.equal(service.store.revision(), 0);
    cleaned = true;
    signal.throwIfAborted();
  };
  const search = service.handle('search', { mode: 'local', q: 'cobalt', searchMode: 'ollama' });
  const rejection = assert.rejects(search, { name: 'AbortError' });
  await started;
  await service.handle('shutdown');
  await rejection;
  assert.equal(cleaned, true);
});

test('cancelling a search leaves an independent import running and vice versa', async t => {
  const { service } = await fixture(t);
  let importSignal, searchSignal, entered;
  let started = new Promise(resolve => { entered = resolve; });
  service.importLocal = async (_args, signal) => {
    importSignal = signal;
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    return { cancelled: true };
  };
  service.searcher.search = async ({ signal }) => {
    searchSignal = signal; entered();
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    signal.throwIfAborted();
  };
  const importing = service.handle('import.paths', { paths: ['/synthetic'] });
  const searching = service.handle('search', { mode: 'local', q: 'cobalt' });
  const rejectedSearch = assert.rejects(searching, { name: 'AbortError' });
  await started;
  await service.handle('operation.cancel', { scope: 'search' });
  await rejectedSearch;
  assert.equal(importSignal.aborted, false);
  assert.equal(service.operation.name, 'import.paths');
  started = new Promise(resolve => { entered = resolve; });
  const nextSearch = service.handle('search', { mode: 'local', q: 'another' });
  const rejectedNext = assert.rejects(nextSearch, { name: 'AbortError' });
  await started;
  await service.handle('operation.cancel', { scope: 'operation' });
  assert.deepEqual(await importing, { cancelled: true });
  assert.equal(searchSignal.aborted, false);
  await assert.rejects(service.handle('operation.cancel', { scope: 'unknown' }), /scope/);
  await service.handle('operation.cancel', { scope: 'search' });
  await rejectedNext;
});

test('shutdown drains queued preference and reading writes', async t => {
  const { service, dataDir } = await fixture(t);
  const settings = service.handle('settings.save', { values: { language: 'fr' } });
  const reading = service.handle('reading.save', { key: 'local:snapshot', position: { turnIndex: 3, role: 'ai', offset: 0.4 } });
  await service.handle('shutdown');
  await Promise.all([settings, reading]);
  assert.equal(JSON.parse(await fs.readFile(path.join(dataDir, 'settings.json'), 'utf8')).data.language, 'fr');
  assert.equal(JSON.parse(await fs.readFile(path.join(dataDir, 'reading-v2.json'), 'utf8')).data.positions['local:snapshot'].turnIndex, 3);
});

test('saved reading anchors cannot override the explicitly selected source identity', async t => {
  const { service } = await fixture(t);
  const anchor = { key: 'server:other', turnIndex: 4, role: 'ai', offset: 0.5 };
  await service.handle('reading.save', { key: 'local:intended', position: anchor, bookmark: anchor });
  const { reading } = await service.handle('bootstrap');
  assert.equal(reading.bookmarks[0].key, 'local:intended');
  assert.equal(reading.recent[0].key, 'local:intended');
  assert.equal(reading.positions['local:intended'].key, undefined);
  assert.equal(reading.positions['server:other'], undefined);
});

test('a broad server listing never copies unselected collections into Local', async t => {
  const { service } = await fixture(t);
  const items = ['selected', 'private'].map(collection => ({ collection, sourceFile: `${collection}.json`, conversationKey: 'same', turnCount: 1, title: collection, provider: 'openai' }));
  const fetched = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    res.setHeader('content-type', 'application/json');
    let result;
    if (u.pathname === '/api/collections') result = { collections: ['selected', 'private'] };
    else if (u.pathname === '/api/files') result = { files: items }; // Deliberately ignores collection filter.
    else if (u.pathname === '/api/thread') {
      fetched.push(u.searchParams.get('collection'));
      result = { turns: [{ user: 'selected source text', turn_index: 0 }] };
    } else result = { results: [] };
    res.end(JSON.stringify(result));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const serverUrl = `http://127.0.0.1:${server.address().port}/`;
  const client = new ThreadShelfClient(serverUrl);
  assert.equal((await client.files({ collection: 'selected', provider: 'all' })).total, 1);
  const result = await service.handle('server.import', { serverUrl, collections: ['selected'] });
  assert.equal(result.imported, 1);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(fetched, ['selected']);
  assert.deepEqual(service.store.collections(), [{ name: 'selected', count: 1 }]);
});

test('invalid source mode never silently falls back to Local', async t => {
  const { service } = await fixture(t);
  for (const action of ['collections', 'files', 'thread', 'search']) {
    await assert.rejects(service.handle(action, { mode: 'unrecognized', q: 'test' }), /Local or ThreadShelf Server/);
  }
});
