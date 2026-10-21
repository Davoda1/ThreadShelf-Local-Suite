/* Local Reader parity and deterministic Mermaid repair gates. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
let playwright;try{playwright=require('playwright');}catch{playwright=require(process.env.PLAYWRIGHT_PATH||'playwright');}
const root=path.resolve(__dirname,'..');
const screenshots=process.env.PARITY_SCREENSHOTS||path.resolve(root,'../qa/renderer-parity');
const checks=[];
const pass=(name,details)=>checks.push({name,passed:true,...details});
const fixtures={
 valid:'flowchart TD\n A[Read] --> B[Search]',
 inferred:'A[Collect] --> B{Ready?}\n B -->|Yes| C[Share]\n B -->|No| D[Revise]',
 punctuation:'flowchart TD\n A[Review (quietly)] --> B[Share]',
 sequence:'sequenceDiagram\n participant A as "Reader"\n A->>B: First; then next',
 legacy:'bar\ntitle A week\nDrafts 12\nRevisions -2\nPublished 0',
 invalid:'not-a-supported-diagram\nKeep this exact source <saved>',
 limited:'flowchart TD\n%% '+'.'.repeat(50001),
 hostile:'%%{init: {"securityLevel":"loose","htmlLabels":true}}%%\nflowchart TD\n A["<img src=x onerror=window.PWNED=1>"] --> B[Safe]\n click B "https://example.invalid/remote" "Remote"'
};
(async()=>{
 const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:1000,height:850}});
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 await page.setContent('<!doctype html><html data-theme="light"><head></head><body><main id="content"></main></body></html>');
 for(const f of ['vendor/math-config.js','vendor/marked.umd.js','vendor/mathjax-tex-svg.js','vendor/mermaid.min.js','vendor/reader-rich.js','vendor/highlight.bundle.js','renderer/content.js'])await page.addScriptTag({path:path.join(root,f)});
 for(const f of ['renderer/app.css','renderer/content.css','renderer/code-themes.css'])await page.addStyleTag({path:path.join(root,f)});
 await page.addStyleTag({content:'html,body{height:auto;overflow:auto}body{min-height:100vh}#content{max-width:760px;margin:24px auto;padding:0 20px;font:16px/1.7 system-ui}'});
 const initial=await page.evaluate(async fixtures=>{
   const messages=Object.entries(fixtures).map(([key,source])=>({role:'assistant',content:'## '+key+'\n\n```mermaid\n'+source+'\n```'}));
   window.fixtureThread={provider:'claude',messages};
   const output=TSAContent.renderThread(fixtureThread);window.copied=[];window.opened=[];
   const container=document.getElementById('content');container.innerHTML=output.html;
   window.cleanup=TSAContent.bind(container,{copy:value=>copied.push(value),openExternal:value=>opened.push(value)});await cleanup.ready;
   return [...container.querySelectorAll('.tsa-code-block')].map((block,index)=>({key:Object.keys(fixtures)[index],state:block.dataset.mermaidState,source:block.querySelector('.tsa-diagram-source code').textContent,repaired:block.querySelector('.tsa-repaired-source code').textContent,svg:!!block.querySelector('.tsa-mermaid svg'),label:block.closest('.tsa-message').querySelector('.tsa-role').textContent}));
 },fixtures);
 const byKey=Object.fromEntries(initial.map(item=>[item.key,item]));
 assert.equal(byKey.valid.state,'rendered');
 for(const key of ['inferred','punctuation','sequence','legacy']){assert.equal(byKey[key].state,'repaired',key);assert.equal(byKey[key].svg,true,key);assert.notEqual(byKey[key].repaired,fixtures[key]);}
 assert.equal(byKey.invalid.state,'error');assert.equal(byKey.limited.state,'limited');assert.equal(byKey.hostile.state,'rendered');
 for(const item of initial){assert.equal(item.source,fixtures[item.key]);assert.equal(item.label,'Claude');}
 pass('Mermaid rendering, four deterministic repair families and explicit fallback',{states:initial.map(({key,state})=>({key,state}))});
 const repairedBlock=page.locator('.tsa-code-block').nth(1);
 await repairedBlock.locator('[data-copy-code]').click();await repairedBlock.locator('[data-copy-repaired]').click();
 assert.deepEqual(await page.evaluate(()=>copied.slice(-2)),[fixtures.inferred,byKey.inferred.repaired]);
 await repairedBlock.locator('[data-mermaid-toggle]').click();await page.waitForFunction(()=>document.querySelectorAll('.tsa-code-block')[1].dataset.mermaidState==='original-error');
 assert.equal(await repairedBlock.locator('.tsa-diagram-source').getAttribute('open'),'');assert.equal(await repairedBlock.locator('.tsa-mermaid').isVisible(),false);
 await repairedBlock.locator('[data-copy-code]').click();assert.equal(await page.evaluate(()=>copied.at(-1)),fixtures.inferred);
 await repairedBlock.locator('[data-mermaid-toggle]').click();await page.waitForFunction(()=>document.querySelectorAll('.tsa-code-block')[1].dataset.mermaidState==='repaired');
 assert.equal(await repairedBlock.locator('.tsa-mermaid').isVisible(),true);
 const sourceInvariant=await page.evaluate(()=>({message:TSAContent.normalize(fixtureThread)[1].content,exported:TSAContent.plainText(fixtureThread)}));
 assert.ok(sourceInvariant.message.includes(fixtures.inferred));assert.ok(sourceInvariant.exported.includes(fixtures.inferred));assert.ok(!sourceInvariant.exported.includes(byKey.inferred.repaired));
 pass('Original/repaired preview toggle, separate Copy actions and immutable export');
 const oldSvg=await repairedBlock.locator('.tsa-mermaid').innerHTML();
 await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});
 await page.waitForFunction(()=>[...document.querySelectorAll('.tsa-code-block')].filter(b=>['rendered','repaired'].includes(b.dataset.mermaidState)).every(b=>b.dataset.mermaidTheme==='dark'));
 assert.notEqual(await repairedBlock.locator('.tsa-mermaid').innerHTML(),oldSvg);
 assert.equal(await repairedBlock.getAttribute('data-mermaid-state'),'repaired');
 pass('Live Mermaid theme repaint preserves repair mode and original source');
 const security=await page.evaluate(()=>({pwned:!!window.PWNED,active:document.querySelectorAll('#content script,#content iframe,#content foreignObject,#content img,#content [onload],#content [onerror]').length,links:[...document.querySelectorAll('.tsa-mermaid [href],.tsa-mermaid [xlink\\:href]')].map(x=>x.getAttribute('href')||x.getAttribute('xlink:href'))}));
 assert.equal(security.pwned,false);assert.equal(security.active,0);assert.ok(security.links.every(x=>x.startsWith('#')));assert.deepEqual(requests,[]);
 pass('Archive directives, HTML and external diagram links remain inert',{security});
 await page.evaluate(()=>cleanup());
 // Citation resolver accepts only recorded provenance; direct mappings now retain it.
 const citations=await page.evaluate(()=>{
   const raw={current_node:'n',mapping:{n:{parent:null,message:{id:'m',author:{role:'assistant'},content:{parts:['Bound <Cite ref="turn4search2"/> missing <Cite ref="turn9search9"/>']},metadata:{content_references:[{type:'grouped_webpages',items:[{url:'https://example.com/source',title:'Saved source',refs:[{turn_index:4,ref_type:'search',ref_index:2}]}]}]}}}}};
   const original=JSON.stringify(raw),holder=document.createElement('div');holder.innerHTML=TSAContent.renderThread(raw).html;
   const valid={href:holder.querySelector('.rich-citation-link')?.getAttribute('href'),unresolved:holder.querySelector('.rich-citation-unresolved')?.textContent};
   holder.innerHTML=TSAContent.renderThread({turns:[{ai:'<Cite ref="turn4search2"/>',source_message_id:'wrong',source_node_id:'n'}],raw}).html;
   return {...valid,wrongBound:!!holder.querySelector('.rich-citation-link'),immutable:JSON.stringify(raw)===original};
 });
 assert.equal(citations.href,'https://example.com/source');assert.equal(citations.unresolved,'Source unavailable');assert.equal(citations.wrongBound,false);assert.equal(citations.immutable,true);
 pass('Raw-mapping citation provenance, honest unresolved sources and mismatched identity rejection',{citations});
 const rich=await page.evaluate(async()=>{
   const chart={chartType:'bar',meta:{title:'Exact readings'},xKey:'item',series:[{dataKey:'value',label:'Reading',valueSuffix:' V'}],data:[{item:'A',value:-2.25},{item:'B',value:0},{item:'C',value:3.125}]};
   const content=[
    '<box border padding={2} gap={2}><row align="start" gap={2}><AsyncImage query="Saved corner thumbnail" aspectRatio="5:4" maxWidth="172px"/><box flex="1"><Entity category="place" value="Paper Observatory"/>\n\nReadable description beside the image.</box></row></box>',
    '<AsyncImage query="Saved wide landscape" aspectRatio="16:9" width="100%"/>',
    '<box width="100%" height="14px" background="surface-tertiary" radius="full" clip><box width="75%" height="14px" background="surface-secondary" radius="full"/></box>',
    '<box direction="row" width="100%" height="14px" background="surface-secondary" radius="full" clip><box flex="3" background="success"/><box flex="1" background="warning"/></box>',
    '<Chart content={'+JSON.stringify(chart)+'}/>',
    'Inline math \\(x^2 + y^2 = z^2\\).\n\n$$\\frac{1}{2}$$\n\n```js\nconst answer = "<safe>";\n```\n\n```text\n<Entity value="literal"/> $x^2$\n```'
   ].join('\n\n');
   const element=document.getElementById('content');element.innerHTML=TSAContent.renderThread({provider:'chatgpt',turns:[{user:'Please inspect this saved material.',ai:content}]}).html;
   window.cleanup=TSAContent.bind(element,{copy:value=>copied.push(value),openExternal:value=>opened.push(value)});await cleanup.ready;
   return {role:element.querySelector('.tsa-assistant .tsa-role').textContent,entity:element.querySelector('.rich-entity').textContent,table:element.querySelector('.rich-chart table').textContent,math:element.querySelectorAll('mjx-container').length,code:element.querySelector('.tsa-code-block[data-code-language="javascript"] code').textContent,highlight:element.querySelectorAll('.hljs-keyword').length,literal:[...element.querySelectorAll('.tsa-code-block code')].at(-1).textContent};
 });
 assert.equal(rich.role,'ChatGPT');assert.equal(rich.entity,'Paper Observatory');assert.match(rich.table,/-2\.25/);assert.match(rich.table,/3\.125/);assert.equal(rich.math,2);assert.equal(rich.highlight,1);assert.equal(rich.code,'const answer = "<safe>";');assert.equal(rich.literal,'<Entity value="literal"/> $x^2$');
 pass('Rich entity, exact chart data, math protection and VS Code syntax colors',{rich});
 const viewport=page.locator('.rich-chart-viewport');await viewport.focus();
 await page.waitForSelector('.rich-chart-tooltip');assert.match(await page.locator('.rich-chart-tooltip').innerText(),/-2\.25 V/);
 await page.keyboard.press('ArrowRight');assert.match(await page.locator('.rich-chart-tooltip').innerText(),/0 V/);
 await page.keyboard.press('End');assert.match(await page.locator('.rich-chart-tooltip').innerText(),/3\.125 V/);
 await page.keyboard.press('Escape');assert.equal(await page.locator('.rich-chart-tooltip').count(),0);
 await page.locator('.rich-chart-hit').first().hover();await page.waitForSelector('.rich-chart-tooltip');assert.match(await page.locator('.rich-chart-tooltip').innerText(),/-2\.25 V/);
 pass('Chart hover, keyboard traversal, exact negative/zero/fraction values and Escape');
 const layouts=[];
 for(const theme of ['light','dark']){
   await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);await page.setViewportSize({width:680,height:540});
   const layout=await page.evaluate(()=>{
    const read=selector=>{const el=document.querySelector(selector),r=el.getBoundingClientRect(),css=getComputedStyle(el);return {x:r.x,y:r.y,width:r.width,height:r.height,color:css.backgroundColor};};
    const compact=read('.rich-image-corner-aperture'),wide=read('.rich-image-soft-horizon');
    const text=read('.rich-row>.rich-box'),fill=read('.rich-progress-fill'),track=read('.rich-progress-track');
    const segments=[...document.querySelectorAll('.rich-allocation-segment')].map(x=>x.getBoundingClientRect().width);
    return {theme:document.documentElement.dataset.theme,compact,wide,text,fill,track,segments,images:document.querySelectorAll('img').length,overflow:document.documentElement.scrollWidth>innerWidth};
   });
   assert.ok(Math.abs(layout.compact.width-172)<1);assert.ok(Math.abs(layout.compact.width/layout.compact.height-1.25)<.01);assert.ok(layout.text.x>=layout.compact.x+layout.compact.width);assert.ok(Math.abs(layout.wide.width/layout.wide.height-16/9)<.01);assert.notEqual(layout.fill.color,layout.track.color);assert.ok(Math.abs(layout.fill.width/layout.track.width-.75)<.01);assert.ok(Math.abs(layout.segments[0]/layout.segments[1]-3)<.02);assert.equal(layout.images,0);assert.equal(layout.overflow,false);layouts.push(layout);
   fs.mkdirSync(screenshots,{recursive:true});await page.locator('#content').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(screenshots,`${theme}-narrow.png`),fullPage:true});
 }
 pass('Compact/full image placeholders, progress contrast and allocation ratio at 680px in both themes',{layouts});
 await page.evaluate(()=>cleanup());assert.equal(await page.locator('.rich-chart-tooltip').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 pass('Disposal and completely offline rendering',{errors,requests});
 const modulePath=path.join(root,'vendor/reader-source/mermaid-repair.js');
 const report={project:'ThreadShelf Local Alternative',version:'1.0.0',passed:true,date:new Date().toISOString(),checks,provenance:{module:'ThreadShelf Local Reader Source/src/reader/mermaid-repair.js',sha256:crypto.createHash('sha256').update(fs.readFileSync(modulePath)).digest('hex'),includedSource:'vendor/reader-source/mermaid-repair.js',rebuild:'python vendor/reader-source/build-repair.py',license:'MIT; vendor/licenses/Reader-MIT.txt'},bounds:{mermaidCharacters:50000,repairCandidates:4,mermaidEdges:500},intentionalDifferences:['Alternative keeps long user prompts expanded; Reader folds prompts after 15 rendered lines and offers five fold-button styles. Reasoning, tool and system messages retain Alternative disclosure controls.','Chart tooltips clamp to the viewport; Alternative retains its own reading pane and typography.','Chart category labels are moved below negative value labels to avoid overlap.','Math and Mermaid output disable external links/HTML; remote images use offline placeholders and optional external-browser links.','Mermaid repairs affect a reversible preview only. Default code Copy and exports preserve the archived original.']};
 fs.writeFileSync(path.join(root,'docs/reader-parity.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,checks:checks.length,report:'docs/reader-parity.json'},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
