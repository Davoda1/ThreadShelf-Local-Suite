// Selected SVG designs against the actual Reader theme styles. Synthetic only.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { UI_PALETTES } from '../src/core/themes.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const { chromium } = await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE || 'playwright');
const tmp = await mkdtemp(path.join(os.tmpdir(), 'reader-placeholder-r6-'));
await build({ stdin: { contents: 'import {ConversationRenderer} from "./src/reader/renderer.js";import {setRendererLocale} from "./src/reader/locale.js";import "./src/ui/style.css";import "./src/ui/themes.css";import "./src/reader/reader.css";import "./src/reader/rich-layout.css";window.ConversationRenderer=ConversationRenderer;window.setRendererLocale=setRendererLocale;', resolveDir: root }, outfile: path.join(tmp, 'renderer.js'), bundle: true, format: 'iife', platform: 'browser', loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' }, logLevel: 'silent' });
const browser = await chromium.launch({ headless: true, ...(process.env.READER_CHROMIUM ? { executablePath: process.env.READER_CHROMIUM } : {}), args: ['--no-sandbox'] });
const row = width => `<row align="center" gap={3}><AsyncImage query="Synthetic ${width}px thumbnail query" aspectRatio="5:4" maxWidth="${width}px"/><box flex={1}>**Synthetic subject**<text>The description remains beside its thumbnail.</text></box></row>`;
const source = `${row(172)}\n${row(148)}\n<AsyncImage query="Synthetic full-width landscape query" width="100%" aspectRatio="16:9"/>\n<AsyncImageGroup query={["Synthetic first group query","Synthetic second group query"]}/>`;
const cases = [], languageCases = [], errors = [], requests = [];
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.setContent('<main id="host" class="reader-view"></main>');
  // Resolve the actual theme @imports (including Professional) before injection.
  await page.addStyleTag({ path: path.join(tmp, 'renderer.css') });
  await page.addStyleTag({ content: '#host{box-sizing:border-box;padding:16px;max-width:960px;margin:auto}.message-content{min-width:0}.message-content>.rich-row{margin-bottom:16px}' });
  await page.addScriptTag({ path: path.join(tmp, 'renderer.js') });
  await page.evaluate(source => {
    const host = document.getElementById('host'), renderer = new ConversationRenderer(host);
    host.replaceChildren(renderer.createMessageElement({ message_id: 'synthetic-placeholder', role: 'assistant', content: source }));
  }, source);
  for (const width of [1100, 680, 380]) for (const palette of UI_PALETTES) for (const mode of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 540 });
    const result = await page.evaluate(({ palette, mode, source }) => {
      document.documentElement.dataset.uiPalette = palette; document.documentElement.dataset.theme = mode;
      const host = document.getElementById('host');
      const themeColor = variable => {
        const probe = document.createElement('span'); probe.style.color = `var(${variable})`; host.append(probe);
        const color = getComputedStyle(probe).color; probe.remove(); return color;
      };
      return {
        palette, mode,
        slots: [...host.querySelectorAll('.rich-image-placeholder')].map(slot => {
          const r = slot.getBoundingClientRect(), icon = slot.querySelector('.rich-image-placeholder-icon'), glyph = icon.getBoundingClientRect(), label = slot.querySelector('.rich-offline-label'), l = label.getBoundingClientRect();
          const style = getComputedStyle(slot), next = slot.nextElementSibling?.getBoundingClientRect();
          const wide = slot.dataset.placeholderDesign === 'soft-horizon';
          return { design: slot.dataset.placeholderDesign, width: r.width, height: r.height, glyph: [glyph.width, glyph.height], label: label.textContent,
            accessible: slot.getAttribute('aria-label') === slot.title && slot.title.includes('Synthetic') && slot.getAttribute('role') === 'img',
            queryHidden: slot.querySelector('.rich-image-description').getBoundingClientRect().width <= 1,
            labelFits: l.left >= r.left && l.right <= r.right && l.top > glyph.bottom && l.bottom < r.bottom,
            beside: !next || next.left >= r.right,
            noOverflow: slot.scrollWidth <= slot.clientWidth && slot.scrollHeight <= slot.clientHeight,
            background: style.backgroundColor, expectedBackground: themeColor(wide ? '--bg-primary' : '--bg-secondary'),
            ink: getComputedStyle(icon).stroke, expectedInk: themeColor('--text-secondary'),
            border: style.borderTopColor, expectedBorder: themeColor('--border-color'),
            accent: wide ? null : getComputedStyle(slot.querySelector('.rich-image-aperture-corners')).stroke, expectedAccent: wide ? null : themeColor('--text-accent'),
            back: wide ? getComputedStyle(slot.querySelector('.rich-image-horizon-back')).fill : null, expectedBack: wide ? themeColor('--sidebar') : null,
            front: wide ? getComputedStyle(slot.querySelector('.rich-image-horizon-front')).fill : null, expectedFront: wide ? themeColor('--bg-tertiary') : null,
            sun: wide ? [getComputedStyle(slot.querySelector('.rich-image-horizon-sun')).fill, slot.querySelector('.rich-image-horizon-sun').getBoundingClientRect().width, slot.querySelector('.rich-image-horizon-sun').getBoundingClientRect().height] : null,
            unsafe: slot.querySelectorAll('img,a,script,foreignObject,use,image,[href],[onclick]').length,
          };
        }),
        sourceExact: host.querySelector('.message').sourceText === source,
        groupUnchanged: [...host.querySelectorAll('.rich-image-unavailable:not(.rich-image-placeholder)')].some(node => node.textContent === 'Image unavailable offlineSynthetic first group query · Synthetic second group query' && !node.querySelector('svg')),
        overflow: document.documentElement.scrollWidth > innerWidth,
        rawTags: /TSRICH(?:CHILD)?[a-f0-9]{32}END/.test(host.innerHTML),
      };
    }, { palette: palette.id, mode, source });
    assert.deepEqual(result.slots.map(slot => slot.design), ['corner-aperture', 'corner-aperture', 'soft-horizon']);
    result.slots.forEach((slot, i) => {
      const label = `${palette.id}/${mode}/${width}/${i}`;
      assert.ok(Math.abs(slot.width / slot.height - (i === 2 ? 16 / 9 : 5 / 4)) < .002, label);
      if (i < 2) assert.equal(slot.width, [172, 148][i], label);
      assert.deepEqual(slot.glyph, i === 2 ? [28, 28] : [50, 41], label);
      assert.equal(slot.label, 'Image unavailable', label);
      assert.ok(slot.accessible && slot.queryHidden && slot.labelFits && slot.noOverflow, label);
      if (width >= 680 && i < 2) assert.equal(slot.beside, true, label);
      for (const key of ['background', 'ink', 'border', 'accent', 'back', 'front']) assert.equal(slot[key], slot[`expected${key[0].toUpperCase()}${key.slice(1)}`], `${label} ${key}`);
      if (i === 2) assert.deepEqual(slot.sun, [slot.expectedFront, 24, 24], label);
      assert.equal(slot.unsafe, 0, label);
    });
    assert.ok(result.sourceExact && result.groupUnchanged); assert.equal(result.overflow, false); assert.equal(result.rawTags, false);
    cases.push({ width, ...result });
  }
  // Locale changes create new serialized HTML exactly as the desktop app does.
  for (const language of ['en', 'hu', 'de', 'fr', 'ja']) {
    const result = await page.evaluate(({ source, language }) => {
      setRendererLocale(language);
      const host = document.getElementById('host'), renderer = new ConversationRenderer(host);
      host.replaceChildren(renderer.createMessageElement({ message_id: 'localized-placeholder', role: 'assistant', content: source }));
      return [...host.querySelectorAll('.rich-image-placeholder')].map(slot => {
        const r = slot.getBoundingClientRect(), label = slot.querySelector('.rich-offline-label'), l = label.getBoundingClientRect();
        return { caption: label.textContent, fits: l.bottom < r.bottom && slot.scrollWidth <= slot.clientWidth && slot.scrollHeight <= slot.clientHeight, aria: slot.getAttribute('aria-label'), glyph: slot.querySelector('.rich-image-placeholder-icon').getBoundingClientRect().width };
      });
    }, { source, language });
    assert.ok(result.every(slot => slot.fits && slot.aria.includes('Synthetic')));
    const expected = { en: 'Image unavailable', hu: 'A kép nem érhető el', de: 'Bild nicht verfügbar', fr: 'Image indisponible', ja: '画像を利用できません' }[language];
    assert.ok(result.every(slot => slot.caption === expected)); languageCases.push({ language, result });
  }
  const classifications = await page.evaluate(() => {
    const renderer = new ConversationRenderer(document.getElementById('host'));
    const sources = [
      '<AsyncImage query="capped" width="100%" maxWidth="172px"/>',
      '<AsyncImage query="standalone compact" width="148px"/>',
      '<AsyncImage query="standalone large" width="640px"/>',
      '<AsyncImage query="standalone relative" width="90%"/>',
      '<AsyncImage query="default wide"/>',
      '<row><AsyncImage query="row default"/><text>Text</text></row>',
      '<box direction="row"><box><AsyncImage query="nested row"/></box><text>Text</text></box>',
      '<row><AsyncImage query="full row" width="100%"/></row>',
      '<row><AsyncImage query="relative row" width="50%"/><text>Text</text></row>',
      '<row><AsyncImage query="first" width="148px"/><text>Text</text></row><AsyncImage query="sibling context stays separate"/>',
      '<grid columns={2}><AsyncImage query="grid no explicit thumbnail"/><AsyncImage query="grid compact" width="172px"/></grid>',
    ];
    return sources.map(content => {
      const article = renderer.createMessageElement({ role: 'assistant', content });
      return [...article.querySelectorAll('.rich-image-placeholder')].map(slot => ({ design: slot.dataset.placeholderDesign, width: slot.style.width, ratio: slot.style.aspectRatio }));
    });
  });
  assert.deepEqual(classifications.map(items => items.map(item => item.design)), [
    ['corner-aperture'], ['corner-aperture'], ['soft-horizon'], ['soft-horizon'], ['soft-horizon'], ['corner-aperture'], ['corner-aperture'], ['soft-horizon'], ['corner-aperture'], ['corner-aperture', 'soft-horizon'], ['soft-horizon', 'corner-aperture'],
  ]);
  assert.equal(classifications[4][0].width, ''); assert.equal(classifications[4][0].ratio, '');
  assert.equal(classifications[5][0].width, ''); assert.equal(classifications[5][0].ratio, '');
  const natural = await page.evaluate(() => {
    const host = document.getElementById('host'), renderer = new ConversationRenderer(host), fixture = document.createElement('section');
    fixture.className = 'message-content'; fixture.innerHTML = renderer.processMessageContent('<AsyncImage query="No invented hero geometry"/><row><AsyncImage query="No invented thumbnail width"/><text>A short description.</text></row><row><AsyncImage query="Ratio-only row retains intrinsic width" aspectRatio="5:4"/><text>Text beside ratio-only image.</text></row>');
    host.append(fixture);
    const sizes = [...fixture.querySelectorAll('.rich-image-placeholder')].map(slot => ({ width: slot.getBoundingClientRect().width, height: slot.getBoundingClientRect().height, natural: slot.classList.contains('rich-image-natural') }));
    fixture.remove(); return sizes;
  });
  assert.ok(natural.every(slot => slot.natural && slot.height > 40 && slot.height < 120 && slot.width > 80));
  assert.ok(Math.abs(natural[2].width / natural[2].height - 5 / 4) < .002);
  const contrastCases = [];
  for (const highContrast of [false, true]) for (const forcedColors of ['none', 'active']) {
    await page.evaluate(highContrast => document.getElementById('host').classList.toggle('reader-high-contrast', highContrast), highContrast);
    await page.emulateMedia({ forcedColors });
    const result = await page.evaluate(() => [...document.querySelectorAll('.rich-image-placeholder')].map(slot => {
      const style = getComputedStyle(slot), icon = getComputedStyle(slot.querySelector('.rich-image-placeholder-icon')), hill = slot.querySelector('.rich-image-horizon-back');
      return { background: style.backgroundColor, ink: icon.stroke, border: style.borderTopColor, hillFill: hill ? getComputedStyle(hill).fill : null, hillStroke: hill ? getComputedStyle(hill).stroke : null, width: slot.getBoundingClientRect().width };
    }));
    result.forEach(slot => { assert.notEqual(slot.ink, slot.background); assert.notEqual(slot.border, slot.background); });
    if (highContrast && forcedColors === 'none') assert.equal(result[2].hillFill, 'rgb(8, 8, 8)');
    if (forcedColors === 'active') assert.notEqual(result[2].hillStroke, result[2].background);
    contrastCases.push({ highContrast, forcedColors, result });
  }
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  if (process.env.THREADSHELF_PLACEHOLDER_SCREENSHOT) {
    await page.emulateMedia({ forcedColors: 'none' }); await page.setViewportSize({ width: 680, height: 860 });
    await page.evaluate(source => {
      document.documentElement.dataset.uiPalette = 'platinum'; document.documentElement.dataset.theme = 'light'; setRendererLocale('en');
      const host = document.getElementById('host'); host.classList.remove('reader-high-contrast');
      const renderer = new ConversationRenderer(host); host.replaceChildren(renderer.createMessageElement({ role: 'assistant', content: source }));
    }, source);
    await page.screenshot({ path: process.env.THREADSHELF_PLACEHOLDER_SCREENSHOT });
  }
  const report = { result: 'PASS', browser: browser.version(), themeCases: cases.length, palettes: UI_PALETTES.length, cases, languageCases, classifications, natural, contrastCases, errors, requests };
  if (process.env.THREADSHELF_PLACEHOLDER_EVIDENCE) {
    await mkdir(path.dirname(process.env.THREADSHELF_PLACEHOLDER_EVIDENCE), { recursive: true });
    await writeFile(process.env.THREADSHELF_PLACEHOLDER_EVIDENCE, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(`PASS: ${cases.length} actual-theme cases (${UI_PALETTES.length} palettes × light/dark × 1100/680/380), 5 locales, 11 layout classification cases, 4 contrast cases; no network or page errors.`);
} finally { await browser.close(); await rm(tmp, { recursive: true, force: true }); }
