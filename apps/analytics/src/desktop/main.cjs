'use strict';
const {app,BrowserWindow,ipcMain,dialog,Menu,protocol,screen,session,nativeTheme,shell}=require('electron');
const path=require('node:path');const fs=require('node:fs/promises');const {pathToFileURL}=require('node:url');
const {createBootLifecycle}=require('./boot-lifecycle.cjs');
const {createTransferStore}=require('./serialized-transfer.cjs');
app.setName('ThreadShelf Local Analytics');
app.setPath('userData',path.join(app.getPath('appData'),'ThreadShelf Local Analytics'));
protocol.registerSchemesAsPrivileged([{scheme:'analytics',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,codeCache:true}}]);
let window,service,boot,closing=false,observeTimer,autoTimer,updateRevision=0;
const serializedTransfers=createTransferStore();
const transferCleanup=setInterval(()=>serializedTransfers.sweep(),30000);transferCleanup.unref();
const transferFailure=()=>({code:'DATA_TRANSFER_FAILED',message:'Captured Analytics data could not be delivered. Retry analysis or restart Analytics.'});
const safeErrorLimit=value=>{if(!value||!['nodes','depth'].includes(value.kind)||!['document','input'].includes(value.scope)||!Number.isSafeInteger(value.observed)||value.observed<0||!Number.isSafeInteger(value.maximum)||value.maximum<(value.kind==='nodes'?1:0))return null;return{kind:value.kind,observed:value.observed,maximum:value.maximum,scope:value.scope,...(Number.isSafeInteger(value.documentIndex)&&value.documentIndex>=0?{documentIndex:value.documentIndex}:{})};};
const assertNativeDescriptor=payload=>{if(payload?.backendAnalysis&&Array.isArray(payload.conversations)&&payload.conversations.length)throw Object.assign(new Error('Native Analytics requires a disk-backed dataset descriptor.'),{code:'NATIVE_DATASET_PROTOCOL'});};
const encodePayload=(payload,options)=>{assertNativeDescriptor(payload);try{return serializedTransfers.encode(JSON.stringify(payload),options);}catch{throw Object.assign(new Error(transferFailure().message),{code:'DATA_TRANSFER_FAILED'});}};
const boundedHistoryReply=(value,maximum)=>{const serialized=JSON.stringify(value);if(typeof serialized!=='string'||serialized.length>maximum)throw Object.assign(new Error('This retained analysis response exceeds its bounded page size. Request a smaller page.'),{code:'ANALYSIS_RESPONSE_TOO_LARGE'});return serialized.length<=1024*1024?value:serializedTransfers.encode(serialized);};
const sendUpdate=data=>{
  const revision=++updateRevision;if(!window||window.isDestroyed())return;
  try{window.webContents.send('analytics:update',encodePayload({...data,__updateRevision:revision},{revision,isData:Object.hasOwn(data,'conversations')||Object.hasOwn(data,'dataset')}));}
  catch{try{if(window&&!window.isDestroyed()&&!window.webContents.isDestroyed?.())window.webContents.send('analytics:update',JSON.stringify({error:true,transportError:transferFailure(),__updateRevision:revision}));}catch{/* A closing renderer cannot receive a recovery notification. */}}
};
if(!app.requestSingleInstanceLock()){app.quit();}else{
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});
app.whenReady().then(async()=>{
  const dataRoot=process.env.ANALYTICS_TEST_MODE==='1'&&process.env.ANALYTICS_TEST_DATA_DIR?path.resolve(process.env.ANALYTICS_TEST_DATA_DIR):app.getPath('userData');
  protocol.handle('analytics',async request=>{
    const url=new URL(request.url);if(url.hostname!=='app')return new Response('Not found',{status:404});let relative;
    try{relative=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';}catch{return new Response('Invalid path',{status:400});}
    if(relative.includes('\0')||relative.includes('\\')||relative.split('/').includes('..'))return new Response('Forbidden',{status:403});
    const root=path.join(app.getAppPath(),'dist');const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))return new Response('Forbidden',{status:403});
    try{const data=await fs.readFile(file);const ext=path.extname(file);return new Response(data,{headers:{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'})[ext]||'application/octet-stream','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'"}});}catch{return new Response('Not found',{status:404});}
  });
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!['analytics:','data:','blob:','devtools:'].some(p=>details.url.startsWith(p))}));
  const area=screen.getPrimaryDisplay().workArea;
  const initialBounds={width:Math.max(680,Math.min(1180,area.width)),height:Math.max(540,Math.min(800,area.height))};
  window=new BrowserWindow({...initialBounds,minWidth:680,minHeight:540,title:'ThreadShelf Local Analytics',show:false,backgroundColor:nativeTheme.shouldUseDarkColors?'#000000':'#ffffff',icon:path.join(app.getAppPath(),'build/icons/256x256.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,spellcheck:false}});
  Menu.setApplicationMenu(null);window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,url)=>{if(url!=='analytics://app/index.html')event.preventDefault();});window.webContents.on('will-attach-webview',event=>event.preventDefault());
  const restoreBounds=settings=>{
    if(!window||window.isDestroyed()||closing)return;
    const saved=settings.window||{},workArea=screen.getPrimaryDisplay().workArea;
    const width=Math.max(680,Math.min(Number.isFinite(saved.width)?saved.width:1180,workArea.width)),height=Math.max(540,Math.min(Number.isFinite(saved.height)?saved.height:800,workArea.height));
    let bounds={width,height};if(Number.isFinite(saved.x)&&Number.isFinite(saved.y)&&screen.getAllDisplays().some(d=>saved.x+width>d.workArea.x&&saved.x<d.workArea.x+d.workArea.width&&saved.y+height>d.workArea.y&&saved.y<d.workArea.y+d.workArea.height))bounds={...bounds,x:saved.x,y:saved.y};
    window.setBounds(bounds);if(saved.maximized)window.maximize();
  };
  const startTimers=()=>{
    if(observeTimer||closing)return;
    observeTimer=setInterval(()=>service?.observe().catch(()=>{}),30000);observeTimer.unref();
    autoTimer=setInterval(()=>{if(!service||closing)return;const minutes=service.settings.autoRefreshMinutes;if(minutes>=1&&!service.job.running){const source=service.state.sources.find(s=>Date.now()-Date.parse(s.capturedAt||0)>minutes*60000);if(source)service.refresh(source.id).catch(()=>{});}},60000);autoTimer.unref();
  };
  boot=createBootLifecycle({
    initialize:async()=>{
      if(service)await service.close();
      const {AnalyticsService}=await import('../core/application-service.mjs');
      const candidate=new AnalyticsService(dataRoot,{backendAnalysis:true});service=candidate;
      candidate.on('update',data=>{if(service===candidate&&!closing)sendUpdate(data);});
      await candidate.init();
      if(closing){await candidate.close();throw Object.assign(new Error('Application is closing.'),{code:'BOOT_CLOSED'});}
      restoreBounds(candidate.settings);startTimers();candidate.startReaderDiscovery();return candidate;
    },
    onState:state=>sendUpdate({boot:state})
  });
  const senderOK=event=>window&&!window.isDestroyed()&&event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame&&event.senderFrame?.url==='analytics://app/index.html';
  ipcMain.handle('analytics:invoke',async(event,request)=>{
    try{
      if(!senderOK(event)||!request||typeof request.operation!=='string')throw new Error('Untrusted IPC request.');if(JSON.stringify(request).length>2*1024**2)throw new Error('Request exceeds its size limit.');const value=request.value;
      if(request.operation==='readTransfer')return{ok:true,value:serializedTransfers.read(value)};
      if(request.operation==='releaseTransfer')return{ok:true,value:serializedTransfers.release(value)};
      if(request.operation==='bootstrap'||request.operation==='bootstrapSerialized'){const ready=await boot.ready({retry:true}),payload={...ready.payload(),boot:boot.state,__updateRevision:updateRevision};assertNativeDescriptor(payload);return{ok:true,value:request.operation==='bootstrapSerialized'?encodePayload(payload,{revision:updateRevision,isData:true}):payload};}
      await boot.ready();
      switch(request.operation){
        case 'calculate':case 'compare':case 'tablePage':case 'evidence':case 'chartData':case 'filterOptions':case 'conversationPage':case 'conversationMetadata':case 'cancelAnalysis':case 'releaseReport':case 'historyDiffPage':{
          if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid analysis request.');
          const result=await service[request.operation](value),serialized=JSON.stringify(result),maximum=['calculate','compare','chartData'].includes(request.operation)?8*1024*1024:1024*1024;
          if(serialized.length>maximum)throw Object.assign(new Error('This analysis response exceeds its bounded page size. Request a smaller page.'),{code:'ANALYSIS_RESPONSE_TOO_LARGE'});
          return{ok:true,value:serializedTransfers.encode(serialized)};
        }
        case 'discover-reader':return{ok:true,value:await service.discoverReader()};
        case 'chooseSource':{
          if(!['reader','files','directory'].includes(value))throw new Error('Unsupported source type.');
          const selected=await dialog.showOpenDialog(window,{title:value==='reader'?'Select ThreadShelf Local Reader profile':'Select AI conversation exports',defaultPath:service.settings.lastSourceDirectory||undefined,properties:value==='files'?['openFile','multiSelections']:['openDirectory'],...(value==='files'?{filters:[{name:'Conversation exports',extensions:['json','html','htm','zip']},{name:'All files',extensions:['*']}]}:{})});
          if(selected.canceled)return{ok:true,value:null};try{await service.registerSource(value,selected.filePaths);}catch(error){error.captureContext={kind:'analyze',phase:'source-validation',sourceKind:value,sourcePath:selected.filePaths[0]||null,failedAt:new Date().toISOString()};throw error;}if(service.job.error)throw Object.assign(new Error(service.job.error.message),{code:service.job.error.code});return{ok:true,value:{accepted:true,job:service.job,sources:service.state.sources}};
        }
        case 'refresh':case 'rebuild':if(typeof value!=='string')throw new Error('Invalid source identity.');if(request.operation==='rebuild')await service.rebuildIndexes(value);else await service.refresh(value);if(service.job.error)throw Object.assign(new Error(service.job.error.message),{code:service.job.error.code});return{ok:true,value:{accepted:true,job:service.job,sources:service.state.sources}};
        case 'storageUsage':return{ok:true,value:await service.storageUsage()};
        case 'captureHistory':return{ok:true,value:await service.captureHistory(value)};
        case 'captureEvidence':if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid retained capture evidence request.');return{ok:true,value:boundedHistoryReply(await service.captureEvidence(value.sourceId,value.captureId,value.query,value.filters),1024*1024)};
        case 'compareCaptureHistory':if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid retained capture comparison request.');return{ok:true,value:boundedHistoryReply(await service.compareCaptureHistory(value.sourceId,value.leftId,value.rightId,value.filters),8*1024*1024)};
        case 'removeCaptureHistory':return{ok:true,value:await service.removeCaptureHistory(value.sourceId,value.captureId)};
        case 'openExternal':{if(typeof value!=='string'||!/^https?:\/\//i.test(value)||value.includes('\\')||value.length>8192||/[\u0000-\u0020\u007f]/.test(value))throw new Error('Invalid external URL.');const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Only HTTP(S) links without credentials can be opened.');await shell.openExternal(url.href);return{ok:true,value:{opened:true}};}
        case 'cancel':return{ok:true,value:service.cancel()};
        case 'settings':if(!value||typeof value!=='object')throw new Error('Invalid settings.');return{ok:true,value:await service.updateSettings(value)};
        case 'saveExploration':return{ok:true,value:await service.saveExploration(value)};
        case 'saveView':return{ok:true,value:await service.saveView(value)};
        case 'saveAnnotations':return{ok:true,value:await service.saveAnnotations(value)};
        case 'removeSource':await service.removeSource(value);return{ok:true,value:{accepted:true,sources:service.state.sources}};
        case 'clearCache':return{ok:true,value:await service.clearCache()};
        case 'exportReport':{
          if(!value||!['csv','json','html'].includes(value.format))throw new Error('Unsupported report type.');const chosen=await dialog.showSaveDialog(window,{title:'Export analytical report',defaultPath:path.join(service.settings.lastDestinationDirectory||app.getPath('documents'),'ThreadShelf-Analytics-Report.'+value.format),filters:[{name:'Analytical report',extensions:[value.format]}]});if(chosen.canceled)return{ok:true,value:null};return{ok:true,value:await service.exportReport(chosen.filePath,value)};
        }
        case 'exportTable':{
          if(!value||typeof value!=='object'||typeof value.reportId!=='string')throw new Error('Invalid analytical table export.');
          const chosen=await dialog.showSaveDialog(window,{title:'Export complete analytical table',defaultPath:path.join(service.settings.lastDestinationDirectory||app.getPath('documents'),'ThreadShelf-Analytics-Table.tsv'),filters:[{name:'Tab-separated table',extensions:['tsv']}]});if(chosen.canceled)return{ok:true,value:null};return{ok:true,value:await service.exportTable(chosen.filePath,value)};
        }
        default:throw new Error('Unsupported IPC operation.');
      }
    }catch(error){const limit=safeErrorLimit(error.limit);return{ok:false,error:{code:error.code||'ANALYTICS_ERROR',message:String(error.message).slice(0,1200),context:error.captureContext||null,...(limit?{limit}:{})}};}
  });
  window.on('ready-to-show',()=>{window.show();boot.markShellVisible();});
  window.on('close',event=>{
    if(closing)return;event.preventDefault();closing=true;clearInterval(observeTimer);clearInterval(autoTimer);clearInterval(transferCleanup);serializedTransfers.clear();const initialized=boot.state.phase==='ready';boot.close();const bounds=window.getNormalBounds();
    const save=initialized?service.updateSettings({window:{...bounds,maximized:window.isMaximized()}}).catch(()=>{}):Promise.resolve();
    save.finally(async()=>{await service?.close();window.destroy();app.quit();});
  });
  // This promise starts immediately but its initializer is gated by the shown
  // static shell. Bootstrap callers share it; a later bootstrap retries failure.
  boot.ready().catch(()=>{});
  await window.loadURL('analytics://app/index.html');
}).catch(error=>{dialog.showErrorBox('ThreadShelf Local Analytics',String(error.message));app.quit();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
}
