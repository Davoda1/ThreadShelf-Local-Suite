#!/usr/bin/env node
// End-to-end Activity/Insights verification against production main, sandboxed
// preload, archive worker and compressed storage. Only native file dialogs and
// the isolated fixture's HTTP server are controlled by this test.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { ApplicationService } from '../src/core/service.mjs';
import { localReadingKey } from '../src/core/manager-reading.mjs';

const require = createRequire(import.meta.url);
const { _electron } = process.env.THREADSHELF_PLAYWRIGHT_MODULE ? await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE) : require('playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const appRoot = path.resolve(process.env.READER_APP_ROOT || root);
const version = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'tslr-activity-desktop-'));
const dataDir = path.join(temp, 'profile');
const evidence = path.resolve(process.env.READER_EVIDENCE || path.join(root, 'docs', 'evidence', 'v3.0.0'));
await fs.mkdir(evidence, { recursive: true });
const requests = [], passed = [], pageErrors = [], consoleErrors = [], regressions = [];
const remote = { collection: 'Remote work', sourceFile: '/srv/export/duplicate-name.json', conversationKey: 'exact-remote-one', title: 'Exact remote conversation', provider: 'openai', turnCount: 3, lastTurnAt: '2024-04-02T00:00:00.000Z' };
const remoteOther = { ...remote, sourceFile: '/srv/other/duplicate-name.json', conversationKey: 'remote-other', title: 'Other server conversation', turnCount: 2 };
const backend = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost'), collection = url.searchParams.get('collection');
  requests.push({ method: req.method, path: url.pathname, params: Object.fromEntries(url.searchParams) });
  res.setHeader('Content-Type', 'application/json'); let result;
  if (url.pathname === '/api/collections') result = { collections: ['Remote work'] };
  else if (url.pathname === '/api/files') result = { files: [remote, remoteOther] };
  else if (url.pathname === '/api/insights') result = { collection, totals: { collections: 1, files: 2, chunks: 7, conversations: 2, turns: 5 }, roles: { user: 3, thinking: 1, ai: 3 }, activity: [{ month: '2024-04', count: 7 }], topModels: [{ model: 'gpt-4o', count: 7 }], providers: [{ provider: 'openai', conversations: 2, turns: 5 }], longestThreads: [remote], firstActivity: '2024-04-01T00:00:00.000Z', lastActivity: '2024-04-02T00:00:00.000Z' };
  else if (url.pathname === '/api/thread') {
    if (url.searchParams.get('sourceFile') !== remote.sourceFile || url.searchParams.get('conversationKey') !== remote.conversationKey || collection !== remote.collection) { res.statusCode = 400; result = { error: 'Wrong server identity requested' }; }
    else result = { ...remote, turns: [{ user: 'An exact remote question', turn_index: 0 }, { thinking: 'A retained server reasoning turn', turn_index: 3 }, { ai: 'Exact remote answer from the requested full path.', turn_index: 7 }] };
  } else if (url.pathname === '/api/health') result = { ok: true };
  else { res.statusCode = 404; result = { error: 'The Activity workspace must not request this endpoint' }; }
  res.end(JSON.stringify(result));
});
await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
const serverUrl = `http://127.0.0.1:${backend.address().port}/`;
function nativeConversation() {
  const mapping = { root: { id: 'root', parent: null, children: ['node-0'], message: null } };
  const long = Array.from({ length: 18 }, (_, i) => `Paragraph ${i + 1}: synthetic reading content remains available through workspace changes. Árvíztűrő 🧪.`).join('\n\n');
  for (let i = 0; i < 8; i++) mapping['node-' + i] = { id: 'node-' + i, parent: i ? 'node-' + (i - 1) : 'root', children: i === 7 ? [] : ['node-' + (i + 1)], message: { id: 'message-' + i, author: { role: i % 2 ? 'assistant' : 'user' }, create_time: 1704067200 + Math.floor(i / 2) * 86400 + i % 2 * 3600, content: { content_type: 'text', parts: [`Turn ${i}\n\n${long}`] }, metadata: i % 2 ? { model_slug: 'gpt-4' } : {} } };
  mapping['node-0'].children.push('alternative');
  mapping.alternative = { id: 'alternative', parent: 'node-0', children: [], message: { id: 'alternative-message', author: { role: 'assistant' }, create_time: 1704412800, content: { content_type: 'text', parts: ['Alternate branch is counted on January 5.'] }, metadata: { model_slug: 'gpt-4o' } } };
  return { id: 'primary', title: 'Primary branched conversation', create_time: 1704067200, update_time: 1704412800, current_node: 'node-7', mapping };
}
const seed = await new ApplicationService({ dataDir }).init();
await seed.handle('settings.save', { values: { serverUrl, animations: false, compact: false, theme: 'dark', language: 'en', fontSize: 'normal' } });
const fixtureFile = path.join(temp, 'native-export.json'); await fs.writeFile(fixtureFile, JSON.stringify(nativeConversation()));
assert.equal((await seed.handle('import.paths', { paths: [fixtureFile], collection: 'Local work' })).imported, 1);
const primary = (await seed.handle('files')).files[0];
await seed.store.upsert({ collection: 'Other local', provider: 'generic', sourceFile: 'other.json', conversationKey: 'other', title: 'Other local conversation', turns: [{ user: 'Other local question', turn_index: 0, createdAt: '2024-06-01T00:00:00Z' }, { ai: 'Other local answer', turn_index: 4, createdAt: '2024-06-01T01:00:00Z' }] });
await seed.shutdown();
await fs.writeFile(path.join(dataDir, 'window.json'), JSON.stringify({ width: 1280, height: 900, maximized: false, fullscreen: false }));
let launchRoot = appRoot;
if (process.env.READER_TEST_SOCKETLESS === '1') {
  launchRoot = path.join(temp, 'test-harness'); await fs.mkdir(launchRoot);
  await fs.writeFile(path.join(launchRoot, 'package.json'), JSON.stringify({ name: 'threadshelf-activity-test', version, main: 'main.cjs' }));
  await fs.writeFile(path.join(launchRoot, 'main.cjs'), `// Test runner only: Unix singleton sockets are unavailable.\nconst {app}=require('electron');app.requestSingleInstanceLock=()=>true;require(${JSON.stringify(path.join(appRoot, 'src/desktop/main.cjs'))});`);
}
const env = { ...process.env, THREADSHELF_READER_TEST_DATA: dataDir }; delete env.ELECTRON_RUN_AS_NODE;
let application, page;
const action = name => page.locator(`[data-action="${name}"]`);
const activity = name => page.locator(`[data-activity-action="${name}"]`);
const filter = name => page.locator(`[data-activity-filter="${name}"]`);
const boot = () => page.evaluate(() => window.desktop.invoke('bootstrap'));
async function ready() {
  await page.waitForFunction(() => document.querySelector('#analyticsWorkspace')?.getAttribute('aria-busy') === 'false' && document.querySelector('#analyticsWorkspace .analytics-stats'));
  assert.equal(await page.locator('#analyticsWorkspace .analytics-error').count(), 0);
}
async function stats() { return page.locator('.analytics-stat strong').allTextContents(); }
async function anchor() { return page.locator('#conversationContent').evaluate(c => { const line = c.getBoundingClientRect().top + 16, node = [...c.querySelectorAll('.message')].find(n => n.getBoundingClientRect().bottom > line), rect = node.getBoundingClientRect(); return { turnIndex: Number(node.dataset.turnIndex), offset: (line - rect.top) / rect.height, scrollTop: c.scrollTop }; }); }
async function frame() { const bounds = await page.evaluate(() => ({ w: innerWidth, h: innerHeight, bodyW: document.body.scrollWidth, bodyH: document.body.scrollHeight, docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, footer: document.querySelector('.statusbar').getBoundingClientRect().bottom })); assert.ok(bounds.bodyW <= bounds.w && bounds.docW <= bounds.w && bounds.bodyH <= bounds.h && bounds.docH <= bounds.h); assert.ok(bounds.footer <= bounds.h + 1); return bounds; }
async function launch() {
  application = await _electron.launch({ executablePath: process.env.READER_ELECTRON || path.join(root, 'node_modules/electron/dist/electron'), args: ['--no-sandbox', '--disable-gpu', launchRoot], env, timeout: 45000 });
  page = await application.firstWindow(); page.on('pageerror', error => pageErrors.push(error.message)); page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.locator('.shell').waitFor(); await page.waitForFunction(() => document.querySelectorAll('.conversation-row').length > 0);
}
try {
  await launch();
  assert.equal(await page.locator('.shell').getAttribute('data-workspace'), 'reader');
  assert.equal(await page.evaluate(() => typeof require), 'undefined');
  await page.locator('.conversation-row', { hasText: primary.title }).click();
  await page.waitForFunction(() => document.querySelectorAll('#conversationContent .message').length === 8);
  await page.locator('.message[data-turn-index="5"] .bookmark-message').click();
  await page.waitForFunction(async () => (await window.desktop.invoke('bootstrap')).reading.bookmarks.length === 1);
  await page.locator('#conversationContent').evaluate(c => { c.dispatchEvent(new WheelEvent('wheel', { deltaY: 500 })); c.scrollTop = c.scrollHeight * .45; });
  await page.waitForFunction(async key => !!(await window.desktop.invoke('bootstrap')).reading.positions[key], localReadingKey(primary.id));
  await page.waitForTimeout(1000);
  const beforeAnchor = await anchor(), beforeReading = (await boot()).reading;
  assert.ok(beforeAnchor.scrollTop > 0);
  await action('workspace-analytics').click(); await ready();
  assert.deepEqual((await stats()).slice(0, 3), ['2', '11', '6']);
  assert.match(await page.locator('.analytics-coverage summary').textContent(), /1.*1/);
  assert.equal(await page.locator('.shell>.sidebar').isVisible(), false);
  assert.equal(await page.locator('.shell>.content-pane').isVisible(), false);
  const localFrame = await frame(); await page.screenshot({ path: path.join(evidence, 'Activity-Desktop-Local.png') });
  passed.push('Real compressed Local archive builds original-branch and normalized analytics: 2 conversations, 11 messages, 6 active days');
  await action('workspace-reader').click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const afterAnchor = await anchor();
  if (afterAnchor.turnIndex !== beforeAnchor.turnIndex || Math.abs(afterAnchor.offset - beforeAnchor.offset) >= .02) regressions.push({ label: 'Reader viewport changed across workspace roundtrip', before: beforeAnchor, after: afterAnchor });
  const afterReading = (await boot()).reading;
  assert.deepEqual(afterReading.bookmarks, beforeReading.bookmarks);
  assert.equal(afterReading.positions[localReadingKey(primary.id)].turnIndex, beforeReading.positions[localReadingKey(primary.id)].turnIndex);
  passed.push('Reader viewport, stable conversation identity, persisted position and bookmark survive the Activity roundtrip');
  await action('workspace-analytics').click(); await ready();
  await filter('zone').selectOption('utc'); await ready();
  await filter('branch').selectOption('active'); await ready(); assert.equal((await stats())[1], '10');
  await filter('branch').selectOption('all'); await ready(); assert.equal((await stats())[1], '11');
  await page.locator('[data-activity-action="date"][data-date="2024-01-05"]').click(); await ready();
  assert.equal(await filter('date').inputValue(), '2024-01-05'); assert.equal(await activity('open').count(), 1); assert.equal(await activity('open').textContent(), primary.title);
  await activity('open').click(); await page.waitForFunction(title => document.querySelector('#threadHeader h1')?.textContent === title, primary.title);
  assert.equal(await page.locator('#threadHeader .identity').textContent(), primary.sourceFile);
  assert.equal(await page.locator('.message[data-turn-index="5"] .bookmark-message').getAttribute('aria-pressed'), 'true');
  await action('workspace-analytics').click(); await ready(); assert.equal(await filter('date').inputValue(), '2024-01-05');
  passed.push('Branch selector changes real counts; alternate-branch day drills into its exact Reader identity and preserves the date filter on return');
  await activity('clear-date').click(); await ready(); await filter('collection').selectOption('Local work'); await ready();
  const csvPath = path.join(temp, 'activity.csv');
  await application.evaluate(({ dialog }, filename) => { dialog.showSaveDialog = async (_window, opts) => { global.activitySaveOptions = opts; return { canceled: false, filePath: filename }; }; }, csvPath);
  await activity('export').click();
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent?.includes('Saved'));
  const csv = await fs.readFile(csvPath, 'utf8'); assert.equal(csv[0], '\ufeff');
  const exportedCount = csv.slice(1).trim().split('\r\n').slice(1).reduce((sum, line) => sum + Number(line.split(',')[1].replaceAll('"', '')), 0);
  assert.equal(exportedCount, 9); assert.match(csv, /2024-01-05/); assert.doesNotMatch(csv, /2024-06-01/);
  const saveOptions = await application.evaluate(() => global.activitySaveOptions); assert.deepEqual(saveOptions.filters[0].extensions, ['csv']);
  await application.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true }); }); await activity('export').click();
  assert.equal(await fs.readFile(csvPath, 'utf8'), csv);
  passed.push('CSV traverses production renderer → preload → main dialog → worker and writes exact filtered daily totals; native cancellation preserves the existing file');
  await action('settings').click(); await page.locator('#prefLanguage').selectOption('de'); await page.locator('#prefUiPalette').selectOption('oled'); await page.locator('#settingsForm button[type="submit"]').click();
  await page.waitForFunction(() => document.documentElement.lang === 'de' && document.documentElement.dataset.uiPalette === 'oled'); await ready();
  assert.equal(await page.locator('.shell').getAttribute('data-workspace'), 'analytics'); assert.equal(await filter('collection').inputValue(), 'Local work');
  await action('settings').click(); await page.locator('#prefLanguage').selectOption('en'); await page.locator('#settingsForm button[type="submit"]').click(); await page.waitForFunction(() => document.documentElement.lang === 'en'); await ready();
  passed.push('Saving appearance/language while Activity owns the workspace restores the same active collection and usable controls');
  await action('mode-server').click();
  await page.waitForFunction(() => document.querySelector('#analyticsWorkspace h1')?.textContent === 'Server Insights'); await ready();
  assert.deepEqual(await stats(), ['1', '2', '7', '2', '5']);
  assert.equal(requests.filter(request => request.path === '/api/thread').length, 0, 'rendering Server Insights must not fetch any conversation body');
  const beforeRefresh = requests.length; await activity('refresh').click(); await ready();
  assert.deepEqual(requests.slice(beforeRefresh).map(request => request.path), ['/api/insights']);
  assert.match(await page.locator('#analyticsWorkspace').textContent(), /indexed passages/i);
  const serverFrame = await frame(); await page.screenshot({ path: path.join(evidence, 'Activity-Desktop-Server.png') });
  passed.push('Server Insights displays actual summary units; initial load fetches no thread body and refresh calls only the existing GET /api/insights endpoint');
  await activity('open').click(); await page.waitForFunction(() => document.querySelector('#threadHeader h1')?.textContent === 'Exact remote conversation');
  await page.waitForFunction(() => document.querySelector('.message[data-turn-index="7"]')?.textContent.includes('Exact remote answer'));
  const threads = requests.filter(request => request.path === '/api/thread'); assert.equal(threads.length, 1); assert.deepEqual(threads[0].params, { collection: remote.collection, sourceFile: remote.sourceFile, conversationKey: remote.conversationKey });
  await action('workspace-analytics').click(); await ready(); assert.deepEqual(await stats(), ['1', '2', '7', '2', '5']);
  passed.push('Longest server conversation opens exactly one full-path + collection + conversation-key identity through the existing Reader request');
  await action('mode-local').click(); await page.waitForFunction(() => document.querySelector('#analyticsWorkspace h1')?.textContent === 'Activity'); await ready(); assert.equal((await stats())[1], '9'); assert.equal(await filter('collection').inputValue(), 'Local work');
  await application.close(); application = null; await launch();
  assert.equal(await page.locator('.shell').getAttribute('data-workspace'), 'reader');
  const reopened = await boot(); assert.equal(reopened.settings.uiPalette, 'oled'); assert.equal(reopened.settings.localCollection, 'Local work'); assert.equal(reopened.reading.bookmarks.length, 1);
  await action('workspace-analytics').click(); await ready(); assert.equal((await stats())[1], '9');
  passed.push('Restart defaults to Reader and preserves both saved reading and Local collection; Activity reloads from its compressed cache');
  assert.deepEqual(regressions, [], 'All Reader workspace state must be preserved');
  assert.deepEqual(pageErrors, []); assert.deepEqual(consoleErrors, []);
  const result = { version, appRoot, fixture: 'Synthetic native branched ChatGPT + normalized Local conversation and existing ThreadShelf API fixture; no user data', bridge: 'Production main/preload/archive worker; only native save dialog selection stubbed', singletonOverride: process.env.READER_TEST_SOCKETLESS === '1', passed, csvMessages: exportedCount, readerAnchor: { before: beforeAnchor, after: afterAnchor }, geometry: { local: localFrame, server: serverFrame }, requests, pageErrors, consoleErrors };
  await fs.writeFile(path.join(evidence, 'activity-desktop-results.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await page?.screenshot({ path: path.join(evidence, 'Activity-Desktop-Failure.png') }).catch(() => {}); console.error(error); throw error;
} finally {
  await application?.close().catch(() => {}); backend.closeAllConnections(); await new Promise(resolve => backend.close(resolve)); await fs.rm(temp, { recursive: true, force: true });
}
