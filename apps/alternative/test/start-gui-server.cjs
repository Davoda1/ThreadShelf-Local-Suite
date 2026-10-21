'use strict';
/**
 * Isolated real ThreadShelf fixture server for manual/native GUI testing.
 * Required: THREADSHELF_TEST_SERVER_ROOT=/path/to/ThreadShelf-1.3.0
 * Optional: THREADSHELF_TEST_MODEL_CACHE=/path/to/model-cache
 * Optional: THREADSHELF_TEST_TEMP_PARENT=/path/to/qa, THREADSHELF_TEST_PORT=3137
 * Existing installation/data are never edited. SIGINT/SIGTERM stops the server
 * and removes only this helper's fresh temporary data directory.
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const ROOT = process.env.THREADSHELF_TEST_SERVER_ROOT;
if (!ROOT) { console.error('Set THREADSHELF_TEST_SERVER_ROOT to a ThreadShelf 1.3.0 installation.'); process.exit(1); }
const root = path.resolve(ROOT);
const node = process.env.THREADSHELF_TEST_NODE || process.execPath;
let child, temp, stopping = false;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function choosePort(preferred) {
  const probe = net.createServer();
  try {
    await new Promise((resolve, reject) => probe.once('error', reject).listen(preferred, '127.0.0.1', resolve));
    const port = probe.address().port; await new Promise(resolve => probe.close(resolve)); return port;
  } catch (error) { if (preferred && error.code === 'EADDRINUSE') return choosePort(0); throw error; }
}
function run(args, options) {
  return new Promise((resolve, reject) => {
    const proc = spawn(node, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] }); let output = '';
    proc.stdout.on('data', chunk => { output += chunk; }); proc.stderr.on('data', chunk => { output += chunk; });
    proc.on('error', reject); proc.on('exit', code => code === 0 ? resolve(output) : reject(new Error(output)));
  });
}
async function stop(code = 0) {
  if (stopping) return; stopping = true;
  if (child && child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000); await exited; clearTimeout(timer);
  }
  if (temp) await fs.rm(temp, { recursive: true, force: true });
  console.log('Isolated GUI fixture server stopped and temporary data removed.');
  process.exitCode = code;
}
process.on('SIGINT', () => { void stop(); }); process.on('SIGTERM', () => { void stop(); });
const seed = String.raw`
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(join(process.env.QA_SERVER_ROOT, 'package.json'));
const { connect } = require('@lancedb/lancedb');
const { embedOne } = await import(pathToFileURL(join(process.env.QA_SERVER_ROOT, 'dist/src/embedding.js')));
const vector = await embedOne('paginationneedle');
const db = await connect(process.env.LANCEDB_PATH); const threads = [];
const body = (collection, i) => '# A readable archive\n\nThis is **bold**, *italic*, and a [reference link](https://example.org). Search marker: paginationneedle.\n\n## Comparison\n\n| Choice | Value |\n| --- | --- |\n| Alpha | 12 |\n| Beta | 24 |\n\n## Example code\n\n\x60\x60\x60javascript\nconst collection = "' + collection + '";\nconst conversation = ' + i + ';\nconsole.log(collection, conversation);\n\x60\x60\x60\n\n## Mathematics\n\nInline: $E = mc^2$.\n\n$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$\n\n> The archive remains on the server.\n\n- Search all matching passages\n- Preserve the selected collection\n- Read the full conversation';
for (const [collection, count] of [['alpha', 35], ['beta', 30]]) {
  const rows = Array.from({ length: count }, (_, i) => {
    const key = 'conversation-' + String(i).padStart(2, '0');
    const title = 'Archive reading — ' + collection + ' ' + String(i).padStart(2, '0');
    const when = '2026-10-' + String(1 + i % 15).padStart(2, '0') + 'T12:00:00.000Z';
    const turns = [
      { user: 'Explain a readable archive for ' + collection + ' conversation ' + i + '. Find paginationneedle across every page.', createdAt: when },
      { thinking: 'Synthetic reasoning: compare the archive structure, identity and pagination requirements.' },
      { ai: body(collection, i), model: 'Synthetic Reader Model', createdAt: when },
      { user: 'How do I verify collection identity and exact search totals?', createdAt: when },
      { ai: 'Keep the collection, source file, and conversation key together.\n\nFor this fixture there are **65 conversations**: **35 in alpha** and **30 in beta**. A 30-item list has pages of 30, 30, and 5.\n\nThis answer belongs to **' + collection + ' ' + String(i).padStart(2, '0') + '**.', model: 'Synthetic Reader Model', createdAt: when },
    ];
    threads.push({ collection, sourceFile: '/synthetic/gui-export.json', conversationKey: key, title,
      provider: i % 2 ? 'anthropic' : 'openai', ordinal: i, turnCount: turns.length, turnsJson: JSON.stringify(turns),
      ingestedAt: when, lastTurnAt: when, lastModel: 'Synthetic Reader Model', createdInThreadShelf: false,
      threadCreatedAt: when, hasThreadShelfTurns: false, indexPending: '', indexAttempts: 0, indexRetryAt: 0, indexError: '' });
    return { id: 'chunk-' + String(i).padStart(2, '0'), vector, document: 'paginationneedle readable archive for ' + collection + ' conversation ' + i,
      sourceFile: '/synthetic/gui-export.json', provider: i % 2 ? 'anthropic' : 'openai', conversationKey: key, title,
      role: 'ai', turnIndex: '2', model: 'Synthetic Reader Model', createdAt: when, createdInThreadShelf: false, generationProvider: '' };
  });
  await db.createTable(collection, rows);
}
await db.createTable('__threads', threads);
console.log('Seeded 65 conversations / 65 chunks / 325 turns.');
`;
(async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  if (pkg.version !== '1.3.0') throw new Error('This fixture helper targets ThreadShelf 1.3.0.');
  const parent = process.env.THREADSHELF_TEST_TEMP_PARENT || os.tmpdir(); await fs.mkdir(parent, { recursive: true });
  temp = await fs.mkdtemp(path.join(parent, 'threadshelf-alternative-gui-'));
  const cache = process.env.THREADSHELF_TEST_MODEL_CACHE ? path.resolve(process.env.THREADSHELF_TEST_MODEL_CACHE) : path.join(root, '.threadshelf/model-cache');
  await fs.cp(cache, path.join(temp, 'model-cache'), { recursive: true });
  const port = await choosePort(Number(process.env.THREADSHELF_TEST_PORT || 3137));
  const env = { ...process.env, HOST: '127.0.0.1', PORT: String(port), QA_SERVER_ROOT: root,
    THREADSHELF_DATA_DIR: temp, LANCEDB_PATH: path.join(temp, 'lancedb'), UPLOADS_DIR: path.join(temp, 'uploads'),
    COLLECTIONS_PATH: path.join(temp, 'collections.json'), GENERATION_CONFIG_PATH: path.join(temp, 'generation.json'),
    MASTER_PROMPTS_PATH: path.join(temp, 'master-prompts.json'), THREADSHELF_MODEL_CACHE: path.join(temp, 'model-cache'),
    THREADSHELF_MODELS_PATH: path.join(temp, 'models'), THREADSHELF_TOOLS_PATH: path.join(temp, 'tools'),
    THREADSHELF_DISABLE_DEFAULT_MODEL_PATHS: '1', OPENROUTER_API_KEY: '', THREADSHELF_API_KEY: '' };
  await fs.mkdir(env.UPLOADS_DIR, { recursive: true });
  const output = await run(['--input-type=module', '-e', seed], { cwd: temp, env });
  console.log(output.trim().split('\n').findLast(line => line.startsWith('Seeded')));
  child = spawn(node, [path.join(root, 'dist/src/server.js')], { cwd: temp, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr);
  child.on('error', error => { console.error(error); void stop(1); });
  child.once('exit', code => { if (!stopping) { console.error(`Server exited unexpectedly (${code})`); void stop(1); } });
  const baseUrl = `http://127.0.0.1:${port}`; let ready = false;
  for (let n = 0; n < 120; n++) {
    try { if ((await fetch(baseUrl + '/api/health')).ok) { ready = true; break; } } catch {}
    if (child.exitCode !== null) throw new Error('Server stopped before readiness'); await sleep(250);
  }
  if (!ready) throw new Error('Server did not become healthy');
  console.log(JSON.stringify({ ready: true, baseUrl, helperPid: process.pid, serverPid: child.pid,
    query: 'paginationneedle', collections: { alpha: 35, beta: 30 }, conversations: 65, chunks: 65, turns: 325,
    sourceFile: '/synthetic/gui-export.json', exampleKey: 'conversation-00', titles: ['Archive reading — alpha 00', 'Archive reading — beta 00'],
    expectedPagesAt30: [30, 30, 5], dataPath: temp }));
})().catch(error => { console.error(error); void stop(1); });
