#!/usr/bin/env node
// Opt-in test of the supplied account export through the real import/storage and
// ReaderView pipelines. Private input and screenshots stay outside the source
// tree. The optional JSON report contains only counts, checks and SHA-256 hashes.
// READER_FORMAT_EXPORT=/private/export.json node tests/format-testing-r4.browser.mjs
// Optional: READER_FORMAT_REPORT, READER_FORMAT_SCREENSHOTS, READER_CHROMIUM,
// THREADSHELF_PLAYWRIGHT_MODULE, READER_ELECTRON.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {ApplicationService} from '../src/core/service.mjs';
import {normalizeDocument} from '../src/core/importers.mjs';
import {localReadingKey} from '../src/core/manager-reading.mjs';
import {turnToMessage} from '../src/reader/messages.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const input = process.env.READER_FORMAT_EXPORT;
assert.ok(input, 'Set READER_FORMAT_EXPORT to the private supplied JSON export.');
const screenshotDir = process.env.READER_FORMAT_SCREENSHOTS;
if (screenshotDir) {
  const resolved = path.resolve(screenshotDir);
  assert.ok(resolved !== root && !resolved.startsWith(root + path.sep), 'Private screenshots must be outside the source tree.');
  await fs.mkdir(resolved, {recursive: true});
}
const hash = value => createHash('sha256').update(Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'reader-format-r4-'));
const dataDir = path.join(tmp, 'isolated-profile');
const exportBytes = await fs.readFile(input), exportHash = hash(exportBytes);
const sourceDocument = JSON.parse(exportBytes.toString('utf8'));
const expected = normalizeDocument(sourceDocument, path.resolve(input)).filter(record => record.turns.length);
const expectedByKey = new Map(expected.map(record => [record.conversationKey, record]));
assert.equal(expectedByKey.size, expected.length, 'Expected records have unique source identities.');
const targetRecords = expected.filter(record => record.title === 'ThreadShelf Format Testing');
assert.equal(targetRecords.length, 1, 'Exactly one target conversation is present.');
const targetExpected = targetRecords[0];
const firstSource = targetExpected.turns.find(turn => turn.ai?.includes('# ThreadShelf Local Reader 3.2.0 — rendering test suite'))?.ai;
const secondSource = targetExpected.turns.find(turn => turn.ai?.includes('# ThreadShelf Local Reader 3.2.0 — Native UI rendering test'))?.ai;
assert.ok(firstSource && secondSource && firstSource !== secondSource, 'Both screenshot test answers are retained on the imported branch.');

