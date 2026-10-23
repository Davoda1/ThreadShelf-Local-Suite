// Production shell and renderer with 80 synthetic images and a bounded mock bridge.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'reader-image-queue-ui-'));
const { chromium } = await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE || 'playwright');
await build({ absWorkingDir: root, entryPoints: ['src/ui/app.js'], outdir: temporary, bundle: true, format: 'iife', platform: 'browser', loader: { '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl', '.svg': 'dataurl', '.png': 'dataurl' }, logLevel: 'silent' });
const server = http.createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname, name = path.basename(pathname);
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<link rel="stylesheet" href="/app.css"><main id="app"></main><div id="modalRoot"></div><div id="toastRoot"></div><script src="/app.js"></script>'); return; }
    response.setHeader('Content-Type', name.endsWith('.css') ? 'text/css' : 'application/javascript');
    response.end(await fs.readFile(path.join(['app.js', 'app.css'].includes(name) ? temporary : path.join(root, 'public'), name)));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.READER_CHROMIUM ? { executablePath: process.env.READER_CHROMIUM } : {}), args: ['--no-sandbox'] });
const errors = [], externalRequests = [];
try {
  // All 80 placeholders fit into the viewport, so the browser's own lazy image
  // decoding cannot conceal a failed or undispatched bridge request.
  const page = await browser.newPage({ viewport: { width: 1200, height: 16000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https?:/, route => {
    if (new URL(route.request().url()).origin !== origin) { externalRequests.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await page.addInitScript(() => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAQCAIAAAD4YuoOAAAAIElEQVR4nGM0arrDQEvARFPTRy0YtWDUglELRi2gEgAA3M0BsKdT9rEAAAAASUVORK5CYII=';
    const thread = { id: 'queue-fixture', provider: 'openai', collection: 'Synthetic', sourceFile: 'queue.json', conversationKey: 'queue', title: 'Synthetic image queue', turns: [{ ai: Array.from({ length: 80 }, (_, index) => `Inline ![Synthetic ${index}](https://images.example.test/${index}.png) image.`).join('\n\n'), turn_index: 0 }] };
    const settings = { mode: 'local', language: 'en', theme: 'dark', uiPalette: 'default', animations: false, remoteImages: 'auto', pageSize: 25, listMode: 'pages', localCollection: 'all', serverCollection: 'all' };
    window.fixture = { active: 0, maximum: 0, loads: 0, completed: 0, contexts: 0, cancels: 0, gate: null, release: null };
    window.desktop = { onProgress() {}, onMenu() {}, invoke: async (action) => {
      if (action === 'bootstrap') return { settings, resources: { enabled: false, itemCount: 0 }, reading: { positions: {}, bookmarks: [], recent: [] }, version: '1.1.0', searchStatus: {} };
      if (action === 'collections') return { collections: [{ name: 'Synthetic', count: 1 }] };
      if (action === 'files') return { files: [{ ...thread, turns: undefined }], total: 1 };
      if (action === 'thread') return structuredClone(thread);
      if (action === 'reading.save') return { positions: {}, bookmarks: [], recent: [] };
      if (action === 'resources.context') { fixture.contexts++; return { contextToken: 'synthetic-context' }; }
      if (action === 'resources.cancel') { fixture.cancels++; return { ok: true }; }
      if (action === 'resources.load') {
        fixture.loads++; fixture.active++; fixture.maximum = Math.max(fixture.maximum, fixture.active);
        try {
          if (fixture.active > 64) throw new Error('Service pending request cap exceeded');
          if (fixture.gate) await fixture.gate;
          else await new Promise(resolve => setTimeout(resolve, 20));
          fixture.completed++; return { dataUrl: png, cached: false, stored: false };
        } finally { fixture.active--; }
      }
      throw new Error('Unexpected synthetic image action ' + action);
    } };
  });
  await page.goto(origin);
  await page.locator('.conversation-row').click();
  await page.waitForFunction(() => fixture.completed === 80 && document.querySelectorAll('[data-image-state="loaded"]').length === 80);
  const loaded = await page.evaluate(() => ({ loads: fixture.loads, completed: fixture.completed, maximum: fixture.maximum, contexts: fixture.contexts, failed: document.querySelectorAll('[data-image-state="failed"]').length }));
  assert.deepEqual(loaded, { loads: 80, completed: 80, maximum: 4, contexts: 1, failed: 0 });

  await page.locator('[data-action="close-thread"]').click();
  await page.setViewportSize({ width: 680, height: 540 });
  await page.evaluate(() => { fixture.gate = new Promise(resolve => { fixture.release = resolve; }); });
  await page.locator('.conversation-row').click();
  await page.waitForFunction(() => fixture.loads === 84);
  await page.locator('[data-action="close-thread"]').click();
  await page.waitForFunction(() => fixture.cancels === 4);
  await page.evaluate(() => { fixture.release(); fixture.gate = null; });
  await page.waitForFunction(() => fixture.active === 0);
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => fixture.loads), 84, 'The 76 cancelled waiting images must never reach the bridge');
  assert.equal(await page.locator('.reader-markdown-image').count(), 0);

  await page.locator('.conversation-row').click();
  await page.waitForFunction(() => fixture.completed === 164);
  assert.equal(await page.evaluate(() => fixture.maximum), 4);
  assert.equal(await page.locator('[data-image-state="failed"]').count(), 0);
  assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
  const report = { passed: true, imageCount: 80, maximumConcurrentBridgeLoads: 4, cacheEnabled: false, queuedCancellationCount: 76, checks: ['80 automatic images all load without exceeding bridge cap', 'Closing aborts active and queued image work', 'Subsequent conversation remains usable', 'No direct external image requests'], pageErrors: errors, externalRequests };
  if (process.env.READER_IMAGE_QUEUE_REPORT) await fs.writeFile(process.env.READER_IMAGE_QUEUE_REPORT, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); await fs.rm(temporary, { recursive: true, force: true }); }
