import { testModuleSpecifier } from './esm-module-specifier.mjs';
// Synthetic renderer regressions; requires Electron and Playwright, no server/archive.
import assert from 'node:assert/strict';
import { assertCopyPayloadAndClipboard, nativeClipboardText } from './clipboard-contract.mjs';
import {mkdtemp,writeFile,copyFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const driver = process.env.THREADSHELF_PLAYWRIGHT_MODULE || process.env.PLAYWRIGHT_MODULE;
const {_electron} = await import(testModuleSpecifier(driver || 'playwright'));
const root=fileURLToPath(new URL('..',import.meta.url)), temp=await mkdtemp(path.join(os.tmpdir(),'reader-code-presentation-'));
let app;
try {
  await build({stdin:{contents:`import {ConversationRenderer} from './src/reader/renderer.js';import {applyCodeBlockPresentation} from './src/reader/code-presentation.js';import './src/reader/reader.css';window.ConversationRenderer=ConversationRenderer;window.applyCodeBlockPresentation=applyCodeBlockPresentation;`,resolveDir:root},outfile:path.join(temp,'app.js'),bundle:true,format:'iife',platform:'browser',logLevel:'silent'});
  await copyFile(path.join(root,'public/mermaid.min.js'),path.join(temp,'mermaid.min.js'));
  await writeFile(path.join(temp,'preload.cjs'),`const{contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('desktop',{capabilities:{clipboardWrite:true},invoke:(a,b)=>ipcRenderer.invoke('test:invoke',a,b)});`);
  await writeFile(path.join(temp,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="app.css"><style>html,body{margin:0;height:100%;overflow:hidden}body{font:14px Arial;--text-primary:#eee;--text-secondary:#aaa;--bg-primary:#161b22;--bg-secondary:#252b33;--bg-tertiary:#323a44;--border-color:#586574;--code-bg:#11151b;--code-header-bg:#252b33;--code-label-text:#ddd;background:#161b22}#host{height:100%;overflow:auto;box-sizing:border-box;padding:16px}.message-content{min-width:0}.message{max-width:100%;min-width:0}</style></head><body><div id="host" class="reader-view conversation-content"></div><script src="mermaid.min.js"></script><script src="app.js"></script></body></html>`);
  await writeFile(path.join(temp,'main.cjs'),`const{app,BrowserWindow,ipcMain,clipboard}=require('electron');app.setPath('userData',${JSON.stringify(path.join(temp,'profile'))});app.whenReady().then(async()=>{global.clipboardWrites=[];global.owner=new BrowserWindow({show:true,width:680,height:540,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,preload:${JSON.stringify(path.join(temp,'preload.cjs'))}}});ipcMain.handle('test:invoke',(e,a,b)=>{if(a==='clipboard.write'){global.clipboardWrites.push(b.text);clipboard.writeText(b.text);return{ok:true}}if(a==='html.preview.open'){global.htmlSource=b.source;if(global.failHtml)throw Error('Synthetic preview failure');}return{ok:true}});await global.owner.loadFile(${JSON.stringify(path.join(temp,'index.html'))});});`);
  const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE;
  app=await _electron.launch({executablePath:process.env.READER_ELECTRON,args:[path.join(temp,'main.cjs')],env,chromiumSandbox:true,timeout:45000});
  assert.equal(app.process().spawnargs.includes('--no-sandbox'),false);
  const page=await app.firstWindow(); await page.waitForFunction(()=>window.ConversationRenderer);
  assert.equal(await page.evaluate(()=>window.desktop?.capabilities?.clipboardWrite),true,'Desktop Copy must use the production IPC capability');
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const render=async(source,language='javascript',options={})=>page.evaluate(({source,language,options})=>{
    window.renderer?.destroy();
    const renderer=window.renderer=new ConversationRenderer(document.getElementById('host'));
    renderer.setCompactMessagesEnabled(false); renderer.setCodePresentation(options);
    window.markdown='```'+language+'\n'+source+'\n```';
    renderer.renderMessages([{role:'assistant',message_id:'synthetic-code',content:window.markdown}]);
  },{source,language,options});
  const clipboard=()=>app.evaluate(({clipboard})=>clipboard.readText());
  let acceptedWriteCount=0;
  const assertClipboard=async(expected,label)=>{
    let lastError;
    for(let i=0;i<50;i++){
      const value=await app.evaluate(async({clipboard})=>({count:global.clipboardWrites.length,payload:global.clipboardWrites.at(-1),nativeText:await clipboard.readText()}));
      try{
        assert.ok(value.count>acceptedWriteCount,label+' must publish a new application Copy payload');
        assertCopyPayloadAndClipboard(expected,value.payload,value.nativeText,{label});
        acceptedWriteCount=value.count;return;
      }catch(error){lastError=error;}
      await page.waitForTimeout(20);
    }
    throw lastError;
  };
  // Windows normalizes line endings in both selection and Electron clipboard
  // transport. The application IPC payload above is always checked byte-exact.
  const assertNativeClipboard=async(expected,label)=>{const text=async()=>nativeClipboardText(await clipboard());const expectedText=nativeClipboardText(expected);for(let i=0;i<50;i++){if(await text()===expectedText)return;await page.waitForTimeout(20);}assert.equal(await text(),expectedText,label);};
  const source=['/* multi-line token','  Árvíztűrő 🧪 日本語','*/','','\tconst value = "'+('long unbroken content '.repeat(20))+'";','','  console.log(value);'].join('\n');
  for(const codeWrap of [false,true])for(const codeLineNumbers of [false,true]){
    await render(source,'javascript',{codeWrap,codeLineNumbers});
    const code=page.locator('pre>code');
    assert.equal(await code.textContent(),source);
    assert.equal(await code.getAttribute('data-original-code'),source);
    const display=await code.evaluate(el=>({width:el.getBoundingClientRect().width,parent:el.parentElement.clientWidth,scroll:el.parentElement.scrollWidth,lines:el.querySelectorAll('.code-line').length,numbers:[...el.querySelectorAll('.code-line-number')].map(n=>n.textContent),tokens:[...el.querySelectorAll('.hljs-comment')].map(n=>n.textContent)}));
    assert.equal(display.lines,codeLineNumbers?source.split('\n').length:0);
    assert.ok(display.numbers.every(text=>text===''));
    assert.ok(display.tokens.join('\n').includes('Árvíztűrő 🧪 日本語'));
    if(codeWrap)assert.ok(display.scroll<=display.parent+1,JSON.stringify(display));else assert.ok(display.scroll>display.parent+100,JSON.stringify(display));
    await app.evaluate(({clipboard})=>clipboard.writeText('clipboard sentinel'));
    await code.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);});
    assert.equal(await page.evaluate(()=>getSelection().toString()),source,'native selected text');
    await page.keyboard.press(process.platform==='darwin'?'Meta+C':'Control+C');
    await page.waitForTimeout(30);
    await assertNativeClipboard(source,'native clipboard');
    await page.locator('pre .code-copy-button').click();await assertClipboard(source,'block Copy');
    await page.locator('[data-copy-message]').click();await assertClipboard('```javascript\n'+source+'\n```','message Copy');
  }
  const whitespace = '\n\n  \t\nalpha\n\n';
  await render(whitespace,'text',{codeWrap:true,codeLineNumbers:true});
  assert.equal(await page.locator('pre>code').textContent(),whitespace);
  assert.equal(await page.locator('.code-line').count(),whitespace.split('\n').length);
  await app.evaluate(({clipboard})=>clipboard.writeText('whitespace sentinel'));
  await page.locator('pre>code').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(range);});
  assert.equal(await page.evaluate(()=>getSelection().toString()),whitespace);
  await page.keyboard.press(process.platform==='darwin'?'Meta+C':'Control+C');
  await assertNativeClipboard(whitespace,'whitespace native clipboard');
  // Logical numbering, three-digit gutter, and a wrapped source line retain one number.
  const hundred=Array.from({length:125},(_,i)=>i===99?'\t'+('界'.repeat(500)):'  line '+(i+1)).join('\n');
  await render(hundred,'text',{codeWrap:true,codeLineNumbers:true});
  const gutter=await page.locator('pre').evaluate(pre=>{const lines=pre.querySelectorAll('.code-line');return{digits:pre.style.getPropertyValue('--code-line-digits'),count:lines.length,last:lines[124].querySelector('.code-line-number').dataset.lineNumber,align:[lines[0],lines[99],lines[124]].map(line=>line.querySelector('.code-line-source').getBoundingClientRect().left),wrapped:lines[99].clientHeight>lines[98].clientHeight};});
  assert.equal(gutter.digits,'3');assert.equal(gutter.count,125);assert.equal(gutter.last,'125');assert.equal(new Set(gutter.align).size,1);assert.equal(gutter.wrapped,true);
  // Presentation follows Code mode and restores exactly after both preview types.
  const html='<!doctype html>\n<html><head><title>Example</title></head>\n<body><p>Example</p></body></html>';
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">\n<rect width="200" height="100" fill="blue"/>\n</svg>';
  for(const [language,source,toggle,preview] of [['html',html,'[data-toggle-html]','.code-html-preview'],['svg',svg,'[data-toggle-svg]','.code-svg-preview']]){
    await render(source,language,{codeWrap:true,codeLineNumbers:true});
    assert.equal(await page.locator('.code-line-number:visible').count(),source.split('\n').length);
    await page.locator(toggle).click();
    assert.equal(await page.locator(preview).isVisible(),true);
    assert.equal(await page.locator('pre>code').isVisible(),false);
    assert.equal(await page.locator('.code-line-number:visible').count(),0);
    if(language==='html')assert.equal(await app.evaluate(()=>global.htmlSource),source);
    await page.locator('pre .code-copy-button:not([data-toggle-html]):not([data-toggle-svg])').click();await assertClipboard(source,'preview Copy');
    await page.locator(toggle).click();assert.equal(await page.locator('pre>code').isVisible(),true);assert.equal(await page.locator('pre>code').textContent(),source);
    assert.equal(await page.locator('.code-line-number:visible').count(),source.split('\n').length);
  }
  // Failed SVG/HTML preview returns the original source with its display settings.
  await page.locator('[data-toggle-svg]').click();await page.locator('.code-svg-preview img').evaluate(img=>img.dispatchEvent(new Event('error')));
  assert.equal(await page.locator('pre>code').isVisible(),true);assert.equal(await page.locator('.code-line-number:visible').count(),3);
  await app.evaluate(()=>{global.failHtml=true});await render(html,'html',{codeWrap:true,codeLineNumbers:true});await page.locator('[data-toggle-html]').click();
  await page.waitForFunction(()=>!document.querySelector('pre>code').hidden);assert.equal(await page.locator('.code-line-number:visible').count(),3);await app.evaluate(()=>{global.failHtml=false});
  // Actual Mermaid success has no source gutter. Its original error view does.
  await render('flowchart TD\n  A --> B','mermaid',{codeWrap:true,codeLineNumbers:true});
  await page.locator('.mermaid-diagram svg').waitFor();assert.equal(await page.locator('.code-line-number').count(),0);
  const repair='graph LR\nA[Start] --> B[Label (with parentheses)]';
  await render(repair,'mermaid',{codeWrap:true,codeLineNumbers:true});
  await page.locator('.mermaid-block[data-mermaid-state="repaired"]').waitFor();assert.equal(await page.locator('.code-line-number').count(),0);
  await page.locator('[data-toggle-mermaid-version]').click();await page.locator('.mermaid-error-source').waitFor();
  assert.equal(await page.locator('.mermaid-error-source code').textContent(),repair);assert.equal(await page.locator('.code-line-number:visible').count(),2);
  await page.locator('[data-toggle-mermaid-version]').click();await page.locator('.mermaid-diagram svg').waitFor();assert.equal(await page.locator('.code-line-number').count(),0);
  // Large generated sources stay intact without expanding tens of thousands of nodes.
  const large='<!doctype html><html><head><title>Large</title></head><body>\n'+('\n'.repeat(10001))+'</body></html>';
  await render(large,'html',{codeWrap:true,codeLineNumbers:true});assert.equal(await page.locator('.code-line').count(),0);assert.equal(await page.locator('.code-block-note').isVisible(),true);
  assert.equal(await page.locator('pre>code').textContent(),large);
  await page.locator('[data-toggle-html]').click();assert.equal(await page.locator('.code-block-note').isVisible(),false);
  await page.locator('[data-toggle-html]').click();assert.equal(await page.locator('.code-block-note').isVisible(),true);
  await render(source);assert.equal(await page.locator('.code-line-number').count(),0);assert.equal(await page.locator('pre').evaluate(el=>el.classList.contains('code-wrap')),false);
  assert.deepEqual(errors,[]);
  const report={passed:true,checks:4,chromiumSandboxEnabled:true,pageErrors:0,optionCombinations:4,nativeClipboardExact:true,blockCopyExact:true,messageCopyExact:true,copyPayloadExact:true,desktopCopyBridge:true,wrapFits:true,logicalLineNumbers:true,renderGutterIsolation:{html:true,svg:true,mermaid:true},mermaidSourceRestored:true,largeBlockCapped:true,defaultsOff:true};
  if(process.env.CODE_OPTIONS_REPORT){await writeFile(process.env.CODE_OPTIONS_REPORT,JSON.stringify(report,null,2)+'\n');}else console.log(JSON.stringify(report));
} finally { await app?.close(); await rm(temp,{recursive:true,force:true}); }
