#!/usr/bin/env node
// Actual Electron/IPC workflow against a temporary synthetic archive.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const {_electron}=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');
import {ApplicationService} from '../src/core/service.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'reader-dedup-ui-')),dataDir=path.join(temp,'profile');
const evidence=process.env.READER_EVIDENCE||path.join(temp,'evidence');await fs.mkdir(evidence,{recursive:true});
const service=await new ApplicationService({dataDir}).init();
await service.handle('settings.save',{values:{mode:'local',language:'en',theme:'light',animations:false,localCollection:'all'}});
for(let index=0;index<30;index++)for(const long of [false,true]){
 const id=`history-${index}-${long?'long':'short'}`,title=`History ${String(index).padStart(2,'0')}`;
 await service.commitMutation(service.store.prepareUpsert({provider:'venice',collection:'Synthetic archive',conversationKey:id,sourceFile:id+'.json',title,turns:[{user:'Shared prompt '+index,turn_index:0},{ai:'Shared answer '+index,model:'Example model',turn_index:1},...(long?[{user:'Continuation '+index,turn_index:2},{ai:'The continued answer '+index,model:'Example model',turn_index:3}]:[])]}));
}
await service.commitMutation(service.store.prepareUpsert({provider:'venice',collection:'Synthetic archive',conversationKey:'single',sourceFile:'single.json',title:'Unanswered optional prompt',turns:[{user:'Keep this unless selected for cleanup',turn_index:0}]}));
await service.handle('shutdown');
const harness=path.join(temp,'harness');await fs.mkdir(harness);await fs.writeFile(path.join(harness,'package.json'),JSON.stringify({name:'deduplication-browser-test',version:'1.0.0',main:'main.cjs'}));
await fs.writeFile(path.join(harness,'main.cjs'),`const {app}=require('electron');${process.env.READER_TEST_SOCKETLESS==='1'?'app.requestSingleInstanceLock=()=>true;':''}require(${JSON.stringify(path.join(root,'src/desktop/main.cjs'))});`);
const env={...process.env,THREADSHELF_READER_TEST_DATA:dataDir};delete env.ELECTRON_RUN_AS_NODE;
let app,page;const errors=[],checks=[],geometry=[];
const action=name=>page.locator(`[data-action="${name}"]`);
const api=(name,args={})=>page.evaluate(([name,args])=>window.desktop.invoke(name,args),[name,args]);
const ready=()=>page.waitForFunction(()=>document.querySelector('#managerRoot fieldset')&&!document.querySelector('#managerRoot fieldset').disabled);
async function inspect(label){
 const result=await page.evaluate(()=>{
  const modal=document.querySelector('.modal'),panel=document.querySelector('.dedup-review-window .modal-body')||document.querySelector('.settings-panel');
  const rect=modal.getBoundingClientRect();return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,rect:rect.toJSON(),panelClient:panel.clientWidth,panelScroll:panel.scrollWidth,review:!!document.querySelector('.dedup-review-window'),settingsVisible:!!document.querySelector('.settings-layout')?.getClientRects().length};
 });
 assert.ok(result.documentWidth<=result.width&&result.documentHeight<=result.height,label+' page overflow');assert.ok(result.rect.left>=0&&result.rect.top>=0&&result.rect.right<=result.width+1&&result.rect.bottom<=result.height+1,label+' modal outside viewport');assert.ok(result.panelScroll<=result.panelClient+1,label+' horizontal clipping');if(result.review)assert.equal(result.settingsVisible,false,'review must be outside settings');geometry.push({label,...result});await page.screenshot({path:path.join(evidence,label+'.png')});
}
try{
 app=await _electron.launch({chromiumSandbox:true,executablePath:process.env.READER_ELECTRON||path.join(root,'node_modules/electron/dist/electron'),args:['--disable-gpu',harness],env,timeout:45000});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await action('settings').waitFor();
 await app.evaluate(({BrowserWindow,app})=>{const win=BrowserWindow.getAllWindows()[0];win.setSize(680,540);globalThis.__testSandbox=win.webContents.getLastWebPreferences().sandbox&&!app.commandLine.hasSwitch('no-sandbox');});
 assert.equal(await app.evaluate(()=>globalThis.__testSandbox),true);
 await action('settings').click();await page.locator('[data-tab="databaseManager"]').click();await ready();assert.equal(await page.locator('#managerRoot .manager-tabs button').count(),5);
 await page.locator('[data-view="deduplication"]').click();await inspect('Deduplication-Settings-en-light-680x540');
 await page.locator('#dedupOtherAutomatic').click();await page.locator('[data-action="dedup-enable-confirm"]').waitFor();assert.equal((await api('manager.status')).deduplication.deleteOtherPromptOnlyAutomatically,false);await page.locator('.modal-footer [data-action="modal-close"]').click();assert.equal((await api('manager.status')).deduplication.deleteOtherPromptOnlyAutomatically,false);
 await page.locator('#dedupOtherAutomatic').click();await action('dedup-enable-confirm').click();await page.locator('#dedupOtherAutomatic').waitFor();assert.equal((await api('manager.status')).deduplication.deleteOtherPromptOnlyAutomatically,true);await page.locator('#dedupOtherAutomatic').click();await page.waitForFunction(()=>!document.querySelector('#dedupOtherAutomatic')?.disabled);assert.equal((await api('manager.status')).deduplication.deleteOtherPromptOnlyAutomatically,false);checks.push('Destructive automatic option defaults off; Cancel preserves off; confirmation enables; disabling needs no confirmation');
 await action('dedup-review').click();await action('dedup-scan').click();await page.waitForFunction(()=>document.querySelectorAll('[data-dedup-id]').length===25);assert.equal(await page.locator('.dedup-review-entry').count(),25);await inspect('Deduplication-Review-en-light-680x540');
 assert.match(await page.locator('.dedup-review-list').innerText(),/Shorter matching history/);await action('dedup-next').click();assert.equal(await page.locator('.dedup-review-entry').count(),5);await action('dedup-prev').click();
 await action('dedup-select-none').click();await page.locator('[data-dedup-id]').first().check();assert.equal(await action('dedup-apply').isDisabled(),false);await action('dedup-apply').click();await page.waitForFunction(()=>document.querySelector('[data-action="dedup-apply"]')?.disabled&&!document.querySelector('.dedup-review-window .modal-header button')?.disabled);assert.equal((await api('manager.status')).collections[0].count,60);checks.push('Independent review window paginates 30 actual candidates; applies only one selected cleanup');
 await page.locator('.dedup-review-window .modal-footer [data-action="modal-close"]').click();await ready();
 for(const [language,theme] of [['hu','dark'],['de','light'],['fr','dark'],['ja','light']]){
  await page.locator('.modal-header [data-action="modal-close"]').click();await api('settings.save',{values:{language,theme}});await page.reload();await action('settings').waitFor();await action('settings').click();await page.locator('[data-tab="databaseManager"]').click();await ready();await page.locator('[data-view="deduplication"]').click();await inspect(`Deduplication-Settings-${language}-${theme}-680x540`);await action('dedup-review').click();await action('dedup-scan').click();await page.waitForFunction(()=>document.querySelectorAll('[data-dedup-id]').length>0);await inspect(`Deduplication-Review-${language}-${theme}-680x540`);await page.locator('.dedup-review-window .modal-footer [data-action="modal-close"]').click();await ready();
 }
 checks.push('All five locales fit native 680×540 viewport; light/dark themes retained; Settings hidden during independent review');
 const settingsTabs=['appearance','reading','textToSpeech','sources','searchSettings','databaseManager','data'];
 for(const language of ['en','hu','de','fr','ja'])for(const theme of ['light','dark']){
  await page.locator('.modal-header [data-action="modal-close"]').click();await api('settings.save',{values:{language,theme}});await page.reload();await action('settings').waitFor();await action('settings').click();
  for(const tab of settingsTabs){
   await page.locator(`[data-action="settings-tab"][data-tab="${tab}"]`).click();if(tab==='databaseManager')await ready();
   await inspect(`Settings-${language}-${theme}-${tab}-680x540`);
   const controls=await page.evaluate(()=>{const p=document.querySelector('.settings-panel'),r=p.getBoundingClientRect();return [...p.querySelectorAll('button,input,select,textarea')].filter(e=>e.getClientRects().length).map(e=>({id:e.id||e.dataset.action,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,panelLeft:r.left,panelRight:r.right}));});
   for(const control of controls)assert.ok(control.left>=control.panelLeft-1&&control.right<=control.panelRight+1,`${language} ${theme} ${tab} clipped control ${control.id}`);
   await page.evaluate(()=>{const p=document.querySelector('.settings-panel');p.scrollTop=p.scrollHeight;});
   await page.screenshot({path:path.join(evidence,`Settings-${language}-${theme}-${tab}-bottom-680x540.png`)});
  }
 }
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1320,880));await page.locator('[data-tab="databaseManager"]').click();await ready();await page.locator('[data-view="deduplication"]').click();await inspect('Deduplication-Settings-wide');await action('dedup-review').click();await action('dedup-scan').click();await page.waitForFunction(()=>document.querySelectorAll('[data-dedup-id]').length>0);await inspect('Deduplication-Review-wide');
 checks.push('Every existing Settings category fits at 680×540 in all 5 locales and both themes; all controls stay inside the panel; bottom content remains reachable; wide review also checked');assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(evidence,'deduplication-ui-results.json'),JSON.stringify({passed:true,sandbox:true,chromiumSandboxEnabled:true,socketlessHarness:process.env.READER_TEST_SOCKETLESS==='1',checks,geometry,pageErrors:errors},null,2));console.log(JSON.stringify({passed:true,chromiumSandboxEnabled:true,checks,pageErrors:errors,evidence},null,2));
}catch(error){await page?.screenshot({path:path.join(evidence,'Failure.png')}).catch(()=>{});throw error;}finally{await app?.close().catch(()=>{});await fs.rm(temp,{recursive:true,force:true});}
