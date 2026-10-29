#!/usr/bin/env node
// Complete rendered-feature regression in the same Electron engine as the desktop.
// Synthetic conversations only. Requires READER_ELECTRON (or installed Electron), DISPLAY on Linux.
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,cp,readFile,rm,access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import {namedCodeFixtures} from './fixtures/code-highlighting.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const appRoot=process.env.READER_APP_ROOT?path.resolve(process.env.READER_APP_ROOT):root;
const componentRoot=process.env.READER_COMPONENT_ROOT?path.resolve(process.env.READER_COMPONENT_ROOT):appRoot;
const evidence=path.resolve(process.env.READER_EVIDENCE||path.join(root,'docs/evidence/v1.2.0'));await mkdir(evidence,{recursive:true});
const geometry=[];
const playwright = await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE || 'playwright');
const tmp = await mkdtemp(path.join(os.tmpdir(),'threadshelf-reader-ui-'));
// Installers carry these assets in dist; source checkouts carry them in public.
const assets=await access(path.join(appRoot,'public')).then(()=>path.join(appRoot,'public'),()=>path.join(appRoot,'dist'));
await cp(assets,tmp,{recursive:true});
await build({stdin:{contents:`import {ReaderView} from ${JSON.stringify(path.join(componentRoot,'src/reader/reader.js'))}; window.ReaderView=ReaderView;`,resolveDir:root},outfile:path.join(tmp,'test.js'),bundle:true,format:'iife',platform:'browser',logLevel:'silent'});
await writeFile(path.join(tmp,'index.html'),`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><link rel="stylesheet" href="./test.css"><style>html,body{margin:0;height:100%;overflow:hidden;font-family:Arial}#readerHost{height:100vh;width:100%;--bg:#f6f8fc;--panel:#fff;--subtle:#eef2f7;--text:#263446;--muted:#667489;--border:#dbe1e8;--accent:#31678a}</style></head><body><div id="readerHost"></div><script src="./test.js"></script></body></html>`);
// require('electron') resolves to an executable path outside Electron. Within Electron use its built-in module.
await writeFile(path.join(tmp,'main.cjs'),`const {app,BrowserWindow,session}=require('electron');global.deniedClipboardPermissions=0; app.whenReady().then(()=>{session.defaultSession.setPermissionRequestHandler((_web,_permission,callback)=>{global.deniedClipboardPermissions++;callback(false)});const w=new BrowserWindow({width:1000,height:800,show:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});w.loadFile(${JSON.stringify(path.join(tmp,'index.html'))});});`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await playwright._electron.launch({executablePath:process.env.READER_ELECTRON || path.join(root,'node_modules/electron/dist/electron'),args:['--no-sandbox','--disable-gpu',path.join(tmp,'main.cjs')],env,timeout:30000});
const page=await app.firstWindow();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const passed=[];let realClipboardCopies=0;
async function realCopy(button,expected){
 await app.evaluate(({clipboard})=>clipboard.writeText('clipboard sentinel: untouched'));
 await button.click();
 for(let i=0;i<60;i++){if(await app.evaluate(({clipboard})=>clipboard.readText())===expected){assert.equal(await button.evaluate(el=>document.activeElement===el),true,'Fallback restores focus to clicked copy control');realClipboardCopies++;return;}await page.waitForTimeout(25);}
 assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()),expected,'Actual OS clipboard contents');
}

