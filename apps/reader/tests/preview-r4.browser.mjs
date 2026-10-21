import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {releaseFilename} from '../scripts/release-filenames.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const {version}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const filename=path.join(root,'release',releaseFilename(`ThreadShelf-Local-Reader-${version}-Preview.html`));
const {chromium}=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.READER_CHROMIUM,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[],requests=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route(/^https?:/,r=>{requests.push(r.request().url());return r.abort();});
try{
 await page.goto(pathToFileURL(filename).href);
 await page.waitForFunction(()=>document.querySelectorAll('.message').length>5&&document.querySelectorAll('.rich-chart:not(.rich-chart-fallback)').length===18);
 for(const viewport of [{width:1280,height:850},{width:680,height:540}])for(const theme of ['light','dark']){
  await page.setViewportSize(viewport);
  await page.locator('[data-action="settings"]').click();
  await page.locator('#prefUiPalette').selectOption('platinum');
  await page.locator('#prefTheme').selectOption(theme);
  await page.locator('#settingsForm button[type="submit"]').click();
  await page.locator('#settingsForm').waitFor({state:'detached'});
  const result=await page.evaluate(()=>({
   charts:document.querySelectorAll('.rich-chart:not(.rich-chart-fallback)').length,
   fallbacks:document.querySelectorAll('.rich-chart-fallback').length,
   svg:document.querySelectorAll('.rich-static-svg').length,
   bars:[...document.querySelectorAll('.rich-progress-track')].map(track=>{const fill=track.querySelector('.rich-progress-fill');return {width:parseFloat(fill.style.width),ratio:fill.getBoundingClientRect().width/track.clientWidth,visible:getComputedStyle(fill).backgroundColor!==getComputedStyle(track).backgroundColor};}),
   overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,
   palette:document.documentElement.dataset.uiPalette,theme:document.documentElement.dataset.theme,
  }));
  assert.equal(result.charts,18);assert.equal(result.fallbacks,1);assert.equal(result.svg,1);
  assert.equal(result.bars.length,6);for(const bar of result.bars){assert.equal(bar.visible,true);assert.ok(Math.abs(bar.ratio-bar.width/100)<.015);}
  assert.equal(result.overflow,false);assert.equal(result.palette,'platinum');assert.equal(result.theme,theme);
  checks.push({viewport,theme,...result});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 const report={engine:browser.version(),sha256:createHash('sha256').update(await fs.readFile(filename)).digest('hex'),checks,pageErrors:errors,externalRequests:requests};
 if(process.env.READER_PREVIEW_REPORT)await fs.writeFile(process.env.READER_PREVIEW_REPORT,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
