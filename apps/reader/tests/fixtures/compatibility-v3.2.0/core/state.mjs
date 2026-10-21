import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { APPEARANCE_DEFAULTS, UI_PALETTE_IDS, CODE_THEME_IDS, SOURCE_SWITCH_WIDTHS } from './themes.mjs';
import { normalizeReadingSourceScope, readingSourceFor, matchesReadingSource, limitRecentForSource } from './reading-identity.mjs';
export { APPEARANCE_DEFAULTS } from './themes.mjs';

export const DEFAULTS = Object.freeze({mode:'local',language:'en',theme:'system',fontSize:'normal',highContrast:false,compact:true,animations:true,listMode:'pages',pageSize:50,sort:'updated',directoryMode:'last',customDirectory:'',lastDirectory:'',serverUrl:'http://localhost:3000/',serverAddresses:['http://localhost:3000/'],localCollection:'all',serverCollection:'all',searchMode:'keyword',ollamaUrl:'http://127.0.0.1:11434',ollamaModel:''});
export const INTERFACE_DEFAULTS = Object.freeze({ searchPanelExpanded: false });
// Keep established preference-file key sets readable by older strict readers.
export const LAYOUT_DEFAULTS = Object.freeze({ sourceSwitchWidth: 'equal' });
const plain = v => v && typeof v==='object' && !Array.isArray(v);
const enums = {mode:['local','server'],language:['en','hu','de','fr','ja'],theme:['system','light','dark'],fontSize:['small','normal','large','xl'],listMode:['pages','scroll'],sort:['updated','title','length'],directoryMode:['last','custom'],searchMode:['titles','keyword','exact','fuzzy','semantic','hybrid','ollama'],uiPalette:UI_PALETTE_IDS,codeTheme:CODE_THEME_IDS,sourceSwitchWidth:SOURCE_SWITCH_WIDTHS};
export function normalizeServerUrl(value) {
  const url=new URL(String(value).trim());
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash) throw new Error('Use an HTTP(S) server address without credentials, a query, or a fragment.');
  url.pathname=url.pathname.replace(/\/+$/,'')+'/'; return url.href;
}
export function validateSettings(values) {
  if(!plain(values))throw new Error('Invalid settings.');
  const result={};
  for(const [key,value] of Object.entries(values)){
    if(!Object.hasOwn(DEFAULTS,key)&&!Object.hasOwn(INTERFACE_DEFAULTS,key)&&!Object.hasOwn(APPEARANCE_DEFAULTS,key)&&!Object.hasOwn(LAYOUT_DEFAULTS,key)) throw new Error(`Unknown setting: ${key}`);
    if(enums[key]){if(!enums[key].includes(value))throw new Error(`Invalid setting: ${key}`);result[key]=value;}
    else if(['highContrast','compact','animations','searchPanelExpanded'].includes(key)){if(typeof value!=='boolean')throw new Error(`Invalid setting: ${key}`);result[key]=value;}
    else if(key==='pageSize'){if(![20,25,50,100,200].includes(value))throw new Error('Invalid page size.');result[key]=value;}
    else if(key==='serverAddresses'){if(!Array.isArray(value)||value.length>30)throw new Error('Too many server addresses.');result[key]=[...new Set(value.map(normalizeServerUrl))];}
    else if(['serverUrl','ollamaUrl'].includes(key)) result[key]=normalizeServerUrl(value);
    else {if(typeof value!=='string'||value.length>8192||value.includes('\0'))throw new Error(`Invalid setting: ${key}`);result[key]=value;}
  }
  return result;
}
export function validateCoreSettings(values) {
  const validated = validateSettings(values);
  return Object.fromEntries(Object.entries(validated).filter(([key]) => Object.hasOwn(DEFAULTS, key)));
}
export function validateInterfaceSettings(values) {
  if (!plain(values) || Object.keys(values).some(key => !Object.hasOwn(INTERFACE_DEFAULTS, key))) throw new Error('Invalid interface settings.');
  return { ...INTERFACE_DEFAULTS, ...validateSettings(values) };
}
export function validateAppearanceSettings(values) {
  if (!plain(values) || Object.keys(values).some(key => !Object.hasOwn(APPEARANCE_DEFAULTS, key))) throw new Error('Invalid appearance settings.');
  return { ...APPEARANCE_DEFAULTS, ...validateSettings(values) };
}
export function validateLayoutSettings(values) {
  if (!plain(values) || Object.keys(values).some(key => !Object.hasOwn(LAYOUT_DEFAULTS, key))) throw new Error('Invalid layout settings.');
  return { ...LAYOUT_DEFAULTS, ...validateSettings(values) };
}
export class JsonState {
  constructor(dataDir,name,defaults,validate=v=>v){this.file=path.join(dataDir,name);this.defaults=defaults;this.validate=validate;this.queue=Promise.resolve();this.notice='';}
  async init(){
    await fs.mkdir(path.dirname(this.file),{recursive:true,mode:0o700});
    const read=async p=>{const stat=await fs.stat(p);if(stat.size>32*1024*1024)throw new Error('Saved state exceeds its size limit.');const v=JSON.parse(await fs.readFile(p,'utf8'));if(v.schemaVersion!==1)throw Object.assign(new Error('Unsupported saved state version. Files were preserved.'),{code:'SCHEMA'});return this.validate(v.data);};
    try {this.value=await read(this.file);}
    catch(error){
      if(error.code==='SCHEMA')throw error;
      try {this.value=await read(this.file+'.bak');this.notice='Recovered saved data from its backup.';}
      catch(backupError){if(error.code!=='ENOENT'||backupError.code!=='ENOENT')throw new Error(`Cannot read ${path.basename(this.file)}. Saved files were preserved: ${error.message}`);this.value=structuredClone(this.defaults);}
    }
    return this;
  }
  snapshot(){return structuredClone(this.value);}
  update(fn){
    const task=this.queue.catch(()=>{}).then(async()=>{
      const next=this.validate(await fn(this.snapshot()));
      const bytes=JSON.stringify({schemaVersion:1,data:next},null,2)+'\n';
      if(Buffer.byteLength(bytes)>32*1024*1024)throw new Error('Saved data is full. Remove unneeded bookmarks or reading positions.');
      const tmp=this.file+'.'+process.pid+'.'+randomBytes(6).toString('hex')+'.tmp';
      const backupTmp=tmp+'.bak';
      let handle;
      try {
        handle=await fs.open(tmp,'wx',0o600);await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;
        // Back up only the previously validated in-memory snapshot.
        await fs.writeFile(backupTmp,JSON.stringify({schemaVersion:1,data:this.value})+'\n',{mode:0o600});
        await fs.rename(backupTmp,this.file+'.bak');await fs.rename(tmp,this.file);
        this.value=next; return this.snapshot();
      } finally {await handle?.close().catch(()=>{});await fs.unlink(tmp).catch(()=>{});await fs.unlink(backupTmp).catch(()=>{});}
    });this.queue=task;return task;
  }
}
export async function resolveImportDirectory(settings,{home=os.homedir(),platform=process.platform}={}){
  const root=path.parse(home).root|| (platform==='win32'?'C:\\':'/');
  const preferred=settings.directoryMode==='custom'?settings.customDirectory:settings.lastDirectory;
  const candidates=[...(settings.directoryMode==='custom'?[settings.customDirectory]:[]),settings.lastDirectory,home,root].filter(Boolean);
  for(const p of [...new Set(candidates)]){
    try {const s=await fs.stat(p);if(!s.isDirectory())continue;await fs.access(p,fs.constants.R_OK);return {path:p,notice:preferred&&p!==preferred?'The configured folder is unavailable. Using an accessible fallback; your preference was retained.':''};}catch{}
  }
  return {path:undefined,notice:'No configured folder is accessible. The system file picker will choose its default location.'};
}
export function validateReading(value){
  if(!plain(value)||!plain(value.positions)||!Array.isArray(value.bookmarks)||!Array.isArray(value.recent))throw new Error('Invalid reading state.');
  if(Object.keys(value.positions).length>10000||value.bookmarks.length>10000)throw new Error('Reading history capacity reached. Remove unneeded entries in Saved reading.');
  return value;
}
export function applyReading(value,args){
  const {key,position,bookmark,removeBookmark,clear}=args;
  if(typeof key!=='string'||key.length>32768||key.includes('\0')||['__proto__','constructor','prototype'].includes(key))throw new Error('Invalid reading identity.');
  if(clear!==undefined&&!['position','positions','bookmarks','all'].includes(clear))throw new Error('Invalid saved-reading clear operation.');
  const scope=args.sourceScope===undefined?null:normalizeReadingSourceScope(args.sourceScope);
  const belongs=(entryKey,entry)=>!scope||matchesReadingSource({...entry,key:entryKey},scope);
  if(scope&&(position||bookmark||removeBookmark||clear==='position')&&!belongs(key,position||bookmark||value.positions[key]||value.bookmarks.find(entry=>entry.key===key)))throw new Error('Saved-reading identity does not match the selected source.');
  const now=Date.now();
  if(clear==='all'||clear==='positions'){
    value.positions=Object.fromEntries(Object.entries(value.positions).filter(([entryKey,entry])=>!belongs(entryKey,entry)));
    value.recent=value.recent.filter(entry=>!belongs(typeof entry==='string'?entry:entry?.key,entry));
  }
  if(clear==='all'||clear==='bookmarks')value.bookmarks=value.bookmarks.filter(entry=>!belongs(entry.key,entry));
  if(clear==='all')return validateReading(value);
  if(clear==='position'){delete value.positions[key];value.recent=value.recent.filter(r=>(typeof r==='string'?r:r?.key)!==key);}
  const anchor=a=>{if(!plain(a)||!Number.isSafeInteger(a.turnIndex)||a.turnIndex<0||!['user','assistant','ai','thinking','tool','system'].includes(a.role))throw new Error('Invalid reading location.');};
  if(position){anchor(position);if(!Number.isFinite(position.offset)||Math.abs(position.offset)>1)throw new Error('Invalid reading offset.');const p={...position,updatedAt:now};delete p.key;value.positions[key]=p;const entry={...p,key,title:String(args.title||position.title||'').slice(0,2000)};value.recent=limitRecentForSource([entry,...value.recent.filter(r=>(typeof r==='string'?r:r?.key)!==key)],readingSourceFor(entry));}
  if(bookmark){anchor(bookmark);const entry={...bookmark,key,updatedAt:now};value.bookmarks=value.bookmarks.filter(b=>!(b.key===key&&b.turnIndex===entry.turnIndex&&b.role===entry.role));value.bookmarks.push(entry);}
  if(removeBookmark){anchor(removeBookmark);value.bookmarks=value.bookmarks.filter(b=>!(b.key===key&&b.turnIndex===removeBookmark.turnIndex&&b.role===removeBookmark.role));}
  return validateReading(value);
}
