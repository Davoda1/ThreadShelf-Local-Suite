import { testModuleSpecifier } from './esm-module-specifier.mjs';
// Synthetic production-renderer integration; no real conversation data.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('..',import.meta.url));
const {chromium,_electron}=await import(testModuleSpecifier(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright'));
const tmp=await mkdtemp(path.join(os.tmpdir(),'reader-inline-html-'));
await build({stdin:{contents:'import {ConversationRenderer} from "./src/reader/renderer.js";import "./src/reader/reader.css";import "./src/reader/rich-layout.css";import "./src/reader/grok-renderer.css";window.ConversationRenderer=ConversationRenderer;',resolveDir:root},outfile:path.join(tmp,'test.js'),bundle:true,format:'iife',platform:'browser',logLevel:'silent'});
let browser;
if(process.env.READER_ELECTRON){
 await writeFile(path.join(tmp,'main.cjs'),`const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({show:true,width:1100,height:780,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});w.loadURL('about:blank');});`);
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({chromiumSandbox:true,executablePath:process.env.READER_ELECTRON,args:[path.join(tmp,'main.cjs')],env,timeout:45000});
 assert.equal(await app.evaluate(({app})=>app.commandLine.hasSwitch('no-sandbox')),false);
 browser={newPage:()=>app.firstWindow(),version:()=>app.evaluate(()=>process.versions.electron),close:()=>app.close()};
}else browser=await chromium.launch({headless:true,...(process.env.READER_CHROMIUM?{executablePath:process.env.READER_CHROMIUM}:{}),args:['--no-sandbox']});

const source=['<mark>Highlighted</mark> text and <span style="color:#e64340;background-color:#a8c0ff">colored</span> with ~~crossed out~~.','References.^1^^12^ Repeat.^1^','Inline `<mark>literal</mark> ^2^` and math $x^2^$.','```html\n<mark>literal code</mark> ^3^\n```','\\<mark>escaped\\</mark> and \\^4\\^.','<span style="color:red;position:fixed" onclick="window.PWNED=1">unsafe formatting</span>','<script>window.PWNED=1</script><iframe src="https://example.invalid/"></iframe><img src="https://example.invalid/x" onerror="window.PWNED=1">'].join('\n\n');
const errors=[],requests=[],results=[];
try {
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="host" class="reader-view conversation-content"></div></body></html>');
 await page.addStyleTag({content:await readFile(path.join(tmp,'test.css'),'utf8')});
 await page.addStyleTag({content:'html,body{margin:0;width:100%;height:100%;overflow:hidden}body{font:15px Arial}#host{box-sizing:border-box;padding:16px;height:100%;width:100%;overflow:auto;--text-primary:#202020;--text-secondary:#555;--bg-primary:#fff;--bg-secondary:#eee;--border-color:#888;--text-accent:#12628b}.message{max-width:100%;min-width:0}.message-content{min-width:0}html[data-theme="dark"] #host{--text-primary:#eee;--text-secondary:#ccc;--bg-primary:#111;--bg-secondary:#333;--border-color:#888;color:#eee;background:#111}'});
 await page.addScriptTag({path:path.join(tmp,'test.js')});
 for(const theme of ['light','dark'])for(const viewport of [{width:680,height:540},{width:1100,height:780}]) {
  await page.setViewportSize(viewport);
  const actual=await page.evaluate(({source,theme})=>{
   document.documentElement.dataset.theme=theme;window.previousRenderer?.destroy();const host=document.getElementById('host'),renderer=new ConversationRenderer(host);window.previousRenderer=renderer;renderer.setRemoteImages('click');
   host.replaceChildren(...['user','assistant'].map(role=>renderer.createMessageElement({message_id:role,role,content:source})));
   return {messages:[...host.children].map(n=>n.sourceText),marks:[...host.querySelectorAll('mark')].map(n=>n.textContent),colors:[...host.querySelectorAll('span[style]')].map(n=>[n.textContent,n.style.color,n.style.backgroundColor]).filter(a=>a[0]==='colored'),crossed:[...host.querySelectorAll('del')].map(n=>n.textContent),citations:[...host.querySelectorAll('.venice-citation')].map(n=>n.textContent),codes:[...host.querySelectorAll('code')].map(n=>n.textContent),active:host.querySelectorAll('script,iframe,object,embed,img[src],[onclick],[onerror],[style*="position:fixed"]').length,pwned:!!window.PWNED,overflow:host.scrollWidth>host.clientWidth,citationHeight:host.querySelector('.venice-citation')?.getBoundingClientRect().height};
  },{source,theme});
  assert.deepEqual(actual.messages,[source,source]);assert.deepEqual(actual.marks,['Highlighted','Highlighted']);assert.deepEqual(actual.colors,[['colored','rgb(230, 67, 64)','rgb(168, 192, 255)'],['colored','rgb(230, 67, 64)','rgb(168, 192, 255)']]);assert.deepEqual(actual.crossed,['crossed out','crossed out']);assert.deepEqual(actual.citations,['1','12','1','1','12','1']);assert.ok(actual.codes.includes('<mark>literal</mark> ^2^'));assert.ok(actual.codes.includes('<mark>literal code</mark> ^3^'));assert.equal(actual.active,0);assert.equal(actual.pwned,false);assert.equal(actual.overflow,false);assert.ok(actual.citationHeight>12);
  if(process.env.READER_SCREENSHOT_DIR){await mkdir(process.env.READER_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.READER_SCREENSHOT_DIR,`reader-inline-${theme}-${viewport.width}.png`),animations:'disabled'});}
  results.push({theme,viewport,styling:true,citations:true,sourceUnchanged:true,noActiveMarkup:true,noOverflow:true});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);console.log(JSON.stringify({passed:true,checks:results.length,pageErrors:0,networkRequests:0,results},null,2));
} finally {await browser.close();await rm(tmp,{recursive:true,force:true});}
