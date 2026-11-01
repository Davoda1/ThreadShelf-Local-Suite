'use strict';
const {contextBridge,ipcRenderer}=require('electron');
let startupTheme='dark';
try {const theme=ipcRenderer.sendSync('alternative:startup-theme');if(theme==='light'||theme==='dark')startupTheme=theme;}catch{/* Keep the safe dark cover if bootstrap is unavailable. */}
const invoke=(action,...args)=>ipcRenderer.invoke('alternative:'+action,...args).then(result=>{if(!result.ok)throw new Error(result.error||'The request failed.');return result.value;});
const ttsActions=new Set(['settings.get','settings.save','synthesize','preview','cancel','playback','availability','cache.list','cache.preview','cache.delete','cache.pin','providers.discover','credentials.set','credentials.status','credentials.unlock','credentials.forget'].map(action=>'tts.'+action));
contextBridge.exposeInMainWorld('alternative',Object.freeze({
  startupTheme,
  onTtsEvent(callback){if(typeof callback!=='function')throw new TypeError('A Text-to-Speech event callback is required.');const fn=(_event,value)=>callback(value);ipcRenderer.on('alternative:tts-event',fn);return ()=>ipcRenderer.removeListener('alternative:tts-event',fn);},
  tts:(action,args={})=>ttsActions.has(action)?invoke('tts',action,args):Promise.reject(new Error('Unknown Text-to-Speech action.')),
  loadState:()=>invoke('load-state'),saveState:value=>invoke('save-state',value),
  connect:url=>invoke('connect',url),request:(method,args)=>invoke('request',method,args),
  openExternal:url=>invoke('open-external',url),copy:text=>invoke('copy',text),
  exportFile:value=>invoke('export',value),getInfo:()=>invoke('info')
}));
