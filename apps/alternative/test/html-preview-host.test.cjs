const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createHtmlPreviewHost,viewportBounds,previewGeometry}=require('../core/html-preview-host.cjs');
const source='<!doctype html><html><head><title>Isolated preview</title></head><body><p>Preview</p></body></html>';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
class FakeView {
  constructor(){this.children=[];this.visible=true;this.rect={x:0,y:0,width:0,height:0};}
  addChildView(view){this.children.push(view);}
  removeChildView(view){this.children=this.children.filter(child=>child!==view);}
  setBounds(value){this.rect={...value};}
  getBounds(){return this.rect;}
  setVisible(value){this.visible=value;}
  getVisible(){return this.visible;}
  setBackgroundColor(value){this.background=value;}
}
class FakeContents extends EventEmitter {
  constructor(){super();this.destroyed=false;}
  setWebRTCIPHandlingPolicy(){} setWindowOpenHandler(){} setZoomFactor(value){this.zoom=value;}
  loadURL(url){this.url=url;return new Promise((resolve,reject)=>{this.resolveLoad=resolve;this.rejectLoad=reject;});}
  isDestroyed(){return this.destroyed;}
  close(){this.destroyed=true;this.rejectLoad?.(new Error('Load cancelled by close.'));}
}
function fixture(){
  const owner={contentView:new FakeView(),isDestroyed:()=>false,getContentBounds:()=>({width:1200,height:800}),webContents:Object.assign(new EventEmitter(),{getZoomFactor:()=>owner.zoom}),zoom:1};
  const events=[],sessions=[];
  const electron={ipcMain:new EventEmitter(),View:FakeView,WebContentsView:class extends FakeView{constructor(options){super();this.options=options;this.webContents=new FakeContents();}},session:{fromPartition(){
    const ses=new EventEmitter();ses.protocol={handle(){},unhandle(){ses.unhandled=true;}};ses.webRequest={onBeforeRequest(){}};
    ses.setProxy=async()=>{};ses.setPermissionRequestHandler=()=>{};ses.setPermissionCheckHandler=()=>{};ses.setDevicePermissionHandler=()=>{};ses.setSpellCheckerEnabled=()=>{};
    ses.closeAllConnections=async()=>{};ses.clearStorageData=async()=>{};sessions.push(ses);return ses;
  }}};
  const host=createHtmlPreviewHost({getWindow:()=>owner,getExternalEnabled:()=>false,onEvent:event=>events.push(event),electron});
  const open=(id='preview',extra={})=>host.invoke('html.preview.open',{id,source,language:'html',bounds:{x:20,y:30,width:600,height:300},...extra});
  return {host,owner,events,sessions,open,ipcMain:electron.ipcMain};
}
test('preview clipping retains the full responsive viewport and scales CSS pixels by application zoom',()=>{
  assert.deepEqual(viewportBounds({width:960,height:540,offsetX:30,offsetY:100},{width:600,height:300}),{x:-30,y:-100,width:960,height:540});
  const result=previewGeometry({bounds:{x:20,y:30,width:600,height:300},viewport:{width:960,height:540,offsetX:30,offsetY:100}},{width:1500,height:1000},1.25);
  assert.deepEqual(result,{clip:{x:25,y:38,width:750,height:374},viewport:{x:-37,y:-125,width:1200,height:675},zoom:1.25});
  assert.equal(result.viewport.width/result.viewport.height,16/9);
  for(const viewport of [{width:960,height:540,offsetX:-2,offsetY:0},{width:400,height:200,offsetX:0,offsetY:0},{width:Infinity,height:300,offsetX:0,offsetY:0},{width:20000,height:300,offsetX:0,offsetY:0}]) assert.throws(()=>viewportBounds(viewport,{width:600,height:300}));
  assert.throws(()=>previewGeometry({bounds:{x:0,y:0,width:800,height:600}},{width:800,height:600},1.5));
});
test('unloaded native content is transparent and stays hidden until the sandboxed document is ready',async()=>{
  const f=fixture();try{
    await f.open();const entry=f.host.entries.get('preview');
    assert.equal(entry.clipView.background,'#00000000');assert.equal(entry.view.background,'#00000000');
    assert.equal(entry.clipView.getVisible(),false);assert.equal(entry.ready,false);
    assert.deepEqual(entry.clipView.children,[entry.view]);assert.deepEqual(f.owner.contentView.children,[entry.clipView]);
    assert.equal(entry.view.options.webPreferences.sandbox,true);assert.equal(entry.view.options.webPreferences.nodeIntegration,false);
    entry.view.webContents.emit('dom-ready');assert.equal(entry.clipView.getVisible(),true);assert.equal(entry.ready,true);
    assert.deepEqual(f.events,[{id:'preview',state:'ready'}]);
  }finally{f.host.dispose();}
});
test('clipped geometry updates retain CSS viewport size and respect visibility while loading',async()=>{
  const f=fixture();try{
    await f.open('preview',{viewport:{width:960,height:540,offsetX:10,offsetY:60}});const e=f.host.entries.get('preview');
    assert.deepEqual(e.view.getBounds(),{x:-10,y:-60,width:960,height:540});
    f.host.invoke('html.preview.update',{id:'preview',visible:false});e.view.webContents.emit('dom-ready');assert.equal(e.clipView.getVisible(),false);
    f.owner.zoom=1.25;f.host.invoke('html.preview.update',{id:'preview',visible:true,bounds:{x:20,y:30,width:600,height:300},viewport:{width:960,height:540,offsetX:30,offsetY:100}});
    assert.equal(e.clipView.getVisible(),true);assert.deepEqual(e.clipView.getBounds(),{x:25,y:38,width:750,height:374});
    assert.deepEqual(e.view.getBounds(),{x:-37,y:-125,width:1200,height:675});assert.equal(e.view.webContents.zoom,1.25);
  }finally{f.host.dispose();}
});
test('a failed or aborted initial document produces an error and removes its empty native surface',async()=>{
  for(const failure of ['rejection','aborted-event']){
    const f=fixture();try{
      await f.open();const e=f.host.entries.get('preview');
      if(failure==='rejection')e.view.webContents.rejectLoad(new Error('ERR_ABORTED'));
      else e.view.webContents.emit('did-fail-load',{},-3,'ERR_ABORTED',e.documentUrl,true);
      await tick();assert.equal(f.host.entries.size,0);assert.equal(e.view.webContents.isDestroyed(),true);
      assert.deepEqual(f.owner.contentView.children,[]);assert.deepEqual(f.events.map(e=>e.state),['error','closed']);
    }finally{f.host.dispose();}
  }
});
test('subframe errors and prevented later navigation do not discard a working document',async()=>{
  const f=fixture();try{
    await f.open();const e=f.host.entries.get('preview');
    e.view.webContents.emit('did-fail-load',{},-3,'blocked subframe','https://example.com/',false);assert.equal(f.host.entries.size,1);
    e.view.webContents.emit('dom-ready');e.view.webContents.emit('did-fail-load',{},-3,'blocked navigation','https://example.com/',true);assert.equal(f.host.entries.size,1);
    assert.deepEqual(f.events.map(e=>e.state),['ready']);
  }finally{f.host.dispose();}
});
test('late load rejection from an explicitly closed or replaced preview cannot close the new preview',async()=>{
  const f=fixture();try{
    await f.open();const old=f.host.entries.get('preview');
    await f.open();const current=f.host.entries.get('preview');await tick();
    assert.notEqual(current,old);assert.equal(f.host.entries.get('preview'),current);
    assert.equal(f.events.some(e=>e.state==='error'),false);
    f.host.invoke('html.preview.close',{id:'preview'});await tick();assert.equal(f.host.entries.size,0);assert.equal(f.events.some(e=>e.state==='error'),false);
  }finally{f.host.dispose();}
});

