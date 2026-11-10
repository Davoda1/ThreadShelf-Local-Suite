const { contextBridge, ipcRenderer } = require('electron');
let startupAppearance={};
try {
  const value=process.argv.find(argument=>argument.startsWith('--threadshelf-startup='))?.slice('--threadshelf-startup='.length);
  if(value&&value.length<=4096){const parsed=JSON.parse(decodeURIComponent(value));if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))startupAppearance=parsed;}
} catch { /* The renderer's appearance defaults remain available. */ }
const allowed=new Set(['resources.status','resources.list','resources.settings','resources.context','resources.load','resources.cancel','resources.clear','bootstrap','settings.save','collections','files','thread','search','import.pick','import.paths','operation.cancel','server.collections','server.import','reading.save','semantic.setup','semantic.index','search.status','search.prepare','ollama.models','ollama.test','ollama.start','ollama.pull','ollama.delete','export.conversation','app.openData','app.openServerSupport','app.about','external.open','clipboard.write','storage.convert','manager.status','manager.dedup.settings','manager.dedup.preview','manager.dedup.apply','manager.files','manager.preview','manager.mutate','manager.maintenance','manager.backup','manager.restore.pick','manager.restore','activity.query','activity.rebuild','activity.csv','activity.export','activity.cancel','server.insights','server.insights.cancel']);
for(const action of ['open','update','close','closeAll'])allowed.add('html.preview.'+action);
for(const action of ['settings.get','settings.save','synthesize','preview','cancel','playback','availability','cache.list','cache.preview','cache.delete','cache.pin','providers.discover','credentials.set','credentials.status','credentials.unlock','credentials.forget'])allowed.add('tts.'+action);
contextBridge.exposeInMainWorld('desktop',Object.freeze({
  startupAppearance:Object.freeze(startupAppearance),
  capabilities:Object.freeze({clipboardWrite:true}),
  invoke(action,args={}){
    if(!allowed.has(action))return Promise.reject(new Error('Unknown action.'));
    if(action.startsWith('resources.')){
      if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).length>6)return Promise.reject(new Error('Invalid resource request.'));
      let size=0;for(const value of Object.values(args)){if(!['string','boolean','undefined'].includes(typeof value))return Promise.reject(new Error('Invalid resource request.'));if(typeof value==='string'){size+=value.length;if(size>32768)return Promise.reject(new Error('Invalid resource request.'));}}
    }
    return ipcRenderer.invoke('reader:invoke',action,args).catch(error=>{
      const message=String(error?.message||error).replace(/^Error invoking remote method ['"]reader:invoke['"]:\s*(?:Error:\s*)?/,'');
      throw new Error(message);
    });
  },
  onHtmlPreviewEvent(callback){if(typeof callback!=='function')throw new TypeError('A preview callback is required.');const fn=(_event,value)=>callback(value);ipcRenderer.on('reader:html-preview',fn);return ()=>ipcRenderer.removeListener('reader:html-preview',fn);},
  onTtsEvent(callback){if(typeof callback!=='function')throw new TypeError('A Text-to-Speech event callback is required.');const fn=(_event,value)=>callback(value);ipcRenderer.on('reader:tts',fn);return ()=>ipcRenderer.removeListener('reader:tts',fn);},
  onProgress(callback){const fn=(_event,value)=>callback(value);ipcRenderer.on('reader:progress',fn);return ()=>ipcRenderer.removeListener('reader:progress',fn);},
  onMenu(callback){const fn=(_event,value)=>callback(value);ipcRenderer.on('reader:menu',fn);return ()=>ipcRenderer.removeListener('reader:menu',fn);}
}));