try {
 await page.waitForFunction(()=>!!window.ReaderView);
 await page.evaluate(async()=>{
  window.positions=[];window.bookmarkWrites=[];window.external=[];
  window.reader = new ReaderView({container:document.getElementById('readerHost'),settings:{language:'en',compact:true,animations:false},onPosition:p=>positions.push(p),onBookmark:b=>bookmarkWrites.push(b),onExternal:url=>external.push(url)});
  const code='```ada\nwith Ada.Text_IO; procedure Hello is begin null; end Hello;\n```\n';
  window.fixture={id:'fixture',title:'Renderer regression',turns:[
   {user:'First prompt\n'+Array.from({length:30},(_,i)=>`Line ${i}: ${i===25?'hiddenneedle':'synthetic content'}`).join('\n'),turn_index:10},
   {user:'',turn_index:40},
   {thinking:'reasonneedle must expand for search\n'+('Analysis\n'.repeat(20)),turn_index:55},
   {ai:'# Answer\n\n| Name | Value |\n| --- | --- |\n| A | 1 |\n\n'+code+'\nInline $x^2$ and display:\n$$\\frac{a}{b} = \\sqrt{c}$$\n\n```mermaid\nflowchart TD\n A[Start] --> B[Finish]\n```\n\n```mermaid\ngraph LR\n A[Vendor Feeds (nginx, Node.js, PHP, DB)] --> B[Done]\n```\n\n[External](https://example.com/)\n<script>window.pwned=true</script>',turn_index:55},
   {ai:'Tool stdout: intact',source_role:'tool',turn_index:90},
   {user:'Second prompt',turn_index:100},
   {ai:'Second answer',turn_index:110},
  ]};
  await reader.show(fixture,{key:'local:test'});
 });
 await page.waitForFunction(()=>document.querySelectorAll('.mermaid-block[data-mermaid-state="rendered"]').length===1&&document.querySelectorAll('.mermaid-block[data-mermaid-state="repaired"]').length===1);
 await page.waitForFunction(()=>document.querySelectorAll('mjx-container').length>=2);
 const math=await page.locator('mjx-container').evaluateAll(nodes=>nodes.map(n=>{const a=n.querySelector('mjx-assistive-mml'),s=a&&getComputedStyle(a);return {svgs:n.querySelectorAll(':scope > svg').length,svgHidden:n.querySelector(':scope > svg')?.getAttribute('aria-hidden'),hasMath:!!a?.querySelector('math'),position:s?.position,clip:s?.clip,overflow:s?.overflow,visibility:s?.visibility,assistiveHidden:a?.getAttribute('aria-hidden')};}));
 for(const m of math){assert.equal(m.svgs,1);assert.equal(m.svgHidden,'true');assert.equal(m.hasMath,true);assert.equal(m.position,'absolute');assert.equal(m.overflow,'hidden');assert.notEqual(m.clip,'auto');assert.notEqual(m.visibility,'hidden');assert.notEqual(m.assistiveHidden,'true');}
 passed.push('Math renders once visually while preserving visually clipped assistive MathML for accessibility');
 assert.equal(await page.locator('.message').count(),6);
 assert.equal(await page.locator('.message-content table').count(),1);
 assert.ok(await page.locator('.language-ada .hljs-keyword').count());
 assert.equal(await page.locator('.message.tool .message-role').textContent(),'Tool');
 assert.equal(await page.evaluate(()=>window.pwned),undefined);
 assert.equal(await page.locator('script').count(),6); // test bundle, local font/compatibility, MathJax, assistive MathML and Mermaid
 passed.push('Markdown/table, full grammar highlighting, math, tool roles, inert archived HTML');
 assert.equal(await page.locator('.message.user').first().getAttribute('class'),'message user is-long-prompt is-prompt-collapsed');
 assert.ok((await page.locator('.message.thinking').getAttribute('class')).includes('is-reasoning-collapsed'));
 await page.evaluate(()=>reader.find('hiddenneedle'));
 assert.ok((await page.locator('.message.user').first().getAttribute('class')).includes('is-message-expanded'));
 await page.evaluate(()=>reader.find('reasonneedle'));
 assert.ok((await page.locator('.message.thinking').getAttribute('class')).includes('is-message-expanded'));
 passed.push('15-line user collapse, reasoning collapse, automatic reveal of hidden search hits');
 await page.evaluate(()=>reader.find('Ada.Text_IO'));
 assert.equal(await page.locator('.language-ada .highlight').count(),1);
 assert.ok((await page.locator('.language-ada').last().getAttribute('data-original-code')).includes('with Ada.Text_IO'));
 await realCopy(page.locator('pre:has(code.language-ada) .code-copy-button'),'with Ada.Text_IO; procedure Hello is begin null; end Hello;');
 passed.push('Code search preserves original copy source');
 await page.waitForFunction(()=>document.querySelector('.mermaid-block[data-mermaid-state="repaired"]'));
 const repaired=page.locator('.mermaid-block').nth(1);
 await realCopy(page.locator('.mermaid-block').first().locator('[data-copy-mermaid]'),'flowchart TD\n A[Start] --> B[Finish]');
 const repairedSource=await repaired.evaluate(el=>el.mermaidRepairSource);assert.notEqual(repairedSource,'graph LR\n A[Vendor Feeds (nginx, Node.js, PHP, DB)] --> B[Done]');
 await realCopy(repaired.locator('[data-copy-mermaid]'),repairedSource);
 await repaired.locator('.mermaid-version-toggle').click();
 assert.equal(await repaired.getAttribute('data-mermaid-state'),'original-error');
 await realCopy(repaired.locator('[data-copy-mermaid]'),'graph LR\n A[Vendor Feeds (nginx, Node.js, PHP, DB)] --> B[Done]');
 assert.ok((await repaired.locator('.mermaid-error-source').textContent()).includes('A[Vendor Feeds (nginx'));
 await repaired.locator('.mermaid-version-toggle').click();
 await page.waitForFunction(()=>document.querySelectorAll('.mermaid-block')[1].dataset.mermaidState==='repaired');
 passed.push('Mermaid original/repaired toggle and unmodified source fallback');
 await page.evaluate(()=>reader.start());
 await page.locator('#navigatorTrigger').hover();
 assert.equal(await page.locator('#navigatorTrigger').getAttribute('aria-expanded'),'true');
 await page.locator('#navigatorEntries .navigator-entry[data-turn-index="100"]').click();
 await page.waitForTimeout(200);
 assert.equal(await page.locator('#navigatorTrigger').getAttribute('aria-expanded'),'false');
 assert.equal(await page.evaluate(()=>document.activeElement.dataset.turnIndex),'100');
 passed.push('Navigator hover, precise source-index targeting, focus, close');
 await page.locator('.message[data-turn-index="100"] .bookmark-message').click();
 assert.deepEqual(await page.evaluate(()=>({index:bookmarkWrites[0].turnIndex,role:bookmarkWrites[0].role})),{index:100,role:'user'});
 await page.locator('.message[data-turn-index="100"] .bookmark-message').click();
 assert.equal(await page.evaluate(()=>bookmarkWrites[1].remove),true);
 passed.push('Bookmark add/remove exact identity');
 await page.locator('a[href="https://example.com/"]').click();
 assert.deepEqual(await page.evaluate(()=>external),['https://example.com/']);
 for(const [language,copy] of [['hu','Üzenet másolása'],['de','Nachricht kopieren'],['fr','Copier le message']]) {
   await page.evaluate(language=>reader.setSettings({language}),language);
   assert.equal(await page.locator('.message-copy-button').first().textContent(),copy);
 }
 passed.push('External-link delegation and Hungarian/German/French renderer controls');
 await page.evaluate(async()=>{
  reader.setSettings({language:'en'});
  await reader.show({id:'large',title:'Anchors',turns:Array.from({length:45},(_,i)=>({[i%2?'ai':'user']:'Synthetic paragraph. '.repeat(90),turn_index:i*13+10}))},{key:'local:anchor'});
  const c=reader.content,n=c.querySelector('[data-turn-index="270"]'),r=n.getBoundingClientRect();
  reader.position.interrupt();c.scrollTop=c.scrollTop+r.top-c.getBoundingClientRect().top+r.height*.37-16;
 });
 await page.waitForTimeout(600);
 const anchor=await page.evaluate(()=>reader.getPosition());
 await page.evaluate(()=>reader.container.style.width='720px');
 await page.waitForTimeout(200);
 const resized=await page.evaluate(()=>reader.getPosition());
 assert.equal(resized.turnIndex,anchor.turnIndex);assert.ok(Math.abs(resized.offset-anchor.offset)<.01);
 await page.evaluate(()=>reader.start());
 await page.evaluate(p=>reader.resume(p),anchor);
 await page.waitForTimeout(100);
 const resumed=await page.evaluate(()=>reader.getPosition());assert.equal(resumed.turnIndex,anchor.turnIndex);assert.ok(Math.abs(resumed.offset-anchor.offset)<.01);
 passed.push('Relative reading anchor survives reflow and explicit resume');
 await page.evaluate(async()=>{reader.container.style.width='100%';await reader.show(fixture,{key:'geometry'});reader.start()});
 for(const width of [680,1080,1400]) {
  await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,740),width);await page.waitForTimeout(100);await page.evaluate(()=>reader.start());
  const layout=await page.evaluate(()=>{const c=reader.content,r=c.getBoundingClientRect(),user=c.querySelector('.message.user').getBoundingClientRect(),assistant=c.querySelector('.message.assistant').getBoundingClientRect(),thinking=c.querySelector('.message.thinking').getBoundingClientRect(),trigger=document.querySelector('#navigatorTrigger').getBoundingClientRect(),nav=document.querySelector('#conversationNavigator').getBoundingClientRect();const styles=getComputedStyle(c);return {width:innerWidth,content:r.toJSON(),scrollbarWidth:c.offsetWidth-c.clientWidth,trigger:trigger.toJSON(),nav:nav.toJSON(),user:user.toJSON(),assistant:assistant.toJSON(),thinking:thinking.toJSON(),track:getComputedStyle(c,'::-webkit-scrollbar-track').backgroundColor,thumb:getComputedStyle(c,'::-webkit-scrollbar-thumb').backgroundColor,scrollbarButtonDisplay:getComputedStyle(c,'::-webkit-scrollbar-button').display,scrollWidth:c.scrollWidth,clientWidth:c.clientWidth};});
  assert.ok(layout.scrollbarWidth>=11&&layout.scrollbarWidth<=13,'Themed scrollbar width');assert.equal(layout.scrollbarButtonDisplay,'none');assert.notEqual(layout.track,layout.thumb);
  const scrollbarLeft=layout.content.right-layout.scrollbarWidth;
  assert.ok(layout.trigger.right<=scrollbarLeft-9,'Navigator trigger does not cover scrollbar');assert.ok(layout.nav.right<=scrollbarLeft-9,'Navigator hit area does not cover scrollbar');
  assert.ok(layout.user.x-layout.assistant.x>=17&&layout.user.x-layout.assistant.x<=33,'User is subtly right of assistant');assert.ok(Math.abs(layout.thinking.x-layout.assistant.x)<1,'Thinking aligns with assistant');assert.ok(layout.assistant.x>=layout.content.x&&layout.user.right<scrollbarLeft,'Messages remain within reader');assert.ok(layout.scrollWidth<=layout.clientWidth,'Reader has no horizontal overflow');
  await page.locator('#navigatorTrigger').hover();const panel=await page.locator('#navigatorPanel').boundingBox();assert.ok(panel.x>=layout.content.x&&panel.x+panel.width<=scrollbarLeft-9,'Open navigator avoids scrollbar and stays in pane');
  await page.mouse.move(layout.content.x+5,layout.content.y+5);await page.screenshot({path:path.join(evidence,`Reader-Geometry-${width}.png`)});geometry.push(layout);
 }
 await page.evaluate(()=>{reader.position.interrupt();reader.content.scrollTop=0});
 const drag=await page.evaluate(()=>{const c=reader.content,r=c.getBoundingClientRect();return {x:r.right-6,y:r.top+8,targetY:r.top+r.height*.6,before:c.scrollTop};});
 await page.mouse.move(drag.x,drag.y);await page.mouse.down();await page.mouse.move(drag.x,drag.targetY,{steps:8});await page.mouse.up();await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>reader.content.scrollTop)>drag.before+30,'Scrollbar thumb is independently draggable');
 passed.push('Themed scrollbar is draggable and separate from navigator; user/right, assistant+thinking/left remain bounded at 680/1080/1400px');

 await page.evaluate(async()=>{await reader.show({id:'one',turns:[{user:'one'},{ai:'response'},{thinking:'reasoning'}]},{key:'one'})});
 assert.equal(await page.locator('#conversationNavigator').isVisible(),false);
 for(const width of [680,900,1400]) {
   await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,540),width);
   const overflow=await page.evaluate(()=>({w:document.documentElement.scrollWidth>innerWidth,h:document.documentElement.scrollHeight>innerHeight}));
   assert.deepEqual(overflow,{w:false,h:false});
 }
 passed.push('Single-prompt navigator hidden; desktop has no whole-window overflow at 680×540');
 await page.evaluate(async fixtures=>{
  window.codeSamples=fixtures;window.codeSource=fixtures.map(f=>'### '+f.fence+'\n\n```'+f.fence+'\n'+f.source+'\n```').join('\n\n');
  await reader.show({id:'highlighting',title:'All requested languages',turns:[{ai:codeSource,turn_index:10}]},{key:'highlighting'});
 },namedCodeFixtures);
 const blocks=page.locator('.message-content pre code');assert.equal(await blocks.count(),namedCodeFixtures.length);
 for(let i=0;i<namedCodeFixtures.length;i++){
  const fixture=namedCodeFixtures[i],block=blocks.nth(i);
  assert.equal(await block.getAttribute('data-language'),fixture.canonical,fixture.fence);
  for(const scope of fixture.scopes)assert.ok(await block.locator('.hljs-'+scope).count(),fixture.fence+': '+scope);
  assert.equal(await block.textContent(),fixture.source,fixture.fence+' source text');
  assert.equal(await block.getAttribute('data-original-code'),fixture.source,fixture.fence+' original copy text');
  await realCopy(page.locator('.message-content pre').nth(i).locator('.code-copy-button'),fixture.source);
 }
 await realCopy(page.locator('.message-copy-button'),await page.evaluate(()=>window.codeSource));
 await page.evaluate(async()=>{window.unicodeCopy='Árvíztűrő tükörfúrógép 🧪\n你好 — café\n  indented\ttext';await reader.show({id:'unicode',turns:[{user:unicodeCopy,turn_index:0},{ai:'```text\n'+unicodeCopy+'\n```',turn_index:1}]},{key:'unicode'})});
 await realCopy(page.locator('.message.user .message-copy-button'),await page.evaluate(()=>unicodeCopy));
 await realCopy(page.locator('.message-content pre .code-copy-button'),await page.evaluate(()=>unicodeCopy));
 passed.push('All 18 named-language fixtures render token spans and every code-copy button writes original text to the real OS clipboard; Unicode and original message Markdown preserved');
 assert.deepEqual(errors,[]);
 const deniedClipboardPermissions=await app.evaluate(()=>global.deniedClipboardPermissions);assert.ok(deniedClipboardPermissions>0,'Browser permission denial exercised the real user-gesture fallback');
 const report={appRoot,componentRoot,assets,passed,failed:0,geometry,realClipboardCopies,deniedClipboardPermissions,clipboardPath:'Browser clipboard API denied; actual user-gesture fallback verified with Electron clipboard.readText, no mocked writes',grammars:await page.evaluate(()=>hljs?.listLanguages?.().length || window.hljs.listLanguages().length)};await writeFile(path.join(evidence,'reader-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {await app.close();await rm(tmp,{recursive:true,force:true});}
