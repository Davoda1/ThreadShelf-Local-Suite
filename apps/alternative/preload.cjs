'use strict';
const {contextBridge,ipcRenderer}=require('electron');
let startupTheme='dark';
try {const theme=ipcRenderer.sendSync('alternative:startup-theme');if(theme==='light'||theme==='dark')startupTheme=theme;}catch{/* Keep the safe dark cover if bootstrap is unavailable. */}
const invoke=(action,...args)=>ipcRenderer.invoke('alternative:'+action,...args).then(result=>{if(!result.ok)throw new Error(result.error||'The request failed.');return result.value;});
const htmlPreviewActions=new Set(['html.preview.open','html.preview.update','html.preview.close','html.preview.closeAll']);
const ttsActions=new Set(['settings.get','settings.save','synthesize','preview','cancel','playback','availability','cache.list','cache.preview','cache.delete','cache.pin','providers.discover','credentials.set','credentials.status','credentials.unlock','credentials.forget'].map(action=>'tts.'+action));
contextBridge.exposeInMainWorld('alternative',Object.freeze({
  startupTheme,
  htmlPreview(action,args={}){
    if(!htmlPreviewActions.has(action))return Promise.reject(new Error('Unknown HTML preview action.'));
    // Only bounded native placement is synchronous; opening and closing stay async.
    if(action==='html.preview.update'){
      try{return Promise.resolve(ipcRenderer.sendSync('alternative:html-preview-geometry',args));}
      catch(error){return Promise.reject(error);}
    }
    return invoke('html-preview',action,args);
  },
  onHtmlPreviewEvent(callback){if(typeof callback!=='function')throw new TypeError('An HTML preview callback is required.');const fn=(_event,value)=>callback(value);ipcRenderer.on('alternative:html-preview-event',fn);return ()=>ipcRenderer.removeListener('alternative:html-preview-event',fn);},
  onTtsEvent(callback){if(typeof callback!=='function')throw new TypeError('A Text-to-Speech event callback is required.');const fn=(_event,value)=>callback(value);ipcRenderer.on('alternative:tts-event',fn);return ()=>ipcRenderer.removeListener('alternative:tts-event',fn);},
  tts:(action,args={})=>ttsActions.has(action)?invoke('tts',action,args):Promise.reject(new Error('Unknown Text-to-Speech action.')),
  loadState:()=>invoke('load-state'),saveState:value=>invoke('save-state',value),
  connect:url=>invoke('connect',url),request:(method,args)=>invoke('request',method,args),
  openExternal:url=>invoke('open-external',url),copy:text=>invoke('copy',text),
  exportFile:value=>invoke('export',value),getInfo:()=>invoke('info')
}));
