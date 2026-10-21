'use strict';
const fs = require('node:fs');
const path = require('node:path');
const DEFAULTS = Object.freeze({version:1,serverUrl:'http://localhost:3000',theme:'system',fontSize:16,lineWidth:'comfortable',showReasoning:false,pins:[],savedSearches:[],recent:[],positions:{},collection:''});
function cleanState(value) {
  if(!value || typeof value!=='object' || Array.isArray(value)) return structuredClone(DEFAULTS);
  const out=structuredClone(DEFAULTS);
  for(const key of ['serverUrl','collection']) if(typeof value[key]==='string' && value[key].length<4096) out[key]=value[key];
  if(['system','light','dark'].includes(value.theme)) out.theme=value.theme;
  if(Number.isFinite(value.fontSize)) out.fontSize=Math.max(13,Math.min(24,value.fontSize));
  if(['comfortable','wide','compact'].includes(value.lineWidth)) out.lineWidth=value.lineWidth;
  out.showReasoning=value.showReasoning===true;
  for(const [key,max] of [['pins',500],['savedSearches',100],['recent',100]]) {
    if(Array.isArray(value[key])) out[key]=value[key].filter(v=>v && typeof v==='object' && !Array.isArray(v)).slice(0,max);
  }
  if(value.positions && typeof value.positions==='object' && !Array.isArray(value.positions)) {
    for(const [key,v] of Object.entries(value.positions).slice(-1000)) {
      if(key.length<8192 && !['__proto__','constructor','prototype'].includes(key) && (Number.isFinite(v) || (v && typeof v==='object'))) out.positions[key]=v;
    }
  }
  return out;
}
class StateStore {
  constructor(directory){ this.directory=directory;this.file=path.join(directory,'alternative-state.json');this.error=null; }
  load(){
    try { const stat=fs.statSync(this.file); if(stat.size>8*1024*1024) throw new Error('Settings file is too large.'); return cleanState(JSON.parse(fs.readFileSync(this.file,'utf8'))); }
    catch(e){if(e.code!=='ENOENT')this.error='Saved settings could not be read. Changes stay in this session to protect the original file. Close Alternative and restore a backup or move aside its profile before restarting.';return structuredClone(DEFAULTS);}
  }
  save(value){
    // A failed load must not turn autosave or the close flush into a reset.
    // Recovery is explicit: close the app and restore or move aside its profile.
    if(this.error)throw new Error(this.error);
    const state=cleanState(value),data=JSON.stringify(state,null,2);
    if(Buffer.byteLength(data)>8*1024*1024)throw new Error('Settings exceed the 8 MiB limit. Remove some saved items.');
    fs.mkdirSync(this.directory,{recursive:true,mode:0o700});
    const tmp=this.file+'.tmp-'+process.pid;
    try {fs.writeFileSync(tmp,data,{mode:0o600});fs.renameSync(tmp,this.file);}finally{try{fs.unlinkSync(tmp);}catch{}}
    this.error=null;return state;
  }
}
module.exports={StateStore,cleanState,DEFAULTS};
