#!/usr/bin/env node
// Copyright (c) 2026 davoda1. MIT.
// Real upstream server + real embeddings, with synthetic exports and isolated data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const usage = 'Usage: node tests/full-server.mjs <patched-ThreadShelf-1.4.1-source> [--model-cache <directory>] [--suite <ThreadShelf-Local-Suite-source>]';
const args = process.argv.slice(2);
if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
  console.log(usage);
  process.exit(0);
}
const targetArgument = args.shift();
if (!targetArgument || targetArgument.startsWith('--')) throw new Error(usage);
const options = {};
while (args.length) {
  const option = args.shift(), value = args.shift();
  if (!['--suite', '--model-cache'].includes(option) || !value || options[option]) throw new Error(usage);
  options[option] = value;
}

const target = await fs.realpath(path.resolve(targetArgument));
const pkg = JSON.parse(await fs.readFile(path.join(target, 'package.json'), 'utf8'));
assert.equal(pkg.name, 'threadshelf', 'Use the upstream ThreadShelf source checkout');
assert.equal(pkg.version, '1.4.1', 'This runner validates upstream 1.4.1');
const bundle = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const preflight = spawnSync(process.execPath, [path.join(bundle, 'manage.mjs'), 'check', target], { encoding: 'utf8' });
assert.equal(preflight.status, 0, preflight.stderr || preflight.stdout || 'Patch preflight failed');
await fs.access(path.join(target, 'src/routes/reader-search.ts'));
const requireTarget = createRequire(path.join(target, 'package.json'));
const tsx = pathToFileURL(requireTarget.resolve('tsx')).href;
const dependencies = await fs.realpath(path.join(target, 'node_modules'));
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-141-full-server-'));
const serverRoot = path.join(temp, 'server');
const dataRoot = path.join(temp, 'data');
const modelCache = path.resolve(options['--model-cache'] || process.env.THREADSHELF_MODEL_CACHE || path.join(temp, 'model-cache'));
const halt = new AbortController();
const steps = [];
const startedAt = Date.now();
let child, database, baseUrl, suiteProvenance;
const serverOutput = [];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const stopSignal = () => { halt.abort(new Error('Validation cancelled')); child?.kill(); };
process.once('SIGINT', stopSignal);
process.once('SIGTERM', stopSignal);

async function step(name, action) {
  const started = Date.now();
  try {
    await action();
    const durationMs = Date.now() - started;
    steps.push({ name, passed: true, durationMs });
    console.log(`ok ${steps.length} - ${name} (${durationMs} ms)`);
  } catch (error) {
    steps.push({ name, passed: false, durationMs: Date.now() - started });
    console.log(`not ok ${steps.length} - ${name}`);
    throw error;
  }
}

