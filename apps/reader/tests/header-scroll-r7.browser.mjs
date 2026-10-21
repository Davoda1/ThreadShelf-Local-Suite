#!/usr/bin/env node
// Focused Professional header scroll regression. Run against any preview with
// READER_PREVIEW_FILE; set READER_EXPECTED_HEADER_BLUR=10 for the R6 baseline.
// READER_ELECTRON (with DISPLAY) or READER_CHROMIUM selects the tested engine.
// READER_EVIDENCE controls output. READER_SCROLL_CASES can restrict diagnostics,
// e.g. dark-waves-1440x1000. The full acceptance run leaves it unset (8 cases).
// This harness uses software ANGLE, matching the existing browser harness. It
// cannot prove absence of a Windows display-driver-specific rendering defect.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { releaseFilename } from '../scripts/release-filenames.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const filename = process.env.READER_PREVIEW_FILE || path.join(root, 'release', releaseFilename(`ThreadShelf-Local-Reader-${version}-Preview.html`));
const expectedBlur = Number(process.env.READER_EXPECTED_HEADER_BLUR || 12);
const evidence = path.resolve(process.env.READER_EVIDENCE || await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-header-r7-')));
await fs.mkdir(evidence, { recursive: true });
const { chromium, _electron } = await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE || 'playwright');
const flags = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
let browser, page, engine;
if (process.env.READER_ELECTRON) {
  const harness = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-scroll-electron-'));
  const main = path.join(harness, 'main.cjs');
  await fs.writeFile(main, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(harness, 'profile'))});app.whenReady().then(()=>{const w=new BrowserWindow({width:1440,height:1000,useContentSize:true,show:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});w.setMenu(null);w.loadURL('about:blank');});`);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: process.env.READER_ELECTRON, args: [...flags, main], env, timeout: 45000 });
  const versions = await app.evaluate(() => process.versions);
  engine = { electron: versions.electron, chromium: versions.chrome, node: versions.node };
  browser = { close: () => app.close() }; page = await app.firstWindow();
} else {
  browser = await chromium.launch({ headless: true, executablePath: process.env.READER_CHROMIUM, args: flags });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  engine = { chromium: browser.version() };
}
const failures = [], errors = [], requests = [], cases = [];
page.on('pageerror', error => errors.push(error.message));
await page.route(/^https?:/, route => { requests.push(route.request().url()); return route.abort(); });
const session = await page.context().newCDPSession(page);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const paint = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const action = name => page.locator(`[data-action="${name}"]`);
const selectedCases = new Set((process.env.READER_SCROLL_CASES || '').split(',').filter(Boolean));
const record = (condition, message) => { if (!condition) failures.push(message); };

async function configure(mode, waves, viewport) {
  await page.setViewportSize(viewport);
  await action('settings').click();
  await page.locator('[data-action="settings-tab"][data-tab="appearance"]').click();
  await page.selectOption('#prefUiPalette', 'professional');
  await page.selectOption('#prefTheme', mode);
  await page.locator('#prefWaveVideoBackground').setChecked(waves);
  await page.locator('#settingsForm button[type="submit"]').click();
  await page.locator('#settingsForm').waitFor({ state: 'detached' });
  if (waves) await page.waitForFunction(() => {
    const video = document.querySelector('.threadshelf-wave-video');
    return video && video.readyState >= 2 && video.videoWidth > 0 && !video.paused && !video.error;
  }, null, { timeout: 30000 });
  else await page.waitForFunction(() => !document.querySelector('.threadshelf-wave-video'));
  await paint();
}
async function headerState() {
  return page.evaluate(() => {
    const header = document.querySelector('#threadHeader'), content = document.querySelector('.conversation-content');
    const style = getComputedStyle(header, '::before'), rect = header.getBoundingClientRect();
    return { time: Date.now(), scrollTop: content.scrollTop, scrollMaximum: content.scrollHeight - content.clientHeight,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, blur: style.backdropFilter,
      transform: style.transform, opacity: style.opacity, content: style.content,
      ownerFilter: getComputedStyle(header).filter, ownerBackdrop: getComputedStyle(header).backdropFilter,
      overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight };
  });
}

async function captureScroll(label, clip) {
  const frames = [];
  let ackFailure;
  const receive = event => {
    frames.push({ image: event.data, metadata: event.metadata });
    session.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(error => { ackFailure = error.message; });
  };
  const before = await headerState();
  await page.evaluate(() => {
    window.__headerScrollSamples = []; window.__headerScrollSampling = true;
    const sample = () => {
      if (!window.__headerScrollSampling) return;
      const header = document.querySelector('#threadHeader'), rect = header.getBoundingClientRect();
      const style = getComputedStyle(header, '::before');
      window.__headerScrollSamples.push({ time: Date.now(), scrollTop: document.querySelector('.conversation-content').scrollTop,
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        blur: style.backdropFilter, opacity: style.opacity, content: style.content });
      requestAnimationFrame(sample);
    }; requestAnimationFrame(sample);
  });
  session.on('Page.screencastFrame', receive);
  await session.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  try {
    const rect = await page.locator('.conversation-content').boundingBox();
    await page.mouse.move(rect.x + rect.width * .55, Math.max(rect.y + rect.height * .7, before.rect.y + before.rect.height + 20));
    // Real wheel input exercises compositor scrolling. A later native smooth
    // scroll exercises multiple animation frames without JS assigning scrollTop.
    for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, i < 6 ? 72 : -40); await wait(65); }
    await page.locator('.conversation-content').evaluate(node => node.scrollBy({ top: 500, behavior: 'smooth' }));
    await wait(700);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -64); await wait(45); }
    await wait(150);
  } finally {
    await session.send('Page.stopScreencast');
    session.off('Page.screencastFrame', receive);
    await page.evaluate(() => { window.__headerScrollSampling = false; });
  }
  const samples = await page.evaluate(() => window.__headerScrollSamples);
  const after = await headerState();
  const folder = path.join(evidence, label); await fs.mkdir(folder, { recursive: true });
  const metrics = [];
  for (const [index, frame] of frames.entries()) {
    const analyzed = await analyze(frame.image, clip);
    const file = `frame-${String(index).padStart(4, '0')}.png`;
    await fs.writeFile(path.join(folder, file), Buffer.from(analyzed.png, 'base64'));
    const timestamp = Number(frame.metadata.timestamp) * 1000;
    const sample = samples.reduce((best, value) => !best || Math.abs(value.time - timestamp) < Math.abs(best.time - timestamp) ? value : best, null);
    metrics.push({ file, timestamp, nearestLayoutSample: sample, ...analyzed.metrics });
    // Keep a few full frames for visual context; all header crops are retained.
    if (index === 0 || index === Math.floor(frames.length / 2) || index === frames.length - 1)
      await fs.writeFile(path.join(folder, `context-${String(index).padStart(4, '0')}.png`), Buffer.from(frame.image, 'base64'));
  }
  const distances = samples.map(sample => Math.max(...['x', 'y', 'width', 'height'].map(key => Math.abs(sample[key] - before.rect[key]))));
  const scrollValues = samples.map(sample => sample.scrollTop);
  const geometry = { maxRectDrift: Math.max(0, ...distances), uniqueFilters: [...new Set(samples.map(s => s.blur))],
    scrollTravel: Math.max(...scrollValues) - Math.min(...scrollValues), sampleCount: samples.length };
  record(!ackFailure, `${label}: screencast acknowledgement failed: ${ackFailure}`);
  record(frames.length >= 8, `${label}: fewer than 8 compositor frames captured (${frames.length})`);
  record(geometry.scrollTravel >= 150, `${label}: insufficient actual scroll travel (${geometry.scrollTravel})`);
  record(geometry.maxRectDrift < .1, `${label}: header geometry changed during scrolling (${geometry.maxRectDrift}px)`);
  record(geometry.uniqueFilters.length === 1 && geometry.uniqueFilters[0] === `blur(${expectedBlur}px)`, `${label}: unexpected/changing header filter ${geometry.uniqueFilters}`);
  record(samples.every(s => s.opacity === '1' && s.content !== 'none'), `${label}: decorative header visibility changed during scroll`);
  return { label, clip, before, after, geometry, frames: metrics, samples, ackFailure };
}

// Pixel analysis happens after scrolling, so image decoding cannot stall the
// measured scrolling interval. References are exact same-geometry PNG crops.
async function analyze(base64, clip, references = {}) {
  return page.evaluate(async ({ base64, clip, references }) => {
    const decode = async value => { const image = new Image(); image.src = 'data:image/png;base64,' + value; await image.decode(); return image; };
    const image = await decode(base64), canvas = document.createElement('canvas');
    canvas.width = clip.width; canvas.height = clip.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, clip.x, clip.y, clip.width, clip.height, 0, 0, clip.width, clip.height);
    const pixels = ctx.getImageData(0, 0, clip.width, clip.height).data;
    const lum = []; let sum = 0, edge = 0, edges = 0;
    for (let y = 0; y < clip.height; y++) for (let x = 0; x < clip.width; x++) {
      const index = y * clip.width + x, p = index * 4;
      const value = pixels[p] * .2126 + pixels[p + 1] * .7152 + pixels[p + 2] * .0722;
      lum.push(value); sum += value;
      if (x) { edge += (value - lum[index - 1]) ** 2; edges++; }
    }
    const mean = sum / lum.length, std = Math.sqrt(lum.reduce((total, value) => total + (value - mean) ** 2, 0) / lum.length);
    const distances = {};
    for (const [name, encoded] of Object.entries(references)) {
      const other = await decode(encoded), referenceCanvas = document.createElement('canvas'); referenceCanvas.width = clip.width; referenceCanvas.height = clip.height;
      const referenceCtx = referenceCanvas.getContext('2d', { willReadFrequently: true }); referenceCtx.drawImage(other, 0, 0);
      const referencePixels = referenceCtx.getImageData(0, 0, clip.width, clip.height).data;
      let absolute = 0, changed = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const difference = (Math.abs(pixels[i] - referencePixels[i]) + Math.abs(pixels[i + 1] - referencePixels[i + 1]) + Math.abs(pixels[i + 2] - referencePixels[i + 2])) / 3;
        absolute += difference; if (difference > 8) changed++;
      }
      distances[name] = { mae: absolute / lum.length, fractionChangedOver8: changed / lum.length };
    }
    return { png: canvas.toDataURL('image/png').split(',')[1], metrics: { mean, std, horizontalEdgeRms: Math.sqrt(edge / edges), distances } };
  }, { base64, clip, references });
}

async function calibration(label) {
  // An opaque, vertically invariant striped diagnostic message makes expected
  // header pixels constant under vertical scrolling. This permits a defensible
  // dropout detector; ordinary moving conversation text cannot have that oracle.
  // This test-only DOM is removed below and never enters the shipped preview.
  await page.evaluate(() => {
    const content = document.querySelector('.conversation-content');
    const probe = document.createElement('article'); probe.id = 'r7-scroll-calibration'; probe.className = 'message assistant';
    probe.setAttribute('aria-hidden', 'true');
    Object.assign(probe.style, { height: '7000px', minHeight: '7000px', padding: '0', border: '0', borderRadius: '0',
      background: 'repeating-linear-gradient(90deg,#162435 0 24px,#d8f0ff 24px 48px,#8f4050 48px 72px,#e5ba55 72px 96px)' });
    content.append(probe);
    const style = document.createElement('style'); style.id = 'r7-calibration-mask';
    style.textContent = '#threadHeader > *{visibility:hidden!important} #r7-scroll-calibration::before{content:none!important}'; document.head.append(style);
  });
  // Let the reader's normal layout/anchor observer consume the new message
  // before navigation; otherwise it correctly restores the previous anchor.
  await paint(); await wait(100);
  await page.locator('.conversation-content').evaluate(content => {
    content.dispatchEvent(new WheelEvent('wheel', { deltaY: 1 }));
    const probe = document.querySelector('#r7-scroll-calibration');
    content.scrollTop += probe.getBoundingClientRect().top - content.getBoundingClientRect().top + 300;
  });
  await paint();
  const clip = await page.evaluate(() => {
    const header = document.querySelector('#threadHeader').getBoundingClientRect(), probe = document.querySelector('#r7-scroll-calibration').getBoundingClientRect();
    if (probe.top > header.top - 50 || probe.bottom < header.bottom + 1000) throw new Error('Calibration message does not cover the header backdrop throughout the intended scroll range');
    const left = Math.ceil(Math.max(header.left + 24, probe.left + 30)), right = Math.floor(Math.min(header.right - 24, probe.right - 30));
    return { x: left, y: Math.ceil(header.top + 24), width: right - left, height: Math.floor(header.height - 48) };
  });
  assert.ok(clip.width >= 64 && clip.height >= 30, `${label}: diagnostic crop is too small`);
  const getReference = async name => {
    // Force a real content scroll and repaint after the comparison-style change.
    await page.locator('.conversation-content').evaluate(node => { node.scrollTop += 1; }); await paint();
    await page.locator('.conversation-content').evaluate(node => { node.scrollTop -= 1; }); await paint();
    const png = await page.screenshot({ clip }); await fs.writeFile(path.join(evidence, `${label}-${name}.png`), png); return png.toString('base64');
  };
  try {
    const blurred = await getReference('reference-blurred');
    const sharpStyle = await page.addStyleTag({ content: '#threadHeader::before{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' });
    const sharp = await getReference('reference-sharp'); await sharpStyle.evaluate(node => node.remove());
    const opaqueStyle = await page.addStyleTag({ content: '#threadHeader::before{background:var(--surface)!important}' });
    const opaque = await getReference('reference-opaque'); await opaqueStyle.evaluate(node => node.remove());
    const repeated = await getReference('reference-repeated');
    const localClip = { x: 0, y: 0, width: clip.width, height: clip.height };
    const reference = (await analyze(blurred, localClip, { sharp, opaque, repeated })).metrics;
    record(reference.distances.sharp.mae > 2, `${label}: calibration cannot distinguish blur from unfiltered pixels`);
    record(reference.distances.opaque.mae > 5, `${label}: underlying pattern does not visibly transmit through the header`);
    record(reference.distances.repeated.mae < 1.5, `${label}: settled calibration references are not reproducible`);
    const capture = await captureScroll(`${label}-calibrated`, clip);
    const threshold = Math.max(2.5, reference.distances.repeated.mae * 5);
    const flagged = [];
    for (const frame of capture.frames) {
      const png = (await fs.readFile(path.join(evidence, capture.label, frame.file))).toString('base64');
      const analysis = (await analyze(png, localClip, { blurred, sharp, opaque })).metrics;
      Object.assign(frame, analysis);
      const difference = analysis.distances.blurred;
      // Requires a substantial changed area as well as mean pixel error, so a
      // tiny rounding seam cannot be mislabeled a surface-wide flicker.
      const anomaly = difference.mae > threshold && difference.fractionChangedOver8 > .15;
      if (anomaly) flagged.push({ file: frame.file, ...analysis,
        type: analysis.distances.sharp.mae < difference.mae ? 'closer-to-unfiltered' : analysis.distances.opaque.mae < difference.mae ? 'closer-to-opaque' : analysis.std < 2 ? 'near-flat-or-blank' : 'unexpected-backdrop-change' });
    }
    record(flagged.length === 0, `${label}: ${flagged.length} invariant-backdrop compositor frames exceeded calibrated dropout threshold`);
    return { description: 'Test-only vertically invariant striped message; original header material and geometry. All image analysis runs after capture.',
      reference, threshold: { mae: threshold, fractionChangedOver8: .15 }, flagged, ...capture };
  } finally {
    await page.evaluate(() => { document.querySelector('#r7-scroll-calibration')?.remove(); document.querySelector('#r7-calibration-mask')?.remove(); document.querySelector('.conversation-content').scrollTop = 0; });
    await paint();
  }
}

try {
  await page.goto(pathToFileURL(filename).href);
  await page.locator('.message.thinking').first().waitFor({ timeout: 45000 });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 680, height: 540 }]) for (const mode of ['dark', 'light']) for (const waves of [false, true]) {
    const label = `${mode}-${waves ? 'waves' : 'plain'}-${viewport.width}x${viewport.height}`;
    if (selectedCases.size && !selectedCases.has(label)) continue;
    console.log('START', label);
    await configure(mode, waves, viewport);
    await action('read-start').click(); await paint();
    await page.locator('.conversation-content').evaluate(node => { node.scrollTop = Math.min(300, (node.scrollHeight - node.clientHeight) / 4); }); await paint();
    const state = await headerState();
    record(state.ownerFilter === 'none' && state.ownerBackdrop === 'none', `${label}: header controls themselves are filtered`);
    record(!state.overflow, `${label}: unexpected global page overflow`);
    const clip = { x: Math.ceil(state.rect.x + 4), y: Math.ceil(state.rect.y + 4), width: Math.floor(state.rect.width - 8), height: Math.floor(state.rect.height - 8) };
    const actual = await captureScroll(`${label}-actual`, clip);
    // Actual content changes naturally while scrolling. These crops and pixel
    // summaries are visual evidence, not a false exact-pixel flicker assertion.
    let pausedVideo;
    if (waves) pausedVideo = await page.locator('.threadshelf-wave-video').evaluate(video => { video.pause(); return { time: video.currentTime, frames: video.getVideoPlaybackQuality().totalVideoFrames }; });
    const calibrated = await calibration(label);
    if (waves) await page.locator('.threadshelf-wave-video').evaluate(video => video.play());
    cases.push({ label, mode, waves, viewport, actual, pausedVideo, calibrated });
    console.log('RECORDED', label, 'actual frames', actual.frames.length, 'calibrated frames', calibrated.frames.length, 'anomalies', calibrated.flagged.length);
  }
  record(cases.length === (selectedCases.size || 8), 'Not every requested test case completed');
  record(errors.length === 0, `Page errors: ${errors.join('; ')}`);
  record(requests.length === 0, `Unexpected external requests: ${requests.join('; ')}`);
} catch (error) {
  failures.push(error.stack || String(error));
} finally {
  const report = { passed: failures.length === 0, version, revision: 7, preview: filename,
    previewSha256: createHash('sha256').update(await fs.readFile(filename)).digest('hex'), expectedBlur, engine,
    compositor: 'ANGLE SwiftShader software renderer',
    limitations: ['CDP screencast reports delivered compositor frames; it is not a lossless monitor capture and may omit frames.',
      'Software compositing cannot certify Windows/macOS/Linux hardware driver behavior.',
      'Actual-content crops require visual review; only the vertically invariant diagnostic has a fixed-pixel dropout oracle.',
      'The diagnostic fixture is temporary test DOM, not user content or a production change.'],
    cases, errors, requests, failures };
  await fs.writeFile(path.join(evidence, 'header-scroll-r7.json'), JSON.stringify(report, null, 2) + '\n');
  await session.detach().catch(() => {}); await browser.close();
}
assert.deepEqual(failures, [], `Header scroll verification failed. Evidence: ${evidence}`);
console.log('Header scroll evidence:', evidence);
