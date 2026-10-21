#!/usr/bin/env node
// Revision 5 theme regression: actual bundled renderer and production persistence.
// Original themes are compared with the released revision-4 Windows archive.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {ApplicationService} from '../src/core/service.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),require=createRequire(import.meta.url);
const {_electron}=process.env.THREADSHELF_PLAYWRIGHT_MODULE?await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE):require('playwright');
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'threadshelf-r5-')),snapshot=path.join(tmp,'app');
const evidence=path.resolve(process.env.READER_EVIDENCE||path.join(root,'docs/evidence/v3.0.0-revision-5/ui'));
await fs.mkdir(evidence,{recursive:true});await fs.mkdir(snapshot);
for(const dir of ['src','dist','vendor','build'])await fs.cp(path.join(process.env.READER_APP_ROOT||root,dir),path.join(snapshot,dir),{recursive:true});
await fs.copyFile(path.join(root,'package.json'),path.join(snapshot,'package.json'));await fs.symlink(path.join(root,'node_modules'),path.join(snapshot,'node_modules'),'dir');
const baseline=path.join(tmp,'baseline');
execFileSync('python3',['-c',`import sys,zipfile,pathlib\nwith zipfile.ZipFile(sys.argv[1]) as z:\n for name in z.namelist():\n  if name.startswith('resources/app/dist/') and not name.endswith('/'):\n   out=pathlib.Path(sys.argv[2])/name.removeprefix('resources/app/')\n   out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(z.read(name))`,process.env.READER_MODERN_BASELINE||path.join(root,'release-4/ThreadShelf-Local-Reader-3.0.0-Windows-x64-Portable-4.zip'),baseline]);
import {UI_PALETTES,CODE_THEMES} from '../src/core/themes.mjs';
import {dictionaries} from '../src/ui/i18n.js';
const source='// Exact Unicode code — Árvíztűrő 🧪 / 日本語のコメント\nconst greeting = "Bonjour, 你好";\nfunction score(value) {\n  return value === 42 ? true : false;\n}';
const thread={id:'synthetic',collection:'Modern theme fixture',provider:'openai',sourceFile:'/synthetic/modern.json',conversationKey:'modern',title:'Read, explore, and keep the details',turnCount:5,createdAt:'2024-01-01T12:00:00Z',turns:[{user:'Keep syntax colors independent of the interface.\n\nA compact, readable conversation still belongs in this workspace.',turn_index:0,createdAt:'2024-01-01T12:00:00Z'},{ai:'## A readable example\n\nThe interface can have depth while the conversation stays clear.\n\n```javascript\n'+source+'\n```\n\nInline `score(42)` remains unchanged.\n\n| Source | Messages |\n| --- | --- |\n| Local | 42 |\n| Server | 18 |',turn_index:1,createdAt:'2024-01-01T12:01:00Z'},{thinking:'A reasoning detail.',turn_index:2},{ai:'A tool result.',source_role:'tool',turn_index:3},{ai:'A system instruction.',source_role:'system',turn_index:4}]};
const defaults={sourceSwitchWidth:'equal',language:'en',mode:'local',theme:'light',uiPalette:'modern',codeTheme:'vscode',fontSize:'normal',highContrast:false,compact:true,animations:false,listMode:'pages',pageSize:50,sort:'updated',localCollection:'all',serverCollection:'all',serverUrl:'http://127.0.0.1:3000/',serverAddresses:['http://127.0.0.1:3000/'],directoryMode:'last',customDirectory:'',searchPanelExpanded:false,searchMode:'keyword'};
await fs.writeFile(path.join(tmp,'preload.cjs'),`const{contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('desktop',{invoke:(a,b)=>ipcRenderer.invoke('call',a,b),onProgress:callback=>ipcRenderer.on('progress',(_event,value)=>callback(value)),onMenu:()=>{}});`);
function mockMain(config){
 const{app,BrowserWindow,ipcMain,clipboard}=require('electron');app.setPath('userData',config.profile);global.uiSettings=config.settings;global.seriesShape='mixed';
 const thread=config.thread,collections=[{id:'fixture',name:thread.collection,count:3}];
 function series(bucket='monthly'){
  const values=global.seriesShape==='dense'?Array.from({length:366},(_,i)=>i===0||i===365?0:i%41*37):[0,13,850,7,0,1234];
  return values.map((count,i)=>({date:bucket==='monthly'?new Date(Date.UTC(2024,i,1)).toISOString().slice(0,7):new Date(Date.UTC(2024,0,1+i*(bucket==='weekly'?7:1))).toISOString().slice(0,10),count}));
 }
 function report(args,server){
  if(server)return {collection:args.collection,totals:{collections:1,files:3,chunks:2104,conversations:3,turns:12},roles:{user:5,thinking:1,ai:6},activity:series().map(({date,count})=>({month:date,count})),topModels:[{model:'GPT-4',count:1890},{model:'Claude',count:214}],providers:[{provider:'openai',conversations:2,turns:8},{provider:'anthropic',conversations:1,turns:4}],longestThreads:[thread],firstActivity:'2024-01-01T00:00:00Z',lastActivity:'2024-06-01T00:00:00Z'};
  return {summary:{conversations:3,totalConversations:3,value:2104,activeDays:48,longest:9,undated:0},coverage:{original:3,normalized:0},warnings:{},storage:{profile:'7z'},years:[2023,2024,2025],models:['GPT-4','Claude'],daily:Array.from({length:365},(_,i)=>({date:new Date(Date.UTC(2024,0,i+1)).toISOString().slice(0,10),messages:i%9===0?13:0,user:3,assistant:10,conversations:1})),timeline:series(args.bucket),weekdays:[21,48,64,54,76,27,30],hours:Array.from({length:24},(_,i)=>i%5*13),modelCounts:{'GPT-4':1890,'Claude':214},roles:{user:890,assistant:1214},rows:[thread],rowCount:1,offset:0,limit:50};
 }
 ipcMain.handle('call',async(_event,action,args={})=>{
  if(action==='bootstrap')return{settings:global.uiSettings,reading:{positions:{},bookmarks:[],recent:[]},dataDir:'Synthetic isolated profile',version:'3.0.0',searchStatus:{modelReady:false,indexedPassages:0}};
  if(action==='settings.save')return global.uiSettings={...global.uiSettings,...args.values};
  if(action==='collections'||action==='server.collections')return{collections};
  if(action==='files')return{files:[thread],total:1,page:1,pageSize:50};if(action==='thread')return thread;
  if(action==='activity.query'||action==='activity.rebuild'||action==='server.insights')return report(args,action==='server.insights');
  if(action==='clipboard.write'){clipboard.writeText(args.text);return{ok:true};}
  if(action==='manager.status')return{collections,revision:1,storage:{profile:'7z',indexBytes:4000,indexCompressedBytes:1400,conversionRequiredBytes:102400},searchStatus:{indexedPassages:0},totals:{conversations:3}};
  if(action==='manager.files')return{files:[thread],total:1,revision:1};
  if(action==='search.status')return{modelReady:false,indexedPassages:0};
  if(action==='ollama.models')return{available:false,installed:false,isLocal:true,models:[],details:[]};
  return{ok:true};
 });
 app.whenReady().then(()=>{const w=new BrowserWindow({width:1280,height:820,show:true,webPreferences:{preload:config.preload,contextIsolation:true,nodeIntegration:false,sandbox:true}});w.setMenu(null);w.loadFile(config.page);});
}
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
let app,page,label='startup';const errors=[],consoleErrors=[],checks=[],captures=[],paletteSignatures={},markerErrors=[];
const action=name=>page.locator(`[data-action="${name}"]`),activity=name=>page.locator(`[data-activity-action="${name}"]`),filter=name=>page.locator(`[data-activity-filter="${name}"]`);
const chart=()=>page.locator('.analytics-timeline-focus').first(),tip=()=>page.locator('.timeline-tooltip').first();
async function launchMock(applicationRoot,name){const harness=path.join(tmp,name+'.cjs');await fs.writeFile(harness,`(${mockMain.toString()})(${JSON.stringify({profile:path.join(tmp,name+'-profile'),settings:defaults,thread,preload:path.join(tmp,'preload.cjs'),page:path.join(applicationRoot,'dist/index.html')})});`);app=await _electron.launch({executablePath:process.env.READER_ELECTRON||path.join(root,'node_modules/electron/dist/electron'),args:['--no-sandbox','--disable-gpu',harness],env,timeout:45000});await connectPage();}
async function connectPage(){page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push({label,error:e.message}));page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push({label,error:msg.text()});});await page.locator('.conversation-row').first().waitFor();}
async function close(){await app?.close();app=null;}
async function reload(values={}){await app.evaluate(({BrowserWindow},{defaults,values})=>{global.uiSettings={...defaults,...values};global.seriesShape=values.dense?'dense':'mixed';const w=BrowserWindow.getAllWindows()[0];w.webContents.setZoomFactor(1);w.setContentSize(values.width||1280,values.height||820);},{defaults,values});await page.reload();await page.locator('.conversation-row').first().waitFor();if(values.zoom)await app.evaluate(({BrowserWindow},zoom)=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(zoom),values.zoom);await page.waitForTimeout(80);}
async function openReader(){await action('workspace-reader').click();await page.locator('.conversation-row').first().click();await page.locator('.language-javascript .hljs-keyword').first().waitFor();}
async function ready(){await page.waitForFunction(()=>{const h=document.querySelector('#analyticsWorkspace');return h&&!h.hidden&&h.getAttribute('aria-busy')==='false'&&h.querySelector('.analytics-stats');});assert.equal(await page.locator('.analytics-error').count(),0,label+' activity error');}
async function graphs(){await action('workspace-analytics').click();await ready();if(await page.locator('[data-tab="graphs"]').count())await page.locator('[data-tab="graphs"]').click();}
async function capture(name){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'));await fs.writeFile(path.join(evidence,name+'.png'),Buffer.from(png,'base64'));captures.push(name+'.png');}
async function signature(){return page.evaluate(()=>{const css=e=>getComputedStyle(e),root=document.documentElement,code=document.querySelector('pre code.language-javascript'),pre=code.closest('pre'),tokens={};for(const k of ['keyword','string','comment','number','literal','title']){const node=code.querySelector('.hljs-'+k);if(node)tokens[k]=css(node).color;}const reader={};for(const sel of ['.reader-content','.message.user','.message.assistant','.message-content','.code-header']){const node=document.querySelector(sel);if(node){const s=css(node);reader[sel]=Object.fromEntries(['fontFamily','fontSize','lineHeight','padding','margin','borderRadius','maxWidth'].map(k=>[k,s[k]]));}}return{ui:{background:css(document.body).backgroundColor,panel:css(document.querySelector('.sidebar')).backgroundColor,text:css(document.body).color,accent:css(root).getPropertyValue('--accent').trim(),header:css(document.querySelector('.app-header')).backgroundImage},code:{background:css(code).backgroundColor,preBackground:css(pre).backgroundColor,text:css(code).color,tokens,inlineBackground:css(document.querySelector('.message-content p code')).backgroundColor,inlineText:css(document.querySelector('.message-content p code')).color},html:code.innerHTML,source:code.dataset.originalCode,reader};});}
async function layout(){const g=await page.evaluate(()=>{const box=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};},visible=n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden',header=document.querySelector('.app-header'),buttons=[...header.querySelectorAll('button')].filter(visible),overlaps=[];for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++){const a=box(buttons[i]),b=box(buttons[j]);if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1)overlaps.push([buttons[i].dataset.action,buttons[j].dataset.action]);}const modal=document.querySelector('.modal'),range=document.querySelector('[data-activity-range]');const rangeOverlaps=[];if(range){const nodes=[...range.querySelectorAll('input,button')];for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=box(nodes[i]),b=box(nodes[j]);if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1)rangeOverlaps.push([i,j]);}}return{viewport:[innerWidth,innerHeight],document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],header:box(header),buttons:buttons.map(box),overlaps,rangeOverlaps,nav:[...document.querySelectorAll('.settings-nav button')].filter(visible).map(n=>({...box(n),text:n.innerText,scrollWidth:n.scrollWidth,clientWidth:n.clientWidth})),overflow:[...document.querySelectorAll('.analytics-card,.analytics-inner,.analytics-range-form,.settings-panel')].filter(visible).filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.className),modal:modal?box(modal):null,footer:modal?[...modal.querySelectorAll('.modal-footer button')].map(box):[]};});assert.ok(g.document[0]<=g.viewport[0]+1&&g.document[1]<=g.viewport[1]+1,label+' document overflow');assert.deepEqual(g.overlaps,[],label+' header controls overlap');assert.deepEqual(g.rangeOverlaps,[],label+' date inputs overlap');assert.deepEqual(g.overflow,[],label+' horizontal panel overflow');for(const b of g.buttons)assert.ok(b.x>=0&&b.right<=g.viewport[0]+1&&b.y>=g.header.y&&b.bottom<=g.header.bottom+1,label+' header clipped');for(const b of g.nav){assert.ok(b.scrollWidth<=b.clientWidth+1,label+' settings navigation label clipped '+b.text);assert.ok(b.x>=0&&b.right<=g.viewport[0]+1,label+' settings navigation outside viewport '+b.text);}if(g.modal){assert.ok(g.modal.x>=0&&g.modal.y>=0&&g.modal.right<=g.viewport[0]+1&&g.modal.bottom<=g.viewport[1]+1,label+' modal exceeds viewport');for(const b of g.footer)assert.ok(b.x>=g.modal.x&&b.right<=g.modal.right+1&&b.bottom<=g.modal.bottom+1,label+' modal footer clipped');}checks.push({label,layout:true,viewport:g.viewport,modal:!!g.modal});}
async function inspectPoint(index,keyboard=false){await chart().scrollIntoViewIfNeeded();await page.waitForTimeout(25);const p=await chart().evaluate((svg,index)=>{const p=svg.querySelector('.chart-line').points[index],v=new DOMPoint(p.x,p.y).matrixTransform(svg.getScreenCTM());return{x:v.x,y:v.y};},index);if(keyboard){await chart().focus();await page.keyboard.press('Home');for(let i=0;i<index;i++)await page.keyboard.press('ArrowRight');}else await page.mouse.move(p.x,p.y);await tip().waitFor({state:'visible'});const g=await chart().evaluate((svg,index)=>{const point=svg.querySelector('.chart-line').points[index],p=new DOMPoint(point.x,point.y).matrixTransform(svg.getScreenCTM()),card=svg.parentElement,dot=card.querySelector('.timeline-hover-dot').getBoundingClientRect(),tip=card.querySelector('.timeline-tooltip').getBoundingClientRect(),workspace=document.querySelector('#analyticsWorkspace').getBoundingClientRect();const ancestors=[];for(let n=svg.parentElement;n;n=n.parentElement){const s=getComputedStyle(n);if(s.backdropFilter!=='none'||s.filter!=='none'||s.transform!=='none'||s.contain!=='none')ancestors.push({tag:n.tagName,class:n.className,backdrop:s.backdropFilter,filter:s.filter,transform:s.transform,contain:s.contain});}return{selected:Number(svg.dataset.activePoint),dx:Math.abs(dot.x+dot.width/2-p.x),dy:Math.abs(dot.y+dot.height/2-p.y),tip:{x:tip.x,y:tip.y,right:tip.right,bottom:tip.bottom},workspace:{x:workspace.x,y:workspace.y,right:workspace.right,bottom:workspace.bottom},viewport:[innerWidth,innerHeight],ancestors,text:card.querySelector('.timeline-tooltip-value').textContent};},index);assert.equal(g.selected,index,label+' wrong bucket');assert.ok(g.dx<.1&&g.dy<.1,label+' dot off rendered SVG line '+JSON.stringify(g));assert.ok(g.tip.x>=Math.max(0,g.workspace.x)&&g.tip.y>=Math.max(0,g.workspace.y)&&g.tip.right<=Math.min(g.viewport[0],g.workspace.right)+1&&g.tip.bottom<=Math.min(g.viewport[1],g.workspace.bottom)+1,label+' tooltip escapes bounds');assert.deepEqual(g.ancestors,[],label+' new containing block above graph');markerErrors.push({label,index,keyboard,dx:g.dx,dy:g.dy});checks.push({label,point:index,keyboard,markerAligned:true,tooltipContained:true});}
function rgb(value){const m=value.match(/rgba?\(([^)]+)\)/);return m?m[1].split(/[, /]+/).slice(0,3).map(Number):null;}
async function closeModal(){await page.locator('.modal-header [data-action="modal-close"]').click();await page.locator('.modal').waitFor({state:'detached'});assert.equal(await page.locator('.modal-overlay').count(),0);}
async function noEffects(){const values=await page.evaluate(()=>{const selectors=['.app-header','.sidebar','.statusbar','.analytics-card','.analytics-stat','.modal'];return selectors.flatMap(selector=>[...document.querySelectorAll(selector)].slice(0,2).flatMap(node=>[null,'::before','::after'].map(pseudo=>{const s=getComputedStyle(node,pseudo);return{selector,pseudo,content:s.content,display:s.display,background:s.backgroundColor,image:s.backgroundImage,blur:s.backdropFilter,filter:s.filter,shadow:s.boxShadow};})));});for(const v of values){if(v.display==='none'||v.pseudo&&['none','normal'].includes(v.content))continue;assert.equal(v.blur,'none',label+' contrast blur');assert.equal(v.filter,'none',label+' contrast filter');assert.equal(v.image,'none',label+' contrast gradient');assert.equal(v.shadow,'none',label+' contrast shadow');}checks.push({label,solidContrastFallback:true});}
const baseTokens=['bg','surface','sidebar','hover','border','text','muted','faint','accent','accent-hover','accent-soft','accent-text','danger','warning','focus','primary-ink','role-assistant','role-user','role-thinking','role-tool'];
async function themeSignature(){return page.evaluate(names=>{const root=getComputedStyle(document.documentElement),tokens=Object.fromEntries(names.map(n=>[n,root.getPropertyValue('--'+n).trim()])),roles={};for(const name of ['user','assistant','thinking','tool','system']){const node=document.querySelector('.message.'+name),s=getComputedStyle(node),r=getComputedStyle(node.querySelector('.message-role'));roles[name]={bg:s.backgroundColor,border:s.borderLeftColor,label:r.color};}return{tokens,roles};},baseTokens);}
async function switchGeometry(){return page.locator('.header-source-switch').evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el),buttons=[...el.querySelectorAll('button')].map(b=>{const v=b.getBoundingClientRect();return{x:v.x,width:v.width,right:v.right,scrollWidth:b.scrollWidth,clientWidth:b.clientWidth,text:b.innerText};});const ind=getComputedStyle(el,'::before');return{width:r.width,x:r.x,right:r.right,buttons,columns:s.gridTemplateColumns,selected:document.documentElement.dataset.sourceSwitchWidth,indicator:{x:r.x+parseFloat(s.borderLeftWidth)+new DOMMatrixReadOnly(ind.transform).m41,width:parseFloat(ind.width)},viewport:[innerWidth,innerHeight]};});}
function assertWidth(g,choice){const ratio=g.buttons[0].width/g.buttons[1].width,expected=choice==='server-wider'?.8/1.5:choice==='local-wider'?1.5/.8:1;assert.ok(Math.abs(ratio-expected)<.001,label+' incorrect width ratio '+ratio+' expected '+expected);}
async function animateSource(destination,{motion=true}={}){
 const target='mode-'+destination;await action(target).focus();
 await page.waitForFunction(()=>document.querySelector('.header-source-switch')?.dataset.indicatorReady==='true');
 const transition=await page.evaluate(async({target,motion})=>{
  const source=document.querySelector('.header-source-switch'),button=source.querySelector('[data-action="'+target+'"]');
  const initial=getComputedStyle(source,'::before'),first=initial.transform,durationCSS=initial.transitionDuration,reduced=matchMedia('(prefers-reduced-motion:reduce)').matches,enabled=document.documentElement.dataset.animations;
  let observer,timeout,done=false;
  const result=await new Promise(resolve=>{
   function finish(value){if(done)return;done=true;observer.disconnect();source.removeEventListener('transitionrun',sample);clearTimeout(timeout);resolve(value);}
   async function sample(){
    if(done)return;
    // Force style resolution immediately after the real source-switch variables
    // change. Pause the actual Chromium CSSTransition before frame scheduling
    // can skip its short 200ms visual interval under parallel packaging load.
    const current=getComputedStyle(source,'::before').transform;
    if(!motion&&current!==first){finish({samples:[],activeTransitions:source.getAnimations({subtree:true}).filter(a=>a.transitionProperty==='transform').length});return;}
    const animation=source.getAnimations({subtree:true}).find(a=>a.transitionProperty==='transform');
    if(!animation)return;
    done=true;observer.disconnect();source.removeEventListener('transitionrun',sample);clearTimeout(timeout);
    animation.pause();await animation.ready;
    const timing=animation.effect.getTiming(),samples=[];
    for(const fraction of [0,.25,.5,.75,1]){animation.currentTime=Number(timing.duration)*fraction;const css=getComputedStyle(source,'::before');samples.push({fraction,transform:css.transform,x:new DOMMatrixReadOnly(css.transform).m41});}
    animation.finish();resolve({duration:timing.duration,easing:timing.easing,property:animation.transitionProperty,samples,activeTransitions:1});
   }
   observer=new MutationObserver(sample);observer.observe(source,{attributes:true,attributeFilter:['style']});
   source.addEventListener('transitionrun',sample);
   timeout=setTimeout(()=>finish({timeout:true,transform:getComputedStyle(source,'::before').transform,animations:source.getAnimations({subtree:true}).map(a=>({type:a.constructor.name,property:a.transitionProperty,state:a.playState}))}),1800);
   button.click();sample();
  });
  return{...result,first,durationCSS,reduced,enabled,same:document.querySelector('.header-source-switch')===source,focus:document.activeElement?.dataset.action,final:getComputedStyle(source,'::before').transform};
 },{target,motion});
 assert.equal(transition.same,true,label+' source switch remounted');assert.equal(transition.focus,target,label+' source focus lost');assert.notEqual(transition.first,transition.final,label+' source highlight did not move');
 assert.ok(!transition.timeout,label+' transition not observed '+JSON.stringify(transition));
 if(motion){assert.equal(transition.enabled,'true');assert.equal(transition.reduced,false);assert.equal(transition.property,'transform');assert.equal(transition.duration,200);const values=transition.samples.map(s=>s.x),lo=Math.min(values[0],values.at(-1)),hi=Math.max(values[0],values.at(-1));assert.ok(hi-lo>1);for(const x of values.slice(1,-1))assert.ok(x>lo+.01&&x<hi-.01,label+' real CSS transition did not interpolate '+JSON.stringify(transition));}
 else{assert.equal(transition.activeTransitions,0,label+' disabled source motion created a transition');assert.ok(transition.durationCSS.split(',').every(s=>parseFloat(s)===0),label+' disabled duration is nonzero');}
 const language=await page.evaluate(()=>document.documentElement.lang);await page.waitForFunction(expected=>document.querySelector('.analytics-heading h1')?.textContent===expected,dictionaries[language][destination==='server'?'serverInsights':'activityTitle']);await ready();const g=await switchGeometry();assertWidth(g,g.selected);const chosen=g.buttons[destination==='local'?0:1];assert.ok(Math.abs(g.indicator.x-chosen.x)<.1&&Math.abs(g.indicator.width-chosen.width)<.1,label+' highlight misaligned '+JSON.stringify({indicator:g.indicator,chosen}));await layout();checks.push({label,destination,sourceNodeRetained:true,focusRetained:true,actualCSSTransition:transition,buttonWidths:g.buttons.map(b=>b.width),widthChoice:g.selected});
}

