/* Browser-level safety/rendering regressions. Run with PLAYWRIGHT_PATH and CHROMIUM_PATH if not installed locally. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(process.env.PLAYWRIGHT_PATH || 'playwright'); }
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await playwright.chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH || undefined,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:1100,height:850}});const errors=[];const requests=[];
 await page.route('https://example.com/sample.png',route=>route.fulfill({status:404,body:'Missing synthetic fixture'}));
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 await page.setContent('<!doctype html><html data-theme="light"><head></head><body><main style="max-width:760px;margin:30px auto;font-family:system-ui" id="content"></main></body></html>');
 await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},process.env.CONTENT_THEME||'light');
 for(const f of ['vendor/math-config.js','vendor/marked.umd.js','vendor/mathjax-tex-svg.js','vendor/mermaid.min.js','vendor/reader-rich.js','vendor/highlight.bundle.js','renderer/message-visibility.js','renderer/content.js']) await page.addScriptTag({path:path.join(root,f)});
 if(fs.existsSync(path.join(root,'renderer/app.css')))await page.addStyleTag({path:path.join(root,'renderer/app.css')});
 await page.addStyleTag({path:path.join(root,'renderer/content.css')});
 await page.addStyleTag({path:path.join(root,'renderer/code-themes.css')});
 await page.addStyleTag({content:'html,body{height:auto;overflow:auto}body{min-height:100vh}'});
 const result=await page.evaluate(async()=>{
   const thread={turns:[{user:'Can you compare **alpha** and beta?'},{thinking:'Private notes: $x^2$.'},{ai:'## Comparison\n\n| Item | Value |\n| --- | ---: |\n| Alpha | 42 |\n\n```js\nconst answer = "<safe>";\n```\n\nInline math: \\(x^2 + y^2 = z^2\\).\n\n$$\\frac{1}{2}$$\n\n[Docs](https://example.com/docs) [bad](javascript:alert(1))\n\n<script>window.PWNED=1</script>\n\n![Sample](https://example.com/sample.png)\n\n<Entity category="software" value="ThreadShelf" />\n\n<box border={true} padding={2}><title>Rich title</title><text>Safe **rich** content.</text></box>\n\n```mermaid\nflowchart TD\n A[Read] --> B[Search]\n B --> C[Open]\n```'}]};
   const output=TSAContent.renderThread(thread,{query:'alpha',showReasoning:false});
   const el=document.getElementById('content');el.innerHTML=output.html;
   window.copied=[];window.opened=[];window.cleanup=TSAContent.bind(el,{copy:t=>copied.push(t),openExternal:url=>opened.push(url)});await cleanup.ready;
   return {metrics:output.metrics,outline:output.outline,messages:output.messages.map(x=>x.role),hasTable:!!el.querySelector('table'),code:el.querySelector('pre code').textContent,math:el.querySelectorAll('mjx-container').length,mermaid:!!el.querySelector('.tsa-mermaid svg'),imageButton:el.querySelector('[data-load-image]')?.textContent,images:el.querySelectorAll('img').length,entities:el.querySelectorAll('.rich-entity').length,richTitle:el.querySelector('.rich-title')?.textContent,reasoningOpen:el.querySelector('.tsa-reasoning details').open,badLinks:[...el.querySelectorAll('a')].filter(a=>a.href.startsWith('javascript:')).length,scriptElements:el.querySelectorAll('script').length,pwned:!!window.PWNED,highlight:el.querySelectorAll('.tsa-query-hit').length};
 });
 assert.deepEqual(result.messages,['user','reasoning','assistant']);assert.equal(result.metrics.user,1);assert.equal(result.outline.length,1);assert.equal(result.outline[0].id,'message-0');assert.equal(result.hasTable,true);assert.equal(result.code,'const answer = "<safe>";');assert.equal(result.math,3);assert.equal(result.mermaid,true);assert.match(result.imageButton,/Load image/);assert.equal(result.images,1);assert.equal(result.entities,1);assert.equal(result.richTitle.trim(),'Rich title');assert.equal(result.reasoningOpen,false);assert.equal(result.badLinks,0);assert.equal(result.scriptElements,0);assert.equal(result.pwned,false);assert.ok(result.highlight>=2);
 await page.locator('[data-copy-code]').first().click();await page.locator('[data-copy-message]').first().click();await page.locator('[data-load-image]').click();await page.locator('a[href="https://example.com/docs"]').click();
 const actions=await page.evaluate(()=>({copied,opened}));assert.equal(actions.copied[0],'const answer = "<safe>";');assert.equal(actions.copied[1],'Can you compare **alpha** and beta?');assert.deepEqual(actions.opened,['https://example.com/docs']);assert.deepEqual(requests,['https://example.com/sample.png']);assert.deepEqual(errors,[]);
 const safety=await page.evaluate(()=>{
  const malicious='<img src=x onerror="window.PWNED=1"><iframe src="https://example.com"></iframe>\n\n[bad](data:text/html,hello)\n\n<img src="data:image/svg+xml,%3Csvg%20onload=alert(1)%3E">';
  const el=document.createElement('div');el.innerHTML=TSAContent.markdown(malicious);return {active:el.querySelectorAll('script,img,iframe,object,embed,[onerror]').length,hrefs:[...el.querySelectorAll('a')].map(a=>a.href),raw:TSAContent.normalize({turns:[{user:'a',thinking:'b',ai:'c'}]}).map(m=>m.content),url:TSAContent.safeUrl('https://user:password@example.com/')};
 });assert.equal(safety.active,0);assert.deepEqual(safety.hrefs,[]);assert.deepEqual(safety.raw,['a','b','c']);assert.equal(safety.url,null);
 const richChecks=await page.evaluate(()=>{
   const chart={chartType:'bar',meta:{title:'Synthetic measurements'},xKey:'item',series:[{dataKey:'value',label:'Reading',valueSuffix:' V'}],data:[{item:'A',value:-2.25},{item:'B',value:3.125}]};
   const chartElement=document.createElement('article');chartElement.className='tsa-message';const chartBody=document.createElement('div');chartBody.className='message-content';chartElement.append(chartBody);chartBody.innerHTML=TSAContent.markdown('<Chart content={'+JSON.stringify(chart)+'} />');
   const thread={turns:[{ai:'Source <Cite ref="turn4search2" /> and <Cite ref="turn5search9" />',source_message_id:'message',source_node_id:'node'}],raw:{mapping:{node:{message:{id:'message',metadata:{content_references:[{type:'grouped_webpages',items:[{url:'https://example.com/source',title:'Saved source',refs:[{turn_index:4,ref_type:'search',ref_index:2}]}]}]}}}}}};
   document.getElementById('content').append(chartElement);
   const original=JSON.stringify(thread);const output=TSAContent.renderThread(thread);const element=document.createElement('div');element.innerHTML=output.html;
   const mapping={current_node:'b',mapping:{root:{parent:null,message:null},a:{parent:'root',message:{author:{role:'user'},content:{parts:['First']},create_time:1}},b:{parent:'a',message:{author:{role:'assistant'},content:{parts:['Chosen branch']},create_time:2}},c:{parent:'a',message:{author:{role:'assistant'},content:{parts:['Other branch']},create_time:3}}}};
   return {chartSvg:!!chartElement.querySelector('.rich-chart svg'),chartTable:chartElement.querySelector('table')?.textContent,source:element.querySelector('a')?.getAttribute('href'),missing:element.querySelector('.rich-citation-unresolved')?.textContent,immutable:JSON.stringify(thread)===original,branch:TSAContent.normalize(mapping).map(m=>m.content)};
 });
 assert.equal(richChecks.chartSvg,true);assert.match(richChecks.chartTable,/-2\.25/);assert.match(richChecks.chartTable,/3\.125/);assert.equal(richChecks.source,'https://example.com/source');assert.equal(richChecks.missing,'Source unavailable');assert.equal(richChecks.immutable,true);assert.deepEqual(richChecks.branch,['First','Chosen branch']);
 const themeCheck=await page.evaluate(()=>{const root=getComputedStyle(document.documentElement),code=getComputedStyle(document.querySelector('.tsa-code-block'));return {theme:document.documentElement.dataset.theme,background:code.backgroundColor,text:code.color,surface:root.getPropertyValue('--surface-soft').trim()};});
 if(fs.existsSync(path.join(root,'renderer/app.css'))){assert.equal(themeCheck.background,themeCheck.theme==='dark'?'rgb(30, 30, 30)':'rgb(255, 255, 255)');assert.equal(themeCheck.text,themeCheck.theme==='dark'?'rgb(212, 212, 212)':'rgb(0, 0, 0)');}
 const preview=process.env.CONTENT_SCREENSHOT;if(preview)await page.screenshot({path:preview,fullPage:true});
 console.log(JSON.stringify({passed:true,render:result,actions,rich:richChecks,theme:themeCheck,requests,errors},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
