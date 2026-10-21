import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const { chromium } = await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE || 'playwright');
const tmp = await mkdtemp(path.join(os.tmpdir(), 'reader-rich-layout-r5-'));
await build({ stdin: { contents: 'import {ConversationRenderer} from "./src/reader/renderer.js"; window.ConversationRenderer=ConversationRenderer;', resolveDir: root }, outfile: path.join(tmp, 'renderer.js'), bundle: true, format: 'iife', platform: 'browser', logLevel: 'silent' });
const browser = await chromium.launch({ headless: true, ...(process.env.READER_CHROMIUM ? { executablePath: process.env.READER_CHROMIUM } : {}), args: ['--no-sandbox'] });
// Synthetic data uses the source structure of an archived weighted allocation,
// plus the previous single-fill shape. No private archive content is bundled.
const allocation = '<box background="surface-tertiary" radius="full" height="14px" direction="row" clip><box background="#4788C7" flex={120}/><box background="#A4AAB5" flex={24}/></box>';
const bar = background => `<box width="100%" height="12px" background="surface-tertiary" radius="full" clip><box width="71%" height="12px" background="${background}"/></box>`;
const source = `<box gap={2}>${allocation}<row justify="between"><row align="center" gap={1}><box background="#4788C7" size="9px" radius="2xs"/><caption>Primary allocation (83.3%)</caption></row><row align="center" gap={1}><box background="#A4AAB5" size="9px" radius="2xs"/><caption>Remaining allocation (16.7%)</caption></row></row>${bar('surface-secondary')}${bar('info')}${bar('#ef3456')}</box>`;
const image = width => `<row align="center" gap={3}><AsyncImage query="Synthetic product illustration" aspectRatio="5:4" maxWidth="${width}px"/><box flex="1" gap={1}>**Synthetic product**<text color="secondary" size="sm">A compact description which stays beside the image when space permits.</text></box></row>`;
const cases = [];
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.setContent('<main class="reader-view" id="host"></main>');
  for (const file of ['src/ui/style.css', 'src/ui/themes.css', 'src/reader/reader.css', 'src/reader/rich-layout.css']) await page.addStyleTag({ path: path.join(root, file) });
  await page.addStyleTag({ content: '#host{padding:16px;max-width:960px;margin:auto}.message-content{min-width:0}.fixture{margin-block:20px}' });
  await page.addScriptTag({ path: path.join(tmp, 'renderer.js') });
  await page.evaluate(({ source, images }) => {
    const host = document.getElementById('host'), renderer = new ConversationRenderer(host);
    host.innerHTML = `<section id="allocation" class="fixture message-content">${renderer.processMessageContent(source)}</section>` + images.map((text, i) => `<section id="image${i}" class="fixture message-content">${renderer.processMessageContent(text)}</section>`).join('');
  }, { source, images: [image(172), image(148), '<AsyncImage query="Synthetic wide illustration" width="100%" aspectRatio="16:9"/>'] });
  for (const width of [1100, 680, 380]) for (const mode of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 540 });
    await page.evaluate(mode => { document.documentElement.dataset.uiPalette = 'platinum'; document.documentElement.dataset.theme = mode; }, mode);
    const result = await page.evaluate(() => {
      const track = document.querySelector('.rich-allocation-track');
      const rect = track.getBoundingClientRect();
      return {
        track: { width: rect.width, height: rect.height },
        segments: [...track.children].map(segment => {
          const r = segment.getBoundingClientRect();
          return { ratio: r.width / rect.width, height: r.height, top: r.top - rect.top, color: getComputedStyle(segment).backgroundColor };
        }),
        progress: [...document.querySelectorAll('.rich-progress-track')].map(track => {
          const fill = track.querySelector('.rich-progress-fill');
          return { ratio: fill.getBoundingClientRect().width / track.clientWidth, height: fill.getBoundingClientRect().height, color: getComputedStyle(fill).backgroundColor, track: getComputedStyle(track).backgroundColor };
        }),
        images: [...document.querySelectorAll('.rich-image-placeholder')].map(image => {
          const r = image.getBoundingClientRect(), text = image.nextElementSibling?.getBoundingClientRect();
          return { width: r.width, ratio: r.width / r.height, beside: !text || text.left >= r.right, icon: !!image.querySelector('.rich-image-placeholder-icon'), overflow: image.scrollWidth > image.clientWidth };
        }),
        overflow: document.documentElement.scrollWidth > innerWidth,
        markers: /TSRICH(?:CHILD)?[a-f0-9]{32}END/.test(document.getElementById('host').innerHTML),
      };
    });
    assert.equal(result.track.height, 14);
    assert.equal(result.segments.length, 2);
    result.segments.forEach((segment, i) => {
      assert.ok(Math.abs(segment.ratio - [5 / 6, 1 / 6][i]) < .0002, `${width}/${mode} allocation ratio ${i}`);
      assert.equal(segment.height, 14); assert.equal(segment.top, 0);
      assert.equal(segment.color, ['rgb(71, 136, 199)', 'rgb(164, 170, 181)'][i]);
    });
    assert.equal(result.progress.length, 3);
    result.progress.forEach(fill => { assert.ok(Math.abs(fill.ratio - .71) < .002); assert.equal(fill.height, 12); assert.notEqual(fill.color, fill.track); });
    assert.equal(result.images.length, 3);
    result.images.forEach((image, i) => { assert.ok(Math.abs(image.ratio - (i === 2 ? 16 / 9 : 5 / 4)) < .002); assert.equal(image.icon, true); assert.equal(image.overflow, false); });
    assert.equal(result.images[0].width, 172); assert.equal(result.images[1].width, 148);
    if (width >= 680) { assert.equal(result.images[0].beside, true); assert.equal(result.images[1].beside, true); }
    assert.equal(result.overflow, false); assert.equal(result.markers, false);
    cases.push({ width, mode, ...result });
  }
  for (const forcedColors of ['none', 'active']) {
    await page.evaluate(() => document.getElementById('host').classList.add('reader-high-contrast'));
    await page.emulateMedia({ forcedColors });
    const result = await page.evaluate(() => {
      const segments = [...document.querySelectorAll('.rich-allocation-segment')];
      return { colors: segments.map(segment => getComputedStyle(segment).backgroundColor), ratios: segments.map(segment => segment.getBoundingClientRect().width / segment.parentElement.clientWidth), progress: [...document.querySelectorAll('.rich-progress-track')].every(track => getComputedStyle(track).backgroundColor !== getComputedStyle(track.querySelector('.rich-progress-fill')).backgroundColor) };
    });
    assert.notEqual(result.colors[0], result.colors[1], `${forcedColors} allocation segments remain distinct`);
    assert.equal(result.progress, true, `${forcedColors} prior percentage fills remain visible`);
    result.ratios.forEach((ratio, i) => assert.ok(Math.abs(ratio - [5 / 6, 1 / 6][i]) < .0002));
    cases.push({ forcedColors, ...result });
  }
  const lookalikes = await page.evaluate(() => {
    const renderer = new ConversationRenderer(document.getElementById('host'));
    const texts = ['<box direction="row" height="14px" radius="full" background="surface-tertiary" clip><box flex={1} background="#4788C7">Text</box><box flex={1} background="#A4AAB5"/></box>', '<box direction="row" height="100px" radius="full" background="surface-tertiary" clip><box flex={1} background="#4788C7"/><box flex={1} background="#A4AAB5"/></box>'];
    return texts.map(text => renderer.processMessageContent(text).includes('rich-allocation-track'));
  });
  assert.deepEqual(lookalikes, [false, false]);
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  const report = { result: 'PASS', browser: browser.version(), cases, errors, requests };
  if (process.env.THREADSHELF_LAYOUT_EVIDENCE) {
    await mkdir(path.dirname(process.env.THREADSHELF_LAYOUT_EVIDENCE), { recursive: true });
    await writeFile(process.env.THREADSHELF_LAYOUT_EVIDENCE, JSON.stringify(report, null, 2) + '\n');
  }
  console.log('PASS: weighted allocation and prior percentage fills; Platinum light/dark 1100/680/380px; source-sized image layouts; high contrast and forced colors; no requests or page errors.');
} finally { await browser.close(); await rm(tmp, { recursive: true, force: true }); }