async function fingerprints() {
  const files = ['package.json', 'package-lock.json'];
  async function walk(relative) {
    for (const entry of await fs.readdir(path.join(root, relative), {withFileTypes: true})) {
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) await walk(name);
      else if (/\.(?:js|mjs|cjs|css)$/.test(name)) files.push(name);
    }
  }
  await walk('src');
  return Object.fromEntries(await Promise.all(files.sort().map(async name => [name, hash(await fs.readFile(path.join(root, name)))])));
}
const sourceHashes = await fingerprints();
const checks = [], errors = [], externalRequests = [], captures = [];
let service, browser;
try {
  service = await new ApplicationService({dataDir}).init();
  const imported = await service.handle('import.paths', {paths: [path.resolve(input)], collection: 'Private export acceptance'});
  assert.equal(imported.errors.length, 0, 'The real import has no errors.');
  assert.equal(imported.imported, expected.length, 'Every nonempty conversation is imported.');

  async function inspectArchive() {
    const firstPage = await service.handle('files', {mode: 'local', page: 1, pageSize: 500});
    assert.equal(firstPage.total, expected.length);
    const rows = [...firstPage.files];
    for (let page = 2; rows.length < firstPage.total; page++) {
      rows.push(...(await service.handle('files', {mode: 'local', page, pageSize: 500})).files);
    }
    const summaries = []; let target;
    for (const row of rows) {
      const thread = await service.handle('thread', {mode: 'local', id: row.id});
      const original = expectedByKey.get(thread.conversationKey);
      assert.ok(original, 'Imported identity belongs to the supplied export.');
      assert.equal(hash(thread.raw), hash(original.raw), 'All original raw source fields survive import.');
      assert.equal(hash(thread.turns), hash(original.turns), 'All normalized message source strings and identities survive import.');
      summaries.push({id: thread.id, key: thread.conversationKey, raw: hash(thread.raw), turns: hash(thread.turns)});
      if (thread.conversationKey === targetExpected.conversationKey) target = thread;
    }
    assert.ok(target);
    summaries.sort((a, b) => a.key.localeCompare(b.key));
    return {target, digest: hash(summaries), sourceDigest: hash(summaries.map(({id, ...source}) => source)), records: rows.length};
  }
  const beforeRestart = await inspectArchive();
  const target = beforeRestart.target;
  const messages = target.turns.map(turnToMessage);
  const first = messages.find(message => message.content === firstSource);
  const second = messages.find(message => message.content === secondSource);
  assert.ok(first && second);
  const readingKey = localReadingKey(target.id);
  await service.handle('settings.save', {values: {mode: 'local', theme: 'light', uiPalette: 'platinum', language: 'en', animations: false}});
  await service.handle('reading.save', {key: readingKey,
    position: {turnIndex: second.turn_index, role: 'assistant', offset: .25, ref: {mode: 'local', id: target.id}},
    bookmark: {turnIndex: first.turn_index, role: 'assistant', ref: {mode: 'local', id: target.id}}});
  await service.serialized(() => service.checkpoint(true));
  await service.shutdown();
  service = await new ApplicationService({dataDir}).init();
  const afterRestart = await inspectArchive();
  assert.equal(afterRestart.digest, beforeRestart.digest, 'Every imported conversation survives checkpoint/restart unchanged.');
  const retained = await service.handle('bootstrap');
  assert.equal(retained.settings.uiPalette, 'platinum');
  assert.equal(retained.reading.positions[readingKey].turnIndex, second.turn_index);
  assert.equal(retained.reading.positions[readingKey].offset, .25);
  assert.ok(retained.reading.bookmarks.some(item => item.key === readingKey && item.turnIndex === first.turn_index));
  checks.push('Full real import, exact raw/turn preservation for every conversation, checkpoint/restart, settings and reading/bookmark retention');

  const web = path.join(tmp, 'web');
  await fs.cp(path.join(root, 'public'), web, {recursive: true});
  await build({stdin: {contents: `import {ReaderView} from './src/reader/reader.js';import {applyAppearance} from './src/ui/appearance.js';import {translator} from './src/ui/i18n.js';import './src/ui/style.css';import './src/ui/themes.css';import './src/ui/code-themes.css';import './src/ui/modern.css';import './src/ui/glassy.css';import './src/ui/theme-effects.css';window.testApi={ReaderView,applyAppearance,translator};`, resolveDir: root},
    outfile: path.join(web, 'test.js'), bundle: true, format: 'iife', platform: 'browser', loader: {'.woff2': 'file', '.woff': 'file', '.ttf': 'file'}, logLevel: 'silent'});
  assert.deepEqual(await fingerprints(), sourceHashes, 'Production files remain stable during bundle preparation.');
  await fs.writeFile(path.join(web, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="test.css"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}#host{width:100vw;height:100vh;min-width:0;min-height:0}</style></head><body><div id="host"></div><script src="test.js"></script></body></html>');
  const playwright = await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE || 'playwright');
  let page;
  if (process.env.READER_ELECTRON) {
    await fs.writeFile(path.join(tmp, 'main.cjs'), `const {app,BrowserWindow,session}=require('electron');app.setPath('userData',${JSON.stringify(path.join(tmp, 'electron-profile'))});app.whenReady().then(()=>{session.defaultSession.setPermissionRequestHandler((_w,_p,cb)=>cb(false));const w=new BrowserWindow({width:1100,height:780,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});w.setMenu(null);w.loadURL('about:blank');});`);
    const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
    const app = await playwright._electron.launch({executablePath: process.env.READER_ELECTRON, args: ['--no-sandbox', '--disable-gpu', path.join(tmp, 'main.cjs')], env});
    page = await app.firstWindow();
    browser = {close: () => app.close(), version: () => app.evaluate(() => `Electron ${process.versions.electron}; Chromium ${process.versions.chrome}`)};
  } else {
    browser = await playwright.chromium.launch({headless: true, ...(process.env.READER_CHROMIUM ? {executablePath: process.env.READER_CHROMIUM} : {}), args: ['--no-sandbox', '--disable-dev-shm-usage']});
    page = await browser.newPage({viewport: {width: 1100, height: 780}, reducedMotion: 'reduce'});
  }
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if (/^https?:/.test(route.request().url())) {externalRequests.push(route.request().url()); return route.abort();}
    return route.continue();
  });
  await page.goto(pathToFileURL(path.join(web, 'index.html')).href);
  await page.waitForFunction(() => !!window.testApi);
  await page.evaluate(async thread => {
    const settings = {theme: 'light', uiPalette: 'platinum', codeTheme: 'default', language: 'en', fontSize: 'normal', compact: false, animations: false};
    testApi.applyAppearance(settings);
    window.savedThread = thread; window.originalThread = JSON.stringify(thread);
    window.reader = new testApi.ReaderView({container: document.getElementById('host'), t: testApi.translator('en'), settings});
    await reader.show(savedThread, {key: thread.id});
  }, afterRestart.target);
  const firstMessage = page.locator(`.message[data-turn-index="${first.turn_index}"][data-role="assistant"]`);
  const secondMessage = page.locator(`.message[data-turn-index="${second.turn_index}"][data-role="assistant"]`);
  assert.equal(await firstMessage.count(), 1); assert.equal(await secondMessage.count(), 1);
  assert.equal(hash(await page.locator('.message').evaluateAll(nodes => nodes.map(node => node.sourceText))), hash(messages.map(message => message.content)), 'Every displayed message retains original exact source.');
  assert.doesNotMatch(await page.locator('#host').innerText(), /TSRICH(?:CHILD)?[a-f0-9]{32}END/, 'App-owned parser markers do not leak into the conversation.');
  assert.equal(await firstMessage.locator('.rich-chart:not(.rich-chart-fallback)').count(), 9);
  assert.equal(await firstMessage.locator('.rich-chart-fallback').count(), 1, 'Deliberately unsupported version remains a fallback.');
  assert.equal(await secondMessage.locator('.rich-chart:not(.rich-chart-fallback)').count(), 7);
  assert.equal(await secondMessage.locator('.rich-chart-fallback').count(), 0);
  assert.equal(await secondMessage.locator('svg.rich-static-svg').count(), 2);
  assert.equal(await firstMessage.locator('.rich-icon-fallback').count(), 1, 'Only the intentionally unknown icon remains a fallback in the first answer.');
  assert.equal(await secondMessage.locator('.rich-icon-fallback').count(), 0, 'All archived icon names in the second answer have app-owned glyphs.');
  assert.equal(await secondMessage.locator('pre code').count(), 1);
  assert.equal(await secondMessage.locator('pre code').innerText(), '<box><text>THIS MUST REMAIN CODE</text></box>');
  assert.ok((await secondMessage.innerText()).includes('TS32-NATIVE-UI-END'));
  assert.ok((await firstMessage.innerText()).includes('[Interactive visualization not included in this export.]'));
  for (const text of ['TS32_INDENTED_CODE_MUST_REMAIN_LITERAL', 'TS32_INLINE_LITERAL', 'DO_NOT_EXPAND', 'TS32_EXPRESSION_MUST_NOT_BE_EVALUATED', 'TS32_CHILD_MUST_SURVIVE']) {
    assert.ok((await firstMessage.innerText()).includes(text), 'Deliberate code/rejection source text remains visible.');
    assert.equal(await firstMessage.locator('.rich-text').evaluateAll((nodes, text) => nodes.filter(node => node.textContent.trim() === text).length, text), 0, 'Deliberate rejected/literal input does not become a live text component.');
  }
  assert.equal(await firstMessage.locator('.rich-text').evaluateAll(nodes => nodes.filter(node => node.textContent.trim() === 'TS32_RECOVERY_OK').length), 1);
  assert.equal(await firstMessage.locator('.rich-entity').filter({hasText: /NOT_A_CHIP|NOT_A_LIVE_ENTITY/}).count(), 0);
  assert.equal(await page.evaluate(() => JSON.stringify(savedThread) === originalThread), true);
  checks.push('Production ReaderView renders both original answers: 9 plus 7 native charts, 2 saved SVGs, and intentional fallback/literal-code boundaries');

  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  async function progress(message, height, expectedFillClass) {
    const values = await message.locator('.rich-progress-track').evaluateAll(tracks => tracks.map(track => {
      const fill = track.querySelector(':scope > .rich-progress-fill');
      const chart = track.closest('.message').querySelector('.rich-chart:not(.rich-chart-fallback) .rich-chart-color-0');
      const rect = track.getBoundingClientRect(), fillRect = fill?.getBoundingClientRect();
      return {height: rect.height, fillHeight: fillRect?.height, width: fill?.style.width, fillWidth: fillRect?.width, trackWidth: track.clientWidth,
        color: fill && getComputedStyle(fill).backgroundColor, trackColor: getComputedStyle(track).backgroundColor,
        chartColor: chart && getComputedStyle(chart).fill, fillClass: fill?.className};
    }));
    assert.deepEqual(values.map(value => value.width), ['51%', '71%', '100%']);
    for (const value of values) {
      assert.equal(value.height, height); assert.equal(value.fillHeight, height);
      assert.match(value.fillClass, expectedFillClass);
      assert.notEqual(value.color, value.trackColor, 'Percentage fill remains distinct from its track.');
      assert.notEqual(value.color, 'rgba(0, 0, 0, 0)');
      assert.equal(value.color, value.chartColor, 'Percentage bars use the chart primary series color.');
      assert.ok(Math.abs(value.fillWidth - value.trackWidth * parseFloat(value.width) / 100) < 1.5, 'Literal percentage width remains exact.');
    }
    return values.map(({width, height, fillHeight}) => ({width, height, fillHeight}));
  }
  const appearanceChecks = [];
  for (const theme of ['light', 'dark']) for (const [width, height] of [[1100, 780], [680, 540], [680, 1000], [1500, 540]]) {
    await page.setViewportSize({width, height});
    await page.emulateMedia({colorScheme: theme, reducedMotion: 'reduce'});
    await page.evaluate(theme => {testApi.applyAppearance({theme, uiPalette: 'platinum', animations: false});reader.setSettings({theme});}, theme);
    await settle();
    const firstBars = await progress(firstMessage, 12, /rich-progress-neutral-fill/);
    const secondBars = await progress(secondMessage, 14, /rich-info/);
    const extent = await page.evaluate(() => ({w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight}));
    assert.ok(extent.w <= extent.vw + 1 && extent.h <= extent.vh + 1, 'Rendering does not add global scrolling.');
    const boxes = await secondMessage.locator('.rich-chart,svg.rich-static-svg').evaluateAll(nodes => nodes.map(node => ({right: node.getBoundingClientRect().right, width: node.getBoundingClientRect().width})));
    assert.ok(boxes.every(box => box.width > 0 && box.right <= width + 1), 'Charts and archived SVGs fit the message viewport.');
    appearanceChecks.push({theme, viewport: [width, height], firstBars, secondBars});
  }
  checks.push('Platinum light/dark at minimum, tall, wide and normal windows: 12px and 14px bars, exact 51/71/100% widths, chart-matching colors and no global overflow');
  await page.setViewportSize({width: 1100, height: 780});
  await page.evaluate(() => {testApi.applyAppearance({theme: 'light', uiPalette: 'platinum', animations: false});reader.setSettings({theme: 'light'});});
  async function shot(label, locator) {
    if (!screenshotDir) return;
    await locator.first().scrollIntoViewIfNeeded(); await settle();
    await page.screenshot({path: path.join(screenshotDir, `${label}.png`)}); captures.push(label);
  }
  await shot('first-answer-progress', firstMessage.locator('.rich-progress-track'));
  await shot('second-answer-cards', secondMessage.locator('.rich-box'));
  await shot('second-answer-progress', secondMessage.locator('.rich-progress-track'));
  await shot('second-answer-chart', secondMessage.locator('.rich-chart'));
  await shot('second-answer-static-svg', secondMessage.locator('svg.rich-static-svg'));
  const liveChart = secondMessage.locator('.rich-chart:not(.rich-chart-fallback)').first();
  const firstMark = liveChart.locator('.rich-chart-mark').first();
  const item = await firstMark.getAttribute('data-chart-active');
  const hit = item === null ? firstMark : liveChart.locator(`.rich-chart-hit[data-chart-item="${item}"]`);
  const focusTarget = await hit.count() ? hit : firstMark;
  await focusTarget.scrollIntoViewIfNeeded(); await settle(); await focusTarget.focus(); await settle();
  assert.equal(await page.locator('.rich-chart-tooltip:visible').count(), 1, 'Imported native chart has a working keyboard tooltip.');
  await shot('second-answer-chart-tooltip', liveChart);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.rich-chart-tooltip:visible').count(), 0);
  checks.push('Imported native chart keyboard tooltip opens and Escape dismisses it');
  assert.equal(await page.evaluate(() => JSON.stringify(savedThread) === originalThread), true);
  assert.equal(hash((await service.handle('thread', {mode: 'local', id: target.id})).turns), hash(targetExpected.turns));
  assert.equal(hash(await fs.readFile(input)), exportHash, 'Uploaded file is unchanged.');
  assert.deepEqual(await fingerprints(), sourceHashes, 'Source tree is unchanged during acceptance.');
  assert.deepEqual(errors, [], 'No browser page errors.');
  // Exported links/assets may trigger inert blocked requests. No request leaves
  // this local-only harness; their URL text is intentionally absent from output.
  const report = {actualAccountExport: true, version: JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version,
    importRoute: 'Direct native OpenAI mapping via ApplicationService import.paths; raw tool and reasoning nodes retained',
    messageCountNote: `The target has ${messages.length} normalized nonempty native messages from ${Object.keys(targetExpected.raw.mapping || {}).length} raw mapping nodes. Converted/server routes can have different displayed-message counts; raw content is preserved.`,
    engine: await browser.version(), importedConversations: beforeRestart.records, normalizedMessages: expected.reduce((sum, record) => sum + record.turns.length, 0),
    targetMessages: messages.length, targetRawNodes: Object.keys(targetExpected.raw.mapping || {}).length,
    exportSha256: exportHash, archiveSourceDigest: beforeRestart.sourceDigest, archiveIdentityDigest: beforeRestart.digest, sourcePreservedAfterRestart: true,
    firstAnswerSha256: hash(firstSource), secondAnswerSha256: hash(secondSource), firstAnswerCharts: 9, firstAnswerIntentionalChartFallbacks: 1,
    secondAnswerCharts: 7, secondAnswerStaticSvg: 2, appearanceChecks, checks, screenshotsCaptured: captures.length,
    externalRendererRequestsBlocked: externalRequests.length, externalRendererRequestsAllowed: 0, pageErrors: errors.length, sourceFingerprints: sourceHashes};
  if (process.env.READER_FORMAT_REPORT) {
    await fs.mkdir(path.dirname(path.resolve(process.env.READER_FORMAT_REPORT)), {recursive: true});
    await fs.writeFile(process.env.READER_FORMAT_REPORT, JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close().catch(() => {});
  await service?.shutdown().catch(() => {});
  await fs.rm(tmp, {recursive: true, force: true});
}
