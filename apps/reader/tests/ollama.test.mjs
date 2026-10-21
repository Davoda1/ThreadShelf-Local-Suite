import manifest from '../package.json' with {type:'json'};
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { SearchService } from '../src/core/search.mjs';
import { createOllamaManager, modelCacheBytes, validateOllamaModelName } from '../src/core/ollama.mjs';
import { ApplicationService } from '../src/core/service.mjs';

async function fixture(t, options = {}) {
  const state = { ready: true, revision: 1, models: [{ name: 'embeddinggemma:latest', digest: 'embed-1', size: 621000000, modified_at: '2026-10-19T10:00:00Z', details: { family: 'gemma', parameter_size: '300M', quantization_level: 'F16' } }, { name: 'qwen3:latest', digest: 'chat-1', size: 4200000000 }, { name: 'legacy:latest', digest: 'legacy-1' }], requests: [], embeds: [], slowPull: false, deleteStatus: 200, deleteKeepsModel: false };
  const server = http.createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    state.requests.push({ path: request.url, method: request.method, body });
    const endpoint = request.url.replace(/^\/gateway\//, '/');
    const json = (data, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)); };
    if (!state.ready) return json({ error: 'Service is not running' }, 503);
    if (endpoint === '/api/tags') return json({ models: state.models });
    if (endpoint === '/api/show') {
      if (body.model === 'legacy:latest') { response.writeHead(404); return response.end('404 page not found'); }
      return json({ capabilities: body.model.startsWith('qwen3:') ? ['completion', 'thinking'] : ['embedding'] });
    }
    if (endpoint === '/api/embed') {
      state.embeds.push(...body.input);
      return json({ embeddings: body.input.map(text => text.includes('cobalt') ? [1, 0, 0] : [0, 1, 0]) });
    }
    if (endpoint === '/api/delete') {
      if (state.deleteOnRequest) { state.deleteOnRequest(); return; }
      if (state.deleteStatus !== 200) return json({ error: 'Deletion denied by test server' }, state.deleteStatus);
      if (!state.deleteKeepsModel) state.models = state.models.filter(row => row.name !== body.model);
      response.writeHead(200); response.end(); return;
    }
    if (endpoint === '/api/pull') {
      response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      response.write('{"status":"pulling manifest"}\n{"status":"down');
      response.write('loading","completed":5,"total":10}\n');
      if (state.slowPull) { request.on('close', () => response.destroy()); return; }
      const name = body.name.includes(':') ? body.name : `${body.name}:latest`;
      state.models.push({ name, digest: `download-${name}` });
      response.end('{"status":"success"}\n'); return;
    }
    return json({ error: 'Unexpected endpoint' }, 404);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`, dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tslr-ollama-'));
  const store = { revision: () => state.revision, passages: () => [{ id: 'p', conversationId: 'c', turnIndex: 7, role: 'ai', title: 'Cobalt', collection: 'local', provider: 'openai', text: 'Private conversation cobalt archive content.' }] };
  const manager = { findExecutable: async () => null, start: async () => { state.ready = true; } };
  const search = new SearchService({ store, dataDir, ollamaManager: manager, ...options });
  t.after(async () => { await search.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(dataDir, { recursive: true, force: true }); });
  return { search, state, url, dataDir, manager };
}

test('discovery distinguishes compatible embeddings, chat-only models and old-server unknown models without sending text', async t => {
  const { search, state, url } = await fixture(t);
  const status = await search.ollamaModels({ url });
  assert.equal(status.available, true); assert.equal(status.isLocal, true);
  assert.deepEqual(status.models, ['embeddinggemma:latest']);
  assert.equal(status.details.find(row => row.name === 'qwen3:latest').embedding, 'unsupported');
  assert.equal(status.details.find(row => row.name === 'legacy:latest').embedding, 'unknown');
  assert.deepEqual(state.embeds, []);
  assert.equal(status.suggestedModel, 'embeddinggemma');
  const before = state.requests.length;
  await search.search({ q: 'cobalt', mode: 'keyword' });
  assert.equal(state.requests.length, before, 'ordinary text search must never contact Ollama');
});

test('chat-only models are rejected before either probe or archive content is sent', async t => {
  const { search, state, url } = await fixture(t);
  const result = await search.ollamaTest({ url, model: 'qwen3:latest' });
  assert.equal(result.compatible, false); assert.match(result.message, /does not support embeddings/);
  await assert.rejects(search.searchOllama({ url, model: 'qwen3:latest', q: 'cobalt' }), /chat or title-generation model/);
  assert.deepEqual(state.embeds, []);
  assert.ok(state.requests.every(row => !['/api/generate', '/api/chat'].includes(row.path)));
});

test('test uses only synthetic text and old-server unknown models must pass a probe before archive indexing', async t => {
  const { search, state, url } = await fixture(t);
  const tested = await search.ollamaTest({ url, model: 'embeddinggemma' });
  assert.equal(tested.compatible, true); assert.equal(tested.dimensions, 3);
  assert.equal(state.embeds.length, 1); assert.match(state.embeds[0], /capability test/);
  assert.ok(!state.embeds.some(text => text.includes('Private conversation')));
  state.embeds.length = 0;
  const result = await search.searchOllama({ url, model: 'legacy:latest', q: 'cobalt' });
  assert.match(state.embeds[0], /capability test/);
  assert.match(state.embeds[1], /Private conversation/);
  assert.equal(result.results[0].turnIndex, 7);
  assert.ok((await search.ollamaModels({ url })).models.includes('legacy:latest'));
});

test('unavailable Ollama returns actionable installation/service status without breaking text search', async t => {
  const { search, state, url, manager } = await fixture(t);
  state.ready = false;
  let status = await search.ollamaModels({ url });
  assert.equal(status.available, false); assert.equal(status.installed, false);
  assert.match(status.message, /built-in semantic model do not require Ollama/);
  manager.findExecutable = async () => '/synthetic/ollama';
  status = await search.ollamaModels({ url });
  assert.equal(status.installed, true); assert.match(status.message, /Start installed Ollama/);
  assert.equal((await search.search({ q: 'cobalt' })).total, 1);
  const started = await search.ollamaStart({ url });
  assert.equal(started.available, true);
  await assert.rejects(search.ollamaStart({ url: 'http://192.168.50.10:11434/' }), /remote computer/);
});

test('model pull handles split NDJSON, reports progress and verifies downloaded capabilities', async t => {
  const progress = [], { search, state, url } = await fixture(t, { onProgress: value => progress.push(value) });
  const result = await search.ollamaPull({ url, model: 'all-minilm' });
  assert.equal(result.pulledModel, 'all-minilm:latest'); assert.equal(result.compatible, true);
  assert.ok(progress.some(event => event.operation === 'ollama.pull' && event.current === 5 && event.total === 10));
  assert.equal(state.requests.filter(row => row.path === '/api/pull').length, 1);
  assert.deepEqual(state.embeds, [], 'downloading a model must not index or send archive content');
  await assert.rejects(search.ollamaPull({ url, model: '../invalid' }), /valid Ollama model name/);
});

test('model pull cancellation aborts an active HTTP stream and preserves ordinary search', async t => {
  const controller = new AbortController();
  const { search, state, url } = await fixture(t, { onProgress: event => { if (event.current === 5) controller.abort(); } });
  state.slowPull = true;
  await assert.rejects(search.ollamaPull({ url, model: 'all-minilm', signal: controller.signal }), { name: 'AbortError' });
  assert.equal((await search.search({ q: 'cobalt' })).total, 1);
});

test('model discovery reports real sizes and independent model-specific index readiness without embedding text', async t => {
  const { search, state, url } = await fixture(t);
  const before = await search.ollamaModels({ url }), embedding = before.details.find(row => row.name === 'embeddinggemma:latest');
  assert.equal(embedding.sizeBytes, 621000000);
  assert.equal(embedding.modifiedAt, '2026-10-19T10:00:00Z');
  assert.equal(embedding.family, 'gemma'); assert.equal(embedding.parameterSize, '300M'); assert.equal(embedding.quantization, 'F16');
  assert.equal(embedding.index.ready, false); assert.equal(embedding.index.bytes, 0);
  assert.equal(before.details.find(row => row.name === 'qwen3:latest').sizeBytes, 4200000000);
  assert.equal(before.details.find(row => row.name === 'legacy:latest').sizeBytes, null, 'unknown sizes must not be reported as zero');
  assert.deepEqual(state.embeds, []);
  await search.searchOllama({ url, model: 'embeddinggemma:latest', q: 'cobalt' });
  const after = await search.ollamaModels({ url }), ready = after.details.find(row => row.name === 'embeddinggemma:latest').index;
  assert.equal(ready.ready, true); assert.equal(ready.stale, false); assert.equal(ready.indexedPassages, 1); assert.ok(ready.bytes > 0);
  assert.equal((await search.status()).indexedPassages, 0, 'Ollama indexing must not claim the independent built-in index is ready');
  state.revision++;
  const stale = (await search.ollamaModels({ url })).details.find(row => row.name === 'embeddinggemma:latest').index;
  assert.equal(stale.ready, false); assert.equal(stale.stale, true);
  state.models[0].digest = 'replacement-model';
  assert.equal((await search.ollamaModels({ url })).details.find(row => row.name === 'embeddinggemma:latest').index.indexedPassages, 0);
});

test('confirmed model deletion uses DELETE at the captured proxy address and accepts an empty success response', async t => {
  const { search, state, url } = await fixture(t);
  await search.searchOllama({ url: `${url}gateway/`, model: 'embeddinggemma:latest', q: 'cobalt' });
  const beforeIndex = search.db.prepare('SELECT * FROM indexes').all();
  const result = await search.ollamaDelete({ url: `${url}gateway/`, model: 'embeddinggemma' });
  assert.equal(result.deletedModel, 'embeddinggemma:latest'); assert.equal(result.available, true);
  assert.ok(!result.details.some(row => row.name === result.deletedModel));
  assert.equal(state.requests.filter(row => row.method === 'DELETE').length, 1);
  assert.deepEqual(state.requests.find(row => row.method === 'DELETE'), { path: '/gateway/api/delete', method: 'DELETE', body: { model: 'embeddinggemma:latest' } });
  assert.deepEqual(search.db.prepare('SELECT * FROM indexes').all(), beforeIndex, 'removing a provider model does not erase the separate Reader index');
  assert.equal((await search.search({ q: 'cobalt' })).total, 1, 'model removal does not affect text search');
});

test('model deletion rejects invalid or absent models and public URLs before issuing a mutation', async t => {
  const { search, state, url } = await fixture(t);
  for (const model of ['', '../invalid', '/root/model', '-option', 'bad name', 'model\0name', {}, null]) await assert.rejects(search.ollamaDelete({ url, model }), /valid Ollama model name/);
  await assert.rejects(search.ollamaDelete({ url, model: 'not-installed' }), /no longer installed/);
  await assert.rejects(search.ollamaDelete({ url: 'https://example.com/', model: 'embeddinggemma' }), /private LAN/);
  const signal = AbortSignal.abort();
  await assert.rejects(search.ollamaDelete({ url, model: 'embeddinggemma', signal }), { name: 'AbortError' });
  assert.equal(state.requests.filter(row => row.method === 'DELETE').length, 0);
  assert.equal(state.models.length, 3);
  assert.equal(validateOllamaModelName('registry.local:5000/team/model:q8_0'), 'registry.local:5000/team/model:q8_0');
});

test('failed or unconfirmed deletion cannot be reported as a success or mutate local selection/indexes', async t => {
  const { search, state, url } = await fixture(t);
  await search.ollamaTest({ url, model: 'embeddinggemma' });
  const verified = [...search.ollamaVerified];
  state.deleteStatus = 403;
  await assert.rejects(search.ollamaDelete({ url, model: 'embeddinggemma' }), /Deletion denied/);
  assert.deepEqual([...search.ollamaVerified], verified);
  assert.equal(state.models.length, 3);
  state.deleteStatus = 200; state.deleteKeepsModel = true;
  await assert.rejects(search.ollamaDelete({ url, model: 'embeddinggemma' }), /still installed/);
  assert.equal(state.models.length, 3);
});

test('cancelling an active model-removal request does not report success', async t => {
  const { search, state, url } = await fixture(t), controller = new AbortController();
  state.deleteOnRequest = () => controller.abort();
  await assert.rejects(search.ollamaDelete({ url, model: 'embeddinggemma', signal: controller.signal }), { name: 'AbortError' });
  assert.equal(state.models.length, 3);
  assert.equal(state.requests.filter(row => row.method === 'DELETE').length, 1);
});

test('application model deletion preserves saved selection, sidecar search preferences, and unrelated archive data', async t => {
  const { state, url, dataDir } = await fixture(t);
  const app = await new ApplicationService({ dataDir: path.join(dataDir, 'application') }).init();
  try {
  const saved = app.store.upsert({ collection: 'Models', provider: 'openai', sourceFile: 'model-test.json', conversationKey: 'model-test', title: 'Unchanged conversation', turns: [{ user: 'Retain this content.', turn_index: 0 }], raw: { stable: true } });
  const original = app.store.thread({ id: saved.summary.id });
  await app.handle('settings.save', { values: { ollamaUrl: url, ollamaModel: 'embeddinggemma:latest', searchPreferences: { local: { mode: 'ollama', period: 'month' } } } });
  const before = (await app.handle('bootstrap')).settings;
  const result = await app.handle('ollama.delete', { url: `${url}gateway/`, model: 'embeddinggemma:latest' });
  assert.equal(result.deletedModel, 'embeddinggemma:latest');
  assert.equal(state.requests.find(row => row.method === 'DELETE').path, '/gateway/api/delete');
  assert.deepEqual((await app.handle('bootstrap')).settings, before);
  assert.deepEqual(app.store.thread({ id: saved.summary.id }), original);
  } finally { await app.shutdown(); }
});

test('model storage sizes omit partial downloads and never follow symlinks', async t => {
  const { dataDir, search } = await fixture(t), cache = search.cacheDir;
  await fs.mkdir(path.join(cache, 'model'), { recursive: true });
  await fs.writeFile(path.join(cache, 'model', 'model.onnx'), Buffer.alloc(123));
  await fs.writeFile(path.join(cache, 'model', 'download.tmp.42'), Buffer.alloc(50));
  await fs.writeFile(path.join(cache, 'model', 'download.part'), Buffer.alloc(50));
  const outside = path.join(dataDir, 'unrelated'); await fs.mkdir(outside); await fs.writeFile(path.join(outside, 'extra'), Buffer.alloc(200));
  await fs.symlink(outside, path.join(cache, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(await modelCacheBytes(cache), 123);
  assert.equal((await search.status()).modelBytes, 123);
  assert.equal(await modelCacheBytes(path.join(dataDir, 'missing')), 0);
});

test('Windows executable discovery and explicit launch preserve existing Ollama model location', async () => {
  const filename = 'C:\\Users\\Fixture User\\AppData\\Local\\Programs\\Ollama\\ollama.exe';
  let launched;
  const manager = createOllamaManager({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\Fixture User\\AppData\\Local', Path: 'C:\\Tools', OLLAMA_MODELS: 'D:\\Existing Models' },
    io: { async access(file) { if (file !== filename) throw new Error('absent'); }, async stat() { return { isFile: () => true }; } },
    launch(file, args, options) { launched = { file, args, options }; const child = new EventEmitter(); child.unref = () => {}; queueMicrotask(() => child.emit('spawn')); return child; },
  });
  assert.equal(await manager.findExecutable(), filename);
  await manager.start(new URL('http://127.0.0.1:11434/'));
  assert.equal(launched.file, filename); assert.deepEqual(launched.args, ['serve']);
  assert.equal(launched.options.env.OLLAMA_MODELS, 'D:\\Existing Models');
  assert.equal(launched.options.env.OLLAMA_HOST, '127.0.0.1:11434');
  assert.equal(launched.options.shell, undefined);
});

test('1.0.0 settings and reading upgrade in place with the new search-panel default', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tslr-upgrade-'));
  const oldSettings = { language: 'hu', theme: 'dark', searchMode: 'exact', ollamaUrl: 'http://127.0.0.1:11434/', ollamaModel: 'qwen3:latest', localCollection: 'Archive' };
  const oldReading = { positions: { local: { turnIndex: 9, role: 'ai', offset: 0.2 } }, bookmarks: [], recent: [] };
  await fs.writeFile(path.join(directory, 'settings.json'), JSON.stringify({ schemaVersion: 1, data: oldSettings }));
  await fs.writeFile(path.join(directory, 'reading-v2.json'), JSON.stringify({ schemaVersion: 1, data: oldReading }));
  const app = await new ApplicationService({ dataDir: directory }).init();
  t.after(async () => { await app.shutdown(); await fs.rm(directory, { recursive: true, force: true }); });
  const bootstrap = await app.handle('bootstrap');
  assert.equal(bootstrap.version, manifest.version); assert.equal(bootstrap.settings.searchPanelExpanded, false);
  for (const [key, value] of Object.entries(oldSettings)) assert.equal(bootstrap.settings[key], value);
  assert.deepEqual(bootstrap.reading, oldReading);
  await app.handle('settings.save', { values: { searchPanelExpanded: true } });
  assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'interface.json'))).data.searchPanelExpanded, true);
  const legacy = JSON.parse(await fs.readFile(path.join(directory, 'settings.json')));
  assert.equal(legacy.schemaVersion, 1);
  assert.ok(!Object.hasOwn(legacy.data, 'searchPanelExpanded'), '1.0.0 strict settings readers must not see the new UI-only preference');
  assert.deepEqual(legacy.data, oldSettings, 'saving only UI preferences must not rewrite old settings');
  await app.handle('settings.save', { values: { theme: 'system', searchPanelExpanded: false } });
  const updatedLegacy = JSON.parse(await fs.readFile(path.join(directory, 'settings.json'))).data;
  const legacyAllowed = new Set(['mode','language','theme','fontSize','highContrast','compact','animations','listMode','pageSize','sort','directoryMode','customDirectory','lastDirectory','serverUrl','serverAddresses','localCollection','serverCollection','searchMode','ollamaUrl','ollamaModel']);
  assert.ok(Object.keys(updatedLegacy).every(key => legacyAllowed.has(key)), 'old strict-key validator accepts every saved setting');
  assert.equal(updatedLegacy.theme, 'system');
  await assert.rejects(app.handle('settings.save', { values: { searchPanelExpanded: 'yes' } }), /Invalid/);
});
