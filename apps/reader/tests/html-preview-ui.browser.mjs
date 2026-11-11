import { testModuleSpecifier } from './esm-module-specifier.mjs';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import{build}from'esbuild';
const driver=process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright';
const {_electron}=await import(testModuleSpecifier(driver));
const root=fileURLToPath(new URL('..',import.meta.url)),temp=await mkdtemp(path.join(os.tmpdir(),'html-preview-ui-'));
const hostPath=path.join(root,'src/desktop/html-preview-host.cjs');
const preloadPath=path.join(root,'src/desktop/preload.cjs'),trustedPath=path.join(root,'src/desktop/trusted-entry.cjs'),pagePath=path.join(temp,'index.html');
await build({stdin:{contents:'import {ConversationRenderer} from "./src/reader/renderer.js";import "./src/reader/reader.css";window.ConversationRenderer=ConversationRenderer;',resolveDir:root},outfile:path.join(temp,'app.js'),bundle:true,format:'iife',platform:'browser',logLevel:'silent'});
await writeFile(path.join(temp,'index.html'),'<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="app.css"><style>html,body{margin:0;height:100%;overflow:hidden}body{font:14px Arial;background:var(--surface);--surface:#fff;--muted:#66758a;--border:#dce1e8;--text-primary:#202020;--text-secondary:#555;--bg-primary:#fff;--bg-secondary:#eee;--border-color:#888;--text-accent:#12628b}body.dark{--surface:#1d242e;--muted:#9daabc;--border:#333e4c;--text-primary:#eee;--text-secondary:#ccc;--bg-primary:#111;--bg-secondary:#333;color:#eee}#host{height:100%;overflow:auto;box-sizing:border-box;padding:16px}.message-content{min-width:0}.message{max-width:100%;min-width:0}</style></head><body><div id="host" class="reader-view conversation-content"></div><script src="app.js"></script></body></html>');
await writeFile(path.join(temp,'main.cjs'),`const{app,BrowserWindow,ipcMain}=require('electron');
const{isTrustedMainFrame}=require(${JSON.stringify(trustedPath)});
const{createHtmlPreviewHost}=require(${JSON.stringify(hostPath)});
global.execFileSync=require('node:child_process').execFileSync;
app.setPath('userData',${JSON.stringify(path.join(temp,'profile'))});
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:true,width:680,height:540,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,preload:${JSON.stringify(preloadPath)}}});
 const trusted=event=>isTrustedMainFrame(event,win.webContents,${JSON.stringify(pathToFileURL(pagePath).href)},{allowFragment:true});
 global.previewHost=createHtmlPreviewHost({getWindow:()=>win,getExternalEnabled:()=>false,onEvent:v=>win.webContents.send('reader:html-preview',v)});global.owner=win;
 global.previewHost.registerGeometryIpc('reader:html-preview-geometry',trusted);
 ipcMain.handle('reader:invoke',(event,action,args)=>{if(!trusted(event))throw new Error('Untrusted test application request.');if(action==='clipboard.write'){global.clipboardText=args.text;return {ok:true}}return global.previewHost.invoke(action,args)});
 await win.loadFile(${JSON.stringify(pagePath)});
});app.on('before-quit',()=>global.previewHost?.dispose());`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({chromiumSandbox:true,executablePath:process.env.READER_ELECTRON,args:[path.join(temp,'main.cjs')],env,timeout:45000});
assert.equal(await app.evaluate(({app})=>app.commandLine.hasSwitch('no-sandbox')),false);
const page=await app.firstWindow();await page.waitForFunction(()=>typeof window.ConversationRenderer==='function');const errors=[];page.on('pageerror',e=>errors.push(e.message));const results=[];
const source='<!doctype html>\n<html><head><title>Preview</title><style>body{font:16px sans-serif;background:#eef6ff;color:#123}button{padding:8px}</style></head><body><h2>HTML preview</h2><button onclick="document.querySelector(\'output\').textContent=++window.count">Add</button><output>0</output><script>window.count=0;document.body.dataset.ready="yes"</script></body></html>';
const nativeStatus=()=>app.evaluate(()=>{const entry=[...global.previewHost.entries.values()][0];return {visible:entry.clipView.getVisible(),bounds:entry.clipView.getBounds(),viewport:entry.view.getBounds()};});
async function checkScrolling(){
const path=await page.evaluate(()=>{const host=document.querySelector('#host'),node=document.querySelector('.code-html-preview'),spacer=document.createElement('div');spacer.id='scroll-test-spacer';spacer.style.cssText='height:1200px;flex:0 0 1200px';host.append(spacer);return {start:host.scrollTop,end:Math.min(host.scrollHeight-host.clientHeight,node.getBoundingClientRect().bottom+host.scrollTop+60)};});
const positions=Array.from({length:17},(_,i)=>path.start+(path.end-path.start)*i/16);let visible=0,hidden=0;
for(const top of [...positions,...positions.slice(0,-1).reverse()]){
await page.evaluate(async top=>{document.querySelector('#host').scrollTop=top;await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);},top);
const clip=await page.locator('.code-html-preview').evaluate(node=>{const r=node.getBoundingClientRect(),h=document.querySelector('#host'),b=h.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,minX:Math.max(r.left,b.left+h.clientLeft),maxX:Math.min(r.right,b.left+h.clientLeft+h.clientWidth),minY:Math.max(r.top,b.top+h.clientTop),maxY:Math.min(r.bottom,b.top+h.clientTop+h.clientHeight)};});
const native=await nativeStatus();
if(clip.maxY-clip.minY<1){assert.equal(native.visible,false,JSON.stringify({top,native,clip}));hidden++;continue;}
assert.equal(native.visible,true,JSON.stringify({top,native,clip}));visible++;
assert.ok(Math.abs(native.bounds.x+native.viewport.x-clip.left)<=1&&Math.abs(native.bounds.y+native.viewport.y-clip.top)<=1,JSON.stringify({top,native,clip}));
assert.ok(native.bounds.x>=clip.minX-1&&native.bounds.x+native.bounds.width<=clip.maxX+1&&native.bounds.y>=clip.minY-1&&native.bounds.y+native.bounds.height<=clip.maxY+1,JSON.stringify({top,native,clip}));
}
await page.evaluate(()=>document.getElementById('scroll-test-spacer').remove());assert.ok(visible>10&&hidden>0,JSON.stringify({path,visible,hidden}));return {samples:positions.length*2-1,visible,hidden};
}
try{
for(const theme of ['light','dark'])for(const size of[{width:680,height:540},{width:1100,height:780},{width:1500,height:540}]){
await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(size.width,size.height),size);
await page.waitForFunction(size=>innerWidth===size.width&&innerHeight===size.height,size);
await page.evaluate(({theme,source})=>{window.renderer?.destroy();document.body.className=theme==='dark'?'dark':'';const renderer=window.renderer=new ConversationRenderer(document.querySelector('#host'));renderer.setCompactMessagesEnabled(false);renderer.renderMessages([{role:'assistant',message_id:'one',content:'```html\n'+source+'\n```'}]);},{theme,source});
assert.equal(await page.locator('[data-toggle-html]').count(),1);assert.equal(await page.locator('.code-html-preview').isVisible(),false);
await page.locator('[data-toggle-html]').click();
await poll(async()=>assert.equal(await app.evaluate(()=>[...global.previewHost.entries.values()][0]?.clipView.getVisible()),true));
const status=await app.evaluate(()=>{const entry=[...global.previewHost.entries.values()][0];return entry?{visible:entry.clipView.getVisible(),bounds:entry.clipView.getBounds(),viewport:entry.view.getBounds(),process:entry.view.webContents.getOSProcessId(),owner:global.owner.webContents.getOSProcessId()}:null;});
assert.ok(status,theme+size.width);assert.equal(status.visible,true,JSON.stringify(status));assert.notEqual(status.process,status.owner);assert.ok(status.bounds.x>=0&&status.bounds.y>=0&&status.bounds.x+status.bounds.width<=size.width+1&&status.bounds.y+status.bounds.height<=size.height+1);
assert.equal(await app.evaluate(async()=>[...global.previewHost.entries.values()][0].view.webContents.executeJavaScript('document.body.dataset.ready')),'yes');
const layout=await page.locator('.code-html-preview').evaluate(node=>{const rect=node.getBoundingClientRect(),parent=node.parentElement,box=parent.getBoundingClientRect(),style=getComputedStyle(node),toolbar=parent.querySelector('.code-block-titlebar').getBoundingClientRect();return {width:rect.width,height:rect.height,left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,box:{left:box.left+parent.clientLeft,right:box.left+parent.clientLeft+parent.clientWidth,bottom:box.top+parent.clientTop+parent.clientHeight},toolbarBottom:toolbar.bottom,background:style.backgroundColor,margin:style.margin,padding:style.padding};});
assert.ok(Math.abs(layout.width/layout.height-16/9)<0.002,JSON.stringify(layout));
assert.equal(layout.background,'rgba(0, 0, 0, 0)');
assert.equal(layout.margin,'0px');assert.equal(layout.padding,'0px');
assert.ok(Math.abs(layout.left-layout.box.left)<1&&Math.abs(layout.right-layout.box.right)<1&&Math.abs(layout.bottom-layout.box.bottom)<1&&Math.abs(layout.top-layout.toolbarBottom)<1,JSON.stringify(layout));
assert.ok(Math.abs(status.bounds.x+status.viewport.x-layout.left)<=1&&Math.abs(status.bounds.y+status.viewport.y-layout.top)<=1,JSON.stringify({status,layout}));
assert.ok(Math.abs(status.viewport.width-layout.width)<=1&&Math.abs(status.viewport.height-layout.height)<=1,JSON.stringify(status));
if(size.width===1500){assert.ok(status.viewport.height>320,JSON.stringify(status));assert.ok(status.bounds.height<status.viewport.height,JSON.stringify(status));}
assert.equal(await page.locator('input[type="range"]').count(),0);
await page.evaluate(()=>{const modal=document.createElement('div');modal.id='test-overlay';modal.setAttribute('role','dialog');modal.style='position:fixed;inset:0;z-index:9999;background:#444';document.body.append(modal);});await poll(async()=>assert.equal(await app.evaluate(()=>[...global.previewHost.entries.values()][0].clipView.getVisible()),false));
await page.evaluate(()=>document.getElementById('test-overlay').remove());await poll(async()=>assert.equal(await app.evaluate(()=>[...global.previewHost.entries.values()][0].clipView.getVisible()),true));
const scrolling=await checkScrolling();
if(process.env.READER_SCREENSHOT_DIR){await mkdir(process.env.READER_SCREENSHOT_DIR,{recursive:true});await app.evaluate((_electron,filename)=>{const b=global.owner.getBounds();global.execFileSync('python3',['-c','from PIL import ImageGrab; import os,sys,json; b=json.loads(sys.argv[2]); im=ImageGrab.grab(xdisplay=os.environ["DISPLAY"]); im.crop((b["x"],b["y"],b["x"]+b["width"],b["y"]+b["height"])).save(sys.argv[1])',filename,JSON.stringify(b)]);},path.join(process.env.READER_SCREENSHOT_DIR,`reader-html-${theme}-${size.width}.png`));}
await page.locator('[data-toggle-html]').click();await poll(async()=>assert.equal(await app.evaluate(()=>global.previewHost.entries.size),0));assert.equal(await page.locator('pre>code').isVisible(),true);assert.equal(await page.locator('pre>code').getAttribute('data-original-code'),source);
assert.equal(await page.locator('pre>code').evaluate(code=>parseFloat(getComputedStyle(code).paddingLeft)>0&&parseFloat(getComputedStyle(code.parentElement).borderBottomLeftRadius)>0),true);
const errorCodeStyle=await page.locator('.code-html-preview').evaluate(node=>{node.dataset.previewError='true';node.hidden=false;node.textContent='Preview unavailable.';const style=getComputedStyle(node.parentElement),result={radius:parseFloat(style.borderBottomLeftRadius),overflow:style.overflowX,codeVisible:!node.parentElement.querySelector('code').hidden};node.hidden=true;node.textContent='';delete node.dataset.previewError;return result;});
assert.ok(errorCodeStyle.radius>0&&errorCodeStyle.overflow==='auto'&&errorCodeStyle.codeVisible,JSON.stringify(errorCodeStyle));
results.push({theme,size,visible:true,separateProcess:true,overlayHidden:true,controlsFit:true,aspectRatio:'16:9',transparentPlaceholder:true,contained:true,flushInterior:true,initialPlacementWithoutExtraScroll:true,scrolling,partiallyClipped:status.bounds.height<status.viewport.height,originalSource:true});
}
assert.deepEqual(errors,[]);const report={passed:true,checks:results.length,chromiumSandboxEnabled:true,pageErrors:0,initialPlacement:true,fullWidth16by9:true,scrollContained:true,results};if(process.env.HTML_PREVIEW_UI_REPORT){await writeFile(process.env.HTML_PREVIEW_UI_REPORT,JSON.stringify(report,null,2)+'\n');}else console.log(JSON.stringify(report));
}finally{await app.close();await rm(temp,{recursive:true,force:true});}

async function poll(check){let last;for(let index=0;index<100;index++){try{return await check();}catch(error){last=error;}await new Promise(resolve=>setTimeout(resolve,50));}throw last;}
