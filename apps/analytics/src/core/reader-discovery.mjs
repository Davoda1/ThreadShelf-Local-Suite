/** Conservative standard-path discovery; never consults Reader preferences. */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { SourceAccess, assertOutputOutsideSource } from './source-access.mjs';
import { observeReader } from './reader-capture.mjs';

export const EMPTY_DISCOVERY=Object.freeze({status:'not-started',path:null,archiveRoot:null,sourceId:null,available:false,automatic:false,checkedAt:null,error:null});
/** Matches Reader 3.1.0 desktop/main.cjs; no home-directory scan/fallback list. */
export function standardReaderProfile({platform=process.platform,env=process.env,home=os.homedir()}={}){
  const api=platform==='win32'?path.win32:path.posix;
  if(platform==='win32'){const base=typeof env.APPDATA==='string'&&api.isAbsolute(env.APPDATA)?env.APPDATA:api.join(home,'AppData','Roaming');return api.join(base,'ThreadShelf Local Reader');}
  if(platform==='linux'){const base=typeof env.XDG_CONFIG_HOME==='string'&&api.isAbsolute(env.XDG_CONFIG_HOME)?env.XDG_CONFIG_HOME:api.join(home,'.config');return api.join(base,'ThreadShelf Local Reader');}
  return null;
}
export function discoveryPathKey(value){const absolute=path.resolve(value);return process.platform==='win32'?absolute.toLowerCase():absolute;}
export async function detectStandardReader({analyticsRoot,platform,env,home,signal,onAccess,probe}={}){
  const profile=standardReaderProfile({platform,env,home}),base={...EMPTY_DISCOVERY,path:profile,checkedAt:new Date().toISOString()};
  if(!profile)return {...base,status:'unsupported'};
  try{
    signal?.throwIfAborted();const profileStat=await fs.lstat(profile);
    if(profileStat.isSymbolicLink())return {...base,status:'unsafe',error:{code:'SOURCE_UNSAFE',message:'The standard Reader profile is a link. Choose a regular Reader profile directory.'}};
    if(!profileStat.isDirectory())return {...base,status:'invalid',error:{code:'SOURCE_UNSAFE',message:'The standard Reader profile path is not a directory.'}};
    let storageStat;try{storageStat=await fs.lstat(path.join(profile,'local-storage-v2'));}catch(error){if(error.code==='ENOENT')return {...base,status:'absent'};throw error;}
    if(!storageStat.isDirectory()||storageStat.isSymbolicLink())return {...base,status:'unsafe',error:{code:'SOURCE_UNSAFE',message:'The detected Reader archive has an unsafe directory type.'}};
    const source=await SourceAccess.open(profile);if(analyticsRoot)await assertOutputOutsideSource(analyticsRoot,source);
    // The desktop supplies its worker-based probe: potentially large manifests
    // and checksum work never execute on Electron's GUI thread.
    const observed=probe?await probe(source.profileRoot,{signal,onAccess}):await observeReader(source.profileRoot,{signal,onAccess});
    return {...base,status:'available',path:source.profileRoot,archiveRoot:source.root,readerSourceId:source.sourceId,snapshotId:observed.identity||observed.snapshotId,available:true,commit:observed.commit};
  }catch(error){if(signal?.aborted)throw error;const code=error.code||'SOURCE_UNAVAILABLE';
    if(code==='ENOENT')return {...base,status:'absent'};
    const status=code==='SOURCE_UNSAFE'||code==='SOURCE_OUTPUT_OVERLAP'||code==='SOURCE_OUTPUT_ALIAS'?'unsafe':code==='SOURCE_INTEGRITY'||code==='SOURCE_LIMIT'?'invalid':'unavailable';
    return {...base,status,error:{code,message:String(error.message).slice(0,1200)}};
  }
}
