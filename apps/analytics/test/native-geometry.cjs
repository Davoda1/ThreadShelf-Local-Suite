'use strict';
// Geometry fixtures use the actual bounded service; only the tiny input is invented.
const path=require('node:path'),{pathToFileURL}=require('node:url');
module.exports.run=async function({project,preview,profile}){
 const{app,BrowserWindow,ipcMain}=require('electron');app.setPath('userData',profile);
 await app.whenReady();
 const{AnalyticsService}=await import(pathToFileURL(path.join(project,'src/core/application-service.mjs')).href);
 const service=await new AnalyticsService(path.join(profile,'owned'),{backendAnalysis:true}).init();
 service.settings={...service.settings,language:'en',appearance:'light',uiPalette:'default',codeTheme:'default',timezone:'UTC',autoRefreshMinutes:0};
 service.discovery={status:'absent',automatic:true};global.__qaRevision=0;
 const window=new BrowserWindow({width:2000,height:1000,minWidth:680,minHeight:540,webPreferences:{preload:path.join(project,'src/desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 service.on('update',data=>window.webContents.send('analytics:update',{...data,__updateRevision:++global.__qaRevision}));
 global.__qaUpdateData=async conversations=>{
  const id='4'.repeat(64),source={id,kind:'files',paths:[],name:'Invented geometry archive',status:'ready',conversationCount:conversations.length,snapshotId:'revision4-generation-'+(global.__qaRevision+1),capturedAt:'2026-10-03T12:00:00.000Z',complete:true};
  if(conversations.length){const writer=await service.storage.beginSnapshot(id);try{for(const conversation of conversations)await writer.addConversation(conversation);const descriptor=await writer.publish({version:2,normalizedSchemaVersion:2,adapterVersion:'2.0.0',contentVersion:'1.0.0',source});service.datasets.set(id,descriptor);}catch(error){await writer.abort();throw error;}}
  else service.datasets.clear();
  service.state.sources=conversations.length?[source]:[];service.broadcast({dataChanged:true});
 };
 const analysis=new Set(['calculate','compare','tablePage','evidence','chartData','filterOptions','conversationPage','conversationMetadata','cancelAnalysis','releaseReport']);
 ipcMain.handle('analytics:invoke',async(_event,{operation,value})=>{
  try{
   if(operation==='bootstrap'||operation==='bootstrapSerialized'){const state={...service.payload(),__updateRevision:global.__qaRevision};if(state.backendAnalysis!==true||Object.hasOwn(state,'conversations')||Buffer.byteLength(JSON.stringify(state))>2*1024**2)throw new Error('Invalid bounded geometry bootstrap');return{ok:true,value:state};}
   if(operation==='settings')return{ok:true,value:await service.updateSettings(value)};
   if(operation==='discover-reader')return{ok:true,value:service.discovery};
   if(analysis.has(operation)){const result=await service[operation](value),serialized=JSON.stringify(result),maximum=['calculate','compare','chartData'].includes(operation)?8*1024**2:1024**2;if(serialized.length>maximum)throw new Error('Geometry response exceeds the production page bound');return{ok:true,value:serialized};}
   throw new Error('QA operation not supported: '+operation);
  }catch(error){return{ok:false,error:{code:error.code||'GEOMETRY_QA_ERROR',message:String(error.message)}};}
 });
 await window.loadFile(preview);
 app.on('window-all-closed',()=>{service.close().finally(()=>app.quit());});
};
