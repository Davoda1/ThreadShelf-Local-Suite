#!/usr/bin/env node
// Actual bundled UI in Electron; synthetic IPC controls conversion commit/failure
// deterministically. Codec and durability behavior have separate core tests.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {dictionaries,locales} from '../src/ui/i18n.js';
const root=fileURLToPath(new URL('..',import.meta.url));
const appRoot=process.env.READER_APP_ROOT?path.resolve(process.env.READER_APP_ROOT):root;
const require=createRequire(import.meta.url);
const {_electron}=process.env.THREADSHELF_PLAYWRIGHT_MODULE?await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE):require('playwright');
const temp=await mkdtemp(path.join(os.tmpdir(),'tslr-storage-settings-200-'));
const evidence=path.resolve(process.env.READER_EVIDENCE||path.join(root,'docs/evidence/v2.0.0/storage-settings'));
await mkdir(evidence,{recursive:true});
await writeFile(path.join(temp,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('desktop',{invoke:(a,b)=>ipcRenderer.invoke('call',a,b),onProgress:fn=>ipcRenderer.on('progress',(_event,p)=>fn(p)),onMenu:()=>{}});`);
function mockMain(config){
 const {app,BrowserWindow,ipcMain}=require('electron');app.setPath('userData',config.profile);
 global.uiSettings={language:'en',mode:'local',theme:'light',uiPalette:'default',codeTheme:'default',fontSize:'normal',highContrast:false,compact:true,animations:false,listMode:'pages',pageSize:50,sort:'updated',localCollection:'all',serverCollection:'all',serverUrl:'http://127.0.0.1:3000/',serverAddresses:[],directoryMode:'last',customDirectory:'',searchPanelExpanded:false,searchMode:'keyword',ollamaUrl:'http://127.0.0.1:11434',ollamaModel:''};
 global.storage={profile:'7z',compressedBytes:150000,temporaryBytes:45000,catalogBytes:32000,cacheBytes:13000,indexBytes:7000,recoveryBytes:0,pendingCleanupBytes:0,conversionRequiredBytes:67500000};
 global.calls=[];global.pending=null;
 const reading={positions:{},bookmarks:[],recent:[]};
 ipcMain.handle('call',async(_event,action,args={})=>{
  global.calls.push({action,args});
  if(action==='bootstrap')return {settings:global.uiSettings,reading,dataDir:'/synthetic/profile',version:'3.0.0',searchStatus:{modelReady:false,indexedPassages:0}};
  if(action==='settings.save')return global.uiSettings={...global.uiSettings,...args.values};
  if(action==='collections'||action==='server.collections')return {collections:[]};
  if(action==='files')return {files:[],total:0};
  if(action==='manager.status')return {revision:12,collections:[],storage:global.storage,searchStatus:{indexedPassages:0}};
  if(action==='search.status')return {modelReady:false,indexedPassages:0};
  if(action==='ollama.models')return {available:false,installed:false,isLocal:true,models:[],details:[]};
  if(action==='storage.convert')return new Promise((resolve,reject)=>{global.pending={resolve,reject,profile:args.profile};global.window.webContents.send('progress',{operation:'storage.convert',phase:'convert',current:1,total:10,cancellable:true});});
  if(action==='operation.cancel'){global.pending?.resolve({cancelled:true});global.pending=null;return {ok:true};}
  if(action==='manager.maintenance'){if(args.operation==='clearCache')global.storage.cacheBytes=0;if(args.operation==='cleanup')global.storage.pendingCleanupBytes=0;return {ok:true,info:'Completed'};}
  return {};
 });
 global.finishConversion=(outcome)=>{const pending=global.pending;if(!pending)throw new Error('No pending conversion');global.pending=null;if(outcome==='fail'){pending.reject(new Error('Injected conversion failure'));return;}global.storage.profile=pending.profile;global.storage.pendingCleanupBytes=outcome==='cleanup'?4096:0;pending.resolve({ok:true,storage:global.storage});};
 app.whenReady().then(()=>{global.window=new BrowserWindow({width:680,height:540,show:true,webPreferences:{preload:config.preload,contextIsolation:true,nodeIntegration:false,sandbox:true}});global.window.setMenu(null);global.window.loadFile(config.page);});
}
await writeFile(path.join(temp,'main.cjs'),`(${mockMain.toString()})(${JSON.stringify({profile:path.join(temp,'profile'),preload:path.join(temp,'preload.cjs'),page:path.join(appRoot,'dist/index.html')})});`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
let app,page;const passed=[],geometry=[],errors=[];
const action=name=>page.locator(`#managerRoot [data-action="${name}"]`);
async function ready(){await page.waitForFunction(()=>{const el=document.querySelector('#managerRoot fieldset');return el&&!el.disabled;});}
async function manager(){await page.locator('.header-actions [data-action="settings"]').click();await page.locator('[data-action="settings-tab"][data-tab="databaseManager"]').click();await ready();await page.locator('[data-action="manager-view"][data-view="storage"]').click();await ready();}
async function inspect(label){
 const bounds=await page.evaluate(()=>{const modal=document.querySelector('.modal').getBoundingClientRect(),panel=document.querySelector('.settings-panel'),visible=e=>e.getClientRects().length>0;return {width:innerWidth,height:innerHeight,body:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],modal:modal.toJSON(),panel:[panel.clientWidth,panel.scrollWidth],controls:[...document.querySelectorAll('.storage-compression button,.storage-compression select,.modal-footer button')].filter(visible).map(e=>({name:e.id||e.dataset.action||e.type,rect:e.getBoundingClientRect().toJSON()}))};});
 assert.ok(bounds.body[0]<=bounds.width+1&&bounds.body[1]<=bounds.height+1,label+' body overflow');assert.ok(bounds.panel[1]<=bounds.panel[0]+1,label+' panel horizontal overflow');assert.ok(bounds.modal.x>=0&&bounds.modal.right<=bounds.width+1&&bounds.modal.y>=0&&bounds.modal.bottom<=bounds.height+1,label+' modal outside viewport');for(const c of bounds.controls)assert.ok(c.rect.x>=bounds.modal.x&&c.rect.right<=bounds.modal.right+1,label+' control horizontal clipping '+c.name);geometry.push({label,...bounds});
}
try{
 const keys=Object.keys(dictionaries.en).filter(key=>key.startsWith('storage'));for(const locale of locales)for(const key of keys){assert.equal(typeof dictionaries[locale][key],'string');assert.ok(dictionaries[locale][key]);assert.deepEqual([...dictionaries[locale][key].matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort(),[...dictionaries.en[key].matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort(),locale+' '+key+' interpolation parity');}
 passed.push('New storage controls have complete translations and matching parameters in all four established locales');
 app=await _electron.launch({executablePath:process.env.READER_ELECTRON||path.join(root,'node_modules/electron/dist/electron'),args:['--no-sandbox','--disable-gpu',path.join(temp,'main.cjs')],env});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.locator('.header-actions [data-action="settings"]').waitFor();await manager();
 assert.equal(await page.locator('#storageActiveProfile').getAttribute('data-profile'),'7z');assert.equal(await page.locator('#storageProfile').inputValue(),'7z');assert.equal(await action('storage-convert').isDisabled(),true);
 await page.selectOption('#storageProfile','zip6');assert.equal(await action('storage-convert').isEnabled(),true);assert.equal(await page.locator('#storageActiveProfile').getAttribute('data-profile'),'7z');await action('storage-convert').click();await page.locator('#modalOperation [role="progressbar"]').waitFor();assert.equal(await page.locator('#storageActiveProfile').getAttribute('data-profile'),'7z');assert.equal(await page.locator('#storageProfile').isDisabled(),true);await inspect('minimum-converting');await page.locator('#modalOperation [data-action="cancel-operation"]').click();await ready();assert.equal(await page.locator('#storageActiveProfile').getAttribute('data-profile'),'7z');assert.equal(await page.locator('#storageProfile').inputValue(),'7z');
 passed.push('Pending selection and conversion leave committed codec unchanged; cancellation resets from authoritative status');
 await page.selectOption('#storageProfile','zip6');await action('storage-convert').click();await app.evaluate(()=>global.finishConversion('success'));await ready();assert.equal(await page.locator('#storageActiveProfile').getAttribute('data-profile'),'zip6');assert.equal(await action('storage-convert').isDisabled(),true);
 await page.selectOption('#storageProfile','7z');await action('storage-convert').click();await app.evaluate(()=>global.finishConversion('fail'));await ready();await page.waitForFunction(()=>document.querySelector('#managerFeedback').textContent.includes('Injected conversion failure'));assert.equal(await page.locator('#storageActiveProfile').getAttribute('data-profile'),'zip6');assert.equal(await page.locator('#storageProfile').inputValue(),'zip6');passed.push('Successful conversion adopts new codec; failed conversion reports error while restoring confirmed active codec');
 await page.selectOption('#storageProfile','7z');await action('storage-convert').click();await app.evaluate(()=>{global.window.webContents.send('progress',{operation:'storage.convert',phase:'publish',current:10,total:10,cancellable:false});});await page.waitForFunction(()=>document.querySelector('#modalOperation [data-action="cancel-operation"]').disabled);await app.evaluate(()=>global.finishConversion('cleanup'));await ready();assert.equal(await page.locator('#storageActiveProfile').getAttribute('data-profile'),'7z');assert.match(await page.locator('.storage-cleanup').textContent(),/4 KiB/);await page.locator('[data-action="manager-maintenance"][data-operation="clearCache"]').click();await page.locator('.manager-dialog').waitFor();await ready();assert.equal(await app.evaluate(()=>global.storage.cacheBytes),0);await action('manager-dialog-cancel').click();assert.equal(await page.locator('#storageActiveProfile').getAttribute('data-profile'),'7z');passed.push('Commit phase disables cancellation; cleanup warning remains explicit; cache action calls supported maintenance API');
 for(const locale of locales){for(const size of [[680,540],[1100,780]]){await app.evaluate(({BrowserWindow},{locale,size})=>{global.uiSettings.language=locale;global.uiSettings.theme=locale==='de'||locale==='fr'?'dark':'light';BrowserWindow.getAllWindows()[0].setSize(...size);},{locale,size});await page.reload();await page.locator('.header-actions [data-action="settings"]').waitFor();await manager();await inspect(`${locale}-${size.join('x')}`);assert.equal(await page.locator('#storageProfile').inputValue(),'7z');if(size[0]===680)await page.screenshot({path:path.join(evidence,`Storage-Settings-${locale}-680x540.png`)});}}
 passed.push('Storage controls fit minimum and larger windows across four locales and both color modes');
 await page.selectOption('#storageProfile','zip6');const before=await app.evaluate(()=>global.calls.filter(call=>call.action==='storage.convert').length);await page.locator('#settingsForm button[type="submit"]').click();await page.locator('.modal').waitFor({state:'detached'});assert.equal(await app.evaluate(()=>global.calls.filter(call=>call.action==='storage.convert').length),before);assert.equal(await app.evaluate(()=>global.storage.profile),'7z');passed.push('Save settings never starts a conversion or changes the committed format implicitly');
 assert.deepEqual(errors,[]);const report={version:'3.0.0',passed,geometry,pageErrors:errors,scope:'Actual Electron UI with deterministic synthetic storage IPC; native codec tested separately'};await writeFile(path.join(evidence,'storage-settings-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({version:report.version,passed,pageErrors:errors},null,2));
}catch(error){await page?.screenshot({path:path.join(evidence,'Storage-Settings-Failure.png')}).catch(()=>{});throw error;}finally{await app?.close().catch(()=>{});await rm(temp,{recursive:true,force:true});}
