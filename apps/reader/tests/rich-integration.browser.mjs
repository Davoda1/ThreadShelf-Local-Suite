#!/usr/bin/env node
// Actual ReaderView + ApplicationService + optional real Analytics Rev4 capture.
// Browser component harness: no privileged bridge or mocked storage dependencies.
// All displayed/exported test content is synthetic, not user conversation data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {ApplicationService} from '../src/core/service.mjs';
import {UI_PALETTES,CODE_THEMES} from '../src/core/themes.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'reader-rich-browser-'));
const evidence=process.env.READER_EVIDENCE||path.join(root,'docs/evidence/v3.2.0/rich-browser');
await fs.mkdir(evidence,{recursive:true});
const screenshots=process.env.READER_SCREENSHOTS||path.join(tmp,'screenshots');await fs.mkdir(screenshots,{recursive:true});
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const syntheticChart={chartType:'bar',meta:{title:'Synthetic exact values',description:'Reader-owned test fixture using observed bar fields',footer:'Offline synthetic data'},xKey:'Category',series:[{dataKey:'value',label:'Measurement',valueSuffix:' units'}],data:[{Category:'Alpha',value:0},{Category:'Beta',value:-3.125},{Category:'Gamma source category whose full label includes zzHiddenTableNeedle',value:4.875}],yAxisMin:-5,yAxisMax:6};
const inertBinding='<img src="https://example.invalid/do-not-load.svg" onerror="window.__attack=3"> **inert binding** {window.desktop}';
const indentedLoop="<box>\n  <grid columns={4}>\n    {#each [{s:\"A\",t:\"First\"},{s:\"B\",t:\"Second\"},{s:\"C\",t:\"Third\"},{s:\"D\",t:\"Fourth\"}] as item,i}\n      <grid-item>\n        <box align=\"center\" gap={2}>\n          <box height=\"70px\" align=\"center\" justify=\"center\">\n            <title>{item.s}</title>\n          </box>\n          <caption>{item.t}</caption>\n          {#if i < 3}\n            <icon name=\"arrow-right\" color=\"tertiary\"/>\n          {/if}\n        </box>\n      </grid-item>\n    {/each}\n  </grid>\n</box>\n";
const answer='Before graphic **Markdown**.\n\n<box gap={12}><title>Synthetic card</title><text>Markdown **inside** the component.</text><Entity category="software" value="Synthetic Reader" /><Chart content={'+JSON.stringify(syntheticChart)+'} /></box>\n\n<box>{#each [{t:'+JSON.stringify(inertBinding)+'}] as item,i}<text>{item.t}</text>{/each}</box>\n\n'+indentedLoop+'\n\nAfter graphic.\n\n| Preserved category | Exact value |\n| --- | --- |\n| Alpha | 0 |\n| Beta | -3.125 |\n\n1 USD = 315.68 HUF (historical snapshot; not a live rate).\n\n[Interactive visualization not included in this export.]\n\n```html\n<box>literal code</box>\n```\n\nInline `<Chart content={null} />` remains code.\n\n$x^2 + 1$\n\n<script>window.__attack=1</script>\n<box onclick="window.__attack=2"><text>Rejected event handler</text></box>\n\n'+Array.from({length:12},(_,i)=>`Synthetic body paragraph ${i}. These words verify stable message anchors through resizing and theme changes.`).join('\n\n');
const dataDir=path.join(tmp,'Reader-profile');let service=await new ApplicationService({dataDir}).init();
const imported=await service.commitMutation(service.store.prepareUpsert({provider:'openai',collection:'Synthetic',sourceFile:'/synthetic/rich.json',conversationKey:'synthetic-rich-browser',title:'Synthetic rendering compatibility',raw:{synthetic:true},turns:[{user:'Show synthetic exact data',turn_index:2},{ai:answer,turn_index:8},{user:'Later prompt',turn_index:21},{ai:'Final unchanged message',turn_index:34}]}));
const thread=await service.handle('thread',{mode:'local',id:imported.summary.id});
const original={thread:hash(thread),passages:hash(service.store.passages()),revision:service.store.searchRevision()};
const analyticsSource=process.env.ANALYTICS_SOURCE;let captureReader,normalizeConversations,buildReport;
if(analyticsSource){({captureReader}=await import(pathToFileURL(path.join(analyticsSource,'src/core/reader-capture.mjs'))));({normalizeConversations}=await import(pathToFileURL(path.join(analyticsSource,'src/core/adapters.mjs'))));({buildReport}=await import(pathToFileURL(path.join(analyticsSource,'src/core/metrics.mjs'))));}
const audit=[];
const capture=async()=>{if(!captureReader)return null;const c=await captureReader(dataDir,{workspace:path.join(tmp,'Analytics-workspace'),onAccess:a=>audit.push(a)});return {content:hash(c.conversations),report:hash(buildReport(normalizeConversations(c.conversations,{sourceId:c.sourceId}).conversations,{timeZone:'UTC',range:'all'},{now:Date.UTC(2026,9,13)}))};};
const analyticsBefore=await capture();
async function sourceHashes(){const out={};for(const name of ['reader.js','renderer.js','locale.js','rich-parser.js','rich-renderer.js','rich-layout.css','rich-charts.js','rich-chart-interactions.js','rich-charts.css','rich-context.js'])out['src/reader/'+name]=createHash('sha256').update(await fs.readFile(path.join(root,'src/reader',name))).digest('hex');return out;}
const sourceFingerprints=await sourceHashes();
await fs.cp(path.join(root,'public'),path.join(tmp,'web'),{recursive:true});
await build({stdin:{contents:`import {ReaderView} from ${JSON.stringify(path.join(root,'src/reader/reader.js'))};import {applyAppearance} from ${JSON.stringify(path.join(root,'src/ui/appearance.js'))};import {translator} from ${JSON.stringify(path.join(root,'src/ui/i18n.js'))};import ${JSON.stringify(path.join(root,'src/ui/style.css'))};import ${JSON.stringify(path.join(root,'src/ui/themes.css'))};import ${JSON.stringify(path.join(root,'src/ui/code-themes.css'))};import ${JSON.stringify(path.join(root,'src/ui/glassy.css'))};window.ReaderView=ReaderView;window.applyAppearance=applyAppearance;window.translator=translator;`,resolveDir:root},outfile:path.join(tmp,'web/test.js'),bundle:true,format:'iife',platform:'browser',loader:{'.woff2':'file'},logLevel:'silent'});
await fs.writeFile(path.join(tmp,'web/index.html'),'<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="test.css"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}#readerHost{height:100vh;width:100%;}</style></head><body><div id="readerHost"></div><script src="test.js"></script></body></html>');
const playwright=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');
let electronApp,browser,page;
if(process.env.READER_ELECTRON){
 await fs.writeFile(path.join(tmp,'main.cjs'),`const {app,BrowserWindow,session}=require('electron');app.setPath('userData',${JSON.stringify(path.join(tmp,'Electron-profile'))});app.whenReady().then(()=>{session.defaultSession.setPermissionRequestHandler((_w,_p,callback)=>callback(false));const w=new BrowserWindow({width:680,height:540,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});w.loadURL('about:blank');});`);
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 electronApp=await playwright._electron.launch({executablePath:process.env.READER_ELECTRON,args:['--no-sandbox','--disable-gpu',path.join(tmp,'main.cjs')],env});
 page=await electronApp.firstWindow();await page.setViewportSize({width:680,height:540});await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});
 browser={close:()=>electronApp.close(),version:()=>electronApp.evaluate(()=>`Electron ${process.versions.electron}; Chromium ${process.versions.chrome}`)};
}else{
 browser=await playwright.chromium.launch({executablePath:process.env.READER_CHROMIUM,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 page=await browser.newPage({viewport:{width:680,height:540},colorScheme:'light',reducedMotion:'reduce'});
}
const errors=[],network=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async r=>{if(/^https?:/.test(r.request().url())){network.push(r.request().url());return r.abort();}return r.continue();});
try{
 await page.goto(pathToFileURL(path.join(tmp,'web/index.html')).href);
 await page.waitForFunction(()=>!!window.ReaderView);
 await page.evaluate(async thread=>{window.fixture=thread;window.original=JSON.stringify(thread);window.positionWrites=[];window.bookmarkWrites=[];window.external=[];window.reader=new ReaderView({container:document.getElementById('readerHost'),settings:{language:'en',theme:'light',compact:false,animations:false},onPosition:p=>positionWrites.push(p),onBookmark:p=>bookmarkWrites.push(p),onExternal:p=>external.push(p)});await reader.show(fixture,{key:thread.id});},thread);
 await page.waitForFunction(()=>document.querySelector('mjx-container'));
 assert.equal(await page.locator('.message').count(),4);
 assert.equal(await page.locator('.rich-chart svg').count(),1);
 assert.equal(await page.locator('.rich-grid-item').count(),4);assert.equal(await page.locator('.rich-icon').count(),3);assert.doesNotMatch(await page.locator('#readerHost').innerText(),/TSRICH(?:CHILD)?[a-f0-9]{32}END/);
 assert.equal(await page.locator('.message-content pre code').count(),1);
 assert.equal(await page.evaluate(()=>window.__attack),undefined);
 assert.equal(await page.locator('.message-content img').count(),0);
 const binding=await page.locator('.rich-text').evaluateAll((nodes,inert)=>nodes.filter(n=>n.textContent.trim()===inert).map(n=>({text:n.textContent.trim(),children:n.children.length})),inertBinding);assert.deepEqual(binding,[{text:inertBinding,children:0}]);
 const visibleText=await page.locator('.message[data-turn-index="8"]').innerText();for(const phrase of ['Before graphic','Markdown inside','After graphic','[Interactive visualization not included in this export.]'])assert.ok(visibleText.includes(phrase));
 assert.deepEqual(await page.evaluate(()=>({node:typeof require,bridge:typeof window.desktop})),{node:'undefined',bridge:'undefined'});
 assert.equal(await page.evaluate(()=>JSON.stringify(fixture)===original),true);
 assert.equal(await page.locator('.message[data-turn-index="8"]').evaluate(n=>n.sourceText),answer);
 if(electronApp){await electronApp.evaluate(({clipboard})=>clipboard.writeText('synthetic sentinel'));await page.locator('.message[data-turn-index="8"] [data-copy-message]').click();for(let attempt=0;attempt<60;attempt++){if(await electronApp.evaluate(({clipboard})=>clipboard.readText())===answer)break;await page.waitForTimeout(25);}assert.equal(await electronApp.evaluate(({clipboard})=>clipboard.readText()),answer,'whole-message rich Copy must write original exact Markdown to real OS clipboard');}
 assert.ok((await page.locator('.message[data-turn-index="8"]').innerText()).includes('1 USD = 315.68 HUF'));
 await page.locator('.rich-chart-data summary').click();
 assert.ok((await page.locator('.rich-chart-data').innerText()).includes('-3.125'));
 assert.ok((await page.locator('.rich-chart-data').innerText()).includes('4.875'));
 const mark=page.locator('.rich-chart-mark').nth(1);await mark.focus();assert.equal(await mark.evaluate(n=>document.activeElement===n),true);assert.match(await mark.getAttribute('aria-label'),/-3.125/);
 await page.evaluate(()=>{const node=document.querySelector('.message-content');const sel=getSelection(),range=document.createRange();range.selectNodeContents(node);sel.removeAllRanges();sel.addRange(range);});assert.ok((await page.evaluate(()=>getSelection().toString())).length>5);
 await page.evaluate(()=>getSelection().removeAllRanges());
 const locales=['en','hu','de','fr','ja'];
 for(const palette of UI_PALETTES)for(const theme of ['light','dark'])for(const language of locales){
  await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
  await page.evaluate(({palette,theme,language})=>{const settings={uiPalette:palette,theme,language,animations:false,compact:false,fontSize:'large'};applyAppearance(settings);reader.t=translator(language);reader.setSettings(settings);}, {palette:palette.id,theme,language});
  const result=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,viewport:[innerWidth,innerHeight],messages:document.querySelectorAll('.message').length,charts:document.querySelectorAll('.rich-chart svg').length,unchanged:JSON.stringify(fixture)===original,chartRects:[...document.querySelectorAll('.rich-chart')].map(n=>({width:n.getBoundingClientRect().width,right:n.getBoundingClientRect().right}))}));
  assert.equal(result.messages,4);assert.equal(result.charts,1);assert.equal(result.unchanged,true);assert.ok(result.width<=result.viewport[0]+1&&result.height<=result.viewport[1]+1,JSON.stringify({palette:palette.id,theme,language,result}));assert.ok(result.chartRects.every(r=>r.right<=result.viewport[0]+1));
  checks.push({palette:palette.id,theme,language,viewport:[680,540]});
 }
 for(const size of [[680,1000],[1440,540],[1920,1080]]){await page.setViewportSize({width:size[0],height:size[1]});await page.evaluate(()=>{applyAppearance({uiPalette:'default',theme:'system',language:'en',highContrast:true,animations:false});reader.setSettings({theme:'system',language:'en',highContrast:true,fontSize:'xl'});reader.scrollToTurn(21,true);});assert.equal(await page.evaluate(()=>document.activeElement?.dataset.turnIndex),'21');const g=await page.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.scrollHeight]);assert.ok(g[0]<=size[0]+1&&g[1]<=size[1]+1);checks.push({viewport:size,systemTheme:true,highContrast:true,fontSize:'xl',anchor:21});}
 for(const codeTheme of CODE_THEMES){await page.evaluate(id=>applyAppearance({codeTheme:id,theme:'dark',uiPalette:'default'}),codeTheme.id);assert.equal(await page.locator('pre code').innerText(),'<box>literal code</box>');}
 await page.evaluate(()=>reader.find('zzHiddenTableNeedle'));assert.equal(await page.locator('.rich-chart-data[open] .highlight.current').count(),1);assert.equal(await page.locator('.rich-chart-data .highlight.current').isVisible(),true);
 await page.evaluate(()=>reader.find('After graphic'));assert.ok(await page.locator('.highlight').count());assert.equal(await page.locator('.message').count(),4);
 await page.evaluate(()=>reader.find(''));
 await page.setViewportSize({width:1000,height:760});await page.evaluate(()=>{applyAppearance({theme:'light',uiPalette:'default',language:'en'});reader.setSettings({language:'en',highContrast:false,fontSize:'normal'});reader.scrollToTurn(8,false);});
 await page.locator('.rich-chart').screenshot({path:path.join(screenshots,'synthetic-rich-light.png')});
 await page.evaluate(()=>{applyAppearance({theme:'dark',uiPalette:'smoked-glass',language:'ja'});reader.setSettings({language:'ja',theme:'dark'});});await page.locator('.rich-chart').screenshot({path:path.join(screenshots,'synthetic-rich-dark.png')});
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
 assert.equal(hash(await service.handle('thread',{mode:'local',id:thread.id})),original.thread);assert.equal(hash(service.store.passages()),original.passages);assert.equal(service.store.searchRevision(),original.revision);
 assert.deepEqual(await capture(),analyticsBefore);assert.ok(audit.every(a=>a.flags==='O_RDONLY'&&!/settings|reading|bookmarks|activity|cache/i.test(a.relative)));
 assert.deepEqual(await sourceHashes(),sourceFingerprints,'source changed during the test; rerun against a stable source tree');
 const report={synthetic:true,engine:await browser.version(),kind:'Production ReaderView browser component with real ApplicationService archive and optional actual Analytics Rev4 capture',checks,themeCount:UI_PALETTES.length,localeCount:locales.length,codeThemeCount:CODE_THEMES.length,externalRequests:network,pageErrors:errors,originalSourceHash:original.thread,analyticsBeforeAfter:analyticsBefore,analyticsReadOnlyAccesses:audit.length,realClipboardExactCopy:!!electronApp,sourceFingerprints,unchanged:true};
 await fs.writeFile(path.join(evidence,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await service.shutdown();await fs.rm(tmp,{recursive:true,force:true});}
