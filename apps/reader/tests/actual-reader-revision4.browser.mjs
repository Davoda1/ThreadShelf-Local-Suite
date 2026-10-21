#!/usr/bin/env node
// Actual production Electron main/preload/worker/renderer: preserved R3 data regression plus R4 bar hover/focus.
// Requires READER_ELECTRON, READER_R2_APP_ROOT (Revision 2 source), READER_R4_REPORT.
// No content or profile bytes are written to evidence. The only runtime bypass
// is the singleton socket when the isolated test host cannot create Unix sockets.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('..',import.meta.url));
const appRoot=path.resolve(process.env.READER_APP_ROOT||root);
const expectedVersion='1.0.0';
assert.ok(process.env.READER_ELECTRON&&process.env.READER_R2_APP_ROOT&&process.env.READER_R4_REPORT);
const reportPath=path.resolve(process.env.READER_R4_REPORT);
await fs.mkdir(path.dirname(reportPath),{recursive:true});
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'ThreadShelf R4 bar app '));
const singletonLine=(await fs.readFile(path.join(appRoot,'src/desktop/main.cjs'),'utf8')).split('\n').findIndex(line=>line.startsWith('if(!app.requestSingleInstanceLock())'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const digest=value=>createHash('sha256').update(value).digest('hex');
const records=[],audits=[],logs=[],checks=[];
let active;
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
// Controlled HTTP returns the actual ThreadShelf 1.3.0 /api/thread shape.
// Imported threads retain normalized turn timestamps but no original export.
const collection='Normalized Activity regression';
const remoteThreads=[
 {conversationKey:'out-of-order',title:'Out of order source turns',createdInThreadShelf:false,turns:[{ai:'quartz later answer',createdAt:'2026-01-03T10:00:00Z'},{user:'quartz earlier question',createdAt:'2026-01-02T10:00:00Z'}]},
 {conversationKey:'undated-first',title:'Undated first turn',createdInThreadShelf:false,turns:[{user:'quartz undated question'},{ai:'quartz first dated answer',createdAt:'2026-01-02T11:00:00Z'},{user:'quartz followup',createdAt:'2026-01-04T10:00:00Z'}]},
 {conversationKey:'unknown',title:'Unknown source dates',createdInThreadShelf:false,turns:[{user:'quartz source without dates'}]},
 {conversationKey:'explicit',title:'Explicit source creation',createdInThreadShelf:true,threadCreatedAt:'2026-01-01T09:00:00Z',turns:[{user:'quartz first saved question',createdAt:'2026-01-05T10:00:00Z'},{ai:'quartz answer',createdAt:'2026-01-05T11:00:00Z'}]},
].map(t=>({...t,sourceFile:'/synthetic/normalized-activity.json'}));
const requests=[];
const server=http.createServer((req,res)=>{
 requests.push(req.method+' '+new URL(req.url,'http://localhost').pathname);
 const u=new URL(req.url,'http://localhost');let value;
 const summaries=remoteThreads.map(t=>({collection,sourceFile:t.sourceFile,conversationKey:t.conversationKey,title:t.title,provider:'openai',turnCount:t.turns.length,lastTurnAt:t.turns.at(-1).createdAt||''}));
 if(u.pathname==='/api/collections')value={collections:[collection]};
 else if(u.pathname==='/api/files')value={files:summaries};
 else if(u.pathname==='/api/thread')value=remoteThreads.find(t=>t.conversationKey===u.searchParams.get('conversationKey'));
 else if(u.pathname==='/api/health')value={ok:true};
 else {res.statusCode=404;value={error:'Unsupported fixture request'};}
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const serverUrl=`http://127.0.0.1:${server.address().port}/`;
const {ApplicationService:PreviousService}=await import(pathToFileURL(path.join(process.env.READER_R2_APP_ROOT,'src/core/service.mjs')));
const query={year:'all',metric:'conversations',zone:'utc'};
async function durableSnapshot(){
 const result={};
 async function walk(dir,relative=''){for(const e of await fs.readdir(dir,{withFileTypes:true})){const name=path.join(relative,e.name),file=path.join(dir,e.name);if(e.isDirectory())await walk(file,name);else result[name]=digest(await fs.readFile(file));}}
 await walk(path.join(profile,'local-storage-v2'));
 result['reading-v2.json']=digest(await fs.readFile(path.join(profile,'reading-v2.json')));
 return result;
}
async function waitActivity(){await active.page.waitForFunction(()=>!!document.querySelector('.analytics-stats')&&!document.querySelector('[data-activity-progress]'),{},{timeout:30000});}
async function metric(value){await active.page.locator('[data-activity-filter="metric"]').selectOption(value);await waitActivity();}
async function statistic(index){return Number((await active.page.locator('.analytics-stat strong').nth(index).innerText()).replace(/[^0-9]/g,''));}
function starts(report){return Object.fromEntries(report.daily.filter(d=>d.conversations).map(d=>[d.date,d.conversations]));}
async function barSnapshot(chart){return chart.evaluate(el=>Array.from(el.children).map(bar=>{const fill=bar.querySelector('.bar-track>span')||bar.querySelector('div>span'),style=getComputedStyle(fill),label=bar.querySelector('small')||bar.querySelector('div');const rect=fill.getBoundingClientRect();return {opacity:Number(style.opacity),outlineWidth:parseFloat(style.outlineWidth),outlineStyle:style.outlineStyle,labelOpacity:Number(getComputedStyle(label).opacity),title:bar.title,ariaLabel:bar.getAttribute('aria-label'),role:bar.getAttribute('role'),tabIndex:bar.tabIndex,width:rect.width,height:rect.height};}));}
async function assertActiveBar(chart,index){const states=await barSnapshot(chart);assert.ok(states[index].outlineWidth>=2&&states[index].outlineStyle==='solid','Selected bar has a clear outline');assert.equal(states[index].opacity,1);for(const [i,state] of states.entries()){assert.equal(state.labelOpacity,1,'Labels retain full opacity');assert.equal(state.role,'img');assert.equal(state.tabIndex,0);assert.ok(state.ariaLabel.startsWith(state.title),'Accessible bar label includes the native tooltip value');if(i!==index)assert.ok(state.opacity>.5&&state.opacity<.8,'Only sibling bars are dimmed');}return states;}
async function assertIdleBars(chart){const states=await barSnapshot(chart);assert.ok(states.every(s=>s.opacity===1&&s.outlineStyle==='none'),'Leaving chart clears bar emphasis');}
async function actualBarChecks(){
 const page=active.page;await page.locator('[data-activity-action="tab"][data-tab="graphs"]').click();
 const vertical=page.locator('.analytics-grid .vertical-bars').first(),other=page.locator('.analytics-grid .vertical-bars').nth(1),horizontal=page.locator('.analytics-grid .horizontal-bars').last();
 await vertical.waitFor();const before=await barSnapshot(vertical);assert.equal(before.length,7);assert.ok((await barSnapshot(horizontal)).length>=2);
 await vertical.locator('.vertical-bar').first().hover();await assertActiveBar(vertical,0);await assertIdleBars(other);
 const zero=before.findIndex(s=>s.height===0);assert.ok(zero>=0);await vertical.locator('.vertical-bar').nth(zero).hover();const zeroState=await assertActiveBar(vertical,zero);assert.equal(zeroState[zero].height,0,'Zero-value fill keeps its actual zero geometry');
 await page.locator('.analytics-heading h1').hover();await assertIdleBars(vertical);
 await vertical.locator('.vertical-bar').first().focus();await page.keyboard.press('Tab');assert.equal(await vertical.locator('.vertical-bar').nth(1).evaluate(el=>el.matches(':focus-visible')),true);await assertActiveBar(vertical,1);
 await vertical.locator('.vertical-bar').first().hover();await assertActiveBar(vertical,0);await page.locator('.analytics-heading h1').hover();await assertActiveBar(vertical,1);
 await page.locator('[data-activity-action="refresh"]').focus();await assertIdleBars(vertical);
 await horizontal.locator('.horizontal-bar').first().hover();await assertActiveBar(horizontal,0);await assertIdleBars(vertical);
 await page.locator('.analytics-heading h1').hover();await assertIdleBars(horizontal);
 const after=await barSnapshot(vertical);assert.deepEqual(after.map(s=>[s.width,s.height]),before.map(s=>[s.width,s.height]),'Hover/focus never changes bar geometry');
 checks.push({name:'Actual Local Activity bars outline the active value, dim only sibling fills, preserve zero geometry and labels, follow keyboard focus, and clear on exit',verticalBars:before.length,horizontalBars:(await barSnapshot(horizontal)).length,zeroValueChecked:true});
 await page.locator('[data-activity-action="tab"][data-tab="activity"]').click();
}

let previous;
try{
 previous=await new PreviousService({dataDir:profile}).init();
 await previous.handle('settings.save',{values:{theme:'dark',language:'en',animations:false,pageSize:20,listMode:'pages',searchPanelExpanded:true,serverUrl}});
 const imported=await previous.handle('server.import',{serverUrl,collections:[collection]});assert.equal(imported.imported,4);assert.deepEqual(imported.errors,[]);
 const files=(await previous.handle('files',{mode:'local'})).files;
 await previous.handle('reading.save',{key:'local:'+files[0].id,position:{turnIndex:0,role:'user',offset:.25,expanded:true,title:'Synthetic saved reading'}});
 const before=await previous.handle('activity.query',query);
 assert.equal(before.summary.started,0);assert.equal(before.summary.messages,6);assert.deepEqual(before.coverage,{original:0,normalized:4});
 const oldRebuilt=await previous.handle('activity.rebuild',query);assert.equal(oldRebuilt.summary.started,0);
 await previous.handle('search.prepare');
 checks.push({name:'Revision 2 reproduces normalized-only zero starts after rebuild',started:before.summary.started,messages:before.summary.messages,coverage:before.coverage});
 await previous.handle('shutdown');previous=null;
 const durableBefore=await durableSnapshot();
 active=await launch();
 const fixed=await invoke('activity.query',query);
 assert.equal(fixed.summary.started,3);assert.equal(fixed.summary.messages,6);assert.equal(fixed.summary.undatedConversations,1);
 assert.deepEqual(starts(fixed),{'2026-01-01':1,'2026-01-02':2});assert.deepEqual(fixed.coverage,{original:0,normalized:4});
 checks.push({name:'Existing Revision 2 cache automatically repairs in actual Revision 4 application',started:fixed.summary.started,messages:fixed.summary.messages,undatedConversations:fixed.summary.undatedConversations,daily:starts(fixed),cache:fixed.storage.version});
 await active.page.locator('[data-action="workspace-analytics"]').click();await waitActivity();
 assert.equal(await statistic(1),6);
 await active.page.locator('[data-activity-filter="zone"]').selectOption('utc');await waitActivity();await metric('conversations');
 assert.equal(await statistic(0),4);assert.equal(await statistic(1),3);assert.equal(await statistic(2),2);
 const coverage=await active.page.locator('.analytics-coverage').innerText();assert.match(coverage,/0 original.*4 normalized/);
 await active.page.locator('.analytics-coverage summary').click();
 assert.match(await active.page.locator('.analytics-coverage').innerText(),/earliest|estimated|estimate/i);
 await active.page.locator('[data-activity-filter="calendarYear"]').selectOption('2026');
 assert.match(await active.page.locator('[data-date="2026-01-02"]').getAttribute('aria-label'),/2 Conversations started/);
 await active.page.locator('[data-date="2026-01-02"]').click();await waitActivity();
 assert.equal(await active.page.locator('.analytics-conversations tbody tr').count(),2);
 const titles=await active.page.locator('.analytics-thread-link').allTextContents();assert.deepEqual(titles.sort(),['Out of order source turns','Undated first turn']);
 checks.push({name:'Actual metric selector/calendar/drilldown show correct starts and explanatory source coverage',started:3,dayRows:2});
 await active.page.locator('[data-activity-action="clear-date"]').click();await waitActivity();
 await active.page.locator('[data-activity-action="tab"][data-tab="activity"]').click();
 await active.page.locator('[data-activity-action="rebuild"]').click();await waitActivity();assert.equal(await statistic(1),3);
 await metric('messages');assert.equal(await statistic(1),6);await metric('conversations');assert.equal(await statistic(1),3);
 const all=await invoke('search',{q:'quartz',mode:'local',searchMode:'keyword',period:'all',pageSize:100});
 const period=await invoke('search',{q:'quartz',mode:'local',searchMode:'keyword',period:'5years',pageSize:100});
 assert.equal(all.total,8);assert.equal(period.total,2);assert.ok(period.results.every(r=>r.conversationId===files.find(f=>f.conversationKey==='explicit').id));
 checks.push({name:'Rebuild and repeated count switching preserve messages; old text cache refreshes explicit source dates without treating Activity estimates as original dates',allSearchHits:all.total,datedSearchHits:period.total});
 await actualBarChecks();
 await active.resize(680,540);
 const layout=await active.page.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight}));assert.ok(layout.sw<=layout.w&&layout.sh<=layout.h);
 await active.close();active=null;
 assert.deepEqual(await durableSnapshot(),durableBefore);
 active=await launch();const reopened=await invoke('activity.query',query);assert.equal(reopened.summary.started,3);assert.deepEqual(starts(reopened),starts(fixed));
 checks.push({name:'Restart preserves repaired starts without changing any durable archive or reading-state bytes',filesVerified:Object.keys(durableBefore).length,minimumWindow:layout});
 remoteThreads[0].turns.push({user:'quartz earlier recovered turn',createdAt:'2025-12-31T10:00:00Z'});
 remoteThreads[1].turns.push({ai:'quartz later new reply',createdAt:'2026-01-10T10:00:00Z'});
 remoteThreads.push({conversationKey:'new',sourceFile:'/synthetic/normalized-activity.json',title:'New normalized conversation',createdInThreadShelf:false,turns:[{user:'quartz new question',createdAt:'2026-01-02T12:00:00Z'},{ai:'quartz new answer',createdAt:'2026-01-06T10:00:00Z'}]});
 const changed=await invoke('server.import',{serverUrl,collections:[collection]});assert.equal(changed.updated,2);assert.equal(changed.imported,1);assert.equal(changed.skipped,2);assert.deepEqual(changed.errors,[]);
 const updated=await invoke('activity.query',query);assert.equal(updated.summary.started,4);assert.equal(updated.summary.messages,10);assert.deepEqual(starts(updated),{'2025-12-31':1,'2026-01-01':1,'2026-01-02':2});
 const repeated=await invoke('server.import',{serverUrl,collections:[collection]});assert.equal(repeated.skipped,5);assert.equal((await invoke('activity.query',query)).summary.started,4);
 checks.push({name:'Production IPC server copy updates earlier source date/new reply/new conversation and does not double count re-copy',updated:changed.updated,imported:changed.imported,started:updated.summary.started,messages:updated.summary.messages,daily:starts(updated)});
 const originalFile=path.join(profile,'synthetic-original.json');
 await fs.writeFile(originalFile,JSON.stringify({id:'original-missing-date',title:'Original with unknown creation',current_node:'one',mapping:{one:{id:'one',parent:null,children:[],message:{id:'message',author:{role:'user'},create_time:Date.parse('2026-01-02T10:00:00Z')/1000,content:{content_type:'text',parts:['quartz original dated message']}}}}}));
 await active.evaluate(`global.qaR4Dialog=process.mainModule.require("electron").dialog.showOpenDialog;process.mainModule.require("electron").dialog.showOpenDialog=async()=>({canceled:false,filePaths:[${JSON.stringify(originalFile)}]})`);
 await invoke('import.pick',{kind:'files'});
 await active.evaluate('process.mainModule.require("electron").dialog.showOpenDialog=global.qaR4Dialog;delete global.qaR4Dialog');
 const originalImport=await invoke('import.paths',{paths:[originalFile],collection:'Original unknown date'});assert.equal(originalImport.imported,1);assert.deepEqual(originalImport.errors,[]);
 const originalReport=await invoke('activity.query',query);assert.equal(originalReport.summary.started,4);assert.equal(originalReport.summary.undatedConversations,2);assert.deepEqual(originalReport.coverage,{original:1,normalized:5});
 checks.push({name:'Actual original-export import retains unknown creation despite dated messages',started:originalReport.summary.started,undatedConversations:originalReport.summary.undatedConversations,coverage:originalReport.coverage});
 await active.resize(680,540);const locales=[];
 for(const language of ['en','hu','de','fr','ja']){
  await invoke('settings.save',{values:{language}});await active.page.reload();await active.page.locator('.shell').waitFor();
  await active.page.locator('[data-action="workspace-analytics"]').click();await waitActivity();
  await active.page.locator('.analytics-coverage summary').click();
  const note=await active.page.locator('[data-activity-estimated-starts]').innerText();assert.ok(note.length>20&&!note.includes('activityEstimatedStarts'));
  const shape=await active.page.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight}));assert.ok(shape.sw<=shape.w&&shape.sh<=shape.h);
  locales.push(language);
 }
 checks.push({name:'Estimate disclosure is translated and fits minimum window',locales});
 await active.close();active=null;
 assert.ok(audits.every(a=>!a.pageErrors.length&&!a.consoleErrors.length));assert.ok(requests.every(r=>r.startsWith('GET ')));
 await fs.writeFile(reportPath,JSON.stringify({complete:true,version:expectedVersion,revision:4,checks,audits,scope:'Actual production Electron application; controlled HTTP matches ThreadShelf 1.3 normalized thread API; actual Revision 2 cache upgrade; synthetic content only',serverRequests:requests.length,sourceRequestsReadOnly:true},null,2)+'\n');
 console.log(JSON.stringify({complete:true,checks:checks.length,rendererErrors:audits.flatMap(a=>a.pageErrors).length,consoleErrors:audits.flatMap(a=>a.consoleErrors).length}));
}catch(error){await fs.writeFile(reportPath,JSON.stringify({complete:false,error:error.stack,checks,audits},null,2)+'\n');throw error;}
finally{if(previous)await previous.handle('shutdown').catch(()=>{});if(active)await active.close().catch(()=>{});await new Promise(resolve=>server.close(resolve));await fs.rm(profile,{recursive:true,force:true});}
