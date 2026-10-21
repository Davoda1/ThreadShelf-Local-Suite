import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SearchService, splitPassage } from '../src/core/search.mjs';
import { ArchiveStore } from '../src/core/archive.mjs';

const rows = [
  { id: 'keyboard:3', conversationId: 'keyboard', turnIndex: 3, role: 'user', title: 'USB keyboard mapping', collection: 'Hardware', provider: 'chatgpt', text: 'Configure the USB keyboard rotary switch, preserve each physical position, and map F13 through F24.' },
  { id: 'keyboard:9', conversationId: 'keyboard', turnIndex: 9, role: 'ai', title: 'USB keyboard mapping', collection: 'Hardware', provider: 'chatgpt', text: 'The keyboard layout can use different profiles. USB input reports should stop before profile changes.' },
  { id: 'audio:5', conversationId: 'audio', turnIndex: 5, role: 'thinking', title: 'Audio equipment', collection: 'Music', provider: 'claude', text: 'An audio mixer connects over USB. A piano keyboard and microphone work together.' },
  { id: 'food:2', conversationId: 'food', turnIndex: 2, role: 'ai', title: 'Dinner', collection: 'Recipes', provider: 'gemini', text: 'Roasted vegetables and warm bread are simple dinner ideas.' },
  { id: 'hu:8', conversationId: 'hu', turnIndex: 8, role: 'user', title: 'Magyar billentyűzet', collection: 'Hardware', provider: 'venice', text: 'A billentyűzet beállítása és a képernyő színe megváltoztatható.' },
];
function fakeStore(initial = rows) {
  return { data: structuredClone(initial), version: 1, passages() { return this.data; }, revision() { return this.version; } };
}
function vector(text) {
  const lower = text.toLowerCase();
  return lower.includes('vegetable') || lower.includes('bread') || lower.includes('dinner') || lower.includes('food') ? [0, 1, 0] : lower.includes('audio') || lower.includes('music') ? [0, 0, 1] : [1, 0, 0];
}
function fakeRuntime(counts) {
  return () => ({ async call(operation, texts, signal) {
    if (signal?.aborted) throw Object.assign(new Error('Operation cancelled.'), { name: 'AbortError' });
    if (operation === 'setup') { counts.setups++; return { dimension: 3 }; }
    counts.embeddings += texts.length; return texts.map(vector);
  }, async close() { counts.closed++; } });
}
async function fixture(t, options = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'threadshelf-search-test-'));
  const store = options.store ?? fakeStore();
  const counts = { setups: 0, embeddings: 0, closed: 0 };
  const service = new SearchService({ dataDir, store, runtimeFactory: fakeRuntime(counts), ...options });
  t.after(async () => { await service.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  return { service, store, counts, dataDir };
}

test('ranked search returns relevant exact source turns, field filters and phrase exclusions', async t => {
  const { service } = await fixture(t);
  const result = await service.search({ q: 'USB keyboard rotary' });
  assert.equal(result.results[0].conversationId, 'keyboard');
  assert.equal(result.results[0].turnIndex, 3);
  assert.ok(result.results[0].score > result.results.at(-1).score);
  const phrase = await service.search({ q: '"keyboard layout" -piano', collection: 'Hardware', role: 'ai' });
  assert.deepEqual(phrase.results.map(row => row.turnIndex), [9]);
  const providers = await service.search({ q: 'keyboard', provider: 'claude' });
  assert.equal(providers.total, 1); assert.equal(providers.results[0].turnIndex, 5);
});

test('exact search preserves literal substring semantics and fuzzy search repairs transpositions', async t => {
  const { service } = await fixture(t);
  const exact = await service.search({ q: 'F13 through F24', mode: 'exact' });
  assert.equal(exact.total, 1); assert.equal(exact.results[0].turnIndex, 3);
  const fuzzy = await service.search({ q: 'keybaord rotay', mode: 'fuzzy' });
  assert.equal(fuzzy.results[0].turnIndex, 3);
  const accented = await service.search({ q: 'billentyuzet beallitasa' });
  assert.equal(accented.results[0].conversationId, 'hu');
});

test('semantic mode never starts model downloading without explicit setup', async t => {
  const { service, counts } = await fixture(t);
  const result = await service.search({ q: 'USB keyboard', mode: 'semantic' });
  assert.equal(counts.setups, 0); assert.equal(counts.embeddings, 0);
  assert.match(result.notice, /setup/); assert.equal(result.results[0].conversationId, 'keyboard');
  await assert.rejects(service.indexSemantic(), /Set up/);
});

test('assistant role alias works for text, fuzzy and semantic filters without changing source anchors', async t => {
  const { service } = await fixture(t);
  for (const mode of ['keyword', 'exact', 'fuzzy']) {
    const result = await service.search({ q: 'keyboard', mode, role: 'assistant' });
    assert.equal(result.total, 1);
    assert.equal(result.results[0].turnIndex, 9);
    assert.equal(result.results[0].role, 'ai');
  }
  await service.setupSemantic(); await service.indexSemantic();
  const semantic = await service.search({ q: 'food', mode: 'semantic', role: 'assistant' });
  assert.equal(semantic.results[0].turnIndex, 2);
  assert.ok(semantic.results.every(row => row.role === 'ai'));
});

test('semantic vectors persist, changed content invalidates them, unchanged chunks are reused', async t => {
  const { service, store, counts, dataDir } = await fixture(t);
  await service.setupSemantic(); await service.indexSemantic();
  assert.equal((await service.status()).needsIndexing, false);
  const previous = counts.embeddings;
  await service.indexSemantic(); assert.equal(counts.embeddings, previous);
  const result = await service.search({ q: 'food', mode: 'semantic' });
  assert.equal(result.results[0].conversationId, 'food'); assert.equal(result.results[0].turnIndex, 2);
  store.data[0].text = 'Food and vegetables.'; store.version++;
  assert.equal((await service.status()).needsIndexing, true);
  const stale = await service.search({ q: 'food', mode: 'semantic' });
  assert.match(stale.notice, /outdated/);
  const before = counts.embeddings;
  await service.indexSemantic(); assert.equal(counts.embeddings - before, 1);
  assert.ok(fs.existsSync(path.join(dataDir, 'search', 'vectors.sqlite')));
  const restarted = new SearchService({ store, dataDir, runtimeFactory: fakeRuntime(counts) });
  try { assert.equal((await restarted.status()).needsIndexing, false); assert.equal((await restarted.status()).modelReady, true); }
  finally { await restarted.close(); }
});

test('indexing cancellation preserves text search and allows safe resume', async t => {
  const controller = new AbortController();
  const { service } = await fixture(t, { onProgress(event) { if (event.phase === 'indexing' && event.current === 1) controller.abort(); } });
  await service.setupSemantic();
  await assert.rejects(service.indexSemantic({ signal: controller.signal }), { name: 'AbortError' });
  assert.equal((await service.status()).needsIndexing, true);
  assert.ok((await service.search({ q: 'keyboard' })).total > 0);
  service.onProgress = () => {}; await service.indexSemantic();
  assert.equal((await service.status()).needsIndexing, false);
});

test('model setup failures give useful status without losing ordinary search', async t => {
  const { service } = await fixture(t, { runtimeFactory: () => ({ async call() { throw new Error('Network is unavailable'); }, async close() {} }) });
  await assert.rejects(service.setupSemantic(), /Network is unavailable/);
  assert.equal((await service.status()).modelReady, false);
  assert.match((await service.status()).error, /Text search remains available/);
  assert.ok((await service.search({ q: 'rotary' })).total > 0);
});

test('long message chunks preserve the end and use real source turn identifiers', async t => {
  const text = 'An unrelated introduction. '.repeat(120) + 'The final section discusses roasted vegetables and food.';
  const split = splitPassage(text);
  assert.ok(split.at(-1).text.includes('vegetables'));
  const store = fakeStore([{ ...rows[0], text, turnIndex: 47 }]);
  const { service } = await fixture(t, { store });
  await service.setupSemantic(); await service.indexSemantic();
  const result = await service.search({ q: 'food', mode: 'semantic' });
  assert.equal(result.total, 1); assert.equal(result.results[0].turnIndex, 47);
  assert.ok(result.results[0].matchOffset > 2000);
});

test('Ollama uses installed models and modern embed endpoint, persists digest and reindexes when changed', async t => {
  let calls = 0, digest = 'model-version-one';
  const fetchImpl = async (url, init) => {
    if (url.pathname.endsWith('/api/tags')) return Response.json({ models: [{ name: 'embed:latest', digest }] });
    if (url.pathname.endsWith('/api/show')) return Response.json({ capabilities: ['embedding'] });
    assert.equal(url.pathname, '/api/embed'); assert.equal(init.method, 'POST');
    const body = JSON.parse(init.body); assert.equal(body.model, 'embed:latest'); calls++;
    return Response.json({ embeddings: body.input.map(vector) });
  };
  const { service } = await fixture(t, { fetchImpl });
  assert.deepEqual((await service.ollamaModels({})).models, ['embed:latest']);
  const first = await service.searchOllama({ q: 'food', model: 'embed:latest', role: 'assistant' });
  assert.equal(first.results[0].conversationId, 'food');
  assert.ok(first.results.every(row => row.role === 'ai'));
  const before = calls; await service.searchOllama({ q: 'music', model: 'embed:latest' });
  assert.equal(calls - before, 1, 'repeat query must reuse persisted message vectors');
  digest = 'model-version-two'; await service.searchOllama({ q: 'food', model: 'embed:latest' });
  assert.ok(calls > before + 2);
  await assert.rejects(service.ollamaModels({ url: 'https://example.com' }), /private LAN/);
});

test('Ollama legacy embedding API fallback and abort contract', async t => {
  const fetchImpl = async (url, init) => {
    if (url.pathname.endsWith('/api/tags')) return Response.json({ models: [{ name: 'old', digest: 'v1' }] });
    if (url.pathname.endsWith('/api/show')) return new Response('404 page not found', { status: 404 });
    if (url.pathname.endsWith('/api/embed')) return Response.json({ error: 'not found' }, { status: 404 });
    assert.equal(url.pathname, '/api/embeddings');
    return Response.json({ embedding: vector(JSON.parse(init.body).prompt) });
  };
  const { service } = await fixture(t, { fetchImpl });
  const result = await service.searchOllama({ q: 'food', model: 'old' });
  assert.equal(result.results[0].conversationId, 'food');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(service.searchOllama({ q: 'food', model: 'old', signal: controller.signal }), { name: 'AbortError' });
});

test('real archive FTS candidates preserve accent-insensitive ranking and sparse turn indexes', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'threadshelf-fts-search-'));
  const store = new ArchiveStore({ dataDir }); await store.init();
  const service = new SearchService({ store, dataDir });
  t.after(async () => { await service.close(); store.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  await store.upsert({ collection: 'Hardware', title: 'Magyar billentyűzet', provider: 'venice', sourceFile: 'fixture.json', conversationKey: 'hu', turns: [{ user: 'A billentyűzet beállítása', turn_index: 29 }, { ai: 'F13 through F24', turn_index: 75 }] });
  const result = await service.search({ q: 'billentyuzet beallitasa' });
  assert.equal(result.results[0].turnIndex, 29);
  assert.equal((await service.search({ q: 'F24' })).results[0].turnIndex, 75);
  const assistant = await service.search({ q: 'F24', role: 'assistant' });
  assert.equal(assistant.results[0].turnIndex, 75);
  assert.equal(assistant.results[0].role, 'ai');
});
