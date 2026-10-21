#!/usr/bin/env node
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {releaseFilename} from '../scripts/release-filenames.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const playwright=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');
const tmp=await mkdtemp(path.join(os.tmpdir(),'threadshelf-preview-test-'));
await writeFile(path.join(tmp,'main.cjs'),`const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({width:1280,height:850,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});w.loadFile(${JSON.stringify(path.join(root,'release',releaseFilename(`ThreadShelf-Local-Reader-${version}-Preview.html`)))})});`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await playwright._electron.launch({executablePath:process.env.READER_ELECTRON||path.join(root,'node_modules/electron/dist/electron'),args:['--no-sandbox','--disable-gpu',path.join(tmp,'main.cjs')],env});
try {
 const page=await app.firstWindow();const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/i.test(r.url()))requests.push(r.url())});
 await page.waitForFunction(()=>document.querySelectorAll('.message').length>5);
 await page.waitForFunction(()=>document.querySelectorAll('.mermaid-block[data-mermaid-state="repaired"]').length===1);
 await page.waitForFunction(()=>document.querySelectorAll('mjx-container').length===2);
 assert.equal(await page.locator('.conversation-row').count(),25);
 assert.equal(await page.locator('.mermaid-block').count(),2);
 assert.equal(await page.locator('#previewLabel').isVisible(),true);
 const isolatedReading=await page.evaluate(async()=>{
  const saved=structuredClone(window.__previewState.reading),api=window.desktop;
  const local={mode:'local',id:'preview-isolation-local'},serverA={mode:'server',serverUrl:'http://127.0.0.1:34567',id:'preview-isolation-server-a'},serverB={mode:'server',serverUrl:'http://127.0.0.1:34568/',id:'preview-isolation-server-b'};
  const keys=[local,serverA,serverB].map(ref=>JSON.stringify(ref));
  try{
   for(const [index,ref] of [local,serverA,serverB].entries()){
    await api.invoke('reading.save',{key:keys[index],position:{turnIndex:0,role:'user',offset:0,ref},bookmark:{turnIndex:0,role:'user',ref}});
   }
   let reading=await api.invoke('reading.save',{key:'',clear:'all',sourceScope:{mode:'server',serverUrl:'http://127.0.0.1:34567/'}});
   const serverClearPreservesOthers=[keys[0],keys[2]].every(key=>reading.positions[key]&&reading.bookmarks.some(item=>item.key===key))&&!reading.positions[keys[1]]&&!reading.bookmarks.some(item=>item.key===keys[1]);
   reading=await api.invoke('reading.save',{key:'',clear:'bookmarks',sourceScope:{mode:'local'}});
   const localClearPreservesServer=Boolean(reading.positions[keys[0]])&&!reading.bookmarks.some(item=>item.key===keys[0])&&reading.bookmarks.some(item=>item.key===keys[2]);
   return {serverClearPreservesOthers,localClearPreservesServer};
  }finally{window.__previewState.reading=saved;}
 });
 assert.deepEqual(isolatedReading,{serverClearPreservesOthers:true,localClearPreservesServer:true});
 const copyButton=page.locator('pre:not(.language-mermaid) .code-copy-button').first();
 const originalCode=await copyButton.evaluate(button=>{const code=button.closest('pre').querySelector('code');return code.dataset.originalCode??code.textContent});
 await app.evaluate(({clipboard})=>clipboard.writeText('preview-copy-check'));
 await copyButton.click();await page.waitForFunction(()=>document.querySelector('pre:not(.language-mermaid) .code-copy-button')?.textContent==='Copied');
 assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()),originalCode);
 // Exercise the real browser fallback; no synthetic clipboard writer is supplied.
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined}));
 await app.evaluate(({clipboard})=>clipboard.writeText('preview-fallback-check'));
 await copyButton.click();
 assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()),originalCode);
 await page.locator('[data-action="page-next"]').click();
 assert.equal(await page.locator('.conversation-row').count(),3);
 await page.locator('[data-action="page-prev"]').click();
 for(const language of ['hu','de','fr','ja','en']){
  await page.locator('[data-action="settings"]').click();await page.locator('#prefLanguage').selectOption(language);await page.locator('#settingsForm button[type="submit"]').click();
  await page.waitForFunction(l=>document.documentElement.lang===l,language);await page.locator('#settingsForm').waitFor({state:'detached'});if(language==='ja'){assert.equal(await page.locator('.message-copy-button').first().textContent(),'メッセージをコピー');assert.equal(await page.locator('[data-action="settings"]').getAttribute('title'),'設定');assert.equal(await copyButton.evaluate(button=>button.closest('pre').querySelector('code').dataset.originalCode),originalCode);}
 }
 await page.locator('[data-action="settings"]').click();await page.locator('#prefTheme').selectOption('dark');await page.locator('#settingsForm button[type="submit"]').click();
 await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
 await page.locator('#settingsForm').waitFor({state:'detached'});
 const appearance=async(values)=>{await page.locator('[data-action="settings"]').click();for(const [id,value] of Object.entries(values))await page.locator('#'+id).selectOption(value);await page.locator('#settingsForm button[type="submit"]').click();await page.locator('#settingsForm').waitFor({state:'detached'});await page.evaluate(()=>Promise.all(document.getAnimations().filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{}))));};
 const codeColor=()=>page.locator('.hljs-keyword').first().evaluate(el=>getComputedStyle(el).color);
 await appearance({prefUiPalette:'ocean',prefCodeTheme:'github'});
 assert.deepEqual(await page.evaluate(()=>[document.documentElement.dataset.uiPalette,document.documentElement.dataset.codeTheme]),['ocean','github']);
 const githubColor=await codeColor();
 await appearance({prefUiPalette:'forest'});
 assert.deepEqual(await page.evaluate(()=>[window.__previewState.settings.uiPalette,window.__previewState.settings.codeTheme]),['forest','github']);
 assert.equal(await codeColor(),githubColor);
 await appearance({prefCodeTheme:'monokai'});
 assert.deepEqual(await page.evaluate(()=>[document.documentElement.dataset.uiPalette,document.documentElement.dataset.codeTheme]),['forest','monokai']);
 assert.notEqual(await codeColor(),githubColor);
 for(const [index,palette] of ['platinum','vellum','prism','nocturne','garnet'].entries()){
  const code=index%2?'ayu':'xcode';await appearance({prefUiPalette:palette,prefCodeTheme:code});
  assert.deepEqual(await page.evaluate(()=>[document.documentElement.dataset.uiPalette,document.documentElement.dataset.codeTheme]),[palette,code]);
  assert.equal(await copyButton.evaluate(button=>button.closest('pre').querySelector('code').dataset.originalCode),originalCode);
  const before=await codeColor();await appearance({prefUiPalette:palette==='garnet'?'nocturne':'garnet'});assert.equal(await codeColor(),before);
 }
 await page.locator('[data-action="settings"]').click();await page.locator('[data-action="settings-tab"][data-tab="databaseManager"]').click();await page.waitForFunction(()=>!document.querySelector('#managerRoot fieldset')?.disabled);await page.locator('[data-action="manager-view"][data-view="storage"]').click();assert.ok((await page.locator('#storagePreviewNotice').textContent()).includes('Preview simulation only'));
 await page.selectOption('#storageProfile','zip6');await page.locator('[data-action="storage-convert"]').click();await page.waitForFunction(()=>document.querySelector('#storageActiveProfile')?.dataset.profile==='zip6'&&!document.querySelector('#managerRoot fieldset').disabled);assert.equal(await page.evaluate(()=>window.__previewState.storageProfile),'zip6');
 await page.selectOption('#storageProfile','7z');await page.locator('[data-action="storage-convert"]').click();await page.locator('#modalOperation [data-action="cancel-operation"]').click();await page.waitForFunction(()=>!document.querySelector('#managerRoot fieldset').disabled);assert.equal(await page.locator('#storageActiveProfile').getAttribute('data-profile'),'zip6');await page.locator('.modal-header [data-action="modal-close"]').click();
 await page.locator('[data-action="import-dialog"]').click();await page.locator('[data-action="pick-import-files"]').click();
 assert.ok((await page.locator('#toastRoot').textContent()).includes('Offline preview'));await page.locator('[data-action="modal-close"]').first().click();
 await page.keyboard.press('Control+k');
 await page.waitForFunction(()=>document.querySelector('#searchToggle')?.getAttribute('aria-expanded')==='true');
 await page.locator('#archiveSearch').fill('archive');await page.locator('#searchForm').evaluate(el=>el.requestSubmit());await page.waitForTimeout(500);assert.ok(await page.locator('.conversation-row').count());
 await page.locator('[data-action="workspace-analytics"]').click();
 await page.waitForFunction(()=>document.querySelectorAll('.mosaic-day').length>300&&!document.querySelector('#analyticsWorkspace .analytics-spinner'));
 const initialActivity=await page.evaluate(()=>window.desktop.invoke('activity.query',{year:'all',branch:'all',zone:'utc'}));
 const activeActivity=await page.evaluate(()=>window.desktop.invoke('activity.query',{year:'all',branch:'active',zone:'utc'}));
 assert.equal(initialActivity.coverage.original,8);assert.equal(initialActivity.coverage.normalized,20);assert.equal(initialActivity.summary.messages-activeActivity.summary.messages,8);
 await page.locator('[data-activity-action="tab"][data-tab="graphs"]').click();assert.ok(await page.locator('.analytics-timeline').count());
 await page.locator('[data-activity-filter="bucket"]').selectOption('weekly');
 await page.waitForFunction(()=>!document.querySelector('#analyticsWorkspace .analytics-spinner'));
 const csv=await page.evaluate(()=>window.desktop.invoke('activity.csv',{year:'all',zone:'utc'}));assert.ok(csv.csv.startsWith('\uFEFF"date"'));assert.ok(csv.csv.includes('\r\n'));
 await app.evaluate(({session},file)=>{global.previewDownload={};session.defaultSession.once('will-download',(_event,item)=>{item.setSavePath(file);item.once('done',(_event,state)=>global.previewDownload={state,path:file});});},path.join(tmp,'Activity.csv'));
 await page.locator('[data-activity-action="export"]').click();
 await page.waitForTimeout(300);const downloaded=await app.evaluate(()=>global.previewDownload);assert.equal(downloaded.state,'completed');assert.ok((await readFile(downloaded.path,'utf8')).startsWith('\uFEFF"date"'));
 await page.locator('[data-action="mode-server"]').click();
 await page.waitForFunction(()=>document.querySelector('#analyticsWorkspace')?.textContent.includes('Indexed passages')&&!document.querySelector('#analyticsWorkspace .analytics-spinner'));
 assert.ok(await page.locator('#analyticsWorkspace [data-activity-action="open"]').count());
 await page.locator('#analyticsWorkspace [data-activity-action="open"]').first().click();await page.waitForFunction(()=>document.querySelector('.shell')?.dataset.workspace==='reader'&&document.querySelectorAll('.message').length>0);
 await page.locator('[data-action="workspace-analytics"]').click();await page.waitForFunction(()=>!document.querySelector('#analyticsWorkspace .analytics-spinner'));
 await page.locator('[data-action="mode-local"]').click();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(680,540));
 assert.deepEqual(await page.evaluate(()=>({x:document.documentElement.scrollWidth>innerWidth,y:document.documentElement.scrollHeight>innerHeight})),{x:false,y:false});
 assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({offlinePreview:'PASS',fileAccess:'file://',networkRequests:requests.length,rendering:['MathJax','Mermaid original + repair'],interactions:['pagination','five locales including Japanese','dark theme','independent interface/code themes including all five new UI / two code palettes','native clipboard / browser fallback','source-scoped reading clears','search drawer / Ctrl+K','search','labelled compression simulation / cancellation','blocked import','synthetic Local Activity / branch counting / graphs','CSV browser download','synthetic Server Insights / reader drilldown','680x540 no window overflow']},null,2));
}finally{await app.close();await rm(tmp,{recursive:true,force:true})}