const {isTrustedMainFrame}=require('../core/trusted-entry.cjs');

test('synchronous geometry IPC accepts only the owning trusted main frame and fixed bounded updates',async()=>{
  const f=fixture(),url='file:///threadshelf/index.html',channel='test:geometry';
  f.owner.webContents.mainFrame={url};
  f.host.registerGeometryIpc(channel,event=>isTrustedMainFrame(event,f.owner.webContents,url));
  const send=(args,event={sender:f.owner.webContents,senderFrame:f.owner.webContents.mainFrame})=>{f.ipcMain.emit(channel,event,args);return event.returnValue;};
  const geometry={id:'preview',visible:true,bounds:{x:40,y:50,width:400,height:225}};
  try{
    await f.open();const entry=f.host.entries.get('preview');entry.view.webContents.emit('dom-ready');
    assert.deepEqual(send(geometry),{ok:true});assert.deepEqual(entry.clipView.getBounds(),geometry.bounds);
    const old={...entry.clipView.getBounds()};
    for(const event of [{sender:{},senderFrame:f.owner.webContents.mainFrame},{sender:f.owner.webContents,senderFrame:{url}},{sender:entry.view.webContents,senderFrame:{url}},{sender:f.owner.webContents,senderFrame:null}]){
      assert.deepEqual(send({...geometry,bounds:{x:70,y:80,width:400,height:225}},event),{ok:false});assert.deepEqual(entry.clipView.getBounds(),old);
    }
    f.owner.webContents.mainFrame.url='https://example.invalid/';assert.deepEqual(send(geometry),{ok:false});f.owner.webContents.mainFrame.url=url;
    for(const args of [null,{}, {...geometry,bounds:{x:-1,y:50,width:400,height:225}}, {...geometry,bounds:{x:40,y:50,width:20000,height:225}}, {...geometry,viewport:{width:400,height:225,offsetX:1e9,offsetY:0}}]) assert.deepEqual(send(args),{ok:false});
    // A caller cannot turn this bounded channel into open/close/network work.
    assert.deepEqual(send({...geometry,action:'html.preview.close',source}),{ok:true});assert.equal(f.host.entries.get('preview'),entry);
    assert.deepEqual(send({...geometry,id:'new',action:'html.preview.open',source}),{ok:false});assert.equal(f.host.entries.size,1);
    f.owner.isDestroyed=()=>true;assert.deepEqual(send(geometry),{ok:false});assert.equal(f.host.entries.get('preview'),entry);
    f.owner.isDestroyed=()=>false;f.host.invoke('html.preview.close',{id:'preview'});assert.deepEqual(send(geometry),{ok:false});
  }finally{f.host.dispose();}
  assert.deepEqual(send(geometry),{ok:false});
  f.owner.webContents.emit('destroyed');assert.equal(f.ipcMain.listenerCount(channel),0);
});

