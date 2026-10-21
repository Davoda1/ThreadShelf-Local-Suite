#!/usr/bin/env node
// Synthetic chat-derived fixtures through the real ReaderView/message pipeline.
// This is browser rendering coverage, not a claim of an account-export round trip.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {exportedFixtures,readerFixtures,fixtureById,genuiMessage,readerMessage} from './fixtures/chart-compatibility.mjs';
import {UI_PALETTES,CODE_THEMES} from '../src/core/themes.mjs';
import {richLayoutPreview} from '../scripts/preview-rich.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const baseline=process.env.READER_CHART_BASELINE;
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'reader-chart-browser-'));
const evidence=process.env.READER_CHART_EVIDENCE;
if(evidence)await fs.mkdir(evidence,{recursive:true});
const {chromium,_electron}=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');
const baselineNames=new Set(['rich-charts.js','rich-charts.css','rich-parser.js','rich-renderer.js','rich-layout.css','renderer.js']);
async function sourceFingerprints(){
 const files=['package.json','package-lock.json','scripts/preview-rich.mjs','tests/fixtures/chart-compatibility.mjs','tests/chart-compatibility.browser.mjs'];
 async function walk(directory){for(const item of await fs.readdir(path.join(root,directory),{withFileTypes:true})){const name=path.join(directory,item.name);if(item.isDirectory())await walk(name);else if(/\.(?:js|mjs|css)$/.test(name))files.push(name);}}
 await walk('src');const result={};for(const name of files.sort())result[name]=createHash('sha256').update(await fs.readFile(path.join(root,name))).digest('hex');return result;
}
const testedSources=await sourceFingerprints();
await build({stdin:{contents:`import {ReaderView} from './src/reader/reader.js';import {applyAppearance} from './src/ui/appearance.js';import {translator} from './src/ui/i18n.js';import './src/ui/style.css';import './src/ui/themes.css';import './src/ui/code-themes.css';import './src/ui/modern.css';import './src/ui/glassy.css';import './src/ui/theme-effects.css';window.testApi={ReaderView,applyAppearance,translator};`,resolveDir:root},bundle:true,format:'iife',outfile:path.join(tmp,'test.js'),loader:{'.woff2':'file','.woff':'file','.ttf':'file'},logLevel:'silent',plugins:baseline?[{name:'immutable-baseline',setup(b){b.onLoad({filter:/src\/reader\/(?:rich-charts\.(?:js|css)|rich-parser\.js|rich-renderer\.js|rich-layout\.css|renderer\.js)$/},async args=>({contents:await fs.readFile(path.join(baseline,path.basename(args.path)),'utf8'),loader:args.path.endsWith('.css')?'css':'js',resolveDir:path.dirname(args.path)}));}}]:[]});
assert.deepEqual(await sourceFingerprints(),testedSources,'Sources remain unchanged while compiling the tested bundle');
const bundleFingerprints=Object.fromEntries(await Promise.all(['test.js','test.css'].map(async name=>[name,createHash('sha256').update(await fs.readFile(path.join(tmp,name))).digest('hex')])));
let electronApp;
if(process.env.READER_ELECTRON){
 const main=path.join(tmp,'main.cjs');await fs.writeFile(main,`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(tmp,'profile'))});app.whenReady().then(()=>{const w=new BrowserWindow({width:1100,height:780,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});w.setMenu(null);w.loadURL('about:blank');});`);
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;electronApp=await _electron.launch({executablePath:process.env.READER_ELECTRON,args:['--no-sandbox','--disable-gpu',main],env});
}
const browser=electronApp||await chromium.launch({headless:true,...(process.env.READER_CHROMIUM?{executablePath:process.env.READER_CHROMIUM}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
const context=electronApp?electronApp.context():await browser.newContext({viewport:{width:1100,height:780},reducedMotion:'reduce',deviceScaleFactor:1.25});
const page=electronApp?await electronApp.firstWindow():await context.newPage(),errors=[],requests=[],checks=[],captures=[];
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(5000);
await context.route('**/*',async route=>{
 const u=new URL(route.request().url());if(u.origin!=='http://reader-chart.test'){requests.push(u.href);return route.abort();}
 if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="stylesheet" href="/test.css"><style>#host{position:absolute;inset:0;min-width:0;min-height:0}#outside{position:fixed;right:0;bottom:0;width:8px;height:8px}</style></head><body><div id="host"></div><button id="outside" aria-label="Outside chart"></button><script src="/test.js"></script></body></html>'});
 const name=decodeURIComponent(u.pathname.slice(1));const directory=['mathjax-tex-svg.js','mermaid.min.js'].includes(name)?path.join(root,'public'):tmp;
 const file=path.resolve(directory,name);if(!file.startsWith(directory+path.sep))return route.abort();
 try{return route.fulfill({contentType:file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream',body:await fs.readFile(file)});}catch{return route.fulfill({status:404,body:'Not found'});}
});
const sourceFor=f=>f.payload?genuiMessage(f.payload):readerMessage(f.content);
const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function show(source,settings={}){
 await page.mouse.move(0,0);
 return page.evaluate(async({source,settings})=>{
  const defaults={theme:'light',uiPalette:'default',codeTheme:'default',language:'en',fontSize:'normal',animations:false,compact:false};
  const s={...defaults,...settings};window.testApi.applyAppearance(s);
  window.reader?.destroy();const host=document.getElementById('host');
  window.reader=new window.testApi.ReaderView({container:host,t:window.testApi.translator(s.language),settings:s});
  window.syntheticThread={id:'chart-test',title:'Synthetic chart acceptance',provider:'openai',conversationKey:'chart-test',raw:{source:'synthetic',identity:'stable'},turns:[{ai:source,turn_index:7,source_message_id:'source-stable',createdAt:'2026-01-01T00:00:00Z',model:'synthetic'}]};
  window.savedBefore=JSON.stringify(window.syntheticThread);await window.reader.show(window.syntheticThread,{key:'chart-test'});
  return document.querySelector('.message').sourceText;
 },{source,settings});
}
const chart=()=>page.locator('.rich-chart').first();
const tooltip=()=>page.locator('.rich-chart-tooltip:visible').first();
async function focusMark(index=0){const mark=chart().locator('.rich-chart-mark').nth(index),id=await mark.getAttribute('data-chart-active');const hit=id!==null?chart().locator(`.rich-chart-hit[data-chart-item="${id}"]`):null;const target=hit&&await hit.count()?hit:mark;await target.scrollIntoViewIfNeeded();await target.focus();await settle();}
async function hoverMark(index=0){await chart().locator('.rich-chart-mark').nth(index).hover({force:true});await settle();}
async function panel(patterns){await tooltip().waitFor();const text=await tooltip().innerText();for(const p of patterns)assert.match(text,p);return text;}
async function bounded(){const r=await tooltip().evaluate(n=>{const b=n.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,w:innerWidth,h:innerHeight};});assert.ok(r.left>=-1&&r.top>=-1&&r.right<=r.w+1&&r.bottom<=r.h+1,JSON.stringify(r));}
async function shot(name){if(!evidence)return;const file=path.join(evidence,name+'.png');await page.screenshot({path:file});captures.push(file);}
async function unchanged(source){assert.equal(await page.evaluate(()=>JSON.stringify(window.syntheticThread)===window.savedBefore),true);assert.equal(await page.locator('.message').evaluate(n=>n.sourceText),source);}
async function crosshairAt(markIndex){const position=await chart().evaluate((c,index)=>{const m=c.querySelectorAll('.rich-chart-mark')[index],line=c.querySelector('.rich-chart-crosshair'),svg=m.ownerSVGElement;const screen=(x,y)=>new DOMPoint(x,y).matrixTransform(svg.getScreenCTM());return {mark:screen(+m.getAttribute('cx'),+m.getAttribute('cy')).x,line:line?screen(+line.getAttribute('x1'),+line.getAttribute('y1')).x:null,hidden:line?getComputedStyle(line).display==='none'||getComputedStyle(line).visibility==='hidden':true};},markIndex);assert.equal(position.hidden,false);assert.ok(Math.abs(position.mark-position.line)<1.2,JSON.stringify(position));}

// Actual preview markup plus ordinary tertiary surfaces exercise the narrow
// progress treatment without promoting unrelated cards or arbitrary boxes.
const progressControls = `
<box background="surface-tertiary" radius="full" width="31%" height="14px"/>
<box background="surface-tertiary" border radius="md" padding={2}><text>Ordinary tertiary card</text></box>
<box width="100%" height="14px" radius="full" background="surface-secondary" border clip>
  <box width="31%" height="14px" radius="full" background="surface-tertiary"><text>Nonempty surface</text></box>
</box>
<box width="100%" height="14px" radius="full" background="surface-secondary" border clip>
  <box width="30%" height="14px" radius="full" background="surface-tertiary"/>
  <box width="40%" height="14px" radius="full" background="surface-tertiary"/>
</box>`;
async function inspectProgress(){
 const result=await page.evaluate(()=>{
  const candidates=[...document.querySelectorAll('.rich-box.rich-surface-tertiary')];
  const fills=candidates.filter(n=>['51%','71%','100%'].includes(n.style.width)&&n.style.height==='14px');
  const reference=document.querySelector('.rich-chart-viewport rect.rich-chart-color-0');
  const probe=document.createElement('div');probe.style.background='var(--bg-tertiary,var(--bg-secondary))';document.querySelector('.message-content').append(probe);
  const tertiary=getComputedStyle(probe).backgroundColor;probe.style.background='var(--bg-secondary,var(--bg-primary))';const secondary=getComputedStyle(probe).backgroundColor;probe.remove();
  return {chartColor:getComputedStyle(reference).fill,tertiary,secondary,
   fills:fills.map(n=>({width:n.style.width,height:n.style.height,color:getComputedStyle(n).backgroundColor,trackColor:getComputedStyle(n.parentElement).backgroundColor,renderedWidth:n.getBoundingClientRect().width,trackWidth:n.parentElement.clientWidth,trackHeight:n.parentElement.getBoundingClientRect().height})),
   controls:candidates.filter(n=>!fills.includes(n)).map(n=>({text:n.textContent,color:getComputedStyle(n).backgroundColor}))};
 });
 assert.deepEqual(result.fills.map(n=>n.width),['51%','71%','100%']);
 for(const fill of result.fills){assert.equal(fill.color,result.chartColor,'Layout progress matches the first chart series');assert.equal(fill.height,'14px');assert.equal(fill.trackHeight,14);assert.equal(fill.trackColor,result.secondary,'Track remains a secondary surface');assert.ok(Math.abs(fill.renderedWidth-fill.trackWidth*parseFloat(fill.width)/100)<1.5,'Literal percentage determines rendered fill width');}
 assert.equal(result.controls.length,5);for(const control of result.controls)assert.equal(control.color,result.tertiary,'Ordinary tertiary surfaces retain their theme background');
 return result;
}

try{
 await page.goto('http://reader-chart.test/');
 if(baseline){
  const results=[];
  for(const f of exportedFixtures){await show(sourceFor(f));results.push({id:f.id,rendered:await page.locator('.rich-chart:not(.rich-chart-fallback)').count(),fallback:await page.locator('.rich-chart-fallback').count()});}
  assert.deepEqual(results.filter(r=>r.rendered).map(r=>r.id),['C07']);
  await show(sourceFor(fixtureById('C07')));await hoverMark(0);
  assert.equal(await page.locator('.rich-chart-tooltip:visible').count(),0);assert.ok(await page.locator('.rich-chart-mark title').count()>0);
  const report={baseline:true,results,nativeSvgTitles:await page.locator('.rich-chart-mark title').count(),customTooltips:0,sourceHashes:Object.fromEntries(await Promise.all([...baselineNames].map(async name=>[name,createHash('sha256').update(await fs.readFile(path.join(baseline,name))).digest('hex')])))};
  if(evidence)await fs.writeFile(path.join(evidence,'baseline-browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }else{
  for(const f of [...exportedFixtures,...readerFixtures]){const src=sourceFor(f);assert.equal(await show(src),src);assert.equal(await page.locator('.rich-chart-fallback').count(),0,f.id);assert.equal(await page.locator('.rich-chart svg').count(),1,f.id);assert.equal(await page.locator('.rich-chart-data table').count(),1);await unchanged(src);}
  checks.push('Seven supplied GenUI payloads and seven Reader presentations render through ReaderView; original source and synthetic identities preserved');
  await show(sourceFor(fixtureById('C02')));await hoverMark(1);await panel([/Beta/,/Score/,/70\.5%/]);assert.doesNotMatch(await tooltip().innerText(),/7050/);await bounded();await shot('C02-percentage-hover');
  const swatch=await tooltip().locator('.rich-chart-swatch').evaluate(n=>getComputedStyle(n).backgroundColor),fill=await chart().locator('.rich-chart-mark').nth(1).evaluate(n=>getComputedStyle(n).fill);assert.equal(swatch,fill);assert.ok(await chart().locator('.rich-chart-mark.is-active').count());
  await page.keyboard.press('Escape');await settle();assert.equal(await page.locator('.rich-chart-tooltip:visible').count(),0);await page.mouse.move(0,0);await hoverMark(1);await panel([/70\.5%/]);
  await show(sourceFor(fixtureById('C04')));await hoverMark(1);await panel([/Beta/,/Coverage/,/71%/]);await shot('C04-horizontal-hover');
  const barShape=await chart().locator('.rich-chart-mark').nth(1).evaluate(n=>({w:+n.getAttribute('width'),h:+n.getAttribute('height')}));assert.ok(barShape.w>barShape.h);
  checks.push('C02 and C04 exact pointer tooltips, swatch color, highlight, bounds and Escape dismissal');
  await show(sourceFor(fixtureById('C05')));assert.equal(await chart().locator('.rich-chart-mark').count(),8);assert.equal(await chart().locator('.rich-chart-line').count(),2);
  await focusMark(1);await panel([/Second/,/Series A[\s\S]*0/,/Series B[\s\S]*1/]);assert.equal(await chart().locator('.rich-chart-mark.is-active').count(),2);await crosshairAt(1);
  await focusMark(2);await panel([/Third/,/Series A[\s\S]*3\.125/,/Series B[\s\S]*2/]);await crosshairAt(2);await shot('C05-shared-lines');
  await page.keyboard.press('Escape');await settle();assert.equal(await page.locator('.rich-chart-tooltip:visible').count(),0);await page.keyboard.press('ArrowRight');await panel([/Fourth/]);await page.keyboard.press('Tab');
  checks.push('C05 shared series order, valid zero, exact fractional values, keyboard navigation, two highlights and SVG crosshair alignment');
  await show(sourceFor(fixtureById('C09')));await hoverMark(1);await panel([/Probe A/,/2/,/3\.125/]);await crosshairAt(1);assert.equal(await chart().locator('.rich-chart-line').count(),0);assert.doesNotMatch(await tooltip().innerText(),/P[123]/);await shot('C09-scatter');
  await show(sourceFor(fixtureById('C07')));await focusMark(0);await panel([/Alpha/,/Items/,/\b6\b/,/60%/,/Share of total/i]);await shot('C07-ring-share');await chart().locator('summary').click();assert.match(await chart().locator('tbody').innerText(),/Alpha\s+6/);assert.doesNotMatch(await chart().locator('tbody').innerText(),/60%/);
  await show(sourceFor(fixtureById('C03')));await focusMark(1);await panel([/Zero/,/Value/,/\b0\b/]);const zero=await chart().locator('.rich-chart-mark').nth(1).evaluate(n=>({height:+n.getAttribute('height'),width:+n.getAttribute('width')}));assert.ok(zero.height===0||zero.width===0,'Zero geometry must remain zero');
  checks.push('Numeric scatter coordinates and guide; ring shows derived share alongside unchanged raw table; zero bar remains focusable without fictitious magnitude');
  await show(sourceFor(fixtureById('R03')));await focusMark(0);await panel([/Same/,/-0 kg/]);await focusMark(1);await panel([/Same/,/3\.125 kg/]);await crosshairAt(1);
  await show(sourceFor(fixtureById('R04')));await focusMark(1);await panel([/B/,/Measured/,/\b5\b/]);await crosshairAt(1);
  checks.push('Duplicate category positions, negative zero, inherited units and unstacked Reader area interaction');
  // Single-category geometry, numeric overlapping-point identity, mixed units,
  // circular zeros and inert tooltip strings are exercised in production DOM.
  const single={schema:'threadshelf-chart',version:1,type:'line',categories:['Only'],series:[{label:'One series',values:[3.125]}]};
  await show(readerMessage(single));await focusMark(0);await panel([/Only/,/3\.125/]);await crosshairAt(0);
  const overlap={schema:'threadshelf-chart',version:1,type:'scatter',series:[{label:'First source',points:[{x:2,y:3.125,label:'Original A'}]},{label:'Second source',points:[{x:2,y:3.125,label:'Original B'}]}]};
  await show(readerMessage(overlap));await hoverMark(0);await panel([/First source/,/Original A/]);await chart().locator('.rich-chart-viewport').focus();await page.keyboard.press('ArrowRight');await panel([/Second source/,/Original B/]);
  const point=await chart().locator('.rich-chart-mark').first().boundingBox();await page.mouse.move(point.x+point.width/2+12,point.y+point.height/2);await panel([/First source/]);await page.mouse.move(point.x+point.width/2+50,point.y+point.height/2);await settle();assert.equal(await page.locator('.rich-chart-tooltip:visible').count(),0);
  const circular={schema:'threadshelf-chart',version:1,type:'doughnut',categories:['Zero','Positive'],series:[{label:'Items',values:[0,5]}]};
  await show(readerMessage(circular));assert.equal(await chart().locator('.rich-chart-mark').count(),1);await chart().locator('.rich-chart-viewport').focus();await panel([/Zero/,/\b0\b/]);await page.keyboard.press('ArrowRight');await panel([/Positive/,/100%/]);
  circular.series[0].values=[0,0];await show(readerMessage(circular));assert.equal(await chart().locator('.rich-chart-mark').count(),0);assert.equal(await page.locator('.rich-chart-fallback').count(),1);assert.match(await page.locator('.rich-chart-source').textContent(),/Zero/);assert.doesNotMatch(await page.locator('.message-content').innerHTML(),/NaN|Infinity/);
  const mixed={schema:'threadshelf-chart',version:1,type:'line',categories:['Mixed'],series:[{label:'Percent',values:[52.3],valueSuffix:'%'},{label:'Voltage',values:[3.125],unit:'V'}]};
  await show(readerMessage(mixed));await focusMark(0);await panel([/52\.3%/,/3\.125 V/]);assert.equal(await chart().locator('.rich-chart-label').filter({hasText:'%'}).count(),0,'Mixed-unit numeric axis cannot inherit percent');
  const inertTooltip=structuredClone(single);inertTooltip.categories=['<img src="https://unsafe.invalid/x" onerror="window.unsafe=true">'];inertTooltip.series[0].label='<script>window.unsafe=true</script>';
  await show(readerMessage(inertTooltip));await focusMark(0);await panel([/<img/,/<script>/]);assert.equal(await tooltip().locator('img,script,a').count(),0);assert.equal(await page.evaluate(()=>Boolean(window.unsafe)),false);
  checks.push('Single-category plot, deterministic bounded scatter overlap inspection, circular zero totals/single positive slice, mixed-unit axis and inert tooltip text');
  // CTM-to-screen coordinates after chart/conversation scroll and CSS zoom.
  for(const [width,height,zoom]of [[680,540,1],[700,1100,1.25],[1500,540,1.5],[1100,780,.8]]){
   await page.setViewportSize({width,height});await show('Paragraph before.\n\n'+sourceFor(fixtureById('C05'))+'\n\n'+('Trailing paragraph.\n\n'.repeat(25)));
   await page.evaluate(z=>document.getElementById('host').style.zoom=String(z),zoom);await focusMark(2);await panel([/Third/]);await crosshairAt(2);await bounded();
   await page.locator('#conversationContent').evaluate(n=>n.scrollTop+=35);await settle();await focusMark(1);await panel([/Second/]);await crosshairAt(1);await bounded();
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight);assert.equal(overflow,false);
  }
  await page.evaluate(()=>document.getElementById('host').style.zoom='1');await page.setViewportSize({width:1100,height:780});
  checks.push('Actual coordinate alignment at four viewports/CSS zooms and 1.25 device scale, including conversation scrolling');
  // A visible portion of the category remains hoverable when the chart center
  // has scrolled above the conversation viewport.
  await page.setViewportSize({width:680,height:540});await show(sourceFor(fixtureById('C05'))+'\n\n'+('Below the chart.\n\n'.repeat(35)));
  const clipped=await chart().evaluate(c=>{const hit=c.querySelector('.rich-chart-hit[data-chart-item="1"]'),scroller=document.getElementById('conversationContent'),before=hit.getBoundingClientRect();scroller.scrollTop+=before.y+before.height/2+20;const box=hit.getBoundingClientRect(),view=scroller.getBoundingClientRect();return {x:box.x+box.width/2,y:Math.min(view.bottom-10,box.bottom-10),center:box.y+box.height/2,viewTop:view.top};});
  assert.ok(clipped.center<clipped.viewTop);await page.mouse.move(clipped.x,clipped.y);await settle();await panel([/Second/,/Series A/,/Series B/]);await bounded();await page.setViewportSize({width:1100,height:780});
  checks.push('Partially clipped category remains pointer-inspectable when its center is above the conversation viewport');
  await show(sourceFor(fixtureById('C05')));await page.evaluate(()=>document.body.style.zoom='1.2');await focusMark(2);await panel([/Third/,/3\.125/]);await crosshairAt(2);await bounded();await page.evaluate(()=>document.body.style.zoom='1');
  const long={schema:'threadshelf-chart',version:1,type:'line',categories:['Long category '.repeat(200)],series:Array.from({length:8},(_,i)=>({label:'Series '+i+' long label '.repeat(200),values:[i+.125]}))};
  await page.setViewportSize({width:680,height:540});await show(readerMessage(long),{fontSize:'xl'});await focusMark(0);await panel([/0\.125/,/7\.125/]);await bounded();
  const valuesBounded=await tooltip().evaluate(n=>{const p=n.getBoundingClientRect();return [...n.querySelectorAll('.rich-chart-tooltip-value')].every(value=>{const b=value.getBoundingClientRect();return b.top>=p.top&&b.bottom<=p.bottom+1&&b.left>=p.left&&b.right<=p.right+1;});});assert.equal(valuesBounded,true,'All eight values remain visible with long labels');await shot('long-labels');await page.setViewportSize({width:1100,height:780});
  checks.push('Body zoom scales portal and guide correctly; long headings/eight series labels retain all numeric values within minimum-window tooltip');
  // Wide bounded chart is intentionally scrollable inside its viewport.
  const wide={schema:'threadshelf-chart',version:1,type:'line',categories:Array.from({length:200},(_,i)=>'Category '+i),series:Array.from({length:5},(_,s)=>({label:'Series '+s,values:Array.from({length:200},(_,i)=>(i+s)%17)}))};
  await show(readerMessage(wide));assert.equal(await chart().locator('.rich-chart-mark').count(),1000);await focusMark(199);await panel([/Category 199/]);await crosshairAt(199);await bounded();await page.locator('.rich-chart-viewport').evaluate(n=>n.scrollLeft=Math.max(0,n.scrollWidth-n.clientWidth));await focusMark(198);await crosshairAt(198);await bounded();
  checks.push('Maximum 1000-point supported chart and internal viewport scroll preserve exact category and guide');
  const source=sourceFor(fixtureById('C02'))+'\n\n```javascript\nconst answer = 42;\n```\n\n'+richLayoutPreview+'\n\n'+progressControls;
  const matrix=[];
  for(const theme of ['light','dark'])for(const palette of UI_PALETTES){await show(source,{theme,uiPalette:palette.id,codeTheme:'vscode'});await focusMark(1);await panel([/70\.5%/]);await bounded();const markColor=await chart().locator('.rich-chart-mark').nth(1).evaluate(n=>getComputedStyle(n).fill),swatchColor=await tooltip().locator('.rich-chart-swatch').evaluate(n=>getComputedStyle(n).backgroundColor);assert.equal(markColor,swatchColor);matrix.push({theme,palette:palette.id,markColor,progress:await inspectProgress(),...await tooltip().evaluate(n=>({color:getComputedStyle(n).color,background:getComputedStyle(n).backgroundColor}))});if(['default','smoked-glass','amber-room'].includes(palette.id))await shot('theme-'+palette.id+'-'+theme);}
  assert.equal(matrix.length,UI_PALETTES.length*2);
  assert.ok(new Set(matrix.map(item=>item.markColor)).size>2,'Chart colors follow interface themes');
  assert.ok(new Set(matrix.map(item=>item.background)).size>2,'Tooltip backgrounds follow interface themes');
  assert.ok(new Set(matrix.map(item=>item.progress.chartColor)).size>2,'Layout progress colors vary with the selected theme');
  const translations=[];
  for(const language of ['en','hu','de','fr','ja']){await show(sourceFor(fixtureById('C07')),{language});await focusMark(0);await panel([/60%/]);translations.push({language,summary:await chart().locator('summary').innerText(),tooltip:await tooltip().innerText()});}
  assert.equal(new Set(translations.map(t=>t.summary)).size,5);assert.equal(new Set(translations.map(t=>t.tooltip)).size,5);
  for(const code of CODE_THEMES){await show(source,{codeTheme:code.id});await focusMark(1);await panel([/70\.5%/]);assert.equal(await page.locator('pre code').evaluate(n=>n.dataset.originalCode),'const answer = 42;');}
  const progressAccessibility=[];
  for(const scheme of ['light','dark']){await page.emulateMedia({colorScheme:scheme});await show(source,{theme:'system',highContrast:true,fontSize:'xl'});assert.equal(await page.locator('html').getAttribute('data-theme'),scheme);await focusMark(1);await bounded();progressAccessibility.push({mode:'system-'+scheme,progress:await inspectProgress()});}
  await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});await show(source,{highContrast:true,fontSize:'xl'});await focusMark(1);await panel([/70\.5%/]);await bounded();progressAccessibility.push({mode:'forced-colors',progress:await inspectProgress()});await shot('forced-colors');await page.emulateMedia({forcedColors:'none'});
  checks.push('34 interface theme/mode combinations, five translated locales, ten independent code themes, System light/dark, high contrast, forced colors, reduced motion and large text');
  checks.push('Layout progress 51%, 71% and 100% fills match the first chart series across 34 theme/mode combinations, two System/high-contrast modes and forced colors; literal widths, 14px tracks and five ordinary tertiary controls preserved');
  const dashboard=richLayoutPreview+'\n\nTS32-NATIVE-UI-END';
  await show(dashboard);assert.equal(await page.locator('.rich-grid-item').count(),7);assert.equal(await page.locator('.rich-grid').nth(1).locator('.rich-icon').count(),3);
  const dashboardText=await page.locator('.message-content').innerText();assert.match(dashboardText,/ordinary Markdown before[\s\S]*32 messages[\s\S]*TS32 Demo Reader[\s\S]*Ready[\s\S]*ordinary Markdown paragraph comes immediately after[\s\S]*Step 0[\s\S]*Import[\s\S]*Step 1[\s\S]*Parse[\s\S]*Step 2[\s\S]*Render[\s\S]*Step 3[\s\S]*Verify[\s\S]*51%[\s\S]*71%[\s\S]*100%[\s\S]*TS32-NATIVE-UI-END/);assert.equal(await page.locator('.rich-grid strong').count(),1);assert.equal(await page.locator('.rich-grid em').count(),1);assert.equal(await page.locator('.rich-grid code').count(),1);assert.doesNotMatch(await page.locator('.message-content').innerHTML(),/TSRICH(?:CHILD)?[a-f0-9]{32}END/);
  assert.deepEqual(await page.locator('.rich-box[style*="width: 51%"],.rich-box[style*="width: 71%"],.rich-box[style*="width: 100%"]').evaluateAll(ns=>ns.filter(n=>n.style.height==='14px'&&!n.classList.contains('rich-border')).map(n=>n.style.width)),['51%','71%','100%']);await shot('rich-dashboard');
  await page.setViewportSize({width:680,height:540});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await unchanged(dashboard);await page.setViewportSize({width:1100,height:780});
  const literal='```json\n'+JSON.stringify(fixtureById('C02').payload)+'\n```\n\n`<Entity value="literal"/>`\n\n    <Chart content={{type:"line"}}/>\n\n| Category | Value |\n| --- | --- |\n| A | 1 |\n\n[Interactive visualization not included in this export.]\n\n<box>{#each [{s:"<Entity value=\\"inert\\"/> **not bold**"}] as item}<text>{item.s}</text>{/each}</box>';
  await show(literal);assert.equal(await page.locator('.rich-chart').count(),0);assert.equal(await page.locator('.rich-entity').count(),0);assert.equal(await page.locator('.message-content strong').count(),0);assert.match(await page.locator('.message-content').innerText(),/Interactive visualization not included/);assert.equal(await page.locator('.message-content table').count(),1);await unchanged(literal);
  checks.push('Framed dashboard and adjacent paragraphs, four ordered steps/three arrows, percentages, Markdown emphasis/code, inert bound strings/code and ordinary tables');
  // Rejected fragment cannot consume a later valid chart or adjacent prose.
  const rejected=genuiMessage({charts_widget_v2:{content:{...fixtureById('C02').payload.charts_widget_v2.content,stacked:true}}});
  await show('Before sentinel.\n\n'+rejected+'\n\n'+sourceFor(fixtureById('C02'))+'\n\nTS32-NATIVE-UI-END');assert.equal(await page.locator('.rich-chart-fallback').count(),1);assert.equal(await page.locator('.rich-chart:not(.rich-chart-fallback)').count(),1);assert.match(await page.locator('.message-content').innerText(),/Before sentinel[\s\S]*TS32-NATIVE-UI-END/);
  // Source copy/search exact values and cleanup use actual ReaderView APIs.
  const copySource=sourceFor(fixtureById('C02'));await show(copySource);await focusMark(1);await chart().locator('summary').click();await unchanged(copySource);
  const searched=await page.evaluate(()=>window.reader.find('70.5'));assert.ok(searched.total>0);assert.equal(await page.locator('.rich-chart-data').getAttribute('open'),'');await unchanged(copySource);
  for(let i=0;i<20;i++){await show(copySource);await focusMark(1);await panel([/70\.5%/]);await page.evaluate(()=>window.reader.renderer.renderMessages([{message_id:'plain',role:'assistant',content:'Replacement'}]));await settle();assert.equal(await page.locator('.rich-chart-tooltip:visible').count(),0);}
  await show(copySource);await focusMark(1);await page.locator('#conversationContent').evaluate(n=>n.style.display='none');await settle();assert.equal(await page.locator('.rich-chart-tooltip:visible').count(),0);await page.locator('#conversationContent').evaluate(n=>n.style.display='');
  await page.evaluate(()=>window.reader.destroy());await settle();assert.equal(await page.locator('.rich-chart-tooltip').count(),0);
  checks.push('Invalid sibling recovery, exact values search reveal, unchanged source/identity, repeated renderer replacement, hidden target and ReaderView destruction cleanup');
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  assert.deepEqual(await sourceFingerprints(),testedSources,'Sources remain unchanged throughout the test run');
  const report={ok:true,version:JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version,scope:'Synthetic chat-derived payloads in production ReaderView browser pipeline',runtime:electronApp?'Electron':'Chromium',checks,matrix,progressAccessibility,translations,externalRequests:requests,pageErrors:errors,captures,deviceScaleFactor:await page.evaluate(()=>devicePixelRatio),sourceFingerprintGuard:'Before compilation = after compilation = after tests',sourceFingerprints:testedSources,bundleFingerprints};
  if(evidence)await fs.writeFile(path.join(evidence,'chart-browser-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }
}catch(error){await shot('failure').catch(()=>{});console.error(JSON.stringify(await page.evaluate(()=>({active:document.activeElement?.outerHTML.slice(0,500),interaction:document.querySelector('.rich-chart')?.dataset.chartInteraction,targets:[...document.querySelectorAll('[data-chart-item]')].map(n=>({tag:n.tagName,key:n.dataset.chartItem,tab:n.tabIndex})),tooltip:document.querySelector('.rich-chart-tooltip')?.textContent})).catch(()=>({})),null,2));throw error;}finally{await browser.close();await fs.rm(tmp,{recursive:true,force:true});}
