const { app, BrowserWindow }=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const { createHtmlPreviewHost }=require('../src/desktop/html-preview-host.cjs');
// The zoom regression must not inherit a prior Electron run's saved data-URL zoom.
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'threadshelf-html-host-'));
app.setPath('userData',profile);
const cleanup=()=>{try{fs.rmSync(profile,{recursive:true,force:true});}catch{/* Chromium may retain profile locks until process exit on Windows. */}};
app.commandLine.appendSwitch('disable-gpu');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const reportFile=process.env.HTML_PREVIEW_HOST_REPORT ? path.resolve(process.env.HTML_PREVIEW_HOST_REPORT) : null;
const page=body=>`<!DOCTYPE html><html><head><title>Preview test</title></head><body>${body}</body></html>`;
let owner,host,external=false;
(async()=>{if(reportFile)fs.rmSync(reportFile,{force:true});assert.equal(app.commandLine.hasSwitch('no-sandbox'),false);await app.whenReady();owner=new BrowserWindow({width:680,height:540,show:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});await owner.loadURL('data:text/html,<body>Trusted application</body>');
const events=[];host=createHtmlPreviewHost({getWindow:()=>owner,getExternalEnabled:()=>external,openExternal:()=>assert.fail('No automatic browser launch'),onEvent:e=>events.push(e)});
const source=page(`<h1>Isolated preview</h1><p id="value">0</p><button id="add" onclick="document.getElementById('value').textContent=Number(document.getElementById('value').textContent)+1">Add</button><script>document.body.dataset.script='ran';document.body.dataset.node=typeof require;document.body.dataset.bridge=typeof window.desktop;fetch('https://example.com').then(()=>document.body.dataset.network='allowed').catch(()=>document.body.dataset.network='blocked');window.open('https://example.com');</script>`);
await host.invoke('html.preview.open',{id:'test',source,language:'html',bounds:{x:20,y:90,width:620,height:300}});await delay(1200);
let entry=host.entries.get('test');assert.ok(entry);const wc=entry.view.webContents;
const result=await wc.executeJavaScript(`({script:document.body.dataset.script,node:document.body.dataset.node,bridge:document.body.dataset.bridge,network:document.body.dataset.network,storage:(()=>{try{localStorage.setItem('x','y');return 'available'}catch{return 'blocked'}})()})`);
assert.deepEqual(result,{script:'ran',node:'undefined',bridge:'undefined',network:'blocked',storage:'blocked'});
assert.notEqual(wc.getOSProcessId(),owner.webContents.getOSProcessId());assert.equal(wc.getLastWebPreferences().sandbox,true);assert.equal(wc.getLastWebPreferences().nodeIntegration,false);
await wc.executeJavaScript(`document.getElementById('add').click()`);assert.equal(await wc.executeJavaScript(`document.getElementById('value').textContent`),'1');
const initial=wc.getURL();await wc.executeJavaScript(`location.href='https://example.com/';undefined`);await delay(200);assert.equal(wc.getURL(),initial);
await host.invoke('html.preview.close',{id:'test'});assert.equal(host.entries.size,0);await delay(150);assert.equal(wc.isDestroyed(),true);
const pending=host.invoke('html.preview.open',{id:'cancelled',source,language:'html',bounds:{x:20,y:90,width:620,height:300}});await host.invoke('html.preview.closeAll');await pending;assert.equal(host.entries.size,0);
external=true;
await host.invoke('html.preview.open',{id:'online',source:page(`<script>Promise.all(['https://127.0.0.1/','https://192.168.0.1/','http://example.com','file:///etc/passwd'].map(u=>fetch(u).then(()=>false).catch(()=>true))).then(r=>document.body.dataset.blocked=JSON.stringify(r));</script><h1>Online isolated preview</h1>`),language:'html',bounds:{x:20,y:90,width:620,height:300}});await delay(600);
entry=host.entries.get('online');assert.deepEqual(JSON.parse(await entry.view.webContents.executeJavaScript('document.body.dataset.blocked')),[true,true,true,true]);
// The runtime has no direct DNS route. Exercise the actual Chromium HTTPS
// protocol handler with a deterministic native transport fixture instead.
const dns=require('node:dns/promises'),https=require('node:https'),{EventEmitter}=require('node:events');
const originalLookup=dns.lookup,originalRequest=https.request,requests=[];
dns.lookup=async(host,options)=>host==='assets.example.com'?[{address:'8.8.8.8',family:4}]:originalLookup(host,options);
https.request=(url,options,callback)=>{if(url.hostname!=='assets.example.com')return originalRequest(url,options,callback);requests.push(url.pathname);const req=new EventEmitter();req.setTimeout=()=>{};req.destroy=error=>queueMicrotask(()=>req.emit('error',error));req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=url.pathname==='/redirect'?302:200;res.headers={'access-control-allow-origin':'*','content-type':url.pathname==='/style.css'?'text/css':url.pathname==='/script.js'?'text/javascript':'text/plain'};if(url.pathname==='/redirect')res.headers.location='https://127.0.0.1/secret';callback(res);res.emit('data',Buffer.from(url.pathname==='/style.css'?'body{color:rgb(7, 8, 9)}':url.pathname==='/script.js'?"document.body.dataset.remoteScript='ran'":'public fixture'));res.emit('end');});return req;};
await host.invoke('html.preview.closeAll');
const onlineSource='<!doctype html><html><head><title>Online fixture</title><link rel="stylesheet" href="https://assets.example.com/style.css"></head><body><h1>Online assets</h1><script src="https://assets.example.com/script.js"></script><script>fetch("https://assets.example.com/data").then(r=>r.text()).then(v=>document.body.dataset.remoteData=v);fetch("https://assets.example.com/redirect").then(r=>document.body.dataset.redirect=r.ok?"allowed":"blocked").catch(()=>document.body.dataset.redirect="blocked")</script></body></html>';
await host.invoke('html.preview.open',{id:'fixture',source:onlineSource,language:'html',bounds:{x:20,y:90,width:620,height:300}});await delay(900);
entry=host.entries.get('fixture');const online=await entry.view.webContents.executeJavaScript('({script:document.body.dataset.remoteScript,data:document.body.dataset.remoteData,color:getComputedStyle(document.body).color,redirect:document.body.dataset.redirect})');
assert.deepEqual(online,{script:'ran',data:'public fixture',color:'rgb(7, 8, 9)',redirect:'blocked'});assert.equal(requests.includes('/secret'),false);
const countBefore=requests.length;
await host.invoke('html.preview.closeAll');await host.invoke('html.preview.open',{id:'restricted',source:onlineSource,external:false,language:'html',bounds:{x:20,y:90,width:620,height:300}});await delay(300);assert.equal(requests.length,countBefore);
dns.lookup=originalLookup;https.request=originalRequest;
await host.invoke('html.preview.closeAll');await host.invoke('html.preview.open',{id:'runaway',source:page('<script>while(true){}</script>'),language:'html',bounds:{x:20,y:90,width:620,height:300}});await delay(200);
assert.equal(await owner.webContents.executeJavaScript('1+1'),2);const runaway=host.entries.get('runaway').view.webContents;await host.invoke('html.preview.close',{id:'runaway'});await delay(200);assert.equal(runaway.isDestroyed(),true);
// Preserve a complete responsive canvas viewport inside the visible rectangle.
// This also exercises page zoom separately from the operating-system scale.
owner.webContents.setZoomFactor(1.25);
const canvasSource=page('<style>html,body{margin:0;background:#182735}canvas{display:block;width:100vw;height:100vh}</style><canvas></canvas><script>const c=document.querySelector("canvas"),g=c.getContext("2d");let frames=0;function draw(){c.width=innerWidth;c.height=innerHeight;g.fillStyle="#182735";g.fillRect(0,0,c.width,c.height);g.fillStyle="#72eaff";g.fillRect(40+(frames%100),40,20,20);document.body.dataset.frames=++frames;requestAnimationFrame(draw)}draw()</script>');
await host.invoke('html.preview.open',{id:'clipped-canvas',source:canvasSource,external:false,language:'html',bounds:{x:20,y:50,width:400,height:220},viewport:{width:640,height:360,offsetX:100,offsetY:60}});await delay(350);
entry=host.entries.get('clipped-canvas');assert.ok(entry.ready);assert.equal(entry.clipView.getVisible(),true);
assert.deepEqual(entry.clipView.getBounds(),{x:25,y:63,width:500,height:274});assert.deepEqual(entry.view.getBounds(),{x:-125,y:-75,width:800,height:450});
const canvas=await entry.view.webContents.executeJavaScript('({width:innerWidth,height:innerHeight,frames:Number(document.body.dataset.frames),node:typeof require,bridge:typeof window.desktop})');
assert.equal(canvas.width,640);assert.equal(canvas.height,360);assert.ok(canvas.frames>1);assert.equal(canvas.node,'undefined');assert.equal(canvas.bridge,'undefined');
await host.invoke('html.preview.update',{id:'clipped-canvas',visible:false});assert.equal(entry.clipView.getVisible(),false);
await host.invoke('html.preview.update',{id:'clipped-canvas',visible:true,bounds:{x:20,y:50,width:400,height:220},viewport:{width:640,height:360,offsetX:100,offsetY:60}});assert.equal(entry.clipView.getVisible(),true);
const shot=await owner.webContents.capturePage();const folder=process.env.HTML_PREVIEW_EVIDENCE;if(folder){fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'host-680x540.png'),shot.toPNG());}
const report={passed:true,checks:12,chromiumSandboxEnabled:true,isolation:result,separateProcess:true,sandbox:true,privateRequestsBlocked:true,navigationBlocked:true,staleOpenCancelled:true,publicTransportFixture:online,runawayIsolated:true,rendererCanRestrictNetwork:true,clippedCanvas:true,applicationZoom:true,canvas,events};
// Native diagnostics must not enter the machine-readable verification record.
if(reportFile){fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}else console.log(JSON.stringify(report));
host.dispose();owner.destroy();cleanup();app.exit(0);
})().catch(error=>{console.error(error);host?.dispose();owner?.destroy();cleanup();app.exit(1);});
setTimeout(()=>{console.error('HTML preview host test timed out');host?.dispose();owner?.destroy();cleanup();app.exit(1);},25000).unref();
