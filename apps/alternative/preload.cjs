'use strict';
const {contextBridge,ipcRenderer}=require('electron');
let startupTheme='dark';
try {const theme=ipcRenderer.sendSync('alternative:startup-theme');if(theme==='light'||theme==='dark')startupTheme=theme;}catch{/* Keep the safe dark cover if bootstrap is unavailable. */}
const invoke=(action,...args)=>ipcRenderer.invoke('alternative:'+action,...args).then(result=>{if(!result.ok)throw new Error(result.error||'The request failed.');return result.value;});
contextBridge.exposeInMainWorld('alternative',Object.freeze({
  startupTheme,
  loadState:()=>invoke('load-state'),saveState:value=>invoke('save-state',value),
  connect:url=>invoke('connect',url),request:(method,args)=>invoke('request',method,args),
  openExternal:url=>invoke('open-external',url),copy:text=>invoke('copy',text),
  exportFile:value=>invoke('export',value),getInfo:()=>invoke('info')
}));
