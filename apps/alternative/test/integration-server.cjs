'use strict';
/**
 * Optional integration gate against an existing ThreadShelf 1.3.0 installation.
 * Run: THREADSHELF_TEST_SERVER_ROOT=/path/to/ThreadShelf node test/integration-server.cjs
 * Optional THREADSHELF_TEST_MODEL_CACHE selects a separate read-only model cache.
 * The server's code/dependencies are read-only inputs. All runtime data and a
 * copy of its embedding cache live in a new temporary directory. No real chat
 * exports or existing databases are read. The temporary directory is removed.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');

const serverRoot = process.env.THREADSHELF_TEST_SERVER_ROOT;
if (!serverRoot) {
  console.log('SKIP: set THREADSHELF_TEST_SERVER_ROOT to a ThreadShelf 1.3.0 installation.');
  process.exit(0);
}
const appRoot = path.resolve(__dirname, '..');
const ROOT = path.resolve(serverRoot);
const serverNode = process.env.THREADSHELF_TEST_NODE || process.execPath;
const report = {
  product: 'ThreadShelf Local Alternative', version: '1.2.0',
  verifiedAt: new Date().toISOString(), serverVersion: null,
  fixture: { syntheticOnly: true, collections: 2, chunks: 520, conversations: 520, sharedSourceAndKeys: true },
  dataIsolation: 'Fresh temporary LanceDB, uploads, settings, model cache, tools and collections paths; original installation unchanged.',
  tests: [], limitations: [],
};
const log = [];
let child, temp;
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let out = '';
    proc.stdout.on('data', chunk => { out += chunk; });
    proc.stderr.on('data', chunk => { out += chunk; });
    proc.on('error', reject);
    proc.on('exit', code => code === 0 ? resolve(out) : reject(new Error(`Command exited ${code}: ${out}`)));
  });
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function check(name, fn) {
  const start = Date.now();
  try { const details = await fn(); report.tests.push({ name, status: 'pass', ms: Date.now() - start, ...details }); console.log(`PASS ${name}`); }
  catch (error) { report.tests.push({ name, status: 'fail', error: error.message }); throw error; }
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const stopped = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  await stopped; clearTimeout(timer);
}
const seed = String.raw`
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const require = createRequire(join(process.env.QA_SERVER_ROOT, 'package.json'));
const { connect } = require('@lancedb/lancedb');
let vector = Array.from({ length: 384 }, (_, i) => i === 0 ? 1 : 0);
let modelError = '';
if (process.env.QA_SEMANTIC === '1') {
  try {
  const { embedOne } = await import(pathToFileURL(join(process.env.QA_SERVER_ROOT, 'dist/src/embedding.js')));
  vector = await embedOne('paginationneedle');
  if (vector.length !== 384) throw new Error('Embedding dimension mismatch');
  } catch (error) { modelError = error.message.replaceAll(process.env.THREADSHELF_DATA_DIR, '<isolated-test-data>'); }
}
const db = await connect(process.env.LANCEDB_PATH);
const stored = [];
for (const collection of ['alpha', 'beta']) {
  const chunks = Array.from({ length: 260 }, (_, i) => {
    const turns = [
      { user: collection + ' question ' + i + ' paginationneedle', createdAt: '2026-01-03T12:00:00.000Z' },
      { thinking: 'Synthetic private reasoning for ' + collection + ' ' + i },
      { ai: collection + ' answer ' + i + '\n\n**Rendered markdown** with a code example.\n\n\x60\x60\x60js\nconst safe = true;\n\x60\x60\x60', model: 'ordinary-model', createdAt: '2026-01-05T12:00:00.000Z' },
    ];
    stored.push({ collection, sourceFile: '/synthetic/shared-export.json', conversationKey: 'conversation-' + i,
      title: collection + ' title ' + i, provider: i % 2 ? 'anthropic' : 'openai', ordinal: i, turnCount: turns.length,
      turnsJson: JSON.stringify(turns), ingestedAt: collection === 'alpha' ? '2026-01-03T12:00:00.000Z' : '2026-01-05T12:00:00.000Z',
      lastTurnAt: '2026-01-05T12:00:00.000Z', lastModel: 'ordinary-model', createdInThreadShelf: false,
      threadCreatedAt: '2026-01-03T12:00:00.000Z', hasThreadShelfTurns: false,
      indexPending: '', indexAttempts: 0, indexRetryAt: 0, indexError: '',
    });
    return { id: 'chunk-' + String(i).padStart(4, '0'), vector,
      document: 'paginationneedle synthetic ' + collection + ' document ' + i,
      sourceFile: '/synthetic/shared-export.json', provider: i % 2 ? 'anthropic' : 'openai',
      conversationKey: 'conversation-' + i, title: collection + ' title ' + i,
      role: i % 2 ? 'ai' : 'user', turnIndex: '0', model: i % 10 ? 'ordinary-model' : 'rare-model',
      createdAt: i % 2 ? '2026-01-05T12:00:00.000Z' : '2026-01-03T12:00:00.000Z',
      createdInThreadShelf: i % 3 === 0, generationProvider: '' };
  });
  await db.createTable(collection, chunks);
}
await db.createTable('__threads', stored);
console.log(JSON.stringify({ seeded: 520, semantic: process.env.QA_SEMANTIC === '1' && !modelError, modelError }));
`;

(async () => {
  report.serverVersion = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8')).version;
  assert.equal(report.serverVersion, '1.3.0');
  const qaParent = process.env.THREADSHELF_TEST_TEMP_PARENT || os.tmpdir();
  await fs.mkdir(qaParent, { recursive: true });
  temp = await fs.mkdtemp(path.join(qaParent, 'threadshelf-alternative-'));
  const cache = process.env.THREADSHELF_TEST_MODEL_CACHE ? path.resolve(process.env.THREADSHELF_TEST_MODEL_CACHE) : path.join(ROOT, '.threadshelf', 'model-cache');
  const hasModel = await fs.access(path.join(cache, 'Xenova/paraphrase-multilingual-MiniLM-L12-v2/onnx/model_quantized.onnx')).then(() => true, () => false);
  if (hasModel) await fs.cp(cache, path.join(temp, 'model-cache'), { recursive: true });
  else report.limitations.push('Semantic mode was not exercised because no bundled MiniLM model cache was available; no model was downloaded.');
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = { ...process.env,
    HOST: '127.0.0.1', PORT: String(port),
    THREADSHELF_DATA_DIR: temp, LANCEDB_PATH: path.join(temp, 'lancedb'), UPLOADS_DIR: path.join(temp, 'uploads'),
    COLLECTIONS_PATH: path.join(temp, 'collections.json'), GENERATION_CONFIG_PATH: path.join(temp, 'generation.json'),
    MASTER_PROMPTS_PATH: path.join(temp, 'master-prompts.json'), THREADSHELF_MODEL_CACHE: path.join(temp, 'model-cache'),
    THREADSHELF_MODELS_PATH: path.join(temp, 'models'), THREADSHELF_TOOLS_PATH: path.join(temp, 'tools'),
    THREADSHELF_DISABLE_DEFAULT_MODEL_PATHS: '1', OPENROUTER_API_KEY: '', THREADSHELF_API_KEY: '',
    QA_SERVER_ROOT: ROOT, QA_SEMANTIC: hasModel ? '1' : '0',
  };
  await fs.mkdir(env.UPLOADS_DIR, { recursive: true });
  const seedOutput = await run(serverNode, ['--input-type=module', '-e', seed], { cwd: temp, env });
  const seedResult = JSON.parse(seedOutput.trim().split('\n').findLast(line => line.startsWith('{')));
  report.embeddingRuntime = { cachedModel: hasModel, cacheSource: process.env.THREADSHELF_TEST_MODEL_CACHE ? 'explicit-read-only-cache-input' : 'server-installation-cache', validModel: seedResult.semantic, ...(seedResult.modelError ? { error: seedResult.modelError } : {}) };
  if (seedResult.modelError) report.limitations.push('Real semantic result retrieval could not be verified because the supplied cached model fails ONNX parsing. The real API failure is tested and must surface as an error, never as empty results.');
  console.log(`Seeded ${seedResult.seeded} synthetic rows; semantic model available: ${seedResult.semantic}`);
  child = spawn(serverNode, [path.join(ROOT, 'dist/src/server.js')], { cwd: temp, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => log.push(String(chunk))); child.stderr.on('data', chunk => log.push(String(chunk)));
  let ready = false;
  for (let tries = 0; tries < 120; tries++) {
    try { const response = await fetch(`${baseUrl}/api/health`); if (response.ok) { ready = true; break; } } catch {}
    if (child.exitCode !== null) throw new Error('Server exited: ' + log.join(''));
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'isolated real server becomes healthy');
  const adapter = require('../core/server.cjs');
  // Adapter checks are populated against its published API below.
  await exerciseAdapter(adapter, baseUrl, seedResult.semantic, seedResult.modelError);
  report.limitations.push('Synthetic fixtures verify adapter/API integration and complete cursor traversal, not search relevance on private exports.');
  report.limitations.push('The packaged Windows executable is not executed by this Linux-only server integration harness.');
  report.status = 'pass';
})().catch(error => {
  report.status = 'fail'; report.error = error.stack; console.error(error);
  if (log.length) console.error(log.join('').slice(-12000));
  process.exitCode = 1;
}).finally(async () => {
  await stop();
  if (temp) await fs.rm(temp, { recursive: true, force: true });
  const reportPath = process.env.THREADSHELF_TEST_REPORT || path.join(appRoot, 'docs/server-verification.json');
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
});

async function exerciseAdapter(adapter, baseUrl, hasModel, modelError) {
  const requests = [];
  const client = new adapter.ServerClient(baseUrl, { timeoutMs: 120000, fetchImpl: async (url, options) => {
    requests.push({ method: options.method, pathname: new URL(url).pathname });
    return fetch(url, options);
  } });
  const collect = async (options, expected) => {
    const rows = []; let offset = 0, pages = 0, last;
    do {
      last = await client.search({ ...options, offset }); pages++;
      assert.equal(last.total, expected); assert.equal(last.totalKnown, true);
      assert.equal(last.engine, 'reader-extension');
      assert.ok(last.items.length <= options.limit);
      rows.push(...last.items); offset += last.items.length;
      assert.ok(pages < 100, 'search terminates');
    } while (last.hasMore);
    assert.equal(rows.length, expected);
    assert.equal(new Set(rows.map(row => row.passageId)).size, expected, 'passage identity includes collection');
    assert.equal(new Set(rows.map(row => row.id)).size, expected, 'conversation identity includes collection');
    return { rows, pages, finalPage: last.items.length };
  };
  await check('real server health and Reader cursor capabilities', async () => {
    assert.equal((await client.health()).ok, true);
    const caps = await client.capabilities();
    assert.equal(caps.pagination, true); assert.equal(caps.exactTotal, true); assert.equal(caps.maxPageSize, 50);
    return { engine: caps.engine, maxPageSize: caps.maxPageSize };
  });
  await check('collection counts and full browse preserve colliding identities', async () => {
    const collections = await client.collections();
    assert.equal(collections.total, 520);
    for (const name of ['alpha', 'beta']) assert.equal(collections.collections.find(c => c.name === name).count, 260);
    const rows = [];
    for (let offset = 0; offset < 520; offset += 37) {
      const page = await client.browse({ collection: 'all', sort: 'title', limit: 37, offset });
      assert.equal(page.total, 520); rows.push(...page.items);
    }
    assert.equal(rows.length, 520); assert.equal(new Set(rows.map(row => row.id)).size, 520);
    return { conversations: rows.length, pages: 15 };
  });
  await check('keyword search passes both 50 and 200 result cutoffs', async () => {
    const result = await collect({ collection: 'all', q: 'paginationneedle', mode: 'keyword', limit: 50 }, 520);
    const firstAgain = await client.search({ q: 'paginationneedle', mode: 'keyword', limit: 50, offset: 0 });
    assert.deepEqual(firstAgain.items.map(row => row.passageId), result.rows.slice(0, 50).map(row => row.passageId));
    assert.equal(result.pages, 11); assert.equal(result.finalPage, 20);
    return { passages: 520, pages: result.pages, pageSize: 50, finalPage: result.finalPage, duplicates: 0 };
  });
  await check('single-collection cursor traversal and short final page', async () => {
    const result = await collect({ collection: 'alpha', q: 'paginationneedle', mode: 'keyword', limit: 17 }, 260);
    assert.ok(result.rows.every(row => row.collection === 'alpha'));
    assert.equal(result.pages, 16); assert.equal(result.finalPage, 5);
    return { passages: 260, pages: result.pages, pageSize: 17, finalPage: result.finalPage };
  });
  await check('provider and assistant role filters apply before pagination', async () => {
    const result = await collect({ collection: 'all', q: 'paginationneedle', mode: 'keyword', provider: 'anthropic', role: 'assistant', limit: 31 }, 260);
    assert.ok(result.rows.every(row => row.provider === 'anthropic' && row.role === 'assistant'));
    return { passages: 260, pages: result.pages, role: 'assistant', provider: 'anthropic' };
  });
  if (hasModel) await check('real cached MiniLM semantic embeddings and cursor traversal', async () => {
    const result = await collect({ collection: 'all', q: 'paginationneedle', mode: 'semantic', limit: 50 }, 520);
    assert.equal(result.pages, 11);
    return { passages: 520, pages: result.pages, embeddingDimension: 384, model: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', cachedModel: true, mockedEmbedder: false };
  });
  if (modelError) await check('semantic model runtime failure is surfaced as an error', async () => {
    await assert.rejects(() => client.search({ q: 'paginationneedle', mode: 'semantic', limit: 50 }), error => error.status === 500 && error.code === 'HTTP_ERROR' && /Protobuf|model|ONNX/i.test(error.message));
    return { expectedStatus: 500, errorSurfaced: true, falseEmptySuccess: false };
  });
  await check('zero matches return a complete empty result', async () => {
    const result = await client.search({ q: 'this-token-is-absent-from-the-synthetic-fixture', mode: 'keyword', limit: 50 });
    assert.equal(result.total, 0); assert.equal(result.totalKnown, true); assert.equal(result.hasMore, false); assert.deepEqual(result.items, []);
    return { total: 0 };
  });
  await check('conversation retrieval scopes identical source and key to collection', async () => {
    const replies = []; let fixtureIndex;
    for (const collection of ['alpha', 'beta']) {
      const result = await client.search({ collection, q: 'paginationneedle', mode: 'keyword', limit: 50 });
      const item = fixtureIndex === undefined ? result.items[0] : result.items.find(row => row.conversationKey === `conversation-${fixtureIndex}`);
      fixtureIndex ??= Number(item.conversationKey.replace('conversation-', ''));
      assert.ok(item, 'collision fixture appears in first page');
      const thread = await client.thread(item);
      assert.equal(thread.collection, collection); assert.equal(thread.title, `${collection} title ${fixtureIndex}`);
      assert.equal(thread.messages.length, 3);
      assert.deepEqual(thread.messages.map(m => m.role), ['user', 'thinking', 'assistant']);
      assert.equal(thread.messages[0].content, `${collection} question ${fixtureIndex} paginationneedle`);
      assert.ok(thread.messages[2].content.startsWith(`${collection} answer ${fixtureIndex}`));
      replies.push(thread);
    }
    assert.notEqual(replies[0].id, replies[1].id);
    assert.equal(replies[0].sourceFile, replies[1].sourceFile);
    assert.equal(replies[0].conversationKey, replies[1].conversationKey);
    return { collections: ['alpha', 'beta'], messagesPerConversation: 3, reasoningPreserved: true };
  });
  await check('real server archive Insights preserve counts and units', async () => {
    const stats = await client.stats('all');
    assert.equal(stats.totals.chunks, 520); assert.equal(stats.totals.conversations, 520);
    assert.equal(stats.totals.turns, 1560); assert.equal(stats.source, 'server-insights');
    return { totals: stats.totals, units: stats.units };
  });
  await check('the client performs only read-only GET requests', async () => {
    assert.ok(requests.length > 0); assert.ok(requests.every(request => request.method === 'GET'));
    return { requestCount: requests.length, methods: [...new Set(requests.map(request => request.method))], endpoints: [...new Set(requests.map(request => request.pathname))].sort() };
  });
  client.dispose();
}
