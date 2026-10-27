#!/usr/bin/env node
// Copyright (c) 2026 davoda1. MIT.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, _electron } from 'playwright-core';
import { buildMermaidRepairCandidates } from '../../apps/reader/src/reader/mermaid-repair.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const suite = path.resolve(root, '../..');
const reader = await readFile(path.join(suite, 'apps/reader/public/mermaid.min.js'));
assert.deepEqual(reader, await readFile(path.join(suite, 'apps/alternative/vendor/mermaid.min.js')));
const testDependencies = await build({
  absWorkingDir: root,
  stdin: { contents: "import DOMPurify from 'dompurify'; import katex from 'katex'; globalThis.testDependencies = { DOMPurify, katex };", resolveDir: root },
  bundle: true, write: false, format: 'iife', platform: 'browser', target: 'chrome144', logLevel: 'silent',
});
let browser;
let electron;
let harness;
const passed = [];
try {
  let page;
  if (process.env.THREADSHELF_ELECTRON) {
    harness = await mkdtemp(path.join(os.tmpdir(), 'threadshelf-diagram-runtime-'));
    const main = path.join(harness, 'main.cjs');
    await writeFile(main, `const { app, BrowserWindow } = require('electron');
const profile = require('node:path').join(__dirname, 'profile');
require('node:fs').mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
app.whenReady().then(() => {
  const window = new BrowserWindow({ show: false, width: 1200, height: 900,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  window.loadURL('about:blank');
});
app.on('window-all-closed', () => app.quit());
`);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    electron = await _electron.launch({ executablePath: process.env.THREADSHELF_ELECTRON,
      args: ['--no-sandbox', '--disable-gpu', main], env });
    page = await electron.firstWindow();
  } else {
    browser = await chromium.launch({ headless: true,
      ...(process.env.THREADSHELF_CHROMIUM ? { executablePath: process.env.THREADSHELF_CHROMIUM } : {}),
      args: ['--no-sandbox'],
    });
    page = await browser.newPage();
  }
  const requests = [];
  await page.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><main id="result"></main></body></html>');
  await page.addScriptTag({ content: reader.toString() });
  const cases = {
    flowchart: 'flowchart TD\n A[Local archive] --> B[Read conversations]',
    sequence: 'sequenceDiagram\n participant R as Reader\n participant S as Server\n R->>S: Search\n S-->>R: Results',
    class: 'classDiagram\n Archive <|-- LocalArchive\n Archive : +read()',
    entity: 'erDiagram\n ARCHIVE ||--o{ CONVERSATION : contains',
    state: 'stateDiagram-v2\n [*] --> Ready\n Ready --> Reading\n Reading --> [*]',
    pie: 'pie title Synthetic totals\n "Read" : 6\n "Unread" : 4',
    gantt: 'gantt\n title Synthetic workflow\n dateFormat YYYY-MM-DD\n section Work\n Review :2026-01-01, 2d',
    xy: 'xychart-beta\n x-axis [A, B, C]\n y-axis "Count" 0 --> 10\n bar [2, 5, 8]',
    block: 'block-beta\n columns 2\n A["Local"] B["Server"]\n A --> B',
    packet: 'packet-beta\n 0-7: "Header"\n 8-15: "Payload"',
    math: 'flowchart LR\n A["$$x^2 + y^2$$"] --> B["Result"]',
  };
  for (const theme of ['default', 'dark']) {
    for (const [name, source] of Object.entries(cases)) {
      const result = await page.evaluate(async ({ source, theme, name }) => {
        // Mermaid's KaTeX path requires HTML labels. Product defaults remain
        // unchanged; other cases exercise the normal SVG-text label path.
        const htmlLabels = name === 'math';
        const classic = { theme, look: 'classic' };
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, theme,
          look: 'classic', layout: 'dagre', htmlLabels, flowchart: { ...classic, htmlLabels, wrappingWidth: 200, minNodeWidth: 0 },
          sequence: classic, class: classic, state: { ...classic, layout: 'dagre', wrappingWidth: 200, minNodeWidth: 0 },
          er: classic, requirement: classic, swimlane: classic, venn: classic });
        const { svg } = await mermaid.render(`diagram_${theme}_${name}`, source);
        const host = document.getElementById('result'); host.innerHTML = svg;
        return { svg: Boolean(host.querySelector('svg')), math: Boolean(host.querySelector('math')), text: host.textContent,
          unsafe: Boolean(host.querySelector('script,[onload],[onerror],a[href^="javascript:"]')) };
      }, { source, theme, name });
      assert.equal(result.svg, true, `${theme}/${name} must render an SVG`);
      assert.equal(result.unsafe, false, `${theme}/${name} must not contain executable content`);
      if (name === 'math') assert.equal(result.math, true, 'KaTeX must render math labels as MathML');
      passed.push(`${theme}/${name}`);
    }
  }
  const broken = 'graph LR\n A[Vendor Feeds (Node.js, PHP)] --> B[Review]';
  const repair = await page.evaluate(async ({ broken, candidates }) => {
    let originalRejected = false;
    try { await mermaid.parse(broken); } catch { originalRejected = true; }
    for (const candidate of candidates) {
      try { return { originalRejected, svg: (await mermaid.render('repaired_example', candidate)).svg.includes('<svg') }; } catch {}
    }
    return { originalRejected, svg: false };
  }, { broken, candidates: buildMermaidRepairCandidates(broken) });
  assert.deepEqual(repair, { originalRejected: true, svg: true });
  passed.push('Reader deterministic repair remains compatible');
  const strict = await page.evaluate(async () => {
    globalThis.untrustedDiagramRan = false;
    const source = 'flowchart LR\n A["<img src=x onerror=untrustedDiagramRan=true>"] --> B[Safe]\n click B "javascript:untrustedDiagramRan=true"';
    const { svg } = await mermaid.render('untrusted_diagram', source);
    const host = document.getElementById('result'); host.innerHTML = svg;
    return { executed: globalThis.untrustedDiagramRan, unsafe: Boolean(host.querySelector('script,[onload],[onerror],a[href^="javascript:"]')) };
  });
  assert.deepEqual(strict, { executed: false, unsafe: false });
  passed.push('Strict Mermaid rendering rejects executable labels and links');
  await page.addScriptTag({ content: testDependencies.outputFiles[0].text });
  const security = await page.evaluate(async () => {
    const { DOMPurify, katex } = testDependencies;
    const results = { dompurify: DOMPurify.version, katex: katex.version };
    const dirty = document.createElement('div');
    dirty.innerHTML = '<footer><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" onload="globalThis.detachedHookRan=true"></footer><div>safe</div>';
    const image = dirty.querySelector('img');
    globalThis.detachedHookRan = false;
    DOMPurify.addHook('uponSanitizeElement', node => { if (node.tagName === 'FOOTER') node.remove(); });
    DOMPurify.sanitize(dirty, { IN_PLACE: true, ALLOWED_TAGS: ['div', '#text', 'footer'] });
    DOMPurify.removeAllHooks();
    await new Promise(resolve => setTimeout(resolve, 30));
    results.hookRemovedHandler = !image.hasAttribute('onload') && !globalThis.detachedHookRan;
    const raw = document.createElement('style');
    raw.textContent = '</style><img src=x onerror=globalThis.rawtextRan=true>';
    document.body.append(raw);
    globalThis.rawtextRan = false;
    let returned;
    try { returned = DOMPurify.sanitize(raw, { IN_PLACE: true }); } catch (error) { if (!(error instanceof TypeError)) throw error; }
    const probe = document.createElement('div');
    probe.innerHTML = returned?.outerHTML || '';
    results.rawtextRejected = !probe.querySelector('[onerror]') && !globalThis.rawtextRan;
    raw.remove();
    try {
      Object.prototype.trust = true;
      const html = katex.renderToString('\\href{javascript:alert(1)}{unsafe}', { throwOnError: false });
      const target = document.createElement('div'); target.innerHTML = html;
      results.inheritedTrustRejected = !target.querySelector('a[href^="javascript:"]');
    } finally { delete Object.prototype.trust; }
    return results;
  });
  assert.deepEqual(security, { dompurify: '3.4.17', katex: '0.19.1', hookRemovedHandler: true, rawtextRejected: true, inheritedTrustRejected: true });
  passed.push('DOMPurify detached-hook regression', 'DOMPurify rawtext-root regression', 'KaTeX inherited-trust regression');
  assert.deepEqual(requests, [], 'All diagram rendering must remain offline');
  passed.push('No network requests', 'Reader and Alternative bundles identical');
  console.log(JSON.stringify({ result: 'PASS', runtime: electron ? await electron.evaluate(() => process.versions) : { chromium: browser.version() }, count: passed.length, passed }, null, 2));
} finally {
  await electron?.close();
  await browser?.close();
  if (harness) await rm(harness, { recursive: true, force: true });
}
