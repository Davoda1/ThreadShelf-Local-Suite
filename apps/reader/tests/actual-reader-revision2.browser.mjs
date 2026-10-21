#!/usr/bin/env node
// Actual production Electron main/preload/worker/renderer and optional real Server.
// Requires READER_ELECTRON, READER_FIXTURE (an export), READER_R2_REPORT.
// No content or profile bytes are written to evidence. The only runtime bypass
// is the singleton socket when the isolated test host cannot create Unix sockets.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('..',import.meta.url));
const appRoot=path.resolve(process.env.READER_APP_ROOT||root);
const expectedVersion='1.0.0',serverUrl=process.env.READER_R2_SERVER;
assert.ok(process.env.READER_ELECTRON&&process.env.READER_FIXTURE&&process.env.READER_R2_REPORT);
const reportPath=path.resolve(process.env.READER_R2_REPORT);
await fs.mkdir(path.dirname(reportPath),{recursive:true});
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'ThreadShelf R2 actual app '));
const singletonLine=(await fs.readFile(path.join(appRoot,'src/desktop/main.cjs'),'utf8')).split('\n').findIndex(line=>line.startsWith('if(!app.requestSingleInstanceLock())'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const digest=value=>createHash('sha256').update(value).digest('hex');
const records=[],audits=[],logs=[],checks=[];
let active;
const {ApplicationService}=await import(pathToFileURL(path.join(appRoot,'src/core/service.mjs')));
const seed=await new ApplicationService({dataDir:profile}).init();
await seed.handle('settings.save',{values:{theme:'dark',language:'en',animations:false,pageSize:20,listMode:'pages',searchPanelExpanded:true,...(serverUrl?{serverUrl}:{})}});
await seed.handle('shutdown');
async function launch(){
 if(process.env.READER_R6_NATIVE_SHA256){const binary=await fs.realpath(process.env.READER_ELECTRON);assert.equal(digest(await fs.readFile(binary)),process.env.READER_R6_NATIVE_SHA256,'Native executable bytes before each launch');assert.ok((await fs.stat(binary)).mode&0o111,'Native executable mode before each launch');}
 const env={...process.env,THREADSHELF_READER_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
 const child=spawn(process.env.READER_ELECTRON,['--inspect-brk=0','--remote-debugging-port=0','--no-sandbox','--disable-gpu',...(process.env.READER_R6_PACKAGED==='1'?[]:[appRoot])],{env,stdio:['ignore','pipe','pipe']});
 let output='',seq=0,exit=null,ws,browser,patched=false,inspectorError,spawnError;
 const pending=new Map(),pageErrors=[],consoleErrors=[],requests=[];
 child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('exit',(code,signal)=>exit={code,signal});
 child.on('error',error=>spawnError=error);
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const endpoint=async regex=>{for(let i=0;i<300;i++){const m=output.match(regex);if(m)return m[1];if(spawnError)throw spawnError;if(exit)throw Error('Electron exited '+JSON.stringify(exit)+'\n'+output);await delay(100);}throw Error('Debugger endpoint unavailable\n'+output);};
 ws=new WebSocket(await endpoint(/Debugger listening on (ws:\/\/[^\s]+)/));
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',event=>{void(async()=>{
  const message=JSON.parse(event.data);
  if(message.id){const p=pending.get(message.id);if(p){pending.delete(message.id);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result);}return;}
  if(message.method==='NodeWorker.attachedToWorker')await send('NodeWorker.sendMessageToWorker',{sessionId:message.params.sessionId,message:JSON.stringify({id:1,method:'Runtime.runIfWaitingForDebugger'})});
  if(message.method==='Debugger.paused'){
   if(!patched&&message.params.hitBreakpoints?.length){
    const result=await send('Debugger.evaluateOnCallFrame',{callFrameId:message.params.callFrames[0].callFrameId,expression:'app.requestSingleInstanceLock=()=>true; process.execArgv=process.execArgv.filter(arg=>!arg.startsWith("--inspect-brk")); true',returnByValue:true});
    assert.ok(!result.exceptionDetails);patched=true;
   }
   await send('Debugger.resume');
  }
 })().catch(error=>inspectorError=error);});
 await send('Debugger.enable');await send('NodeWorker.enable',{waitForDebuggerOnStart:false});
 await send('Debugger.setBreakpointByUrl',{urlRegex:'/src/desktop/main\\.cjs$',lineNumber:singletonLine});
 await send('Runtime.runIfWaitingForDebugger');
 browser=await chromium.connectOverCDP(await endpoint(/DevTools listening on (ws:\/\/[^\s]+)/));
 const context=browser.contexts()[0],page=context.pages()[0]||await context.waitForEvent('page');
 page.on('pageerror',e=>pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
 page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push({url:request.url(),type:request.resourceType()});});
 await page.locator('.shell').waitFor({timeout:30000});assert.ok(patched);if(inspectorError)throw inspectorError;
 const about=await page.evaluate(()=>window.desktop.invoke('app.about'));assert.equal(about.version,expectedVersion);
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
 const metadata=JSON.parse(await evaluate('JSON.stringify({execPath:process.execPath,appPath:process.mainModule.require("electron").app.getAppPath(),resourcesPath:process.resourcesPath,argv:process.argv})'));
 assert.equal(await fs.realpath(metadata.execPath),await fs.realpath(process.env.READER_ELECTRON));assert.equal(await fs.realpath(metadata.appPath),await fs.realpath(appRoot));
 if(process.env.READER_R6_PACKAGED==='1'){assert.ok((await fs.lstat(process.env.READER_ELECTRON)).isSymbolicLink());assert.ok(metadata.argv.slice(1).every(arg=>arg.startsWith('--')));}
 const resize=async(width,height)=>{await evaluate(`process.mainModule.require("electron").BrowserWindow.getAllWindows()[0].setSize(${width},${height})`);await delay(100);};
 const close=async()=>{await evaluate('process.mainModule.require("electron").app.quit()').catch(()=>{});ws.close();for(let i=0;i<40&&!exit;i++)await delay(100);if(!exit)child.kill();await browser.close();logs.push(output);audits.push({about,metadata,pageErrors,consoleErrors,rendererHTTPRequests:requests});};
 return {page,send,evaluate,resize,close,about,pageErrors,consoleErrors,requests};
}

