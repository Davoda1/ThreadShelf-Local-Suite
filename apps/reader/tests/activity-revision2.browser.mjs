#!/usr/bin/env node
// Revision 2: real bundled renderer + synthetic IPC. Never reads a user archive.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm,cp} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const require=createRequire(import.meta.url);
const {_electron}=process.env.THREADSHELF_PLAYWRIGHT_MODULE?await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE):require('playwright');
const tmp=await mkdtemp(path.join(os.tmpdir(),'threadshelf-revision2-ui-'));
const evidence=path.resolve(process.env.READER_EVIDENCE||path.join(root,'docs/evidence/v3.0.0-revision-2'));
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
  const values=global.seriesShape==='single'?[0]:global.seriesShape==='dense'?Array.from({length:3650},(_,i)=>i===0||i===3649?0:i%41*37):global.seriesShape==='zeros'?[0,0,0,0,0,0]:[0,13,850,7,0,1234567];
  return values.map((count,i)=>({date:bucket==='monthly'?new Date(Date.UTC(2024,i,1)).toISOString().slice(0,7):new Date(Date.UTC(2024,0,1+i*(bucket==='weekly'?7:1))).toISOString().slice(0,10),count}));
 }
 function report(args,server){
  const timeline=series(args.bucket),summary={conversations:3,totalConversations:3,value:1235437,activeDays:4,longest:3,undated:0};
  if(!server)return {summary,coverage:{original:3,normalized:0},warnings:{},storage:{profile:'7z'},years:[2024],models:['Synthetic model'],daily:[{date:'2024-01-01',messages:1,user:1,assistant:0,conversations:1}],timeline,weekdays:[1,2,3,4,5,6,7],hours:Array(24).fill(1),modelCounts:{'Synthetic model':2},roles:{user:1,assistant:2},rows:[thread],rowCount:1,offset:0,limit:50};
  return {collection:args.collection,totals:{collections:1,files:3,chunks:1235437,conversations:3,turns:12},...(global.includeRoles?{roles:{user:5,thinking:1,ai:6}}:{}),activity:series().map(({date,count})=>({month:date,count})),topModels:[{model:'Synthetic model',count:1235437}],providers:[{provider:'openai',conversations:2,turns:8},{provider:'anthropic',conversations:1,turns:4}],longestThreads:[thread],firstActivity:'2024-01-01T00:00:00Z',lastActivity:'2024-06-01T00:00:00Z'};
 }
 ipcMain.handle('call',async(_event,action,args={})=>{
  global.calls.push({action,args});
  if(action==='bootstrap')return {settings:global.uiSettings,reading:{positions:{},bookmarks:[],recent:[]},dataDir:'Synthetic isolated profile',version:'1.0.0',searchStatus:{modelReady:false,indexedPassages:0}};
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
async function expectedPoints(){return chart().evaluate(node=>[...node.querySelector('.chart-line').points].map(p=>({x:p.x,y:p.y})));}
async function hoverPoint(index,{validate=true}={}){
 await chart().scrollIntoViewIfNeeded();await page.waitForTimeout(35);
 const points=await expectedPoints(),b=await chart().boundingBox(),point=points[index];
 await page.mouse.move(b.x+b.width*point.x/960,b.y+Math.min(b.height-1,Math.max(1,b.height*point.y/156)));
 await tip().waitFor({state:'visible'});
 if(validate)await checkPoint(index);
}
async function hoverPadding(){
 await chart().scrollIntoViewIfNeeded();const b=await chart().boundingBox(),count=(await expectedPoints()).length;
 for(const [x,y,index] of [[b.x-6,b.y+b.height/2,0],[b.x+b.width+6,b.y+b.height/2,count-1],[b.x+b.width/2,b.y-6,Math.round((count-1)/2)],[b.x+b.width/2,b.y+b.height+6,Math.round((count-1)/2)]]){
  await page.mouse.move(x,y);await tip().waitFor({state:'visible'});await checkPoint(index);
 }
 await page.mouse.move(b.x+b.width+10,b.y+b.height/2);await tip().waitFor({state:'hidden'});
 checks.push({label,paddedPointerTarget:true,unchangedMarkerGeometry:true});
}
async function checkPoint(index){
 const value=await chart().evaluate((node,index)=>{
  const card=node.parentElement,point=node.querySelector('.chart-line').points[index],plot=node.getBoundingClientRect(),marker=card.querySelector('.timeline-hover-dot').getBoundingClientRect(),tooltip=card.querySelector('.timeline-tooltip').getBoundingClientRect(),bounds=document.querySelector('#analyticsWorkspace').getBoundingClientRect();
  const rows=card.querySelectorAll('.chart-data tbody tr'),row=rows[index];
  const key=row.children[0].textContent,locale={en:'en-GB',hu:'hu-HU',de:'de-DE',fr:'fr-FR',ja:'ja-JP'}[document.documentElement.lang]||'en-GB',bucket=document.querySelector('[data-activity-filter="bucket"]')?.value||'monthly';
  const format=(date,month='long',day=true)=>new Intl.DateTimeFormat(locale,{year:'numeric',month,...(day?{day:'numeric'}:{}),timeZone:'UTC'}).format(date);
  const date=new Date(key+(key.length===7?'-01':'')+'T12:00:00Z');
  const expectedPeriod=key.length===7?format(date,'long',false):bucket==='weekly'?format(date,'short')+' — '+format(new Date(+date+6*86400000),'short'):format(date);
  return {expectedPeriod,expectedValue:row.children[1].textContent,unit:card.querySelector('.analytics-card-heading>.fine').textContent,period:card.querySelector('.timeline-tooltip-period').textContent,value:card.querySelector('.timeline-tooltip-value').textContent,tooltip:{x:tooltip.x,y:tooltip.y,right:tooltip.right,bottom:tooltip.bottom},bounds:{x:bounds.x,y:bounds.y,right:bounds.right,bottom:bounds.bottom},marker:{x:marker.x+marker.width/2,y:marker.y+marker.height/2},point:{x:plot.x+point.x/960*plot.width,y:plot.y+point.y/156*plot.height},viewport:{width:innerWidth,height:innerHeight},hidden:card.querySelector('.timeline-hover-dot').hidden};
 },index);
 assert.equal(value.period,value.expectedPeriod,`${label}: tooltip period differs from source period`);
 assert.equal(value.value,value.expectedValue+' '+value.unit,`${label}: tooltip count or units differ from exact source value`);
 assert.equal(value.hidden,false,`${label}: selected dot hidden`);
 assert.ok(Math.abs(value.point.x-value.marker.x)<1.5&&Math.abs(value.point.y-value.marker.y)<1.5,`${label}: dot does not match exact series point ${JSON.stringify(value)}`);
 assert.ok(value.tooltip.x>=value.bounds.x&&value.tooltip.right<=value.bounds.right+1&&value.tooltip.y>=value.bounds.y&&value.tooltip.bottom<=value.bounds.bottom+1,`${label}: tooltip escapes workspace`);
 assert.ok(value.tooltip.x>=0&&value.tooltip.right<=value.viewport.width+1&&value.tooltip.y>=0&&value.tooltip.bottom<=value.viewport.height+1,`${label}: tooltip escapes viewport`);
 checks.push({label,index,period:value.period,value:value.value,markerAligned:true,tooltipContained:true});
}
async function layout(){
 const g=await page.evaluate(()=>{
  const bounds=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
  const visible=n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden';
  const header=document.querySelector('.app-header'),controls=[...header.querySelectorAll('button')].filter(visible),overlaps=[];
  for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=bounds(controls[i]),b=bounds(controls[j]);if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1)overlaps.push([controls[i].dataset.action,controls[j].dataset.action]);}
  const source=document.querySelector('.header-source-switch'),sourceBox=source.getBoundingClientRect(),style=getComputedStyle(source,'::before'),matrix=new DOMMatrixReadOnly(style.transform==='none'?'matrix(1,0,0,1,0,0)':style.transform),selected=source.querySelector('[aria-pressed="true"]');
  const axis=[...document.querySelectorAll('.timeline-scale>span')].map(n=>{const r=document.createRange();r.selectNodeContents(n);return {text:n.textContent,textBounds:bounds(r),clip:bounds(n.parentElement)};});
  return {viewport:[innerWidth,innerHeight],document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],overlaps,header:bounds(header),controls:controls.map(bounds),overflow:[...document.querySelectorAll('.analytics-card,.analytics-grid,.analytics-inner')].filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.className),axis,source:{indicator:{x:sourceBox.left+source.clientLeft+parseFloat(style.left)+matrix.m41,width:parseFloat(style.width)},selected:bounds(selected)}};
 });
 assert.ok(g.document[0]<=g.viewport[0]+1&&g.document[1]<=g.viewport[1]+1,`${label}: document overflow`);assert.deepEqual(g.overlaps,[],`${label}: header overlaps`);assert.deepEqual(g.overflow,[],`${label}: card overflow`);
 for(const c of g.controls)assert.ok(c.x>=0&&c.right<=g.viewport[0]+1&&c.y>=g.header.y&&c.bottom<=g.header.bottom+1,`${label}: banner control clipped`);
 for(const tick of g.axis)assert.ok(tick.textBounds.x>=tick.clip.x-1&&tick.textBounds.right<=tick.clip.right+1,`${label}: clipped timeline value-axis tick ${tick.text}`);
 assert.ok(Math.abs(g.source.indicator.x-g.source.selected.x)<1.5&&Math.abs(g.source.indicator.width-g.source.selected.width)<1.5,`${label}: source indicator misaligned after resize/language/source change`);
 checks.push({label,layout:true,viewport:g.viewport,sourceIndicatorAligned:true,axisTicksUnclipped:true});
}
async function serverGrid({roles=true}={}){
 const grid=await page.locator('.insights-providers').evaluate(n=>{
  const bounds=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width};};
  const parent=n.parentElement;return {parent:bounds(parent),cards:[...parent.children].map(c=>({class:c.className,...bounds(c)}))};
 });
 assert.equal(grid.cards.length,roles?3:2,`${label}: wrong server card count`);
 assert.ok(grid.cards[0].class.includes('insights-models'),`${label}: models must be first`);
 if(roles){assert.ok(grid.cards[1].class.includes('insights-roles'),`${label}: roles must be second`);assert.ok(Math.abs(grid.cards[0].y-grid.cards[1].y)<1.1,`${label}: top models and roles must share row`);}
 const p=grid.cards.at(-1);assert.ok(p.class.includes('insights-providers'),`${label}: providers must be last`);assert.ok(Math.abs(p.width-grid.parent.width)<1.1,`${label}: providers not double width`);assert.ok(p.y>=Math.max(...grid.cards.slice(0,-1).map(c=>c.bottom))-1,`${label}: provider card overlaps prior row`);
 checks.push({label,serverGrid:true,roles,fullWidthProviders:true});
}
async function motion(animations,reducedMotion,targetMode='server'){
 label=`motion-${animations}-${reducedMotion}-${targetMode}`;await page.emulateMedia({reducedMotion});await reload({animations,mode:targetMode==='server'?'local':'server'});
 const result=await page.evaluate(async targetMode=>{
  const source=document.querySelector('.header-source-switch'),sample=()=>{const s=getComputedStyle(source,'::before');return {time:performance.now(),transform:s.transform,width:s.width,duration:s.transitionDuration,connected:source.isConnected};},samples=[sample()];
  document.querySelector(`[data-action="mode-${targetMode}"]`).click();
  const start=performance.now();while(performance.now()-start<360){await new Promise(requestAnimationFrame);samples.push(sample());}
  const target=source.querySelector('[aria-pressed="true"]').getBoundingClientRect(),r=source.getBoundingClientRect(),style=getComputedStyle(source,'::before'),matrix=new DOMMatrixReadOnly(style.transform==='none'?'matrix(1,0,0,1,0,0)':style.transform);
  return {samples,sourceIsSame:source===document.querySelector('.header-source-switch'),indicator:{left:r.left+source.clientLeft+parseFloat(style.left)+matrix.m41,width:parseFloat(style.width)},target:{left:target.left,width:target.width}};
 },targetMode);
 assert.equal(result.sourceIsSame,true,`${label}: source switch rebuilt during transition`);assert.ok(result.samples.every(x=>x.connected),`${label}: detached source switch`);
 assert.ok(Math.abs(result.indicator.left-result.target.left)<1.5&&Math.abs(result.indicator.width-result.target.width)<1.5,`${label}: indicator target mismatch ${JSON.stringify(result)}`);
 const positions=[...new Set(result.samples.map(s=>s.transform))];
 if(animations&&reducedMotion==='no-preference'){assert.ok(positions.length>=4,`${label}: no sliding intermediate frames`);assert.ok(result.samples.every(s=>s.duration.includes('0.2s')),`${label}: unexpected transition duration`);}else{assert.ok(positions.length<=2,`${label}: motion persists despite disabled motion`);assert.ok(result.samples.every(s=>s.duration.split(',').every(d=>parseFloat(d)===0)),`${label}: nonzero disabled transition`);}
 checks.push({label,frames:result.samples.length,uniqueTransforms:positions.length,connected:true,targetAligned:true});
}
try{
 await page.locator('.conversation-row').first().waitFor();
 for(const [animations,reducedMotion] of [[true,'no-preference'],[false,'no-preference'],[true,'reduce']])for(const targetMode of ['server','local'])await motion(animations,reducedMotion,targetMode);
 await page.emulateMedia({reducedMotion:'no-preference'});await reload({animations:false});await graphs();
 label='Local mixed hover';for(const i of [0,1,2,4,5])await hoverPoint(i);
 label='Local padded hover';await hoverPadding();await hoverPoint(5);
 await screenshot('local-point-tooltip-wide');
 label='Local keyboard';await chart().focus();await page.keyboard.press('Home');await checkPoint(0);await page.keyboard.press('ArrowRight');await checkPoint(1);await page.keyboard.press('ArrowUp');await checkPoint(2);await page.keyboard.press('ArrowDown');await checkPoint(1);await page.keyboard.press('End');await checkPoint(5);await page.keyboard.press('ArrowLeft');await checkPoint(4);await page.keyboard.press('Escape');await tip().waitFor({state:'hidden'});assert.equal(await page.locator('.timeline-hover-dot').evaluate(n=>n.hidden),true);checks.push({label,keyboard:true});
 // Pointer exit, pane scroll, workspace switch, and redraw must dismiss the overlay.
 label='tooltip lifecycle';await hoverPoint(2);await page.mouse.move(5,5);await tip().waitFor({state:'hidden'});await hoverPoint(2);await page.locator('#analyticsWorkspace').evaluate(n=>n.scrollTop+=15);await tip().waitFor({state:'hidden'});await hoverPoint(2);await action('workspace-reader').click();await action('workspace-analytics').click();await ready();assert.equal(await tip().isVisible(),false);await hoverPoint(2);await analyticsAction('refresh').click();await ready();assert.equal(await tip().isVisible(),false);checks.push({label,hiddenOnExitScrollSwitchRender:true});
 for(const bucket of ['daily','weekly','monthly']){label='Local '+bucket;await filter('bucket').selectOption(bucket);await ready();await hoverPoint(0);await hoverPoint(5);}
 for(const metric of ['user','assistant','conversations','messages']){label='Local '+metric;await filter('metric').selectOption(metric);await ready();await hoverPoint(2);}
 for(const shape of ['single','zeros','dense']){label='Local '+shape;await refresh(shape);const count=(await expectedPoints()).length;for(const i of [...new Set([0,Math.floor(count/2),count-1])])await hoverPoint(i);await chart().focus();await page.keyboard.press('End');await checkPoint(count-1);}
 await refresh();await action('mode-server').click();await ready();label='Server mixed hover';for(const i of [0,2,5])await hoverPoint(i);label='Server padded hover';await hoverPadding();await serverGrid();await page.locator('.insights-grid').evaluate(el=>{const host=document.querySelector('#analyticsWorkspace');host.scrollTop+=el.getBoundingClientRect().top-host.getBoundingClientRect().top-15;});await screenshot('server-card-layout-wide');
 await refresh('mixed',false);label='Server missing roles';await serverGrid({roles:false});await layout();
 for(const shape of ['single','zeros','dense']){label='Server '+shape;await refresh(shape);const count=(await expectedPoints()).length;for(const i of [...new Set([0,Math.floor(count/2),count-1])])await hoverPoint(i);}
 const scenarios=[];for(const language of ['en','hu','de','fr','ja'])for(const [width,height] of [[680,540],[1280,820]])scenarios.push({language,width,height,theme:'light'});
 for(const language of ['en','hu','de','fr','ja'])scenarios.push({language,width:680,height:540,theme:'dark',uiPalette:'oled',fontSize:'xl',highContrast:true});
 scenarios.push({language:'en',width:1280,height:820,theme:'dark',uiPalette:'oled',fontSize:'normal'});
 for(const scenario of scenarios){
  label=`${scenario.language}-${scenario.width}x${scenario.height}-${scenario.theme}-${scenario.uiPalette||'default'}-${scenario.fontSize||'normal'}`;await reload({...scenario,animations:false});await graphs();await layout();await hoverPoint(0);await hoverPoint(5);if(scenario.language==='en'||scenario.fontSize==='xl')await screenshot(label+'-Local-hover');
  await action('mode-server').click();await ready();await layout();await serverGrid();await hoverPoint(0);await hoverPoint(5);if(scenario.language==='en'||scenario.fontSize==='xl')await screenshot(label+'-Server-hover');
 }
 assert.deepEqual(errors,[],'Renderer errors');const report={version:'1.0.0',revision:2,fixture:'synthetic IPC; immutable snapshot of real bundled renderer',checks:checks.length,results:checks,pageErrors:errors};await writeFile(path.join(evidence,'activity-revision2-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({version:report.version,revision:2,checks:checks.length,pageErrors:errors,evidence},null,2));
}catch(error){await screenshot('Failure-'+label.replaceAll('/','-')).catch(()=>{});throw error;}
finally{await app.close();await rm(tmp,{recursive:true,force:true});}