function contrast(a,b){const luminance=rgb=>rgb.map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4}).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0),x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
async function composedContrast(selector){
 const node=page.locator(selector).first();await node.scrollIntoViewIfNeeded();
 const data=await node.evaluate(el=>{const r=el.getBoundingClientRect(),foreground=getComputedStyle(el).color;el.dataset.modernContrastStyle=el.getAttribute('style')||'';el.style.setProperty('color','transparent','important');return{foreground,rect:{x:r.x,y:r.y,width:r.width,height:r.height},width:innerWidth,height:innerHeight,palette:document.documentElement.dataset.uiPalette,contrast:document.documentElement.dataset.contrast};});
 async function sample(){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const png=Buffer.from(await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64')),'base64');return app.evaluate(({nativeImage},{base64,data})=>{const im=nativeImage.createFromBuffer(Buffer.from(base64,'base64')),size=im.getSize(),b=im.toBitmap(),sx=size.width/data.width,sy=size.height/data.height,colors=[];for(const x of [.1,.5,.9])for(const y of [.2,.5,.8]){const px=Math.min(size.width-1,Math.max(0,Math.floor((data.rect.x+data.rect.width*x)*sx))),py=Math.min(size.height-1,Math.max(0,Math.floor((data.rect.y+data.rect.height*y)*sy))),o=(py*size.width+px)*4;colors.push([b[o+2],b[o+1],b[o]]);}return colors;},{base64:png.toString('base64'),data});}
 const samples=await sample(),minimum=Math.min(...samples.map(c=>contrast(rgb(data.foreground),c)));
 await node.evaluate(el=>{const value=el.dataset.modernContrastStyle;delete el.dataset.modernContrastStyle;if(value)el.setAttribute('style',value);else el.removeAttribute('style');});
 assert.ok(minimum>=4.5,label+' composed contrast below 4.5:1 '+JSON.stringify({selector,minimum,foreground:data.foreground,samples}));
 checks.push({label,compositedContrast:{selector,foreground:data.foreground,backgroundSamples:samples,minimum,criterion:'4.5:1 sampled text/background contrast including rendered effects'}});
}

const newPalettes=['platinum','vellum','prism','nocturne','garnet'];
const newCodes=['xcode','ayu'];
const oldPalettes=UI_PALETTES.map(t=>t.id).filter(id=>!newPalettes.includes(id));
const oldCodes=CODE_THEMES.filter(t=>!newCodes.includes(t.id));
const baselineThemes={},baselineCode={},baselineEffects={},baselineMono={};
async function effectsSignature(){return page.evaluate(()=>Object.fromEntries(['.app-header','.sidebar','.statusbar','.message.assistant','.message.user'].map(selector=>{const node=document.querySelector(selector);return [selector,[null,'::before','::after'].map(pseudo=>{const css=getComputedStyle(node,pseudo);return Object.fromEntries(['content','backgroundColor','backgroundImage','borderColor','boxShadow','backdropFilter','opacity','filter','transform'].map(k=>[k,css[k]]));})];})));}
const hexRgb=hex=>{const n=parseInt(hex.slice(1),16);return `rgb(${n>>16}, ${(n>>8)&255}, ${n&255})`;};
async function appearanceModal(){
 await action('settings').click();
 await page.locator('[data-action="settings-tab"][data-tab="appearance"]').click();
 assert.equal(await page.locator('#prefUiPalette option').count(),UI_PALETTES.length);
 assert.equal(await page.locator('#prefCodeTheme option').count(),CODE_THEMES.length);
 const language=await page.evaluate(()=>document.documentElement.lang),selected=await page.locator('#prefUiPalette').inputValue();
 for(const id of newPalettes){
  await page.selectOption('#prefUiPalette',id);
  assert.equal(await page.locator('#prefUiPalette option:checked').textContent(),dictionaries[language]['palette_'+id]);
  assert.equal(await page.locator('#prefUiPaletteDescription').textContent(),dictionaries[language]['paletteDescription_'+id]);
  assert.ok((await page.locator('#prefUiPaletteDescription').textContent()).trim());
 }
 for(const id of newCodes){assert.equal(await page.locator('#prefCodeTheme option[value="'+id+'"]').textContent(),dictionaries[language]['code_'+id]||CODE_THEMES.find(t=>t.id===id).name);}
 await page.selectOption('#prefUiPalette',selected);await layout();
}
async function newCode(scheme,palette,id){
 await page.evaluate(({palette,id})=>Object.assign(document.documentElement.dataset,{uiPalette:palette,codeTheme:id}),{palette,id});
 const current=await signature(),expected=CODE_THEMES.find(t=>t.id===id).tokens[scheme];
 assert.equal(current.source,source,label+' code source changed');
 assert.equal(current.code.preBackground,hexRgb(expected.background));
 assert.equal(current.code.text,hexRgb(expected.foreground));
 for(const role of ['keyword','string','comment','number','title'])assert.equal(current.code.tokens[role],hexRgb(expected[role]),label+' code color '+role);
 const variables=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement);return Object.fromEntries([...s].filter(k=>k.startsWith('--syntax-')).map(k=>[k.slice(9),s.getPropertyValue(k).trim()]));});
 for(const [name,color]of Object.entries(expected))assert.equal(variables[name],color,label+' syntax variable '+name);
 const key=scheme+'/'+id;
 if(!baselineCode[key])baselineCode[key]=current.code;else assert.deepEqual(current.code,baselineCode[key],label+' new code colors depend on UI palette');
 checks.push({label,codeScheme:id,exactRenderedTokenColors:true,codeIndependent:true,originalCodePreserved:true});
}
async function japaneseFont(){
 await page.evaluate(()=>document.fonts.ready);const mono=await page.evaluate(()=>({theme:document.documentElement.dataset.theme,fonts:['.language-javascript','.code-block-titlebar'].map(selector=>getComputedStyle(document.querySelector(selector)).fontFamily.replace(/"ThreadShelf Noto Sans JP", /g,''))}));assert.deepEqual(mono.fonts,baselineMono[mono.theme],label+' Latin monospace stack changed');
 const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
 try{
  const {root:doc}=await cdp.send('DOM.getDocument');
  for(const selector of ['[data-action="import-dialog"]','.message-copy-button','.code-copy-button','.language-javascript .hljs-comment']){
   const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:doc.nodeId,selector});const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
   assert.ok(fonts.some(f=>f.isCustomFont&&f.glyphCount>0&&/Noto Sans JP/.test(f.familyName)),label+' Japanese glyphs must render with bundled font '+JSON.stringify({selector,fonts}));if(selector.includes('hljs-comment'))assert.ok(fonts.some(f=>!f.isCustomFont&&f.glyphCount>0&&/mono|code|courier|consolas/i.test(f.familyName)),label+' Latin code must retain native monospace glyphs '+JSON.stringify(fonts));
   checks.push({label,selector,japaneseActualRenderedFonts:fonts,bundledJapaneseGlyphsVerified:true});
  }
 }finally{await cdp.detach();}
}
async function realCopy(){
 await app.evaluate(({clipboard})=>clipboard.writeText('revision5 clipboard sentinel'));
 await page.locator('pre:has(code.language-javascript) .code-copy-button').click();
 for(let i=0;i<60;i++){if(await app.evaluate(({clipboard})=>clipboard.readText())===source){checks.push({label,actualClipboardExact:true});return;}await page.waitForTimeout(25);}
 assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()),source,label+' real code copy');
}

