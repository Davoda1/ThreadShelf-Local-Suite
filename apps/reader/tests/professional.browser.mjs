#!/usr/bin/env node
// Revision 6 source-built offline preview: real UI/Reader DOM and bundled MP4s.
// Run after build + preview; use Chromium or READER_ELECTRON with a display.
// Pixel probes never add a background: they pause the actual decoded wave and
// temporarily hide foreground text or disable a decorative effect for comparison.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { releaseFilename } from '../scripts/release-filenames.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const filename = process.env.READER_PREVIEW_FILE || path.join(root, 'release', releaseFilename(`ThreadShelf-Local-Reader-${version}-Preview.html`));
const previewSha256 = createHash('sha256').update(await fs.readFile(filename)).digest('hex');
const evidence = process.env.READER_EVIDENCE || await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-professional-'));
await fs.mkdir(evidence, { recursive: true });
const { chromium, _electron } = await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE || 'playwright');
const compositor = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
let browser, page, electronHarness;
if (process.env.READER_ELECTRON) {
  electronHarness = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-professional-electron-'));
  const main = path.join(electronHarness, 'main.cjs');
  await fs.writeFile(main, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(electronHarness, 'profile'))});app.whenReady().then(()=>{const w=new BrowserWindow({width:1440,height:1000,useContentSize:true,show:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});w.setMenu(null);w.loadURL('about:blank');});`);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: process.env.READER_ELECTRON, args: [...compositor, main], env, timeout: 45000 });
  const versions = await app.evaluate(() => ({ electron: process.versions.electron, chromium: process.versions.chrome }));
  browser = { version: () => `Electron ${versions.electron} / Chromium ${versions.chromium}`, close: () => app.close() };
  page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ colorScheme: 'dark' });
} else {
  browser = await chromium.launch({ headless: true, executablePath: process.env.READER_CHROMIUM, args: compositor });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
}
const errors = [], consoleErrors = [], requests = [], checks = [], measurements = [], videoChecks = [], contrastFailures = [], overlayMeasurements = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
await page.route(/^https?:/, route => { requests.push(route.request().url()); return route.abort(); });
const action = name => page.locator(`[data-action="${name}"]`);
const check = async (name, fn) => { await fn(); checks.push(name); console.log('PASS', name); };
async function settledScreenshot(options) {
  // A computed-style/layout read alone does not commit a changed backdrop-filter
  // to the compositor. Give every style-masked/reference crop two paint frames.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.screenshot(options);
}
async function settings() {
  await action('settings').click();
  await page.locator('[data-action="settings-tab"][data-tab="appearance"]').click();
  await page.locator('#prefUiPalette').waitFor();
}
async function save() { await page.locator('#settingsForm button[type="submit"]').click(); await page.locator('#settingsForm').waitFor({ state: 'detached' }); }
async function cancel() { await page.locator('.modal-header [data-action="modal-close"]').click(); await page.locator('#settingsForm').waitFor({ state: 'detached' }); }
async function noVideo() { await page.waitForFunction(() => !document.querySelector('.threadshelf-wave-video')); }
async function videoReady(mode) {
  await page.waitForFunction(mode => {
    const video = document.querySelector('.threadshelf-wave-video');
    return video?.dataset.waveTheme === mode && video.readyState >= 2 && video.videoWidth === 1920 && video.videoHeight === 1080 && video.currentTime > .12 && !video.paused && !video.error;
  }, mode, { timeout: 30000 });
  assert.equal(await page.locator('.threadshelf-wave-video').count(), 1, 'A single wave decoder serves the pane');
  const result = await page.locator('.threadshelf-wave-video').evaluate(video => ({ theme: video.dataset.waveTheme, time: video.currentTime, width: video.videoWidth, height: video.videoHeight, frames: video.getVideoPlaybackQuality().totalVideoFrames, muted: video.muted, loop: video.loop, hidden: video.getAttribute('aria-hidden'), tabIndex: video.tabIndex, pointerEvents: getComputedStyle(video).pointerEvents }));
  assert.ok(result.frames > 0); assert.equal(result.muted, true); assert.equal(result.loop, true);
  assert.equal(result.hidden, 'true'); assert.equal(result.tabIndex, -1); assert.equal(result.pointerEvents, 'none');
  videoChecks.push(result);
  return result;
}
async function setThinking(expanded) {
  const button = page.locator('.message.thinking .reasoning-collapse-toggle').first();
  if ((await button.getAttribute('aria-expanded') === 'true') !== expanded) await button.click();
  await page.waitForFunction(expanded => document.querySelector('.message.thinking .reasoning-collapse-toggle')?.getAttribute('aria-expanded') === String(expanded), expanded);
  // Production collapse/expand transitions must settle before taking a crop.
  await page.locator('.message.thinking').first().evaluate(async node => { await Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))); node.scrollIntoView({ block: 'center', behavior: 'instant' }); });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
const source = () => page.locator('.message').evaluateAll(messages => messages.map(message => message.sourceText));
const codeStyle = () => page.locator('pre code').first().evaluate(node => ({ text: node.textContent, color: getComputedStyle(node).color, font: getComputedStyle(node).fontFamily }));
async function material() {
  return page.evaluate(() => {
    const heading = document.querySelector('#threadHeader'), reader = document.querySelector('#readerHost');
    const thinking = document.querySelector('.message.thinking');
    const css = (node, pseudo) => { const style = getComputedStyle(node, pseudo); return { blur: style.backdropFilter, filter: style.filter, transform: style.transform, background: style.backgroundImage, color: style.backgroundColor, content: style.content, position: style.position, opacity: style.opacity }; };
    const close = document.querySelector('[data-action="close-thread"]').getBoundingClientRect(), title = heading.querySelector('h1').getBoundingClientRect();
    const content = document.querySelector('.conversation-content');
    return { mode: document.documentElement.dataset.theme, heading: css(heading), headingLayer: css(heading, '::before'), thinking: css(thinking), thinkingLayer: css(thinking, '::before'), top: reader.getBoundingClientRect().top, headerTop: heading.getBoundingClientRect().top, headerBottom: heading.getBoundingClientRect().bottom, contentTop: content.getBoundingClientRect().top, contentPadding: getComputedStyle(content).paddingTop, contentScrollTop: content.scrollTop, readerMargin: getComputedStyle(reader).marginTop, closeFits: close.right <= heading.getBoundingClientRect().right && title.right <= close.left + 1, overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight, width: innerWidth, height: innerHeight };
  });
}
const blurPixels = value => Number(value.match(/blur\(([\d.]+)px\)/)?.[1] || 0);
function glass(value) {
  assert.equal(value.heading.blur, 'none', 'Text/control owner stays unfiltered');
  assert.ok(blurPixels(value.headingLayer.blur) >= 8, 'Header has decorative blur; decoded-wave pixels prove its visible strength');
  assert.equal(value.thinking.blur, 'none', 'Thinking text stays unfiltered');
  assert.ok(blurPixels(value.thinkingLayer.blur) >= 2, 'Thinking has decorative blur; decoded-wave pixels prove its visible strength');
  assert.equal(value.heading.filter, 'none', 'Header text itself is not blurred');
  assert.equal(value.overflow, false); assert.equal(value.closeFits, true);
}
async function pixelComparison(images) {
  return page.evaluate(async images => {
    const decoded = [];
    for (const image64 of images) {
      const image = new Image(); image.src = 'data:image/png;base64,' + image64; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0);
      decoded.push({ width: image.width, height: image.height, pixels: context.getImageData(0, 0, image.width, image.height).data });
    }
    const delta = (a, b) => {
      if (a.width !== b.width || a.height !== b.height) throw new Error('Pixel crop dimensions changed');
      let absolute = 0, changed = 0, count = 0;
      for (let i = 0; i < a.pixels.length; i += 4) for (let c = 0; c < 3; c++) {
        const d = Math.abs(a.pixels[i + c] - b.pixels[i + c]); absolute += d; if (d > 1) changed++; count++;
      }
      return { mean: absolute / count, changed: changed / count };
    };
    const luminance = image => {
      const values = new Float64Array(image.width * image.height);
      for (let i = 0; i < values.length; i++) values[i] = image.pixels[i * 4] * .2126 + image.pixels[i * 4 + 1] * .7152 + image.pixels[i * 4 + 2] * .0722;
      return values;
    };
    const deviation = values => {
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      return { mean, std: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length) };
    };
    const background = luminance(decoded[0]), hidden = luminance(decoded[1]);
    const reference = luminance(decoded[4]), referenceHidden = luminance(decoded[5]);
    const wave = background.map((value, index) => value - hidden[index]);
    const referenceWave = reference.map((value, index) => value - referenceHidden[index]);
    const width = decoded[0].width, height = decoded[0].height;
    const pooled = values => {
      const result = [], cell = 32;
      for (let top = 0; top < height; top += cell) for (let left = 0; left < width; left += cell) {
        let sum = 0, count = 0;
        for (let y = top; y < Math.min(height, top + cell); y++) for (let x = left; x < Math.min(width, left + cell); x++) { sum += values[y * width + x]; count++; }
        result.push(sum / count);
      }
      return result;
    };
    const coarse = pooled(wave), coarseReference = pooled(referenceWave);
    const actualStats = deviation(coarse), referenceStats = deviation(coarseReference);
    const covariance = coarse.reduce((sum, value, index) => sum + (value - actualStats.mean) * (coarseReference[index] - referenceStats.mean), 0) / coarse.length;
    const edgeEnergy = values => {
      let sum = 0, count = 0;
      for (let y = 1; y < height; y++) for (let x = 1; x < width; x++) {
        const at = y * width + x;
        sum += (values[at] - values[at - 1]) ** 2 + (values[at] - values[at - width]) ** 2; count += 2;
      }
      return Math.sqrt(sum / count) / Math.max(deviation(values).std, .0001);
    };
    const ordered = [...background].sort((a, b) => a - b);
    const orderedReference = [...reference].sort((a, b) => a - b);
    const range95To5 = values => values[Math.floor((values.length - 1) * .95)] - values[Math.floor((values.length - 1) * .05)];
    const visibleGlass = {
      luminanceRange95To5: range95To5(ordered),
      referenceLuminanceRange95To5: range95To5(orderedReference),
      retainedLuminanceRange: range95To5(ordered) / Math.max(range95To5(orderedReference), .0001),
      waveSpatialDeviation: deviation(wave).std,
      referenceWaveSpatialDeviation: deviation(referenceWave).std,
      retainedSpatialContrast: deviation(wave).std / Math.max(deviation(referenceWave).std, .0001),
      coarseShapeCorrelation: covariance / Math.max(actualStats.std * referenceStats.std, .0001),
      retainedCoarseContrast: actualStats.std / Math.max(referenceStats.std, .0001),
      normalizedEdgeRatio: edgeEnergy(wave) / Math.max(edgeEnergy(referenceWave), .0001),
      reference: 'Same decoded frame and geometry; only target material tint, blur and inset shadow removed; real-video-hidden reference subtracts the remaining scene.'
    };
    return { waveContribution: delta(decoded[0], decoded[1]), blurContribution: delta(decoded[0], decoded[2]), frameChange: delta(decoded[0], decoded[3]), visibleGlass };
  }, images.map(buffer => buffer.toString('base64')));
}
async function seekVideo(fraction) {
  return page.locator('.threadshelf-wave-video').evaluate(async (video, fraction) => {
    video.pause();
    const target = Math.min(video.duration - .1, Math.max(.2, video.duration * fraction));
    const presented = new Promise((resolve, reject) => {
      let callback;
      const timer = setTimeout(() => { video.cancelVideoFrameCallback(callback); reject(new Error('Seeked wave frame was not presented to the compositor')); }, 10000);
      const onFrame = (_now, metadata) => {
        if (Math.abs(metadata.mediaTime - target) <= .05) {
          clearTimeout(timer);
          video.__professionalPresentedFrame = { mediaTime: metadata.mediaTime, presentedFrames: metadata.presentedFrames };
          resolve(video.__professionalPresentedFrame);
        } else callback = video.requestVideoFrameCallback(onFrame);
      };
      callback = video.requestVideoFrameCallback(onFrame);
    });
    const seeked = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Wave seek did not decode')), 10000);
      video.addEventListener('seeked', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    video.currentTime = target;
    const [presentation] = await Promise.all([presented, seeked]);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 108;
    const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(video, 0, 0, 192, 108);
    const pixels = context.getImageData(0, 0, 192, 108).data;
    let min = 255, max = 0; for (let i = 0; i < pixels.length; i += 4) { const light = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3; min = Math.min(min, light); max = Math.max(max, light); }
    return { time: video.currentTime, duration: video.duration, presentation, decodedRange: max - min, rawFrame: canvas.toDataURL('image/png').split(',')[1] };
  }, fraction);
}
async function textContrast(region, screenshot, expanded) {
  return page.evaluate(async ({ region, screenshot, expanded }) => {
    const image = new Image(); image.src = 'data:image/png;base64,' + screenshot; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    const inkCanvas = document.createElement('canvas'); inkCanvas.width = inkCanvas.height = 1;
    const inkContext = inkCanvas.getContext('2d', { willReadFrequently: true });
    const luminance = rgb => rgb.map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, index) => sum + c * [.2126, .7152, .0722][index], 0);
    const owner = document.querySelector(region.selector), results = [];
    const selectors = region.selector === '#threadHeader'
      ? ['h1', '.eyebrow', '.thread-meta span:not([aria-hidden="true"])', '.thread-tools button', '[data-action="close-thread"]']
      : ['.message-role', '.message-time', '.message-model', '.message-copy-button', '.bookmark-message', ...(expanded ? ['.message-content p'] : [])];
    for (const selector of selectors) {
      for (const [index, node] of [...owner.querySelectorAll(selector)].entries()) {
      if (!node.getClientRects().length) continue;
      const style = getComputedStyle(node); inkContext.clearRect(0, 0, 1, 1); inkContext.fillStyle = style.color; inkContext.fillRect(0, 0, 1, 1);
      const ink = inkContext.getImageData(0, 0, 1, 1).data, ratios = [], range = document.createRange(); range.selectNodeContents(node);
      let opacity = 1;
      for (let current = node; current; current = current.parentElement) { opacity *= Number(getComputedStyle(current).opacity); if (current === owner) break; }
      const iconOnly = !node.textContent.trim();
      for (const rect of iconOnly ? [node.getBoundingClientRect()] : range.getClientRects()) for (const fraction of [.1, .5, .9]) {
        const x = Math.floor(rect.left + rect.width * fraction - region.clip.x), y = Math.floor(rect.top + rect.height / 2 - region.clip.y);
        if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
        const offset = (y * image.width + x) * 4, background = [...pixels.slice(offset, offset + 3)];
        const alpha = ink[3] / 255 * opacity;
        const foreground = background.map((c, i) => c * (1 - alpha) + ink[i] * alpha);
        const a = luminance(background), b = luminance(foreground); ratios.push((Math.max(a, b) + .05) / (Math.min(a, b) + .05));
      }
      const size = parseFloat(style.fontSize), bold = parseInt(style.fontWeight) >= 700;
      results.push({ selector: `${selector}[${index}]`, color: style.color, opacity, samples: ratios.length, minimum: Math.min(...ratios), required: iconOnly || size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5 });
      }
    }
    return results;
  }, { region, screenshot: screenshot.toString('base64'), expanded });
}
async function wavePixelProbe(mode, expanded) {
  await setThinking(expanded); await videoReady(mode);
  // Keep the header's wave-only probe in the empty initial content inset.
  // Actual conversation content beneath the header is exercised separately.
  await action('read-start').click();
  await page.waitForFunction(() => document.querySelector('.conversation-content').scrollTop < 1);
  const regions = await page.evaluate(() => {
    const video = document.querySelector('.threadshelf-wave-video').getBoundingClientRect();
    return ['#threadHeader', '.message.thinking'].map(selector => {
      const rect = document.querySelector(selector).getBoundingClientRect(), inset = 10;
      return { selector, video: video.toJSON(), rect: rect.toJSON(), clip: { x: Math.ceil(rect.x + inset), y: Math.ceil(rect.y + inset), width: Math.floor(rect.width - inset * 2), height: Math.floor(rect.height - inset * 2) } };
    });
  });
  for (const { selector, rect, video, clip } of regions) {
    assert.ok(video.top <= rect.top + 1 && video.bottom >= rect.bottom - 1 && video.left <= rect.left + 1 && video.right >= rect.right - 1, `${selector}: actual wave element covers the full surface`);
    assert.ok(clip.height > 20 && clip.width > 100, `${selector}: measurable on-screen surface`);
  }
  const viewport = page.viewportSize();
  const frameA = await seekVideo(.16); assert.ok(frameA.decodedRange > 15, 'Actual decoded wave has visible image variation');
  let expectedFrame = frameA.time;
  let expectedRawFrame = frameA.rawFrame;
  let expectedFraction = .16;
  const capture = async (region, label) => {
    // Paused video can leave a cached backdrop texture after comparison styles
    // change. Present a fresh real frame in the current compositing state, then
    // return to the exact reference frame before recording any visible sample.
    if (await page.locator('.threadshelf-wave-video').evaluate(video => getComputedStyle(video).visibility !== 'hidden')) {
      await seekVideo(expectedFraction < .5 ? .72 : .24);
      const refreshed = await seekVideo(expectedFraction);
      assert.ok(refreshed.rawFrame === expectedRawFrame, `${label}: freshly presented frame matches the decoded reference exactly`);
    }
    const verify = async () => {
      const state = await page.evaluate(selector => {
        const video = document.querySelector('.threadshelf-wave-video');
        const rect = document.querySelector(selector).getBoundingClientRect();
        const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 108;
        canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0, 192, 108);
        return { time: video.currentTime, paused: video.paused, left: rect.left, top: rect.top, width: rect.width, height: rect.height, video: video.getBoundingClientRect().toJSON(), scrollTop: document.querySelector('.conversation-content').scrollTop, rawFrame: canvas.toDataURL('image/png').split(',')[1] };
      }, region.selector);
      const diagnostic = JSON.stringify({ ...state, rawFrame: undefined });
      assert.equal(state.paused, true, `${label}: comparison keeps the real video paused: ${diagnostic}`);
      assert.ok(Math.abs(state.time - expectedFrame) < .001, `${label}: comparison uses the same decoded frame: ${diagnostic}`);
      assert.ok(state.rawFrame === expectedRawFrame, `${label}: actual decoded wave pixels remain fixed: ${diagnostic}`);
      for (const field of ['left', 'top', 'width', 'height']) {
        assert.ok(Math.abs(state[field] - region.rect[field]) < .1, `${label}: comparison keeps surface geometry fixed: ${diagnostic}`);
        assert.ok(Math.abs(state.video[field] - region.video[field]) < .1, `${label}: comparison keeps video geometry fixed: ${diagnostic}`);
      }
    };
    await verify();
    const bytes = await settledScreenshot({ clip: region.clip });
    await verify();
    return bytes;
  };
  // Mask ink without hiding control backgrounds. Contrast must be measured over
  // the actual composited button/model backgrounds, including element opacity.
  const inkMask = await page.addStyleTag({ content: '#threadHeader, #threadHeader *, .message.thinking, .message.thinking * { color:transparent!important; text-shadow:none!important; text-decoration-color:transparent!important } #threadHeader svg, .message.thinking svg { visibility:hidden!important }' });
  const contrastImages = [];
  for (const region of regions) contrastImages.push(await capture(region, 'contrast background'));
  await inkMask.evaluate(node => node.remove());
  const mask = await page.addStyleTag({ content: '#threadHeader > *, .message.thinking > * { visibility:hidden!important } .threadshelf-wave-video { transition:none!important }' });
  try {
    const blurred = [];
    for (const region of regions) blurred.push(await capture(region, 'blurred wave'));
    const hide = await page.addStyleTag({ content: '.threadshelf-wave-video { visibility:hidden!important }' });
    const noWave = [];
    for (const region of regions) noWave.push(await capture(region, 'hidden wave'));
    await hide.evaluate(node => node.remove());
    const disable = await page.addStyleTag({ content: 'html[data-ui-palette="professional"] #threadHeader::before, html[data-ui-palette="professional"] #readerHost .message.thinking::before { backdrop-filter:none!important; -webkit-backdrop-filter:none!important }' });
    const unblurred = [];
    for (const region of regions) unblurred.push(await capture(region, 'unblurred wave'));
    await disable.evaluate(node => node.remove());
    const references = [], referencesHidden = [];
    for (const region of regions) {
      const reference = await page.addStyleTag({ content: `html[data-ui-palette="professional"] ${region.selector}::before { background:none!important; backdrop-filter:none!important; -webkit-backdrop-filter:none!important; box-shadow:none!important }` });
      references.push(await capture(region, 'glass-free reference'));
      const hideReference = await page.addStyleTag({ content: '.threadshelf-wave-video { visibility:hidden!important }' });
      referencesHidden.push(await capture(region, 'glass-free hidden reference'));
      await hideReference.evaluate(node => node.remove());
      await reference.evaluate(node => node.remove());
    }
    const frameB = await seekVideo(.67); assert.notEqual(frameA.rawFrame, frameB.rawFrame, 'Two actual decoded wave frames differ');
    expectedFrame = frameB.time;
    expectedRawFrame = frameB.rawFrame;
    expectedFraction = .67;
    await fs.writeFile(path.join(evidence, `${mode}-decoded-frame-a.png`), Buffer.from(frameA.rawFrame, 'base64'));
    await fs.writeFile(path.join(evidence, `${mode}-decoded-frame-b.png`), Buffer.from(frameB.rawFrame, 'base64'));
    const changed = [];
    for (const region of regions) changed.push(await capture(region, 'second decoded frame'));
    for (const [index, region] of regions.entries()) {
      const pixels = await pixelComparison([blurred[index], noWave[index], unblurred[index], changed[index], references[index], referencesHidden[index]]);
      const contrast = await textContrast(region, contrastImages[index], expanded);
      measurements.push({ pixelProbe: true, mode, expanded, viewport, surface: region.selector, geometry: region, contrast, frameA: { ...frameA, rawFrame: undefined }, frameB: { ...frameB, rawFrame: undefined }, ...pixels });
      const label = `${mode}-${expanded ? 'expanded' : 'collapsed'}-${index ? 'thinking' : 'header'}-${viewport.width}x${viewport.height}`;
      await fs.writeFile(path.join(evidence, `${label}-wave-blurred.png`), blurred[index]);
      await fs.writeFile(path.join(evidence, `${label}-wave-hidden.png`), noWave[index]);
      await fs.writeFile(path.join(evidence, `${label}-wave-unblurred.png`), unblurred[index]);
      await fs.writeFile(path.join(evidence, `${label}-backdrop-reference.png`), references[index]);
      await fs.writeFile(path.join(evidence, `${label}-contrast-background.png`), contrastImages[index]);
      assert.ok(pixels.waveContribution.mean > .8 && pixels.waveContribution.changed > .1, `${label}: real decoded wave is visible through surface: ${JSON.stringify(pixels)}`);
      assert.ok(pixels.blurContribution.mean > .08, `${label}: actual backdrop blur changes decoded wave pixels: ${JSON.stringify(pixels)}`);
      assert.ok(pixels.frameChange.mean > .08, `${label}: different decoded video frame is visible through glass: ${JSON.stringify(pixels)}`);
      const glass = pixels.visibleGlass;
      // Material transmission is relative to the actual existing backdrop. A
      // brighter replacement video must never be needed to satisfy this test.
      assert.ok(glass.referenceWaveSpatialDeviation >= 1, `${label}: decoded backdrop contains measurable wave shapes: ${JSON.stringify(glass)}`);
      if (region.selector === '.message.thinking') {
        assert.ok(glass.retainedLuminanceRange >= .65, `${label}: material preserves the actual backdrop's light/dark shapes: ${JSON.stringify(glass)}`);
        assert.ok(glass.retainedSpatialContrast >= .65, `${label}: material transmits most underlying wave variation: ${JSON.stringify(glass)}`);
        assert.ok(glass.coarseShapeCorrelation >= .85, `${label}: visible shapes track the real underlying wave: ${JSON.stringify(glass)}`);
        assert.ok(glass.retainedCoarseContrast >= .70, `${label}: material transmits most larger wave shapes: ${JSON.stringify(glass)}`);
      }
      assert.ok(glass.normalizedEdgeRatio <= .80, `${label}: actual blur smooths wave edges independently of tint: ${JSON.stringify(glass)}`);
      for (const text of contrast) {
        assert.ok(text.samples > 0, `${label} ${text.selector}: actual text background sampled`);
        if (text.minimum < text.required) contrastFailures.push(`${label} ${text.selector}: text contrast over composited wave ${text.minimum.toFixed(2)} < ${text.required}`);
      }
    }
  } finally {
    await mask.evaluate(node => node.remove());
    await page.locator('.threadshelf-wave-video').evaluate(video => video.play());
  }
}
async function headerOverlayProbe(mode, viewport) {
  await page.setViewportSize(viewport);
  await settings(); await page.selectOption('#prefTheme', mode); await page.locator('#prefWaveVideoBackground').uncheck(); await save(); await noVideo();
  await action('read-start').click();
  await page.waitForFunction(() => document.querySelector('.conversation-content').scrollTop < 1);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const initial = await page.evaluate(() => {
    const pane = document.querySelector('.content-pane'), header = document.querySelector('#threadHeader');
    const content = document.querySelector('.conversation-content'), first = content.querySelector('.message');
    return { overlay: pane.classList.contains('professional-thread-overlay'), inset: parseFloat(getComputedStyle(pane).getPropertyValue('--professional-thread-overlay-height')), header: header.getBoundingClientRect().toJSON(), content: content.getBoundingClientRect().toJSON(), first: first.getBoundingClientRect().toJSON(), padding: parseFloat(getComputedStyle(content).paddingTop), scrollPadding: parseFloat(getComputedStyle(content).scrollPaddingTop) };
  });
  assert.equal(initial.overlay, true, 'Professional conversation uses the measured overlay');
  assert.ok(initial.content.top <= initial.header.top + 1, 'Conversation scrollport extends behind header');
  assert.ok(initial.first.top >= initial.header.bottom + 10, 'Initial conversation begins below header controls');
  assert.ok(initial.padding >= initial.inset + 10 && initial.scrollPadding >= initial.inset - 1, 'Content and navigation reserve the measured chrome inset');
  const scrollbar = await page.locator('.conversation-content').evaluate(node => ({ clientHeight: node.clientHeight, scrollHeight: node.scrollHeight }));
  const trackHeight = initial.content.height - initial.inset;
  const thumbHeight = Math.max(32, trackHeight * scrollbar.clientHeight / scrollbar.scrollHeight);
  const drag = { x: initial.content.right - 6, start: initial.content.top + initial.inset + thumbHeight / 2 };
  drag.end = Math.min(initial.content.bottom - 12, drag.start + 150);
  await page.mouse.move(drag.x, drag.start); await page.mouse.down();
  await page.mouse.move(drag.x, drag.end, { steps: 12 }); await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('.conversation-content').scrollTop > 40);
  drag.scrollTop = await page.locator('.conversation-content').evaluate(node => node.scrollTop);
  await action('read-start').click();
  await page.waitForFunction(() => document.querySelector('.conversation-content').scrollTop < 1);
  await page.locator('.message.assistant').first().evaluate(node => {
    const content = document.querySelector('.conversation-content'), header = document.querySelector('#threadHeader');
    content.scrollTop += node.getBoundingClientRect().top - header.getBoundingClientRect().top + 40;
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const region = await page.evaluate(() => {
    const header = document.querySelector('#threadHeader'), message = document.querySelector('.message.assistant');
    const rect = header.getBoundingClientRect(), card = message.getBoundingClientRect();
    const left = Math.max(rect.left + 12, card.left + 12), right = Math.min(rect.right - 12, card.right - 12);
    return { selector: '#threadHeader', header: rect.toJSON(), card: card.toJSON(), scrollTop: document.querySelector('.conversation-content').scrollTop, clip: { x: Math.ceil(left), y: Math.ceil(rect.top + 12), width: Math.floor(right - left), height: Math.floor(rect.height - 24) } };
  });
  assert.ok(region.card.top < region.header.top && region.card.bottom > region.header.bottom, 'Real assistant message visibly intersects entire header height');
  assert.ok(Math.abs(region.header.top - initial.header.top) < 1, 'Header stays fixed while conversation scrolls beneath it');
  const label = `overlay-${mode}-${viewport.width}x${viewport.height}`;
  await settledScreenshot({ path: path.join(evidence, `${label}-actual-ui.png`) });
  const inkMask = await page.addStyleTag({ content: '#threadHeader, #threadHeader * { color:transparent!important; text-shadow:none!important; text-decoration-color:transparent!important } #threadHeader svg { visibility:hidden!important }' });
  const contrastBackground = await settledScreenshot({ clip: region.clip });
  await inkMask.evaluate(node => node.remove());
  const mask = await page.addStyleTag({ content: '#threadHeader > * { visibility:hidden!important }' });
  try {
    const blurred = await settledScreenshot({ clip: region.clip });
    const hide = await page.addStyleTag({ content: '.conversation-content > .message { visibility:hidden!important }' });
    const hidden = await settledScreenshot({ clip: region.clip });
    await hide.evaluate(node => node.remove());
    const disable = await page.addStyleTag({ content: '#threadHeader::before { backdrop-filter:none!important; -webkit-backdrop-filter:none!important }' });
    const unblurred = await settledScreenshot({ clip: region.clip });
    await disable.evaluate(node => node.remove());
    const referenceStyle = await page.addStyleTag({ content: '#threadHeader::before { background:none!important; backdrop-filter:none!important; -webkit-backdrop-filter:none!important; box-shadow:none!important }' });
    const reference = await settledScreenshot({ clip: region.clip });
    const hideReference = await page.addStyleTag({ content: '.conversation-content > .message { visibility:hidden!important }' });
    const referenceHidden = await settledScreenshot({ clip: region.clip });
    await hideReference.evaluate(node => node.remove());
    await referenceStyle.evaluate(node => node.remove());
    const contrast = await textContrast(region, contrastBackground, false);
    await page.locator('.conversation-content').evaluate(node => { node.scrollTop += 73; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.ok(Math.abs((await page.locator('#threadHeader').boundingBox()).y - initial.header.top) < 1, 'Header remains fixed after another conversation scroll');
    const moved = await settledScreenshot({ clip: region.clip });
    const pixels = await pixelComparison([blurred, hidden, unblurred, moved, reference, referenceHidden]);
    const result = { mode, viewport, initial, nativeScrollbarDrag: drag, region, contentContribution: pixels.waveContribution, blurContribution: pixels.blurContribution, scrollChange: pixels.frameChange, visibleContent: { ...pixels.visibleGlass, reference: 'Same actual conversation scroll position with only header tint, blur and inset shadow removed; message-hidden reference subtracts the remaining background.' }, contrast };
    overlayMeasurements.push(result);
    for (const [name, bytes] of [['content-blurred', blurred], ['content-hidden', hidden], ['content-unblurred', unblurred], ['content-reference', reference], ['content-scrolled', moved], ['contrast-background', contrastBackground]]) await fs.writeFile(path.join(evidence, `${label}-${name}.png`), bytes);
    assert.ok(result.contentContribution.mean >= 1 && result.contentContribution.changed >= .1, `${label}: actual conversation content is visible through header: ${JSON.stringify(result.contentContribution)}`);
    assert.ok(result.blurContribution.mean >= .75, `${label}: actual conversation text behind header is blurred: ${JSON.stringify(result.blurContribution)}`);
    assert.ok(result.scrollChange.mean >= 1, `${label}: scrolling content visibly moves behind fixed header: ${JSON.stringify(result.scrollChange)}`);
    assert.ok(result.visibleContent.coarseShapeCorrelation >= .70 && result.visibleContent.retainedCoarseContrast >= .50, `${label}: large content shapes remain recognizable through header: ${JSON.stringify(result.visibleContent)}`);
    assert.ok(result.visibleContent.normalizedEdgeRatio <= .80, `${label}: underlying text edges are visibly softened: ${JSON.stringify(result.visibleContent)}`);
    for (const text of contrast) {
      if (!text.samples) continue; // The crop intentionally covers the message/header intersection only.
      if (text.minimum < text.required) contrastFailures.push(`${label} ${text.selector}: sharp header text remains readable over blurred conversation (${text.minimum.toFixed(2)} < ${text.required})`);
    }
  } finally {
    await mask.evaluate(node => node.remove());
    await action('read-start').click();
  }
}
try {
  await page.goto(pathToFileURL(filename).href);
  await page.locator('.message.thinking').first().waitFor();
  await check('Platinum Plus is between Platinum and Professional; Professional preview cancels cleanly and keeps the original wave switch', async () => {
    const original = await page.locator('html').getAttribute('data-ui-palette');
    await settings();
    const options = await page.locator('#prefUiPalette option').evaluateAll(nodes => nodes.map(node => ({ value: node.value, label: node.textContent })));
    assert.deepEqual(options.slice(options.findIndex(option => option.value === 'platinum') + 1, options.findIndex(option => option.value === 'platinum') + 3), [{ value: 'platinum-plus', label: 'Platinum Plus' }, { value: 'professional', label: 'Professional' }]);
    assert.equal(await page.locator('#prefWaveVideoBackground').getAttribute('role'), 'switch');
    assert.equal(await page.locator('.wave-background-setting:has(#prefWaveVideoBackground)').isVisible(), true);
    await page.selectOption('#prefUiPalette', 'professional');
    assert.equal(await page.locator('html').getAttribute('data-ui-palette'), 'professional');
    await page.locator('.modal-header [data-action="modal-close"]').click();
    assert.equal(await page.locator('html').getAttribute('data-ui-palette'), original);
  });
  await check('Professional preserves original messages and independent code colors when saved', async () => {
    await settings(); await page.selectOption('#prefCodeTheme', 'ayu'); await save();
    const beforeSource = await source(), beforeCode = await codeStyle();
    await settings(); await page.selectOption('#prefUiPalette', 'professional'); await save();
    assert.deepEqual(await source(), beforeSource);
    assert.deepEqual(await codeStyle(), beforeCode);
    const bootstrap = await page.evaluate(() => window.desktop.invoke('bootstrap'));
    assert.equal(bootstrap.settings.uiPalette, 'professional');
    assert.equal(bootstrap.settings.codeTheme, 'ayu');
  });
  await check('Header and Thinking retain sharp controls and transmit visible real-wave shapes in light/dark at all sizes', async () => {
    await settings(); await page.locator('#prefWaveVideoBackground').check(); await save();
    for (const mode of ['dark', 'light']) {
      await settings(); await page.selectOption('#prefTheme', mode); await save(); await videoReady(mode);
      await setThinking(true);
      for (const [width, height] of [[1440, 1000], [1794, 934], [1435, 747], [800, 600], [680, 540], [1600, 600], [680, 1000]]) {
        await page.setViewportSize({ width, height });
        const value = await material(); measurements.push(value); assert.equal(value.mode, mode); glass(value);
        assert.equal(await page.locator('.threadshelf-wave-video').count(), 1);
      }
      // The third viewport reproduces the reported 1794x934 client area at
      // 125% desktop scaling rather than treating physical pixels as CSS px.
      for (const [width, height] of [[1440, 1000], [1794, 934], [1435, 747]]) {
        await page.setViewportSize({ width, height });
        for (const expanded of [true, false]) {
          await wavePixelProbe(mode, expanded);
          glass(await material());
          await settledScreenshot({ path: path.join(evidence, `professional-${mode}-${expanded ? 'expanded' : 'collapsed'}-${width}x${height}.png`) });
        }
      }
    }
    assert.deepEqual(contrastFailures, [], 'All sampled text remains readable over the actual decoded wave');
  });
  await check('Professional header overlays and visibly blurs real conversation content with waves disabled', async () => {
    for (const mode of ['dark', 'light']) for (const viewport of [{ width: 1440, height: 1000 }, { width: 1435, height: 747 }]) await headerOverlayProbe(mode, viewport);
    assert.deepEqual(contrastFailures, [], 'Header text remains readable over actual blurred conversation in every tested mode and viewport');
    const insetBeforeFind = await page.locator('.content-pane').evaluate(node => parseFloat(getComputedStyle(node).getPropertyValue('--professional-thread-overlay-height')));
    await action('find-open').click();
    await page.waitForFunction(previous => parseFloat(getComputedStyle(document.querySelector('.content-pane')).getPropertyValue('--professional-thread-overlay-height')) > previous + 10, insetBeforeFind);
    await page.locator('#readerFindInput').fill('conversation');
    await page.waitForFunction(() => {
      const mark = document.querySelector('.highlight.current'), search = document.querySelector('#readerSearch'), reader = document.querySelector('.conversation-content');
      if (!mark) return false;
      const rect = mark.getBoundingClientRect();
      return rect.top >= search.getBoundingClientRect().bottom && rect.bottom <= reader.getBoundingClientRect().bottom;
    });
    await action('find-close').click();
    await page.waitForFunction(previous => Math.abs(parseFloat(getComputedStyle(document.querySelector('.content-pane')).getPropertyValue('--professional-thread-overlay-height')) - previous) < 1, insetBeforeFind);
    await action('read-start').click();
  });
  await check('Wave off retains readable materials; live palette previews and cancel restore the original one-video layout', async () => {
    await settings(); await page.locator('#prefWaveVideoBackground').uncheck(); await save(); await noVideo();
    for (const mode of ['light', 'dark']) {
      await settings(); await page.selectOption('#prefTheme', mode); await save();
      for (const expanded of [true, false]) {
        await setThinking(expanded); glass(await material());
        await settledScreenshot({ path: path.join(evidence, `professional-${mode}-wave-off-${expanded ? 'expanded' : 'collapsed'}.png`) });
      }
    }
    await settings(); await page.locator('#prefWaveVideoBackground').check(); await save(); await videoReady('dark');
    await settings(); await page.selectOption('#prefUiPalette', 'platinum');
    assert.equal(await page.locator('html').getAttribute('data-ui-palette'), 'platinum');
    assert.equal(await page.locator('.threadshelf-wave-video').count(), 1);
    assert.equal(await page.locator('#readerHost > .threadshelf-wave-video').count(), 1, 'Existing palette keeps its previous wave container');
    await cancel(); await videoReady('dark'); glass(await material());
    assert.equal(await page.locator('.content-pane > .threadshelf-wave-video').count(), 1, 'Cancel restores Professional shared pane background');
    await settings(); await page.selectOption('#prefUiPalette', 'platinum'); await save(); await videoReady('dark');
    assert.equal(await page.locator('#readerHost > .threadshelf-wave-video').count(), 1);
    await settings(); await page.selectOption('#prefUiPalette', 'professional'); await save(); await videoReady('dark');
    assert.equal(await page.locator('.content-pane > .threadshelf-wave-video').count(), 1); glass(await material());
  });
  await check('Close returns to welcome and retains the existing master/welcome video gates', async () => {
    const title = await page.locator('#threadHeader h1').textContent();
    const close = action('close-thread'); assert.ok(await close.getAttribute('aria-label'));
    await close.focus(); await page.keyboard.press('Enter'); await page.locator('#readerHost .welcome').waitFor();
    assert.equal(await page.locator('#threadHeader').isVisible(), false); await noVideo();
    assert.equal(await page.locator('#readerHost .welcome h1').evaluate(node => node === document.activeElement), true);
    await settings(); await page.locator('#prefWaveVideoWelcome').check(); await save(); await videoReady('dark');
    assert.equal(await page.locator('#readerHost > .threadshelf-wave-video').count(), 1, 'Welcome wave remains in the welcome reader');
    await settings(); await page.locator('#prefWaveVideoBackground').uncheck(); await save(); await noVideo();
    await settings(); await page.locator('#prefWaveVideoBackground').check(); await save(); await videoReady('dark');
    await page.locator('.conversation-row').filter({ hasText: title }).first().click(); await page.locator('.message.thinking').first().waitFor(); await videoReady('dark');
    assert.equal(await page.locator('.content-pane > .threadshelf-wave-video').count(), 1); glass(await material());
  });
  await check('Accessibility modes retain readable material fallbacks and suppress video for reduced motion', async () => {
    await settings(); await page.locator('#prefContrast').check(); await save();
    let value = await material(); assert.equal(value.headingLayer.content, 'none'); assert.equal(value.headingLayer.blur, 'none'); assert.equal(value.thinkingLayer.content, 'none'); assert.equal(value.thinkingLayer.blur, 'none');
    await settings(); await page.locator('#prefContrast').uncheck(); await save();
    await page.emulateMedia({ forcedColors: 'active' });
    value = await material(); assert.equal(value.headingLayer.content, 'none'); assert.equal(value.headingLayer.blur, 'none'); assert.equal(value.thinkingLayer.content, 'none'); assert.equal(value.thinkingLayer.blur, 'none'); assert.notEqual(value.thinking.color, 'rgba(0, 0, 0, 0)');
    await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' });
    await noVideo(); value = await material(); glass(value);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches), true);
    value = await material(); assert.equal(value.headingLayer.content, 'none'); assert.equal(value.headingLayer.blur, 'none'); assert.equal(value.thinkingLayer.content, 'none'); assert.equal(value.thinkingLayer.blur, 'none');
    await cdp.send('Emulation.setEmulatedMedia', { features: [] }); await cdp.detach();
    await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
  });
  await check('System appearance follows the OS while preserving Professional', async () => {
    await settings(); await page.selectOption('#prefTheme', 'system'); await save();
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme });
      await page.waitForFunction(mode => document.documentElement.dataset.theme === mode, colorScheme);
      assert.equal(await page.locator('html').getAttribute('data-ui-palette'), 'professional');
    }
  });
  await check('Activity chart ancestors retain viewport coordinates for tooltips and unchanged interaction', async () => {
    await action('workspace-analytics').click();
    await noVideo();
    await page.waitForFunction(() => document.querySelector('#analyticsWorkspace')?.getAttribute('aria-busy') === 'false' && document.querySelector('.analytics-stats'));
    await page.locator('[data-activity-action="tab"][data-tab="graphs"]').click();
    await page.locator('.vertical-bars').first().waitFor();
    const unsafe = await page.locator('.vertical-bars').first().evaluate(node => {
      const result = [];
      for (let current = node; current; current = current.parentElement) { const style = getComputedStyle(current); if (style.filter !== 'none' || style.backdropFilter !== 'none' || style.transform !== 'none') result.push(current.className || current.tagName); }
      return result;
    });
    assert.deepEqual(unsafe, []);
    const rows = page.locator('.vertical-bars').first().locator(':scope>div');
    await rows.nth(1).hover();
    const opacity = await rows.evaluateAll(nodes => nodes.map(row => getComputedStyle(row.querySelector(':scope>div>span')).opacity));
    assert.equal(opacity[1], '1'); assert.ok(opacity.filter((_, index) => index !== 1).every(value => value === '0.67'));
  });
  assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(requests, []);
  await fs.writeFile(path.join(evidence, 'professional.json'), JSON.stringify({ passed: true, version, revision: 6, previewSha256, engine: browser.version(), checks, measurements, overlayMeasurements, videoChecks, errors, consoleErrors, requests }, null, 2) + '\n');
  console.log('Professional acceptance evidence:', evidence);
} catch (error) {
  await fs.writeFile(path.join(evidence, 'professional.json'), JSON.stringify({ passed: false, version, revision: 6, previewSha256, engine: browser.version(), error: error.stack, checks, measurements, overlayMeasurements, videoChecks, errors, consoleErrors, requests }, null, 2) + '\n');
  throw error;
} finally {
  await browser.close();
  if (electronHarness) await fs.rm(electronHarness, { recursive: true, force: true });
}