async function sourceTree(directory, relative = '', hashes = {}) {
  for (const entry of await fs.readdir(path.join(directory, relative), { withFileTypes: true })) {
    const name = path.posix.join(relative, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Source symlinks are not supported: ${name}`);
    if (entry.isDirectory()) await sourceTree(directory, name, hashes);
    else {
      assert.ok(entry.isFile() && entry.name.endsWith('.ts'), `Unexpected non-TypeScript source: ${name}`);
      hashes[name] = sha(await fs.readFile(path.join(directory, name)));
    }
  }
  return Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b)));
}

async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  return port;
}

async function request(endpoint, params = {}, init = {}) {
  const url = new URL(endpoint, baseUrl);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  const response = await fetch(url, { ...init, signal: AbortSignal.any([halt.signal, AbortSignal.timeout(180_000)]) });
  const body = await response.json();
  return { status: response.status, body };
}

function rawRequest(endpoint, headers) {
  return new Promise((resolve, reject) => {
    const request = http.get(new URL(endpoint, baseUrl), { headers }, response => {
      response.resume();
      response.once('end', () => resolve(response.statusCode));
    });
    request.once('error', reject);
    request.setTimeout(10_000, () => request.destroy(new Error('Boundary request timed out')));
  });
}

const needle = 'patchvalidationneedle';
const countPerCollection = 105;
const totalPassages = countPerCollection * 2;
const createdAt = index => index % 3 === 0 ? '2026-01-03T12:00:00.000Z' : '2026-01-05T12:00:00.000Z';
const modelFor = index => index % 10 === 9 ? 'validation-rare-model' : 'validation-standard-model';
const passage = (provider, index) => `${needle} ${provider} synthetic passage ${index}. Reliable pagination keeps archived conversation results complete and preserves their original order.`;

async function makeFixtures() {
  const openai = path.join(temp, 'fixtures', 'openai');
  const openrouter = path.join(temp, 'fixtures', 'openrouter');
  await fs.mkdir(openai, { recursive: true });
  await fs.mkdir(openrouter, { recursive: true });
  const mapping = { root: { id: 'root', parent: null, children: ['turn-0'] } };
  for (let index = 0; index < countPerCollection; index++) {
    mapping[`turn-${index}`] = {
      id: `turn-${index}`,
      parent: index === 0 ? 'root' : `turn-${index - 1}`,
      children: index + 1 < countPerCollection ? [`turn-${index + 1}`] : [],
      message: {
        author: { role: index % 2 ? 'assistant' : 'user' },
        content: { content_type: 'text', parts: [passage('openai', index)] },
        metadata: { model_slug: modelFor(index) },
        create_time: Date.parse(createdAt(index)) / 1000,
      },
    };
  }
  await fs.writeFile(path.join(openai, 'synthetic-openai.json'), JSON.stringify([{
    id: 'synthetic-validation-openai', title: 'Synthetic OpenAI archive',
    current_node: `turn-${countPerCollection - 1}`, mapping,
  }]));
  await fs.writeFile(path.join(openrouter, 'synthetic-openrouter.json'), JSON.stringify({
    platform: 'openrouter', title: 'Synthetic OpenRouter archive',
    turns: Array.from({ length: countPerCollection }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user', content: passage('openrouter', index),
      model: modelFor(index), createdAt: createdAt(index),
    })),
  }));
  return { alpha: openai, beta: openrouter };
}

async function ingest(folderPath, collection) {
  const response = await fetch(new URL('/api/ingest-progress', baseUrl), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ folderPath, collection, clearFirst: true }),
    signal: AbortSignal.any([halt.signal, AbortSignal.timeout(300_000)]),
  });
  assert.equal(response.status, 200);
  const text = await response.text();
  const events = text.split('\n').filter(Boolean).map(line => JSON.parse(line));
  const failure = events.find(event => event.status === 'error');
  assert.equal(failure, undefined, JSON.stringify(failure));
  const completed = events.find(event => event.status === 'completed');
  assert.ok(completed, 'Ingest must complete through the genuine server route');
  assert.equal(completed.result.ingested, countPerCollection, JSON.stringify(completed.result));
  assert.equal(completed.result.errors?.length || 0, 0, JSON.stringify(completed.result));
}

const identity = row => `${row.metadata.collection}/${row.id}`;
async function pages(options = {}, expected = totalPassages) {
  const parameters = { q: needle, collection: 'all', mode: 'keyword', n: 50, ...options };
  const results = [], cursors = new Set();
  let cursor;
  for (let page = 0; page < 100; page++) {
    const { status, body } = await request('/api/reader/search', { ...parameters, cursor });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.total, expected);
    assert.ok(Array.isArray(body.results));
    assert.ok(body.results.length <= parameters.n);
    results.push(...body.results);
    assert.equal(body.hasMore, results.length < expected);
    if (!body.hasMore) {
      assert.equal(body.nextCursor, null);
      assert.equal(results.length, expected);
      assert.equal(new Set(results.map(identity)).size, expected, 'No duplicate or overlapping pages');
      return results;
    }
    assert.ok(body.results.length > 0);
    assert.equal(typeof body.nextCursor, 'string');
    assert.ok(!cursors.has(body.nextCursor), 'The server cursor must advance');
    cursors.add(body.nextCursor);
    cursor = body.nextCursor;
  }
  throw new Error('Pagination did not terminate');
}

async function verifyAdapters(suitePath) {
  const suite = await fs.realpath(path.resolve(suitePath));
  const readerPath = 'apps/reader/src/core/server.mjs';
  const alternativePath = 'apps/alternative/core/server.cjs';
  const git = spawnSync('git', ['-C', suite, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  const readerPackage = JSON.parse(await fs.readFile(path.join(suite, 'apps/reader/package.json'), 'utf8'));
  const alternativePackage = JSON.parse(await fs.readFile(path.join(suite, 'apps/alternative/package.json'), 'utf8'));
  suiteProvenance = {
    repository: 'https://github.com/Davoda1/ThreadShelf-Local-Suite',
    commit: git.status === 0 ? git.stdout.trim() : null,
    reader: { version: readerPackage.version, path: readerPath, sha256: sha(await fs.readFile(path.join(suite, readerPath))) },
    alternative: { version: alternativePackage.version, path: alternativePath, sha256: sha(await fs.readFile(path.join(suite, alternativePath))) },
  };
  console.log(`# Adapter provenance: ${JSON.stringify(suiteProvenance)}`);
  const { ThreadShelfClient, ServerSearchPager } = await import(pathToFileURL(path.join(suite, readerPath)).href);
  const { ServerClient } = createRequire(path.join(suite, 'apps/alternative/package.json'))('./core/server.cjs');
  const trace = [];
  const tracingFetch = async (url, init) => { trace.push(new URL(url)); return fetch(url, init); };
  const assertExtensionTraffic = () => {
    const searchCalls = trace.filter(url => url.pathname === '/api/reader/search');
    assert.ok(searchCalls.length > 1, 'The real adapter must advance server pages');
    assert.ok(searchCalls.every(url => Number(url.searchParams.get('n')) <= 50));
    assert.ok(searchCalls.some(url => url.searchParams.has('cursor')));
    assert.ok(!trace.some(url => ['/api/search', '/api/thread'].includes(url.pathname)), 'The adapter must use the extension, not a fallback');
  };
  for (const mode of ['keyword', 'semantic']) {
    await step(`Public Reader ${readerPackage.version}: ${mode} aggregates 210 hits into 100/100/10 pages`, async () => {
      trace.length = 0;
      const client = new ThreadShelfClient(baseUrl, { fetchImpl: tracingFetch });
      const pager = new ServerSearchPager();
      const results = [], sizes = [];
      let session;
      for (let page = 1; page <= 3; page++) {
        const result = await pager.search(client, { q: needle, collection: 'all', searchMode: mode, page, pageSize: 100, searchSession: session });
        session = result.searchSession;
        assert.equal(result.total, totalPassages);
        assert.equal(result.totalKnown, true);
        assert.equal(result.searchInfo.engine, 'server-paged');
        assert.equal(result.searchInfo.exhaustive, true);
        assert.equal(result.hasMore, page < 3);
        sizes.push(result.results.length); results.push(...result.results);
      }
      assert.deepEqual(sizes, [100, 100, 10]);
      assert.equal(new Set(results.map(row => row.passageId)).size, totalPassages);
      assertExtensionTraffic();
      pager.clear();
    });
    await step(`Public Alternative ${alternativePackage.version}: ${mode} reaches all 210 hits`, async () => {
      trace.length = 0;
      const client = new ServerClient(baseUrl, { fetchImpl: tracingFetch });
      try {
        const results = [];
        let offset = 0;
        do {
          const result = await client.search({ q: needle, collection: 'all', mode, limit: 50, offset });
          assert.equal(result.total, totalPassages);
          assert.equal(result.totalKnown, true);
          assert.equal(result.exhaustive, true);
          assert.equal(result.engine, 'reader-extension');
          results.push(...result.items);
          offset = result.nextOffset;
        } while (offset !== null);
        assert.equal(results.length, totalPassages);
        assert.equal(new Set(results.map(row => row.passageId)).size, totalPassages);
        assertExtensionTraffic();
      } finally { client.dispose(); }
    });
  }
  await step('Both public adapters preserve provider and role filters before pagination', async () => {
    const expected = 52;
    const reader = new ThreadShelfClient(baseUrl);
    const pager = new ServerSearchPager();
    const readerRows = [];
    let session;
    for (let page = 1; page <= 2; page++) {
      const result = await pager.search(reader, { q: needle, collection: 'all', searchMode: 'keyword', provider: 'openai', role: 'assistant', pageSize: 37, page, searchSession: session });
      session = result.searchSession;
      assert.equal(result.total, expected);
      readerRows.push(...result.results);
    }
    assert.equal(readerRows.length, expected);
    assert.ok(readerRows.every(row => row.provider === 'openai' && row.role === 'assistant'));
    assert.equal(new Set(readerRows.map(row => row.passageId)).size, expected);
    const alternative = new ServerClient(baseUrl);
    try {
      const rows = [];
      let offset = 0;
      do {
        const result = await alternative.search({ q: needle, collection: 'all', mode: 'keyword', provider: 'openai', role: 'assistant', limit: 17, offset });
        assert.equal(result.total, expected);
        rows.push(...result.items); offset = result.nextOffset;
      } while (offset !== null);
      assert.equal(rows.length, expected);
      assert.ok(rows.every(row => row.provider === 'openai' && row.role === 'assistant'));
      assert.equal(new Set(rows.map(row => row.passageId)).size, expected);
    } finally { alternative.dispose(); pager.clear(); }
  });
}

console.log('TAP version 13');
try {
  await step('Copies only actual patched source and package manifests into isolated storage', async () => {
    const originalHashes = await sourceTree(path.join(target, 'src'));
    await fs.mkdir(serverRoot);
    await fs.mkdir(dataRoot);
    await fs.mkdir(modelCache, { recursive: true });
    await fs.cp(path.join(target, 'src'), path.join(serverRoot, 'src'), { recursive: true });
    for (const name of ['package.json', 'package-lock.json']) await fs.copyFile(path.join(target, name), path.join(serverRoot, name));
    await fs.symlink(dependencies, path.join(serverRoot, 'node_modules'), 'junction');
    assert.deepEqual(await sourceTree(path.join(serverRoot, 'src')), originalHashes);
    assert.deepEqual((await fs.readdir(serverRoot)).sort(), ['node_modules', 'package-lock.json', 'package.json', 'src']);
    console.log(`# Patched source SHA-256: ${sha(JSON.stringify(originalHashes))}; Node ${process.version}; ${process.platform}/${process.arch}`);
    console.log('# Embedding model: Xenova/paraphrase-multilingual-MiniLM-L12-v2, q8, 384 dimensions (no inference stub).');
  });
  await step('Boots the actual upstream src/server.ts with isolated configuration and storage', async () => {
    const inherited = {};
    for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'LD_LIBRARY_PATH', 'DYLD_LIBRARY_PATH', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS']) {
      if (process.env[key] !== undefined) inherited[key] = process.env[key];
    }
    const port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['--import', tsx, 'src/server.ts'], {
      cwd: serverRoot,
      env: {
        ...inherited, PORT: String(port), HOST: '127.0.0.1', ALLOWED_HOSTS: '',
        TMPDIR: temp, TEMP: temp, TMP: temp,
        THREADSHELF_DATA_DIR: dataRoot, LANCEDB_PATH: path.join(dataRoot, 'lancedb'),
        UPLOADS_DIR: path.join(dataRoot, 'uploads'), COLLECTIONS_PATH: path.join(dataRoot, 'collections.json'),
        GENERATION_CONFIG_PATH: path.join(dataRoot, 'generation.json'),
        MASTER_PROMPTS_PATH: path.join(dataRoot, 'master-prompts.json'),
        OBSIDIAN_CONFIG_PATH: path.join(dataRoot, 'obsidian.json'),
        GENERATION_ERROR_LOG_PATH: path.join(dataRoot, 'generation-errors.log'),
        THREADSHELF_TOOLS_PATH: path.join(dataRoot, 'tools'), THREADSHELF_MODELS_PATH: path.join(dataRoot, 'models'),
        THREADSHELF_MODEL_CACHE: modelCache, THREADSHELF_DISABLE_DEFAULT_MODEL_PATHS: '1',
        OPENROUTER_API_KEY: '', THREADSHELF_API_KEY: '', STRATA_API_KEY: '', STRATA_BASE_URL: 'http://127.0.0.1:9',
        EMBED_BATCH_SIZE: '16', CHUNK_MAX_CHARS: '2000', CHUNK_OVERLAP_CHARS: '100',
        OMP_NUM_THREADS: '2', OPENBLAS_NUM_THREADS: '2', MKL_NUM_THREADS: '2',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
      serverOutput.push(String(chunk));
      if (serverOutput.length > 100) serverOutput.shift();
    });
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      halt.signal.throwIfAborted();
      assert.equal(child.exitCode, null, `Server exited: ${serverOutput.join('')}`);
      try {
        const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1_000) });
        if (response.ok && (await response.json()).ok === true) return;
      } catch { /* Wait briefly for the process to start listening. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Server health timeout: ${serverOutput.join('')}`);
  });
  await step('Actual router advertises Reader extension v1 and exact paged totals', async () => {
    const { status, body } = await request('/api/reader/capabilities');
    assert.equal(status, 200);
    assert.equal(body.readerSearch.version, 1);
    assert.equal(body.readerSearch.path, '/api/reader/search');
    assert.equal(body.readerSearch.maxPageSize, 50);
    assert.equal(body.readerSearch.cursor, true);
    assert.equal(body.readerSearch.exactTotal, true);
    assert.equal(body.readerSearch.providerFilter, true);
    assert.deepEqual(body.readerSearch.modes, ['keyword', 'semantic']);
  });
  await step('Actual server retains Host and Origin protection on both new endpoints', async () => {
    for (const endpoint of ['/api/reader/capabilities', `/api/reader/search?q=${needle}`]) {
      assert.equal(await rawRequest(endpoint, { Host: 'untrusted.example' }), 403);
      assert.equal(await rawRequest(endpoint, { Origin: 'https://untrusted.example' }), 403);
      assert.equal(await rawRequest(endpoint, { Origin: 'null' }), 403);
    }
  });
  await step('Real HTTP ingestion embeds 210 synthetic passages across two providers and collections', async () => {
    const fixtures = await makeFixtures();
    for (const [collection, folder] of Object.entries(fixtures)) await ingest(folder, collection);
  });
  await step('Native LanceDB contains genuine nonzero 384-dimensional vectors for all 210 passages', async () => {
    const { connect } = requireTarget('@lancedb/lancedb');
    database = await connect(path.join(dataRoot, 'lancedb'), { readConsistencyInterval: 0 });
    for (const collection of ['alpha', 'beta']) {
      const table = await database.openTable(collection);
      assert.equal(await table.countRows(), countPerCollection);
      const [row] = await table.query().select(['vector']).limit(1).toArray();
      const vector = Array.from(row.vector);
      assert.equal(vector.length, 384);
      assert.ok(vector.every(Number.isFinite));
      assert.ok(vector.some(value => value !== 0));
    }
  });
  await step('Keyword HTTP pagination reaches all 210 hits beyond 50 and 200 without overlap', async () => {
    const rows = await pages();
    assert.ok(rows.every(row => row.document.includes(needle)));
    assert.equal(rows.filter(row => row.metadata.provider === 'openai').length, countPerCollection);
    assert.equal(rows.filter(row => row.metadata.provider === 'openrouter').length, countPerCollection);
  });
  await step('Real-model semantic HTTP pagination returns all 210 hits in cosine-distance order', async () => {
    const rows = await pages({ mode: 'semantic', q: 'Reliable pagination of archived conversations' });
    assert.ok(rows.every(row => Number.isFinite(row.distance)));
    for (let index = 1; index < rows.length; index++) assert.ok(rows[index - 1].distance <= rows[index].distance);
  });
  await step('Semantic keyword boost retains complete pagination with genuine model inference', async () => {
    const rows = await pages({ mode: 'semantic', keywordBoost: true });
    assert.ok(rows.every(row => Number.isFinite(row.distance)));
  });
  await step('Combined provider, role, model, date and origin filters give exact totals in both modes', async () => {
    for (const mode of ['keyword', 'semantic']) {
      const rows = await pages({ mode, provider: 'openai', roles: 'ai', model: 'validation-rare', from: '2026-01-03', to: '2026-01-03', origin: 'archive', n: 3 }, 4);
      assert.ok(rows.every(row => row.metadata.provider === 'openai' && row.metadata.role === 'ai' && row.metadata.model === 'validation-rare-model' && row.metadata.createdAt.startsWith('2026-01-03') && !row.metadata.createdInThreadShelf));
    }
  });
  await step('Single-collection paging, empty matches and empty origin selections are complete', async () => {
    const rows = await pages({ collection: 'alpha', n: 37 }, countPerCollection);
    assert.ok(rows.every(row => row.metadata.collection === 'alpha'));
    await pages({ q: 'no-synthetic-passage-contains-this-token' }, 0);
    await pages({ origin: 'threadshelf' }, 0);
  });
  await step('Existing search, file listing and complete thread APIs retain their original behavior', async () => {
    for (const mode of ['keyword', 'semantic']) {
      const { status, body } = await request('/api/search', { q: needle, collection: 'all', mode, n: 50 });
      assert.equal(status, 200);
      assert.deepEqual(Object.keys(body), ['results']);
      assert.equal(body.results.length, 50);
    }
    assert.equal((await request('/api/search', { q: needle, n: 51 })).status, 400);
    const files = await request('/api/files', { collection: 'all' });
    assert.equal(files.status, 200);
    assert.equal(files.body.files.length, 2);
    for (const item of files.body.files) {
      const thread = await request('/api/thread', { collection: item.collection, sourceFile: item.sourceFile, conversationKey: item.conversationKey });
      assert.equal(thread.status, 200);
      assert.equal(thread.body.turns.length, countPerCollection);
    }
  });
  await step('Actual HTTP route rejects changed-query cursors and supports explicit snapshot release', async () => {
    const params = { q: needle, collection: 'all', mode: 'keyword', n: 50 };
    const first = await request('/api/reader/search', params);
    assert.equal(first.status, 200);
    assert.ok(first.body.nextCursor);
    const cursor = first.body.nextCursor;
    assert.equal((await request('/api/reader/search', { ...params, cursor, q: 'other query' })).status, 400);
    assert.equal((await request('/api/reader/search', { ...params, cursor, provider: 'openai' })).status, 400);
    assert.equal((await request('/api/reader/search', { ...params, n: 51 })).status, 400);
    assert.equal((await request('/api/reader/search', { ...params, cursor: 'malformed' })).status, 400);
    const released = await fetch(`${baseUrl}/api/reader/search?cursor=${encodeURIComponent(cursor)}`, { method: 'DELETE', signal: AbortSignal.timeout(10_000) });
    assert.equal(released.status, 204);
    assert.equal((await request('/api/reader/search', { ...params, cursor })).status, 410);
  });
  if (options['--suite']) await verifyAdapters(options['--suite']);
  else console.log('# Optional desktop adapter integration omitted: pass --suite <public-suite-source>.');
  console.log(`1..${steps.length}`);
  console.log(`# VALIDATION_SUMMARY ${JSON.stringify({ passed: true, checks: steps.length, elapsedMs: Date.now() - startedAt, node: process.version, platform: process.platform, arch: process.arch, upstreamVersion: pkg.version, model: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', dimensions: 384, passages: totalPassages, suite: suiteProvenance ?? null })}`);
} catch (error) {
  process.exitCode = 1;
  console.error(error.stack || String(error));
  if (serverOutput.length) console.error(`Isolated server output:\n${serverOutput.join('').slice(-12000)}`);
  console.log(`1..${steps.length}`);
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    const closed = new Promise(resolve => child.once('close', resolve));
    child.kill();
    let timer;
    try { await Promise.race([closed, new Promise(resolve => { timer = setTimeout(resolve, 5000); })]); }
    finally { clearTimeout(timer); }
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await closed; }
  }
  database?.close();
  await fs.rm(temp, { recursive: true, force: true });
  process.removeListener('SIGINT', stopSignal);
  process.removeListener('SIGTERM', stopSignal);
}
