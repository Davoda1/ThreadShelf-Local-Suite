import { testModuleSpecifier } from './esm-module-specifier.mjs';
// Synthetic renderer regressions; requires Electron and Playwright, no server/archive.
import assert from 'node:assert/strict';
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
  await build({stdin:{contents:`import {ConversationRenderer} from './src/reader/renderer.js';import {applyCodeBlockPresentation} from './src/reader/code-presentation.js';import './src/reader/reader.css';import './src/reader/rich-layout.css';import './src/reader/rich-charts.css';window.ConversationRenderer=ConversationRenderer;window.applyCodeBlockPresentation=applyCodeBlockPresentation;`,resolveDir:root},outfile:path.join(temp,'app.js'),bundle:true,format:'iife',platform:'browser',logLevel:'silent'});
  await copyFile(path.join(root,'public/mermaid.min.js'),path.join(temp,'mermaid.min.js'));
  await writeFile(path.join(temp,'preload.cjs'),`const{contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('desktop',{invoke:(a,b)=>ipcRenderer.invoke('test:invoke',a,b)});`);
  await writeFile(path.join(temp,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="app.css"><style>html,body{margin:0;height:100%;overflow:hidden}body{font:14px Arial;--text-primary:#eee;--text-secondary:#aaa;--bg-primary:#161b22;--bg-secondary:#252b33;--bg-tertiary:#323a44;--border-color:#586574;--code-bg:#11151b;--code-header-bg:#252b33;--code-label-text:#ddd;background:#161b22}#host{height:100%;overflow:auto;box-sizing:border-box;padding:16px}.message-content{min-width:0}.message{max-width:100%;min-width:0}</style></head><body><div id="host" class="reader-view conversation-content"></div><script src="mermaid.min.js"></script><script src="app.js"></script></body></html>`);
  await writeFile(path.join(temp,'main.cjs'),`const{app,BrowserWindow,ipcMain,clipboard}=require('electron');app.setPath('userData',${JSON.stringify(path.join(temp,'profile'))});app.whenReady().then(async()=>{global.owner=new BrowserWindow({show:true,width:680,height:540,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,preload:${JSON.stringify(path.join(temp,'preload.cjs'))}}});global.calls=[];ipcMain.handle('test:invoke',(e,a,b)=>{global.calls.push(a);if(a==='clipboard.write'){clipboard.writeText(b.text);return{ok:true}}if(a==='html.preview.open'){global.htmlSource=b.source;if(global.failHtml)throw Error('Synthetic preview failure');}return{ok:true}});await global.owner.loadFile(${JSON.stringify(path.join(temp,'index.html'))});});`);
  const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE;
  app=await _electron.launch({executablePath:process.env.READER_ELECTRON,args:[path.join(temp,'main.cjs')],env,chromiumSandbox:true,timeout:45000});
  assert.equal(app.process().spawnargs.includes('--no-sandbox'),false);
  const page=await app.firstWindow(); await page.waitForFunction(()=>window.ConversationRenderer);
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const render=async(source,language='javascript',options={})=>page.evaluate(({source,language,options})=>{
    window.renderer?.destroy();
    const renderer=window.renderer=new ConversationRenderer(document.getElementById('host'));
    renderer.setCompactMessagesEnabled(false); renderer.setCodePresentation(options);
    window.markdown='```'+language+'\n'+source+'\n```';
    renderer.renderMessages([{role:'assistant',message_id:'synthetic-code',content:window.markdown}]);
  },{source,language,options});
  const evidence=[];
  await page.evaluate(()=>{
    const rules=[...document.styleSheets].flatMap(sheet=>[...sheet.cssRules]);
    window.previewRule=rules.find(rule=>rule.selectorText==='.code-html-preview');
    window.cornersRule=rules.find(rule=>rule.selectorText?.includes('pre.has-code-controls:has(')&&rule.selectorText?.includes('.code-html-preview:not([hidden])'));
    if(!window.previewRule||!window.cornersRule)throw Error('Expected current HTML-only rules not found');
    window.currentPreviewCss=window.previewRule.style.cssText;
    window.currentCornerCss=window.cornersRule.style.cssText;
  });
  const styleMode=async baseline=>page.evaluate(baseline=>{
    window.previewRule.style.cssText=window.currentPreviewCss;
    window.cornersRule.style.cssText=window.currentCornerCss;
    if(baseline){window.previewRule.style.width='calc(100% - 32px)';window.previewRule.style.margin='16px';window.cornersRule.style.removeProperty('border-bottom-left-radius');window.cornersRule.style.removeProperty('border-bottom-right-radius');}
  },baseline);
  const metrics=async selectors=>page.evaluate(selectors=>Object.fromEntries(selectors.map(selector=>[selector,[...document.querySelectorAll(selector)].map(el=>{
    const s=getComputedStyle(el),b=el.getBoundingClientRect();return{display:s.display,boxSizing:s.boxSizing,padding:[s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft],margin:[s.marginTop,s.marginRight,s.marginBottom,s.marginLeft],radius:[s.borderTopLeftRadius,s.borderTopRightRadius,s.borderBottomRightRadius,s.borderBottomLeftRadius],border:[s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth],overflow:[s.overflowX,s.overflowY],whiteSpace:s.whiteSpace,width:b.width,height:b.height,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,offsetLeft:el.offsetLeft,offsetTop:el.offsetTop};})])),selectors);
  const compare=async(label,selectors)=>{
    await styleMode(true);const before=await metrics(selectors);
    await styleMode(false);const after=await metrics(selectors);
    assert.deepEqual(after,before,label+' changed outside HTML Render');
    const counts=Object.fromEntries(Object.entries(after).map(([key,value])=>[key,value.length]));
    assert.ok(Object.values(counts).some(Boolean),label+' missing elements');
    evidence.push({label,identical:true,counts,metrics:after});
  };
  const codeSelectors=['.message-content pre','.message-content pre>code','.code-block-titlebar','.code-line','.code-line-number'];
  const html='<!doctype html>\n<html><head><title>Example</title></head>\n<body><p>Example</p></body></html>';
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">\n<rect width="200" height="100" fill="blue"/>\n</svg>';
  for(const size of [{width:680,height:540},{width:1100,height:780}]){
    await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(size.width,size.height),size);
    for(const options of [{codeWrap:false,codeLineNumbers:false},{codeWrap:true,codeLineNumbers:true}]){
      const suffix=`${size.width}x${size.height}/${options.codeWrap?'wrapped-numbered':'defaults'}`;
      await render('const message = "'+('preserve source '.repeat(30))+'";\n\n  console.log(message);','javascript',options);
      await compare('normal-code/'+suffix,codeSelectors);
      await render(html,'html',options);const htmlCode=await metrics(codeSelectors);
      await compare('html-source/'+suffix,codeSelectors);
      await page.locator('[data-toggle-html]').click();
      assert.equal(await page.locator('pre>code').isVisible(),false);
      const htmlRender=await metrics(['pre','.code-html-preview']);
      assert.deepEqual(htmlRender['.code-html-preview'][0].margin,['0px','0px','0px','0px']);
      assert.deepEqual(htmlRender.pre[0].radius.slice(2),['0px','0px']);
      assert.equal(htmlRender['.code-html-preview'][0].width,htmlRender.pre[0].clientWidth);
      await page.locator('[data-toggle-html]').click();
      assert.equal(await page.locator('pre>code').isVisible(),true);
      assert.deepEqual(await metrics(codeSelectors),htmlCode,'HTML Code restore must restore prior padding and rounded corners');
      await compare('html-restored-code/'+suffix,codeSelectors);
      await render(svg,'svg',options);
      await compare('svg-source/'+suffix,codeSelectors);
      await page.locator('[data-toggle-svg]').click();await page.waitForFunction(()=>document.querySelector('.code-svg-preview img').complete);
      await compare('svg-render/'+suffix,['pre','.code-block-titlebar','.code-svg-preview','.code-svg-preview img']);
      assert.deepEqual((await metrics(['pre'])).pre[0].radius,['8px','8px','8px','8px']);
      assert.deepEqual((await metrics(['.code-svg-preview']))['.code-svg-preview'][0].padding,['16px','16px','16px','16px']);
      await page.locator('[data-toggle-svg]').click();await compare('svg-restored-source/'+suffix,codeSelectors);
    }
    await render('flowchart TD\n A --> B','mermaid',{codeWrap:true,codeLineNumbers:true});
    await page.locator('.mermaid-diagram svg').waitFor();
    await compare('mermaid-render/'+size.width,['.mermaid-block','.mermaid-titlebar','.mermaid-diagram','.mermaid-diagram>svg']);
    await render('graph LR\nA[Start] --> B[Label (with parentheses)]','mermaid',{codeWrap:true,codeLineNumbers:true});
    await page.locator('.mermaid-block[data-mermaid-state="repaired"]').waitFor();
    await compare('mermaid-repaired-render/'+size.width,['.mermaid-block','.mermaid-titlebar','.mermaid-diagram','.mermaid-diagram>svg']);
    await page.locator('[data-toggle-mermaid-version]').click();await page.locator('.mermaid-error-source').waitFor();
    await compare('mermaid-original-error-source/'+size.width,['.mermaid-block','.mermaid-diagram','.mermaid-error-source','.mermaid-error-source>code','.code-line']);
    const rich='<Chart content={{"chartType":"bar","meta":{"title":"Synthetic values"},"xKey":"label","series":[{"dataKey":"value","label":"Series","valueSuffix":" ms"}],"data":[{"label":"Alpha","value":12},{"label":"Beta","value":4}]}} />';
    await page.evaluate(rich=>{window.renderer.renderMessages([{role:'assistant',message_id:'chart',content:rich}]);},rich);
    await page.locator('.rich-chart svg').waitFor();
    await compare('rich-chart/'+size.width,['.rich-chart','.rich-chart-viewport','.rich-chart svg','.rich-chart details','.rich-chart table']);
    assert.equal(await page.locator('.code-line-number').count(),0);
    await app.evaluate(()=>{global.calls=[]});
    await page.locator('#host').evaluate(el=>el.dispatchEvent(new Event('scroll')));await page.waitForTimeout(50);
    assert.deepEqual(await app.evaluate(()=>global.calls.filter(action=>action.startsWith('html.preview.'))),[],'scrolling a non-HTML renderer must not send preview updates');
  }
  assert.deepEqual(errors,[]);
  const report={passed:true,checks:evidence.length,chromiumSandboxEnabled:true,pageErrors:0,htmlOnlySpacing:true,results:evidence};
  if(process.env.HTML_MARGIN_SCOPE_REPORT){await writeFile(process.env.HTML_MARGIN_SCOPE_REPORT,JSON.stringify(report,null,2)+'\n');}else console.log(JSON.stringify(report));
} finally {await app?.close();await rm(temp,{recursive:true,force:true});}
