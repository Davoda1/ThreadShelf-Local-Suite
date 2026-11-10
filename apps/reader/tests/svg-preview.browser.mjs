#!/usr/bin/env node
import { testModuleSpecifier } from './esm-module-specifier.mjs';
// Production renderer and CSP regression. Chromium by default; READER_ELECTRON enables native verification.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { build } from 'esbuild';
import { createServer } from 'node:http';

const root = fileURLToPath(new URL('..', import.meta.url));
const { chromium, _electron } = await import(testModuleSpecifier(process.env.THREADSHELF_PLAYWRIGHT_MODULE || 'playwright'));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'reader-svg-preview-'));
const reportPath = path.resolve(process.env.READER_SVG_REPORT || path.join(root, '.verification', 'svg-preview.json'));
const {version} = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const passed = [], errors = [], requests = [], layouts = [];
let app, browser, server, fixtureOrigin;
try {
  await build({stdin:{contents:'import {ConversationRenderer} from "./src/reader/renderer.js";import "./src/reader/reader.css";window.ConversationRenderer=ConversationRenderer;',resolveDir:root},outfile:path.join(temporary,'renderer.js'),bundle:true,format:'iife',platform:'browser',logLevel:'silent'});
  await copyFile(path.join(root, 'public/mermaid.min.js'), path.join(temporary, 'mermaid.min.js'));
  const csp = (await readFile(path.join(root, 'index.html'), 'utf8')).match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)[0];
  await writeFile(path.join(temporary,'index.html'), `<!doctype html><html data-theme="light"><head><meta charset="utf-8">${csp}<link rel="stylesheet" href="renderer.css"><style>html,body{margin:0;height:100%;overflow:hidden;font:14px Arial}#host{height:100vh;overflow:auto;box-sizing:border-box;padding:16px;--text-secondary:#536273;--text-primary:#162432;--border-color:#a4afbc;--bg-primary:#fff;--bg-secondary:#f6f8fa;--bg-tertiary:#e9edf1;--code-bg:#f6f8fa;--code-header-bg:#edf1f5;--code-label-text:#253443}html[data-theme=dark] #host{color:#eef2f7;background:#12171d;--text-secondary:#b9c6d6;--text-primary:#eef2f7;--border-color:#657484;--bg-primary:#12171d;--bg-secondary:#1b2430;--bg-tertiary:#293443;--code-bg:#1b2430;--code-header-bg:#293443;--code-label-text:#e2e9f1}.message{padding:12px;min-width:0}.message-content{min-width:0;line-height:1.6}.message-header{margin-bottom:10px}</style></head><body><div class="reader-view"><div id="host" class="conversation-content"></div></div><script src="mermaid.min.js"></script><script src="renderer.js"></script></body></html>`);
  await writeFile(path.join(temporary,'main.cjs'), `const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({width:1000,height:760,show:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});w.loadFile(${JSON.stringify(path.join(temporary,'index.html'))});});`);
  let page;
  if (process.env.READER_ELECTRON) {
    const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({executablePath:process.env.READER_ELECTRON,args:['--no-sandbox','--disable-gpu',...(process.env.READER_HEADLESS==='1'?['--ozone-platform=headless','--ozone-override-screen-size=1920,1080']:[]),path.join(temporary,'main.cjs')],env,timeout:45000});
    page = await app.firstWindow();
  } else {
    server = createServer(async (request, response) => {
      const name = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
      if (!['index.html', 'renderer.js', 'renderer.css', 'mermaid.min.js'].includes(name)) { response.writeHead(404); response.end(); return; }
      try {
        const data = await readFile(path.join(temporary, name));
        response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
        response.end(data);
      } catch { response.writeHead(404); response.end(); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    fixtureOrigin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({headless:true,...(process.env.READER_CHROMIUM ? {executablePath:process.env.READER_CHROMIUM} : {}),args:['--no-sandbox']});
    page = await browser.newPage({viewport:{width:1000,height:760}});
  }
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== fixtureOrigin) requests.push(request.url()); });
  if (!app) await page.goto(fixtureOrigin + '/');
  await page.waitForFunction(() => !!window.ConversationRenderer);
  await page.evaluate(() => {
    window.copied = [];
    window.svgExecuted = false;
    window.desktop = {capabilities:{clipboardWrite:true},invoke:async (action,args) => {if(action === 'clipboard.write') copied.push(args.text);}};
    window.renderer = new ConversationRenderer(document.getElementById('host'));
    renderer.setCompactMessagesEnabled(false);
  });
  if (app) assert.deepEqual(await app.evaluate(({BrowserWindow}) => {const p=BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();return {sandbox:p.sandbox,contextIsolation:p.contextIsolation,nodeIntegration:p.nodeIntegration};}),{sandbox:true,contextIsolation:true,nodeIntegration:false});
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 100"><defs><linearGradient id="g"><stop stop-color="#06c"/><stop offset="1" stop-color="#08a"/></linearGradient></defs><rect width="320" height="100" fill="url(#g)"/><text x="12" y="56" fill="white">Árvíztűrő 日本語 😀</text></svg>';
  const base64 = Buffer.from(svg).toString('base64');
  const samples = [
    {name:'svg fence', fence:'svg', source:svg, eligible:true},
    {name:'xml fence', fence:'xml', source:svg, eligible:true},
    {name:'untagged', fence:'', source:svg, eligible:true},
    {name:'comments outside', fence:'svg', source:' \n<!-- before -->\n'+svg+'\n<!-- after -->\t ', eligible:true},
    {name:'namespace omitted', fence:'svg', source:'<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/></svg>', eligible:true},
    {name:'base64', fence:'', source:base64, eligible:true},
    {name:'base64 URI', fence:'xml', source:'data:image/svg+xml;base64,'+base64, eligible:true},
    {name:'base64 line wraps', fence:'svg', source:base64.match(/.{1,60}/g).join('\n'), eligible:true},
    {name:'HTML document', fence:'xml', source:'<html><body>'+svg+'</body></html>', eligible:false},
    {name:'HTML fragment', fence:'', source:'<div>'+svg+'</div>', eligible:false},
    {name:'text tag', fence:'text', source:svg, eligible:false},
    {name:'HTML tag', fence:'html', source:svg, eligible:false},
    {name:'JS tag', fence:'javascript', source:svg, eligible:false},
    {name:'extra prose', fence:'svg', source:'Here is the image: '+svg, eligible:false},
    {name:'extra trailing prose', fence:'xml', source:svg+' extra', eligible:false},
    {name:'second root', fence:'svg', source:svg+svg, eligible:false},
    {name:'extra element', fence:'xml', source:svg+'<p/>', eligible:false},
    {name:'unclosed SVG', fence:'svg', source:'<svg><rect></svg>', eligible:false},
    {name:'invalid comment', fence:'svg', source:'<!-- bad -- comment -->'+svg, eligible:false},
    {name:'wrong namespace', fence:'xml', source:'<svg xmlns="https://invalid.example/"></svg>', eligible:false},
    {name:'duplicate namespace', fence:'svg', source:'<svg xmlns="http://www.w3.org/2000/svg" xmlns="http://www.w3.org/2000/svg"></svg>', eligible:false},
    {name:'duplicate nested namespace', fence:'xml', source:'<svg><g xmlns:x="urn:x" xmlns:x="urn:x"/></svg>', eligible:false},
    {name:'base64 of HTML', fence:'svg', source:Buffer.from('<html>'+svg+'</html>').toString('base64'), eligible:false},
    {name:'base64 invalid alphabet', fence:'', source:base64+'!', eligible:false},
    {name:'base64 invalid UTF8', fence:'svg', source:Buffer.from([0xff,0xfe,0x3c]).toString('base64'), eligible:false},
    {name:'DTD and entity', fence:'svg', source:'<!DOCTYPE svg [<!ENTITY a "expanded">]><svg>&a;</svg>', eligible:false},
    {name:'processing instruction', fence:'xml', source:'<?xml-stylesheet href="https://invalid.example/x"?><svg/>', eligible:false},
  ];
  await page.evaluate(samples => renderer.renderMessages(samples.map((sample,index)=>({role:'assistant',content:'```'+sample.fence+'\n'+sample.source+'\n```',message_id:'svg-'+index,turn_index:index}))),samples);
  const blocks = page.locator('.message-content pre');
  assert.equal(await blocks.count(),samples.length);
  for (let index=0; index<samples.length; index++) {
    const sample=samples[index], block=blocks.nth(index);
    assert.equal(await block.locator('[data-toggle-svg]').count(),Number(sample.eligible),sample.name);
    assert.equal(await block.locator('code').textContent(),sample.source,sample.name+' original text');
    await block.locator('.code-copy-button:not([data-toggle-svg])').click();
    assert.equal(await page.evaluate(()=>copied.at(-1)),sample.source,sample.name+' original copy');
    if (!sample.eligible) continue;
    const toggle=block.locator('[data-toggle-svg]');
    assert.equal(await toggle.textContent(),'SVG');
    assert.equal(await block.locator('.code-svg-preview img[src]').count(),0,'image decoding stays lazy');
    for(let pass=0;pass<2;pass++) {
      await toggle.click();
      await block.locator('.code-svg-preview img').evaluate(image => image.decode());
      assert.equal(await toggle.textContent(),'Code');
      assert.equal(await toggle.getAttribute('aria-pressed'),'true');
      assert.equal(await block.locator('code').isVisible(),false);
      assert.equal(await block.locator('.code-svg-preview').isVisible(),true);
      await block.locator('.code-copy-button:not([data-toggle-svg])').click();
      assert.equal(await page.evaluate(()=>copied.at(-1)),sample.source,sample.name+' image-view copy');
      await toggle.click();
      assert.equal(await block.locator('code').isVisible(),true);
      assert.equal(await toggle.getAttribute('aria-pressed'),'false');
    }
  }
  passed.push('27 actual rendered eligibility cases, lazy decoding, repeated toggles and exact copying in both modes');
  const hostile='<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100" onload="parent.svgExecuted=true"><script>parent.svgExecuted=true;fetch("https://svg-preview.invalid/script")</script><style>@import url("https://svg-preview.invalid/style");rect{fill:url("https://svg-preview.invalid/paint")}</style><image href="https://svg-preview.invalid/image"/><use href="https://svg-preview.invalid/use#x"/><foreignObject width="100" height="100"><div xmlns="http://www.w3.org/1999/xhtml"><img src="https://svg-preview.invalid/html-image" onerror="parent.svgExecuted=true"/><iframe src="https://svg-preview.invalid/frame"/></div></foreignObject><a href="https://svg-preview.invalid/link"><text x="10" y="20">Inert image</text></a></svg>';
  await page.evaluate(source=>renderer.renderMessages([{role:'assistant',content:'```svg\n'+source+'\n```',message_id:'security'}]),hostile);
  await page.locator('[data-toggle-svg]').click();
  await page.locator('.code-svg-preview img').evaluate(image=>image.decode());
  assert.equal(await page.evaluate(()=>window.svgExecuted),false);
  assert.equal(await page.locator('.message-content script,.message-content foreignObject,.message-content iframe').count(),0);
  assert.equal(await page.locator('.code-svg-preview img').getAttribute('draggable'),'false');
  assert.deepEqual(await page.locator('.code-svg-preview img').evaluate(image=>['click','auxclick','contextmenu','dragstart'].map(type=>image.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true})))),[false,false,false,false]);
  await page.locator('.code-copy-button:not([data-toggle-svg])').click();
  assert.equal(await page.evaluate(()=>copied.at(-1)),hostile);
  passed.push('Secure SVG image mode blocks scripts, events, foreign markup navigation and all external resources while preserving source');
  for(const theme of ['light','dark']) for(const [width,height] of [[680,540],[1280,800]]) {
    if (app) await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(...size),[width,height]);
    else await page.setViewportSize({width,height});
    await page.waitForFunction(({width,height})=>innerWidth===width&&innerHeight===height,{width,height});
    await page.evaluate(({theme,svg})=>{document.documentElement.dataset.theme=theme;renderer.renderMessages([{role:'assistant',content:'```svg\n'+svg+'\n```',message_id:'layout'}]);},{theme,svg});
    await page.locator('[data-toggle-svg]').click();
    await page.locator('.code-svg-preview img').evaluate(image=>image.decode());
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const layout=await page.evaluate(()=>{const pre=document.querySelector('.message-content pre'),image=pre.querySelector('img'),toggle=pre.querySelector('[data-toggle-svg]'),copy=pre.querySelector('.code-copy-button:not([data-toggle-svg])'),p=pre.getBoundingClientRect(),a=image.getBoundingClientRect(),b=toggle.getBoundingClientRect(),c=copy.getBoundingClientRect();return {documentOverflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,imageFits:a.left>=p.left&&a.right<=p.right+1&&a.height<=innerHeight*.65+1,controlsFit:b.left>=p.left&&c.right<=p.right+1&&b.right<=c.left,loaded:image.naturalWidth>0};});
    assert.deepEqual(layout,{documentOverflow:false,imageFits:true,controlsFit:true,loaded:true});
    await page.evaluate(()=>document.fonts.ready);
    const whiteTextPixels=await page.locator('.code-svg-preview img').evaluate(image=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=100;const context=canvas.getContext('2d');context.drawImage(image,0,0,320,100);const pixels=context.getImageData(0,0,320,100).data;let white=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>230&&pixels[i+1]>230&&pixels[i+2]>230&&pixels[i+3]>230)white++;return white;});
    assert.ok(whiteTextPixels>100, 'SVG white text remains painted in both themes');
    layouts.push({theme,width,height,...layout,whiteTextPixels});
    if(width===680 && process.env.READER_SCREENSHOTS) {
      await mkdir(process.env.READER_SCREENSHOTS,{recursive:true});
      await page.screenshot({path:path.join(process.env.READER_SCREENSHOTS,`reader-svg-${theme}-680.png`),animations:'disabled'});
    }
  }
  passed.push('Preview and controls fit light/dark 680×540 and 1280×800 layouts without document scroll');
  await page.locator('.code-svg-preview img').dispatchEvent('error');
  assert.equal(await page.locator('pre code').isVisible(),true);
  assert.equal(await page.locator('.code-svg-preview').isVisible(),false);
  assert.equal(await page.locator('[data-toggle-svg]').isDisabled(),true);
  assert.equal(await page.locator('[data-toggle-svg]').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('[data-toggle-svg]').getAttribute('aria-label'),'SVG preview unavailable');
  await page.locator('.code-copy-button:not([data-toggle-svg])').click();
  assert.equal(await page.evaluate(()=>copied.at(-1)),svg);
  passed.push('Image decode failure restores original code and usable Copy without a broken preview');

  const ordinary='const answer = 42;\nconsole.log(answer);';
  const mermaid='graph LR\n  A[Vendor Feeds (nginx, Node.js, PHP, DB)] --> B[Review findings]';
  await page.evaluate(({ordinary,mermaid})=>renderer.renderMessages([{role:'assistant',content:'```javascript\n'+ordinary+'\n```\n\n```mermaid\n'+mermaid+'\n```',message_id:'regression'}]),{ordinary,mermaid});
  assert.equal(await page.locator('[data-toggle-svg]').count(),0);
  assert.ok(await page.locator('pre code .hljs-keyword').count()>0);
  await page.locator('pre .code-copy-button').click();
  assert.equal(await page.evaluate(()=>copied.at(-1)),ordinary);
  await page.waitForFunction(()=>document.querySelector('.mermaid-version-toggle')?.hidden===false);
  await page.locator('[data-toggle-mermaid-version]').click();
  assert.equal(await page.locator('[data-toggle-mermaid-version]').textContent(),'Original');
  await page.locator('[data-copy-mermaid]').click();
  assert.equal(await page.evaluate(()=>copied.at(-1)),mermaid);
  await page.locator('[data-toggle-mermaid-version]').click();
  assert.equal(await page.locator('[data-toggle-mermaid-version]').textContent(),'Repaired');
  passed.push('Ordinary syntax highlighting/Copy and real Mermaid Repaired/Original controls retain existing behavior');
  assert.deepEqual(requests,[]);
  assert.deepEqual(errors,[]);
  const report = {passed:true,version,runtime:app ? 'electron' : 'chromium',fixtures:samples.length,checks:passed.length,checkDetails:passed,layouts,requests,errors};
  await mkdir(path.dirname(reportPath),{recursive:true});
  await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally {
  if(app) await app.close().catch(()=>{});
  if(browser) await browser.close().catch(()=>{});
  if(server) { server.closeAllConnections?.(); await new Promise(resolve=>server.close(resolve)); }
  await rm(temporary,{recursive:true,force:true});
}
