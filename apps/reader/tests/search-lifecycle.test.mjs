import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ApplicationService } from '../src/core/service.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
async function fixture(t) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tslr-search-lifecycle-v2-'));
  const service = await new ApplicationService({ dataDir }).init();
  t.after(async () => { await service.shutdown(); await fs.rm(dataDir, { recursive: true, force: true }); });
  return service;
}

test('conversion waits for aborted Ollama indexing cleanup before closing its database', async t => {
  const app = await fixture(t);
  app.store.upsert({ collection: 'Existing', title: 'Preserved', provider: 'chatgpt', sourceFile: 'source.json', conversationKey: 'one', turns: [{ user: 'A cobalt keyboard', turn_index: 47 }] });
  await app.handle('settings.save', { values: { ollamaModel: 'embed:latest' } });
  let entered, cleaned = false;
  const started = new Promise(resolve => { entered = resolve; });
  app.searcher.fetch = async (url, options = {}) => {
    if (url.pathname === '/api/tags') return Response.json({ models: [{ name: 'embed:latest', digest: 'one' }] });
    if (url.pathname === '/api/show') return Response.json({ capabilities: ['embedding'] });
    assert.equal(url.pathname, '/api/embed'); entered();
    await new Promise(resolve => options.signal.addEventListener('abort', resolve, { once: true }));
    await tick(); assert.ok(app.store.db); cleaned = true;
    options.signal.throwIfAborted();
  };
  const originalClose = app.searcher.close.bind(app.searcher);
  app.searcher.close = async () => { assert.equal(cleaned, true); return originalClose(); };
  const search = app.handle('search', { mode: 'local', searchMode: 'ollama', q: 'cobalt' });
  const rejected = assert.rejects(search, { name: 'AbortError' });
  await started;
  const conversion = await app.handle('storage.convert', { profile: 'zip6' });
  await rejected;
  assert.equal(conversion.ok, true); assert.equal(app.searcher.busy, null);
  assert.equal((await app.handle('search', { mode: 'local', q: 'cobalt' })).total, 1);
});

test('manager mutations serialize after a successful Ollama search durable checkpoint', async t => {
  const app = await fixture(t);
  let entered, release, checkpointFinished = false, managerFinished = false;
  const started = new Promise(resolve => { entered = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  const originalCheckpoint = app.checkpoint.bind(app);
  app.checkpoint = async (...args) => { entered(); await blocked; const result = await originalCheckpoint(...args); checkpointFinished = true; return result; };
  app.searcher.searchOllama = async () => ({ results: [], total: 0 });
  const search = app.handle('search', { mode: 'local', searchMode: 'ollama', q: 'cobalt' });
  await started;
  const manager = app.handle('manager.mutate', { operation: 'create', name: 'After search' }).then(value => { managerFinished = true; assert.equal(checkpointFinished, true); return value; });
  await tick(); await tick(); assert.equal(managerFinished, false);
  release(); await search;
  assert.equal((await manager).collection.name, 'After search');
});
