// Synthetic, offline regression for source-sized missing-image slots and citations.
// No private conversation text or source URLs are embedded in this test.
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('..',import.meta.url));
const {chromium}=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');
const tmp=await mkdtemp(path.join(os.tmpdir(),'reader-rich-content-r5-'));
await build({stdin:{contents:'import {ConversationRenderer} from "./src/reader/renderer.js";import {setRendererLocale} from "./src/reader/locale.js";import "./src/reader/reader.css";import "./src/reader/rich-layout.css";window.ConversationRenderer=ConversationRenderer;window.setRendererLocale=setRendererLocale;',resolveDir:root},outfile:path.join(tmp,'test.js'),bundle:true,format:'iife',platform:'browser',logLevel:'silent'});
const browser=await chromium.launch({headless:true,...(process.env.READER_CHROMIUM?{executablePath:process.env.READER_CHROMIUM}:{}),args:['--no-sandbox']});
const source=`<box gap={3}>
  <row align="center" gap={3}>
    <AsyncImage query="Saved product image query" aspectRatio="5:4" maxWidth="172px"/>
    <box flex="1" gap={1}>
      **<Entity category="product" value="Saved product" disambig="Recorded specification"/>**
      A subtitle and a descriptive paragraph beside the image.
    </box>
  </row>
  <divider/>
  <row align="start" gap={3}>
    <AsyncImage query="Saved historical aircraft query" aspectRatio="5:4" maxWidth="148px"/>
    <box flex="1" gap={1}>
      **<Entity category="vehicle" value="Saved aircraft"/> — Country**
      Description with an unresolved citation. <Cite refs={["turn12search3","turn45view6"]}/>
    </box>
  </row>
  <AsyncImage query="Saved full-width landscape query" aspectRatio="16:9" width="100%"/>
</box>

An explicitly bound reference <Cite ref="turn1search0"/> and an unsafe binding <Cite ref="turn2search0"/>.

\`<AsyncImage query="literal code" aspectRatio="5:4" maxWidth="148px"/>\``;
const context={references:{turn1search0:{url:'https://www.example.com/a',title:'A complete, long archived source title that remains accessible'},turn2search0:{url:'javascript:alert(1)',title:'Unsafe'}}};
const results=[],errors=[],requests=[];
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
 await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="host"></div></body></html>');
 await page.addStyleTag({content:await readFile(path.join(tmp,'test.css'),'utf8')});
 await page.addStyleTag({content:'html,body{margin:0;width:100%;height:100%;overflow:hidden}body{font-family:Arial;font-size:16px}#host{box-sizing:border-box;padding:16px;height:100%;width:100%;overflow:auto;--text-primary:#202020;--text-secondary:#555;--bg-primary:#fff;--bg-secondary:#eee;--border-color:#888;--text-accent:#12628b}html[data-theme="dark"] #host{--text-primary:#eee;--text-secondary:#ccc;--bg-primary:#111;--bg-secondary:#333;--border-color:#888;color:#eee;background:#111}.message{max-width:100%}'});
 await page.addScriptTag({path:path.join(tmp,'test.js')});
 for(const viewport of [{width:680,height:540},{width:1100,height:780}])for(const theme of ['light','dark'])for(const language of ['en','hu','de','fr','ja']){
  await page.setViewportSize(viewport);
  const result=await page.evaluate(({source,context,theme,language})=>{
   document.documentElement.dataset.theme=theme;setRendererLocale(language);
   const host=document.getElementById('host'),renderer=new ConversationRenderer(host),article=renderer.createMessageElement({message_id:'offline-card',role:'assistant',content:source,richContext:context});host.replaceChildren(article);
   const slots=[...host.querySelectorAll('.rich-image-placeholder')].map(n=>{const b=n.getBoundingClientRect();return {width:b.width,height:b.height,svg:!!n.querySelector('svg.rich-image-placeholder-icon'),query:n.getAttribute('aria-label'),title:n.title,role:n.getAttribute('role'),descriptionVisible:(()=>{const e=n.querySelector('.rich-image-description');return e?e.getBoundingClientRect().height>1:false})()};});
   const rows=[...host.querySelectorAll('.rich-row')].map(n=>{const children=[...n.children].map(c=>c.getBoundingClientRect());return children[1].left>=children[0].right;});
   const resolved=host.querySelector('.rich-citation-link'),unknown=[...host.querySelectorAll('.rich-citation-unresolved')].map(n=>({text:n.textContent,title:n.title,aria:n.getAttribute('aria-label')}));
   return {slots,rows,resolved:{text:resolved?.textContent,href:resolved?.getAttribute('href'),title:resolved?.title,aria:resolved?.getAttribute('aria-label')},unknown,entities:host.querySelectorAll('.rich-entity').length,imgs:host.querySelectorAll('img').length,links:host.querySelectorAll('.rich-citation a').length,overflow:host.scrollWidth>host.clientWidth,markers:/TSRICH(?:CHILD)?[a-f0-9]{32}END/.test(host.innerHTML),sourceExact:article.sourceText===source,code:host.querySelector('code')?.textContent};
  },{source,context,theme,language});
  assert.equal(result.slots.length,3);assert.equal(result.imgs,0);assert.equal(result.entities,2);assert.equal(result.links,1);assert.equal(result.overflow,false);assert.equal(result.markers,false);assert.equal(result.sourceExact,true);assert.deepEqual(result.rows,[true,true]);
  assert.ok(Math.abs(result.slots[0].width-172)<1);assert.ok(Math.abs(result.slots[1].width-148)<1);
  for(const [i,slot] of result.slots.entries()){assert.ok(slot.svg);assert.equal(slot.role,'img');assert.ok(Math.abs(slot.width/slot.height-(i===2?16/9:5/4))<.02);assert.match(slot.query,/Saved/);assert.equal(slot.query,slot.title);assert.equal(slot.descriptionVisible,false);}
  assert.equal(result.resolved.text,'example.com');assert.equal(result.resolved.href,'https://www.example.com/a');assert.match(result.resolved.title,/complete, long archived source/);assert.match(result.resolved.aria,/turn1search0/);
  assert.equal(result.unknown.length,2);assert.match(result.unknown[0].text,/\+1$/);assert.match(result.unknown[0].title,/turn12search3, turn45view6/);assert.equal(result.unknown[0].aria,result.unknown[0].title);assert.match(result.unknown[1].title,/turn2search0/);
  assert.equal(result.code,'<AsyncImage query="literal code" aspectRatio="5:4" maxWidth="148px"/>');
  results.push({viewport,theme,language,sourceSizedSvgPlaceholders:3,exactSource:true,noOverflow:true});
 }
 await page.emulateMedia({forcedColors:'active'});
 const forced=await page.locator('.rich-image-placeholder').evaluateAll(nodes=>nodes.map(n=>({border:getComputedStyle(n).borderTopColor,background:getComputedStyle(n).backgroundColor,width:n.getBoundingClientRect().width})));
 for(const slot of forced){assert.notEqual(slot.border,slot.background);assert.ok(slot.width>0);}
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 console.log(JSON.stringify({engine:await browser.version(),passed:results.length,forcedColors:true,networkRequests:0,pageErrors:0,results},null,2));
}finally{await browser.close();await rm(tmp,{recursive:true,force:true});}
