'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const invoke=async(operation,value)=>{const result=await ipcRenderer.invoke('analytics:invoke',{operation,value});if(!result.ok){const e=new Error(result.error.message);e.code=result.error.code;throw e;}return result.value;};
contextBridge.exposeInMainWorld('analytics',Object.freeze({
  bootstrap:()=>invoke('bootstrap'),bootstrapSerialized:async()=>JSON.stringify(await invoke('bootstrap')),chooseSource:kind=>invoke('chooseSource',kind),discoverReader:()=>invoke('discover-reader'),refresh:sourceId=>invoke('refresh',sourceId),rebuild:sourceId=>invoke('rebuild',sourceId),cancel:()=>invoke('cancel'),
  storageUsage:()=>invoke('storageUsage'),captureHistory:id=>invoke('captureHistory',id),compareCaptureHistory:(sourceId,leftId,rightId,filters)=>invoke('compareCaptureHistory',typeof sourceId==='object'?sourceId:{sourceId,leftId,rightId,filters}),removeCaptureHistory:(sourceId,captureId)=>invoke('removeCaptureHistory',typeof sourceId==='object'?sourceId:{sourceId,captureId}),openExternal:url=>invoke('openExternal',url),
  captureEvidence:(sourceId,captureId,query={},filters={})=>invoke('captureEvidence',typeof sourceId==='object'?sourceId:{sourceId,captureId,query,filters}),
  updateSettings:settings=>invoke('settings',settings),exportReport:selection=>invoke('exportReport',selection),removeSource:id=>invoke('removeSource',id),clearCache:()=>invoke('clearCache'),saveExploration:value=>invoke('saveExploration',value),saveView:view=>invoke('saveView',view),saveAnnotations:data=>invoke('saveAnnotations',data),
  onUpdate:callback=>{if(typeof callback!=='function')throw new TypeError('Expected callback.');const listener=(_event,data)=>callback(data);ipcRenderer.on('analytics:update',listener);return()=>ipcRenderer.removeListener('analytics:update',listener);},
  // One inert string crosses context isolation; large object graphs otherwise
  // undergo an expensive additional clone/freeze for every captured dataset.
  onSerializedUpdate:callback=>{if(typeof callback!=='function')throw new TypeError('Expected callback.');const listener=(_event,data)=>callback(JSON.stringify(data));ipcRenderer.on('analytics:update',listener);return()=>ipcRenderer.removeListener('analytics:update',listener);}
}));
