// Production image states and the optional authoritative resource resolver.
// Fixtures are synthetic; all direct HTTP image requests are intercepted.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { chromium } = await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE || 'playwright');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'reader-images-r2-'));
const files = ['src/reader/markdown-images.js', 'src/reader/renderer.js', 'src/reader/reader.css', 'src/reader/rich-renderer.js', 'src/reader/rich-layout.css'];
const hashSources = async () => Object.fromEntries(await Promise.all(files.map(async file => [file, createHash('sha256').update(await fs.readFile(path.join(root, file))).digest('hex')])));
const sourceHashes = await hashSources(), startedAt = new Date().toISOString();
await build({ stdin: { contents: 'import {ConversationRenderer} from "./src/reader/renderer.js";import {wrapMarkdownImage,mountMarkdownImages,destroyMarkdownImages} from "./src/reader/markdown-images.js";import "./src/ui/style.css";import "./src/ui/themes.css";import "./src/reader/reader.css";import "./src/reader/rich-layout.css";Object.assign(window,{ConversationRenderer,wrapMarkdownImage,mountMarkdownImages,destroyMarkdownImages});', resolveDir: root }, outfile: path.join(tmp, 'renderer.js'), bundle: true, format: 'iife', platform: 'browser', loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' }, logLevel: 'silent' });
const policy = (await fs.readFile(path.join(root, 'index.html'), 'utf8')).match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
const server = createServer(async (req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<meta http-equiv="Content-Security-Policy" content="${policy}"><link rel="stylesheet" href="/renderer.css"><style>body{overflow:auto}#host{box-sizing:border-box;padding:16px;max-width:960px;margin:auto;height:auto}.message-content{min-width:0}.reader-view .message{max-width:100%}</style><main id="host" class="reader-view"></main><script src="/renderer.js"></script>`);
    return;
  }
  try {
    const name = path.basename(req.url), body = await fs.readFile(path.join(tmp, name));
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'font/woff2');
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, ...(process.env.READER_CHROMIUM ? { executablePath: process.env.READER_CHROMIUM } : {}), args: ['--no-sandbox'] });
const requests = [], errors = [], checks = [], geometry = [];
let report;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://r2-images.example.test/**', async route => {
    const request = route.request();
    requests.push({ url: request.url(), referrer: request.headers().referer || '' });
    if (request.url().includes('/failed')) return route.fulfill({ status: 404, body: 'Missing synthetic image' });
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="#397ca7"/></svg>' });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 48; canvas.height = 24;
    const context = canvas.getContext('2d'); context.fillStyle = '#2468ac'; context.fillRect(0, 0, 48, 24);
    window.syntheticPNG = canvas.toDataURL('image/png');
    context.fillStyle = '#a74c28'; context.fillRect(0, 0, 48, 24);
    window.secondPNG = canvas.toDataURL('image/png');
    window.imageHost = document.getElementById('host');
    window.mountFixture = (source, options = {}) => {
      window.renderer?.destroy(); window.renderer = null;
      destroyMarkdownImages(imageHost);
      imageHost.replaceChildren();
      const content = document.createElement('div'); content.className = 'message-content';
      const paragraph = document.createElement('p');
      const image = document.createElement('img'); image.setAttribute('src', source); image.alt = 'Synthetic image';
      const wrapper = wrapMarkdownImage(image);
      paragraph.append(wrapper); content.append(paragraph); imageHost.append(content);
      mountMarkdownImages(imageHost, options);
      return wrapper;
    };
  });

  const sixStates = 'Beside ![Missing compact](file:///synthetic-missing.png) text.\n\n![Missing wide](file:///synthetic-missing.png)\n\nBeside ![Deferred compact](https://r2-images.example.test/deferred-compact) text.\n\n![Deferred wide](https://r2-images.example.test/deferred-wide)\n\nBeside ![Failed compact](https://r2-images.example.test/failed-compact) text.\n\n![Failed wide](https://r2-images.example.test/failed-wide)';
  await page.evaluate(content => {
    window.renderer = new ConversationRenderer(imageHost); renderer.setRemoteImages('click');
    renderer.renderMessages([{ role: 'assistant', content, message_id: 'synthetic-six-states' }]);
  }, sixStates);
  assert.equal(await page.locator('.reader-markdown-image').count(), 6);
  assert.deepEqual(requests, [], 'Click mode does not request remote images');
  await page.locator('.reader-markdown-image').nth(4).locator('button').click();
  await page.locator('.reader-markdown-image').nth(5).locator('button').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-image-state="failed"]').length === 2);
  const states = await page.locator('.reader-markdown-image').evaluateAll(nodes => nodes.map(node => ({ state: node.dataset.imageState, design: node.dataset.imageDesign, button: node.querySelector('button')?.type || null })));
  assert.deepEqual(states.map(item => item.state), ['missing', 'missing', 'deferred', 'deferred', 'failed', 'failed']);
  assert.deepEqual(states.map(item => item.design), ['compact', 'wide', 'compact', 'wide', 'compact', 'wide']);
  assert.equal(states[2].button, 'button'); assert.equal(states[3].button, 'button');
  assert.equal(await page.locator('.message').evaluate(node => node.sourceText), sixStates);
  const art = await page.evaluate(() => ({
    missingWide: [...document.querySelectorAll('[data-image-state="missing"][data-image-design="wide"] .rich-image-horizon path')].map(path => path.getAttribute('d')),
    failed: [...document.querySelectorAll('[data-image-state="failed"] .reader-image-failure-art')].map(svg => svg.getAttribute('viewBox')),
  }));
  assert.deepEqual(art.missingWide, ['M0 80 Q24 45 48 81 T100 70 V100H0Z', 'M0 94 Q28 69 53 91 T100 86 V100H0Z']);
  assert.deepEqual(art.failed, ['0 0 80 68', '204 34 224 50']);
  checks.push('All six approved compact/wide image states render; source text and original missing-source horizon paths are preserved');

  for (const width of [1440, 680, 380]) for (const mode of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 540 });
    await page.evaluate(mode => { document.documentElement.dataset.theme = mode; document.documentElement.dataset.uiPalette = 'platinum-plus'; }, mode);
    const result = await page.evaluate(() => {
      const slots = [...document.querySelectorAll('.reader-markdown-image')].map(wrapper => {
        const panel = wrapper.dataset.imageState === 'deferred' ? wrapper.querySelector('.reader-image-load') : wrapper.querySelector('.rich-image-placeholder') || wrapper.querySelector('.reader-image-fallback');
        const rect = panel.getBoundingClientRect();
        return { state: wrapper.dataset.imageState, design: wrapper.dataset.imageDesign, width: rect.width, height: rect.height, overflow: panel.scrollWidth > panel.clientWidth || panel.scrollHeight > panel.clientHeight };
      });
      const fallback = document.querySelector('[data-image-state="failed"][data-image-design="wide"] .reader-image-fallback');
      const svg = fallback.querySelector('.reader-image-failure-art'), bounds = svg.getBBox(), matrix = svg.getScreenCTM();
      const point = new DOMPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2).matrixTransform(matrix);
      const bottom = new DOMPoint(bounds.x, bounds.y + bounds.height).matrixTransform(matrix).y;
      const box = fallback.getBoundingClientRect(), caption = fallback.querySelector('.reader-image-failure-copy').getBoundingClientRect();
      return { slots, centerError: [Math.abs(point.x - (box.left + box.width / 2)), Math.abs(point.y - (box.top + box.height / 2))], captionGap: caption.top - bottom, captionInside: caption.bottom <= box.bottom, pageOverflow: document.documentElement.scrollWidth > innerWidth };
    });
    for (const slot of result.slots) {
      assert.ok(slot.width > 0 && slot.height > 0 && !slot.overflow, JSON.stringify(slot));
      assert.ok(slot.width <= (slot.design === 'compact' ? 172 : 640) + 1);
      assert.ok(Math.abs(slot.width / slot.height - (slot.design === 'compact' ? 5 / 4 : 16 / 9)) < .01, JSON.stringify(slot));
    }
    assert.ok(result.centerError.every(value => value < .1), JSON.stringify(result.centerError));
    assert.ok(result.captionGap >= 10 && result.captionInside, JSON.stringify(result));
    assert.equal(result.pageOverflow, false);
    geometry.push({ width, mode, ...result });
  }
  checks.push('All compact frames retain 5:4 and wide frames 16:9 at 1440/680/380; B3 artwork itself is centered with its caption safely below');

  // The resolver receives trusted caller context and a distinct cancellation
  // signal. It does not run merely because a deferred image exists in the DOM.
  const beforeResolver = requests.length;
  await page.evaluate(() => {
    window.resolutions = [];
    window.pendingResolver = (url, options) => new Promise((resolve, reject) => resolutions.push({ url, options, resolve, reject }));
    window.resolverOptions = { mode: 'click', resolveImage: pendingResolver, context: { conversationId: 'synthetic-conversation', messageId: 'synthetic-message' } };
    mountFixture('https://r2-images.example.test/resolved', resolverOptions);
  });
  assert.equal(await page.evaluate(() => resolutions.length), 0);
  assert.equal(await page.locator('img').getAttribute('src'), null);
  await page.locator('.reader-image-load').focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => resolutions.length === 1);
  const resolverContext = await page.evaluate(() => ({ url: resolutions[0].url, conversationId: resolutions[0].options.conversationId, messageId: resolutions[0].options.messageId, aborted: resolutions[0].options.signal.aborted }));
  assert.deepEqual(resolverContext, { url: 'https://r2-images.example.test/resolved', conversationId: 'synthetic-conversation', messageId: 'synthetic-message', aborted: false });
  await page.evaluate(() => resolutions[0].resolve(syntheticPNG));
  await page.waitForFunction(() => document.querySelector('[data-image-state="loaded"]'));
  assert.equal(await page.evaluate(() => document.querySelector('img').getAttribute('src') === syntheticPNG), true);
  assert.equal(requests.length, beforeResolver);
  const repeated = await page.evaluate(() => {
    const original = EventTarget.prototype.addEventListener; let added = 0;
    EventTarget.prototype.addEventListener = function (...args) { added++; return original.apply(this, args); };
    const art = imageHost.querySelectorAll('svg').length;
    for (let i = 0; i < 100; i++) mountMarkdownImages(imageHost, resolverOptions);
    EventTarget.prototype.addEventListener = original;
    return { added, artBefore: art, artAfter: imageHost.querySelectorAll('svg').length, calls: resolutions.length };
  });
  assert.equal(repeated.added, 0); assert.equal(repeated.artBefore, repeated.artAfter); assert.equal(repeated.calls, 1);
  const navigation = await page.locator('img').evaluate(image => ({ click: image.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })), auxclick: image.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 })) }));
  assert.deepEqual(navigation, { click: false, auxclick: false });
  checks.push('Deferred resolver makes no request before native keyboard activation; safe raster result loads, context is preserved, repeated mounts remain idempotent and image navigation is suppressed');

  for (const outcome of ['null', 'reject', 'remote', 'svg']) {
    await page.evaluate(outcome => {
      const resolver = () => outcome === 'reject' ? Promise.reject(new Error('Controlled resolver failure')) : Promise.resolve(outcome === 'null' ? null : outcome === 'remote' ? 'https://r2-images.example.test/untrusted-result' : 'data:image/svg+xml;base64,PHN2Zy8+');
      mountFixture('https://r2-images.example.test/authoritative', { mode: 'auto', resolveImage: resolver });
    }, outcome);
    await page.waitForFunction(() => document.querySelector('[data-image-state="failed"]'));
    assert.equal(await page.locator('img').getAttribute('src'), null);
    assert.equal(requests.length, beforeResolver, 'An authoritative resolver failure must not bypass policy with direct HTTP');
  }
  checks.push('Null, rejected, remote-URL and SVG-data resolver results fail safely without a direct HTTP fallback');

  await page.evaluate(() => {
    window.resolutions = [];
    mountFixture('https://r2-images.example.test/cancel', { mode: 'auto', resolveImage: pendingResolver });
  });
  await page.waitForFunction(() => resolutions.length === 1);
  await page.evaluate(() => mountMarkdownImages(imageHost, { mode: 'click', resolveImage: pendingResolver }));
  assert.deepEqual(await page.evaluate(() => ({ aborted: resolutions[0].options.signal.aborted, state: imageHost.querySelector('.reader-markdown-image').dataset.imageState, src: imageHost.querySelector('img').getAttribute('src') })), { aborted: true, state: 'deferred', src: null });
  await page.evaluate(() => resolutions[0].resolve(syntheticPNG));
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.locator('img').getAttribute('src'), null, 'Late completion after cancellation is ignored');
  await page.evaluate(() => mountMarkdownImages(imageHost, { mode: 'auto', resolveImage: pendingResolver }));
  await page.waitForFunction(() => resolutions.length === 2);
  await page.evaluate(() => resolutions[1].resolve(secondPNG));
  await page.waitForFunction(() => document.querySelector('[data-image-state="loaded"]'));
  assert.equal(await page.evaluate(() => document.querySelector('img').getAttribute('src') === secondPNG), true);
  checks.push('Auto-to-click aborts pending resolution; a stale result cannot load, and a fresh authorized attempt can complete');

  await page.evaluate(() => {
    window.resolutions = [];
    window.pendingOptions = { mode: 'auto', resolveImage: pendingResolver, context: { ownerKey: 'first-owner' } };
    mountFixture('https://r2-images.example.test/context', pendingOptions);
    for (let i = 0; i < 100; i++) mountMarkdownImages(imageHost, pendingOptions);
  });
  assert.equal(await page.evaluate(() => resolutions.length), 1);
  assert.equal(await page.evaluate(() => resolutions[0].options.signal.aborted), false);
  await page.evaluate(() => mountMarkdownImages(imageHost, { mode: 'auto', resolveImage: pendingResolver, context: { ownerKey: 'second-owner' } }));
  await page.waitForFunction(() => resolutions.length === 2);
  assert.equal(await page.evaluate(() => resolutions[0].options.signal.aborted), true);
  assert.equal(await page.evaluate(() => resolutions[1].options.ownerKey), 'second-owner');
  await page.evaluate(() => resolutions[0].resolve(syntheticPNG));
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.locator('img').getAttribute('src'), null);
  await page.evaluate(() => resolutions[1].resolve(secondPNG));
  await page.waitForFunction(() => document.querySelector('[data-image-state="loaded"]'));
  assert.equal(await page.evaluate(() => document.querySelector('img').getAttribute('src') === secondPNG), true);
  checks.push('Identical pending mounts do not duplicate work; changing owner context aborts the old resolver and only the new result can display');

  await page.evaluate(() => {
    window.resolutions = [];
    mountFixture('https://r2-images.example.test/manual', { mode: 'click', resolveImage: pendingResolver });
  });
  await page.locator('.reader-image-load').click();
  await page.waitForFunction(() => resolutions.length === 1);
  await page.evaluate(() => {
    mountMarkdownImages(imageHost, { mode: 'auto', resolveImage: pendingResolver });
    mountMarkdownImages(imageHost, { mode: 'click', resolveImage: pendingResolver });
  });
  assert.equal(await page.evaluate(() => resolutions[0].options.signal.aborted), false);
  await page.evaluate(() => resolutions[0].resolve(syntheticPNG));
  await page.waitForFunction(() => document.querySelector('[data-image-state="loaded"]'));
  checks.push('Switching image preference preserves an explicitly authorized manual load already in progress');

  await page.evaluate(() => {
    window.resolutions = [];
    mountFixture('https://r2-images.example.test/destroy', { mode: 'auto', resolveImage: pendingResolver });
  });
  await page.waitForFunction(() => resolutions.length === 1);
  await page.evaluate(() => { destroyMarkdownImages(imageHost); resolutions[0].resolve(syntheticPNG); });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.evaluate(() => resolutions[0].options.signal.aborted), true);
  assert.equal(await page.locator('img').getAttribute('src'), null);
  assert.equal(await page.locator('[data-image-state="loaded"]').count(), 0);
  checks.push('Destroy aborts a pending resolver and ignores late completion');

  const remounted = await page.evaluate(() => {
    window.resolutions = [];
    const svgBefore = imageHost.querySelectorAll('svg').length;
    mountMarkdownImages(imageHost, { mode: 'auto', resolveImage: pendingResolver });
    return { svgBefore, svgAfter: imageHost.querySelectorAll('svg').length };
  });
  await page.waitForFunction(() => resolutions.length === 1);
  assert.equal(remounted.svgBefore, remounted.svgAfter);
  await page.evaluate(() => resolutions[0].resolve(secondPNG));
  await page.waitForFunction(() => document.querySelector('[data-image-state="loaded"]'));
  assert.equal(await page.evaluate(() => document.querySelector('img').getAttribute('src') === secondPNG), true);
  checks.push('A destroyed DOM can be remounted with one new controller and no duplicate artwork');

  await page.evaluate(() => {
    const bytes = 16 * 1024 * 1024 + 1;
    const oversized = 'data:image/png;base64,' + 'A'.repeat(Math.ceil(bytes / 3) * 4 - 1) + '=';
    mountFixture('https://r2-images.example.test/oversized', { mode: 'auto', resolveImage: () => Promise.resolve(oversized) });
  });
  await page.waitForFunction(() => document.querySelector('[data-image-state="failed"]'));
  assert.equal(await page.locator('img').getAttribute('src'), null, 'A raster payload one decoded byte over the resolver limit remains inert');
  checks.push('The resolver decoded-byte ceiling rejects oversized raster data before assigning an image source');

  await page.evaluate(() => {
    window.directResolverCalls = 0;
    mountFixture(syntheticPNG, { mode: 'click', resolveImage: () => { directResolverCalls++; throw new Error('Embedded raster must bypass resolver'); } });
  });
  await page.waitForFunction(() => document.querySelector('[data-image-state="loaded"]'));
  assert.equal(await page.evaluate(() => directResolverCalls), 0);
  assert.equal(requests.length, beforeResolver);
  await page.evaluate(() => mountFixture('https://r2-images.example.test/direct', { mode: 'auto' }));
  await page.locator('img').evaluate(image => image.scrollIntoView());
  await page.waitForFunction(() => document.querySelector('[data-image-state="loaded"]'));
  assert.equal(requests.length, beforeResolver + 1);
  assert.equal(requests.at(-1).referrer, '');
  checks.push('Embedded raster remains automatic and bypasses the resolver; a view without a resolver retains its no-referrer direct HTTP behavior');

  await page.evaluate(() => {
    destroyMarkdownImages(imageHost); imageHost.replaceChildren();
    window.resolutions = [];
    window.renderer = new ConversationRenderer(imageHost);
    renderer.setRemoteImages('auto');
    renderer.setImageResolver(pendingResolver, { conversationId: 'renderer-context' });
    renderer.renderMessages([{ role: 'assistant', message_id: 'first-message', content: '![First](https://r2-images.example.test/renderer-first)' }]);
  });
  await page.waitForFunction(() => resolutions.length === 1);
  await page.evaluate(() => renderer.renderMessages([{ role: 'assistant', message_id: 'second-message', content: '![Second](https://r2-images.example.test/renderer-second)' }]));
  await page.waitForFunction(() => resolutions.length === 2);
  assert.equal(await page.evaluate(() => resolutions[0].options.signal.aborted), true);
  await page.evaluate(() => { resolutions[0].resolve(syntheticPNG); resolutions[1].resolve(secondPNG); });
  await page.waitForFunction(() => document.querySelector('[data-image-state="loaded"]'));
  assert.equal(await page.evaluate(() => document.querySelector('img').getAttribute('src') === secondPNG), true);
  assert.equal(await page.evaluate(() => resolutions[1].options.conversationId), 'renderer-context');
  checks.push('ConversationRenderer forwards resolver context and disposes pending image work when replacing messages');

  await page.evaluate(() => renderer.renderMessages([{ role: 'assistant', message_id: 'old-owner-pending', content: '![Old owner](https://r2-images.example.test/old-owner)' }]));
  await page.waitForFunction(() => resolutions.length === 3);
  const ownerChange = await page.evaluate(() => {
    renderer.setImageResolver(pendingResolver, { ownerKey: 'new-owner' });
    renderer.setRemoteImages('auto');
    renderer.setImageResolver(pendingResolver, { ownerKey: 'new-owner' });
    return { calls: resolutions.length, aborted: resolutions[2].options.signal.aborted };
  });
  assert.deepEqual(ownerChange, { calls: 3, aborted: true }, 'An owner switch must not resolve old DOM URLs under the new owner through a settings remount');
  await page.evaluate(() => renderer.renderMessages([{ role: 'assistant', message_id: 'new-owner-message', content: '![New owner](https://r2-images.example.test/new-owner)' }]));
  await page.waitForFunction(() => resolutions.length === 4);
  assert.deepEqual(await page.evaluate(() => ({ ownerKey: resolutions[3].options.ownerKey, oldOwnerRetained: Object.hasOwn(resolutions[3].options, 'conversationId'), messageId: resolutions[3].options.messageId })), { ownerKey: 'new-owner', oldOwnerRetained: false, messageId: 'new-owner-message' });
  await page.evaluate(() => { resolutions[2].resolve(syntheticPNG); resolutions[3].resolve(secondPNG); });
  await page.waitForFunction(() => document.querySelector('[data-image-state="loaded"]'));
  assert.equal(await page.evaluate(() => document.querySelector('img').getAttribute('src') === secondPNG), true);
  checks.push('Changing conversation owner stays inert through settings updates until the new render and removes stale owner context');

  const beforeLoadedToggles = requests.length;
  const loadedToggles = [];
  for (const mode of ['auto', 'click']) {
    await page.evaluate(mode => {
      window.renderer?.destroy(); imageHost.replaceChildren();
      window.modeResolverCalls = { initial: 0, enabled: 0 };
      window.loadedContext = Object.freeze({ ownerKey: 'loaded-mode-' + mode });
      window.renderer = new ConversationRenderer(imageHost);
      renderer.setRemoteImages(mode);
      renderer.setImageResolver(() => { modeResolverCalls.initial++; return Promise.resolve(syntheticPNG); }, loadedContext);
      renderer.renderMessages([{ role: 'assistant', content: '![Loaded mode](https://r2-images.example.test/loaded-mode-' + mode + ')' }]);
    }, mode);
    if (mode === 'click') {
      assert.equal(await page.evaluate(() => modeResolverCalls.initial), 0);
      await page.locator('.reader-image-load').click();
    }
    await page.waitForFunction(() => document.querySelector('[data-image-state="loaded"]'));
    const result = await page.evaluate(() => {
      const image = imageHost.querySelector('img'), source = image.getAttribute('src');
      renderer.setImageResolver(undefined, loadedContext);
      const disabled = { sourceSame: image.getAttribute('src') === source, state: image.closest('.reader-markdown-image').dataset.imageState, hidden: image.hidden };
      renderer.setImageResolver(() => { modeResolverCalls.enabled++; return Promise.resolve(secondPNG); }, loadedContext);
      const enabled = { sourceSame: image.getAttribute('src') === source, state: image.closest('.reader-markdown-image').dataset.imageState, hidden: image.hidden };
      return { disabled, enabled, calls: { ...modeResolverCalls } };
    });
    assert.deepEqual(result, { disabled: { sourceSame: true, state: 'loaded', hidden: false }, enabled: { sourceSame: true, state: 'loaded', hidden: false }, calls: { initial: 1, enabled: 0 } });
    assert.equal(requests.length, beforeLoadedToggles);
    loadedToggles.push({ mode, ...result });
  }
  checks.push('Enabling or disabling the resolver with the same owner preserves already loaded automatic and manual-click images without new resolver or HTTP requests');

  await page.evaluate(() => {
    window.uppercaseResolverCalls = 0;
    mountFixture(syntheticPNG.replace(/^data:/, 'DATA:'), { mode: 'click', resolveImage: () => { uppercaseResolverCalls++; throw new Error('Uppercase DATA must bypass resolver'); } });
  });
  await page.waitForFunction(() => document.querySelector('[data-image-state="loaded"]'));
  assert.equal(await page.evaluate(() => uppercaseResolverCalls), 0);
  assert.equal(requests.length, beforeLoadedToggles);
  checks.push('Uppercase DATA raster URLs load automatically and bypass the resolver in click mode');

  await page.evaluate(() => {
    const pngBytes = atob(syntheticPNG.split(',')[1]);
    const bytes = pngBytes + '\0'.repeat(9 * 1024 * 1024 - pngBytes.length);
    window.largeRasterData = 'data:image/png;base64,' + btoa(bytes);
    mountFixture('https://r2-images.example.test/large-raster', { mode: 'auto', resolveImage: () => Promise.resolve(largeRasterData) });
  });
  await page.waitForFunction(() => document.querySelector('[data-image-state="loaded"]'));
  const largeRaster = await page.evaluate(() => {
    const image = imageHost.querySelector('img');
    return { encodedLength: image.getAttribute('src').length, decodedBytes: atob(largeRasterData.split(',')[1]).length, sourceSame: image.getAttribute('src') === largeRasterData, width: image.naturalWidth, height: image.naturalHeight };
  });
  assert.ok(largeRaster.encodedLength > 8 * 1024 * 1024);
  assert.equal(largeRaster.decodedBytes, 9 * 1024 * 1024);
  assert.equal(largeRaster.sourceSame, true);
  assert.deepEqual([largeRaster.width, largeRaster.height], [48, 24]);
  assert.equal(requests.length, beforeLoadedToggles);
  checks.push('A valid resolved PNG with 9 MiB decoded bytes loads successfully above the archive-data limit and below the cache resolver limit');

  const missingRemount = await page.evaluate(() => {
    mountFixture('file:///synthetic-unusable.png', { mode: 'auto' });
    const label = () => imageHost.querySelector('.rich-offline-label').textContent;
    const before = label(), artBefore = imageHost.querySelectorAll('svg').length;
    for (let i = 0; i < 5; i++) { destroyMarkdownImages(imageHost); mountMarkdownImages(imageHost, { mode: 'auto' }); }
    return { before, after: label(), artBefore, artAfter: imageHost.querySelectorAll('svg').length };
  });
  assert.equal(missingRemount.before, 'Image unavailable');
  assert.equal(missingRemount.after, 'Image unavailable');
  assert.equal(missingRemount.artAfter, missingRemount.artBefore);
  checks.push('Repeated destroy/remount of a missing-source placeholder preserves its short caption and does not duplicate artwork');

  assert.deepEqual(errors, []);
  assert.deepEqual(await hashSources(), sourceHashes, 'Production sources changed during verification');
  report = { passed: true, startedAt, finishedAt: new Date().toISOString(), browser: browser.version(), sourceHashes, checks, states, art, geometry, resolverContext, repeated, navigation, loadedToggles, largeRaster, missingRemount, requests, errors };
  console.log(JSON.stringify({ passed: true, checks, layoutCases: geometry.length, requests: requests.length, errors }));
} catch (error) {
  report = { passed: false, startedAt, error: error.stack, sourceHashes, checks, geometry, requests, errors };
  throw error;
} finally {
  if (process.env.THREADSHELF_IMAGE_R2_EVIDENCE) {
    await fs.mkdir(path.dirname(process.env.THREADSHELF_IMAGE_R2_EVIDENCE), { recursive: true });
    await fs.writeFile(process.env.THREADSHELF_IMAGE_R2_EVIDENCE, JSON.stringify(report, null, 2) + '\n');
  }
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  await fs.rm(tmp, { recursive: true, force: true });
}
