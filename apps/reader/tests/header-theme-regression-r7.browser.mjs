#!/usr/bin/env node
// Compare the R7 header-only change against the corrected R6 offline preview.
// This tests production UI settings and actual Reader nodes, without pixel/video
// comparisons. Every non-Professional palette must keep exact styles/geometry.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { UI_PALETTE_IDS } from '../src/core/themes.mjs';
import { releaseFilename } from '../scripts/release-filenames.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const baseline = path.resolve(process.env.READER_R6_PREVIEW || '../../baseline/ThreadShelf-Local-Reader-1.0.0-Preview-6-corrected.html');
const current = path.resolve(process.env.READER_PREVIEW_FILE || path.join(root, 'release', releaseFilename('ThreadShelf-Local-Reader-1.0.0-Preview.html')));
const reportFile = path.resolve(process.env.READER_THEME_REPORT || '../qa/header-theme-regression-r7.json');
assert.ok(process.env.READER_ELECTRON, 'Use the packaged Electron runtime for this comparison');
const { _electron } = await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE || 'playwright');
const palettes = UI_PALETTE_IDS.filter(id => id !== 'professional');
assert.equal(palettes.length, 17);
const properties = ['display','visibility','position','inset','z-index','isolation','opacity','transform','transform-origin','filter','backdrop-filter','backface-visibility','contain','will-change','overflow','overflow-x','overflow-y','color','background-color','background-image','background-position','background-size','background-blend-mode','box-shadow','border-top-width','border-right-width','border-bottom-width','border-left-width','border-top-color','border-right-color','border-bottom-color','border-left-color','border-style','border-radius','outline-color','outline-width','outline-style','outline-offset','width','height','min-width','min-height','max-width','max-height','box-sizing','padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-right','margin-bottom','margin-left','gap','row-gap','column-gap','align-items','align-self','justify-content','flex-direction','flex-grow','flex-shrink','flex-basis','font-family','font-size','font-weight','line-height','letter-spacing','text-shadow','text-align','text-overflow','white-space','pointer-events','content','transition-property','transition-duration','animation-name','animation-duration'];
const selectors = ['.app-header','.sidebar','.content-pane','#operationBanner','#threadHeader','.thread-heading-top','.thread-heading-copy','#threadHeader .eyebrow','#threadHeader h1','#threadHeader [data-action="close-thread"]','.thread-meta','.thread-meta .identity','.thread-tools','.thread-tools [data-action="resume"]','.thread-tools [data-action="read-start"]','.thread-tools [data-action="bookmarks-dialog"]','.thread-tools [data-action="find-open"]','.thread-tools [data-action="export-dialog"]','#readerSearch','#readerHost','.conversation-content','.message.user','.message.user .message-header','.message.user .message-content','.message.assistant','.message.assistant .message-header','.message.assistant .message-content','.message.thinking','.message.thinking .message-header','.message.thinking .message-content','.message.thinking .reasoning-collapse-toggle'];
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-r7-theme-'));
const checks = [], errors = [], consoleErrors = [], externalRequests = [];
let app;
const report = { version: '1.0.0', revision: 7, scope: 'All non-Professional palettes, light/dark, collapsed/expanded/scrolled Reader states', properties, selectors, checks };
const hash = async filename => createHash('sha256').update(await fs.readFile(filename)).digest('hex');
try {
  report.inputs = { baseline: { filename: path.basename(baseline), sha256: await hash(baseline) }, current: { filename: path.basename(current), sha256: await hash(current) } };
  const main = path.join(scratch, 'main.cjs');
  await fs.writeFile(main, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(scratch,'profile'))});app.whenReady().then(()=>{const w=new BrowserWindow({width:1440,height:1000,useContentSize:true,show:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});w.setMenu(null);w.loadURL('about:blank');});`);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({ executablePath: process.env.READER_ELECTRON, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',main], env, timeout: 45000 });
  report.runtime = await app.evaluate(() => ({ electron: process.versions.electron, chromium: process.versions.chrome, node: process.versions.node }));
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ colorScheme: 'dark' });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.route(/^https?:/, route => { externalRequests.push(route.request().url()); return route.abort(); });
  const settle = async () => page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  async function snapshot() {
    return page.evaluate(({ selectors, properties }) => {
      const style = (node,pseudo) => { const computed=getComputedStyle(node,pseudo);return Object.fromEntries(properties.map(p=>[p,computed.getPropertyValue(p)])); };
      const geometry = node => {const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,clientWidth:node.clientWidth,clientHeight:node.clientHeight,scrollWidth:node.scrollWidth,scrollHeight:node.scrollHeight};};
      return {palette:document.documentElement.dataset.uiPalette,theme:document.documentElement.dataset.theme,viewport:{width:innerWidth,height:innerHeight},bodyOverflow:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},nodes:Object.fromEntries(selectors.map(selector=>{const node=document.querySelector(selector);return [selector,node?{geometry:geometry(node),style:style(node),before:style(node,'::before'),after:style(node,'::after')}:null];}))};
    }, { selectors, properties });
  }
  const snapshots = new Map();
  for (const [label, filename] of [['baseline',baseline],['current',current]]) {
    await page.goto(pathToFileURL(filename).href);
    await page.waitForFunction(() => document.querySelectorAll('.message').length > 5 && document.querySelector('.message.thinking .reasoning-collapse-toggle'));
    await settle();
    for (const palette of palettes) for (const theme of ['light','dark']) {
      await page.locator('[data-action="settings"]').click();
      await page.locator('[data-action="settings-tab"][data-tab="appearance"]').click();
      await page.locator('#prefUiPalette').selectOption(palette);
      await page.locator('#prefTheme').selectOption(theme);
      await page.locator('#prefWaveVideoBackground').uncheck();
      await page.locator('#prefAnimations').uncheck();
      await page.locator('#settingsForm button[type="submit"]').click();
      await page.locator('#settingsForm').waitFor({state:'detached'});
      await page.mouse.move(1436,996);
      for (const state of ['collapsed','expanded','scrolled']) {
        const expanded = state !== 'collapsed';
        const button = page.locator('.message.thinking .reasoning-collapse-toggle').first();
        if ((await button.getAttribute('aria-expanded') === 'true') !== expanded) await button.click();
        await page.evaluate(state => { const content=document.querySelector('.conversation-content');content.scrollTop=state==='scrolled'?320:0; }, state);
        await page.mouse.move(1436,996);
        await settle();
        const value = await snapshot(), key = `${palette}/${theme}/${state}`;
        assert.equal(value.palette,palette);assert.equal(value.theme,theme);
        for (const required of ['#threadHeader','#readerHost','.conversation-content','.message.user','.message.assistant','.message.thinking']) assert.ok(value.nodes[required],`${key}: missing required ${required}`);
        if (label === 'baseline') snapshots.set(key,value);
        else {
          const expected=snapshots.get(key), differences=[];
          for(const selector of selectors) if(JSON.stringify(value.nodes[selector])!==JSON.stringify(expected.nodes[selector])) differences.push({selector,baseline:expected.nodes[selector],current:value.nodes[selector]});
          const entry={palette,theme,state,elements:selectors.filter(s=>value.nodes[s]).length,exactStyleAndGeometryEquality:differences.length===0,differences};
          checks.push(entry);
          assert.deepEqual(value,expected,`${key}: all non-Professional appearance and geometry must remain identical`);
        }
      }
      console.log(label,palette,theme,'PASS');
    }
  }
  assert.equal(checks.length,102);
  assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(externalRequests,[]);
  assert.equal(await hash(baseline),report.inputs.baseline.sha256,'Baseline preview bytes must remain fixed during the comparison');
  assert.equal(await hash(current),report.inputs.current.sha256,'Current preview bytes must remain fixed during the comparison');
  Object.assign(report,{passed:true,paletteCount:palettes.length,modeCount:2,stateCount:3,comparisonCount:checks.length,elementComparisons:checks.reduce((n,c)=>n+c.elements,0),errors,consoleErrors,externalRequests});
} catch (error) {
  Object.assign(report,{passed:false,error:error.stack,errors,consoleErrors,externalRequests});
  throw error;
} finally {
  await fs.mkdir(path.dirname(reportFile),{recursive:true});
  await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n');
  if(app)await app.close();
  await fs.rm(scratch,{recursive:true,force:true});
}
