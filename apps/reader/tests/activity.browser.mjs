#!/usr/bin/env node
// The real bundled renderer and ReaderView with deterministic, synthetic IPC.
// Does not open an existing profile, source archive, remote server, or clipboard.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {UI_PALETTES} from '../src/core/themes.mjs';
import {translator,localeCode} from '../src/ui/i18n.js';

const root=fileURLToPath(new URL('..',import.meta.url));
const appRoot=process.env.READER_APP_ROOT?path.resolve(process.env.READER_APP_ROOT):root;
const require=createRequire(import.meta.url);
const {_electron}=process.env.THREADSHELF_PLAYWRIGHT_MODULE?await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE):require('playwright');
const tmp=await mkdtemp(path.join(os.tmpdir(),'threadshelf-activity-ui-'));
const evidence=path.resolve(process.env.READER_EVIDENCE||path.join(root,'docs/evidence/v3.0.0/activity-ui'));
await mkdir(evidence,{recursive:true});
const settings={language:'en',mode:'local',theme:'light',uiPalette:'default',codeTheme:'default',fontSize:'normal',highContrast:false,compact:true,animations:false,listMode:'pages',pageSize:50,sort:'updated',localCollection:'all',serverCollection:'all',serverUrl:'http://127.0.0.1:3000/',serverAddresses:['http://127.0.0.1:3000/'],directoryMode:'last',customDirectory:'',searchPanelExpanded:false,searchMode:'keyword'};
const thread={id:'synthetic-0',collection:'Research collection with a deliberately long descriptive name',provider:'openai',sourceFile:'/synthetic/long-directory-name/conversation-export.json',conversationKey:'sample',title:'Synthetic conversation with a deliberately long title for wrapping and alignment checks',turnCount:4,turns:[{user:'How can we preserve reading state?',turn_index:0},{thinking:'Check the state before and after switching workspaces.',turn_index:1},{ai:'# Reader preservation\n\n'+Array.from({length:35},(_,i)=>`Paragraph ${i+1}: preserve the selected conversation, bookmarks, find matches, and scroll position when switching to Activity and back.`).join('\n\n'),turn_index:2},{user:'Reading state remains available.',turn_index:3}]};
await writeFile(path.join(tmp,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('desktop',{invoke:(a,b)=>ipcRenderer.invoke('call',a,b),onProgress:callback=>ipcRenderer.on('progress',(_event,value)=>callback(value)),onMenu:()=>{}});`);

function mockMain(config){
 const {app,BrowserWindow,ipcMain}=require('electron');
 app.setPath('userData',config.profile);global.uiSettings=config.settings;global.reading={positions:{},bookmarks:[],recent:[]};global.calls=[];global.responseMode='normal';global.delays={};global.estimatedStarts=19;
 const thread=config.thread,collections=[{name:thread.collection,count:76},{name:'Secondary',count:21},{name:'Empty',count:0}];
 const files=Array.from({length:18},(_,i)=>({...thread,id:'synthetic-'+i,title:`${i+1}. ${thread.title}`}));
 function localReport(b,empty){
  const daily=Array.from({length:400},(_,i)=>({date:new Date(Date.UTC(2025,10,1+i)).toISOString().slice(0,10),messages:i%11?i%21+1:0,user:i%11?i%8:0,assistant:i%11?i%13:0,conversations:i%9?i%3:0}));
  const rows=Array.from({length:Math.min(b.limit||50,76-(b.offset||0))},(_,i)=>({...thread,id:'synthetic-'+((b.offset||0)+i),title:`${(b.offset||0)+i+1}. ${thread.title}`,messages:300-i,last:i? '2026-09-14T10:13:00.000Z':0,coverage:i%2?'normalized':'original'}));
  return {summary:{conversations:empty?0:76,totalConversations:empty?0:76,value:empty?0:4350,activeDays:empty?0:301,longest:9,undated:13,undatedConversations:2,estimatedStarts:empty?0:global.estimatedStarts},coverage:{original:57,normalized:19},warnings:{branchFallback:2,cycles:0,duplicateMessages:3},storage:{profile:'7z'},years:[2026,2025],models:['gpt-4.1','A very long model identifier with an unusually descriptive suffix'],daily:empty?[]:daily,timeline:empty?[]:Array.from({length:14},(_,i)=>({date:new Date(Date.UTC(2025,10+i,1)).toISOString().slice(0,7),count:(i%4+1)*230})),weekdays:[45,160,99,133,178,60,31],hours:Array.from({length:24},(_,i)=>(i%7+1)*12),modelCounts:{'gpt-4.1':2340,'A very long model identifier with an unusually descriptive suffix':1370,Unknown:440},roles:{user:1700,assistant:2200,tool:250,system:200},rows:empty?[]:rows,rowCount:empty?0:76,offset:b.offset||0,limit:b.limit||50,collection:b.collection};
 }
 function serverReport(b,empty){return {collection:b.collection,totals:{collections:b.collection==='all'?2:1,files:empty?0:b.collection==='Secondary'?321:654,chunks:empty?0:14302,conversations:empty?0:97,turns:empty?0:9850},roles:{user:5030,thinking:1740,ai:7532},activity:empty?[]:Array.from({length:14},(_,i)=>({month:new Date(Date.UTC(2025,10+i,1)).toISOString().slice(0,7),count:(i%5+1)*210})),topModels:empty?[]:[{model:'gpt-4.1',count:7200},{model:'A very long server model name with an unusually descriptive suffix',count:7102}],providers:empty?[]:[{provider:'openai',conversations:60,turns:6840},{provider:'anthropic',conversations:37,turns:3010}],longestThreads:empty?[]:Array.from({length:10},(_,i)=>({...thread,title:`${i+1}. Server ${thread.title}`,turnCount:800-i*13,lastTurnAt:'2026-09-14T10:13:00.000Z'})),firstActivity:'2025-11-01T09:00:00Z',lastActivity:'2026-09-14T10:13:00Z'};}
 ipcMain.handle('call',async(_event,a,b={})=>{
  global.calls.push({action:a,args:b});
  if(a==='bootstrap')return {settings:global.uiSettings,reading:global.reading,dataDir:'Synthetic isolated test profile',version:'3.0.0',searchStatus:{modelReady:false,indexedPassages:0}};
  if(a==='settings.save')return global.uiSettings={...global.uiSettings,...b.values};
  if(a==='collections'||a==='server.collections')return {collections};
  if(a==='files')return {files,total:files.length,page:1,pageSize:50};
  if(a==='thread')return {...thread,id:b.id||thread.id};
  if(a==='reading.save'){
   if(b.position){global.reading.positions[b.key]=b.position;global.reading.recent=[{key:b.key,...b.position}];}
   if(b.bookmark)global.reading.bookmarks.push({key:b.key,...b.bookmark});
   if(b.removeBookmark)global.reading.bookmarks=global.reading.bookmarks.filter(x=>x.key!==b.key||x.turnIndex!==b.removeBookmark.turnIndex||x.role!==b.removeBookmark.role);
   return global.reading;
  }
  if(a==='activity.query'||a==='activity.rebuild'||a==='server.insights'){
   const responseMode=global.responseMode,delay=global.delays[b.collection]||0;
   const result=a!=='server.insights'?localReport(b,responseMode==='empty'):serverReport(b,responseMode==='empty');
   if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
   if(responseMode==='error')throw new Error('Synthetic unavailable source: please retry.');
   return result;
  }
  if(a==='activity.export')return {saved:true};
  if(a==='search')return {results:files,total:files.length};
  if(a==='search.status')return {modelReady:false,indexedPassages:0};
  if(a==='ollama.models')return {available:false,installed:false,isLocal:true,models:[],details:[]};
  return {ok:true};
 });
 app.whenReady().then(()=>{const w=new BrowserWindow({width:1280,height:820,show:true,webPreferences:{preload:config.preload,contextIsolation:true,nodeIntegration:false,sandbox:true}});w.setMenu(null);w.loadFile(config.page);});
}
await writeFile(path.join(tmp,'main.cjs'),`(${mockMain.toString()})(${JSON.stringify({profile:path.join(tmp,'profile'),settings,thread,preload:path.join(tmp,'preload.cjs'),page:path.join(appRoot,'dist/index.html')})});`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:process.env.READER_ELECTRON||path.join(root,'node_modules/electron/dist/electron'),args:['--no-sandbox','--disable-gpu',path.join(tmp,'main.cjs')],env,timeout:45000});
const page=await app.firstWindow(),errors=[],checks=[],scenarios=[],workflows=[];
page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(10000);
const action=name=>page.locator(`[data-action="${name}"]`);
const analyticsAction=(name,extra='')=>page.locator(`[data-activity-action="${name}"]${extra}`);
const filter=name=>page.locator(`[data-activity-filter="${name}"]`);
const screenshot=name=>page.screenshot({path:path.join(evidence,name+'.png')});
let currentLabel='startup';
async function ready(){await page.waitForFunction(()=>{const h=document.querySelector('#analyticsWorkspace');return h&&!h.hidden&&h.getAttribute('aria-busy')==='false'&&!!h.querySelector('.analytics-stats');});}
async function analytics(){await action('workspace-analytics').click();await ready();}
async function reload(values={}){await app.evaluate(({BrowserWindow},{values,defaults})=>{global.uiSettings={...defaults,...values};global.responseMode='normal';global.delays={};global.calls=[];global.reading={positions:{},bookmarks:[],recent:[]};BrowserWindow.getAllWindows()[0].setContentSize(values.width||1280,values.height||820);},{values,defaults:settings});await page.reload();await page.locator('.conversation-row').first().waitFor();}
async function checkLayout(label){
 currentLabel=label;
 const geometry=await page.evaluate(()=>{
  const box=node=>{const r=node.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
  const visible=node=>node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden'&&!node.closest('[inert]');
  const name=node=>node.id||node.getAttribute('data-action')||node.getAttribute('data-activity-action')||node.getAttribute('data-activity-filter')||node.className||node.tagName;
  const controls=selector=>[...document.querySelectorAll(selector)].filter(visible);
  const overlaps=[];
  for(const selector of ['.app-header','.analytics-actions','.analytics-filterbar','.analytics-tabs','.analytics-card-heading','.analytics-search','.analytics-date-filter','.analytics-pagination'])for(const group of controls(selector)){
   const nodes=[...group.querySelectorAll('button,input,select')].filter(visible);
   for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=box(nodes[i]),b=box(nodes[j]);if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)overlaps.push(`${selector}: ${name(nodes[i])} / ${name(nodes[j])}`);}
  }
  const workspace=document.querySelector('#analyticsWorkspace'),header=document.querySelector('.app-header'),status=document.querySelector('.statusbar');
  return {viewport:[innerWidth,innerHeight],document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],workspace:box(workspace),header:box(header),status:box(status),scroll:{client:workspace.clientHeight,height:workspace.scrollHeight},panes:controls('#analyticsWorkspace,.analytics-inner,.analytics-filterbar,.analytics-card,.analytics-grid').map(node=>({name:name(node),client:node.clientWidth,scroll:node.scrollWidth})),headerControls:controls('.app-header button').map(node=>({name:name(node),...box(node)})),reader:[...document.querySelectorAll('.sidebar,.content-pane')].map(node=>({name:name(node),hidden:node.hidden,inert:node.inert,visible:visible(node)})),calendar:controls('.calendar-card,.calendar-scroll,.calendar-layout,.calendar-months,.calendar-card .analytics-card-heading,.calendar-card .calendar-legend').map(node=>({name:name(node),...box(node),client:node.clientWidth,scroll:node.scrollWidth,overflow:getComputedStyle(node).overflow,width:getComputedStyle(node).width,minWidth:getComputedStyle(node).minWidth,display:getComputedStyle(node).display})),unnamed:controls('#analyticsWorkspace button,#analyticsWorkspace input,#analyticsWorkspace select,.workspace-switch button').filter(node=>!node.getAttribute('aria-label')&&!node.textContent.trim()&&!node.labels?.length&&!node.getAttribute('title')).map(name),overlaps};
 });
 assert.ok(geometry.document[0]<=geometry.viewport[0]+1&&geometry.document[1]<=geometry.viewport[1]+1,label+' whole-window overflow');
 assert.deepEqual(geometry.overlaps,[],label+' control overlaps');
 assert.deepEqual(geometry.unnamed,[],label+' controls without accessible names');
 for(const item of geometry.headerControls)assert.ok(item.left>=0&&item.right<=geometry.viewport[0]+1&&item.top>=geometry.header.top&&item.bottom<=geometry.header.bottom+1,label+' header control outside banner '+item.name);
 assert.ok(geometry.workspace.left>=0&&geometry.workspace.right<=geometry.viewport[0]+1&&geometry.workspace.top>=geometry.header.bottom-1&&geometry.workspace.bottom<=geometry.status.top+1,label+' workspace escapes shell');
 assert.ok(geometry.reader.every(item=>item.hidden&&item.inert&&!item.visible),label+' reader workspace is not fully hidden and inert');
 if(geometry.panes.some(item=>item.scroll>item.client+1)){console.error(JSON.stringify(geometry.calendar,null,2));await page.locator('.calendar-card').scrollIntoViewIfNeeded();}
 assert.ok(geometry.panes.every(item=>item.scroll<=item.client+1),label+' unintended horizontal overflow '+JSON.stringify(geometry.panes.filter(item=>item.scroll>item.client+1)));
 checks.push({label,viewport:geometry.viewport,controlsNamed:true,readerHidden:true,overlaps:0,horizontalOverflow:false,independentScrolling:geometry.scroll.height>geometry.scroll.client});
}
async function checkFocus(selector,label){
 const node=page.locator(selector).first();await node.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
 const result=await node.evaluate(el=>{const style=getComputedStyle(el);return {active:document.activeElement===el,visible:el.matches(':focus-visible'),outline:style.outlineStyle,width:parseFloat(style.outlineWidth),inert:!!el.closest('[inert]')};});
 assert.equal(result.active,true,label+' keyboard focus lost');assert.equal(result.visible,true,label+' keyboard focus invisible');assert.ok(result.width>0&&result.outline!=='none',label+' missing focus outline');assert.equal(result.inert,false,label+' focus entered inactive workspace');checks.push({label,keyboardFocus:true});
}
async function checkBarLabels(label){
 const charts=await page.locator('.vertical-bars').evaluateAll(nodes=>nodes.map(chart=>{
  const bounds=chart.getBoundingClientRect(),labels=[...chart.querySelectorAll('small')].filter(node=>node.textContent.trim()&&node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden'&&getComputedStyle(node).display!=='none').map(node=>{
   const range=document.createRange();range.selectNodeContents(node);const text=range.getBoundingClientRect(),box=node.getBoundingClientRect(),style=getComputedStyle(node);
   return {text:node.textContent,left:text.left,right:text.right,top:text.top,bottom:text.bottom,clipped:/hidden|clip/.test(style.overflowX)&&(text.left<box.left-1||text.right>box.right+1)};
  });return {left:bounds.left,right:bounds.right,labels};
 }));
 for(const chart of charts){assert.ok(chart.labels.length>=4,label+' too few readable axis labels');for(const item of chart.labels){assert.equal(item.clipped,false,label+' truncated axis label '+item.text);assert.ok(item.left>=chart.left-1&&item.right<=chart.right+1,label+' axis label escapes chart '+item.text);}for(let i=0;i<chart.labels.length;i++)for(let j=i+1;j<chart.labels.length;j++){const a=chart.labels[i],b=chart.labels[j];assert.ok(Math.min(a.right,b.right)-Math.max(a.left,b.left)<=1||Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=1,label+' overlapping axis labels '+a.text+' / '+b.text);}}
 checks.push({label,barAxesReadable:true,labels:charts.map(chart=>chart.labels.map(item=>item.text))});
}
try{
 if(process.env.READER_ACTIVITY_STARTS_ONLY==='1'){
  for(const language of ['en','hu','de','fr','ja'])for(const [width,height] of [[680,540],[1280,820]]){
   await reload({language,width,height});await app.evaluate(()=>{global.estimatedStarts=19;});await analytics();
   await filter('metric').selectOption('conversations');await ready();
   const details=page.locator('.analytics-coverage');assert.equal(await details.evaluate(el=>el.open),false,'Source coverage remains collapsed by default');
   await details.locator('summary').click();
   const expected=translator(language)('activityEstimatedStarts',{count:new Intl.NumberFormat(localeCode(language)).format(19)});
   assert.equal(await details.locator('[data-activity-estimated-starts]').textContent(),expected,'Estimated starts have a complete localized explanation');
   assert.equal(await details.locator('[data-activity-estimated-starts]').isVisible(),true);
   await checkLayout(`estimated-starts-${language}-${width}x${height}`);
   const textBounds=await details.locator('[data-activity-estimated-starts]').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const text=range.getBoundingClientRect(),box=el.getBoundingClientRect();return {left:text.left,right:text.right,boxLeft:box.left,boxRight:box.right};});
   assert.ok(textBounds.left>=textBounds.boxLeft-1&&textBounds.right<=textBounds.boxRight+1,'Disclosure text fits its existing panel');
   for(const value of [0,null]){await app.evaluate((_electron,value)=>{global.estimatedStarts=value;},value);await analyticsAction('refresh').click();await ready();assert.equal(await page.locator('[data-activity-estimated-starts]').count(),0,'No estimate notice for reports without estimates');}
  }
  assert.deepEqual(errors,[]);const report={version:'1.0.0',revision:3,checks,pageErrors:errors};await writeFile(path.join(evidence,'activity-estimated-starts-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }else if(process.env.READER_ACTIVITY_DISCLOSURES_ONLY==='1'){
  await page.locator('.conversation-row').first().waitFor();await analytics();await analyticsAction('tab','[data-tab="graphs"]').click();
  const timeline=page.locator('.analytics-timeline').first(),card=timeline.locator('..');
  const geometry=()=>card.evaluate(el=>{const axis=el.querySelector('.timeline-scale').getBoundingClientRect(),plot=el.querySelector('.analytics-timeline').getBoundingClientRect();return {height:axis.height,top:axis.top-plot.top,bottom:axis.bottom-plot.top};});
  const before=await geometry();await card.locator('.chart-data summary').click();const after=await geometry();assert.equal(before.height,132,'Timeline numeric axis must match its132px plotting extent');assert.deepEqual(after,before,'Expanding the chart data table stretches or moves its numeric axis');assert.equal(await card.locator('.chart-data').evaluate(el=>el.open),true);
  await card.evaluate(el=>{const host=document.querySelector('#analyticsWorkspace');host.scrollTop+=el.getBoundingClientRect().top-host.getBoundingClientRect().top-20;});await screenshot('en-1280x820-light-default-Graph-Data-Expanded');assert.deepEqual(errors,[]);const report={version:'3.0.0',appRoot,checks:[{disclosure:'timeline data table',before,after,axisPreserved:true}],pageErrors:errors};await writeFile(path.join(evidence,'activity-disclosure-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }else if(process.env.READER_ACTIVITY_MOTION_ONLY==='1'){
  const checks=[];await page.emulateMedia({reducedMotion:'no-preference'});
  for(const [animations,reducedMotion,expected] of [[false,'no-preference','0s'],[true,'no-preference','0.2s'],[true,'reduce','0s']]){await page.emulateMedia({reducedMotion});await reload({animations});const duration=await page.locator('.workspace-switch').evaluate(el=>getComputedStyle(el,'::before').transitionDuration);assert.equal(duration,expected,'Workspace switch motion preference');checks.push({animations,reducedMotion,transitionDuration:duration});}
  assert.deepEqual(errors,[]);const report={version:'3.0.0',appRoot,checks,pageErrors:errors};await writeFile(path.join(evidence,'activity-motion-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }else{
 await page.locator('.conversation-row').first().waitFor();
 assert.equal(await action('workspace-reader').getAttribute('aria-pressed'),'true','Reader is the startup workspace');
 assert.equal(await page.locator('#analyticsWorkspace').evaluate(el=>el.hidden&&el.inert),true);
 await page.locator('.conversation-row').first().click();await page.locator('.message').first().waitFor();
 await page.locator('.bookmark-message').first().click();
 await action('find-open').click();await page.locator('#readerFindInput').fill('preserve');
 await page.evaluate(()=>{const pane=document.querySelector('#conversationContent');pane.scrollTop=350;window.__originalReader=pane;window.__originalMessage=pane.querySelector('.message');});
 const initial=await page.evaluate(()=>({scroll:document.querySelector('#conversationContent').scrollTop,find:document.querySelector('#readerFindInput').value,marks:document.querySelectorAll('.bookmark-message[aria-pressed="true"]').length}));
 assert.ok(initial.scroll>0);assert.equal(initial.marks,1);
 await analytics();await checkLayout('Reader-to-Activity');
 await filter('year').selectOption('2025');await ready();assert.equal(await filter('calendarYear').inputValue(),'2025','Selecting a report year must display that calendar year');
 await filter('year').selectOption('2026');await ready();assert.equal(await filter('calendarYear').inputValue(),'2026');
 await app.evaluate(()=>{global.delays={all:400};});await analyticsAction('refresh').click();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('progress',{operation:'activity',phase:'activity-index',done:5,total:76}));await page.waitForFunction(()=>document.querySelector('[data-activity-progress]')?.textContent.includes('5 / 76'));await ready();await app.evaluate(()=>{global.delays={};});
 workflows.push('Year selection controls displayed mosaic year; Local indexing progress displays completed/total counts');
 await filter('metric').selectOption('user');await ready();
 await filter('branch').selectOption('active');await ready();
 await filter('zone').selectOption('utc');await ready();
 const shellBefore=await page.evaluate(()=>({header:document.querySelector('.app-header').getBoundingClientRect().y,status:document.querySelector('.statusbar').getBoundingClientRect().y}));
 await page.evaluate(()=>document.querySelector('#analyticsWorkspace').scrollTop=270);
 const shellAfter=await page.evaluate(()=>({header:document.querySelector('.app-header').getBoundingClientRect().y,status:document.querySelector('.statusbar').getBoundingClientRect().y}));assert.deepEqual(shellAfter,shellBefore,'Analytics scrolling moves banner or status bar');
 const activityScroll=await page.locator('#analyticsWorkspace').evaluate(el=>el.scrollTop);
 await action('workspace-reader').click();
 const restored=await page.evaluate(()=>({sameNode:document.querySelector('#conversationContent')===window.__originalReader,sameMessage:document.querySelector('#conversationContent .message')===window.__originalMessage,scroll:document.querySelector('#conversationContent').scrollTop,find:document.querySelector('#readerFindInput').value,marks:document.querySelectorAll('.bookmark-message[aria-pressed="true"]').length,analyticsHidden:document.querySelector('#analyticsWorkspace').hidden&&document.querySelector('#analyticsWorkspace').inert}));
 assert.equal(restored.sameNode,true,'Workspace toggle recreates Reader DOM');assert.equal(restored.sameMessage,true,'Workspace toggle recreates messages');assert.equal(restored.scroll,initial.scroll);assert.equal(restored.find,initial.find);assert.equal(restored.marks,initial.marks);assert.equal(restored.analyticsHidden,true);
 await analytics();assert.equal(await filter('metric').inputValue(),'user');assert.equal(await filter('branch').inputValue(),'active');assert.equal(await filter('zone').inputValue(),'utc');assert.equal(await page.locator('#analyticsWorkspace').evaluate(el=>el.scrollTop),activityScroll);
 workflows.push('Reader/Activity round trip retains exact Reader DOM, scroll, find and bookmark state, and analytics filters/scroll');
 await page.locator('.mosaic-day[data-date="2026-09-14"]').click();await ready();assert.equal(await filter('date').inputValue(),'2026-09-14');assert.equal(await analyticsAction('tab','[data-tab="conversations"]').getAttribute('aria-pressed'),'true');
 assert.ok((await page.locator('.analytics-conversations tbody tr').first().locator('td').last().textContent()).includes('1970'),'Epoch-zero message timestamps must remain dated');
 const beforeOpen=await app.evaluate(()=>global.calls.filter(x=>x.action==='thread').length);
 await analyticsAction('open').first().click();await page.locator('.content-pane:visible').waitFor();assert.equal(await action('workspace-reader').getAttribute('aria-pressed'),'true');
 const opened=await app.evaluate(()=>global.calls.filter(x=>x.action==='thread'));assert.equal(opened.length,beforeOpen+1);assert.equal(opened.at(-1).args.id,'synthetic-0');
 await analytics();assert.equal(await filter('date').inputValue(),'2026-09-14');await analyticsAction('export').click();assert.ok(await app.evaluate(()=>global.calls.some(x=>x.action==='activity.export'&&x.args.date==='2026-09-14'&&x.args.branch==='active'&&x.args.zone==='utc')));
 await analyticsAction('rebuild').click();await ready();assert.ok(await app.evaluate(()=>global.calls.some(x=>x.action==='activity.rebuild')));
 workflows.push('Calendar date drills into matching conversation list; exact conversation opens Reader; returning retains date, branch and time zone; CSV/rebuild dispatch correctly');

 // A late response from the previous source must not repaint the active source.
 await reload();await analytics();await app.evaluate(()=>{global.delays={all:350};global.calls=[];});await analyticsAction('refresh').click();await action('mode-server').click();await ready();await page.waitForTimeout(400);assert.equal(await page.locator('.analytics-tabs').count(),0);assert.equal(await page.locator('.mosaic-day').count(),0);assert.ok((await page.locator('#analyticsWorkspace').textContent()).includes('14,302'));
 assert.ok((await app.evaluate(()=>global.calls.filter(x=>x.action==='server.insights'))).length>0);assert.ok(await app.evaluate(()=>global.calls.some(x=>x.action==='activity.cancel')),'Leaving Local Activity must request cancellation');
 await app.evaluate(()=>{global.delays={all:350,Secondary:10};global.calls=[];});await analyticsAction('refresh').click();await filter('collection').selectOption('Secondary');await ready();await page.waitForTimeout(400);assert.equal(await filter('collection').inputValue(),'Secondary');assert.equal((await page.locator('.analytics-stat strong').nth(1).textContent()).trim(),'321');
 const serverCalls=await app.evaluate(()=>global.calls);assert.ok(serverCalls.some(x=>x.action==='server.insights.cancel'),'Superseded Server Insights must request cancellation');assert.equal(serverCalls.filter(x=>x.action==='thread'||x.action==='activity.query').length,0,'Server Insights scans conversation bodies or calls Local analytics');
 workflows.push('Late Local/source-scope reports cannot overwrite Server Insights; Server Insights uses summary IPC without conversation-body calls');
 await app.evaluate(()=>{global.delays={};global.responseMode='error';});await analyticsAction('refresh').first().click();await page.locator('.analytics-error').waitFor();assert.ok((await page.locator('.analytics-error').textContent()).includes('Synthetic unavailable source'));await checkLayout('Server-error');
 await app.evaluate(()=>{global.responseMode='normal';});await page.locator('.analytics-error [data-activity-action="refresh"]').click();await ready();assert.equal(await page.locator('.analytics-error').count(),0);
 await action('mode-local').click();await ready();await app.evaluate(()=>{global.responseMode='empty';});await analyticsAction('refresh').click();await ready();await page.locator('.analytics-empty').waitFor();await checkLayout('Local-empty');
 workflows.push('Server errors offer retry and recover; empty Local archive renders an explicit empty state');
 await app.evaluate(()=>{global.responseMode='normal';});await analyticsAction('refresh').click();await ready();await app.evaluate(()=>{global.delays={all:350};});await filter('metric').selectOption('assistant');await page.locator('[data-activity-action="cancel"]').waitFor();assert.equal(await page.locator('.analytics-stats,.analytics-conversations').count(),0,'A pending new filter still displays old statistics');await analyticsAction('cancel').click();await page.waitForTimeout(400);assert.equal(await page.locator('.analytics-stats,.analytics-conversations').count(),0,'Cancelled or late report remains visible');assert.equal(await filter('metric').inputValue(),'assistant');await app.evaluate(()=>{global.delays={};});await analyticsAction('refresh').click();await ready();workflows.push('Pending changed filters and explicit cancellation clear stale statistics; late replies stay discarded; selected filters survive and Refresh recovers');

 // Eight locale/size cases, twelve palette/theme cases, four large-font/contrast cases.
 for(const language of ['en','hu','de','fr'])for(const [width,height] of [[680,540],[1280,820]])scenarios.push({language,width,height,theme:'light',uiPalette:'default',fontSize:'normal',highContrast:false});
 for(const palette of UI_PALETTES)for(const theme of ['light','dark'])scenarios.push({language:'en',width:680,height:540,theme,uiPalette:palette.id,fontSize:'normal',highContrast:false});
 for(const language of ['en','hu','de','fr'])scenarios.push({language,width:680,height:540,theme:'dark',uiPalette:'oled',fontSize:'xl',highContrast:true});
 for(const scenario of scenarios){
  const label=`${scenario.language}-${scenario.width}x${scenario.height}-${scenario.theme}-${scenario.uiPalette}-${scenario.fontSize}${scenario.highContrast?'-contrast':''}`;
  await reload(scenario);await analytics();await checkLayout(label+'/Activity');
  if(scenario.width===1280||scenario.highContrast||(scenario.language==='en'&&scenario.uiPalette==='default'))await screenshot(label+'-Activity');
  await analyticsAction('tab','[data-tab="graphs"]').click();await checkLayout(label+'/Graphs');await checkBarLabels(label+'/Bar-axis-labels');if(scenario.width===1280)await screenshot(label+'-Graphs');if(scenario.language==='en'&&scenario.width===680&&scenario.uiPalette==='default'&&scenario.theme==='light'){await page.locator('.vertical-bars').nth(1).scrollIntoViewIfNeeded();await screenshot(label+'-Graphs-Hours');}
  await analyticsAction('tab','[data-tab="conversations"]').click();await checkLayout(label+'/Conversations');if(scenario.width===1280)await screenshot(label+'-Conversations');
  if(scenario.language==='en'&&scenario.uiPalette==='default'&&scenario.width===680){await checkFocus('[data-activity-filter="collection"]',label+'/filter-focus');await checkFocus('[data-activity-action="open"]',label+'/thread-focus');await checkFocus('[data-action="workspace-reader"]',label+'/switch-focus');}
  await action('mode-server').click();await ready();await checkLayout(label+'/Server-Insights');
  if(scenario.width===1280||scenario.highContrast||(scenario.language==='en'&&scenario.uiPalette==='default'))await screenshot(label+'-Server-Insights');
 }
 await reload({width:1280,height:820});await analytics();await page.locator('.mosaic-day[tabindex="0"]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.mosaic-day:focus').getAttribute('data-day'),'7');await page.keyboard.press('End');assert.equal(await page.locator('.mosaic-day:focus').getAttribute('data-date'),'2026-12-31');await page.keyboard.press('Home');assert.equal(await page.locator('.mosaic-day:focus').getAttribute('data-date'),'2026-01-01');assert.equal(await page.locator('.mosaic-day[tabindex="0"]').count(),1);workflows.push('Mosaic has one tab stop and keyboard navigation reaches days and year endpoints');
 assert.deepEqual(errors,[],'Renderer page errors');
 const report={version:'3.0.0',appRoot,fixture:'synthetic IPC; real bundled renderer and ReaderView',scenarios:scenarios.length,layoutChecks:checks.length,workflows,checks,pageErrors:errors};await writeFile(path.join(evidence,'activity-ui-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
}catch(error){await screenshot('Failure-'+currentLabel.replaceAll('/','-')).catch(()=>{});throw error;}
finally{await app.close();await rm(tmp,{recursive:true,force:true});}
