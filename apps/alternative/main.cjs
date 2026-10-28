'use strict';
const {app,BrowserWindow,ipcMain,shell,clipboard,dialog,session,nativeTheme}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const {StateStore}=require('./core/state.cjs');
const {ServerClient}=require('./core/server.cjs');
const {allowRendererRequest,imageRequestHeaders,imageResponseHeaders}=require('./core/image-policy.cjs');
const {isTrustedMainFrame}=require('./core/trusted-entry.cjs');
const PRODUCT='ThreadShelf Local Alternative';
app.setName(PRODUCT);
app.setAppUserModelId('io.github.davoda1.threadshelf-local-alternative');
// Image resources are display-only. Do not persist Chromium’s HTTP image cache.
app.commandLine.appendSwitch('disable-http-cache');
// This profile is deliberately independent of Reader, Analytics, and the server.
app.setPath('userData',path.join(app.getPath('appData'),'ThreadShelf Local Alternative'));
const store=new StateStore(app.getPath('userData'));
let win,client,connectionEpoch=0,appearancePreference='system';
const backgroundFor=theme=>(theme==='dark'||(theme==='system'&&nativeTheme.shouldUseDarkColors))?'#141c1d':'#f3f1eb';
function applyWindowAppearance(theme){
  appearancePreference=['system','light','dark'].includes(theme)?theme:'system';
  if(win&&!win.isDestroyed())win.setBackgroundColor(backgroundFor(appearancePreference));
  return backgroundFor(appearancePreference)==='#141c1d'?'dark':'light';
}
const entry=path.join(__dirname,'renderer','index.html');
const trustedURL=pathToFileURL(entry).href;
const methods=new Set(['collections','capabilities','health','stats','browse','search','thread']);
function trustedSender(event){return !!win&&isTrustedMainFrame(event,win.webContents,trustedURL);}
function handle(action,fn){ipcMain.handle('alternative:'+action,async(event,...args)=>{
  try{
    if(!trustedSender(event))throw new Error('Untrusted request.');
    return {ok:true,value:await fn(...args)};
  }catch(e){return{ok:false,error:String(e.message||e).slice(0,1500)}}
});}
async function external(value){
  if(typeof value!=='string'||value.length>8192)throw new Error('Invalid link.');
  const url=new URL(value);
  if(!['https:','http:','mailto:'].includes(url.protocol)||url.username||url.password)throw new Error('Only web and email links can be opened.');
  await shell.openExternal(url.href);return true;
}
async function start(){
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  // Only image resources may leave the renderer. API traffic still goes through
  // the read-only main-process client; other remote subresources stay blocked.
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!allowRendererRequest(details)}));
  // Displaying an archived image must not transmit ambient account cookies or
  // auth headers, disclose a referrer, or persist a response cookie.
  session.defaultSession.webRequest.onBeforeSendHeaders((details,callback)=>callback({requestHeaders:imageRequestHeaders(details)}));
  session.defaultSession.webRequest.onHeadersReceived((details,callback)=>callback({responseHeaders:imageResponseHeaders(details)}));
  // Read appearance before the native surface or any renderer document can paint.
  applyWindowAppearance(store.load().theme);
  win=new BrowserWindow({width:1360,height:880,minWidth:680,minHeight:540,title:PRODUCT,backgroundColor:backgroundFor(appearancePreference),icon:path.join(__dirname,'assets','icon.png'),show:false,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,spellcheck:false}});
  win.removeMenu();
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(url!==trustedURL)event.preventDefault();});
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  win.once('ready-to-show',()=>win.show());
  let closing=false;
  win.on('close',event=>{
    if(closing)return;
    closing=true;event.preventDefault();const current=win;
    Promise.race([current.webContents.executeJavaScript('window.TSAFlush ? window.TSAFlush() : null'),new Promise(resolve=>setTimeout(resolve,2000))])
      .catch(()=>{}).finally(()=>{if(!current.isDestroyed())current.destroy();});
  });
  win.on('closed',()=>{win=null});
  // Preload needs a tiny synchronous bootstrap value before parsing the page.
  // A reload re-reads the saved preference rather than using stale launch arguments.
  ipcMain.on('alternative:startup-theme',event=>{
    event.returnValue=trustedSender(event)?applyWindowAppearance(store.load().theme):'dark';
  });
  nativeTheme.on('updated',()=>{if(win&&!win.isDestroyed())win.setBackgroundColor(backgroundFor(appearancePreference));});
  handle('load-state',()=>{const state=store.load();if(store.error)throw new Error(store.error);return state;});
  handle('save-state',state=>{const saved=store.save(state);applyWindowAppearance(saved.theme);return saved;});
  handle('connect',async url=>{const epoch=++connectionEpoch;const next=new ServerClient(url);try{const collections=await next.collections();if(epoch!==connectionEpoch){next.dispose();throw new Error('A newer connection request replaced this one.');}client?.dispose();client=next;return collections;}catch(e){next.dispose();throw e;}});
  handle('request',async(method,args)=>{if(!methods.has(method))throw new Error('Unsupported server operation.');if(!client)throw new Error('Connect to a ThreadShelf server first.');return client[method](args||{});});
  handle('open-external',external);
  handle('copy',text=>{if(typeof text!=='string'||text.length>20*1024*1024)throw new Error('Text is too large to copy.');clipboard.writeText(text);return true;});
  handle('export',async value=>{
    if(!value||typeof value.text!=='string'||value.text.length>50*1024*1024)throw new Error('Export is too large.');
    const name=String(value.name||'Conversation.md').replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').slice(0,180);
    const result=await dialog.showSaveDialog(win,{title:'Export conversation',defaultPath:name,filters:[{name:'Markdown',extensions:['md']},{name:'Text',extensions:['txt']}]});
    if(result.canceled||!result.filePath)return {canceled:true};
    await fs.writeFile(result.filePath,value.text,'utf8');return {canceled:false};
  });
  handle('info',()=>({name:PRODUCT,version:'1.3.0',electron:process.versions.electron,platform:process.platform,settingsWarning:store.error,profile:app.getPath('userData')}));
  // Use the same canonical URL for loading and trust checks. Electron's legacy
  // loadFile conversion can misencode literal percent signs and POSIX backslashes.
  await win.loadURL(trustedURL);
}
if(!app.requestSingleInstanceLock())app.quit();else{
  app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
  app.whenReady().then(start).catch(error=>{dialog.showErrorBox(PRODUCT,'The application could not start: '+error.message);app.quit();});
  app.on('window-all-closed',()=>{client?.dispose();app.quit();});
}
