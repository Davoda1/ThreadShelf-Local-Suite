#!/usr/bin/env node
// Bounded native integration gate. Optional baseline is read from git, never shipped.
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
const { _electron }=await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE||'playwright');
const executablePath=process.env.READER_ELECTRON;
assert.ok(executablePath,'Set READER_ELECTRON to the native Electron executable');
const revision=process.env.MATHJAX_BASELINE_REV;
const old=relative=>execFileSync('git',['show',`${revision}:${relative}`],{cwd:root,maxBuffer:16*1024*1024});
const formulas=[String.raw`x^2+y^2=z^2`,String.raw`\frac{a+b}{\sqrt{c}}`,String.raw`\int_0^1 x^2\,dx`,String.raw`\sum_{n=1}^{\infty}\frac{1}{n^2}`,String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`,String.raw`\vec{x}\cdot\vec{y}`,String.raw`\text{score}(q,d)=\frac{q\cdot d}{\|q\|\,\|d\|}`,String.raw`A\xrightarrow{\alpha}B`];
let mode='reader',baseline=false;
const readerInit=s=>`const hljs={};\n${s.slice(s.indexOf('let assetsReady;'),s.indexOf('\nexport class ReaderView'))}\nwindow.mathReady=loadAssets();`;
const memory=new Map();
for(const app of ['reader','alternative']){
 const rel=app==='reader'?'apps/reader/src/reader/reader.js':'apps/alternative/vendor/math-config.js';
 const src=await readFile(path.join(root,rel),'utf8');
 memory.set(app+'-current',app==='reader'?readerInit(src):src);
 if(revision)memory.set(app+'-baseline',app==='reader'?readerInit(old(rel).toString()):old(rel));
}
const server=createServer(async(req,res)=>{
 try{
 const u=new URL(req.url,'http://localhost'),app=path.join(root,'apps',mode);
 if(u.pathname==='/renderer/index.html'){
  const actual=await readFile(path.join(app,mode==='reader'?'index.html':'renderer/index.html'),'utf8');
  const csp=actual.match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)[0];
  const scripts=mode==='reader'?['/init.js']:[...(!baseline?['/vendor/mathjax-original-tex-font.js','/vendor/mathjax-compat.js']:[]),'/init.js','/vendor/mathjax-tex-svg.js'];
  res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><head><meta charset="utf-8">${csp}<link rel="stylesheet" href="/test.css"></head><body><main id="math"></main>${scripts.map(s=>`<script src="${s}"></script>`).join('')}</body></html>`);return;
 }
 if(u.pathname==='/test.css'){res.setHeader('Content-Type','text/css');res.end('html,body{margin:0;background:#fff;color:#111;font:16px Arial}body.dark{background:#111;color:#eee}main{padding:16px}article{min-height:80px;margin:0;padding:8px;border-bottom:1px solid #888}');return;}
 if(u.pathname==='/security.js'){res.setHeader('Content-Type','text/javascript');res.end(`window.securityResult=(async()=>{
  const inline=document.createElement('script');inline.textContent='window.inlineRan=true';document.body.append(inline);
  let evalBlocked=false,fetchBlocked=false;try{eval('window.evalRan=true')}catch{evalBlocked=true;}
  const workerBlocked=await new Promise(resolve=>{let w;try{w=new Worker(URL.createObjectURL(new Blob(['postMessage(1)'],{type:'text/javascript'})));w.onerror=e=>{e.preventDefault();w.terminate();resolve(true)};w.onmessage=()=>{w.terminate();resolve(false)};setTimeout(()=>{w.terminate();resolve(false)},1500);}catch{resolve(true)}});
  try{await fetch('https://example.invalid/mathjax-test')}catch{fetchBlocked=true;}
  return {inlineRan:!!window.inlineRan,evalBlocked,workerBlocked,fetchBlocked};
})();`);return;}
 if(u.pathname==='/init.js'){res.setHeader('Content-Type','text/javascript');res.end(memory.get(mode+(baseline?'-baseline':'-current')));return;}
 let relative=mode==='reader'?'public/'+path.basename(u.pathname):u.pathname.slice(1);
 let file=path.resolve(app,relative);assert.ok(file.startsWith(app+path.sep));
 res.setHeader('Content-Type','text/javascript');res.end(baseline&&relative.endsWith('/mathjax-tex-svg.js')?old('apps/'+mode+'/'+relative):await readFile(file));
 }catch(e){res.statusCode=404;res.end('Unavailable');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const tmp=await mkdtemp(path.join(tmpdir(),'threadshelf-math-'));
await writeFile(path.join(tmp,'main.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(tmp,'profile'))});app.whenReady().then(()=>new BrowserWindow({show:${!process.env.MATHJAX_HEADLESS},webPreferences:{backgroundThrottling:false,sandbox:true,nodeIntegration:false,contextIsolation:true}}).loadURL('about:blank'));`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
let electron;
const results=[];
try{
 electron=await _electron.launch({executablePath,args:['--no-sandbox','--disable-gpu',...(process.env.MATHJAX_HEADLESS?['--ozone-platform=headless']:[]),path.join(tmp,'main.cjs')],env,timeout:30000});
 const context=electron.context(),page=await electron.firstWindow();page.setDefaultTimeout(12000);
 const external=[];await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():(external.push(route.request().url()),route.abort()));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));if(process.env.MATHJAX_DEBUG){page.on('console',m=>console.error('CONSOLE',m.type(),m.text()));page.on('requestfailed',r=>console.error('FAILED',r.url(),r.failure()));}
 async function render(which,isBaseline,width,dark){
  if(process.env.MATHJAX_DEBUG)console.error('RENDER',which,isBaseline,width,dark);mode=which;baseline=isBaseline;await page.setViewportSize({width,height:950});await page.goto(origin+'/renderer/index.html');
  await page.waitForFunction(()=>window.MathJax?.startup?.document&&typeof MathJax.tex2svgPromise==='function');
  const data=await Promise.race([page.evaluate(async({formulas,dark})=>{
   await Promise.race([window.mathReady||MathJax.startup.promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Math startup timed out')),12000))]);await MathJax.startup.promise;
   document.body.classList.toggle('dark',dark);const host=document.getElementById('math');
   for(const tex of formulas){const row=document.createElement('article');row.append(await MathJax.tex2svgPromise(tex,{display:true}));host.append(row);}
   MathJax.startup.document.updateDocument();await new Promise(r=>setTimeout(r,50));
   return {version:MathJax.version,node:typeof require,process:typeof process,font:MathJax.startup.document.outputJax.font.constructor.NAME,items:[...host.querySelectorAll('article')].map(n=>{const svg=n.querySelector('svg'),a=n.querySelector('mjx-assistive-mml'),r=svg.getBoundingClientRect(),s=getComputedStyle(a);return {width:r.width,height:r.height,viewBox:svg.getAttribute('viewBox'),paths:[...svg.querySelectorAll('path')].map(p=>p.getAttribute('d')),accessible:a.textContent,clip:s.clip,position:s.position,overflow:s.overflow,svgHidden:svg.getAttribute('aria-hidden'),count:n.querySelectorAll('mjx-container').length};})};
  },{formulas,dark}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Math evaluation exceeded 15 seconds')),15000))]);
  for(const item of data.items){assert.equal(item.count,1);assert.equal(item.position,'absolute');assert.equal(item.overflow,'hidden');assert.notEqual(item.clip,'auto');assert.equal(item.svgHidden,'true');assert.ok(item.width>0&&item.height>0);}
  assert.equal(data.node,'undefined');assert.equal(data.process,'undefined');
  const hash=process.env.MATHJAX_SKIP_PIXELS?null:createHash('sha256').update(await page.screenshot({fullPage:true})).digest('hex');
  if(!isBaseline){assert.equal(data.version,'4.1.3');assert.equal(data.font,'ThreadShelf-Original-TeX');}
  return {data,hash};
 }
 for(const app of ['reader','alternative'])for(const [width,dark] of [[680,false],[1100,true]]){
  const before=revision?await render(app,true,width,dark):null;
  const after=await render(app,false,width,dark);
  if(before){assert.deepEqual(after.data.items,before.data.items,`${app}: formula geometry, glyphs and accessible text match ${before.data.version}`);if(after.hash!==null)assert.equal(after.hash,before.hash,`${app}: rendered pixels match baseline`);}
  results.push({app,width,theme:dark?'dark':'light',version:after.data.version,formulas:formulas.length,baseline:before?.data.version,pixelMatch:before&&after.hash!==null?after.hash===before.hash:undefined});
 }
 const security=await page.evaluate(async()=>{await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/security.js';script.onload=resolve;script.onerror=reject;document.head.append(script)});return window.securityResult;});
 assert.deepEqual(security,{inlineRan:false,evalBlocked:true,workerBlocked:true,fetchBlocked:true});
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log(JSON.stringify({passed:true,results,security,externalRequests:external.length,pageErrors:errors.length},null,2));
}catch(e){console.error('Math gate:',e);throw e;}finally{if(electron)await Promise.race([electron.close(),new Promise(resolve=>setTimeout(resolve,3000))]);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(tmp,{recursive:true,force:true});}
