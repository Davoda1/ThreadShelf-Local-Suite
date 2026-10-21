/** Purpose-limited Reader source access. No write API is exposed. */
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ID='[a-f0-9]{32}', HASH='[a-f0-9]{64}';
const allowedFile=new RegExp(`^(?:current\\.json|records/${ID}/head\\.json|records/${ID}/[0-9]{16}-${ID}\\.json\\.gz|snapshots/${ID}\\.(?:7z|zip)|objects/${HASH}\\.${HASH}\\.(?:7z|zip))$`);
const allowedDirectory=new RegExp(`^records/${ID}$`);
export function sourceError(message,code='SOURCE_UNSAFE'){return Object.assign(new Error(message),{code});}
export function pathWithin(root,target){const relative=path.relative(root,target);return relative===''||(!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative));}
async function rejectLinks(absolute,{missing=false}={}){
  const root=path.parse(absolute).root;let current=root;
  for(const part of absolute.slice(root.length).split(path.sep).filter(Boolean)){
    current=path.join(current,part);let stat;
    try{stat=await fs.lstat(current);}catch(error){if(missing&&error.code==='ENOENT')return;throw error;}
    if(stat.isSymbolicLink())throw sourceError('Symlink, junction or reparse-point paths are not accepted.');
  }
}
async function resolveMissing(absolute){
  let current=absolute;const tail=[];
  for(;;){try{const real=await fs.realpath(current);return path.join(real,...tail.reverse());}catch(error){if(error.code!=='ENOENT')throw error;const parent=path.dirname(current);if(parent===current)throw error;tail.push(path.basename(current));current=parent;}}
}
async function rejectReaderProfileAncestors(absolute){
  let directory=path.dirname(absolute);
  for(;;){
    if(path.basename(directory)==='local-storage-v2')throw sourceError('Reports and caches cannot be placed in a Reader profile.','SOURCE_OUTPUT_OVERLAP');
    const storage=await fs.lstat(path.join(directory,'local-storage-v2')).catch(error=>{if(error.code==='ENOENT'||error.code==='ENOTDIR')return null;throw error;});
    if(storage?.isDirectory()||storage?.isSymbolicLink())throw sourceError('Reports and caches cannot be placed in a Reader profile.','SOURCE_OUTPUT_OVERLAP');
    // Recognize a renamed storage-directory copy using names/types only; never
    // load current.json or preferences to decide whether a destination is safe.
    const marker=[];for(const name of ['current.json','records','snapshots'])marker.push(await fs.lstat(path.join(directory,name)).catch(error=>{if(error.code==='ENOENT'||error.code==='ENOTDIR')return null;throw error;}));
    if(marker[0]?.isFile()&&marker[1]?.isDirectory()&&marker[2]?.isDirectory())throw sourceError('Reports and caches cannot be placed in Reader storage.','SOURCE_OUTPUT_OVERLAP');
    const parent=path.dirname(directory);if(parent===directory)break;directory=parent;
  }
}
/** Prevent report/cache placement inside or through a source, including aliases. */
export async function assertOutputOutsideSource(destination,sources){
  if(typeof destination!=='string'||!destination||destination.includes('\0'))throw sourceError('Invalid output destination.');
  const absolute=path.resolve(destination);await rejectLinks(absolute,{missing:true});const resolved=await resolveMissing(absolute);await rejectReaderProfileAncestors(resolved);
  for(const source of (Array.isArray(sources)?sources:[sources]).filter(Boolean)){
    const selected=typeof source==='string'?path.resolve(source):source.profileRoot;
    const root=typeof source==='string'&&path.basename(selected)==='local-storage-v2'?path.dirname(selected):selected;
    const real=await resolveMissing(root);
    if([root,real].some(protectedRoot=>pathWithin(protectedRoot,resolved)||pathWithin(resolved,protectedRoot)))throw sourceError('Output and Reader source paths overlap.','SOURCE_OUTPUT_OVERLAP');
  }
  try{const stat=await fs.lstat(absolute);if(stat.isFile()&&stat.nlink>1)throw sourceError('Hard-linked output files are not accepted.','SOURCE_OUTPUT_ALIAS');}catch(error){if(error.code!=='ENOENT')throw error;}
  return resolved;
}

