import { testModuleSpecifier } from './esm-module-specifier.mjs';
// End-to-end synthetic archive rendering, source copying and offline safety.
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('..',import.meta.url)),tmp=await mkdtemp(path.join(os.tmpdir(),'reader-grok-rendering-'));
const {chromium,_electron}=await import(testModuleSpecifier(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright'));
await build({stdin:{contents:'import {ConversationRenderer} from "./src/reader/renderer.js";import "./src/reader/reader.css";import "./src/reader/rich-layout.css";import "./src/reader/rich-charts.css";import "./src/reader/grok-renderer.css";window.ConversationRenderer=ConversationRenderer;',resolveDir:root},outfile:path.join(tmp,'test.js'),bundle:true,format:'iife',platform:'browser',logLevel:'silent'});
const csp=(await readFile(path.join(root,'index.html'),'utf8')).match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)[0];
await writeFile(path.join(tmp,'index.html'),'<!doctype html><html><head><meta charset="utf-8">'+csp+'<link rel="stylesheet" href="test.css"></head><body><div class="reader-view"><main id="host" class="conversation-content"></main></div><script src="test.js"></script></body></html>');
await writeFile(path.join(tmp,'main.cjs'),`const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({width:680,height:540,show:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});w.loadFile(${JSON.stringify(path.join(tmp,'index.html'))});});`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
let browser;
if(process.env.READER_ELECTRON){
 const app=await _electron.launch({executablePath:process.env.READER_ELECTRON,args:['--no-sandbox','--disable-gpu',...(process.env.READER_HEADLESS==='1'?['--ozone-platform=headless','--ozone-override-screen-size=1920,1080']:[]),path.join(tmp,'main.cjs')],env,timeout:45000});
 browser={newPage:()=>app.firstWindow(),version:()=>app.evaluate(()=>process.versions.electron),close:()=>app.close()};
}else browser=await chromium.launch({headless:true,...(process.env.READER_CHROMIUM?{executablePath:process.env.READER_CHROMIUM}:{}),args:['--no-sandbox']});
const citation='<grok:render card_id="source" card_type="citation_card" type="render_inline_citation"><argument name="citation_id">0</argument></grok:render>';
const image='<grok:render card_id="image" card_type="image_card" type="render_searched_image"><argument name="caption">A saved image</argument></grok:render>';
const types=['images_card','generated_image_card','generated_video_card','generated_audio_card','media_variant_card','rendered_file_card','visualization_card','places_card','weather_card','sports_card','finance_card','x_posts_card','x_users_card','mcp_app_card','ui_card','ask_user_question_card','request_permission_card','request_connector_auth_card','location_request_card','checkout_form_card','automation_card','safety_warning'];
const chart={type:'bar',data:{labels:['A','B'],datasets:[{label:'Measured',data:[-3,7]}]}};
const code='<script>window.grokUnsafe=true;fetch("https://evil.test/injected")</script>';
const artifact='<xaiArtifact artifact_id="a" title="Saved HTML" contentType="text/html">'+code+'</xaiArtifact>';
const source=['Resolved '+citation,'Unresolved '+citation.replace('card_id="source"','card_id="missing"'),'Unsafe '+citation.replace('card_id="source"','card_id="unsafe"'),image,'<grok:render card_id="chart" card_type="chart_card"></grok:render>',...types.map(type=>`<grok type="render_card" id="${type}" />`),artifact,'Literal code:\n\n```xml\n'+citation+'\n```','```chartjs\n'+JSON.stringify(chart)+'\n```','```xaitask\n{"name":"Saved task","prompt":"Never run","cadence":"daily"}\n```'].join('\n\n');
const context={grokCards:{source:{id:'source',cardType:'citation_card',url:'https://www.example.org/reference',title:'Actual source'},unsafe:{id:'unsafe',cardType:'citation_card',url:'javascript:window.grokUnsafe=true'},image:{id:'image',cardType:'image_card',image:{original:'https://images.example.org/image.png',title:'Saved image'}},chart:{id:'chart',cardType:'chart_card',config:chart}}};
for(const type of types)context.grokCards[type]={id:type,cardType:type,title:'Saved '+type,text:'Archived data',html:code,url:type==='rendered_file_card'?'https://example.org/file.txt':'javascript:bad()'};
const requests=[],errors=[];
try {
 const page=await browser.newPage();if(!process.env.READER_ELECTRON)await page.goto(pathToFileURL(path.join(tmp,'index.html')).href);await page.waitForFunction(()=>!!window.ConversationRenderer);page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});

 await page.addStyleTag({content:'html,body{margin:0;width:100%;height:100%;overflow:hidden}body{font:15px sans-serif}#host{height:100%;overflow:auto;box-sizing:border-box;padding:12px;--text-primary:#222;--text-secondary:#555;--bg-primary:#fff;--bg-secondary:#eee;--border-color:#888;--text-accent:#12628b}.message{max-width:100%;min-width:0}.message-content{min-width:0}.dark #host{color:#eee;background:#151719;--text-primary:#eee;--text-secondary:#ccc;--bg-primary:#151719;--bg-secondary:#25282c}'});

 const results=[];
 for(const dark of [false,true])for(const width of [680,1100]) {
  await page.setViewportSize({width,height:540});
  const result=await page.evaluate(({source,context,dark})=>{
   document.body.classList.toggle('dark',dark);window.copied=[];window.desktop={capabilities:{clipboardWrite:true},invoke:async(name,arg)=>{if(name==='clipboard.write')copied.push(arg.text);}};
   const host=document.getElementById('host');window.renderer?.destroy?.();window.renderer=new ConversationRenderer(host);renderer.setRemoteImages('click');renderer.renderMessages([{message_id:'grok',role:'assistant',content:source,richContext:context}]);
   const article=host.querySelector('.message');return {familyCount:host.querySelectorAll('.grok-card').length,types:[...host.querySelectorAll('.grok-card')].map(n=>n.dataset.grokFamily),resolved:host.querySelector('.grok-citation a')?.href,unresolved:host.querySelectorAll('.grok-citation .rich-citation-unresolved').length,icons:host.querySelectorAll('svg.grok-icon').length,sourceExact:article?.sourceText===source,charts:host.querySelectorAll('.rich-chart:not(.rich-chart-fallback)').length,unsafe:!!window.grokUnsafe||!!host.querySelector('script,iframe,object,embed')||[...host.querySelectorAll('a')].some(n=>/^(javascript|file|data):/i.test(n.getAttribute('href')||'')),hasRawCode:[...host.querySelectorAll('code')].some(n=>n.textContent.includes('<script>window.grokUnsafe')),literalCode:[...host.querySelectorAll('code')].some(n=>n.textContent===source.split('```xml\n')[1].split('\n```')[0]),deferredImages:host.querySelectorAll('.reader-markdown-image[data-image-state="deferred"]').length,imgSources:[...host.querySelectorAll('img')].filter(n=>n.hasAttribute('src')).length,overflow:host.scrollWidth>host.clientWidth,markerLeak:/TS(?:RICH|GROK)[a-f0-9]{32}END/.test(host.innerHTML)};
  },{source,context,dark});
  assert.equal(result.resolved,'https://www.example.org/reference');assert.equal(result.unresolved,2);assert.equal(result.sourceExact,true);assert.equal(result.unsafe,false);assert.equal(result.hasRawCode,true);assert.equal(result.literalCode,true);assert.equal(result.deferredImages,1);assert.equal(result.imgSources,0);assert.equal(result.overflow,false);assert.equal(result.markerLeak,false);assert.ok(result.charts>=1);assert.ok(result.icons>=28);for(const type of types)assert.ok(result.types.includes(type),type);
  await page.locator('[data-copy-message]').first().click();assert.equal((await page.evaluate(()=>copied)).at(-1),source);
  results.push({dark,width,...result});
 }
 // Source inspection is keyboard-operable and retains the complete saved text.
 const detail=page.locator('.grok-source').filter({has:page.locator('code',{hasText:'<script>window.grokUnsafe'})}).first();await detail.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await detail.getAttribute('open'),'');
 // The existing code controls enhance generated source panels as well: copy
 // the original inner code, never JSON reformatted for a preview.
 const codePanels=page.locator('.grok-source').filter({has:page.locator('summary',{hasText:'Original code'})});
 assert.equal(await codePanels.count(),2);
 for(const [i,expected]of [JSON.stringify(chart),'{"name":"Saved task","prompt":"Never run","cadence":"daily"}'].entries()) {
  const panel=codePanels.nth(i);await panel.locator('summary').click();await panel.locator('.code-copy-button').click();assert.equal(await page.evaluate(()=>copied.at(-1)),expected);
 }
 const artifactBlock=page.locator('.grok-card[data-grok-family="artifact"] > pre');await artifactBlock.locator('.code-copy-button').click();assert.equal(await page.evaluate(()=>copied.at(-1)),code);
 // Repetition must not amplify a saved metadata object into unbounded DOM.
 const amplification=await page.evaluate(()=>{
  const saved='x'.repeat(60000),marker='<grok type="render_card" id="large" />',source=Array(128).fill(marker).join('\n\n');
  renderer.renderMessages([{role:'assistant',content:source,richContext:{grokCards:{large:{id:'large',cardType:'ui_card',text:saved}}}}]);
  const host=document.getElementById('host');return {length:host.innerHTML.length,limited:host.textContent.includes('Component exceeds display limits'),sourceExact:host.querySelector('.message').sourceText===source};
 });assert.ok(amplification.length<2500000);assert.equal(amplification.limited,true);assert.equal(amplification.sourceExact,true);
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 console.log(JSON.stringify({ok:true,passed:true,engine:await browser.version(),views:results.length,networkRequests:0,pageErrors:0,results},null,2));
}finally{await browser.close();await rm(tmp,{recursive:true,force:true});}
