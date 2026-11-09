// Synthetic production-renderer integration; no real conversation data.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('..',import.meta.url));
const {chromium,_electron}=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');
const tmp=await mkdtemp(path.join(os.tmpdir(),'reader-chatgpt-grok-'));
await build({stdin:{contents:'import {ConversationRenderer} from "./src/reader/renderer.js";import "./src/reader/reader.css";import "./src/reader/rich-layout.css";import "./src/reader/grok-renderer.css";window.ConversationRenderer=ConversationRenderer;',resolveDir:root},outfile:path.join(tmp,'test.js'),bundle:true,format:'iife',platform:'browser',logLevel:'silent'});
let browser;
if(process.env.READER_ELECTRON){
 await writeFile(path.join(tmp,'main.cjs'),`const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({show:true,width:1100,height:780,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});w.loadURL('about:blank');});`);
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.READER_ELECTRON,args:['--no-sandbox','--disable-gpu','--ozone-platform=headless','--ozone-override-screen-size=1920,1080',path.join(tmp,'main.cjs')],env,timeout:45000});
 browser={newPage:()=>app.firstWindow(),version:()=>app.evaluate(()=>process.versions.electron),close:()=>app.close()};
}else browser=await chromium.launch({headless:true,...(process.env.READER_CHROMIUM?{executablePath:process.env.READER_CHROMIUM}:{}),args:['--no-sandbox']});
const grok='<grok:render card_id="source-1" card_type="citation_card" type="render_inline_citation"><argument name="citation_id">0</argument></grok:render>';
const image='<grok-card data-id="image-1" data-type="image_card" data-plain-type="render_searched_image"></grok-card>';
const literal='citeturn0search0 '+grok;
const source=[
 'Saved citation citeturn0search0 and fileciteturn2file0L12-L19.',
 'Missing source citeturn9search9.',
 'entity["company","<img src=x onerror=bad>","Saved identity"]',
 'navlistSaved source listturn0search0;Recorded source',
 'genui{"future_widget":{"title":"Archive label","html":"<script>window.bad=true</script>","action":"run"}}',
 'iturn0image0','constructorsaved',grok,image,
 '<box><text>Nested citeturn0search0 '+grok+'</text></box>',
 '`'+literal+'`', '```text\n'+literal+'\n```',
 '<grok:render card_id="unknown" card_type="new_card"><argument name="label">Saved future data</argument></grok:render>'
].join('\n\n');
const context={references:{turn0search0:{url:'https://example.com/source',title:'Saved source'},turn2file0:{filename:'Saved-report.pdf',title:'Saved-report.pdf',url:null}},grokCards:{'source-1':{id:'source-1',cardType:'citation_card',title:'Grok saved source',url:'https://example.org/grok'},'image-1':{id:'image-1',cardType:'image_card',image:{original:'https://example.org/saved.png',title:'Saved image'}}}};
const errors=[],requests=[],results=[];
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
 await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="host" class="reader-view conversation-content"></div></body></html>');
 await page.addStyleTag({content:await readFile(path.join(tmp,'test.css'),'utf8')});
 await page.addStyleTag({content:'html,body{margin:0;width:100%;height:100%;overflow:hidden}body{font:15px Arial}#host{box-sizing:border-box;padding:16px;height:100%;width:100%;overflow:auto;--text-primary:#202020;--text-secondary:#555;--bg-primary:#fff;--bg-secondary:#eee;--border-color:#888;--text-accent:#12628b}.message{max-width:100%;min-width:0}.message-content{min-width:0}html[data-theme="dark"] #host{--text-primary:#eee;--text-secondary:#ccc;--bg-primary:#111;--bg-secondary:#333;--border-color:#888;color:#eee;background:#111}'});
 await page.addScriptTag({path:path.join(tmp,'test.js')});
 for(const viewport of [{width:680,height:540},{width:1100,height:780}])for(const theme of ['light','dark']) {
  await page.setViewportSize(viewport);
  const result=await page.evaluate(({source,context,theme})=>{
   document.documentElement.dataset.theme=theme;const host=document.getElementById('host'),renderer=new ConversationRenderer(host);
   renderer.setRemoteImages('click');const article=renderer.createMessageElement({message_id:'new-rendering',role:'assistant',content:source,richContext:context});host.replaceChildren(article);
   return {sourceExact:article.sourceText===source,file:host.querySelector('.rich-file-reference')?.textContent,links:[...host.querySelectorAll('a')].map(a=>a.getAttribute('href')),unresolved:[...host.querySelectorAll('.rich-citation-unresolved')].map(n=>n.title),grok:host.querySelectorAll('.grok-citation').length,archived:host.querySelectorAll('.rich-archived-widget').length,prototypeLabel:host.querySelector('[data-archive-family="constructor"] .rich-passive-label')?.textContent,original:[...host.querySelectorAll('.rich-archive-source pre')].map(n=>n.textContent),entity:host.querySelector('.rich-entity')?.textContent,codes:[...host.querySelectorAll('code')].map(n=>n.textContent),images:host.querySelectorAll('img[src]').length,svg:host.querySelectorAll('svg').length,scripts:host.querySelectorAll('script,iframe,object,embed,[onerror],[onclick]').length,bad:!!window.bad,overflow:host.scrollWidth>host.clientWidth,wide:[...host.querySelectorAll('*')].filter(n=>n.getBoundingClientRect().right>host.getBoundingClientRect().right).map(n=>({tag:n.tagName,cls:n.className,right:n.getBoundingClientRect().right,width:n.getBoundingClientRect().width})).slice(0,12),markers:/TSRICH(?:CHILD)?[a-f0-9]{32}END/.test(host.innerHTML),html:host.innerHTML};
  },{source,context,theme});
  assert.equal(result.sourceExact,true);assert.match(result.file,/Saved-report.pdf/);assert.match(result.file,/L12-L19/);
  assert.ok(result.links.filter(v=>v==='https://example.com/source').length>=3);assert.ok(result.links.includes('https://example.org/grok'));
  assert.ok(result.links.every(v=>/^https?:/.test(v)));assert.ok(result.unresolved.some(v=>v.includes('turn9search9')));
  assert.equal(result.grok,2);assert.equal(result.archived,4);assert.equal(result.prototypeLabel,'Archived ChatGPT content');assert.ok(result.original.some(v=>v.includes('future_widget')));
  assert.equal(result.entity,'<img src=x onerror=bad>');assert.equal(result.codes.filter(v=>v===literal).length,2);
  assert.equal(result.scripts,0);assert.equal(result.bad,false);assert.equal(result.images,0);assert.ok(result.svg>0);assert.equal(result.overflow,false);assert.equal(result.markers,false);
  if(process.env.READER_SCREENSHOT_DIR){await mkdir(process.env.READER_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.READER_SCREENSHOT_DIR,`reader-compat-${theme}-${viewport.width}x${viewport.height}.png`),animations:'disabled'});}
  results.push({viewport,theme,sourceExact:true,inert:true,noOverflow:true});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 console.log(JSON.stringify({engine:await browser.version(),passed:true,checks:results.length,networkRequests:requests.length,pageErrors:errors.length,results},null,2));
}finally{await browser.close();await rm(tmp,{recursive:true,force:true});}