test('preload keeps update promise-compatible and uses the synchronous channel only for geometry',async()=>{
  const vm=require('node:vm'),fs=require('node:fs');const exposed={},calls=[];
  const ipcRenderer={on(){},removeListener(){},invoke:(...args)=>{calls.push({kind:'async',args});return Promise.resolve({ok:true,value:{ok:true}});},sendSync:(...args)=>{if(args[0]==='alternative:startup-theme')return 'dark';calls.push({kind:'sync',args});return {ok:true};}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../preload.cjs'),'utf8'),{require:name=>{assert.equal(name,'electron');return {ipcRenderer,contextBridge:{exposeInMainWorld:(name,api)=>exposed[name]=api}};},process:{argv:[]}});
  const api=exposed.alternative,args={id:'preview',visible:false};
  const result=api.htmlPreview('html.preview.update',args);assert.equal(typeof result.then,'function');assert.equal((await result).ok,true);
  assert.deepEqual(calls,[{kind:'sync',args:['alternative:html-preview-geometry',args]}]);
  await api.htmlPreview('html.preview.open',{id:'preview',source});assert.equal(calls.at(-1).kind,'async');assert.equal(calls.at(-1).args[0],'alternative:html-preview');
  const count=calls.length;await assert.rejects(api.htmlPreview('html.preview.delete',args));assert.equal(calls.length,count);
  ipcRenderer.sendSync=()=>{throw new Error('Window closed.');};
  const failed=api.htmlPreview('html.preview.update',args);assert.equal(typeof failed.then,'function');await assert.rejects(failed,/Window closed/);
});
