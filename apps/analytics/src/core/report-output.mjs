/** Main-owned temporary report files survive worker cancellation safely. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {constants} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {assertOutputOutsideSource} from './source-access.mjs';
export async function prepareReportOutput(destination,sources){
 await assertOutputOutsideSource(destination,sources);const parent=path.dirname(destination),initial=await fs.lstat(parent);if(!initial.isDirectory()||initial.isSymbolicLink())throw new Error('Unsafe report directory.');
 let directory,temporary,identity;const temporaryName='.analytics-export-'+randomUUID()+'.tmp';
 try{
  if(process.platform==='linux'){directory=await fs.open(parent,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);const state=await directory.stat();if(state.dev!==initial.dev||state.ino!==initial.ino)throw new Error('Report directory changed.');}
  const anchor=directory?`/proc/self/fd/${directory.fd}`:parent;temporary=path.join(anchor,temporaryName);await assertOutputOutsideSource(destination,sources);const handle=await fs.open(temporary,'wx',0o600);try{identity=await handle.stat();}finally{await handle.close();}
  const context={parent,temporaryName,dev:identity.dev,ino:identity.ino,parentDev:initial.dev,parentIno:initial.ino,...(directory?{directoryFd:directory.fd}:{})};
  let cleaned=false;
  return{context,cleanup:async()=>{
   if(cleaned)return;cleaned=true;
   try{
    const parentState=directory?await directory.stat():await fs.lstat(parent);if(parentState.dev!==initial.dev||parentState.ino!==initial.ino||parentState.isSymbolicLink())return;
    const state=await fs.lstat(temporary).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(state?.isFile()&&!state.isSymbolicLink()&&state.nlink===1&&state.dev===identity.dev&&state.ino===identity.ino)await fs.rm(temporary);
   }finally{await directory?.close().catch(()=>{});}
  }};
 }catch(error){if(temporary&&identity){const state=await fs.lstat(temporary).catch(()=>null);if(state?.dev===identity.dev&&state?.ino===identity.ino)await fs.rm(temporary,{force:true}).catch(()=>{});}await directory?.close().catch(()=>{});throw error;}
}
