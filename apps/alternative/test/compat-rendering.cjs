'use strict';
// Production Alternative renderer + shared bundle, synthetic exports only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
let playwright;try{playwright=require('playwright');}catch{playwright=require(process.env.PLAYWRIGHT_PATH||'playwright');}
const root=path.resolve(__dirname,'..');
const grok='<grok:render card_id="source-1" card_type="citation_card" type="render_inline_citation"><argument name="citation_id">0</argument></grok:render>';
const literal='citeturn0search0 '+grok;
const source=['Saved source citeturn0search0 and fileciteturn2file0L3-L8.',grok,
 '<box><text>Nested citeturn0search0 '+grok+'</text></box>',
 'genui{"future_widget":{"title":"Saved UI","html":"<script>window.PWNED=true</script>","action":"run"}}',
 'constructorsaved','iturn0image0','<grok-card data-id="image-1" data-type="image_card"></grok-card>',
 '`'+literal+'`','```text\n'+literal+'\n```'].join('\n\n');
const thread={provider:'chatgpt',raw:{mapping:{n:{message:{id:'m',metadata:{content_references:[
 {type:'grouped_webpages',items:[{url:'https://example.com/source',title:'Saved source',refs:[{turn_index:0,ref_index:0,ref_type:'search'}]}]},
 {type:'file',ref_id:'turn2file0',filename:'Saved-report.pdf'}
]}}}}},turns:[{ai:source,source_node_id:'n',source_message_id:'m',cardAttachmentsJson:JSON.stringify([
 {id:'source-1',cardType:'citation_card',url:'https://example.org/grok',title:'Grok saved source'},
 {id:'image-1',cardType:'image_card',image:{original:'https://example.org/saved.png',title:'Saved image'}}
])}]};
(async()=>{
 const browser=process.env.ELECTRON_PATH?await require('./electron-page.cjs')(playwright,1100,780):await playwright.chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[],requests=[],results=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/i.test(r.url()))requests.push(r.url());});
  await page.route('https://example.org/**',r=>r.abort());await page.route('https://example.com/**',r=>r.abort());
  await page.goto(pathToFileURL(path.join(root,'test/empty.html')).href);
  const csp=fs.readFileSync(path.join(root,'renderer/index.html'),'utf8').match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)[0];
  await page.setContent('<!doctype html><html data-theme="light"><head>'+csp+'</head><body><main id="content"></main></body></html>');
  await page.evaluate(()=>{window.cspViolations=[];document.addEventListener('securitypolicyviolation',event=>cspViolations.push(event.violatedDirective));});
  for(const f of ['vendor/marked.umd.js','vendor/highlight.bundle.js','vendor/reader-rich.js','renderer/message-visibility.js','renderer/json-response.js','renderer/file-citations.js','renderer/svg-preview.js','renderer/content.js'])await page.addScriptTag({url:pathToFileURL(path.join(root,f)).href});
  for(const f of ['renderer/app.css','renderer/content.css','renderer/rich-compat.css','renderer/code-themes.css'])await page.addStyleTag({path:path.join(root,f)});
  await page.addStyleTag({content:'html,body{height:100%;width:100%;margin:0;overflow:hidden}#content{box-sizing:border-box;height:100%;width:100%;overflow:auto;padding:14px}.tsa-message{max-width:100%}'});
  for(const viewport of [{width:680,height:540},{width:1100,height:780}])for(const theme of ['light','dark']){
   await page.setViewportSize(viewport);
   const result=await page.evaluate(async({thread,theme})=>{
    document.documentElement.dataset.theme=theme;window.cleanup?.();const host=document.getElementById('content');
    const rendered=TSAContent.renderThread(thread);host.innerHTML=rendered.html;window.copied=[];window.cleanup=TSAContent.bind(host,{copy:text=>copied.push(text),imageMode:'click'});await cleanup.ready;
    return {normalized:rendered.messages[0].content,links:[...host.querySelectorAll('a')].map(a=>a.getAttribute('href')),file:host.querySelector('.rich-file-reference')?.textContent,grok:host.querySelectorAll('.grok-citation').length,archived:host.querySelectorAll('.rich-archived-widget').length,archiveLabels:[...host.querySelectorAll('.rich-archived-widget')].map(n=>n.querySelector('.rich-passive-label')?.textContent),images:host.querySelectorAll('img[src]').length,codes:[...host.querySelectorAll('code')].map(n=>n.textContent),scripts:host.querySelectorAll('script,iframe,object,embed,[onclick],[onerror]').length,pwned:!!window.PWNED,overflow:host.scrollWidth>host.clientWidth,markers:/TSRICH(?:CHILD)?[a-f0-9]{32}END/.test(host.innerHTML)};
   },{thread,theme});
   assert.equal(result.normalized,source);assert.equal(result.links.filter(v=>v==='https://example.com/source').length,2);assert.equal(result.links.filter(v=>v==='https://example.org/grok').length,2);
   assert.match(result.file,/Saved-report.pdf.*L3-L8/);assert.equal(result.grok,2);assert.equal(result.archived,3);assert.ok(result.archiveLabels.includes('Archived ChatGPT content'));assert.ok(!result.archiveLabels.some(label=>/native code/.test(label)));assert.equal(result.images,0);
   assert.equal(result.codes.filter(v=>v===literal).length,2);assert.equal(result.scripts,0);assert.equal(result.pwned,false);assert.equal(result.overflow,false);assert.equal(result.markers,false);
   await page.locator('[data-copy-message]').click();assert.equal(await page.evaluate(()=>copied.at(-1)),source);
   await page.locator('.tsa-code-block [data-copy-code]').click();assert.equal(await page.evaluate(()=>copied.at(-1)),literal);
   if(process.env.READER_SCREENSHOT_DIR){await page.evaluate(()=>document.getElementById('content').scrollTop=0);fs.mkdirSync(process.env.READER_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.READER_SCREENSHOT_DIR,`alternative-compat-${theme}-${viewport.width}x${viewport.height}.png`),animations:'disabled'});}
   results.push({viewport,theme,sourceAndCopyExact:true,inert:true,noOverflow:true});
  }
  assert.deepEqual(await page.evaluate(()=>cspViolations),[]);assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,checks:results.length,productionCsp:true,networkRequests:0,pageErrors:0,results},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
