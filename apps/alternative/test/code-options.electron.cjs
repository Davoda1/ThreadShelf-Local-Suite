'use strict';
// Synthetic source fixtures exercise the production application, native clipboard,
// actual exports, sandboxed HTML preview, and persisted Reading preferences.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const playwright=require(process.env.PLAYWRIGHT_PATH||'../../../tools/mermaid-bundle/node_modules/playwright-core');
const root=path.resolve(process.env.TSA_APP_PATH||path.join(__dirname,'..'));
const source='/* first line\n\tsecond line ✓ Árvíztűrő 😀\n\nlast comment line */\nconst greeting = "'+ 'long_text_'.repeat(32)+'";\n\t  console.log(greeting);\n\n';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120">\n<rect width="240" height="120" fill="#187a70"/>\n</svg>';
const html='<!doctype html>\n<html><head><title>Code options</title></head>\n<body><p id="result">Rendered</p><script>document.getElementById("result").textContent="Rendered with JavaScript";</script></body></html>';
const mermaid='flowchart TD\n A[Read] --> B[Search]';
const repair='A[Collect] --> B{Ready?}\n B -->|Yes| C[Share]\n B -->|No| D[Revise]';
const numbered=Array.from({length:110},(_,i)=>'line '+(i+1)).join('\n');
const large=Array.from({length:10001},()=>'x').join('\n');
const largeHtml='<!doctype html>\n<html><head><title>Large source</title></head><body>\n'+large+'\n</body></html>';
const chart={chartType:'bar',meta:{title:'Readings'},xKey:'item',series:[{dataKey:'value',label:'Reading'}],data:[{item:'A',value:2},{item:'B',value:3}]};
const fixtures=[['javascript',source],['svg',svg],['html',html],['mermaid',mermaid],['mermaid',repair],['text',numbered],['html',largeHtml]];
const messages=fixtures.map(([lang,text])=>({role:'assistant',content:'```'+lang+'\n'+text+'\n```'}));
messages.push({role:'assistant',content:'<Chart content={'+JSON.stringify(chart)+'} />'});
const thread={id:'guide-start-here',title:'Code presentation test',provider:'Synthetic',collection:'Test',messages};
async function poll(check){let last;for(let i=0;i<100;i++){try{return await check();}catch(error){last=error;}await new Promise(resolve=>setTimeout(resolve,50));}throw last;}
(async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'tsa-code-options-')),entry=path.join(directory,'main.cjs'),exportPath=path.join(directory,'conversation.md');
 const restrictedLock=process.env.TSA_TEST_NO_UNIX_SOCKETS==='1';
 await fs.writeFile(entry,`const {app}=require('electron');app.setPath('appData',${JSON.stringify(path.join(directory,'profile'))});${restrictedLock?'app.requestSingleInstanceLock=()=>true;':''}require(${JSON.stringify(path.join(root,'main.cjs'))});`);
 let application;const errors=[];
 const launch=async()=>{application=await playwright._electron.launch({executablePath:process.env.ELECTRON_PATH,args:[entry],chromiumSandbox:true,env:{...process.env},timeout:45000});assert.equal(await application.evaluate(({app})=>app.commandLine.hasSwitch('no-sandbox')),false);const page=await application.firstWindow();page.on('pageerror',error=>errors.push(error.message));await page.locator('#settings-button').waitFor();return page;};
 const ready=async page=>page.waitForFunction(()=>document.querySelectorAll('.tsa-code-block').length===7&&document.querySelectorAll('.tsa-code-block[data-mermaid-state="rendered"],.tsa-code-block[data-mermaid-state="repaired"]').length===2).catch(async error=>{console.error(await page.locator('.tsa-code-block').evaluateAll(blocks=>blocks.map(b=>({lang:b.dataset.codeLanguage,state:b.dataset.mermaidState,note:b.querySelector('.tsa-diagram-note')?.textContent}))));throw error;});
 try{
  let page=await launch();await page.locator('#settings-button').click();
  assert.equal(await page.locator('#code-wrap').isChecked(),false);assert.equal(await page.locator('#code-line-numbers').isChecked(),false);
  await page.locator('#settings-dialog [data-close="settings-dialog"]').last().click();
  await page.evaluate(thread=>{const row={...thread,conversationKey:thread.id,turnCount:thread.messages.length};TSADemo.create=()=>({async request(method){if(method==='collections')return {collections:[{name:'Test',count:1}],total:1};if(method==='browse')return {items:[row],total:1,totalKnown:true,hasMore:false};if(method==='thread')return structuredClone(thread);throw Error(method);}});},thread);
  await page.locator('#welcome-demo').click();await ready(page);
  const expectedText=await page.evaluate(()=>document.querySelector('.tsa-code-block code').textContent);assert.equal(expectedText,source);
  const originalCopy=await page.evaluate(thread=>TSAContent.plainText(thread),thread);
  const blocks=page.locator('.tsa-code-block');
  for(const [codeWrap,codeLineNumbers] of [[false,false],[true,false],[false,true],[true,true]]){
   await page.locator('#settings-button').click();
   await page.locator('#code-wrap').setChecked(codeWrap);await page.locator('#code-line-numbers').setChecked(codeLineNumbers);
   await poll(async()=>{const saved=await page.evaluate(()=>alternative.loadState());assert.equal(saved.codeWrap,codeWrap);assert.equal(saved.codeLineNumbers,codeLineNumbers);});
   await page.locator('#settings-dialog [data-close="settings-dialog"]').last().click();await ready(page);
   const block=blocks.first();const result=await block.evaluate(block=>{const code=block.querySelector('code'),pre=code.parentElement;return {text:code.textContent,original:code.dataset.originalCode,numbers:[...code.querySelectorAll('.code-line-number')].map(n=>({number:n.dataset.lineNumber,text:n.textContent,select:getComputedStyle(n).userSelect})),wrap:pre.classList.contains('code-wrap'),overflow:pre.scrollWidth>pre.clientWidth+1,comments:code.querySelectorAll('.hljs-comment').length,lines:code.querySelectorAll('.code-line').length};});
   assert.equal(result.text,source);assert.equal(result.original,source);assert.equal(result.wrap,codeWrap);assert.equal(result.overflow,!codeWrap);assert.ok(result.comments>=1);
   assert.equal(result.lines,codeLineNumbers?source.split('\n').length:0);assert.ok(result.numbers.every((n,i)=>n.number===String(i+1)&&n.text===''&&n.select==='none'));
   await block.locator('[data-copy-code]').click();assert.equal(await application.evaluate(({clipboard})=>clipboard.readText()),source);
   await application.evaluate(({clipboard})=>clipboard.writeText('native-copy-sentinel'));
   await block.locator('pre code').scrollIntoViewIfNeeded();
   await block.locator('pre code').evaluate(code=>{const selection=getSelection(),range=document.createRange();range.selectNodeContents(code);selection.removeAllRanges();selection.addRange(range);});
   // Chromium may trim final empty selection lines even with both options off.
   // The logical source must remain exact, with no gutter or wrapping characters.
   await page.keyboard.press('Control+c');await poll(async()=>{const native=await application.evaluate(({clipboard})=>clipboard.readText());
    // Windows DOM selection uses the clipboard transport's CRLF convention.
    // Application Copy controls and exported source remain byte-exact below.
    const copied=process.platform==='win32'?native.replace(/\r\n/g,'\n'):native;assert.equal(copied.replace(/\n+$/,''),source.replace(/\n+$/,''));assert.ok(source.startsWith(copied)&&/^\n*$/.test(source.slice(copied.length)),'native selection adds no numbers or wrapping newlines');});
   await block.locator('[data-copy-code]').evaluate(button=>button.closest('.tsa-message').querySelector('[data-copy-message]').click());assert.equal(await application.evaluate(({clipboard})=>clipboard.readText()),messages[0].content);
   await page.locator('#copy-thread').click();assert.equal(await application.evaluate(({clipboard})=>clipboard.readText()),originalCopy);
   const nativeExport=await application.evaluate(({dialog},exportPath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:exportPath});return true;},exportPath);assert.equal(nativeExport,true);
   await fs.rm(exportPath,{force:true});await page.locator('#export-thread').click();await poll(async()=>assert.ok((await fs.readFile(exportPath,'utf8')).includes(messages[0].content)));
   const exported=await fs.readFile(exportPath,'utf8');assert.ok(exported.includes(repair));assert.ok(!exported.includes('code-line-number'));assert.ok(!exported.includes('Line numbers unavailable'));
  }
  // Both options now enabled. Rendering must hide all source presentation.
  for(const [index,selector,view] of [[1,'[data-svg-toggle]','.tsa-svg-preview'],[2,'[data-toggle-html]','.tsa-html-preview'],[6,'[data-toggle-html]','.tsa-html-preview']]){
   const block=blocks.nth(index);assert.ok(await block.locator('pre').isVisible());
   await block.locator(selector).click();await block.locator(view).waitFor({state:'visible'});
   assert.equal(await block.locator('pre').isVisible(),false);assert.equal(await block.locator('.code-line-number:visible,.code-block-note:visible').count(),0);assert.equal(await block.locator(view+' .code-line-number,'+view+' .code-line').count(),0);
   await block.locator('[data-copy-code]').click();assert.equal(await application.evaluate(({clipboard})=>clipboard.readText()),fixtures[index][1]);
   if(index===2)await poll(async()=>{const rendered=await application.evaluate(async({webContents})=>{const wc=webContents.getAllWebContents().find(w=>/\.preview\.invalid\//.test(w.getURL()));return wc?wc.executeJavaScript('document.getElementById("result")?.textContent'):'';});assert.equal(rendered,'Rendered with JavaScript');});
   await block.locator(selector).click();assert.equal(await block.locator('pre').isVisible(),true);assert.equal(await block.locator('pre').getAttribute('class'),index===6?'code-wrap':'code-wrap code-line-numbers');assert.equal(await block.locator('pre code').textContent(),fixtures[index][1]);
  }
  assert.equal(await blocks.nth(5).locator('.code-line-number').last().getAttribute('data-line-number'),'110');assert.equal(await blocks.nth(6).locator('.code-line-number').count(),0);assert.equal(await blocks.nth(6).locator('.code-block-note').count(),1);
  for(const index of [3,4]){const block=blocks.nth(index);assert.equal(await block.locator('.tsa-mermaid .code-line-number,.tsa-mermaid .code-line').count(),0);assert.equal(await block.locator('.code-line-number:visible').count(),0);await block.locator('.tsa-diagram-source summary').click();assert.ok(await block.locator('.tsa-diagram-source .code-line-number:visible').count()>0);await block.locator('.tsa-diagram-source summary').click();}
  const repaired=blocks.nth(4);await repaired.locator('.tsa-repaired-source summary').click();assert.ok(await repaired.locator('.tsa-repaired-source .code-line-number:visible').count()>0);const repairedText=await repaired.locator('.tsa-repaired-source code').textContent();await repaired.locator('[data-copy-repaired]').click();assert.equal(await application.evaluate(({clipboard})=>clipboard.readText()),repairedText);
  await repaired.locator('[data-mermaid-toggle]').click();await page.waitForFunction(()=>document.querySelectorAll('.tsa-code-block')[4].dataset.mermaidState==='original-error');assert.equal(await repaired.locator('.tsa-diagram-source code').textContent(),repair);
  await repaired.locator('[data-mermaid-toggle]').click();await page.waitForFunction(()=>document.querySelectorAll('.tsa-code-block')[4].dataset.mermaidState==='repaired');assert.equal(await repaired.locator('.tsa-repaired-source code').textContent(),repairedText);
  assert.equal(await page.locator('.rich-chart svg').count(),1);assert.equal(await page.locator('.rich-chart .code-line-number,.rich-chart .code-line').count(),0);
  for(const theme of ['light','dark']){await page.setViewportSize({width:680,height:540});await page.locator('#settings-button').click();await page.locator(`#theme-choices [data-theme="${theme}"]`).click();for(const id of ['code-wrap','code-line-numbers']){const toggle=page.locator('#'+id);await toggle.scrollIntoViewIfNeeded();const layout=await toggle.evaluate(input=>{const body=input.closest('.settings-body'),r=input.getBoundingClientRect(),b=body.getBoundingClientRect();return {visible:r.top>=b.top&&r.bottom<=b.bottom,noOverflow:body.scrollWidth<=body.clientWidth&&document.documentElement.scrollWidth<=innerWidth,footer:input.closest('dialog').querySelector('.dialog-footer').getBoundingClientRect().bottom<=innerHeight};});assert.deepEqual(layout,{visible:true,noOverflow:true,footer:true});}await page.locator('#settings-dialog [data-close="settings-dialog"]').last().click();}
  await application.close();application=null;page=await launch();await page.locator('#settings-button').click();assert.equal(await page.locator('#code-wrap').isChecked(),true);assert.equal(await page.locator('#code-line-numbers').isChecked(),true);
  assert.deepEqual(errors,[]);const report={passed:true,productionApplication:true,singleInstanceLockUnmodified:!restrictedLock,chromiumSandboxEnabled:true,combinations:4,defaultsOff:true,restartPersistence:true,nativeClipboardSourceOnly:true,copyAndExportUnchanged:true,wrapping:true,lineNumbers:true,renderGuttersAbsent:true,copyUnchanged:true,exportUnchanged:true,persistence:true,htmlSvgMermaidChartIsolation:true,largeBlockLimit:true,settings680x540:['light','dark'],pageErrors:0};if(process.env.CODE_OPTIONS_REPORT){await fs.mkdir(path.dirname(process.env.CODE_OPTIONS_REPORT),{recursive:true});await fs.writeFile(process.env.CODE_OPTIONS_REPORT,JSON.stringify(report,null,2)+'\n');}else console.log(JSON.stringify(report,null,2));
 }finally{if(application)await application.close();await fs.rm(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