// Small, independently runnable native capture for the Japanese minimum-window
// evidence; it also keeps the actual SVG marker geometry assertion in the shot.
if(process.env.READER_R5_MOTION_ONLY==='1'){
 try{await launchMock(snapshot,'motion-only');for(const palette of newPalettes){label=palette+' real source transition';await reload({uiPalette:palette,theme:'dark',animations:true});await graphs();await animateSource('server');for(const disabled of ['setting','media']){label=palette+' no source motion '+disabled;await reload({uiPalette:palette,theme:'dark',animations:disabled==='media'});await graphs();if(disabled==='media')await page.emulateMedia({reducedMotion:'reduce'});await animateSource('server',{motion:false});await page.emulateMedia({reducedMotion:'no-preference'});}console.log('PASS motion '+palette);}console.log(JSON.stringify({checks},null,2));}finally{await close().catch(()=>{});await fs.rm(tmp,{recursive:true,force:true});}process.exit(0);
}
if(process.env.READER_R5_JAPANESE_CAPTURE==='1'){
 try{
  label='Japanese minimum XL';await launchMock(snapshot,'japanese-capture');await reload({theme:'dark',uiPalette:'garnet',codeTheme:'xcode',language:'ja',fontSize:'xl',width:680,height:540});
  await openReader();await page.evaluate(()=>document.fonts.ready);await layout();await capture('Japanese-Reader-680x540-xl');
  await graphs();await layout();await inspectPoint(2,true);await capture('Japanese-Activity-680x540-xl');
  await action('mode-server').click();await page.locator('.insights-grid').waitFor();await ready();await layout();await inspectPoint(2,true);await capture('Japanese-Server-680x540-xl');
  assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
  await fs.writeFile(path.join(evidence,'japanese-minimum-results.json'),JSON.stringify({result:'PASS',version:'3.0.0',revision:5,checks,markerErrors,captures,pageErrors:errors,consoleErrors},null,2));console.log('PASS Japanese minimum native captures');
 }finally{await close().catch(()=>{});await fs.rm(tmp,{recursive:true,force:true});}
 process.exit(0);
}
try{
 assert.equal(newPalettes.filter(id=>UI_PALETTES.some(t=>t.id===id)).length,5);
 assert.equal(newCodes.filter(id=>CODE_THEMES.some(t=>t.id===id)).length,2);
 await launchMock(baseline,'revision4-baseline');
 for(const scheme of ['light','dark'])for(const palette of oldPalettes){
  label='Revision4 baseline '+scheme+'/'+palette;await reload({theme:scheme,uiPalette:palette});await openReader();
  paletteSignatures[scheme+'/'+palette]=await signature();baselineThemes[scheme+'/'+palette]=await themeSignature();baselineEffects[scheme+'/'+palette]=await effectsSignature();
 }
 for(const scheme of ['light','dark']){await reload({theme:scheme,uiPalette:'default'});await openReader();baselineMono[scheme]=await page.evaluate(()=>['.language-javascript','.code-block-titlebar'].map(selector=>getComputedStyle(document.querySelector(selector)).fontFamily));for(const code of oldCodes){await page.evaluate(id=>document.documentElement.dataset.codeTheme=id,code.id);baselineCode[scheme+'/'+code.id]=(await signature()).code;}}
 await close();await launchMock(snapshot,'revision5');
 for(const scheme of ['light','dark'])for(const palette of oldPalettes){
  label='Preserved '+scheme+'/'+palette;await reload({theme:scheme,uiPalette:palette});await openReader();
  assert.deepEqual(await signature(),paletteSignatures[scheme+'/'+palette],label+' differs from revision4');
  assert.deepEqual(await themeSignature(),baselineThemes[scheme+'/'+palette]);assert.deepEqual(await effectsSignature(),baselineEffects[scheme+'/'+palette],label+' decorative layers differ');
  checks.push({label,exactRevision4AppearanceMatch:true});
 }
 for(const [i,palette]of newPalettes.entries())for(const scheme of ['light','dark']){
  label=palette+' '+scheme+' Reader';await reload({theme:scheme,uiPalette:palette,codeTheme:'xcode',language:['en','hu','de','fr','ja'][i]});await openReader();await layout();if(palette==='garnet')await japaneseFont();
  const theme=UI_PALETTES.find(t=>t.id===palette).tokens[scheme],computed=await themeSignature();
  for(const [name,color]of Object.entries(theme))assert.equal(computed.tokens[name],color,label+' palette token '+name);
  const readerStyles=(await signature()).reader;if(palette==='garnet')for(const style of Object.values(readerStyles)){assert.ok(style.fontFamily.includes('ThreadShelf Noto Sans JP'));style.fontFamily=style.fontFamily.replace(/"ThreadShelf Noto Sans JP", /g,'');}assert.deepEqual(readerStyles,paletteSignatures[scheme+'/default'].reader,label+' Reader layout changed');
  for(const code of oldCodes){await page.evaluate(id=>document.documentElement.dataset.codeTheme=id,code.id);assert.deepEqual((await signature()).code,baselineCode[scheme+'/'+code.id],label+' old code theme changed '+code.id);}
  for(const code of newCodes)await newCode(scheme,palette,code);
  await page.evaluate(()=>document.documentElement.dataset.codeTheme='xcode');await composedContrast('.brand-subtitle');await composedContrast('[data-action="import-dialog"]');await capture(palette+'-Reader-'+scheme);
  for(const size of [{width:1280,height:820,name:'normal'},{width:680,height:540,name:'minimum'}]){
   label=palette+' '+scheme+' '+size.name;await reload({theme:scheme,uiPalette:palette,codeTheme:scheme==='light'?'xcode':'ayu',language:['en','hu','de','fr','ja'][i],fontSize:size.name==='minimum'?'xl':'normal',...size});
   await openReader();await layout();
   if(palette==='garnet'&&size.name==='minimum'){
    await action('search-toggle').click();await layout();await action('search-options').click();await layout();
    assert.equal(await page.locator('#modalTitle').textContent(),dictionaries.ja.searchOptions);
    if(scheme==='dark')await capture('Japanese-Search-Options-680x540-xl');await closeModal();await action('search-toggle').click();
    checks.push({label,japaneseSearchDrawerAndOptions:true});
   }
   await graphs();await layout();
   for(const n of [0,2,5])await inspectPoint(n);await inspectPoint(2,true);
   if(size.name==='normal')await capture(palette+'-Activity-'+scheme);
   await appearanceModal();
   if(palette==='garnet'){
    assert.equal(await page.locator('#prefLanguage option[value="ja"]').textContent(),'日本語');
    for(const tab of ['appearance','reading','sources','searchSettings','databaseManager','data']){
     await page.locator('[data-action="settings-tab"][data-tab="'+tab+'"]').click();await layout();
     assert.equal(await page.locator('[data-settings-panel="'+tab+'"]').getAttribute('hidden'),null);
     assert.equal(await page.locator('[data-action="settings-tab"][data-tab="'+tab+'"]').textContent(),dictionaries.ja[tab]);
     if(size.name==='minimum'&&scheme==='dark')await capture('Japanese-Settings-'+tab+'-680x540-xl');
    }
    await page.locator('[data-action="settings-tab"][data-tab="appearance"]').click();
    checks.push({label,japaneseSettingsTabs:6,japaneseLanguageOption:true});
   }
   const behind=await page.locator('#analyticsWorkspace').evaluate(n=>n.scrollTop),box=await page.locator('.settings-panel').boundingBox();
   await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,180);await page.waitForTimeout(60);
   assert.equal(await page.locator('#analyticsWorkspace').evaluate(n=>n.scrollTop),behind,label+' settings scroll leaks to workspace');
   if(size.name==='minimum'&&scheme==='dark')await capture(palette+'-Settings-minimum');await closeModal();
   await action('mode-server').click();await page.locator('.insights-grid').waitFor();await ready();await layout();
   for(const n of [0,2,5])await inspectPoint(n);
   if(size.name==='normal'&&scheme==='dark')await capture(palette+'-Server-dark');
   checks.push({label,allThemeOptionsLocalized:true,internalScrollContained:true});console.log('PASS '+label);
  }
 }
 for(const palette of newPalettes){
  for(const scheme of ['light','dark']){
   label=palette+' high contrast '+scheme;await reload({theme:scheme,uiPalette:palette,highContrast:true,width:680,height:540});await openReader();
   const themed=await themeSignature();await page.evaluate(()=>document.documentElement.dataset.uiPalette='ocean');const fallback=await themeSignature();assert.deepEqual(themed.roles,fallback.roles,label+' role high-contrast fallback changed');for(const name of ['text','muted','faint','border','danger','warning'])assert.equal(themed.tokens[name],fallback.tokens[name],label+' high-contrast '+name);await page.evaluate(id=>document.documentElement.dataset.uiPalette=id,palette);
   await graphs();await noEffects();await layout();await inspectPoint(0,true);
  }
  label=palette+' forced colors';await reload({theme:'dark',uiPalette:palette});await graphs();await page.emulateMedia({forcedColors:'active'});await noEffects();await inspectPoint(0,true);await page.emulateMedia({forcedColors:'none'});
  label=palette+' reduced transparency';const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-transparency:reduce)').matches),true);await noEffects();await inspectPoint(0,true);await cdp.send('Emulation.setEmulatedMedia',{features:[]});await cdp.detach();
  label=palette+' source animation';await reload({theme:'dark',uiPalette:palette,animations:true});await graphs();await animateSource('server');
  for(const disabled of ['setting','media']){label=palette+' reduced motion '+disabled;await reload({theme:'dark',uiPalette:palette,animations:disabled==='media'});await graphs();if(disabled==='media')await page.emulateMedia({reducedMotion:'reduce'});await animateSource('server',{motion:false});await page.emulateMedia({reducedMotion:'no-preference'});}
 }
 await close();
 // Save every new UI palette through the actual Settings form; reopen using real
 // production main, preload and storage worker; exact code-copy uses OS clipboard.
 const dataDir=path.join(tmp,'persistent-profile');const service=await new ApplicationService({dataDir}).init();await service.handle('settings.save',{values:{...defaults,uiPalette:'default'}});const seeded=await service.store.upsert(thread);await service.shutdown();await fs.writeFile(path.join(dataDir,'window.json'),JSON.stringify({width:1280,height:820}));
 const harness=path.join(tmp,'real-desktop');await fs.mkdir(harness);await fs.writeFile(path.join(harness,'package.json'),JSON.stringify({name:'revision5-persistence-test',version:'3.0.0',main:'main.cjs'}));await fs.writeFile(path.join(harness,'main.cjs'),`const{app}=require('electron');app.requestSingleInstanceLock=()=>true;require(${JSON.stringify(path.join(snapshot,'src/desktop/main.cjs'))});`);
 async function launchReal(){app=await _electron.launch({executablePath:process.env.READER_ELECTRON||path.join(root,'node_modules/electron/dist/electron'),args:['--no-sandbox','--disable-gpu',harness],env:{...env,THREADSHELF_READER_TEST_DATA:dataDir},timeout:45000});await connectPage();await openReader();}
 await launchReal();
 for(const [i,palette]of newPalettes.entries()){
  label=palette+' real preference persistence';const code=newCodes[i%2];await action('settings').click();await page.locator('[data-action="settings-tab"][data-tab="appearance"]').click();
  await page.selectOption('#prefLanguage',i===4?'ja':'en');await page.selectOption('#prefUiPalette',palette);await page.selectOption('#prefCodeTheme',code);await page.selectOption('#prefTheme','system');await page.selectOption('#prefSourceSwitchWidth','local-wider');await page.locator('#settingsForm button[type="submit"]').click();await page.locator('.modal').waitFor({state:'detached'});
  await page.waitForFunction(p=>document.documentElement.dataset.uiPalette===p,palette);
  for(const scheme of ['dark','light']){await page.emulateMedia({colorScheme:scheme});await page.waitForFunction(s=>document.documentElement.dataset.theme===s,scheme);await newCode(scheme,palette,code);}
  await realCopy();await page.emulateMedia({colorScheme:null});await close();await launchReal();const boot=await page.evaluate(()=>window.desktop.invoke('bootstrap'));
  assert.equal(boot.version,'3.0.0');assert.equal(boot.settings.language,i===4?'ja':'en');assert.equal(await page.evaluate(()=>document.documentElement.lang),i===4?'ja':'en');assert.equal(boot.settings.uiPalette,palette);assert.equal(boot.settings.codeTheme,code);assert.equal(boot.settings.theme,'system');assert.equal(boot.settings.sourceSwitchWidth,'local-wider');assertWidth(await switchGeometry(),'local-wider');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dataDir,'appearance.json'),'utf8')).data,{uiPalette:palette,codeTheme:code});assert.equal(await page.locator('pre code.language-javascript').getAttribute('data-original-code'),source);
  assert.equal((await page.evaluate(()=>window.desktop.invoke('files',{mode:'local',pageSize:50}))).files[0].id,seeded.summary.id);
  checks.push({label,realService:true,restart:true,systemLightAndDark:true,originalArchivePreserved:true,independentCodeChoicePersisted:true});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
 const report={version:'3.0.0',revision:5,result:'PASS',checks:checks.length,unchangedPaletteAppearances:oldPalettes.length*2,newPaletteAppearances:newPalettes.length*2,newCodePalettes:2,markerPositions:markerErrors.length,maxMarkerErrorX:Math.max(...markerErrors.map(x=>x.dx)),maxMarkerErrorY:Math.max(...markerErrors.map(x=>x.dy)),markerOracle:'Actual SVG polyline getScreenCTM versus visible dot bounding-box center; threshold 0.1 CSS pixel per axis',results:checks,markerErrors,captures,pageErrors:errors,consoleErrors};
 await fs.writeFile(path.join(evidence,'revision5-ui-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,results:undefined,markerErrors:undefined,captures:captures.length},null,2));
}catch(error){await page?.screenshot({path:path.join(evidence,'Failure-'+label.replaceAll(/[^a-zA-Z0-9-]/g,'-')+'.png')}).catch(()=>{});throw error;}finally{await close().catch(()=>{});await fs.rm(tmp,{recursive:true,force:true});}
