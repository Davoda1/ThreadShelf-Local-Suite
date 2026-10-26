#!/usr/bin/env node
// Production UI with a controlled persistent resource bridge; no private data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {UI_PALETTE_IDS} from '../src/core/themes.mjs';
import {dictionaries} from '../src/ui/i18n.js';

const root=fileURLToPath(new URL('..',import.meta.url));
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'threadshelf-resources-ui-'));
const evidence=process.env.READER_RESOURCES_UI_REPORT||path.join(root,'.verification/resources-cache-ui.json');
const {chromium}=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');
await build({absWorkingDir:root,entryPoints:['src/ui/app.js'],outdir:tmp,bundle:true,format:'iife',platform:'browser',loader:{'.woff':'dataurl','.woff2':'dataurl','.ttf':'dataurl','.svg':'dataurl','.png':'dataurl'},logLevel:'silent'});
const server=http.createServer(async(req,res)=>{try{
 const pathname=new URL(req.url,'http://localhost').pathname,base=path.basename(pathname);
 if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<link rel="stylesheet" href="/app.css"><main id="app"></main><div id="modalRoot"></div><div id="toastRoot"></div><script src="/app.js"></script>');return;}
 res.setHeader('Content-Type',base.endsWith('.css')?'text/css':'application/javascript');
 res.end(await fs.readFile(path.join(['app.js','app.css'].includes(base)?tmp:path.join(root,'public'),base)));
}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.READER_CHROMIUM?{executablePath:process.env.READER_CHROMIUM}:{}),args:['--no-sandbox']});
const errors=[],dialogs=[],externalRequests=[],checks=[],geometry=[];
let report;
try{
 const page=await browser.newPage({viewport:{width:680,height:540}});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',async dialog=>{dialogs.push(dialog.type());await dialog.dismiss();});
 await page.route(/^https?:/,route=>{if(new URL(route.request().url()).origin!==origin){externalRequests.push(route.request().url());return route.abort();}return route.continue();});
 await page.addInitScript(()=>{
  const params=new URLSearchParams(location.search),clone=value=>structuredClone(value);
  const saved=JSON.parse(localStorage.getItem('fixture-settings')||'{}');
  const settings={mode:'local',language:'en',theme:'dark',uiPalette:'default',fontSize:'normal',animations:false,waveVideoBackground:false,remoteImages:'auto',pageSize:25,listMode:'pages',localCollection:'all',serverCollection:'all',serverUrl:'http://server-one.test/',...saved};
  for(const key of ['language','theme','uiPalette','fontSize'])if(params.has(key))settings[key]=params.get(key);
  let cache=JSON.parse(localStorage.getItem('fixture-cache')||'{"enabled":false,"conversations":[]}');
  const rows=[
   {key:'local-"one"',title:'Local <img src=x onerror=alert(1)> & original title',mode:'local',source:'Synthetic collection',itemCount:2,byteSize:2048},
   {key:'server-one/same-id',title:'Server conversation with a very long title 日本語 Árvíztűrő '.repeat(3),mode:'server',source:'http://server-one.test/',itemCount:3,byteSize:3072},
   {key:'server-two/same-id',title:'Server conversation with the same source identity on another server',mode:'server',source:'http://server-two.test/',itemCount:1,byteSize:1024}
  ];
  const saveCache=()=>localStorage.setItem('fixture-cache',JSON.stringify(cache));
  const status=()=>({enabled:cache.enabled,itemCount:cache.conversations.reduce((n,row)=>n+row.itemCount,0),byteSize:cache.conversations.reduce((n,row)=>n+row.byteSize,0),maxBytes:1073741824,maxImageBytes:16777216,limitReached:!!window.fixtureLimit,notice:window.fixtureCorrupt?'cache-corrupt':window.fixtureLimit?'limit-reached':''});
  const thread={id:'local-thread',provider:'openai',collection:'Fixture',sourceFile:'fixture.json',conversationKey:'same-id',title:'Image context fixture',turns:[{ai:'![One](https://images.test/one.png)\n\n![Two](https://images.test/two.png)',turn_index:0}]};
  window.fixture={seed(){cache.conversations=clone(rows);saveCache();},status,settings,cache:()=>clone(cache),calls:[],failSettings:false,failClear:false,recovery:false,contextGate:null,loadGate:null};
  window.desktop={onProgress(){},onMenu(){},invoke:async(action,args={})=>{
   window.fixture.calls.push({action,args:clone(args)});
   if(action==='bootstrap')return {settings:clone(settings),resources:status(),reading:{positions:{},bookmarks:[],recent:[]},version:'1.2.0',searchStatus:{}};
   if(action==='collections')return {collections:[{name:'Fixture',count:1}]};
   if(action==='files')return {files:[{...clone(thread),id:settings.mode==='server'?undefined:thread.id,turns:undefined}],total:1};
   if(action==='thread')return clone(thread);
   if(action==='settings.save'){Object.assign(settings,args.values);localStorage.setItem('fixture-settings',JSON.stringify(settings));return clone(settings);}
   if(action==='reading.save')return {positions:{},bookmarks:[],recent:[]};
   if(action==='manager.status')return {collections:[],storage:{profile:'7z',activeCompressedBytes:0,persistentBytes:0},recoveryMode:window.fixture.recovery,error:window.fixture.recovery?'Synthetic archive recovery':''};
   if(action==='manager.files')return {files:[],total:0};
   if(action==='resources.status')return status();
   if(action==='resources.list')return {...status(),conversations:clone(cache.conversations)};
   if(action==='resources.settings'){if(window.fixture.failSettings)throw Error('Synthetic cache preference failure');cache.enabled=args.enabled;saveCache();return status();}
   if(action==='resources.clear'){if(window.fixture.failClear)throw Error('Synthetic cache deletion failure');if(args.all)window.fixtureCorrupt=false;cache.conversations=args.all?[]:cache.conversations.filter(row=>row.key!==args.conversationKey);saveCache();return status();}
   if(action==='resources.context'){if(Object.values(args).includes(undefined))throw Error('Undefined optional resource identity');if(window.fixture.contextGate)await window.fixture.contextGate;return {contextToken:JSON.stringify(args)};}
   if(action==='resources.load'){if(window.fixture.loadGate)await window.fixture.loadGate;return {dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAQCAIAAAD4YuoOAAAAIElEQVR4nGM0arrDQEvARFPTRy0YtWDUglELRi2gEgAA3M0BsKdT9rEAAAAASUVORK5CYII=',cached:true,stored:false};}
   if(action==='resources.cancel'||action==='operation.cancel')return {ok:true};
   if(action==='search.status')return {};
   if(action==='app.about')return {version:'1.2.0'};
   throw Error('Unexpected resource UI fixture action '+action);
  }};
 });
 const go=async(query='')=>{await page.goto(origin+'/'+query);await page.locator('.conversation-row').waitFor();};
 const open=async()=>{await page.locator('[data-action="settings"]').click();await page.locator('[data-action="settings-tab"][data-tab="databaseManager"]').click();await page.waitForFunction(()=>!document.querySelector('#managerRoot fieldset')?.disabled);await page.locator('[data-action="manager-view"][data-view="resources"]').click();await page.waitForFunction(()=>document.querySelector('#resourcesCacheEnabled')&&!document.querySelector('#managerRoot fieldset')?.disabled);};
 const close=async()=>{await page.locator('.modal-header [data-action="modal-close"]').click();await page.locator('#settingsForm').waitFor({state:'detached'});};
 const ready=()=>page.waitForFunction(()=>!document.querySelector('#managerRoot fieldset')?.disabled);
 const inspect=async label=>{
  const value=await page.evaluate(()=>{const panel=document.querySelector('.settings-panel'),modal=document.querySelector('.modal');const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};return {documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,width:innerWidth,height:innerHeight,panelWidth:panel.clientWidth,panelScrollWidth:panel.scrollWidth,modal:rect(modal),controls:[...document.querySelectorAll('#managerRoot button,#managerRoot input')].filter(n=>n.getClientRects().length).map(n=>({name:n.id||n.dataset.action,...rect(n)}))};});
  assert.ok(value.documentWidth<=value.width&&value.documentHeight<=value.height,label+' page overflow');assert.ok(value.panelScrollWidth<=value.panelWidth+1,label+' panel overflow');
  for(const control of value.controls)assert.ok(control.left>=value.modal.left&&control.right<=value.modal.right+1&&control.width>0&&control.height>0,label+' control fits '+control.name);
  geometry.push({label,...value});
 };
 await go();await open();
 assert.deepEqual(await page.locator('.manager-tabs [data-view]').evaluateAll(nodes=>nodes.map(n=>n.dataset.view)),['collections','conversations','storage','resources']);
 assert.equal(await page.locator('#resourcesCacheEnabled').isChecked(),false);assert.equal(await page.locator('[data-action="resources-clear-all"]').isDisabled(),true);
 assert.match(await page.locator('#resourcesCacheHelp').innerText(),/Save loaded images for offline use\. Previously cached images remain available until deleted\./);
 await page.evaluate(()=>fixture.seed());await page.locator('[data-action="manager-refresh"]').click();await ready();
 assert.equal(await page.locator('.resources-cache-entry').count(),3);assert.equal(await page.locator('.resources-cache-entry img,.resources-cache-entry a').count(),0);
 assert.match(await page.locator('.resources-cache-entry').first().innerText(),/<img src=x onerror=alert\(1\)>/);
 await page.locator('#resourcesCacheEnabled').check();await ready();assert.equal(await page.evaluate(()=>fixture.status().enabled),true);
 await page.locator('[data-action="settings-tab"][data-tab="appearance"]').click();await page.locator('#prefRemoteImages').selectOption('click');await close();
 assert.equal(await page.evaluate(()=>fixture.settings.remoteImages),'auto');await page.reload();await page.locator('.conversation-row').waitFor();await open();assert.equal(await page.locator('#resourcesCacheEnabled').isChecked(),true);
 await page.locator('#resourcesCacheEnabled').uncheck();await ready();assert.equal(await page.locator('.resources-cache-entry').count(),3);
 await page.evaluate(()=>fixture.failSettings=true);await page.locator('#resourcesCacheEnabled').click();await ready();assert.equal(await page.locator('#resourcesCacheEnabled').isChecked(),false);assert.match(await page.locator('#resourcesCacheFeedback').innerText(),/Synthetic cache preference failure/);await page.evaluate(()=>fixture.failSettings=false);
 checks.push('Fourth tab, default off, real returned counts, escaped title/source, immediate persistence independent of appearance Cancel, disabled caching preserves old entries, failed save restores committed checkbox');
 await page.locator('[data-action="resources-delete"]').nth(1).click();assert.equal(await page.locator('.resources-cache-confirm').count(),1);assert.equal(await page.evaluate(()=>fixture.calls.filter(c=>c.action==='resources.clear').length),0);
 await page.keyboard.press('Escape');assert.equal(await page.locator('.resources-cache-confirm').count(),0);assert.equal(await page.locator('.resources-cache-entry').count(),3);
 await page.locator('[data-action="resources-delete"]').nth(1).click();await page.evaluate(()=>fixture.failClear=true);await page.locator('[data-action="resources-confirm"]').click();await ready();assert.match(await page.locator('.resources-cache-confirm [role="alert"]').innerText(),/Synthetic cache deletion failure/);assert.equal(await page.evaluate(()=>fixture.cache().conversations.length),3);
 await page.evaluate(()=>fixture.failClear=false);await page.locator('[data-action="resources-confirm"]').focus();await page.keyboard.press('Enter');await page.locator('.resources-cache-confirm').waitFor({state:'detached'});await ready();
 assert.deepEqual(await page.evaluate(()=>fixture.cache().conversations.map(row=>row.key)),['local-"one"','server-two/same-id']);
 await page.locator('[data-action="resources-clear-all"]').click();await page.locator('[data-action="manager-dialog-cancel"]').click();assert.equal(await page.locator('.resources-cache-entry').count(),2);
 await page.locator('[data-action="resources-clear-all"]').click();await page.locator('[data-action="resources-confirm"]').click();await page.locator('.resources-cache-confirm').waitFor({state:'detached'});assert.equal(await page.locator('.resources-cache-entry').count(),0);assert.equal(await page.locator('[data-action="resources-clear-all"]').isDisabled(),true);
 await page.evaluate(()=>window.fixtureCorrupt=true);await page.locator('[data-action="manager-refresh"]').click();await ready();assert.match(await page.locator('#resourcesCacheFeedback').innerText(),/could not be read/);assert.equal(await page.locator('[data-action="resources-clear-all"]').isDisabled(),false);await page.locator('[data-action="resources-clear-all"]').click();await page.locator('[data-action="resources-confirm"]').click();await page.locator('.resources-cache-confirm').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.fixtureCorrupt),false);
 assert.equal(await page.evaluate(()=>fixture.calls.some(c=>['manager.mutate','manager.backup','manager.restore','external.open'].includes(c.action))),false);
 checks.push('In-window individual/all confirmations, Escape/Cancel, keyboard confirmation, failed delete retained rows, same-ID Server sources isolated, zero-count corrupt cache repair reachable, no archive or external-dialog operations');
 await page.evaluate(()=>{fixture.seed();window.fixtureLimit=true;});await page.locator('[data-action="manager-refresh"]').click();await ready();assert.match(await page.locator('#resourcesCacheFeedback').innerText(),/cache is full/);
 await close();await page.evaluate(()=>fixture.recovery=true);await open();assert.equal(await page.locator('.resources-cache-entry').count(),3);await close();
 checks.push('Cache limit notice and cache management remain available during local archive recovery');
 for(const language of ['en','hu','de','fr','ja'])for(const palette of UI_PALETTE_IDS)for(const theme of ['light','dark']){
  if(palette===UI_PALETTE_IDS[0]&&theme==='light')console.log('Resources Cache matrix: '+language);
  await go('?'+new URLSearchParams({language,uiPalette:palette,theme,fontSize:'xl'}));await open();
  assert.equal(await page.locator('#resourcesCacheTitle').innerText(),dictionaries[language].resourcesCache);assert.equal(await page.locator('#resourcesCacheHelp').innerText(),dictionaries[language].resourcesCacheHelp);
  await inspect(`${language}/${palette}/${theme}/cache`);
  if(process.env.READER_RESOURCES_UI_SCREENSHOTS&&palette==='platinum-plus'&&['en','ja'].includes(language)){await fs.mkdir(process.env.READER_RESOURCES_UI_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.READER_RESOURCES_UI_SCREENSHOTS,`resources-cache-${theme}-${language}.png`)});}
  await page.locator('[data-action="resources-delete"]').last().click();await inspect(`${language}/${palette}/${theme}/confirmation`);
  if(process.env.READER_RESOURCES_UI_SCREENSHOTS&&palette==='platinum-plus'&&language==='ja'){
   await fs.mkdir(process.env.READER_RESOURCES_UI_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.READER_RESOURCES_UI_SCREENSHOTS,`resources-confirm-${theme}-ja.png`)});
  }
 }
 checks.push('All 19 palettes × 5 languages × 2 color modes, XL text at 680×540; cache view and confirmation fit their scroll panel');
 await go();await page.locator('[data-action="about"]').click();assert.match(await page.locator('.about-brand').innerText(),/1\.1\.0/s);assert.doesNotMatch(await page.locator('.modal').innerText(),/Reader Plus|ThreadShelf Reader 3\.1\.1|Revision/);await page.locator('.modal-header [data-action="modal-close"]').click();
 await page.evaluate(()=>{localStorage.setItem('fixture-cache','{"enabled":false,"conversations":[]}');});await page.reload();await page.locator('.conversation-row').waitFor();await page.locator('.conversation-row').click();
 await page.waitForFunction(()=>document.querySelectorAll('.reader-markdown-image-content').length===2&&[...document.querySelectorAll('.reader-markdown-image-content')].every(n=>n.complete&&n.naturalWidth===32));
 let calls=await page.evaluate(()=>fixture.calls);assert.equal(calls.filter(c=>c.action==='resources.context').length,1,'Two images share one lazy captured conversation context');
 const localContext=calls.find(c=>c.action==='resources.context').args;assert.equal(localContext.mode,'local');assert.equal(localContext.id,'local-thread');assert.deepEqual(Object.keys(localContext).sort(),['collection','conversationKey','id','mode','serverUrl','sourceFile'].sort());
 assert.equal(calls.filter(c=>c.action==='resources.load').length,2);assert.ok(calls.filter(c=>c.action==='resources.load').every(c=>/^[a-z0-9]{32}$/i.test(c.args.requestId)));
 await page.locator('[data-action="mode-server"]').click();await page.locator('.conversation-row').waitFor();await page.locator('.conversation-row').click();await page.waitForFunction(()=>fixture.calls.filter(c=>c.action==='resources.load').length===4);
 calls=await page.evaluate(()=>fixture.calls);assert.equal(calls.filter(c=>c.action==='resources.context').at(-1).args.mode,'server');assert.match(calls.filter(c=>c.action==='resources.context').at(-1).args.serverUrl,/server-one\.test/);assert.equal(Object.hasOwn(calls.filter(c=>c.action==='resources.context').at(-1).args,'id'),false,'Optional missing Server id is omitted');
 checks.push('Public About version and no personal product labels; cache-disabled automatic authorized image loads share one immutable local context, then acquire a separate Server context; raster cache response loads inline');
 await page.locator('[data-action="close-thread"]').click();
 const beforePending=await page.evaluate(()=>fixture.calls.filter(c=>c.action==='resources.load').length);
 await page.evaluate(()=>{fixture.loadGate=new Promise(resolve=>fixture.releaseLoad=resolve);});
 await page.locator('.conversation-row').click();await page.waitForFunction(count=>fixture.calls.filter(c=>c.action==='resources.load').length===count+2,beforePending);
 await page.locator('[data-action="close-thread"]').click();await page.waitForFunction(()=>fixture.calls.filter(c=>c.action==='resources.cancel').length===2);
 await page.evaluate(()=>{fixture.releaseLoad();fixture.loadGate=null;});await page.waitForTimeout(100);assert.equal(await page.locator('.message').count(),0);
 const beforeContext=await page.evaluate(()=>fixture.calls.filter(c=>c.action==='resources.context').length),beforeAbortLoad=await page.evaluate(()=>fixture.calls.filter(c=>c.action==='resources.load').length);
 await page.evaluate(()=>{fixture.contextGate=new Promise(resolve=>fixture.releaseContext=resolve);});await page.locator('.conversation-row').click();await page.waitForFunction(count=>fixture.calls.filter(c=>c.action==='resources.context').length===count+1,beforeContext);await page.locator('[data-action="close-thread"]').click();
 await page.evaluate(()=>{fixture.releaseContext();fixture.contextGate=null;});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>fixture.calls.filter(c=>c.action==='resources.load').length),beforeAbortLoad);
 checks.push('Closing a conversation cancels both pending image requests; closing during lazy context resolution prevents load dispatch and stale image resurrection');
 await page.evaluate(()=>{localStorage.setItem('fixture-cache','{"enabled":false,"conversations":[]}');localStorage.setItem('fixture-settings',JSON.stringify({...fixture.settings,remoteImages:'click'}));});await page.reload();await page.locator('.conversation-row').waitFor();await page.locator('.conversation-row').click();await page.locator('.reader-image-load').first().waitFor();
 assert.equal(await page.evaluate(()=>fixture.calls.filter(c=>c.action.startsWith('resources.')).length),0,'Click mode keeps a disabled empty cache idle until the user requests an image');
 await page.locator('.reader-image-load').first().click();
 await page.waitForFunction(()=>fixture.calls.filter(c=>c.action==='resources.load').length===1);
 assert.equal(await page.evaluate(()=>fixture.calls.filter(c=>c.action==='resources.context').length),1);
 await page.waitForFunction(()=>document.querySelector('.reader-markdown-image-content')?.naturalWidth===32);
 checks.push('Default-off empty cache stays idle in Click mode and routes the clicked image through the validated bridge without direct network requests');

 assert.deepEqual(errors,[]);assert.deepEqual(dialogs,[]);assert.deepEqual(externalRequests,[]);
 report={passed:true,version:'1.2.0',browser:browser.version(),checks,geometry,paletteCount:UI_PALETTE_IDS.length,localeCount:5,colorModes:2,minimumViewport:{width:680,height:540},geometryCases:geometry.length,pageErrors:errors,nativeDialogs:dialogs,externalRequests};
 console.log(JSON.stringify({passed:true,checks:checks.length,geometryCases:geometry.length}));
}catch(error){report={passed:false,error:error.stack,checks,geometry,pageErrors:errors,nativeDialogs:dialogs,externalRequests};throw error;}
finally{await fs.mkdir(path.dirname(evidence),{recursive:true});await fs.writeFile(evidence,JSON.stringify(report,null,2)+'\n');await browser.close();await new Promise(resolve=>server.close(resolve));await fs.rm(tmp,{recursive:true,force:true});}
