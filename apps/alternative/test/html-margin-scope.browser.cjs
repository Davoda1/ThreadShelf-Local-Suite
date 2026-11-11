'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const playwright=require(process.env.PLAYWRIGHT_PATH||'../../../tools/mermaid-bundle/node_modules/playwright-core');
const root=path.resolve(process.env.TSA_APP_PATH||path.join(__dirname,'..'));
const {waitForWorkspace,flushPreferences,setNativeViewport,waitForPreview}=require('./helpers/native-workspace.cjs');
const html='<!doctype html><html><head><title>Layout regression</title></head><body><p id="ready">Native rendered HTML</p></body></html>';
const fixtures=[['javascript','/* Preserve code spacing */\nconst value = "'+ 'long_'.repeat(60)+'";\n\tconsole.log(value);'],['html',html],['svg','<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="#187a70"/></svg>'],['mermaid','flowchart TD\n A[Read] --> B[Search]'],['mermaid','A[Collect] --> B{Ready?}\n B -->|Yes| C[Share]\n B -->|No| D[Revise]']];
const chart={chartType:'bar',meta:{title:'Readings'},xKey:'item',series:[{dataKey:'value',label:'Reading'}],data:[{item:'A',value:2},{item:'B',value:3}]};
const thread={messages:[...fixtures.map(([lang,source])=>({role:'assistant',content:'```'+lang+'\n'+source+'\n```'})),{role:'assistant',content:'<Chart content={'+JSON.stringify(chart)+'} />'}]};
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function measure(page,excludeHtml){return page.evaluate(excludeHtml=>[...document.querySelectorAll('#thread-content .tsa-code-block,#thread-content .tsa-code-toolbar,#thread-content pre,#thread-content pre>code,#thread-content .tsa-svg-preview,#thread-content .tsa-svg-preview img,#thread-content .tsa-mermaid,#thread-content .tsa-mermaid svg,#thread-content .tsa-diagram-source,#thread-content .tsa-repaired-source,#thread-content .rich-chart,#thread-content .rich-chart svg,#thread-content .rich-chart table')].filter(node=>!excludeHtml||!node.closest('[data-html-fence]')).map(node=>{const style=getComputedStyle(node),box=node.getBoundingClientRect();const fields={};for(const name of ['display','padding','margin','borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius','borderWidth','boxSizing','overflowX','overflowY','whiteSpace','lineHeight'])fields[name]=style[name];return {node:node.tagName+'.'+String(node.className?.baseVal??node.className),...fields,width:box.width,height:box.height};}),excludeHtml);}
(async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'tsa-margin-')),entry=path.join(directory,'main.cjs');
 const restrictedLock=process.env.TSA_TEST_NO_UNIX_SOCKETS==='1';
 await fs.writeFile(entry,`const {app}=require('electron');app.setPath('appData',${JSON.stringify(path.join(directory,'profile'))});${restrictedLock?'app.requestSingleInstanceLock=()=>true;':''}require(${JSON.stringify(path.join(root,'main.cjs'))});`);
 let app;const results=[],errors=[],viewports=[];
 try{
  app=await playwright._electron.launch({executablePath:process.env.ELECTRON_PATH,args:[entry],chromiumSandbox:true,env:{...process.env},timeout:45000});const page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));await waitForWorkspace(page);
  assert.equal(await app.evaluate(({app})=>app.commandLine.hasSwitch('no-sandbox')),false);
  await page.evaluate(thread=>{const data={...thread,id:'guide-start-here',title:'Layout regression',collection:'Test'},row={...data,conversationKey:data.id,turnCount:data.messages.length};TSADemo.create=()=>({async request(method){if(method==='collections')return {collections:[{name:'Test',count:1}],total:1};if(method==='browse')return {items:[row],total:1,totalKnown:true,hasMore:false};if(method==='thread')return structuredClone(data);throw Error(method);}});},thread);
  await page.locator('#welcome-demo').click();await page.locator('#thread-view:not([hidden])').waitFor();
  const css=await fs.readFile(path.join(root,'renderer/content.css'),'utf8');
  const baseline=css.replace('.tsa-html-preview{display:flex;box-sizing:border-box;width:100%;','.tsa-html-preview{display:flex;box-sizing:border-box;width:calc(100% - 34px);').replace('aspect-ratio:16/9;min-width:0;margin:0;','aspect-ratio:16/9;min-width:0;margin:15px 17px;').replace('.tsa-code-block:has(>.tsa-html-preview:not([hidden]):not([data-preview-error])){border-bottom-left-radius:0;border-bottom-right-radius:0}','');
  assert.notEqual(baseline,css);
  await page.evaluate(baseline=>{const link=[...document.querySelectorAll('link[rel="stylesheet"]')].find(link=>link.href.endsWith('/content.css'));const style=document.createElement('style');style.id='margin-baseline';style.textContent=baseline;style.disabled=true;link.after(style);window.marginStyle={link,style};},baseline);
  async function compare(label,excludeHtml=false){
   const current=await measure(page,excludeHtml);await page.evaluate(()=>{marginStyle.link.disabled=true;marginStyle.style.disabled=false;});await settle(page);
   const before=await measure(page,excludeHtml);assert.deepEqual(current,before,label);
   await page.evaluate(()=>{marginStyle.style.disabled=true;marginStyle.link.disabled=false;});await settle(page);results.push({label,elementsCompared:current.length,identical:true});return current;
  }
  for(const width of [680,1100])for(const theme of ['light','dark'])for(const enabled of [false,true]){
   viewports.push({requested:{width,height:780},actual:await setNativeViewport(app,page,{width,height:780})});
   await page.locator('#settings-button').click();await page.locator(`#theme-choices [data-theme="${theme}"]`).click();await page.locator('#code-wrap').setChecked(enabled);await page.locator('#code-line-numbers').setChecked(enabled);await page.locator('#html-preview-external').setChecked(false);await page.locator('#settings-dialog [data-close="settings-dialog"]').last().click();
   await flushPreferences(page,{theme,codeWrap:enabled,codeLineNumbers:enabled,htmlPreviewExternal:false});
   await page.waitForFunction(theme=>{const blocks=[...document.querySelectorAll('#thread-content .tsa-code-block[data-mermaid-state]')];return blocks.length===2&&blocks.every(block=>['rendered','repaired'].includes(block.dataset.mermaidState)&&block.dataset.mermaidTheme===theme);},theme);
   await page.evaluate(()=>document.fonts.ready);await settle(page);
   const label=width+'px '+theme+' options '+(enabled?'on':'off'),blocks=page.locator('#thread-content .tsa-code-block');
   await compare(label+' code and default render modes');
   const code=await blocks.nth(0).locator('pre').evaluate(node=>({padding:getComputedStyle(node).padding,margin:getComputedStyle(node).margin}));assert.deepEqual(code,{padding:width<=780?'12px':'15px 17px',margin:'0px'});
   const corners=await blocks.evaluateAll(nodes=>nodes.map(node=>[getComputedStyle(node).borderBottomLeftRadius,getComputedStyle(node).borderBottomRightRadius]));assert.ok(corners.every(([left,right])=>left==='9px'&&right==='9px'));
   await blocks.nth(2).locator('[data-svg-toggle]').click();await blocks.nth(2).locator('.tsa-svg-preview img').evaluate(image=>image.decode());
   for(const index of [3,4])await blocks.nth(index).locator('.tsa-diagram-source summary').click();await blocks.nth(4).locator('.tsa-repaired-source summary').click();
   await compare(label+' SVG rendered plus original and repaired Mermaid source');
   const htmlBlock=blocks.nth(1);await htmlBlock.locator('[data-toggle-html]').click();await waitForPreview(app,htmlBlock);await settle(page);
   const htmlGeometry=await htmlBlock.evaluate(block=>{const preview=block.querySelector('.tsa-html-preview'),style=getComputedStyle(block),p=getComputedStyle(preview),b=block.getBoundingClientRect(),r=preview.getBoundingClientRect();return {margin:p.margin,padding:p.padding,bottom:[style.borderBottomLeftRadius,style.borderBottomRightRadius],top:[style.borderTopLeftRadius,style.borderTopRightRadius],innerWidth:b.width-parseFloat(style.borderLeftWidth)-parseFloat(style.borderRightWidth),previewWidth:r.width,ratio:r.width/r.height};});
   assert.equal(htmlGeometry.margin,'0px');assert.equal(htmlGeometry.padding,'0px');assert.deepEqual(htmlGeometry.bottom,['0px','0px']);assert.deepEqual(htmlGeometry.top,['9px','9px']);assert.ok(Math.abs(htmlGeometry.innerWidth-htmlGeometry.previewWidth)<.1);assert.ok(Math.abs(htmlGeometry.ratio-16/9)<.002);
   await compare(label+' other renders with active HTML preview',true);
   await page.evaluate(()=>document.getElementById('reader-scroll').scrollTop+=80);await settle(page);await compare(label+' other renders after preview scroll',true);
   await htmlBlock.locator('[data-toggle-html]').click();assert.equal(await htmlBlock.locator('pre').isVisible(),true);assert.equal(await htmlBlock.locator('pre code').textContent(),html);
   assert.deepEqual(await htmlBlock.evaluate(block=>[getComputedStyle(block).borderBottomLeftRadius,getComputedStyle(block).borderBottomRightRadius]),['9px','9px']);
   await compare(label+' restored HTML source and other renders');
   await blocks.nth(4).locator('[data-mermaid-toggle]').click();await page.waitForFunction(()=>document.querySelectorAll('#thread-content .tsa-code-block')[4].dataset.mermaidState==='original-error');await compare(label+' original Mermaid error source');
   await blocks.nth(4).locator('[data-mermaid-toggle]').click();await page.waitForFunction(()=>document.querySelectorAll('#thread-content .tsa-code-block')[4].dataset.mermaidState==='repaired');await compare(label+' restored repaired Mermaid');
   await blocks.nth(2).locator('[data-svg-toggle]').click();assert.equal(await blocks.nth(2).locator('pre code').textContent(),fixtures[2][1]);await compare(label+' restored SVG source');
  }
  assert.deepEqual(errors,[]);const output={passed:true,productionApplication:true,chromiumSandboxEnabled:true,singleInstanceLockUnmodified:!restrictedLock,checks:results.length,comparisons:results.length,nativeViewports:viewports,htmlOnlySpacing:true,baseline:'Simulated inset HTML surface with unchanged code and other rendering rules',unchanged:['Normal code padding and margins','HTML source and restored source','SVG render and restored source','Mermaid diagram, original source and repaired source','Rich chart'],htmlOnly:{margin:0,width:'100%',bottomCorners:0,topCorners:9,ratio:'16:9'},results,pageErrors:0};if(process.env.HTML_MARGIN_SCOPE_REPORT){await fs.mkdir(path.dirname(process.env.HTML_MARGIN_SCOPE_REPORT),{recursive:true});await fs.writeFile(process.env.HTML_MARGIN_SCOPE_REPORT,JSON.stringify(output,null,2)+'\n');}else console.log(JSON.stringify(output,null,2));
 }finally{if(app)await app.close();await fs.rm(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
