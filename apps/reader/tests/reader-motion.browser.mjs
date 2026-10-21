#!/usr/bin/env node
// Actual Electron/Chromium layout and animation samples. Synthetic content only.
// Include global application CSS: its generic button centering caused the original regression.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,cp,rm,access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('..',import.meta.url));
const appRoot=process.env.READER_APP_ROOT?path.resolve(process.env.READER_APP_ROOT):root;
const componentRoot=process.env.READER_COMPONENT_ROOT?path.resolve(process.env.READER_COMPONENT_ROOT):appRoot;
const evidence=path.resolve(process.env.READER_EVIDENCE||path.join(root,'docs/evidence/v1.2.0/motion'));
await mkdir(evidence,{recursive:true});
const {_electron}=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');
const temp=await mkdtemp(path.join(os.tmpdir(),'tslr-motion-111-2-'));
const assets=await access(path.join(appRoot,'public')).then(()=>path.join(appRoot,'public'),()=>path.join(appRoot,'dist'));
await cp(assets,temp,{recursive:true});
await build({stdin:{contents:`import ${JSON.stringify(path.join(componentRoot,'src/ui/style.css'))}; import {ReaderView} from ${JSON.stringify(path.join(componentRoot,'src/reader/reader.js'))}; import ${JSON.stringify(path.join(componentRoot,'src/ui/themes.css'))}; import ${JSON.stringify(path.join(componentRoot,'src/ui/code-themes.css'))}; window.ReaderView=ReaderView;`,resolveDir:root},outfile:path.join(temp,'test.js'),bundle:true,format:'iife',platform:'browser',loader:{'.woff2':'file'},logLevel:'silent'});
await writeFile(path.join(temp,'index.html'),'<!doctype html><html lang="en" data-theme="dark" data-ui-palette="default" data-code-theme="default"><head><meta charset="utf-8"><link rel="stylesheet" href="./test.css"><style>html,body{height:100%;margin:0;overflow:hidden}#readerHost{height:calc(100vh - 140px);width:calc(100vw - 245px);margin:70px 0 0 245px;position:relative}</style></head><body><div id="readerHost"></div><script src="./test.js"></script></body></html>');
await writeFile(path.join(temp,'main.cjs'),`const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>new BrowserWindow({width:1080,height:760,show:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}}).loadFile(${JSON.stringify(path.join(temp,'index.html'))}));`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:process.env.READER_ELECTRON||path.join(root,'node_modules/electron/dist/electron'),args:['--no-sandbox','--disable-gpu',path.join(temp,'main.cjs')],env,timeout:30000});
const page=await app.firstWindow(),errors=[],passed=[],records=[];
page.on('pageerror',error=>errors.push(error.message));
async function fixture(kind,{animations=true}={}){
 await page.evaluate(async({kind,animations})=>{
  if(!window.reader)window.reader=new ReaderView({container:document.getElementById('readerHost'),settings:{language:'en',compact:true,animations:true}});
  reader.setSettings({animations});
  const text=Array.from({length:36},(_,i)=>`Paragraph ${i+1}: gradual expansion preserves this original source text and its readable spacing.`).join('\n\n');
  await reader.show({id:'motion-'+kind,title:'Motion fixture',turns:[{[kind==='user'?'user':'thinking']:text,model:'Synthetic model',created_at:'2026-09-27T18:30:00Z',turn_index:0},{ai:'The next message retains its normal layout.',turn_index:3}]},{key:'motion-'+kind});
  reader.start();
 },{kind,animations});
 await page.waitForTimeout(100);
}
async function animation(kind,{reverseAt=null,doubleClick=false,growAt=null}={}){
 return page.evaluate(async({kind,reverseAt,doubleClick,growAt})=>{
  const message=document.querySelector('.message.'+kind),viewport=message.querySelector('.message-content-viewport'),content=message.querySelector('.message-content'),toggle=message.querySelector('[data-toggle-message-collapse]');
  const styles=getComputedStyle(viewport),startHeight=viewport.getBoundingClientRect().height,startScroll=reader.content.scrollTop;
  const duration=styles.transitionDuration.split(',').map(s=>parseFloat(s)*(s.trim().endsWith('ms')?1:1000));
  const frames=[],reversals=[],start=performance.now();let reversed=false,grown=false;
  toggle.click();if(doubleClick)toggle.click();
  while(performance.now()-start<1250){
   await new Promise(requestAnimationFrame);const elapsed=performance.now()-start;
   if(reverseAt!==null&&!reversed&&elapsed>=reverseAt){const before={height:viewport.getBoundingClientRect().height,opacity:Number(getComputedStyle(viewport).opacity)};toggle.click();reversals.push({before,after:{height:viewport.getBoundingClientRect().height,opacity:Number(getComputedStyle(viewport).opacity)}});reversed=true;}
   if(growAt!==null&&!grown&&elapsed>=growAt){const p=document.createElement('p');p.textContent='Late content growth remains visible. '.repeat(45);content.append(p);grown=true;}
   frames.push({time:Math.round(elapsed),height:viewport.getBoundingClientRect().height,scrollTop:reader.content.scrollTop,animating:message.classList.contains('is-collapse-animating')});
  }
  return {kind,startHeight,startScroll,duration,frames,reversals,finalHeight:viewport.getBoundingClientRect().height,naturalHeight:content.scrollHeight,expanded:toggle.getAttribute('aria-expanded'),animating:message.classList.contains('is-collapse-animating'),pageWidth:document.documentElement.scrollWidth,pageHeight:document.documentElement.scrollHeight,width:innerWidth,height:innerHeight,viewportClientWidth:reader.content.clientWidth,viewportScrollWidth:reader.content.scrollWidth};
 },{kind,reverseAt,doubleClick,growAt});
}
function bounds(result){assert.ok(result.pageWidth<=result.width&&result.pageHeight<=result.height,'Outer frame never scrolls');assert.ok(result.viewportScrollWidth<=result.viewportClientWidth,'Reader remains horizontally bounded');assert.equal(result.animating,false,'Animation cleans up after completion');assert.ok(result.frames.every(f=>Math.abs(f.scrollTop-result.startScroll)<2),'A top-of-thread toggle does not introduce a scroll jump');}
function gradual(result,expanding){
 assert.ok(result.duration[0]>=500&&result.duration[0]<=800,'Slower bounded collapse duration');
 const low=Math.min(result.startHeight,result.finalHeight),high=Math.max(result.startHeight,result.finalHeight),intermediate=result.frames.filter(f=>f.height>low+5&&f.height<high-5);
 assert.ok(intermediate.length>=5,'Several independently rendered intermediate heights');
 assert.ok(intermediate.some(f=>f.time>300),'Motion remains visibly in progress after 300 ms');
 for(let i=1;i<result.frames.length;i++){const delta=result.frames[i].height-result.frames[i-1].height;assert.ok(expanding?delta>=-2:delta<=2,'Motion remains monotonic');}
 assert.equal(result.expanded,String(expanding));bounds(result);
}
try{
 await page.waitForFunction(()=>!!window.ReaderView);
 for(const [width,height] of [[680,540],[1080,760]]){
  await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setSize(width,height),{width,height});
  await fixture('thinking');
  const geometry=await page.locator('.message.thinking').evaluate(message=>{const rect=e=>e.getBoundingClientRect().toJSON(),toggle=message.querySelector('.reasoning-collapse-toggle');return {header:rect(message.querySelector('.message-header')),button:rect(toggle),chevron:rect(toggle.querySelector('svg')),role:rect(toggle.querySelector('.message-role')),model:rect(message.querySelector('.message-model')),time:rect(message.querySelector('.message-time')),actions:[...message.querySelectorAll('.message-copy-button,.bookmark-message')].map(rect),justify:getComputedStyle(toggle).justifyContent};});
  assert.equal(geometry.justify,'flex-start');assert.ok(Math.abs(geometry.chevron.left-geometry.button.left)<1,'Reasoning chevron starts at the left edge of its full-width button');assert.ok(Math.abs(geometry.button.left-geometry.header.left)<1,'Reasoning control aligns with header left edge');assert.ok(geometry.role.left>geometry.chevron.right&&geometry.role.left-geometry.chevron.right<12,'Reasoning label stays next to chevron');
  for(const item of [geometry.button,geometry.role,geometry.model,geometry.time,...geometry.actions])assert.ok(item.left>=geometry.header.left-1&&item.right<=geometry.header.right+1,'Metadata and actions remain inside wrapping header');
  await page.screenshot({path:path.join(evidence,`Reasoning-Left-${width}.png`)});records.push({kind:'alignment',width,height,geometry});
  for(const kind of ['thinking','user']){
   await fixture(kind);const opened=await animation(kind);gradual(opened,true);assert.ok(Math.abs(opened.finalHeight-opened.naturalHeight)<2,'Expanded content is fully visible');records.push({width,height,direction:'expand',...opened});
   const closed=await animation(kind);gradual(closed,false);assert.ok(Math.abs(closed.finalHeight-opened.startHeight)<2,'Collapse returns to initial preview height');records.push({width,height,direction:'collapse',...closed});
  }
 }
 passed.push('Reasoning chevron and label align left with timestamp/model/copy/bookmark controls at 680×540 and 1080×760');
 passed.push('User and thinking expansion/collapse have measurable gradual motion beyond 300 ms, without frame overflow or automatic scroll jumps at both sizes');
 for(const kind of ['thinking','user']){
  await fixture(kind);const reverse=await animation(kind,{reverseAt:175});assert.ok(reverse.frames.some(f=>f.height>reverse.startHeight+10),'Opening had started before reversal');assert.ok(Math.abs(reverse.finalHeight-reverse.startHeight)<2,'Mid-flight reversal reaches the original height');assert.equal(reverse.expanded,'false');for(const pair of reverse.reversals){assert.ok(Math.abs(pair.before.height-pair.after.height)<2,'Reversal starts at the current rendered height');assert.ok(Math.abs(pair.before.opacity-pair.after.opacity)<.025,'Reversal starts at the current rendered opacity without a flash');}bounds(reverse);records.push({direction:'reverse',...reverse});
  await fixture(kind);const immediate=await animation(kind,{doubleClick:true});assert.ok(Math.abs(immediate.finalHeight-immediate.startHeight)<2,'Two immediate toggles do not leave a stale expansion');assert.equal(immediate.expanded,'false');bounds(immediate);records.push({direction:'immediate-double-toggle',...immediate});
  await fixture(kind);const growth=await animation(kind,{growAt:130});assert.ok(Math.abs(growth.finalHeight-growth.naturalHeight)<2,'Late content growth is included in the final expanded height');assert.equal(growth.expanded,'true');bounds(growth);records.push({direction:'content-growth',...growth});
 }
 passed.push('Both bubble types handle mid-flight reversal, same-frame double toggle, and late content growth without stale transition cleanup or clipped content');
 for(const preference of ['disabled','reduce']){
  await page.emulateMedia({reducedMotion:preference==='reduce'?'reduce':'no-preference'});
  for(const kind of ['thinking','user']){
   await fixture(kind,{animations:preference!=='disabled'});
   const result=await page.evaluate(kind=>{const m=document.querySelector('.message.'+kind),v=m.querySelector('.message-content-viewport');m.querySelector('[data-toggle-message-collapse]').click();return {height:v.getBoundingClientRect().height,natural:m.querySelector('.message-content').scrollHeight,animating:m.classList.contains('is-collapse-animating')};},kind);
   assert.equal(result.animating,false);assert.ok(Math.abs(result.height-result.natural)<2,'Animation preference applies immediately');records.push({kind,preference,...result});
  }
 }
 passed.push('Disabled animations and OS reduced-motion both expand immediately for user and thinking bubbles');
 assert.deepEqual(errors,[]);
 const report={version:'3.0.0',appRoot,componentRoot,assets,passed,records,pageErrors:errors};await writeFile(path.join(evidence,'motion-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed,records:records.length,pageErrors:errors},null,2));
}catch(error){await page.screenshot({path:path.join(evidence,'Motion-Failure.png')}).catch(()=>{});throw error;}finally{await app.close();await rm(temp,{recursive:true,force:true});}
