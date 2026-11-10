'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const playwright=require(process.env.PLAYWRIGHT_PATH||'../../../tools/mermaid-bundle/node_modules/playwright-core');
const root=path.resolve(__dirname,'..');
const source=['<mark>Highlighted</mark> text and <span style="color:#e64340;background-color:#a8c0ff">colored</span> with ~~crossed out~~.','References.^1^^12^ Repeat.^1^','Inline `<mark>literal</mark> ^2^` and math $x^2^$.','```html\n<mark>literal code</mark> ^3^\n```','\\<mark>escaped\\</mark> and \\^4\\^.','<span style="color:red;position:fixed" onclick="window.PWNED=1">unsafe formatting</span>','<script>window.PWNED=1</script><iframe src="https://example.invalid/"></iframe><img src="https://example.invalid/x" onerror="window.PWNED=1">'].join('\n\n');
(async()=>{
 const browser=process.env.ELECTRON_PATH?await require('./html-preview-page.cjs')(playwright):await playwright.chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try {
  const page=await browser.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await page.goto(pathToFileURL(path.join(root,'test/empty.html')).href);
  const csp=fs.readFileSync(path.join(root,'renderer/index.html'),'utf8').match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)[0];
  await page.setContent('<!doctype html><html data-theme="light"><head>'+csp+'</head><body><main id="content"></main></body></html>');
  for(const f of ['vendor/marked.umd.js','vendor/highlight.bundle.js','vendor/reader-rich.js','renderer/message-visibility.js','renderer/json-response.js','renderer/file-citations.js','renderer/svg-preview.js','renderer/safe-html.js','renderer/venice-citations.js','renderer/content.js'])await page.addScriptTag({url:pathToFileURL(path.join(root,f)).href});
  for(const f of ['renderer/app.css','renderer/content.css','renderer/safe-html.css','renderer/rich-compat.css','renderer/code-themes.css'])await page.addStyleTag({path:path.join(root,f)});
  await page.addStyleTag({content:'html,body{height:100%;width:100%;margin:0;overflow:hidden}#content{box-sizing:border-box;height:100%;width:100%;overflow:auto;padding:14px}.tsa-message{max-width:100%}'});
  const results=[];
  for(const theme of ['light','dark'])for(const viewport of [{width:680,height:540},{width:1100,height:780}]){
   await page.setViewportSize(viewport);
   const actual=await page.evaluate(async({source,theme})=>{
    document.documentElement.dataset.theme=theme;window.cleanup?.();const host=document.getElementById('content');const rendered=TSAContent.renderThread({turns:[{user:source},{ai:source}]});host.innerHTML=rendered.html;window.copied=[];window.cleanup=TSAContent.bind(host,{copy:text=>copied.push(text),imageMode:'click'});await cleanup.ready;
    return {messages:rendered.messages.map(m=>m.content),marks:[...host.querySelectorAll('mark')].map(n=>n.textContent),colors:[...host.querySelectorAll('span[style]')].map(n=>[n.textContent,n.style.color,n.style.backgroundColor]),crossed:[...host.querySelectorAll('del')].map(n=>n.textContent),citations:[...host.querySelectorAll('.venice-citation')].map(n=>n.textContent),codes:[...host.querySelectorAll('code')].map(n=>n.textContent),active:host.querySelectorAll('script,style,iframe,object,embed,img[src],[onclick],[onerror],[style*="position"]').length,pwned:!!window.PWNED,overflow:host.scrollWidth>host.clientWidth,citationHeight:host.querySelector('.venice-citation')?.getBoundingClientRect().height};
   },{source,theme});
   assert.deepEqual(actual.messages,[source,source]);assert.deepEqual(actual.marks,['Highlighted','Highlighted']);assert.deepEqual(actual.colors,[['colored','rgb(230, 67, 64)','rgb(168, 192, 255)'],['colored','rgb(230, 67, 64)','rgb(168, 192, 255)']]);assert.deepEqual(actual.crossed,['crossed out','crossed out']);assert.deepEqual(actual.citations,['1','12','1','1','12','1']);assert.ok(actual.codes.includes('<mark>literal</mark> ^2^'));assert.ok(actual.codes.includes('<mark>literal code</mark> ^3^'));assert.equal(actual.active,0);assert.equal(actual.pwned,false);assert.equal(actual.overflow,false);assert.ok(actual.citationHeight>12);
   await page.locator('[data-copy-message]').first().click();assert.equal(await page.evaluate(()=>copied.at(-1)),source);
   if(process.env.READER_SCREENSHOT_DIR){fs.mkdirSync(process.env.READER_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.READER_SCREENSHOT_DIR,`alternative-inline-${theme}-${viewport.width}.png`),animations:'disabled'});}
   results.push({theme,viewport,styling:true,citations:true,copyUnchanged:true,noActiveMarkup:true,noOverflow:true});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);console.log(JSON.stringify({passed:true,checks:results.length,networkRequests:0,pageErrors:0,results},null,2));
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
