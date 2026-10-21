import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const root = fileURLToPath(new URL('..', import.meta.url));
const { chromium } = await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE || 'playwright');
const tmp = await mkdtemp(path.join(os.tmpdir(), 'reader-rich-layout-r4-'));
await build({stdin:{contents:'import {ConversationRenderer} from "./src/reader/renderer.js"; window.ConversationRenderer=ConversationRenderer;',resolveDir:root},outfile:path.join(tmp,'renderer.js'),bundle:true,format:'iife',platform:'browser',logLevel:'silent'});
const browser = await chromium.launch({headless:true,...(process.env.READER_CHROMIUM ? {executablePath:process.env.READER_CHROMIUM} : {}),args:['--no-sandbox']});
const bars = (background, extra = '') => [51,71,100].map(width => `<box width="100%" height="14px" background="surface-tertiary" radius="full" clip><box width="${width}%" height="14px" background="${background}" ${extra}/></box>`).join('\n');
const icons = ['archive','arrow-right','badge-check','check-circle','download','file-search','layout-dashboard','panels-top-left','type','database','sparkles'];
const source = `<box border padding={3} gap={3}>${bars('surface-secondary')}${bars('info', 'radius="full"')}${bars('#ef3456')}<row gap={2}>${icons.map(name => `<icon name="${name}"/>`).join('')}</row><svg viewBox="0 0 100 80" width="100%" height="80px" preserveAspectRatio="xMidYMid meet"><path d="M10 70 L40 20 L70 45 L90 10" stroke="#3b82f6" strokeWidth="3" strokeLinejoin="round" fill="none"/><circle cx="40" cy="20" r="4" fill="#3b82f6"/></svg></box>`;
try {
  const page = await browser.newPage({viewport:{width:680,height:540}});
  await page.setContent('<main class="reader-view" id="host"></main>');
  for (const file of ['src/ui/style.css','src/ui/themes.css','src/reader/reader.css','src/reader/rich-layout.css']) await page.addStyleTag({path:path.join(root,file)});
  await page.addScriptTag({path:path.join(tmp,'renderer.js')});
  await page.evaluate(source => {
    const host = document.getElementById('host'), renderer = new ConversationRenderer(host);
    host.innerHTML = `<div class="message-content">${renderer.processMessageContent(source)}</div>`;
  }, source);
  for (const mode of ['light','dark']) {
    await page.evaluate(mode => { document.documentElement.dataset.uiPalette='platinum'; document.documentElement.dataset.theme=mode; },mode);
    const result = await page.evaluate(() => ({
      bars:[...document.querySelectorAll('.rich-progress-track')].map(track => {
        const fill=track.querySelector('.rich-progress-fill');
        return {ratio:fill.getBoundingClientRect().width/track.clientWidth,color:getComputedStyle(fill).backgroundColor,track:getComputedStyle(track).backgroundColor,height:fill.getBoundingClientRect().height};
      }),
      svg:document.querySelector('.rich-static-svg')?.namespaceURI,
      stroke:document.querySelector('.rich-static-svg path')?.getAttribute('stroke-width'),
      pathBox:document.querySelector('.rich-static-svg path')?.getBBox().width,
      icons:document.querySelectorAll('.rich-icon').length,
      fallbacks:document.querySelectorAll('.rich-icon-fallback,.rich-original-source').length,
      overflow:document.documentElement.scrollWidth > innerWidth,
      markers:/TSRICH(?:CHILD)?[a-f0-9]{32}END/.test(document.getElementById('host').innerHTML),
    }));
    assert.equal(result.bars.length,9,mode);
    result.bars.forEach((bar,i) => {
      assert.ok(Math.abs(bar.ratio-[.51,.71,1][i%3]) < .002, `${mode}: ${i} fill width`);
      assert.notEqual(bar.color,bar.track,`${mode}: ${i} fill must be visible`);
      assert.equal(bar.height,14);
      if(i >= 6) assert.equal(bar.color,'rgb(239, 52, 86)');
    });
    assert.equal(result.svg,'http://www.w3.org/2000/svg'); assert.equal(result.stroke,'3'); assert.equal(result.pathBox,80);
    assert.equal(result.icons,icons.length);assert.equal(result.fallbacks,0);assert.equal(result.overflow,false);assert.equal(result.markers,false);
  }
  await page.evaluate(() => document.getElementById('host').classList.add('reader-high-contrast'));
  const contrast = await page.evaluate(() => [...document.querySelectorAll('.rich-progress-track')].every(track=>getComputedStyle(track).backgroundColor!==getComputedStyle(track.querySelector('.rich-progress-fill')).backgroundColor));
  assert.equal(contrast,true,'percentage fills remain visible in Reader high contrast');
  await page.emulateMedia({forcedColors:'active'});
  const forced = await page.evaluate(() => [...document.querySelectorAll('.rich-progress-track')].every(track=>getComputedStyle(track).backgroundColor!==getComputedStyle(track.querySelector('.rich-progress-fill')).backgroundColor));
  assert.equal(forced,true,'percentage fills remain visible in forced colors');
  const unknown = await page.evaluate(() => {
    const renderer = new ConversationRenderer(document.getElementById('host'));
    const template = document.createElement('template'); template.innerHTML=renderer.processMessageContent('<icon name="TS32-unknown-icon"/>');
    return {fallbacks:template.content.querySelectorAll('.rich-icon-fallback').length,icons:template.content.querySelectorAll('.rich-icon').length};
  });
  assert.deepEqual(unknown,{fallbacks:1,icons:0},'intentional unknown icon still uses passive fallback');
  console.log('Platinum light/dark: 51/71/100% neutral, semantic and explicit fills visible; safe SVG geometry and icons render; narrow viewport and forced colors pass.');
} finally { await browser.close(); await rm(tmp,{recursive:true,force:true}); }
