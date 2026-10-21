#!/usr/bin/env node
// Revision 2 marker audit: independent getScreenCTM oracle; synthetic IPC only.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm,cp} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const require=createRequire(import.meta.url);
const {_electron}=process.env.THREADSHELF_PLAYWRIGHT_MODULE?await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE):require('playwright');
const tmp=await mkdtemp(path.join(os.tmpdir(),'threadshelf-revision2-marker-'));
const evidence=path.resolve(process.env.READER_EVIDENCE||path.join(root,'docs/evidence/v3.0.0-revision-2/marker-audit'));
await mkdir(evidence,{recursive:true});
// Each run uses one immutable renderer snapshot, avoiding build/test races.
await cp(path.join(process.env.READER_APP_ROOT||root,'dist'),path.join(tmp,'dist'),{recursive:true});
const settings={language:'en',mode:'local',theme:'light',uiPalette:'default',codeTheme:'default',fontSize:'normal',highContrast:false,compact:true,animations:true,listMode:'pages',pageSize:50,sort:'updated',localCollection:'all',serverCollection:'all',serverUrl:'http://127.0.0.1:3000/',serverAddresses:['http://127.0.0.1:3000/'],directoryMode:'last',customDirectory:'',searchPanelExpanded:false,searchMode:'keyword'};
await writeFile(path.join(tmp,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('desktop',{invoke:(a,b)=>ipcRenderer.invoke('call',a,b),onProgress:callback=>ipcRenderer.on('progress',(_event,value)=>callback(value)),onMenu:()=>{}});`);
function mockMain(config){
 const {app,BrowserWindow,ipcMain}=require('electron');
 app.setPath('userData',config.profile);global.uiSettings=config.settings;global.seriesShape='mixed';global.includeRoles=true;global.calls=[];
 const thread={id:'synthetic',collection:'Synthetic collection',provider:'openai',sourceFile:'/synthetic/example.json',conversationKey:'one',title:'Synthetic conversation',turnCount:2,turns:[{user:'Synthetic question',turn_index:0},{ai:'Synthetic reply',turn_index:1}]};
 const collections=[{name:thread.collection,count:3}];
 function series(bucket='monthly'){
  const values=global.seriesShape==='single-high'?[1234567]:global.seriesShape==='single'?[0]:global.seriesShape==='dense'?Array.from({length:3650},(_,i)=>i===0||i===3649?0:i%41*37):global.seriesShape==='zeros'?[0,0,0,0,0,0]:[0,13,850,7,0,1234567];
  return values.map((count,i)=>({date:bucket==='monthly'?new Date(Date.UTC(2024,i,1)).toISOString().slice(0,7):new Date(Date.UTC(2024,0,1+i*(bucket==='weekly'?7:1))).toISOString().slice(0,10),count}));
 }
 function report(args,server){
  const timeline=series(args.bucket),summary={conversations:3,totalConversations:3,value:1235437,activeDays:4,longest:3,undated:0};
  if(!server)return {summary,coverage:{original:3,normalized:0},warnings:{},storage:{profile:'7z'},years:[2024],models:['Synthetic model'],daily:[{date:'2024-01-01',messages:1,user:1,assistant:0,conversations:1}],timeline,weekdays:[1,2,3,4,5,6,7],hours:Array(24).fill(1),modelCounts:{'Synthetic model':2},roles:{user:1,assistant:2},rows:[thread],rowCount:1,offset:0,limit:50};
  return {collection:args.collection,totals:{collections:1,files:3,chunks:1235437,conversations:3,turns:12},...(global.includeRoles?{roles:{user:5,thinking:1,ai:6}}:{}),activity:series().map(({date,count})=>({month:date,count})),topModels:[{model:'Synthetic model',count:1235437}],providers:[{provider:'openai',conversations:2,turns:8},{provider:'anthropic',conversations:1,turns:4}],longestThreads:[thread],firstActivity:'2024-01-01T00:00:00Z',lastActivity:'2024-06-01T00:00:00Z'};
 }
 ipcMain.handle('call',async(_event,action,args={})=>{
  global.calls.push({action,args});
  if(action==='bootstrap')return {settings:global.uiSettings,reading:{positions:{},bookmarks:[],recent:[]},dataDir:'Synthetic isolated profile',version:'3.0.0',searchStatus:{modelReady:false,indexedPassages:0}};
  if(action==='settings.save')return global.uiSettings={...global.uiSettings,...args.values};
  if(action==='collections'||action==='server.collections')return {collections};
  if(action==='files')return {files:[thread],total:1,page:1,pageSize:50};
  if(action==='thread')return thread;
  if(action==='activity.query'||action==='activity.rebuild'||action==='server.insights')return report(args,action==='server.insights');
  if(action==='search.status')return {modelReady:false,indexedPassages:0};
  if(action==='ollama.models')return {available:false,installed:false,isLocal:true,models:[],details:[]};
  return {ok:true};
 });
 app.whenReady().then(()=>{const w=new BrowserWindow({width:1280,height:820,show:true,webPreferences:{preload:config.preload,contextIsolation:true,nodeIntegration:false,sandbox:true}});w.setMenu(null);w.loadFile(config.page);});
}
await writeFile(path.join(tmp,'main.cjs'),`(${mockMain.toString()})(${JSON.stringify({profile:path.join(tmp,'profile'),settings,preload:path.join(tmp,'preload.cjs'),page:path.join(tmp,'dist/index.html')})});`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:process.env.READER_ELECTRON||path.join(root,'node_modules/electron/dist/electron'),args:['--no-sandbox','--disable-gpu',path.join(tmp,'main.cjs')],env,timeout:45000});
const page=await app.firstWindow(),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
const action=name=>page.locator(`[data-action="${name}"]`);
const analyticsAction=name=>page.locator(`[data-activity-action="${name}"]`);
const filter=name=>page.locator(`[data-activity-filter="${name}"]`);
const chart=()=>page.locator('.analytics-timeline-focus').first();
const tip=()=>page.locator('.timeline-tooltip').first();
let label='startup';
const screenshot=name=>page.screenshot({path:path.join(evidence,name+'.png')});
async function ready(){await page.waitForFunction(()=>{const h=document.querySelector('#analyticsWorkspace');return h&&!h.hidden&&h.getAttribute('aria-busy')==='false'&&!!h.querySelector('.analytics-stats');});}
async function reload(values={}){await app.evaluate(({BrowserWindow},{values,defaults})=>{global.uiSettings={...defaults,...values};global.seriesShape='mixed';global.includeRoles=true;global.calls=[];BrowserWindow.getAllWindows()[0].setContentSize(values.width||1280,values.height||820);},{values,defaults:settings});await page.reload();await page.locator('.conversation-row').first().waitFor();}
async function graphs(){await action('workspace-analytics').click();await ready();if(await page.locator('[data-tab="graphs"]').count())await page.locator('[data-tab="graphs"]').click();}
async function refresh(shape='mixed',roles=true){await app.evaluate((_electron,{shape,roles})=>{global.seriesShape=shape;global.includeRoles=roles;},{shape,roles});await analyticsAction('refresh').click();await ready();}
const conditions=[],captures=[],tolerance=0.1,capturesOnly=process.env.READER_MARKER_CAPTURES_ONLY==='1';
let totalPositions=0,maxErrorX=0,maxErrorY=0,realMouseChecks=0;
async function plotVisible(){await chart().scrollIntoViewIfNeeded();await page.waitForTimeout(25);}
async function geometry(index){return chart().evaluate((svg,index)=>{
 const p=svg.querySelector('.chart-line').points[index],expected=new DOMPoint(p.x,p.y).matrixTransform(svg.getScreenCTM()),dot=svg.parentElement.querySelector('.timeline-hover-dot'),actual=dot.getBoundingClientRect();
 return {index,selected:Number(svg.dataset.activePoint),expected:{x:expected.x,y:expected.y},actual:{x:actual.x+actual.width/2,y:actual.y+actual.height/2},hidden:dot.hidden,display:getComputedStyle(dot).display,viewport:{width:innerWidth,height:innerHeight},zoom:devicePixelRatio};
},index);}
function record(value,condition){
 const dx=Math.abs(value.actual.x-value.expected.x),dy=Math.abs(value.actual.y-value.expected.y);totalPositions++;maxErrorX=Math.max(maxErrorX,dx);maxErrorY=Math.max(maxErrorY,dy);
 assert.equal(value.selected,value.index,`${condition}: wrong selected bucket ${JSON.stringify(value)}`);assert.equal(value.hidden,false,`${condition}: marker hidden`);assert.notEqual(value.display,'none',`${condition}: marker not rendered`);assert.ok(dx<=tolerance&&dy<=tolerance,`${condition}: marker center differs from SVG point (${dx}, ${dy}) ${JSON.stringify(value)}`);
 return {dx,dy};
}
async function sweep(method,condition){
 await plotVisible();
 const result=await chart().evaluate((svg,{method,tolerance})=>{
  const points=svg.querySelector('.chart-line').points,ctm=svg.getScreenCTM(),dot=svg.parentElement.querySelector('.timeline-hover-dot'),samples=[];let maxErrorX=0,maxErrorY=0,failures=[];
  // The oracle reads browser-rendered SVG geometry. It contains no viewBox or
  // chart padding constants and does not repeat the marker positioning formula.
  svg.focus();svg.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));
  for(let i=0;i<points.length;i++){
   const p=points[i],expected=new DOMPoint(p.x,p.y).matrixTransform(ctm);
   if(method==='pointer')svg.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse',clientX:expected.x,clientY:expected.y}));
   else if(i)svg.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
   const box=dot.getBoundingClientRect(),dx=Math.abs(box.x+box.width/2-expected.x),dy=Math.abs(box.y+box.height/2-expected.y),selected=Number(svg.dataset.activePoint);
   maxErrorX=Math.max(maxErrorX,dx);maxErrorY=Math.max(maxErrorY,dy);
   if(dx>tolerance||dy>tolerance||dot.hidden||selected!==i)failures.push({index:i,selected,dx,dy,hidden:dot.hidden,expected:{x:expected.x,y:expected.y},actual:{x:box.x+box.width/2,y:box.y+box.height/2}});
   if(i===0||i===points.length-1||i===Math.floor(points.length/2))samples.push({index:i,dx,dy});
   if(failures.length>=8)break;
  }
  const card=svg.parentElement,cardStyle=getComputedStyle(card);
  return {method,positions:failures.length?0:points.length,maxErrorX,maxErrorY,failures,samples,viewport:{width:innerWidth,height:innerHeight},devicePixelRatio,cardBorder:{computedLeft:parseFloat(cardStyle.borderLeftWidth),computedTop:parseFloat(cardStyle.borderTopWidth),clientLeft:card.clientLeft,clientTop:card.clientTop}};
 },{method,tolerance});
 totalPositions+=result.positions;maxErrorX=Math.max(maxErrorX,result.maxErrorX);maxErrorY=Math.max(maxErrorY,result.maxErrorY);
 assert.deepEqual(result.failures,[],`${condition}: ${method} marker sweep failed`);conditions.push({condition,...result});
}
async function mousePoint(index,condition,{capture=false}={}){
 await plotVisible();const expected=await chart().evaluate((svg,index)=>{const p=svg.querySelector('.chart-line').points[index],position=new DOMPoint(p.x,p.y).matrixTransform(svg.getScreenCTM());return {x:position.x,y:position.y};},index);
 await page.mouse.move(expected.x,expected.y);await tip().waitFor({state:'visible'});const result=await geometry(index);record(result,condition);realMouseChecks++;
 // Capturing a clip may cause Electron's screenshot transport to resize its
 // viewport, correctly dismissing overlays. A normal viewport capture retains
 // the live hover state and therefore records the marker being measured.
 if(capture){const name=condition.replaceAll(/[^a-zA-Z0-9-]/g,'-')+'-'+index;await page.screenshot({path:path.join(evidence,name+'.png')});assert.equal(await tip().isVisible(),true,condition+': screenshot dismissed the inspected point');captures.push(name+'.png');}
}
async function resize(width,height,zoom=1){
 await app.evaluate(({BrowserWindow},{width,height,zoom})=>{const window=BrowserWindow.getAllWindows()[0];window.setContentSize(width,height);window.webContents.setZoomFactor(zoom);},{width,height,zoom});await page.waitForTimeout(80);
}
async function setScenario(scenario){
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));await reload({...scenario,animations:false});await resize(scenario.width,scenario.height,scenario.zoom);await graphs();
}
try{
 await page.locator('.conversation-row').first().waitFor();
 const scenarios=[
  {name:'baseline',width:1280,height:820,zoom:1,theme:'light',dense:true,bothMethods:true},
  {name:'minimum-oled-xl',width:680,height:540,zoom:1,theme:'dark',uiPalette:'oled',fontSize:'xl',highContrast:true,dense:true},
  {name:'medium-zoom80',width:901,height:820,zoom:.8,theme:'light'},
  {name:'wide-zoom125-oled',width:1280,height:820,zoom:1.25,theme:'dark',uiPalette:'oled',fontSize:'xl'},
  {name:'large-zoom150',width:1600,height:1000,zoom:1.5,theme:'light',dense:true,denseMethod:'keyboard'},
  {name:'minimum-zoom80',width:680,height:540,zoom:.8,theme:'light'},
  {name:'medium-zoom125',width:901,height:540,zoom:1.25,theme:'dark',uiPalette:'oled'},
  {name:'large-normal-xl',width:1600,height:1000,zoom:1,theme:'light',fontSize:'xl'}
 ].filter(s=>!capturesOnly||s.name==='baseline'||s.name==='minimum-oled-xl');
 for(const scenario of scenarios){
  label=scenario.name;await setScenario(scenario);
  for(const mode of ['local','server']){
   if(mode==='server'){await action('mode-server').click();await ready();}
   label=scenario.name+'-'+mode;
   if(!capturesOnly)for(const shape of ['mixed','zeros','single','single-high']){await refresh(shape);await sweep('pointer',label+'-'+shape);await sweep('keyboard',label+'-'+shape);}
   if(!capturesOnly&&scenario.dense){await refresh('dense');await sweep(scenario.denseMethod||'pointer',label+'-dense3650');if(scenario.bothMethods)await sweep('keyboard',label+'-dense3650');}
   await refresh('mixed');for(const index of [0,2,4,5])await mousePoint(index,label+'-real-mouse',{capture:scenario.name==='baseline'||scenario.name==='minimum-oled-xl'});
   if(capturesOnly)continue;
   // Move a real browser focus through both ends after pointer interaction.
   await chart().focus();await page.keyboard.press('Home');record(await geometry(0),label+'-real-keyboard-home');await page.keyboard.press('End');record(await geometry(5),label+'-real-keyboard-end');
   // Opening the accessible table changes card height; neither it nor a scrolled
   // workspace should move the point relative to the actual SVG path.
   await chart().locator('..').locator('.chart-data summary').click();await sweep('pointer',label+'-expanded-table');
   await page.locator('#analyticsWorkspace').evaluate(host=>host.scrollTop+=37);await sweep('keyboard',label+'-scrolled-expanded-table');
   await action('workspace-reader').click();await action('workspace-analytics').click();await ready();await sweep('pointer',label+'-workspace-return');
  }
  console.log(JSON.stringify({scenario:scenario.name,positions:totalPositions,maxErrorX,maxErrorY}));
 }
 // Resize an existing rendered chart (without remounting the workspace), then
 // change Local grouping and metric, ensuring each fresh overlay uses new geometry.
 if(!capturesOnly){await setScenario({name:'dynamic',width:1280,height:820,zoom:1,theme:'light'});
 for(const [width,height,zoom] of [[680,540,1],[901,820,1.25],[1600,1000,.8],[1280,820,1.5]]){await resize(width,height,zoom);await sweep('pointer',`dynamic-resize-${width}x${height}-zoom${zoom}`);}
 for(const bucket of ['daily','weekly','monthly']){await filter('bucket').selectOption(bucket);await ready();await sweep('pointer','group-'+bucket);}
 for(const metric of ['user','assistant','conversations','messages']){await filter('metric').selectOption(metric);await ready();await sweep('keyboard','metric-'+metric);}}
 assert.deepEqual(errors,[],'Renderer errors');
 const report={version:'3.0.0',revision:2,oracle:'Actual SVG polyline points transformed through getScreenCTM using DOMPoint, compared with visible HTML marker bounding-box center',toleranceCSSPixels:tolerance,positions:totalPositions,realMouseChecks,maxErrorX,maxErrorY,scenarioCount:scenarios.length,conditions,captures,pageErrors:errors};await writeFile(path.join(evidence,capturesOnly?'marker-capture-results.json':'marker-accuracy-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({version:report.version,revision:2,positions:totalPositions,realMouseChecks,maxErrorX,maxErrorY,conditions:conditions.length,pageErrors:errors,evidence},null,2));
}catch(error){await screenshot('Failure-'+label.replaceAll('/','-')).catch(()=>{});throw error;}
finally{await app.close();await rm(tmp,{recursive:true,force:true});}