const invoke=(action,args={})=>active.page.evaluate(({action,args})=>window.desktop.invoke(action,args),{action,args});
async function options(values,action='search-save'){
 const p=active.page;await p.locator('[data-action="search-options"]').click();
 for(const [key,value] of Object.entries(values))await p.locator('#'+key).selectOption(value);
 await p.locator(`[data-action="${action}"]`).click();await p.locator('#searchMethod').waitFor({state:'detached'});
}
async function search(text){const p=active.page;await p.locator('#archiveSearch').fill(text);await p.locator('#searchForm').evaluate(form=>form.requestSubmit());await p.waitForFunction(()=>!document.querySelector('[data-action="cancel-search"]')&&document.querySelectorAll('.conversation-row').length>0,{},{timeout:60000});}
async function stableRows(){await delay(250);return active.page.locator('.conversation-title').allTextContents();}
async function pageRoundTrip(){const p=active.page;const first=await stableRows();assert.ok(first.length>0);await p.locator('[data-action="page-next"]').click();await delay(400);const second=await stableRows();assert.notDeepEqual(second,first);await p.locator('[data-action="page-prev"]').click();await delay(400);assert.deepEqual(await stableRows(),first);}
try{
 active=await launch();
 await active.evaluate(`global.qaR2Dialog=process.mainModule.require("electron").dialog.showOpenDialog;process.mainModule.require("electron").dialog.showOpenDialog=async()=>({canceled:false,filePaths:[${JSON.stringify(path.resolve(process.env.READER_FIXTURE))}]})`);
 await invoke('import.pick',{kind:'files'});
 await active.evaluate('process.mainModule.require("electron").dialog.showOpenDialog=global.qaR2Dialog;delete global.qaR2Dialog');
 const imported=await invoke('import.paths',{paths:[path.resolve(process.env.READER_FIXTURE)],collection:'Revision 2 actual QA'});
 checks.push({name:'Production IPC import',result:imported});
 await active.page.locator('[data-action="refresh"]').click();await active.page.locator('.conversation-row').first().waitFor();
 const count=Number((await active.page.locator('#listCount').textContent()).replace(/[^0-9]/g,''));assert.ok(count>20);checks.push({name:'Conversation list populated',count});
 await pageRoundTrip();checks.push({name:'Actual conversation page next/back preserves rows'});
 await active.page.locator('.conversation-row').first().click();await active.page.locator('#conversationContent .message').first().waitFor();
 const original=await active.page.locator('#conversationContent .message').first().evaluate(n=>n.sourceText);assert.ok(typeof original==='string');
 checks.push({name:'Original conversation renders through production thread API',sourceLength:original.length});
 await options({searchMethod:'keyword',searchProvider:'',searchRole:'',searchPeriod:'all'});
 assert.equal((await invoke('bootstrap')).settings.searchPreferences.local.period,'all');
 await search('the');await pageRoundTrip();
 const prepared=await invoke('search.prepare');assert.ok(prepared.status.textIndex.ready);
 const indexed=await invoke('search.status');assert.ok(indexed.textIndex.ready);assert.ok(indexed.textIndex.conversations>20);
 checks.push({name:'Actual lexical search paginates and creates compressed index',index:{conversations:indexed.textIndex.conversations,passages:indexed.textIndex.passages,bytes:indexed.textIndex.bytes}});
 const args={q:'the',mode:'local',searchMode:'keyword',period:'all',page:1,pageSize:20,searchId:'actual-core-test'};
 const first=await invoke('search',args);assert.ok(first.searchSession);const second=await invoke('search',{...args,page:2,searchSession:first.searchSession});assert.equal(second.searchSession,first.searchSession);assert.ok(second.results.length);assert.notEqual(first.results[0].passageId,second.results[0].passageId);
 checks.push({name:'Second search page reuses backend session',total:first.total});
 await active.page.locator('[data-action="clear-search"]').filter({visible:true}).first().click();
 await options({searchMethod:'fuzzy',searchPeriod:'month'});
 const before=await invoke('bootstrap');assert.equal(before.settings.searchPreferences.local.mode,'fuzzy');assert.equal(before.settings.searchPreferences.local.period,'month');
 await active.page.locator('[data-action="search-options"]').click();await active.page.locator('#searchPeriod').selectOption('3months');
 await active.page.locator('[data-action="search-settings"]').click();
 await active.page.locator('#settingsForm').waitFor();await active.page.locator('.modal-header [data-action="modal-close"]').click();
 assert.equal(await active.page.locator('#searchPeriod').inputValue(),'3months');await active.page.locator('[data-action="search-save"]').click();
 checks.push({name:'Search options save without running and retain nested settings draft'});
 await active.page.locator('[data-action="settings"]').click();await active.page.locator('[data-action="settings-tab"][data-tab="appearance"]').click();await active.page.locator('#prefAnalyticsStyledBars').check();await active.page.locator('#settingsForm button[type="submit"]').click();
 await active.page.locator('#settingsForm').waitFor({state:'detached'});
 const calendar=await invoke('activity.query',{year:'all',metric:'conversations'});assert.ok(calendar.summary.started>0);
 const rebuilt=await invoke('activity.rebuild',{year:'all',metric:'conversations'});assert.equal(rebuilt.summary.started,calendar.summary.started);
 await active.page.locator('[data-action="workspace-analytics"]').click();await active.page.locator('.calendar-card').waitFor();
 await active.page.locator('[data-activity-filter="metric"]').selectOption('conversations');await delay(300);
 assert.equal(await active.page.locator('html').getAttribute('data-analytics-styled-bars'),'true');
 checks.push({name:'Actual activity starts/rebuild and enabled analytics bar setting',started:calendar.summary.started,messages:calendar.summary.messages});
 await active.resize(680,540);const layout=await active.page.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight}));assert.ok(layout.sw<=layout.w&&layout.sh<=layout.h);checks.push({name:'Minimum window has no global scrolling',layout});
 await active.resize(1280,820);
 if(serverUrl){
  await active.page.locator('[data-action="workspace-reader"]').click();await active.page.locator('[data-action="mode-server"]').click();await active.page.locator('.conversation-row').first().waitFor({timeout:30000});
  await options({searchMethod:'keyword'});assert.equal(await active.page.locator('#searchPeriod').count(),0);
  await search('the');await pageRoundTrip();checks.push({name:'Real ThreadShelf server text search paging works'});
  await active.page.locator('.conversation-row').first().click();await active.page.locator('#conversationContent .message').first().waitFor();
  await active.page.locator('[data-action="workspace-analytics"]').click();await active.page.locator('.analytics-card').first().waitFor();await delay(350);
  const insights=await invoke('server.insights',{collection:'all'});assert.ok(insights);checks.push({name:'Real Server Insights and conversation rendering work'});
  await active.page.locator('[data-action="mode-local"]').click();
 }
 await active.close();active=null;active=await launch();
 const persisted=await invoke('bootstrap');assert.equal(persisted.settings.analyticsStyledBars,true);assert.equal(persisted.settings.searchPreferences.local.period,'3months');assert.equal(persisted.settings.searchPreferences.local.mode,'fuzzy');
 const reopened=await invoke('search.status');assert.ok(reopened.textIndex.ready);checks.push({name:'Preferences and compressed search cache survive process restart'});
 await active.close();active=null;
 assert.ok(audits.every(a=>!a.pageErrors.length));
 await fs.writeFile(reportPath,JSON.stringify({complete:true,checks,audits,scope:'Actual production Electron application and original archive; isolated disposable profile',version:expectedVersion},null,2)+'\n');
 console.log(JSON.stringify({complete:true,checks:checks.length,rendererErrors:audits.flatMap(a=>a.pageErrors).length}));
}catch(error){await fs.writeFile(reportPath,JSON.stringify({complete:false,error:error.stack,checks,audits},null,2)+'\n');throw error;}
finally{if(active)await active.close().catch(()=>{});await fs.rm(profile,{recursive:true,force:true});}