export class SourceAccess{
  #root;#profile;#identity;#audit;
  static async open(sourcePath,{onAccess=()=>{}}={}){
    if(typeof sourcePath!=='string'||!sourcePath||sourcePath.includes('\0'))throw sourceError('Select a Reader profile or local-storage-v2 directory.');
    const selected=path.resolve(sourcePath);await rejectLinks(selected);const selectedStat=await fs.lstat(selected);
    if(!selectedStat.isDirectory())throw sourceError('Reader source must be a directory.');
    const root=path.basename(selected)==='local-storage-v2'?selected:path.join(selected,'local-storage-v2');
    await rejectLinks(root);const stat=await fs.lstat(root);if(!stat.isDirectory())throw sourceError('Reader local-storage-v2 directory is unavailable.');
    const instance=new SourceAccess();instance.#root=await fs.realpath(root);instance.#profile=path.dirname(instance.#root);instance.#identity={dev:stat.dev,ino:stat.ino};instance.#audit=onAccess;return instance;
  }
  get root(){return this.#root;}get profileRoot(){return this.#profile;}
  get sourceId(){return createHash('sha256').update(this.#root).digest('hex');}
  #validate(relative,directory=false){if(typeof relative!=='string'||!(directory?allowedDirectory:allowedFile).test(relative))throw sourceError('Reader source access is outside the explicit archive allowlist.','SOURCE_EXCLUDED');return relative.split('/');}
  async #assertRoot(){const stat=await fs.lstat(this.#root);if(!stat.isDirectory()||stat.isSymbolicLink()||stat.dev!==this.#identity.dev||stat.ino!==this.#identity.ino)throw sourceError('Reader source directory changed during capture.','SOURCE_CHANGED');}
  async #handle(relative,directory=false){
    const parts=this.#validate(relative,directory);await this.#assertRoot();const opened=[];
    try{
      let parent=this.#root;
      // Linux descriptor-relative paths keep traversal anchored to opened,
      // O_NOFOLLOW directory handles rather than a replaceable pathname.
      if(process.platform==='linux'){
        const root=await fs.open(parent,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);opened.push(root);const stat=await root.stat();
        if(stat.dev!==this.#identity.dev||stat.ino!==this.#identity.ino)throw sourceError('Reader source directory changed.','SOURCE_CHANGED');
        parent=`/proc/self/fd/${root.fd}`;
      }
      for(let i=0;i<parts.length-1;i++){
        const next=path.join(parent,parts[i]);const stat=await fs.lstat(next);
        if(!stat.isDirectory()||stat.isSymbolicLink())throw sourceError('Reader archive directory has an unsafe type.');
        if(process.platform==='linux'){const handle=await fs.open(next,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);opened.push(handle);const actual=await handle.stat();if(actual.dev!==stat.dev||actual.ino!==stat.ino)throw sourceError('Reader path changed.','SOURCE_CHANGED');parent=`/proc/self/fd/${handle.fd}`;}else parent=next;
      }
      const filename=path.join(parent,parts.at(-1));const before=await fs.lstat(filename);
      if(before.isSymbolicLink()||(directory?!before.isDirectory():!before.isFile())||(!directory&&before.nlink!==1))throw sourceError('Reader archive member is a symlink, hard-link alias, or unsafe file type.');
      const handle=await fs.open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(directory?(constants.O_DIRECTORY||0):0));opened.push(handle);
      const actual=await handle.stat();if(actual.dev!==before.dev||actual.ino!==before.ino||actual.size!==before.size||(!directory&&actual.nlink!==1))throw sourceError('Reader archive member changed before read.','SOURCE_CHANGED');
      this.#audit({operation:directory?'list':'read',relative,flags:'O_RDONLY',bytes:directory?0:actual.size});
      return {handle,stat:actual,filename,opened};
    }catch(error){for(const h of opened.reverse())await h.close().catch(()=>{});throw error;}
  }
  async read(relative,{maxBytes=32*1024*1024,signal}={}){
    signal?.throwIfAborted();const state=await this.#handle(relative);try{
      if(!Number.isSafeInteger(maxBytes)||maxBytes<0||state.stat.size>maxBytes)throw sourceError('Reader input exceeds the capture size limit.','SOURCE_LIMIT');
      const bytes=Buffer.alloc(state.stat.size);let position=0;
      while(position<bytes.length){signal?.throwIfAborted();const {bytesRead}=await state.handle.read(bytes,position,Math.min(1024*1024,bytes.length-position),position);if(!bytesRead)throw sourceError('Reader file disappeared or was truncated.','SOURCE_CHANGED');position+=bytesRead;}
      const after=await state.handle.stat();if(after.size!==state.stat.size||after.mtimeMs!==state.stat.mtimeMs||after.ctimeMs!==state.stat.ctimeMs||after.nlink!==1)throw sourceError('Reader file changed during capture.','SOURCE_CHANGED');await this.#assertRoot();signal?.throwIfAborted();return bytes;
    }finally{for(const h of state.opened.reverse())await h.close().catch(()=>{});}
  }
  async *stream(relative,{maxBytes=512*1024*1024,signal}={}){
    signal?.throwIfAborted();const state=await this.#handle(relative);try{
      if(!Number.isSafeInteger(maxBytes)||maxBytes<0||state.stat.size>maxBytes)throw sourceError('Reader input exceeds the capture size limit.','SOURCE_LIMIT');
      let position=0;while(position<state.stat.size){signal?.throwIfAborted();const bytes=Buffer.alloc(Math.min(1024*1024,state.stat.size-position));const {bytesRead}=await state.handle.read(bytes,0,bytes.length,position);if(!bytesRead)throw sourceError('Reader file was truncated.','SOURCE_CHANGED');position+=bytesRead;yield bytes.subarray(0,bytesRead);}
      const after=await state.handle.stat();if(after.size!==state.stat.size||after.mtimeMs!==state.stat.mtimeMs||after.ctimeMs!==state.stat.ctimeMs||after.nlink!==1)throw sourceError('Reader file changed during capture.','SOURCE_CHANGED');await this.#assertRoot();signal?.throwIfAborted();
    }finally{for(const h of state.opened.reverse())await h.close().catch(()=>{});}
  }
  async listRecords(epoch,{signal}={}){
    signal?.throwIfAborted();const state=await this.#handle(`records/${epoch}`,true);try{const anchored=process.platform==='linux'?`/proc/self/fd/${state.handle.fd}`:state.filename;const names=await fs.readdir(anchored);if(names.length>1000001)throw sourceError('Too many journal members.','SOURCE_LIMIT');await this.#assertRoot();return names.filter(name=>/^[0-9]{16}-[a-f0-9]{32}\.json\.gz$/.test(name)).sort();}finally{for(const h of state.opened.reverse())await h.close().catch(()=>{});}
  }
}
