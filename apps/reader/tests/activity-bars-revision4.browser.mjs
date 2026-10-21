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
const evidence=path.resolve(process.env.READER_EVIDENCE||path.join(root,'docs/evidence/revision4-bars'));
await mkdir(evidence,{recursive:true});
const settings={language:'en',mode:'local',theme:'light',uiPalette:'default',codeTheme:'default',fontSize:'normal',highContrast:false,compact:true,animations:false,listMode:'pages',pageSize:50,sort:'updated',localCollection:'all',serverCollection:'all',serverUrl:'http://127.0.0.1:3000/',serverAddresses:['http://127.0.0.1:3000/'],directoryMode:'last',customDirectory:'',searchPanelExpanded:false,searchMode:'keyword'};
const thread={id:'synthetic-0',collection:'Research collection with a deliberately long descriptive name',provider:'openai',sourceFile:'/synthetic/long-directory-name/conversation-export.json',conversationKey:'sample',title:'Synthetic conversation with a deliberately long title for wrapping and alignment checks',turnCount:4,turns:[{user:'How can we preserve reading state?',turn_index:0},{thinking:'Check the state before and after switching workspaces.',turn_index:1},{ai:'# Reader preservation\n\n'+Array.from({length:35},(_,i)=>`Paragraph ${i+1}: preserve the selected conversation, bookmarks, find matches, and scroll position when switching to Activity and back.`).join('\n\n'),turn_index:2},{user:'Reading state remains available.',turn_index:3}]};
await writeFile(path.join(tmp,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('desktop',{invoke:(a,b)=>ipcRenderer.invoke('call',a,b),onProgress:callback=>ipcRenderer.on('progress',(_event,value)=>callback(value)),onMenu:()=>{}});`);

function mockMain(config){
 const {app,BrowserWindow,ipcMain}=require('electron');
 app.setPath('userData',config.profile);global.uiSettings=config.settings;global.reading={positions:{},bookmarks:[],recent:[]};global.calls=[];global.responseMode='normal';global.delays={};global.estimatedStarts=19;global.fixtureMode='normal';
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
  if(a==='bootstrap')return {settings:global.uiSettings,reading:global.reading,dataDir:'Synthetic isolated test profile',version:'1.0.0',searchStatus:{modelReady:false,indexedPassages:0}};
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
   if(global.fixtureMode==='edge'){if(a==='server.insights'){result.topModels=[{model:'Zero',count:0},{model:'Tiny',count:1},{model:'Large',count:1000}];result.roles={Zero:0,Tiny:1,Large:1000};result.providers=[{provider:'Zero',turns:0,conversations:1},{provider:'Tiny',turns:1,conversations:1},{provider:'Large',turns:1000,conversations:1}];}else{result.weekdays=[0,1,1000,2,3,4,5];result.hours=Array.from({length:24},(_,i)=>i===0?0:i===1?1:1000);result.modelCounts={Zero:0,Tiny:1,Large:1000};result.roles={Zero:0,Tiny:1,Large:1000};}}if(global.fixtureMode==='single'){result.modelCounts={Only:1};result.roles={Only:1};result.topModels=[{model:'Only',count:1}];result.providers=[{provider:'Only',turns:1,conversations:1}];}if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
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
async function ready(){await page.waitForFunction(()=>{const h=document.querySelector('#analyticsWorkspace');return h&&!h.hidden&&h.getAttribute('aria-busy')==='false'&&!!h.querySelector('.analytics-stats');});}
async function analytics(){await action('workspace-analytics').click();await ready();}
async function reload(values={}){await app.evaluate(({BrowserWindow},{values,defaults})=>{global.uiSettings={...defaults,...values};global.responseMode='normal';global.fixtureMode='normal';global.delays={};global.calls=[];global.reading={positions:{},bookmarks:[],recent:[]};BrowserWindow.getAllWindows()[0].setContentSize(values.width||1280,values.height||820);},{values,defaults:settings});await page.reload();await page.locator('.conversation-row').first().waitFor();}

const consoleErrors=[],requests=[];
page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
const matrix=[];
const snapshot=chart=>chart.evaluate(node=>[...node.children].map(row=>{
 const fill=row.querySelector('.bar-track>span')||row.querySelector(':scope>div>span'),label=row.querySelector('small')||row.querySelector(':scope>div>span'),s=getComputedStyle(fill),r=fill.getBoundingClientRect(),rr=row.getBoundingClientRect();
 return {opacity:+s.opacity,outline:s.outlineStyle,outlineWidth:parseFloat(s.outlineWidth),outlineColor:s.outlineColor,width:r.width,height:r.height,rowWidth:rr.width,rowHeight:rr.height,labelOpacity:+getComputedStyle(label).opacity,rowOpacity:+getComputedStyle(row).opacity,focus:row.matches(':focus-visible'),hover:row.matches(':hover'),name:row.getAttribute('aria-label'),title:row.getAttribute('title'),role:row.getAttribute('role'),tabIndex:row.tabIndex,fillBackground:s.backgroundImage,trackOverflow:row.querySelector('.bar-track')?getComputedStyle(row.querySelector('.bar-track')).overflow:null};
}));
async function neutral(){await page.mouse.move(1,1);await page.evaluate(()=>document.activeElement?.blur());}
async function shape(chart){const rows=await snapshot(chart);return rows.map(({width,height,rowWidth,rowHeight})=>({width,height,rowWidth,rowHeight}));}
function expectActive(rows,index,dim=true){for(let i=0;i<rows.length;i++){
 assert.equal(rows[i].opacity,i===index||!dim?1:.67,'only other fills dim');
 assert.equal(rows[i].rowOpacity,1,'row and text remain opaque');assert.equal(rows[i].labelOpacity,1,'label remains opaque');
 if(i===index){assert.equal(rows[i].outline,'solid');assert.ok(rows[i].outlineWidth>=2,'active fill outline');}else assert.ok(rows[i].outline==='none'||rows[i].outlineWidth===0,'unselected fill outline');
 assert.equal(rows[i].tabIndex,0);assert.equal(rows[i].role,'img');assert.ok(rows[i].name);assert.ok(rows[i].name.startsWith(rows[i].title+' '),'accessible name retains value and adds unit');
}}
async function checkPointer(chart,dim=true,index=1){
 await neutral();await chart.scrollIntoViewIfNeeded();const before=await shape(chart);await chart.locator(':scope>div').nth(index).hover();const rows=await snapshot(chart);expectActive(rows,index,dim);assert.deepEqual(await shape(chart),before,'hover must not change bar or row dimensions');
 await neutral();const cleared=await snapshot(chart);assert.ok(cleared.every(x=>x.opacity===1&&x.outline==='none'),'hover clears on leave');return rows;
}
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS',name);};
async function graphs(){await analytics();await analyticsAction('tab','[data-tab="graphs"]').click();await page.locator('.vertical-bars').first().waitFor();}
async function layout(){const r=await page.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,overflow:[...document.querySelectorAll('.analytics-grid,.analytics-card,.vertical-bars,.horizontal-bars')].filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.className)}));assert.ok(r.sw<=r.w+1&&r.sh<=r.h+1);assert.deepEqual(r.overflow,[]);return r;}
try{
 await page.locator('.conversation-row').first().waitFor();
 await check('Pointer, focus and chart isolation use the same active fill without changing geometry or label opacity',async()=>{
  await graphs();const v=page.locator('.vertical-bars').first(),h=page.locator('.horizontal-bars').first();await checkPointer(v);await checkPointer(h);
  await neutral();await v.scrollIntoViewIfNeeded();await page.keyboard.press('Tab');await v.locator(':scope>div').nth(1).focus();expectActive(await snapshot(v),1);assert.ok((await snapshot(v))[1].focus);
  await v.locator(':scope>div').nth(2).hover();expectActive(await snapshot(v),2);
  await page.mouse.move(1,1);expectActive(await snapshot(v),1);
  await h.locator(':scope>div').first().hover();expectActive(await snapshot(h),0);expectActive(await snapshot(v),1);
  await neutral();await v.locator(':scope>div').first().hover();assert.ok((await snapshot(h)).every(x=>x.opacity===1&&x.outline==='none'),'another chart cannot remain dimmed');
  await neutral();await v.locator(':scope>div').nth(5).focus();await page.keyboard.press('Tab');assert.ok((await snapshot(v))[6].focus,'Tab reaches next bar');await action('workspace-reader').click();assert.equal(await page.locator('#analyticsWorkspace').getAttribute('hidden'),'');await analytics();await neutral();assert.ok((await snapshot(page.locator('.vertical-bars').first())).every(x=>x.opacity===1&&x.outline==='none'),'return does not retain stale selection');
 });
 await check('Zero, tiny and single bars keep their true size and remain selectable in both orientations and sources',async()=>{
  await app.evaluate(()=>{global.fixtureMode='edge';});await analyticsAction('refresh').click();await ready();const v=page.locator('.vertical-bars').first(),h=page.locator('.horizontal-bars').first();
  const vv=await checkPointer(v,true,0);assert.equal(vv[0].height,0);const hh=await checkPointer(h,true,2);assert.equal(hh[2].width,0);assert.equal(hh[2].trackOverflow,'visible');await checkPointer(v,true,1);await checkPointer(h,true,1);
  await v.locator(':scope>div').nth(1).hover();await screenshot('tiny-vertical');await h.locator(':scope>div').nth(1).hover();await screenshot('tiny-horizontal');
  await v.locator(':scope>div').first().hover();await screenshot('zero-vertical');await h.locator(':scope>div').nth(2).hover();await screenshot('zero-horizontal');
  await action('mode-server').click();await ready();for(const c of await page.locator('.horizontal-bars').all())await checkPointer(c,true,2);
  await app.evaluate(()=>{global.fixtureMode='single';});await analyticsAction('refresh').click();await ready();await checkPointer(page.locator('.horizontal-bars').first(),true,0);
  await action('mode-local').click();await ready();await checkPointer(page.locator('.horizontal-bars').first(),true,0);
 });
 await check('All 17 palettes × light/dark × styled Off/On preserve scoped hover outlines and existing fill styles',async()=>{
  for(const palette of UI_PALETTES)for(const theme of ['light','dark'])for(const styled of [false,true]){
   await reload({uiPalette:palette.id,theme,analyticsStyledBars:styled});await graphs();const v=page.locator('.vertical-bars').first(),h=page.locator('.horizontal-bars').first();const vr=await checkPointer(v),hr=await checkPointer(h);
   assert.equal(await page.locator('html').getAttribute('data-analytics-styled-bars'),String(styled));
   assert.equal(vr[1].fillBackground.includes('gradient'),styled);assert.equal(hr[1].fillBackground.includes('gradient'),styled);
   if(palette.id==='harbor-haze'&&theme==='dark'&&styled){await v.locator(':scope>div').nth(3).hover();await screenshot('harbor-dark-styled-weekdays');await h.locator(':scope>div').nth(1).hover();await screenshot('harbor-dark-styled-models');}
   if(palette.id==='default'&&theme==='light'&&!styled){await v.locator(':scope>div').nth(3).hover();await screenshot('default-light-weekdays');await h.locator(':scope>div').nth(1).hover();await screenshot('default-light-models');}
   await action('mode-server').click();await ready();await checkPointer(page.locator('.horizontal-bars').first());await layout();matrix.push({palette:palette.id,theme,styled,vertical:vr[1].outlineColor,horizontal:hr[1].outlineColor});
  }
 });
 await check('High contrast and forced colors retain readable undimmed bars and a stronger outline',async()=>{
  await reload({highContrast:true,theme:'dark',analyticsStyledBars:true});await graphs();const v=await checkPointer(page.locator('.vertical-bars').first(),false),h=await checkPointer(page.locator('.horizontal-bars').first(),false);assert.ok(v[1].outlineWidth>=3&&h[1].outlineWidth>=3);
  await reload({highContrast:false,theme:'light',analyticsStyledBars:false});await graphs();await page.emulateMedia({forcedColors:'active'});await checkPointer(page.locator('.vertical-bars').first(),false);await checkPointer(page.locator('.horizontal-bars').first(),false);await page.emulateMedia({forcedColors:'none'});
 });
 await check('Five locales at minimum size, wide/tall shapes, reduced motion and dense hours remain stable',async()=>{
  for(const language of ['en','hu','de','fr','ja']){await reload({language,width:680,height:540,theme:'dark',uiPalette:'harbor-haze',analyticsStyledBars:true});await graphs();await checkPointer(page.locator('.vertical-bars').nth(1),true,23);await checkPointer(page.locator('.horizontal-bars').first());await layout();}
  for(const [width,height] of [[1800,600],[760,1200]]){await reload({width,height,theme:'light'});await graphs();await checkPointer(page.locator('.vertical-bars').first());await checkPointer(page.locator('.horizontal-bars').first());await layout();}
  await page.emulateMedia({reducedMotion:'reduce'});await checkPointer(page.locator('.vertical-bars').first());await page.emulateMedia({reducedMotion:'no-preference'});
 });
 assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(requests,[]);
 await writeFile(path.join(evidence,'activity-bars-revision4.json'),JSON.stringify({passed:true,version:'1.0.0',revision:4,engine:await app.evaluate(()=>process.versions),checks,matrix,errors,consoleErrors,requests},null,2)+'\n');
 console.log('PASS',matrix.length,'theme/style cases');
}catch(error){await writeFile(path.join(evidence,'activity-bars-revision4.json'),JSON.stringify({passed:false,checks,matrix,errors,consoleErrors,requests,error:error.stack},null,2)+'\n');await screenshot('failure').catch(()=>{});throw error;}finally{await app.close();await rm(tmp,{recursive:true,force:true});}
