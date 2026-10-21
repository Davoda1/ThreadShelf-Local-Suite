#!/usr/bin/env node
// Real offline file:// preview; synthetic bundled conversations only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {releaseFilename} from '../scripts/release-filenames.mjs';
import {PROMPT_EXPAND_STYLES} from '../src/core/reader-appearance.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const {version}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const filename=path.resolve(process.env.READER_PREVIEW_FILE||path.join(root,'release',releaseFilename(`ThreadShelf-Local-Reader-${version}-Preview.html`)));
const evidence=path.resolve(process.env.READER_EVIDENCE||path.join(root,'docs/evidence/v1.0.0/offline-preview'));
await fs.mkdir(evidence,{recursive:true});
const bytes=await fs.readFile(filename),html=bytes.toString('utf8'),hash=v=>createHash('sha256').update(v).digest('hex');
const embedded=JSON.parse(html.match(/window\.__THREADSHELF_WAVES=(\{[^}]+\});/)?.[1]||'null');
assert.deepEqual(Object.keys(embedded).sort(),['dark','light']);
const assetRecords=[];
for(const [theme,file] of Object.entries({dark:'quiet-water-v4-1920x1080-24fps.mp4',light:'05-day-loop.mp4'})){
 assert.ok(embedded[theme].startsWith('data:video/mp4;base64,'));
 const original=await fs.readFile(path.join(root,'public/waves',file)),media=Buffer.from(embedded[theme].split(',')[1],'base64');
 assert.equal(media.length,original.length);assert.equal(hash(media),hash(original));
 assetRecords.push({theme,file,bytes:media.length,sha256:hash(media),matchesBundledSource:true});
}
const {chromium}=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.READER_CHROMIUM,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:850},colorScheme:'dark'});
const pageErrors=[],externalRequests=[],consoleErrors=[],checks=[],playback=[],styles=[];
page.on('pageerror',error=>{pageErrors.push(error.message);console.error(error.stack);});
page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
await page.route(/^https?:/,route=>{externalRequests.push(route.request().url());return route.abort();});
await page.addInitScript(()=>{
 window.testWaveUrls={created:[],revoked:[]};
 const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
 URL.createObjectURL=value=>{const url=create(value);if(value.type==='video/mp4')testWaveUrls.created.push(url);return url;};
 URL.revokeObjectURL=url=>{if(testWaveUrls.created.includes(url))testWaveUrls.revoked.push(url);return revoke(url);};
});
async function settings(){await page.locator('[data-action="settings"]').click();await page.locator('#prefPromptExpandStyle').waitFor();}
async function save(){await page.locator('#settingsForm button[type="submit"]').click();await page.locator('#settingsForm').waitFor({state:'detached'});await page.locator('.message').first().waitFor();}
async function cancel(){await page.locator('.modal-header [data-action="modal-close"]').click();await page.locator('#settingsForm').waitFor({state:'detached'});}
async function noVideo(){await page.waitForFunction(()=>!document.querySelector('.threadshelf-wave-video'));}
async function boot(){return page.evaluate(()=>window.desktop.invoke('bootstrap'));}
async function urlBalance(){return page.evaluate(()=>testWaveUrls.created.filter(url=>!testWaveUrls.revoked.includes(url)).length);}
async function ready(theme){
 await page.waitForFunction(theme=>{const v=document.querySelector('.threadshelf-wave-video');return v?.dataset.waveTheme===theme&&v.readyState>=2&&v.videoWidth===1920&&v.videoHeight===1080&&!v.paused&&!v.error&&v.currentTime>.1;},theme,{timeout:20000});
 const before=await page.locator('.threadshelf-wave-video').evaluate(v=>v.currentTime);
 await page.waitForFunction(before=>{const v=document.querySelector('.threadshelf-wave-video');return v&&!v.paused&&Math.abs(v.currentTime-before)>.2;},before,{timeout:10000});
 const result=await page.locator('.threadshelf-wave-video').evaluate(v=>({theme:v.dataset.waveTheme,width:v.videoWidth,height:v.videoHeight,duration:v.duration,currentTime:v.currentTime,muted:v.muted,loop:v.loop,paused:v.paused,source:v.currentSrc,frames:v.getVideoPlaybackQuality().totalVideoFrames}));
 assert.ok(result.source.startsWith('blob:'));assert.ok(result.muted&&result.loop&&!result.paused&&result.frames>0);assert.ok(Math.abs(result.duration-12)<.1);assert.equal(await urlBalance(),1);
 return result;
}
async function original(){return page.locator('.message.user.is-long-prompt').first().evaluate(m=>m.sourceText);}
try{
 await page.goto(pathToFileURL(filename).href);
 await page.waitForFunction(()=>document.querySelectorAll('.message').length>5&&document.querySelector('.message.user.is-long-prompt'));
 assert.equal(new URL(page.url()).protocol,'file:');assert.match(await page.title(),new RegExp(version.replaceAll('.','\\.')));
 const initial=await boot();assert.equal(initial.version,version);assert.equal(initial.settings.waveVideoBackground,false);assert.equal(initial.settings.promptExpandStyle,'outlined-right');
 assert.match(await page.locator('.brand-subtitle').textContent(),/3\.3\.0/);await noVideo();assert.equal(await urlBalance(),0);
 const source=await original();
 await page.locator('[data-action="about"]').click();assert.equal((await page.locator('.about-brand .fine').textContent()).trim(),version);await page.locator('.modal-header [data-action="modal-close"]').click();
 await page.locator('#previewLicenseOpen').click();assert.equal(await page.locator('#previewLicense h2').textContent(),`ThreadShelf Local Reader ${version}`);await page.locator('#previewLicenseClose').click();
 checks.push('file:// startup, header/title/About/license version 1.0.0, waves Off and style 5 defaults');

 await settings();assert.equal(await page.locator('#prefWaveVideoBackground').getAttribute('role'),'switch');assert.equal(await page.locator('#prefWaveVideoBackground').isChecked(),false);
 assert.equal(await page.locator('#prefPromptExpandStyle').inputValue(),'outlined-right');assert.deepEqual(await page.locator('#prefPromptExpandStyle option').evaluateAll(nodes=>nodes.map(n=>n.value)),PROMPT_EXPAND_STYLES);
 assert.equal(await page.locator('#waveBackgroundDescription').textContent(),'Show wave video loop behind conversation blocks.');
 await page.locator('#prefWaveVideoBackground').check();playback.push(await ready('dark'));
 await page.locator('#prefTheme').selectOption('light');playback.push(await ready('light'));
 await cancel();await noVideo();assert.equal(await urlBalance(),0);assert.equal((await boot()).settings.waveVideoBackground,false);assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 checks.push('Both exact embedded 03 dark / 05 day assets decode real 1080p H.264, advance time, and cancel unloads Blob media');

 for(const style of PROMPT_EXPAND_STYLES){
  await settings();await page.locator('#prefPromptExpandStyle').selectOption(style);await save();
  assert.equal((await boot()).settings.promptExpandStyle,style);assert.equal(await page.locator('#conversationContent').getAttribute('data-prompt-expand-style'),style);
  const button=page.locator('.message.user.is-long-prompt .prompt-expand-bar').first();await button.scrollIntoViewIfNeeded();
  // Restoring a saved anchor can intentionally reveal the containing prompt.
  // Normalize that existing reading-position behavior before testing toggles.
  if(await button.getAttribute('aria-expanded')==='true'){
   await button.click();await page.waitForFunction(()=>!document.querySelector('.message.user.is-long-prompt').classList.contains('is-collapse-animating'));
  }
  assert.equal(await button.getAttribute('aria-expanded'),'false');await button.focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('.message.user.is-long-prompt .prompt-expand-bar').getAttribute('aria-expanded')==='true');
  await page.waitForFunction(()=>!document.querySelector('.message.user.is-long-prompt').classList.contains('is-collapse-animating'));
  await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('.message.user.is-long-prompt .prompt-expand-bar').getAttribute('aria-expanded')==='false');
  await page.waitForFunction(()=>!document.querySelector('.message.user.is-long-prompt').classList.contains('is-collapse-animating'));
  const record=await button.evaluate(b=>{const m=b.closest('.message'),r=b.getBoundingClientRect(),mr=m.getBoundingClientRect();return {style:document.querySelector('#conversationContent').dataset.promptExpandStyle,header:b.parentElement.classList.contains('message-header'),controls:b.getAttribute('aria-controls'),targetExists:!!document.getElementById(b.getAttribute('aria-controls')),fits:r.left>=mr.left&&r.right<=mr.right+1,height:r.height,globalOverflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight};});
  assert.ok(record.targetExists&&record.fits&&record.height>=33&&!record.globalOverflow);assert.equal(record.header,style==='header-action');assert.equal(await original(),source);styles.push(record);
  await page.screenshot({path:path.join(evidence,`Prompt-${style}.png`)});
 }
 checks.push('All five styles persist within preview session, preserve source/ARIA/geometry and expand/collapse via Enter/Space');

 await settings();await page.locator('#prefWaveVideoBackground').check();await page.locator('#prefPromptExpandStyle').selectOption('outlined-right');await page.locator('#prefTheme').selectOption('dark');await save();await ready('dark');
 await page.locator('#conversationContent').evaluate(e=>e.scrollTop=0);await page.screenshot({path:path.join(evidence,'Waves-dark.png')});
 await settings();await page.locator('#prefTheme').selectOption('light');await save();await ready('light');await page.locator('#conversationContent').evaluate(e=>e.scrollTop=0);await page.screenshot({path:path.join(evidence,'Waves-light.png')});
 await settings();await page.locator('#prefPromptExpandStyle').selectOption('compact-left');await cancel();assert.equal((await boot()).settings.promptExpandStyle,'outlined-right');assert.equal(await page.locator('#conversationContent').getAttribute('data-prompt-expand-style'),'outlined-right');
 await settings();await page.locator('#prefAnimations').uncheck();await noVideo();assert.equal(await urlBalance(),0);await page.locator('#prefAnimations').check();await ready('light');await cancel();
 await page.emulateMedia({reducedMotion:'reduce'});await noVideo();assert.equal(await urlBalance(),0);await page.emulateMedia({reducedMotion:'no-preference'});await ready('light');
 await page.locator('[data-action="workspace-analytics"]').click();await noVideo();assert.equal(await urlBalance(),0);await page.locator('[data-action="workspace-reader"]').click();await ready('light');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await page.locator('.threadshelf-wave-video').evaluate(v=>v.paused),true);
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await ready('light');
 await settings();await page.locator('#prefTheme').selectOption('system');await save();
 for(const theme of ['light','dark']){await page.emulateMedia({colorScheme:theme});await ready(theme);}
 checks.push('Saved/cancelled choices, animations Off, reduced motion, Reader/Activity switch, visibility and System theme manage one video and release retired Blob URLs');

 await page.setViewportSize({width:680,height:540});await settings();await page.locator('#prefPromptExpandStyle').scrollIntoViewIfNeeded();
 const modal=await page.locator('.modal').evaluate(m=>{const r=m.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,footer:[...m.querySelectorAll('.modal-footer button')].map(b=>b.getBoundingClientRect().toJSON())};});
 assert.ok(modal.left>=0&&modal.top>=0&&modal.right<=modal.width+1&&modal.bottom<=modal.height+1&&!modal.overflow);for(const r of modal.footer)assert.ok(r.bottom<=modal.bottom+1&&r.left>=modal.left&&r.right<=modal.right+1);
 await page.screenshot({path:path.join(evidence,'Appearance-680x540.png')});await cancel();
 await settings();await page.locator('#prefWaveVideoBackground').uncheck();await save();await noVideo();assert.equal(await urlBalance(),0);assert.equal((await boot()).settings.waveVideoBackground,false);assert.equal(await original(),source);
 checks.push('680×540 Appearance panel/footer remain contained; saving Off unloads all created media without changing conversation source');

 await page.reload();await page.waitForFunction(()=>document.querySelector('.message.user.is-long-prompt'));await noVideo();assert.equal((await boot()).settings.waveVideoBackground,false);assert.equal((await boot()).settings.promptExpandStyle,'outlined-right');
 checks.push('Reload resets in-memory preview settings to documented defaults');
 assert.deepEqual(pageErrors,[]);assert.deepEqual(externalRequests,[]);
 await fs.rm(path.join(evidence,'Preview-Failure.png'),{force:true});
 const report={version,status:'PASS',engine:browser.version(),preview:{filename:path.basename(filename),bytes:bytes.length,sha256:hash(bytes)},assets:assetRecords,checks,playback,styles,minimumWindow:modal,pageErrors,externalRequests,consoleErrors};
 await fs.writeFile(path.join(evidence,'preview-1.0.0-results.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,version,checks,assets:assetRecords,playback,styles:styles.length,pageErrors,externalRequests,consoleErrors},null,2));
}catch(error){await page.screenshot({path:path.join(evidence,'Preview-Failure.png')}).catch(()=>{});throw error;}
finally{await browser.close();}
