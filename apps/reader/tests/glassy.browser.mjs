#!/usr/bin/env node
// Paint and interaction regression for the four 3.1.0 glass palettes. Uses the
// production renderer, isolated synthetic IPC, and the exact Revision 6 bundle.
// Set THREADSHELF_PLAYWRIGHT_MODULE if Playwright is installed outside this repo.
// Set READER_GLASS_BASELINE to the released Revision 6 Windows portable archive.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {UI_PALETTES,CODE_THEMES} from '../src/core/themes.mjs';
import {dictionaries} from '../src/ui/i18n.js';

const root=fileURLToPath(new URL('..',import.meta.url));
const playwright=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'threadshelf-glass-ui-'));
const evidence=path.resolve(process.env.READER_EVIDENCE||path.join(root,'docs/evidence/v3.1.0/ui'));
await fs.mkdir(evidence,{recursive:true});
const baselineArchive=process.env.READER_GLASS_BASELINE||path.join(root,'../baseline/ThreadShelf-Local-Reader-3.0.0-Windows-x64-Portable-6.zip');
const baseline=path.join(tmp,'baseline');
execFileSync('python3',['-c',`import sys,zipfile,pathlib\nwith zipfile.ZipFile(sys.argv[1]) as z:\n for name in z.namelist():\n  if name.startswith('resources/app/dist/') and not name.endswith('/'):\n   out=pathlib.Path(sys.argv[2])/name.removeprefix('resources/app/')\n   out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(z.read(name))`,baselineArchive,baseline]);
const baselineSha256=createHash('sha256').update(await fs.readFile(baselineArchive)).digest('hex');
const signatureCache=path.join(os.tmpdir(),'threadshelf-glassy-baseline-v2-'+baselineSha256+'.json');
const {version}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const newIds=['smoked-glass','harbor-haze','amber-room','opal-daylight'];
const names=['Smoked Glass','Harbor Haze','Amber Room','Opal Daylight'];
const testedIds=process.env.READER_GLASS_PALETTES?process.env.READER_GLASS_PALETTES.split(','):newIds;
const testedSchemes=process.env.READER_GLASS_SCHEMES?process.env.READER_GLASS_SCHEMES.split(','):['light','dark'];
assert.ok(testedIds.every(id=>newIds.includes(id)));assert.ok(testedSchemes.every(id=>['light','dark'].includes(id)));
const focused=testedIds.length!==4||testedSchemes.length!==2;
const oldIds=UI_PALETTES.map(item=>item.id).filter(id=>!newIds.includes(id));
assert.equal(oldIds.length,13);assert.equal(CODE_THEMES.length,10);
const source='// Exact Unicode — Árvíztűrő 🧪 / 日本語\nconst greeting = "Bonjour, 你好";\nfunction score(value) {\n  return value === 42 ? true : false;\n}';
const thread={id:'synthetic-glassy',collection:'Glassy fixture',provider:'openai',sourceFile:'/synthetic/glassy.json',conversationKey:'glassy',title:'A clear view of your conversations',turnCount:5,createdAt:'2024-01-01T12:00:00Z',turns:[{user:'Keep the reader clear while the surrounding interface becomes glass.\n\nThis is synthetic test data.',turn_index:0,createdAt:'2024-01-01T12:00:00Z'},{ai:'## A readable example\n\nDepth and transparency should keep text legible.\n\n```javascript\n'+source+'\n```\n\nInline `score(42)` remains unchanged.\n\n| Source | Messages |\n| --- | --- |\n| Local | 42 |\n| Server | 18 |',turn_index:1,createdAt:'2024-01-01T12:01:00Z'},{thinking:'A reasoning detail.',turn_index:2},{ai:'A tool result.',source_role:'tool',turn_index:3},{ai:'A system instruction.',source_role:'system',turn_index:4}]};
const defaults={sourceSwitchWidth:'equal',language:'en',mode:'local',theme:'light',uiPalette:'default',codeTheme:'vscode',fontSize:'normal',highContrast:false,compact:true,animations:false,listMode:'pages',pageSize:50,sort:'updated',localCollection:'all',serverCollection:'all',serverUrl:'http://127.0.0.1:3000/',serverAddresses:['http://127.0.0.1:3000/'],directoryMode:'last',customDirectory:'',searchPanelExpanded:false,searchMode:'keyword'};
function installFixture({defaults,thread,version}) {
 const key='glassy-test-settings';
 window.__glassSettings=JSON.parse(sessionStorage.getItem(key)||'null')||defaults;
 const collections=[{id:'fixture',name:thread.collection,count:1}];
 const series=bucket=>[0,13,850,7,0,1234].map((count,i)=>({date:bucket==='monthly'?new Date(Date.UTC(2024,i,1)).toISOString().slice(0,7):new Date(Date.UTC(2024,0,1+i*(bucket==='weekly'?7:1))).toISOString().slice(0,10),count}));
 window.desktop={onProgress:()=>()=>{},onMenu:()=>()=>{},invoke:async(action,args={})=>{
  if(action==='bootstrap')return {settings:window.__glassSettings,reading:{positions:{},bookmarks:[],recent:[]},dataDir:'Synthetic isolated browser fixture',version,searchStatus:{modelReady:false,indexedPassages:0}};
  if(action==='settings.save'){window.__glassSettings={...window.__glassSettings,...args.values};sessionStorage.setItem(key,JSON.stringify(window.__glassSettings));return window.__glassSettings;}
  if(action==='collections'||action==='server.collections')return {collections};
  if(action==='files')return {files:[thread],total:1,page:1,pageSize:50};
  if(action==='thread')return thread;
  if(action==='activity.query'||action==='activity.rebuild')return {summary:{conversations:1,totalConversations:1,value:2104,activeDays:48,longest:9,undated:0},coverage:{original:1,normalized:0},warnings:{},storage:{profile:'7z'},years:[2023,2024,2025],models:['GPT-4','Claude'],daily:Array.from({length:365},(_,i)=>({date:new Date(Date.UTC(2024,0,i+1)).toISOString().slice(0,10),messages:i%9===0?13:0,user:3,assistant:10,conversations:1})),timeline:series(args.bucket),weekdays:[21,48,64,54,76,27,30],hours:Array.from({length:24},(_,i)=>i%5*13),modelCounts:{'GPT-4':1890,'Claude':214},roles:{user:890,assistant:1214},rows:[thread],rowCount:1,offset:0,limit:50};
  if(action==='server.insights')return {collection:args.collection,totals:{collections:1,files:1,chunks:2104,conversations:1,turns:5},roles:{user:1,thinking:1,ai:3},activity:series('monthly').map(({date,count})=>({month:date,count})),topModels:[{model:'GPT-4',count:1890},{model:'Claude',count:214}],providers:[{provider:'openai',conversations:1,turns:5}],longestThreads:[thread],firstActivity:'2024-01-01T00:00:00Z',lastActivity:'2024-06-01T00:00:00Z'};
  if(action==='search.status')return {modelReady:false,indexedPassages:0};
  if(action==='ollama.models')return {available:false,installed:false,isLocal:true,models:[],details:[]};
  if(action==='clipboard.write'){window.__glassCopied=args.text;return {ok:true};}
  return {ok:true};
 }};
}
let electronApp;
if(process.env.READER_ELECTRON){
 const harness=path.join(tmp,'browser-main.cjs');
 await fs.writeFile(harness,`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(tmp,'profile'))});app.whenReady().then(()=>{const w=new BrowserWindow({width:1320,height:880,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});w.setMenu(null);w.loadURL('about:blank');});`);
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 electronApp=await playwright._electron.launch({executablePath:process.env.READER_ELECTRON,args:['--no-sandbox','--disable-gpu',harness],env});
}
const browser=electronApp||await playwright.chromium.launch({headless:true,executablePath:process.env.READER_CHROMIUM,args:['--no-sandbox']});
const context=electronApp?electronApp.context():await browser.newContext({viewport:{width:1320,height:880},colorScheme:'light',reducedMotion:'reduce'});
let page,label='startup';const errors=[],externalRequests=[],checks=[],captures=[],contrastFailures=[],baselineSignatures={},baselineCodes={};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
await context.route('**/*',async route=>{
 const url=new URL(route.request().url());
 if(url.hostname!=='threadshelf.test'){if(/^https?:/.test(url.protocol))externalRequests.push(url.href);return route.abort();}
 const parts=url.pathname.split('/').filter(Boolean),kind=parts.shift();
 const base=path.join(kind==='baseline'?baseline:root,'dist'),file=path.resolve(base,decodeURIComponent(parts.join('/'))||'index.html');
 if(!file.startsWith(base+path.sep))return route.abort();
 try{await route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body:await fs.readFile(file)});}catch{return route.fulfill({status:404,body:'Not found'});}
});
await context.addInitScript(installFixture,{defaults,thread,version});
page=electronApp?await electronApp.firstWindow():await context.newPage();page.setDefaultTimeout(12000);await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});
page.on('pageerror',error=>errors.push({label,error:error.message}));
const action=name=>page.locator(`[data-action="${name}"]`);
async function load(kind,values={}){
 await page.goto('http://threadshelf.test/'+kind+'/index.html');
 await page.evaluate(settings=>sessionStorage.setItem('glassy-test-settings',JSON.stringify(settings)),{...defaults,...values});
 await page.reload();await page.locator('.conversation-row').first().waitFor();
}
async function reload(values={}){
 const size={width:values.width||1320,height:values.height||880};if(electronApp)await electronApp.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(size.width,size.height),size);await page.setViewportSize(size);
 await page.evaluate(settings=>sessionStorage.setItem('glassy-test-settings',JSON.stringify(settings)),{...defaults,...values});
 await page.reload();await page.locator('.conversation-row').first().waitFor();
}
async function settle(){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function reader(){await action('workspace-reader').click();await page.locator('.conversation-row').first().click();await page.locator('.language-javascript .hljs-keyword').first().waitFor();}
async function activity(){await action('workspace-analytics').click();await page.waitForFunction(()=>{const h=document.querySelector('#analyticsWorkspace');return h&&!h.hidden&&h.getAttribute('aria-busy')==='false'&&h.querySelector('.analytics-stats');});const graphs=page.locator('[data-activity-action="tab"][data-tab="graphs"]');if(await graphs.count())await graphs.click();await page.locator('.analytics-timeline-focus').first().waitFor();assert.equal(await page.locator('.analytics-error').count(),0,label+' activity errors');}
async function capture(name){await settle();await page.screenshot({path:path.join(evidence,name+'.png')});captures.push(name+'.png');}
async function closeModal(){await page.locator('.modal-header [data-action="modal-close"]').click();await page.locator('.modal').waitFor({state:'detached'});}
async function settings(values={}){
 await action('settings').click();await page.locator('[data-action="settings-tab"][data-tab="appearance"]').click();
 for(const [id,value]of Object.entries(values))await page.locator('#'+id).selectOption(value);
 await page.locator('#settingsForm button[type="submit"]').click();await page.locator('.modal').waitFor({state:'detached'});await settle();
}
async function signature(){return page.evaluate(()=>{
 const css=(selector,props,pseudo)=>{const node=document.querySelector(selector);if(!node)return null;const s=getComputedStyle(node,pseudo);return Object.fromEntries(props.map(prop=>[prop,s[prop]]));};
 const paint=['color','backgroundColor','backgroundImage','borderColor','boxShadow','backdropFilter','filter','opacity'];
 const geometry=['fontFamily','fontSize','lineHeight','padding','margin','borderRadius','maxWidth'];
 const tokens=getComputedStyle(document.documentElement),code=document.querySelector('pre code.language-javascript');
 return {tokens:Object.fromEntries(['bg','surface','sidebar','hover','border','text','muted','faint','accent','accent-soft','primary-ink'].map(key=>[key,tokens.getPropertyValue('--'+key).trim()])),paint:Object.fromEntries(['body','.shell','.app-header','.sidebar','.statusbar','.message.user','.message.assistant','.message.thinking','.message.tool','.message.system','.header-source-switch'].map(sel=>[sel,[null,'::before','::after'].map(pseudo=>css(sel,[...paint,'content','display'],pseudo))])),reader:Object.fromEntries(['.reader-content','.message.user','.message.assistant','.message-content','.code-header'].map(sel=>[sel,css(sel,geometry)])),code:{source:code.dataset.originalCode,html:code.innerHTML,pre:css('pre:has(code.language-javascript)',paint.filter(property=>property!=='color')),code:css('pre code.language-javascript',paint),inline:css('.message-content p code',paint),tokens:Object.fromEntries(['keyword','string','comment','number','literal','title'].map(k=>[k,css('.language-javascript .hljs-'+k,['color'])]))}};
});}
async function layout(){
 const g=await page.evaluate(()=>{
  const box=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
  const visible=n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden';
  const overlap=(nodes)=>{const list=nodes.filter(visible),result=[];for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){const a=box(list[i]),b=box(list[j]);if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1)result.push([list[i].dataset.action||list[i].id,list[j].dataset.action||list[j].id]);}return result;};
  const header=document.querySelector('.app-header'),modal=document.querySelector('.modal');
  const groups=['.app-header','.modal-footer','.settings-nav','.analytics-range-form'];
  return {viewport:[innerWidth,innerHeight],document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],overlaps:groups.flatMap(sel=>{const node=document.querySelector(sel);return node?overlap([...node.querySelectorAll('button,input,select')]):[];}),header:box(header),buttons:[...header.querySelectorAll('button')].filter(visible).map(box),overflow:[...document.querySelectorAll('.analytics-card,.analytics-inner,.settings-panel')].filter(visible).filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.className),modal:modal?box(modal):null,footer:modal?[...modal.querySelectorAll('.modal-footer button')].map(box):[]};
 });
 assert.ok(g.document[0]<=g.viewport[0]+1&&g.document[1]<=g.viewport[1]+1,label+' document overflow '+JSON.stringify(g));
 assert.deepEqual(g.overlaps,[],label+' controls overlap');assert.deepEqual(g.overflow,[],label+' horizontal panel overflow');
 for(const b of g.buttons)assert.ok(b.x>=0&&b.right<=g.viewport[0]+1&&b.y>=g.header.y&&b.bottom<=g.header.bottom+1,label+' header clipped');
 if(g.modal){assert.ok(g.modal.x>=0&&g.modal.y>=0&&g.modal.right<=g.viewport[0]+1&&g.modal.bottom<=g.viewport[1]+1,label+' modal exceeds viewport');for(const b of g.footer)assert.ok(b.x>=g.modal.x&&b.right<=g.modal.right+1&&b.bottom<=g.modal.bottom+1,label+' modal footer clipped');}
 checks.push({label,layout:true,viewport:g.viewport,modal:!!g.modal});
}
async function graphPoint(index=2){
 const chart=page.locator('.analytics-timeline-focus').first();await chart.scrollIntoViewIfNeeded();await chart.evaluate(node=>node.focus({preventScroll:true}));await settle();await page.keyboard.press('Home');for(let i=0;i<index;i++)await page.keyboard.press('ArrowRight');await page.locator('.timeline-tooltip').first().waitFor({state:'visible'});
 const g=await chart.evaluate((svg,index)=>{const point=svg.querySelector('.chart-line').points[index],p=new DOMPoint(point.x,point.y).matrixTransform(svg.getScreenCTM()),card=svg.parentElement,dot=card.querySelector('.timeline-hover-dot').getBoundingClientRect(),tip=card.querySelector('.timeline-tooltip').getBoundingClientRect(),workspace=document.querySelector('#analyticsWorkspace').getBoundingClientRect();return {selected:Number(svg.dataset.activePoint),dx:Math.abs(dot.x+dot.width/2-p.x),dy:Math.abs(dot.y+dot.height/2-p.y),tip:{x:tip.x,y:tip.y,right:tip.right,bottom:tip.bottom},workspace:{x:workspace.x,y:workspace.y,right:workspace.right,bottom:workspace.bottom},viewport:[innerWidth,innerHeight]};},index);
 const tooltipVisible=await page.locator('.timeline-tooltip').first().evaluate(node=>{const r=node.getBoundingClientRect(),saved=node.style.pointerEvents;node.style.pointerEvents='auto';const result=[.1,.5,.9].flatMap(x=>[.1,.5,.9].map(y=>node.contains(document.elementFromPoint(r.x+r.width*x,r.y+r.height*y))));node.style.pointerEvents=saved;return result;});assert.ok(tooltipVisible.every(Boolean),label+' tooltip is hidden behind or clipped by another surface');
 assert.equal(g.selected,index);assert.ok(g.dx<.1&&g.dy<.1,label+' chart marker shifted '+JSON.stringify(g));assert.ok(g.tip.x>=Math.max(0,g.workspace.x)&&g.tip.y>=Math.max(0,g.workspace.y)&&g.tip.right<=Math.min(g.viewport[0],g.workspace.right)+1&&g.tip.bottom<=Math.min(g.viewport[1],g.workspace.bottom)+1,label+' chart tooltip escapes bounds');checks.push({label,chartMarkerAligned:true,tooltipContained:true,dx:g.dx,dy:g.dy});
}
async function effects(){return page.evaluate(()=>['body','.shell','.app-header','.sidebar','.statusbar','.analytics-card','.analytics-stat','.modal'].flatMap(selector=>[...document.querySelectorAll(selector)].slice(0,2).flatMap(node=>[null,'::before','::after'].map(pseudo=>{const s=getComputedStyle(node,pseudo);return {selector,pseudo,content:s.content,display:s.display,background:s.backgroundColor,image:s.backgroundImage,blur:s.backdropFilter,filter:s.filter,shadow:s.boxShadow};}))));}
const displayed=e=>e.display!=='none'&&(!e.pseudo||!['none','normal'].includes(e.content));
function rgb(value){const m=value.match(/rgba?\(([^)]+)\)/);assert.ok(m,'Expected resolved RGB color '+value);return m[1].split(/[, /]+/).slice(0,3).map(Number);}
function contrast(a,b){const light=rgb=>rgb.map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0),x=light(a),y=light(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
async function composedContrast(selector){
 const node=page.locator(selector).first();await node.scrollIntoViewIfNeeded();
 const data=await node.evaluate(el=>{const r=el.getBoundingClientRect(),foreground=getComputedStyle(el).color;el.dataset.glassContrastStyle=el.getAttribute('style')||'';el.style.setProperty('color','transparent','important');return {foreground,rect:{x:r.x,y:r.y,width:r.width,height:r.height},width:innerWidth,height:innerHeight};});
 await settle();const png=(await page.screenshot()).toString('base64');
 const samples=await page.evaluate(async({png,data})=>{const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const colors=[];for(const x of [.1,.5,.9])for(const y of [.2,.5,.8]){const px=Math.min(canvas.width-1,Math.max(0,Math.floor((data.rect.x+data.rect.width*x)*canvas.width/data.width))),py=Math.min(canvas.height-1,Math.max(0,Math.floor((data.rect.y+data.rect.height*y)*canvas.height/data.height)));colors.push([...ctx.getImageData(px,py,1,1).data].slice(0,3));}return colors;},{png,data});
 await node.evaluate(el=>{const value=el.dataset.glassContrastStyle;delete el.dataset.glassContrastStyle;if(value)el.setAttribute('style',value);else el.removeAttribute('style');});
 const minimum=Math.min(...samples.map(color=>contrast(rgb(data.foreground),color)));
 if(minimum<4.5){const failure={label,selector,minimum,foreground:data.foreground,samples};contrastFailures.push(failure);console.error('CONTRAST '+JSON.stringify(failure));}
 checks.push({label,renderedContrast:{selector,foreground:data.foreground,backgroundSamples:samples,minimum,criterion:'4.5:1 minimum of nine Chromium-composited background samples'}});
}
async function noEffects(){for(const e of (await effects()).filter(displayed)){assert.equal(e.blur,'none',label+' blur '+e.selector+e.pseudo);assert.equal(e.filter,'none',label+' filter '+e.selector+e.pseudo);assert.equal(e.image,'none',label+' gradient '+e.selector+e.pseudo);if(e.pseudo)assert.equal(e.shadow,'none',label+' decorative shadow '+e.selector+e.pseudo);}checks.push({label,solidAccessibleFallback:true});}

try {
 let cachedBaseline;try{cachedBaseline=JSON.parse(await fs.readFile(signatureCache,'utf8'));}catch{}
 if(cachedBaseline){Object.assign(baselineSignatures,cachedBaseline.ui);Object.assign(baselineCodes,cachedBaseline.code);}else{
 label='Revision 6 baseline';await load('baseline');
 for(const theme of ['light','dark'])for(const uiPalette of oldIds){await reload({theme,uiPalette});await reader();baselineSignatures[theme+'/'+uiPalette]=await signature();}
 for(const theme of ['light','dark']){await reload({theme});await reader();for(const code of CODE_THEMES){await page.evaluate(id=>document.documentElement.dataset.codeTheme=id,code.id);baselineCodes[theme+'/'+code.id]=(await signature()).code;}}
 await fs.writeFile(signatureCache,JSON.stringify({ui:baselineSignatures,code:baselineCodes}));}
 console.log('Revision6 baseline signatures ready');label='3.1.0';await load('current');
 await reload();await reader();
 for(const theme of ['light','dark'])for(const uiPalette of oldIds){label='Preserved '+theme+'/'+uiPalette;await page.evaluate(values=>Object.assign(document.documentElement.dataset,values),{theme,uiPalette});await settle();assert.deepEqual(await signature(),baselineSignatures[theme+'/'+uiPalette],label+' differs from exact Revision 6');checks.push({label,exactRevision6AppearanceMatch:true});}
 console.log('All 26 Revision6 UI appearances preserved');
 await activity();
 for(const theme of ['light','dark'])for(const uiPalette of newIds){label='Activity wash preflight '+uiPalette+' '+theme;await page.evaluate(values=>Object.assign(document.documentElement.dataset,values),{theme,uiPalette});await settle();await composedContrast('.analytics-heading p');await composedContrast('.analytics-stat>span');}
 assert.deepEqual(contrastFailures,[],'Activity wash preflight contrast failures');console.log('All eight Activity wash contrast preflights PASS');
 for(const uiPalette of testedIds){const index=newIds.indexOf(uiPalette);
  for(const theme of testedSchemes){
   console.log('Testing '+uiPalette+' '+theme);label=uiPalette+' '+theme+' appearance';await reload({theme,uiPalette});await reader();
   assert.ok((await effects()).filter(displayed).some(e=>e.blur!=='none'),label+' expected glass absent');
   const sig=await signature(),withoutCorners=styles=>Object.fromEntries(Object.entries(styles).map(([selector,value])=>[selector,value&&Object.fromEntries(Object.entries(value).filter(([property])=>property!=='borderRadius'))]));assert.deepEqual(withoutCorners(sig.reader),withoutCorners(baselineSignatures[theme+'/default'].reader),label+' reader sizing changed');
   for(const code of CODE_THEMES){await page.evaluate(id=>document.documentElement.dataset.codeTheme=id,code.id);assert.deepEqual((await signature()).code,baselineCodes[theme+'/'+code.id],label+' changes code '+code.id);checks.push({label,codeTheme:code.id,exactRevision6CodeAppearanceMatch:true});}
   await page.evaluate(()=>document.documentElement.dataset.codeTheme='vscode');for(const selector of ['.brand-subtitle','[data-action="import-dialog"]','.message.user .message-content p','.message.assistant .message-content p'])await composedContrast(selector);await capture(uiPalette+'-Reader-'+theme);
   for(const size of [{width:1320,height:880,name:'normal'},{width:680,height:540,name:'minimum'},{width:1600,height:540,name:'wide-short'}]){
    label=uiPalette+' '+theme+' '+size.name;await reload({theme,uiPalette,...size,language:['en','hu','de','ja'][index],fontSize:size.name==='minimum'?'xl':'normal'});await reader();await layout();
    await action('search-toggle').click();await page.locator('#archiveSearch').waitFor({state:'visible'});await layout();await action('search-options').click();await layout();await closeModal();await action('search-toggle').click();
    await activity();await layout();for(const index of [0,2,5])await graphPoint(index);await composedContrast('.analytics-heading p');await composedContrast('.analytics-stat>span');if(size.name==='normal')await capture(uiPalette+'-Activity-'+theme);
    await action('settings').click();await page.locator('[data-action="settings-tab"][data-tab="appearance"]').click();await layout();
    if(size.name==='normal')await composedContrast('#prefUiPaletteDescription');assert.equal(await page.locator('#prefUiPalette option').count(),UI_PALETTES.length);assert.equal(await page.locator('#prefCodeTheme option').count(),10);
    for(const id of newIds){await page.locator('#prefUiPalette').selectOption(id);const language=await page.evaluate(()=>document.documentElement.lang);assert.equal(await page.locator('#prefUiPalette option:checked').textContent(),dictionaries[language]['palette_'+id]);assert.equal(await page.locator('#prefUiPaletteDescription').textContent(),dictionaries[language]['paletteDescription_'+id]);assert.ok((await page.locator('#prefUiPaletteDescription').textContent()).trim());}
    await page.locator('#prefUiPalette').selectOption(uiPalette);
    const before=await page.locator('#analyticsWorkspace').evaluate(n=>n.scrollTop),panel=await page.locator('.settings-panel').boundingBox();await page.mouse.move(panel.x+panel.width/2,panel.y+panel.height/2);await page.mouse.wheel(0,180);await settle();assert.equal(await page.locator('#analyticsWorkspace').evaluate(n=>n.scrollTop),before,label+' modal wheel moved workspace');
    if(size.name==='minimum'&&theme==='dark')await capture(uiPalette+'-Settings-minimum-dark');await closeModal();
    if(size.name==='minimum'){await action('mode-server').click();await page.locator('.insights-grid').waitFor();await layout();await graphPoint();checks.push({label,serverInsights:true});}
   }
  }
  label=uiPalette+' real Settings selection';await reload({uiPalette:'default'});await reader();await settings({prefUiPalette:uiPalette,prefTheme:'system',prefCodeTheme:'ayu'});
  assert.equal(await page.locator('html').getAttribute('data-ui-palette'),uiPalette);assert.equal(await page.locator('html').getAttribute('data-code-theme'),'ayu');
  await action('settings').click();assert.equal(await page.locator('#prefUiPalette option:checked').textContent(),names[index]);await closeModal();
  for(const colorScheme of ['dark','light']){await page.emulateMedia({colorScheme});await page.waitForFunction(value=>document.documentElement.dataset.theme===value,colorScheme);assert.equal(await page.locator('html').getAttribute('data-ui-palette'),uiPalette);assert.equal(await page.locator('html').getAttribute('data-code-theme'),'ayu');}
  await page.reload();await page.locator('.conversation-row').first().waitFor();assert.equal(await page.locator('html').getAttribute('data-ui-palette'),uiPalette);assert.equal(await page.evaluate(()=>window.__glassSettings.theme),'system');checks.push({label,uiSelection:true,systemLightAndDark:true,reloadRetainsSelection:true});
  for(const fallback of ['high-contrast','reduced-transparency','forced-colors']){
   label=uiPalette+' '+fallback;await page.emulateMedia({colorScheme:'dark',forcedColors:'none'});await reload({uiPalette,theme:'dark',highContrast:fallback==='high-contrast'});await activity();
   let cdp;
   if(fallback==='reduced-transparency'){cdp=await context.newCDPSession(page);await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'},{name:'prefers-reduced-motion',value:'reduce'},{name:'prefers-reduced-transparency',value:'reduce'}]});assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-transparency: reduce)').matches),true);}
   if(fallback==='forced-colors')await page.emulateMedia({forcedColors:'active'});
   await noEffects();await layout();await graphPoint();await action('settings').click();await noEffects();await layout();await closeModal();
   if(cdp){await cdp.send('Emulation.setEmulatedMedia',{features:[]});await cdp.detach();}await page.emulateMedia({forcedColors:'none',colorScheme:'light',reducedMotion:'reduce'});
  }
 }
 assert.deepEqual(errors,[],'Renderer errors');assert.deepEqual(externalRequests,[],'Unintended outbound requests');
 const report={result:contrastFailures.length?'FAIL':'PASS',version,focused,rendererCssSha256:createHash('sha256').update(await fs.readFile(path.join(root,'dist/app.css'))).digest('hex'),contrastFailures,engine:electronApp?'Playwright native Linux Electron':'Playwright headless Chromium',baseline:{file:path.basename(baselineArchive),sha256:baselineSha256},scope:'Production renderer with synthetic desktop API; actual persistence separately covered by themes.test.mjs; not a Windows native runtime test',preservedUiComparisons:26,preservedCodeCombinations:testedIds.length*testedSchemes.length*10,newPalettes:testedIds,testedSchemes,viewports:['680x540','1320x880','1600x540'],checks:checks.length,results:checks,captures,pageErrors:errors,externalRequests};
 await fs.writeFile(path.join(evidence,focused?'glassy-focused-results.json':'glassy-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,results:undefined,captures:captures.length},null,2));assert.deepEqual(contrastFailures,[],'Rendered contrast failures');
} catch(error) {
 await page?.screenshot({path:path.join(evidence,'Failure-'+label.replaceAll(/[^a-zA-Z0-9-]/g,'-')+'.png')}).catch(()=>{});console.error('Failure scenario:',label);throw error;
} finally {await browser.close();await fs.rm(tmp,{recursive:true,force:true});}
