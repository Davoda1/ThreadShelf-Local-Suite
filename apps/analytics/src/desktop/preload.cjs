'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const invoke=async(operation,value)=>{const result=await ipcRenderer.invoke('analytics:invoke',{operation,value});if(!result.ok){const e=new Error(result.error.message);e.code=result.error.code;e.context=result.error.context||null;e.limit=result.error.limit||null;throw e;}return result.value;};
// Sandboxed preloads cannot require local modules. Keep the inert string
// reassembly here; only small descriptors and bounded chunks cross each IPC.
const transferMarker='analytics-json-transfer-v1',chunkChars=1024*1024,pendingTransfers=new Map();
let pendingDataTransfer=null,pendingBootstrap=null;
const isTransfer=value=>value&&typeof value==='object'&&value.__analyticsTransfer===transferMarker;
const transferFailure=()=>Object.assign(new Error('Captured Analytics data could not be delivered. Retry the capture or restart Analytics.'),{code:'DATA_TRANSFER_FAILED'});
function acquireTransfer(descriptor){
 if(typeof descriptor.id!=='string'||!/^[a-f0-9]{32}$/.test(descriptor.id)||!Number.isSafeInteger(descriptor.length)||descriptor.length<=chunkChars||descriptor.length>536870000||descriptor.chunkChars!==chunkChars||!Number.isSafeInteger(descriptor.count)||descriptor.count<Math.ceil(descriptor.length/chunkChars)||descriptor.count>Math.ceil(descriptor.length/(chunkChars-1)))throw transferFailure();
 let entry=pendingTransfers.get(descriptor.id);if(entry)return entry;
 entry={id:descriptor.id,revision:descriptor.revision,users:0,promise:null};pendingTransfers.set(entry.id,entry);
 entry.promise=(async()=>{const chunks=[];let length=0;try{for(let index=0;index<descriptor.count;index++){const value=await invoke('readTransfer',{id:descriptor.id,index});if(typeof value!=='string'||!value.length||value.length>chunkChars)throw transferFailure();chunks.push(value);length+=value.length;if(length>descriptor.length)throw transferFailure();}if(length!==descriptor.length)throw transferFailure();const result=chunks.join('');chunks.length=0;return result;}finally{await invoke('releaseTransfer',{id:descriptor.id}).catch(()=>{});}})();
 if(descriptor.isData&&(!pendingDataTransfer||!Number.isFinite(pendingDataTransfer.revision)||!Number.isFinite(entry.revision)||entry.revision>=pendingDataTransfer.revision))pendingDataTransfer=entry;
 return entry;
}
function consumeTransfer(entry,callback,onError){entry.users++;return entry.promise.then(callback,onError).finally(()=>{entry.users--;if(!entry.users){pendingTransfers.delete(entry.id);if(pendingDataTransfer===entry)pendingDataTransfer=null;}});}
const serializedValue=value=>isTransfer(value)?consumeTransfer(acquireTransfer(value),result=>result):Promise.resolve(typeof value==='string'?value:JSON.stringify(value));
function bootstrapSerialized(){
 if(pendingDataTransfer)return consumeTransfer(pendingDataTransfer,result=>result);
 if(pendingBootstrap)return pendingBootstrap;
 pendingBootstrap=invoke('bootstrapSerialized').then(serializedValue).finally(()=>{pendingBootstrap=null;});return pendingBootstrap;
}
const analysisInvoke=(operation,value)=>invoke(operation,value).then(serializedValue).then(value=>JSON.parse(value));
const boundedObjectInvoke=(operation,value)=>invoke(operation,value).then(value=>isTransfer(value)||typeof value==='string'?serializedValue(value).then(serialized=>JSON.parse(serialized)):value);
function subscribe(callback,serialized){
 if(typeof callback!=='function')throw new TypeError('Expected callback.');let active=true;
 const deliver=value=>{if(active)callback(serialized?(typeof value==='string'?value:JSON.stringify(value)):(typeof value==='string'?JSON.parse(value):value));};
 const failed=descriptor=>deliver(JSON.stringify({error:true,transportError:{code:'DATA_TRANSFER_FAILED',message:transferFailure().message},...(Number.isFinite(descriptor.revision)?{__updateRevision:descriptor.revision}:{})}));
 const listener=(_event,data)=>{if(!isTransfer(data)){deliver(data);return;}let entry;try{entry=acquireTransfer(data);}catch{failed(data);return;}consumeTransfer(entry,deliver,()=>failed(data));};
 ipcRenderer.on('analytics:update',listener);return()=>{active=false;ipcRenderer.removeListener('analytics:update',listener);};
}
contextBridge.exposeInMainWorld('analytics',Object.freeze({
  bootstrap:()=>invoke('bootstrap'),bootstrapSerialized,chooseSource:kind=>invoke('chooseSource',kind),discoverReader:()=>invoke('discover-reader'),refresh:sourceId=>invoke('refresh',sourceId),rebuild:sourceId=>invoke('rebuild',sourceId),cancel:()=>invoke('cancel'),
  calculate:value=>analysisInvoke('calculate',value),compare:value=>analysisInvoke('compare',value),tablePage:value=>analysisInvoke('tablePage',value),evidence:value=>analysisInvoke('evidence',value),chartData:value=>analysisInvoke('chartData',value),filterOptions:value=>analysisInvoke('filterOptions',value),conversationPage:value=>analysisInvoke('conversationPage',value),conversationMetadata:value=>analysisInvoke('conversationMetadata',value),cancelAnalysis:value=>analysisInvoke('cancelAnalysis',value),releaseReport:value=>analysisInvoke('releaseReport',value),historyDiffPage:value=>analysisInvoke('historyDiffPage',value),exportTable:value=>invoke('exportTable',value),
  storageUsage:()=>invoke('storageUsage'),captureHistory:id=>invoke('captureHistory',id),compareCaptureHistory:(sourceId,leftId,rightId,filters)=>boundedObjectInvoke('compareCaptureHistory',typeof sourceId==='object'?sourceId:{sourceId,leftId,rightId,filters}),removeCaptureHistory:(sourceId,captureId)=>invoke('removeCaptureHistory',typeof sourceId==='object'?sourceId:{sourceId,captureId}),openExternal:url=>invoke('openExternal',url),
  captureEvidence:(sourceId,captureId,query={},filters={})=>boundedObjectInvoke('captureEvidence',typeof sourceId==='object'?sourceId:{sourceId,captureId,query,filters}),
  updateSettings:settings=>invoke('settings',settings),exportReport:selection=>invoke('exportReport',selection),removeSource:id=>invoke('removeSource',id),clearCache:()=>invoke('clearCache'),saveExploration:value=>invoke('saveExploration',value),saveView:view=>invoke('saveView',view),saveAnnotations:data=>invoke('saveAnnotations',data),
  onUpdate:callback=>subscribe(callback,false),
  // One inert string crosses context isolation; large object graphs otherwise
  // undergo an expensive additional clone/freeze for every captured dataset.
  onSerializedUpdate:callback=>subscribe(callback,true)
}));
