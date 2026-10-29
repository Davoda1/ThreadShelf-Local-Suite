#!/usr/bin/env node
// Bounded native renderer acceptance; fixtures are synthetic and contain no user data.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const root=fileURLToPath(new URL('..',import.meta.url));
const evidence=path.resolve(process.env.READER_EVIDENCE||path.join(root,'.citation-evidence'));
await mkdir(evidence,{recursive:true});
const tmp=await mkdtemp(path.join(os.tmpdir(),'reader-file-citations-'));
const playwright=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');
await build({stdin:{contents:`import {ConversationRenderer} from ${JSON.stringify(path.join(root,'src/reader/renderer.js'))};import ${JSON.stringify(path.join(root,'src/reader/reader.css'))};window.ConversationRenderer=ConversationRenderer;`,resolveDir:root},outfile:path.join(tmp,'test.js'),bundle:true,format:'iife',platform:'browser',logLevel:'silent'});
await writeFile(path.join(tmp,'index.html'),`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><link rel="stylesheet" href="./test.css"><style>html,body{margin:0;height:100%;overflow:hidden;font-family:Arial;background:#f7f8fb;color:#202830}html[data-theme=dark],html[data-theme=dark] body{background:#141820;color:#edf0f6}#host{height:100vh;overflow:auto;box-sizing:border-box;padding:16px;--text-accent:#1859b8;--text-secondary:#566273;--border-color:#c8cfda;--text-primary:#202830;--bg-primary:#f7f8fb;--bg-secondary:#fff;--bg-tertiary:#eef1f6;--code-bg:#edf0f5}html[data-theme=dark] #host{--text-accent:#99bfff;--text-secondary:#c0cad8;--border-color:#56657a;--text-primary:#edf0f6;--bg-primary:#141820;--bg-secondary:#1c232d;--bg-tertiary:#252e3b;--code-bg:#252e3b}.message{padding:14px;min-width:0}.message-content{min-width:0;line-height:1.7}.message-header{margin-bottom:12px}.message-content pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><div class="reader-view" id="host"></div><script src="./test.js"></script></body></html>`);
await writeFile(path.join(tmp,'main.cjs'),`const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({width:1000,height:800,show:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});w.loadFile(${JSON.stringify(path.join(tmp,'index.html'))});});`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await playwright._electron.launch({executablePath:process.env.READER_ELECTRON||path.join(root,'node_modules/electron/dist/electron'),args:['--no-sandbox','--disable-gpu',path.join(tmp,'main.cjs')],env,timeout:30000});
const page=await app.firstWindow();const errors=[];const requests=[];
page.on('pageerror',error=>errors.push(String(error)));
page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});
const passed=[],layouts=[];
const originalSVG=await readFile(path.join(root,'src/reader/assets/file-document.svg'),'utf8');
try{
 await page.waitForFunction(()=>!!window.ConversationRenderer);
 const original=await page.evaluate(()=>{
   window.copied=[];window.desktop={capabilities:{clipboardWrite:true},invoke:async(type,value)=>{if(type==='clipboard.write')window.copied.push(value.text);}};
   const citation=name=>':codex-file-citation{path="sandbox:/work/'+name+'" purpose="output"}';
   const literal=citation('example.pdf');
   const samples=[['report.pdf','main.cpp','types.h','bundle.js','backup.tar.xz','archive.7z','notes.txt','other.custommissing'].map(citation).join('\n\n'),
     'Literal example: `'+literal+'`\n\n```text\n'+literal+'\n```',
     JSON.stringify({reference:literal}),citation('árvíz_日本語_'+ 'long'.repeat(75)+'.zip'),citation('<img onerror=alert(1)>.txt')];
   window.renderer=new ConversationRenderer(document.getElementById('host'));
   renderer.renderMessages(samples.map((content,index)=>({role:'assistant',content,message_id:'fixture-'+index,turn_index:index})));
   return samples;
 });
 assert.equal(await page.locator('.ts-file-citation').count(),10);
 assert.equal(await page.locator('.ts-file-type').count(),9);
 assert.deepEqual(await page.locator('.ts-file-type').allTextContents(),['PDF','C++','C/C++ Header','JavaScript','TAR.XZ','7-Zip','Plain Text','ZIP','Plain Text']);
 assert.equal(await page.locator('.ts-file-icon').count(),10);
 assert.deepEqual(await page.locator('.message').evaluateAll(nodes=>nodes.map(node=>node.sourceText)),original);
 assert.equal(await page.locator('.message-content img').count(),0);
 passed.push('Real renderer and sanitizer preserve inert icon/name/type markup and original source');
 await page.locator('[data-copy-message]').first().click();
 await page.waitForFunction(()=>window.copied.length===1);
 assert.equal(await page.evaluate(()=>window.copied[0]),original[0]);
 passed.push('Copy message returns exact original citation source');
 const before=page.url();
 await page.locator('.ts-file-citation').first().click({force:true});
 assert.equal(page.url(),before);assert.equal(app.windows().length,1);
 assert.equal(await page.locator('.ts-file-citation[href],.ts-file-citation a,.ts-file-citation button').count(),0);
 assert.equal(await page.locator('.ts-file-citation[aria-disabled="true"]').count(),10);
 passed.push('Dummy references do not navigate, create windows, download or request remote files');
 const svgGeometry=await page.locator('.ts-file-icon').first().evaluate((icon,originalSVG)=>{
   const mask=getComputedStyle(icon).maskImage;
   const match=mask.match(/^url\(["']?(data:image\/svg\+xml[^"']+)["']?\)$/);
   if(!match)throw Error('No embedded SVG mask');
   const svg=new DOMParser().parseFromString(decodeURIComponent(match[1].slice(match[1].indexOf(',')+1)),'image/svg+xml');
   const original=new DOMParser().parseFromString(originalSVG,'image/svg+xml');
   const visiblePaths=[...original.querySelectorAll('path')].filter(node=>!node.getAttribute('style')?.includes('fill: none')).map(node=>node.getAttribute('d'));
   const paths=[...svg.querySelectorAll('path')].map(node=>node.getAttribute('d'));
   return {pathCount:paths.length,pathsMatch:JSON.stringify(paths)===JSON.stringify(visiblePaths),viewBox:svg.documentElement.getAttribute('viewBox'),scripts:svg.querySelectorAll('script,image,use,foreignObject,a').length,externalReferences:svg.querySelectorAll('[href],[src]').length};
 },originalSVG);
 assert.equal(svgGeometry.pathCount,6);assert.equal(svgGeometry.pathsMatch,true);
 assert.equal(svgGeometry.viewBox,'11.464 0 67.073 90');
 assert.equal(svgGeometry.scripts,0);assert.equal(svgGeometry.externalReferences,0);
 passed.push('Embedded SVG preserves all six supplied visible paths without external references');
 for(const theme of ['light','dark']){
   for(const [width,height] of [[1000,800],[680,540]]){
     await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
     await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setContentSize(width,height),{width,height});
     await page.waitForFunction(({width,height})=>innerWidth===width&&innerHeight===height,{width,height});
     const geometry=await page.evaluate(()=>{
       const host=document.getElementById('host');
       return {width:innerWidth,height:innerHeight,theme:document.documentElement.dataset.theme,documentOverflow:document.documentElement.scrollWidth>innerWidth+1,hostOverflow:host.scrollWidth>host.clientWidth+1,files:[...document.querySelectorAll('.ts-file-citation')].map(node=>{
         const icon=node.querySelector('.ts-file-icon'),css=getComputedStyle(icon),box=icon.getBoundingClientRect();
         return {width:node.getBoundingClientRect().width,max:node.parentElement.getBoundingClientRect().width,color:getComputedStyle(node.querySelector('.ts-file-name')).color,iconColor:css.color,paint:css.backgroundColor,iconWidth:box.width,iconHeight:box.height,font:parseFloat(css.fontSize),border:css.borderTopWidth,maskSize:css.maskSize,maskRepeat:css.maskRepeat,maskPosition:css.maskPosition,oldFold:getComputedStyle(icon,'::after').content};
       })};
     });
     assert.equal(geometry.documentOverflow,false);assert.equal(geometry.hostOverflow,false);
     for(const file of geometry.files){
       assert.ok(file.width<=file.max+1);
       assert.ok(Math.abs(file.iconWidth-file.font*.78)<.08&&Math.abs(file.iconHeight-file.font)<.08,JSON.stringify(file));
       assert.equal(file.color,file.iconColor);assert.equal(file.color,file.paint);
       assert.equal(file.border,'0px');assert.equal(file.maskSize,'contain');assert.equal(file.maskRepeat,'no-repeat');assert.equal(file.maskPosition,'50% 50%');assert.equal(file.oldFold,'none');
     }
     layouts.push(geometry);
     if(width===680)await page.screenshot({path:path.join(evidence,`file-citations-${theme}.png`)});
   }
 }
 passed.push('Four light/dark layouts retain .78em × 1em icon boxes, supplied proportions and matching text color');
 const inheritedColor=await page.locator('.ts-file-citation').first().evaluate(node=>{
   node.style.color='rgb(176, 55, 124)';
   const icon=getComputedStyle(node.querySelector('.ts-file-icon')),text=getComputedStyle(node.querySelector('.ts-file-name'));
   const result={icon:icon.backgroundColor,text:text.color};node.style.removeProperty('color');return result;
 });
 assert.equal(inheritedColor.icon,'rgb(176, 55, 124)');assert.equal(inheritedColor.icon,inheritedColor.text);
 passed.push('Icon tracks arbitrary inherited filename colors through currentColor');
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 const report={passed,checks:passed.length,svgGeometry,layouts,inheritedColor,errors,remoteRequests:requests};
 await writeFile(path.join(evidence,'file-citations-native.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}finally{await app.close();await rm(tmp,{recursive:true,force:true});}
