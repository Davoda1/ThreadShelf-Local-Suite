import { testModuleSpecifier } from './esm-module-specifier.mjs';
// Native renderer lifecycle test. The IPC harness delays only cleanup replies so
// navigation, progress and cancellation can be checked deterministically. The
// companion deduplication.browser.mjs exercises real archive deletion via IPC.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const { _electron } = await import(testModuleSpecifier(process.env.THREADSHELF_PLAYWRIGHT_MODULE || 'playwright'));
const root=fileURLToPath(new URL('..',import.meta.url));
const appRoot=path.resolve(process.env.READER_TEST_APP_ROOT||root);
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'reader-review-ui-'));
const evidence=process.env.READER_EVIDENCE||path.join(temp,'evidence');
await fs.mkdir(evidence,{recursive:true});
const harness=path.join(temp,'harness');await fs.mkdir(harness);
await fs.writeFile(path.join(harness,'package.json'),JSON.stringify({name:'reader-review-ui',version:'1.0.0',main:'main.cjs'}));
await fs.writeFile(path.join(harness,'main.cjs'),`
const {app,ipcMain,dialog}=require('electron');
dialog.showOpenDialog=async()=>({canceled:!globalThis.__importFile,filePaths:globalThis.__importFile?[globalThis.__importFile]:[]});
${process.env.READER_TEST_SOCKETLESS==='1'?'app.requestSingleInstanceLock=()=>true;':''}
const originalHandle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(channel,listener)=>originalHandle(channel,async(event,action,args)=>{
 if(channel==='reader:invoke'&&action==='import.paths'&&globalThis.__holdImport){
  await new Promise(resolve=>{globalThis.__importContinue=resolve;event.sender.send('reader:progress',{operation:'import',phase:'validating',current:1,total:4,message:'Synthetic import progress checkpoint',cancellable:true});});
  globalThis.__holdImport=false;
 }

 if(channel==='reader:invoke'&&['manager.dedup.preview','manager.dedup.apply'].includes(action)){
  return new Promise((resolve,reject)=>{globalThis.__reviewPending={action,args,resolve,reject};
   event.sender.send('reader:progress',{operation:action,phase:action.endsWith('preview')?'scanning':'applying',current:2,total:4,message:'Synthetic progress checkpoint',cancellable:action.endsWith('preview')});});
 }
 if(channel==='reader:invoke'&&action==='operation.cancel'&&globalThis.__reviewPending){
  const pending=globalThis.__reviewPending;globalThis.__reviewPending=null;pending.reject(new Error('Scan cancelled'));return {cancelled:true};
 }
 const result=await listener(event,action,args);
 if(channel==='reader:invoke'&&action==='import.paths'&&globalThis.__reportReclaimFailure)return {...result,cleanupPending:true,cleanupError:'Synthetic disk lock'};
 return result;
});
require(${JSON.stringify(path.join(appRoot,'src/desktop/main.cjs'))});
`);
const env={...process.env,THREADSHELF_READER_TEST_DATA:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
let app,page;const errors=[],checks=[],geometry=[];
const action=name=>page.locator(`[data-action="${name}"]`);
const api=(name,args={})=>page.evaluate(([name,args])=>window.desktop.invoke(name,args),[name,args]);
const closeReview=()=>page.locator('.dedup-review-window .modal-footer [data-action="modal-close"]').click();
const reviewProgress=()=>page.locator('.dedup-review-window #modalOperation [role="progressbar"]');
async function settle(){await page.waitForFunction(()=>document.querySelector('#operationBanner')?.hidden===true);}
async function finish(value){await app.evaluate((_,value)=>{const pending=globalThis.__reviewPending;if(!pending)throw Error('No pending cleanup request');globalThis.__reviewPending=null;pending.resolve(value);},value);await settle();}
async function inspect(label){
 const value=await page.evaluate(()=>{const modal=document.querySelector('.modal'),panel=modal.querySelector('.modal-body')||modal.querySelector('.settings-panel'),rect=modal.getBoundingClientRect();return{width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,rect:rect.toJSON(),panelClient:panel.clientWidth,panelScroll:panel.scrollWidth,bodyBottom:panel.getBoundingClientRect().bottom,footerTop:modal.querySelector('.modal-footer').getBoundingClientRect().top,listHeight:modal.querySelector('.dedup-review-list')?.getBoundingClientRect().height,space:[...modal.querySelectorAll('.dedup-space>div')].map(item=>({rect:item.getBoundingClientRect().toJSON(),label:item.querySelector('dt').getBoundingClientRect().toJSON(),value:item.querySelector('dd').getBoundingClientRect().toJSON()}))};});
 assert.ok(value.documentWidth<=value.width&&value.documentHeight<=value.height,label+' page overflow');
 assert.ok(value.rect.left>=0&&value.rect.top>=0&&value.rect.right<=value.width+1&&value.rect.bottom<=value.height+1,label+' modal overflow');
 assert.ok(value.panelScroll<=value.panelClient+1,label+' panel horizontal clipping');
 assert.ok(value.bodyBottom<=value.footerTop+1,label+' panel overlaps footer');
 if(value.listHeight!==undefined)assert.ok(value.listHeight>=32,label+' results area collapsed');
 if(value.space.length===2){
  const [expanded,free]=value.space;
  assert.ok(Math.abs(expanded.rect.top-free.rect.top)<=1,label+' size metrics must share one row');
  assert.ok(Math.abs(expanded.label.left-expanded.rect.left)<=1,label+' expanded database must align left');
  assert.ok(Math.abs(free.value.right-free.rect.right)<=1,label+' free disk space must align right');
  assert.ok(Math.abs(expanded.label.top-free.label.top)<=1&&Math.abs(expanded.value.top-free.value.top)<=1,label+' size metrics must stay symmetric');
  assert.ok(expanded.value.right<free.label.left,label+' size metrics must not overlap');
 }
 geometry.push({label,...value});await page.screenshot({path:path.join(evidence,label+'.png')});
}
async function openSettings(){await action('settings').click();await page.locator('[data-tab="databaseManager"]').click();await page.locator('[data-view="deduplication"]').waitFor();await page.locator('[data-view="deduplication"]').click();await action('dedup-review').waitFor();}
try{
 app=await _electron.launch({chromiumSandbox:true,executablePath:process.env.READER_ELECTRON||path.join(root,'node_modules/electron/dist/electron'),args:['--disable-gpu',harness],env,timeout:45000});
 assert.equal(await app.evaluate(({app})=>app.commandLine.hasSwitch('no-sandbox')),false);
 page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));await action('settings').waitFor();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(680,540));
 await openSettings();const revision=(await api('manager.status')).revision;
 await action('dedup-review').click();await page.locator('#dedupReviewOther').check();await action('dedup-scan').click();
 await page.waitForFunction(()=>document.querySelector('.dedup-review-window [role="progressbar"]')?.getAttribute('aria-valuenow')==='50');
 assert.equal(await reviewProgress().getAttribute('aria-valuenow'),'50');await inspect('Review-running-en-680x540');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('reader:progress',{operation:'activity',phase:'indexing',current:99,total:100,message:'Unrelated activity'}));
 assert.equal(await reviewProgress().getAttribute('aria-valuenow'),'50','unrelated progress must not replace cleanup progress');
 await closeReview();assert.equal(await action('dedup-review').isEnabled(),true,'review opener must remain usable while busy');
 assert.equal(await page.locator('#modalOperation [role="progressbar"]').getAttribute('aria-valuenow'),'50','settings must retain progress');
 await action('dedup-review').click();assert.equal(await reviewProgress().getAttribute('aria-valuenow'),'50');assert.equal(await page.locator('#dedupReviewOther').isChecked(),true);assert.equal(await action('dedup-scan').isDisabled(),true);
 await closeReview();
 const space={expandedDatabaseBytes:3*1024**3,conversationCount:1200,checks:[{freeBytes:20*1024**3,requiredBytes:1024**3},{freeBytes:50*1024**3,requiredBytes:1024**3}]};
 const entries=[{id:'shorter',title:'Shorter copy',collection:'Example',provider:'venice',model:'Example model',turnCount:2,keepId:'longer',keepTitle:'Longer copy',keepTurnCount:4,reason:'shorter'},
  {id:'history',keepId:'history',title:'Conversation with stored copies',collection:'Example',provider:'openai',turnCount:8,historyOnly:true,reason:'stored-history'}];
 await finish({revision,count:entries.length,entries,historyRecords:1,space});await action('dedup-review').click();
 assert.equal(await page.locator('[data-dedup-id]').count(),2,'results completed while hidden must remain available');
 assert.match(await page.locator('.dedup-space').innerText(),/3 GiB/);assert.match(await page.locator('.dedup-space').innerText(),/20 GiB/);assert.doesNotMatch(await page.locator('.dedup-space').innerText(),/50 GiB/);
 await action('dedup-select-none').click();await page.locator('[data-dedup-id="history"]').check();await closeReview();await action('dedup-review').click();
 assert.equal(await page.locator('[data-dedup-id="history"]').isChecked(),true);assert.equal(await page.locator('[data-dedup-id="shorter"]').isChecked(),false);
 assert.match(await page.locator('.dedup-history-repair').innerText(),/current conversation stays/i);await inspect('Review-results-en-680x540');
 checks.push('Expanded whole-conversation database size and lowest checked free-disk space are visible after scanning');
 checks.push('Determinate progress survives close/reopen, remains visible in settings, and ignores unrelated activity; results and checkbox selection survive closing');
 await action('dedup-apply').click();await page.waitForFunction(()=>document.querySelector('.dedup-review-window [role="progressbar"]')?.getAttribute('aria-valuenow')==='50');
 const applyArgs=await app.evaluate(()=>globalThis.__reviewPending.args);assert.deepEqual(applyArgs.ids,['history']);
 await closeReview();assert.equal(await action('dedup-review').isEnabled(),true);await action('dedup-review').click();assert.equal(await action('dedup-apply').isDisabled(),true);await closeReview();
 await finish({removedIds:[],historyCleaned:1,remap:{},operation:'deduplicate'});await action('dedup-review').click();
 assert.match(await page.locator('.dedup-summary').innerText(),/Stored superseded copies removed from 1 conversations/);
 checks.push('History-only selection describes retaining current conversation; apply view can close/reopen and retains completion');
 await action('dedup-scan').click();await reviewProgress().waitFor();await finish({revision,count:1,entries:[entries[1]],historyRecords:1,space});await action('dedup-apply').click();await reviewProgress().waitFor();
 await finish({removedIds:['shorter'],historyCleaned:1,remap:{},operation:'deduplicate',changed:true,cleanupPending:true,cleanupError:'Synthetic disk lock'});
 assert.match(await page.locator('.dedup-summary').innerText(),/1 conversation records removed/);assert.match(await page.locator('.dedup-summary').innerText(),/Some old stored data remains/);assert.doesNotMatch(await page.locator('.dedup-summary').innerText(),/Cleanup complete/);
 await closeReview();await action('dedup-review').click();assert.match(await page.locator('.dedup-summary').innerText(),/Synthetic disk lock/);checks.push('Committed cleanup with failed disk reclamation refreshes and keeps an explicit reopenable warning without claiming full completion');

 await action('dedup-scan').click();await reviewProgress().waitFor();await page.locator('#modalOperation [data-action="cancel-operation"]').click();await settle();
 assert.match(await page.locator('.dedup-summary').innerText(),/Scan cancelled/);assert.equal(await action('dedup-scan').isEnabled(),true);
 await closeReview();await action('dedup-review').click();assert.match(await page.locator('.dedup-summary').innerText(),/Scan cancelled/);await action('dedup-scan').click();await reviewProgress().waitFor();await finish({revision,count:0,entries:[]});
 assert.match(await page.locator('.dedup-summary').innerText(),/No matching cleanup candidates/);checks.push('Cancel uses existing operation control, preserves reopenable cancelled status, and allows rescan');
 await closeReview();await page.locator('.modal-header [data-action="modal-close"]').click();
 for(const language of ['en','hu','de','fr','ja'])for(const theme of ['light','dark']){
  await api('settings.save',{values:{language,theme}});await page.reload();await action('settings').waitFor();await openSettings();
  const automatic=page.locator('#dedupOtherAutomatic');
  const automaticText=await automatic.evaluate(input=>({label:input.nextElementSibling.firstChild.textContent,help:input.nextElementSibling.querySelector('.fine').textContent}));
  assert.match(automaticText.label,/Grok\/xAI/,language+' automatic label must name excluded provider');
  assert.match(automaticText.help,/Grok\/xAI/,language+' automatic help must name excluded provider');
  await automatic.scrollIntoViewIfNeeded();await inspect(`Settings-automatic-${language}-${theme}-680x540`);
  await automatic.click();await action('dedup-enable-confirm').waitFor();
  assert.match(await page.locator('.modal-body>p').innerText(),/Grok\/xAI/,language+' confirmation must name excluded provider');
  await inspect(`Automatic-confirmation-${language}-${theme}-680x540`);
  await page.locator('.modal-footer [data-action="modal-close"]').click();
  assert.equal((await api('manager.status')).deduplication.deleteOtherPromptOnlyAutomatically,false);
  await action('dedup-review').click();await action('dedup-scan').click();await reviewProgress().waitFor();await inspect(`Review-running-${language}-${theme}-680x540`);
  await finish({revision,count:entries.length,entries,historyRecords:1,space});await inspect(`Review-results-${language}-${theme}-680x540`);
  await closeReview();await page.locator('.modal-header [data-action="modal-close"]').click();
 }
 checks.push('All five locales and both themes explicitly exclude Grok/xAI in the automatic label, help and confirmation; cancelling confirmation preserves the disabled default');
 checks.push('Progress, explanations and candidate list fit 680×540 in all five locales and both themes; expanded database stays left and free disk stays right in one symmetric row');
 await api('settings.save',{values:{language:'en',theme:'light'}});await page.reload();await action('settings').waitFor();
 const oldFile=path.join(temp,'old.json'),newFile=path.join(temp,'new.json');
 const conversation=answer=>({provider:'openai',conversationKey:'ui-shared-id',title:'Same ID reader update',turns:[{user:'Question',turn_index:0},{ai:answer,model:'Example model',turn_index:1}]});
 await fs.writeFile(oldFile,JSON.stringify(conversation('Original answer in the open reader.')));await fs.writeFile(newFile,JSON.stringify(conversation('Updated answer in the open reader.')));
 await app.evaluate((_,file)=>{globalThis.__importFile=file;},oldFile);await api('import.pick',{kind:'files'});
 const initial=await api('import.paths',{paths:[oldFile],collection:'UI imports'});assert.equal(initial.errors.length,0);
 await action('refresh').click();await action('open-thread').first().click();await page.waitForFunction(()=>document.querySelector('#readerHost')?.textContent.includes('Original answer in the open reader.'));
 await app.evaluate((_,file)=>{globalThis.__importFile=file;globalThis.__holdImport=true;globalThis.__reportReclaimFailure=true;},newFile);
 await action('import-dialog').click();await page.locator('#importCollection').fill('UI imports');await action('pick-import-files').click();
 await page.waitForFunction(()=>document.querySelector('#operationBanner [role="progressbar"]')?.getAttribute('aria-valuenow')==='25');
 await app.evaluate(()=>{globalThis.__importContinue();globalThis.__importContinue=null;});await settle();
 await page.waitForFunction(()=>document.querySelector('#readerHost')?.textContent.includes('Updated answer in the open reader.'));
 assert.match(await page.locator('.modal .inline-error').innerText(),/Some old stored data remains/);
 const copied=await api('files',{mode:'local',collection:'UI imports',pageSize:20});assert.equal(copied.total,1);
 checks.push('File-import progress accepts backend alias; importing changed content for the open conversation refreshes its reader and retains one conversation while reporting a pending disk-reclamation warning');

 assert.deepEqual(errors,[]);await fs.writeFile(path.join(evidence,'deduplication-review-results.json'),JSON.stringify({passed:true,chromiumSandboxEnabled:true,socketlessHarness:process.env.READER_TEST_SOCKETLESS==='1',checks,geometry,pageErrors:errors},null,2));console.log(JSON.stringify({checks,pageErrors:errors,evidence},null,2));
}catch(error){await page?.screenshot({path:path.join(evidence,'Review-Failure.png')}).catch(()=>{});throw error;}
finally{await app?.close().catch(()=>{});await fs.rm(temp,{recursive:true,force:true});}
