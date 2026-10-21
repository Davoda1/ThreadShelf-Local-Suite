/** Durable compressed Local storage. SQLite working files are disposable; snapshots
 * and immutable, fsynced redo records are the sole persistent authority. */
import fs from 'node:fs/promises';
import { constants, createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import { createGzip, gunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { DatabaseSync, backup as sqliteBackup } from 'node:sqlite';
import { ZipReader, ZipWriter, Reader, Uint8ArrayReader } from '@zip.js/zip.js';
import { encodeFile, decodeFile } from './codec.mjs';

const gunzipAsync=promisify(gunzip);
const FORMAT='threadshelf-local-storage-v2', VERSION=2, MAX_RECORD=1024*1024*1024, MAX_PAYLOAD=512*1024*1024, MAX_METADATA=32*1024*1024;
const hash=value=>createHash('sha256').update(value).digest('hex');
const uuid=()=>randomUUID().replaceAll('-','');
const exists=async file=>{try{await fs.access(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
const validId=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const validSequence=value=>Number.isSafeInteger(value)&&value>=0;
const profileOf=value=>value==='zip'||value==='zip6'?'zip6':value==='7z'?'7z':null;
const objectName=name=>typeof name==='string'&&/^(?:vector-[a-f0-9]{64}|[a-f0-9]{64}\.[a-f0-9]{64})\.(?:7z|zip)$/.test(name);
const snapshotName=name=>typeof name==='string'&&/^[a-f0-9]{32}\.(?:7z|zip)$/.test(name);
const MAX_FILE=64*1024**3;
function storageError(message,cause){return Object.assign(new Error(message,{cause}),{code:'STORAGE_RECOVERY_REQUIRED'});}
async function fileHash(file){const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex');}
// FlushFileBuffers on Windows requires write access. O_WRONLY reopens an
// existing file without creating or truncating it; real flush errors propagate.
async function syncFile(file){const handle=await fs.open(file,constants.O_WRONLY);try{await handle.sync();}finally{await handle.close();}}
async function syncDirectory(directory){let handle;try{handle=await fs.open(directory,'r');await handle.sync();}catch(e){if(!(process.platform==='win32'&&['EINVAL','EPERM','EACCES','EISDIR','ENOTSUP'].includes(e.code)))throw e;}finally{await handle?.close();}}
async function atomicWrite(file,bytes){const temp=`${file}.${uuid()}.part`;let handle;try{handle=await fs.open(temp,'wx',0o600);await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;await fs.rename(temp,file);await syncDirectory(path.dirname(file));}finally{await handle?.close();await fs.rm(temp,{force:true}).catch(()=>{});}}
async function ownedDirectory(directory){const stat=await fs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw storageError(`Local storage directory has an unsafe type: ${path.basename(directory)}.`);}
async function regularFile(file){const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw storageError(`Local storage file has an unsafe type: ${path.basename(file)}.`);return stat;}
async function directorySize(root){let bytes=0;for(const entry of await fs.readdir(root,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return[];throw e;})){const file=path.join(root,entry.name);if(entry.isDirectory())bytes+=await directorySize(file);else if(entry.isFile())bytes+=(await fs.stat(file).catch(e=>{if(e.code==='ENOENT')return{size:0};throw e;})).size;}return bytes;}
async function preflight(directory,bytes){const stat=await fs.statfs(directory);const free=stat.bavail*stat.bsize;if(free<bytes+8*1024*1024)throw Object.assign(new Error(`Not enough free space in ${directory}. Need at least ${Math.ceil((bytes+8*1024*1024)/1024/1024)} MiB for this operation.`),{code:'ENOSPC'});return free;}
async function checkDatabase(file){const db=new DatabaseSync(file,{readOnly:true});try{const rows=db.prepare('PRAGMA quick_check').all();if(rows.length!==1||Object.values(rows[0])[0]!=='ok')throw storageError(`SQLite integrity check failed for ${path.basename(file)}.`);}finally{db.close();}}
async function backupDatabase(database,target){let own=false,db=database;if(typeof database==='string'){db=new DatabaseSync(database,{readOnly:true});own=true;}try{await sqliteBackup(db,target);await fs.chmod(target,0o600);await syncFile(target);await checkDatabase(target);}finally{if(own)db.close();}}

/** Random-access reader keeps ZIP central-directory processing independent of file size. */
class DiskReader extends Reader{
  constructor(file){super();this.file=file;}
  async init({recovery=false}={}){await super.init();this.handle=await fs.open(this.file,'r');this.size=(await this.handle.stat()).size;}
  async readUint8Array(index,length){const out=new Uint8Array(length);let read=0;while(read<length){const {bytesRead}=await this.handle.read(out,read,length-read,index+read);if(!bytesRead)throw storageError('Compressed snapshot is truncated.');read+=bytesRead;}return out;}
  async close(){await this.handle?.close();}
}

async function writeBundle(file,files,{sequence=0,epoch=uuid(),kind='backup',profile='7z',signal}={}){
  signal?.throwIfAborted();const members=[];
  for(const [name,source] of Object.entries(files)){signal?.throwIfAborted();
    if(source===undefined||source===null)continue;
    if(typeof source==='string'){const stat=await fs.stat(source);members.push({name,file:source,size:stat.size,sha256:await fileHash(source)});}
    else {const bytes=Buffer.from(JSON.stringify(source));if(bytes.length>MAX_METADATA)throw new Error('Reading-state metadata exceeds the 32 MiB storage limit.');members.push({name,bytes,size:bytes.length,sha256:hash(bytes)});}
  }
  const manifest={format:FORMAT,version:VERSION,kind,profile:profileOf(profile),createdAt:new Date().toISOString(),sequence,epoch,files:members.map(({name,size,sha256})=>({name,size,sha256}))};
  const writable=Writable.toWeb(createWriteStream(file,{flags:'wx',mode:0o600}));
  const writer=new ZipWriter(writable,{zip64:true,useWebWorkers:false,useCompressionStream:false,level:6});
  try{
    await writer.add('manifest.json',new Uint8ArrayReader(Buffer.from(JSON.stringify(manifest))),{zip64:true,level:0,signal});
    for(const member of members){await writer.add(member.name,member.file?Readable.toWeb(createReadStream(member.file)):new Uint8ArrayReader(member.bytes),{zip64:true,level:member.name.startsWith('objects/')?0:6,signal});}
    signal?.throwIfAborted();await writer.close();await syncFile(file);
  }catch(e){try{await writer.close();}catch{}await fs.rm(file,{force:true}).catch(()=>{});throw e;}
  return manifest;
}

/** Validate all bytes even when no files are extracted. No entry-controlled paths. */
async function readBundle(file,{destination,expectedHash}={}){
  if(expectedHash&&await fileHash(file)!==expectedHash)throw storageError('Compressed snapshot checksum does not match its committed manifest.');
  const disk=new DiskReader(file), reader=new ZipReader(disk,{useWebWorkers:false,useCompressionStream:false,checkSignature:true});
  try{
    const entries=[];for await(const entry of reader.getEntriesGenerator()){if(entries.length>=1000001)throw storageError('Compressed snapshot has unexpected entries.');entries.push(entry);}
    if(new Set(entries.map(e=>e.filename)).size!==entries.length)throw storageError('Compressed snapshot contains duplicate members.');
    const entryMap=new Map(entries.map(e=>[e.filename,e]));const meta=entryMap.get('manifest.json');
    if(!meta||!Number.isSafeInteger(meta.uncompressedSize)||meta.uncompressedSize<0||meta.uncompressedSize>MAX_METADATA||meta.encrypted||meta.directory)throw storageError('Compressed snapshot has no valid manifest.');
    let metadataBytes=0;const metadataParts=[];await meta.getData(new WritableStream({write(bytes){metadataBytes+=bytes.length;if(metadataBytes>MAX_METADATA||metadataBytes>meta.uncompressedSize)throw storageError('Compressed snapshot manifest exceeded its declared size limit.');metadataParts.push(Buffer.from(bytes));}}),{checkSignature:true});if(metadataBytes!==meta.uncompressedSize)throw storageError('Compressed snapshot manifest size is inconsistent.');const manifest=JSON.parse(Buffer.concat(metadataParts).toString('utf8'));
    if(manifest.format!==FORMAT||manifest.version!==VERSION||manifest.kind!=='backup'||!profileOf(manifest.profile)||!validSequence(manifest.sequence)||!validId(manifest.epoch)||!Array.isArray(manifest.files)||manifest.files.length>1000000)throw storageError('Unsupported compressed storage format.');
    const allowed=new Set(['archive.sqlite','vectors.sqlite','reading.json']);
    if(new Set(manifest.files.map(e=>e.name)).size!==manifest.files.length||entries.length!==manifest.files.length+1)throw storageError('Compressed snapshot manifest/member mismatch.');
    const total=manifest.files.reduce((n,m)=>n+m.size,0);
    if(!Number.isSafeInteger(total))throw storageError('Compressed snapshot declares an invalid expanded size.');
    if(destination){await fs.mkdir(destination,{recursive:true,mode:0o700});await preflight(destination,total);}
    let reading=null;
    for(const member of manifest.files){
      if(!(allowed.has(member.name)||(member.name.startsWith('objects/')&&objectName(member.name.slice(8))))||!Number.isSafeInteger(member.size)||member.size<0||member.size>MAX_FILE||!validHash(member.sha256))throw storageError('Compressed snapshot contains invalid file metadata.');
      const entry=entryMap.get(member.name);
      if(!entry||entry.directory||entry.encrypted||entry.uncompressedSize!==member.size)throw storageError('Compressed snapshot member size or type is invalid.');
      if(member.name==='reading.json'&&member.size>MAX_METADATA)throw storageError('Reading-state metadata exceeds the 32 MiB storage limit.');
      let count=0,handle,position=0;const h=createHash('sha256'),parts=[];
      if(destination&&member.name!=='reading.json'){const target=path.join(destination,member.name);await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});handle=await fs.open(target,'wx',0o600);}
      const writer=new WritableStream({async write(bytes){count+=bytes.length;if(count>member.size)throw storageError('Compressed snapshot expanded beyond its declared size.');h.update(bytes);if(member.name==='reading.json')parts.push(Buffer.from(bytes));if(handle){let written=0;while(written<bytes.length){const result=await handle.write(bytes,written,bytes.length-written,position+written);if(!result.bytesWritten)throw new Error('Snapshot extraction made no progress.');written+=result.bytesWritten;}position+=bytes.length;}}});
      try{await entry.getData(writer,{checkSignature:true});if(count!==member.size||h.digest('hex')!==member.sha256)throw storageError('Compressed snapshot member checksum is invalid.');if(handle)await handle.sync();}finally{await handle?.close();}
      if(member.name==='reading.json')reading=JSON.parse(Buffer.concat(parts).toString('utf8'));
    }
    if(!manifest.files.some(m=>m.name==='archive.sqlite'))throw storageError('Compressed snapshot has no archive database.');
    if(destination){for(const m of manifest.files)if(m.name.endsWith('.sqlite'))await checkDatabase(path.join(destination,m.name));}
    return {manifest,reading};
  }catch(e){if(e.code==='STORAGE_RECOVERY_REQUIRED')throw e;throw storageError(`Unable to read compressed Local storage: ${e.message}`,e);}finally{await reader.close().catch(()=>{});await disk.close();}
}

export class CompressedStorage{
  constructor({dataDir,onProgress=()=>{},tempRoot=os.tmpdir(),fault,profile='7z'}={}){
    if(!dataDir)throw new TypeError('A profile data directory is required.');
    this.dataDir=path.resolve(dataDir);this.root=path.join(this.dataDir,'local-storage-v2');this.objectsDir=path.join(this.root,'objects');this.profile=profileOf(profile)||'7z';this.compression=this.profile;this.cleanupPending=false;this.cleanupError='';this.snapshots=path.join(this.root,'snapshots');this.records=path.join(this.root,'records');this.tempRoot=path.resolve(tempRoot);this.onProgress=onProgress;this.fault=fault;this.queue=Promise.resolve();this.sequence=0;this.pendingJournalBytes=0;this.pointer=null;this.readingSnapshot=null;this.closed=false;this.poisoned=null;this.token=uuid();this.epoch=uuid();this.migrationNeeded=false;this.migrationNeedsFinalization=false;this.recovered=false;this.vectorsReady=false;this.restoreReadingToken=null;this.recoveryMode=false;
  }
  async point(name){await this.fault?.(name);}
  enqueue(fn){const next=this.queue.then(async()=>{if(this.closed)throw new Error('Local storage has closed.');if(this.poisoned)throw storageError('Local storage requires a restart to recover the last committed operation.',this.poisoned);await this.assertOwnedDirectories();return fn();});this.queue=next.catch(()=>{});return next;}
  async assertOwnedDirectories(){for(const directory of [this.root,this.snapshots,this.records,this.objectsDir])await ownedDirectory(directory);const epoch=path.join(this.records,this.epoch);if(await exists(epoch))await ownedDirectory(epoch);}
  emit(phase,extra={}){this.onProgress({operation:'storage',phase,...extra});}
  async acquire(){
    await fs.mkdir(this.root,{recursive:true,mode:0o700});await ownedDirectory(this.root);await syncDirectory(this.dataDir);
    this.leasePath=path.join(this.root,'writer.json');
    // An exclusive short-lived acquisition gate prevents stale-lease removal races.
    const gate=path.join(this.root,'writer-gate.json');let h;
    try{h=await fs.open(gate,'wx',0o600);}catch(e){if(e.code!=='EEXIST')throw e;let g;try{g=JSON.parse(await fs.readFile(gate,'utf8'));}catch{throw storageError('The Local storage acquisition gate is incomplete. Close other instances and retry; preserve the profile if recovery is needed.');}if(g.hostname===os.hostname()&&!this.processAlive(g.pid))throw storageError('An interrupted profile-open operation left writer-gate.json. After closing all instances, preserve the profile and remove only that stale acquisition gate to retry.');throw new Error('Another application process is opening this Local profile. Please retry.');}
    try{
      await h.writeFile(JSON.stringify({pid:process.pid,hostname:os.hostname(),token:this.token}));await h.sync();await h.close();h=null;
      if(await exists(this.leasePath)){
        let owner;try{owner=JSON.parse(await fs.readFile(this.leasePath,'utf8'));}catch{throw storageError('Local profile writer lease is corrupt. Preserve the profile and recover the lease before retrying.');}
        if(owner.hostname!==os.hostname()||this.processAlive(owner.pid))throw new Error('This Local profile is already open in another application process.');
        await fs.rename(this.leasePath,path.join(this.root,`writer.stale-${uuid()}.json`));
      }
      await atomicWrite(this.leasePath,JSON.stringify({version:VERSION,pid:process.pid,hostname:os.hostname(),token:this.token,startedAt:new Date().toISOString()}));this.lease=true;
    }finally{await h?.close();await fs.rm(gate,{force:true});}
  }
  processAlive(pid){if(!Number.isSafeInteger(pid)||pid<=0)return true;try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}}
  async init({recovery=false}={}){
    try{
      await this.acquire();await fs.mkdir(this.snapshots,{recursive:true,mode:0o700});await fs.mkdir(this.objectsDir,{recursive:true,mode:0o700});await fs.mkdir(this.records,{recursive:true,mode:0o700});await this.assertOwnedDirectories();
      await fs.mkdir(this.tempRoot,{recursive:true,mode:0o700});
      this.workingDir=await fs.mkdtemp(path.join(this.tempRoot,'threadshelf-local-'));await fs.chmod(this.workingDir,0o700);
      await atomicWrite(path.join(this.workingDir,'owner.json'),JSON.stringify({format:FORMAT,profileHash:hash(this.dataDir),pid:process.pid,hostname:os.hostname(),token:this.token}));
      this.archivePath=path.join(this.workingDir,'archive.sqlite');this.vectorPath=path.join(this.workingDir,'vectors.sqlite');
      if(recovery){this.recoveryMode=true;this.emit('recovery-ready');return this;}
      const current=path.join(this.root,'current.json');
      if(await exists(current)){
        if((await regularFile(current)).size>MAX_METADATA)throw storageError('The current storage manifest exceeds its size limit.');
        this.pointer=this.parsePointer(JSON.parse(await fs.readFile(current,'utf8')));this.profile=this.pointer.profile;this.compression=this.profile;this.epoch=this.pointer.epoch;this.sequence=this.pointer.sequence;this.restoreReadingToken=this.pointer.restoreReadingToken||null;this.migrationNeedsFinalization=this.pointer.migrationPending===true;await fs.rm(path.join(this.root,'initializing.json'),{force:true});await syncDirectory(this.root);
        try{const cleanup=JSON.parse(await fs.readFile(path.join(this.root,'cleanup-pending.json'),'utf8'));if(cleanup.format===FORMAT&&cleanup.version===VERSION&&cleanup.profileHash===hash(this.dataDir)){this.cleanupPending=true;this.cleanupError=cleanup.error||'';}}catch(e){if(e.code!=='ENOENT')this.cleanupPending=true;}
        this.emit('opening');await this.readSnapshot(this.pointer,this.archivePath);this.readingSnapshot=this.pointer.reading||null;
        // Derived vector database remains compressed until semantic features request it.
      }else{
        let initializing=null;try{initializing=JSON.parse(await fs.readFile(path.join(this.root,'initializing.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw storageError('Initial Local storage state is unreadable.',e);}
        const pendingInitial=initializing?.format===FORMAT&&initializing?.profileHash===hash(this.dataDir)&&validId(initializing?.epoch);
        if(!pendingInitial&&(await fs.readdir(this.snapshots)).some(name=>snapshotName(name)))throw storageError('Local storage has saved snapshots but no current manifest. Nothing has been reset; recover the manifest before opening.');
        for(const epoch of await fs.readdir(this.records)){if((await fs.readdir(path.join(this.records,epoch))).some(name=>name.endsWith('.json.gz')))throw storageError('Local storage has committed recovery records but no current snapshot. Nothing has been reset.');}
        await atomicWrite(path.join(this.root,'initializing.json'),JSON.stringify({format:FORMAT,profileHash:hash(this.dataDir),epoch:this.epoch}));
        // Version 1 profiles are deliberately untouched. Version 2 starts a new archive.

      }
      await fs.mkdir(path.join(this.records,this.epoch),{recursive:true,mode:0o700});await syncDirectory(this.records);await syncDirectory(this.root);if(!this.pointer)await this.writeHead({sequence:0,id:null,recordHash:null});return this;
    }catch(e){await this.close().catch(()=>{});if(e.code==='STORAGE_RECOVERY_REQUIRED')throw e;if(e instanceof SyntaxError)throw storageError('The current storage manifest is corrupt; no older state was silently restored.',e);throw e;}
  }
  parsePointer(envelope){
    if(!envelope||typeof envelope!=='object'||!envelope.value||!validHash(envelope.sha256)||hash(JSON.stringify(envelope.value))!==envelope.sha256)throw storageError('The current storage manifest checksum is invalid; no older state was silently restored.');
    const p=envelope.value;
    const descriptor=d=>d&&snapshotName(d.file)&&validHash(d.sha256)&&profileOf(d.profile)&&Number.isSafeInteger(d.logicalBytes)&&d.logicalBytes>=0&&d.logicalBytes<=MAX_FILE;
    if(p.format!==FORMAT||p.version!==VERSION||!validId(p.epoch)||!validSequence(p.sequence)||!descriptor(p)||!profileOf(p.profile)||p.vectors&&(!descriptor(p.vectors)||p.vectors.profile!==p.profile)||p.restoreReadingToken!==undefined&&!validId(p.restoreReadingToken)||p.readingPolicy!==undefined&&p.readingPolicy!=='replace-local')throw storageError('The current Local storage manifest has an unsupported format.');return p;
  }
  async publish(pointer,{signal}={}){if(Buffer.byteLength(JSON.stringify(pointer))>MAX_METADATA)throw new Error('Local generation metadata exceeds the 32 MiB manifest limit.');await this.point('before-pointer');signal?.throwIfAborted();const current=path.join(this.root,'current.json');if(this.pointer)await atomicWrite(path.join(this.root,'previous.json'),JSON.stringify({value:this.pointer,sha256:hash(JSON.stringify(this.pointer))}));try{await atomicWrite(current,JSON.stringify({value:pointer,sha256:hash(JSON.stringify(pointer))}));}catch(e){try{const saved=this.parsePointer(JSON.parse(await fs.readFile(current,'utf8')));if(saved.file===pointer.file){this.pointer=saved;this.profile=saved.profile;this.compression=this.profile;}}catch{}throw e;}this.pointer=pointer;this.profile=pointer.profile;this.compression=this.profile;await this.point('after-pointer');}
  async writeHead({sequence,id,recordHash}){const value={format:FORMAT,version:VERSION,epoch:this.epoch,sequence,id,recordHash};await atomicWrite(path.join(this.records,this.epoch,'head.json'),JSON.stringify({value,sha256:hash(JSON.stringify(value))}));}
  async readHead(){let envelope;try{envelope=JSON.parse(await fs.readFile(path.join(this.records,this.epoch,'head.json'),'utf8'));}catch(e){throw storageError('The committed Local recovery head is missing or unreadable.',e);}const v=envelope?.value;if(!v||hash(JSON.stringify(v))!==envelope.sha256||v.format!==FORMAT||v.version!==VERSION||v.epoch!==this.epoch||!validSequence(v.sequence)||(this.pointer&&v.sequence<this.pointer.sequence)||(v.sequence>this.pointer?.sequence&&(!validId(v.id)||!validHash(v.recordHash))))throw storageError('The committed Local recovery head is corrupt.');return v;}
  async recordFiles(){const directory=path.join(this.records,this.epoch);return(await fs.readdir(directory).catch(e=>{if(e.code==='ENOENT'&&this.recoveryMode)return[];throw e;})).filter(name=>/^\d{16}-[a-f0-9]{32}\.json\.gz$/.test(name)).sort();}
  async recover(apply){return this.enqueue(async()=>{
    if(this.recovered)return {replayed:0,sequence:this.sequence};let replayed=0;const head=await this.readHead();let last=null;
    for(const filename of await this.recordFiles()){
      const number=Number(filename.slice(0,16));if(number<=this.sequence)continue;
      if(number!==this.sequence+1)throw storageError(`A committed Local recovery record is missing before sequence ${number}.`);
      const full=path.join(this.records,this.epoch,filename);if((await regularFile(full)).size>MAX_RECORD)throw storageError('A Local recovery record exceeds its size limit.');
      let envelope;try{envelope=JSON.parse((await gunzipAsync(await fs.readFile(full),{maxOutputLength:MAX_RECORD})).toString('utf8'));}catch(e){throw storageError(`Committed Local recovery record ${number} is corrupt.`,e);}
      if(envelope.version!==VERSION||envelope.epoch!==this.epoch||envelope.sequence!==number||!validId(envelope.id)||!validHash(envelope.sha256)||!envelope.record||typeof envelope.record!=='object'||hash(JSON.stringify(envelope.record))!==envelope.sha256||!filename.includes(`-${envelope.id}.`))throw storageError(`Committed Local recovery record ${number} failed its checksum or identity check.`);
      if(number===head.sequence&&(envelope.id!==head.id||await fileHash(full)!==head.recordHash))throw storageError('The last committed Local recovery record does not match its durable head.');last={sequence:number,id:envelope.id,recordHash:await fileHash(full)};
      const record=envelope.record;try{await apply(record,{sequence:number,id:envelope.id,replay:true});}catch(e){this.poisoned=e;throw storageError(`Committed Local operation ${number} could not be recovered. The original compressed data remains intact.`,e);}
      this.sequence=number;this.pendingJournalBytes+=(await fs.stat(full)).size;replayed++;this.emit('recovering',{current:replayed});
    }if(this.sequence<head.sequence)throw storageError('The last committed Local recovery record is missing. No earlier state has been substituted.');if(last&&last.sequence>head.sequence)await this.writeHead(last);this.recovered=true;return{replayed,sequence:this.sequence};
  });}
  async commit(record,apply){return this.enqueue(async()=>{
    if(!this.pointer||!this.recovered)throw new Error('Initialize and recover the Local snapshot before making changes.');
    const payload=JSON.stringify(record);if(Buffer.byteLength(payload)>MAX_PAYLOAD)throw new Error('One Local operation exceeds the 512 MiB UTF-8 durable-record limit. Import smaller conversations or smaller selections.');
    const envelope={version:VERSION,epoch:this.epoch,sequence:this.sequence+1,id:uuid(),sha256:hash(payload)};
    const directory=path.join(this.records,this.epoch),filename=`${String(envelope.sequence).padStart(16,'0')}-${envelope.id}.json.gz`,file=path.join(directory,filename),temp=`${file}.part`;
    let committed=false;
    try{
      await preflight(directory,Buffer.byteLength(payload)*1.1);await this.point('before-record');
      const prefix=JSON.stringify(envelope).slice(0,-1)+',\"record\":';
      function* chunks(){yield prefix;for(let i=0;i<payload.length;i+=1024*1024){let end=Math.min(payload.length,i+1024*1024);if(end<payload.length&&/[\uD800-\uDBFF]/.test(payload[end-1]))end--;yield payload.slice(i,end);if(end<i+1024*1024)i--; }yield '}';}
      await pipeline(Readable.from(chunks()),createGzip({level:3}),createWriteStream(temp,{flags:'wx',mode:0o600}));await syncFile(temp);
      await this.point('record-flushed');await fs.rename(temp,file);committed=true;await syncDirectory(directory);this.sequence=envelope.sequence;this.pendingJournalBytes+=(await fs.stat(file)).size;await this.writeHead({sequence:envelope.sequence,id:envelope.id,recordHash:await fileHash(file)});await this.point('record-committed');
      const result=await apply(record,{sequence:envelope.sequence,id:envelope.id,replay:false});await this.point('record-applied');return result;
    }catch(e){if(committed)this.poisoned=e;throw e;}finally{await fs.rm(temp,{force:true}).catch(()=>{});}
  });}
  async readSnapshot(descriptor,destination,{signal}={}){
    const file=path.join(this.snapshots,descriptor.file);await regularFile(file);
    if(await fileHash(file)!==descriptor.sha256)throw storageError('Compressed snapshot checksum does not match its committed manifest.');
    try{await decodeFile(file,destination,{profile:descriptor.profile,maxBytes:descriptor.logicalBytes,expectedBytes:descriptor.logicalBytes,signal});await checkDatabase(destination);}catch(e){await fs.rm(destination,{force:true}).catch(()=>{});throw storageError(`Unable to read compressed Local storage: ${e.message}`,e);}
  }
  async writeSnapshot(source,profile,{signal,sequence=this.sequence}={}){
    const file=path.join(this.snapshots,`${uuid()}.${profile==='7z'?'7z':'zip'}`);
    await encodeFile(source,file,{profile,signal,maxBytes:MAX_FILE});await syncFile(file);await syncDirectory(this.snapshots);
    const descriptor={file:path.basename(file),sha256:await fileHash(file),profile,sequence,logicalBytes:(await fs.stat(source)).size,objectLogicalBytes:await this.componentLogicalBytes(source),objects:await this.componentFiles(source,source)};
    const check=path.join(this.workingDir,`verify-${uuid()}.sqlite`);
    try{await this.readSnapshot(descriptor,check,{signal});}finally{await fs.rm(check,{force:true});}
    return descriptor;
  }
  async componentLogicalBytes(file){
    if(!file||!await exists(file))return 0;
    const db=new DatabaseSync(file,{readOnly:true});try{
      if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'").get()&&db.prepare('PRAGMA table_info(conversations)').all().some(c=>c.name==='content_ref')){const {objectMetadata}=await import('./archive.mjs');return objectMetadata(db).reduce((total,object)=>total+object.bytes,0);}
      if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vector_segments'").get())return db.prepare('SELECT COALESCE(SUM(expandedBytes),0) AS bytes FROM (SELECT DISTINCT s.file,s.expandedBytes FROM vector_segments s JOIN indexes i ON i.model=s.model AND i.generation=s.generation)').get().bytes;
      return 0;
    }finally{db.close();}
  }
  async componentFiles(archivePath=this.archivePath,vectorPath=this.vectorPath){
    const names=new Set();
    if(await exists(archivePath)){const db=new DatabaseSync(archivePath,{readOnly:true});try{if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'").get()&&db.prepare('PRAGMA table_info(conversations)').all().some(c=>c.name==='content_ref')){const api=await import('./archive.mjs');for(const name of api.referencedObjectFiles(db))names.add(name);}}finally{db.close();}}
    if(vectorPath&&await exists(vectorPath)){const api=await import('./search-index.mjs');for(const name of api.referencedVectorObjects(vectorPath))names.add(name);}
    for(const name of names)if(!objectName(name))throw storageError('Invalid immutable object reference.');
    return [...names];
  }
  async processComponents(archivePath,vectorPath,{objectsDir=this.objectsDir,profile,signal,onProgress}={}){
    const db=new DatabaseSync(archivePath);try{if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'").get()&&db.prepare('PRAGMA table_info(conversations)').all().some(c=>c.name==='content_ref')){const api=await import('./archive.mjs');if(profile)await api.transcodeCatalog(db,objectsDir,profile,{signal,onProgress});await api.verifyCatalog(db,objectsDir,{signal,onProgress});}}finally{db.close();}
    if(vectorPath&&await exists(vectorPath)){const api=await import('./search-index.mjs');if(profile)await api.transcodeVectorCatalog(vectorPath,objectsDir,profile,{signal,onProgress});await api.verifyVectorCatalog(vectorPath,objectsDir,{signal,onProgress});}
  }
  async checkpoint(options){return this.enqueue(()=>this.doCheckpoint(options));}
  async doCheckpoint({archiveDb=this.archivePath,vectorDb,reading,signal}={}){
    if(this.pointer&&!this.recovered)throw new Error('Recover committed Local changes before checkpointing.');
    const stage=await fs.mkdtemp(path.join(this.workingDir,'checkpoint-'));let descriptor;
    try{
      this.emit('snapshotting');signal?.throwIfAborted();const size=(await fs.stat(this.archivePath).catch(()=>({size:0}))).size;await preflight(stage,size*2);await preflight(this.root,size*1.2);
      const archive=path.join(stage,'archive.sqlite');await backupDatabase(archiveDb,archive);await this.point('snapshot-backed-up');
      descriptor=await this.writeSnapshot(archive,this.profile,{signal});await this.point('snapshot-written');await this.point('snapshot-verified');
      let vectors=vectorDb===null?null:this.pointer?.vectors||null;
      if(vectorDb){const vector=path.join(stage,'vectors.sqlite');await backupDatabase(vectorDb,vector);vectors=await this.writeSnapshot(vector,this.profile,{signal});}
      const snapshotReading=reading!==undefined?reading:this.readingSnapshot;const pointer={format:FORMAT,version:VERSION,epoch:this.epoch,sequence:this.sequence,...descriptor,vectors,createdAt:new Date().toISOString(),reading:snapshotReading,...(this.restoreReadingToken?{restoreReadingToken:this.restoreReadingToken,readingPolicy:'replace-local'}:{})};
      signal?.throwIfAborted();await this.publish(pointer,{signal});await fs.rm(path.join(this.root,'initializing.json'),{force:true});await syncDirectory(this.root);if(reading!==undefined)this.readingSnapshot=structuredClone(reading);this.recovered=true;this.pendingJournalBytes=0;
      await this.point('snapshot-published');this.emit('saved',{sequence:this.sequence});return this.status();
    }catch(e){if(this.pointer?.file===descriptor?.file)this.poisoned=e;throw e;}finally{await fs.rm(stage,{recursive:true,force:true});}
  }
  async ensureVectors(){return this.enqueue(async()=>{if(this.vectorsReady)return this.vectorPath;if(this.pointer?.vectors){try{await this.readSnapshot(this.pointer.vectors,this.vectorPath);}catch(e){this.indexNotice='The saved semantic index was damaged and will be rebuilt.';await fs.rm(this.vectorPath,{force:true});}}this.vectorsReady=true;return this.vectorPath;});}
  async status(){
    await this.assertOwnedDirectories();
    const size=async file=>file?(await fs.stat(file).catch(e=>{if(e.code==='ENOENT')return{size:0};throw e;})).size:0;
    const persistentBytes=await directorySize(this.root),temporaryBytes=this.workingDir?await directorySize(this.workingDir):0;
    const dbSize=async file=>{if(!file||!await exists(file))return 0;let db;try{db=new DatabaseSync(file,{readOnly:true});return Number(db.prepare('PRAGMA page_count').get().page_count)*Number(db.prepare('PRAGMA page_size').get().page_size);}finally{db?.close();}};const archiveBytes=await dbSize(this.archivePath),vectorBytes=await dbSize(this.vectorPath)||this.pointer?.vectors?.logicalBytes||0;
    const journalFiles=this.lease?await this.recordFiles():[];let journalBytes=0,recoveryBytes=0;
    for(const name of journalFiles)if(Number(name.slice(0,16))>(this.pointer?.sequence??0))journalBytes+=await size(path.join(this.records,this.epoch,name));
    const keep=new Set([this.pointer?.file,this.pointer?.vectors?.file].filter(Boolean));
    for(const name of await fs.readdir(this.snapshots))if(!keep.has(name)&&/^[a-f0-9]{32}\.(?:zip|7z)(?:\.part)?$/.test(name))recoveryBytes+=await size(path.join(this.snapshots,name));
    for(const epoch of await fs.readdir(this.records)){if(!validId(epoch))continue;const epochStat=await fs.lstat(path.join(this.records,epoch));if(!epochStat.isDirectory()||epochStat.isSymbolicLink())continue;const directory=path.join(this.records,epoch);if(epoch!==this.epoch){recoveryBytes+=await directorySize(directory);continue;}for(const name of await fs.readdir(directory).catch(e=>{if(e.code==='ENOENT')return[];throw e;}))if(/^\d{16}-[a-f0-9]{32}\.json\.gz(?:\.part)?$/.test(name)&&(name.endsWith('.part')||Number(name.slice(0,16))<=(this.pointer?.sequence??0)))recoveryBytes+=await size(path.join(directory,name));}
    const preservedRecoveryBytes=await this.preservedRecoverySize();recoveryBytes+=preservedRecoveryBytes+await size(path.join(this.root,'previous.json'));
    const objectBytes=await directorySize(this.objectsDir);let orphanObjectBytes=0,activeObjectBytes=0,indexCompressedBytes=this.pointer?.vectors?await size(path.join(this.snapshots,this.pointer.vectors.file)):0;const hasVector=await exists(this.vectorPath);const vectorObjects=new Set(hasVector?(await import('./search-index.mjs')).referencedVectorObjects(this.vectorPath):this.pointer?.vectors?.objects||[]);const live=new Set([...(await this.componentFiles(this.archivePath,null)),...vectorObjects]);for(const entry of await fs.readdir(this.objectsDir,{withFileTypes:true})){if(!entry.isFile()||!objectName(entry.name))continue;const bytes=await size(path.join(this.objectsDir,entry.name));if(live.has(entry.name))activeObjectBytes+=bytes;else orphanObjectBytes+=bytes;if(vectorObjects.has(entry.name))indexCompressedBytes+=bytes;}const pendingCleanupBytes=recoveryBytes+orphanObjectBytes,activeCompressedBytes=activeObjectBytes+(this.pointer?await size(path.join(this.snapshots,this.pointer.file)):0)+(this.pointer?.vectors?await size(path.join(this.snapshots,this.pointer.vectors.file)):0)+journalBytes;const expandedObjectBytes=await this.componentLogicalBytes(this.archivePath)+(await exists(this.vectorPath)?await this.componentLogicalBytes(this.vectorPath):this.pointer?.vectors?.objectLogicalBytes||0);
    return{formatVersion:VERSION,profile:this.profile,compression:this.profile,sequence:this.sequence,snapshotSequence:this.pointer?.sequence??0,journalRecords:journalFiles.filter(n=>Number(n.slice(0,16))>(this.pointer?.sequence??0)).length,journalBytes,persistentBytes:persistentBytes+preservedRecoveryBytes,compressedBytes:persistentBytes+preservedRecoveryBytes,temporaryBytes,activeCompressedBytes,logicalBytes:archiveBytes+vectorBytes+expandedObjectBytes,archiveBytes,catalogBytes:archiveBytes,indexBytes:vectorBytes,indexCompressedBytes,objectBytes,activeObjectBytes,orphanObjectBytes,expandedObjectBytes,cacheBytes:0,pendingCleanupBytes,cleanupPending:this.cleanupPending,cleanupError:this.cleanupError,conversionRequiredBytes:Math.ceil(expandedObjectBytes*1.1+archiveBytes*3+vectorBytes*3+64*1024**2),recoveryBytes,recoverableBytes:recoveryBytes,legacyRecoveryBytes:0,preservedRecoveryBytes,recoveryMode:this.recoveryMode,health:this.recoveryMode||this.poisoned?'recovery-required':'ok',indexNotice:this.indexNotice||'',migrationNeeded:false,migrationNeedsFinalization:false,workingDir:this.workingDir};
  }
  async verify(){return this.enqueue(async()=>{if(!this.pointer)throw new Error('No compressed snapshot exists yet.');const checked=path.join(this.workingDir,`check-${uuid()}.sqlite`);try{await this.readSnapshot(this.pointer,checked);}finally{await fs.rm(checked,{force:true});}await checkDatabase(this.archivePath);const head=await this.readHead();let sequence=this.pointer.sequence;for(const filename of await this.recordFiles()){const n=Number(filename.slice(0,16));if(n<=sequence)continue;if(n!==sequence+1)throw storageError('A committed Local recovery record is missing.');const full=path.join(this.records,this.epoch,filename);if((await regularFile(full)).size>MAX_RECORD)throw storageError('A committed Local recovery record exceeds its size limit.');let e;try{e=JSON.parse((await gunzipAsync(await fs.readFile(full),{maxOutputLength:MAX_RECORD})).toString('utf8'));}catch(cause){throw storageError('A committed Local recovery record is corrupt.',cause);}if(e.version!==VERSION||e.epoch!==this.epoch||e.sequence!==n||!validId(e.id)||!filename.includes(`-${e.id}.`)||hash(JSON.stringify(e.record))!==e.sha256)throw storageError('A committed Local recovery record checksum is invalid.');if(n===head.sequence&&(e.id!==head.id||await fileHash(full)!==head.recordHash))throw storageError('The last committed Local recovery record does not match its head.');sequence=n;}if(sequence<head.sequence)throw storageError('The last committed Local recovery record is missing.');let vectorPath=await exists(this.vectorPath)?this.vectorPath:null;if(this.pointer.vectors&&!vectorPath){vectorPath=path.join(this.workingDir,`verify-vectors-${uuid()}.sqlite`);await this.readSnapshot(this.pointer.vectors,vectorPath);}try{await this.processComponents(this.archivePath,vectorPath);}finally{if(vectorPath&&vectorPath!==this.vectorPath)await fs.rm(vectorPath,{force:true});}return{ok:true,...await this.status()};});}
  async reclaim({archivePath=this.archivePath,vectorPath=this.vectorPath,reclaimLegacy=false}={}){
    await this.assertOwnedDirectories();
    // Only after a verified publication: old snapshots/journal are no longer authoritative.
    const keep=new Set([this.pointer.file,this.pointer.vectors?.file].filter(Boolean));
    const failures=[];const remove=async(file,recursive=false)=>{try{await this.point('before-cleanup');await fs.rm(file,{force:true,recursive});}catch(e){failures.push(e.message);}};
    for(const name of await fs.readdir(this.snapshots))if(!keep.has(name)&&/^[a-f0-9]{32}\.(?:zip|7z)(?:\.part)?$/.test(name))await remove(path.join(this.snapshots,name));
    for(const epoch of await fs.readdir(this.records)){if(!validId(epoch))continue;const epochStat=await fs.lstat(path.join(this.records,epoch));if(!epochStat.isDirectory()||epochStat.isSymbolicLink())continue;if(epoch!==this.epoch){await remove(path.join(this.records,epoch),true);continue;}for(const name of await fs.readdir(path.join(this.records,epoch)))if(/^\d{16}-[a-f0-9]{32}\.json\.gz(?:\.part)?$/.test(name)&&(name.endsWith('.part')||Number(name.slice(0,16))<=this.pointer.sequence))await remove(path.join(this.records,epoch,name));}
    // Keep object refs conservatively whenever an older snapshot or log could not be retired.
    if(!failures.length){const files=new Set(await this.componentFiles(archivePath,vectorPath));for(const entry of await fs.readdir(this.objectsDir,{withFileTypes:true})){if(entry.isFile()&&objectName(entry.name)&&!files.has(entry.name))await remove(path.join(this.objectsDir,entry.name));}}
    if(!failures.length)await remove(path.join(this.root,'previous.json'));
    if(reclaimLegacy)await this.reclaimPreservedRecovery();
    for(const directory of [this.snapshots,this.records,this.objectsDir])try{await syncDirectory(directory);}catch(e){failures.push(e.message);}
    this.cleanupPending=!!failures.length;this.cleanupError=failures.slice(0,3).join('; ');try{if(this.cleanupPending)await atomicWrite(path.join(this.root,'cleanup-pending.json'),JSON.stringify({format:FORMAT,version:VERSION,profileHash:hash(this.dataDir),error:this.cleanupError}));else{await fs.rm(path.join(this.root,'cleanup-pending.json'),{force:true});await syncDirectory(this.root);}}catch(e){this.cleanupPending=true;this.cleanupError=[this.cleanupError,e.message].filter(Boolean).join('; ');}return this.status();
  }
  async compact(options={}){return this.enqueue(async()=>{await this.doCheckpoint(options);let vectorPath=await exists(this.vectorPath)?this.vectorPath:null;if(this.pointer.vectors&&!vectorPath){vectorPath=path.join(this.workingDir,`gc-vectors-${uuid()}.sqlite`);await this.readSnapshot(this.pointer.vectors,vectorPath);}try{return await this.reclaim({...options,vectorPath});}finally{if(vectorPath&&vectorPath!==this.vectorPath)await fs.rm(vectorPath,{force:true});}});}
  async convert(profile,{signal,onProgress,reading=this.readingSnapshot}={}){return this.enqueue(async()=>{
    profile=profileOf(profile);if(!profile)throw new Error('Choose High compression (7z) or Faster compression (ZIP level 6).');
    if(!this.pointer||!this.recovered)throw new Error('Open and recover Local storage before changing compression.');
    if(profile===this.profile)return{ok:true,storage:await this.status(),unchanged:true};
    signal?.throwIfAborted();const beforeFiles=new Set(await fs.readdir(this.objectsDir)),beforeSnapshots=new Set(await fs.readdir(this.snapshots)),beforeEpochs=new Set(await fs.readdir(this.records));const stage=await fs.mkdtemp(path.join(this.workingDir,'convert-'));let published=false,newPointer;
    const progress=value=>{this.emit('converting',value);onProgress?.(value);};
    try{
      const status=await this.status();await preflight(this.root,status.conversionRequiredBytes);await preflight(stage,status.catalogBytes*3+status.indexBytes*3+64*1024**2);
      const archive=path.join(stage,'archive.sqlite'),vector=path.join(stage,'vectors.sqlite');await backupDatabase(this.archivePath,archive);let hasVectors=false;
      if(await exists(this.vectorPath)){await backupDatabase(this.vectorPath,vector);hasVectors=true;}else if(this.pointer.vectors){await this.readSnapshot(this.pointer.vectors,vector,{signal});hasVectors=true;}
      signal?.throwIfAborted();await this.point('conversion-staged');progress({phase:'converting',current:0});
      await this.processComponents(archive,hasVectors?vector:null,{profile,signal,onProgress:progress});signal?.throwIfAborted();await checkDatabase(archive);if(hasVectors)await checkDatabase(vector);await this.point('conversion-objects-verified');
      const descriptor=await this.writeSnapshot(archive,profile,{signal});const vectors=hasVectors?await this.writeSnapshot(vector,profile,{signal}):null;
      const epoch=uuid(),head={format:FORMAT,version:VERSION,epoch,sequence:this.sequence,id:null,recordHash:null};await fs.mkdir(path.join(this.records,epoch),{mode:0o700});await syncDirectory(this.records);await atomicWrite(path.join(this.records,epoch,'head.json'),JSON.stringify({value:head,sha256:hash(JSON.stringify(head))}));
      // The durable log head is a snapshot boundary and therefore has no record identity.
      newPointer={...this.pointer,...descriptor,format:FORMAT,version:VERSION,epoch,sequence:this.sequence,profile,vectors,reading,createdAt:new Date().toISOString()};
      signal?.throwIfAborted();await this.point('conversion-before-publish');progress({phase:'publishing',cancellable:false});await this.publish(newPointer,{signal});published=true;this.pendingJournalBytes=0;this.epoch=epoch;this.readingSnapshot=reading;this.recovered=true;
      await this.point('conversion-published');
      for(const base of [this.archivePath,this.vectorPath])for(const suffix of ['','-wal','-shm'])await fs.rm(`${base}${suffix}`,{force:true});
      await fs.rename(archive,this.archivePath);if(hasVectors)await fs.rename(vector,this.vectorPath);this.vectorsReady=hasVectors;
      const result=await this.reclaim({vectorPath:hasVectors?this.vectorPath:null});progress({phase:result.cleanupPending?'cleanup-pending':'complete',current:1,total:1,cancellable:false});return{ok:true,cancelled:false,storage:result};
    }catch(e){
      // Never roll back a published generation. Service reopens it if adoption fails.
      if(published||newPointer&&this.pointer?.file===newPointer.file){this.poisoned=e;throw e;}
      // Only operation-owned unreferenced objects can be removed on precommit failure.
      for(const name of await fs.readdir(this.objectsDir))if(!beforeFiles.has(name)&&objectName(name))await fs.rm(path.join(this.objectsDir,name),{force:true}).catch(()=>{});for(const name of await fs.readdir(this.snapshots))if(!beforeSnapshots.has(name)&&snapshotName(name))await fs.rm(path.join(this.snapshots,name),{force:true}).catch(()=>{});for(const name of await fs.readdir(this.records))if(!beforeEpochs.has(name)&&validId(name))await fs.rm(path.join(this.records,name),{force:true,recursive:true}).catch(()=>{});
      throw e;
    }finally{await fs.rm(stage,{recursive:true,force:true}).catch(()=>{});}
  });}
  async backup(file,{archiveDb=this.archivePath,vectorDb,reading=this.readingSnapshot,signal}={}){return this.enqueue(async()=>{
    if(!path.isAbsolute(file))throw new Error('Choose an absolute Local backup path.');const absolute=path.resolve(file);if([this.root,this.workingDir].some(root=>absolute===root||absolute.startsWith(root+path.sep)))throw new Error('Choose a backup location outside active Local storage.');signal?.throwIfAborted();const stage=await fs.mkdtemp(path.join(this.workingDir,'backup-')),temp=`${file}.${uuid()}.part`;
    try{const archive=path.join(stage,'archive.sqlite');await backupDatabase(archiveDb,archive);const files={'archive.sqlite':archive};let vector=null;if(vectorDb){vector=path.join(stage,'vectors.sqlite');await backupDatabase(vectorDb,vector);files['vectors.sqlite']=vector;}if(reading!==undefined&&reading!==null)files['reading.json']=reading;for(const name of await this.componentFiles(archive,vector))files[`objects/${name}`]=path.join(this.objectsDir,name);await this.processComponents(archive,vector,{signal});await preflight(path.dirname(file),await directorySize(stage)+await directorySize(this.objectsDir));await writeBundle(temp,files,{sequence:this.sequence,epoch:this.epoch,kind:'backup',profile:this.profile,signal});await readBundle(temp);signal?.throwIfAborted();await fs.rename(temp,file);await syncDirectory(path.dirname(file));return{ok:true,file,bytes:(await fs.stat(file)).size,sha256:await fileHash(file)};}finally{await fs.rm(stage,{recursive:true,force:true});await fs.rm(temp,{force:true});}
  });}
  async prepareRestore(file){return this.enqueue(async()=>{const directory=await fs.mkdtemp(path.join(this.workingDir,'restore-'));try{const loaded=await readBundle(file,{destination:directory});const archivePath=path.join(directory,'archive.sqlite'),vectorPath=loaded.manifest.files.some(m=>m.name==='vectors.sqlite')?path.join(directory,'vectors.sqlite'):null,objectsDir=path.join(directory,'objects');await fs.mkdir(objectsDir,{recursive:true,mode:0o700});await this.processComponents(archivePath,vectorPath,{objectsDir});const referenced=new Set(await this.componentFiles(archivePath,vectorPath));for(const name of await fs.readdir(objectsDir))if(!referenced.has(name))throw storageError('Backup contains an unreferenced object.');const prepared={directory,archivePath,vectorPath,objectsDir,profile:profileOf(loaded.manifest.profile),reading:loaded.reading,token:this.token,dispose:()=>fs.rm(directory,{recursive:true,force:true})};return prepared;}catch(e){await fs.rm(directory,{recursive:true,force:true});throw e;}});}
  /** Caller must close archive/vector SQLite handles before installation. */
  async installRestore(prepared){return this.enqueue(async()=>{
    if(prepared?.token!==this.token||path.dirname(prepared.directory)!==this.workingDir)throw new Error('Restore data was not prepared by this Local session.');
    let preservedForRestore=false;if(this.recoveryMode){await this.preserveDamagedStorage();preservedForRestore=true;}
    const epoch=uuid(),restoreReadingToken=uuid();let committed=false,pointer;
    try{await this.processComponents(prepared.archivePath,prepared.vectorPath,{objectsDir:prepared.objectsDir});for(const name of await fs.readdir(prepared.objectsDir)){if(!objectName(name))throw storageError('Invalid backup object name.');const from=path.join(prepared.objectsDir,name),to=path.join(this.objectsDir,name);if(await exists(to)){if(await fileHash(from)!==await fileHash(to)){if(!preservedForRestore){await this.preserveDamagedStorage();preservedForRestore=true;}const repair=`${to}.${uuid()}.part`;try{await fs.copyFile(from,repair,constants.COPYFILE_EXCL);await fs.chmod(repair,0o600);await syncFile(repair);await fs.rename(repair,to);}finally{await fs.rm(repair,{force:true}).catch(()=>{});}}}else{await fs.copyFile(from,to,constants.COPYFILE_EXCL);await fs.chmod(to,0o600);await syncFile(to);}}await syncDirectory(this.objectsDir);
      const descriptor=await this.writeSnapshot(prepared.archivePath,prepared.profile,{sequence:0});const vectors=prepared.vectorPath?await this.writeSnapshot(prepared.vectorPath,prepared.profile,{sequence:0}):null;
      await fs.mkdir(path.join(this.records,epoch),{mode:0o700});await syncDirectory(this.records);const headValue={format:FORMAT,version:VERSION,epoch,sequence:0,id:null,recordHash:null};await atomicWrite(path.join(this.records,epoch,'head.json'),JSON.stringify({value:headValue,sha256:hash(JSON.stringify(headValue))}));pointer={format:FORMAT,version:VERSION,epoch,sequence:0,...descriptor,vectors,reading:prepared.reading,createdAt:new Date().toISOString(),restoreReadingToken,readingPolicy:'replace-local'};await this.publish(pointer);committed=true;
      this.epoch=epoch;this.sequence=0;this.pendingJournalBytes=0;this.readingSnapshot=prepared.reading;this.recovered=true;this.restoreReadingToken=restoreReadingToken;this.vectorsReady=!!prepared.vectorPath;this.recoveryMode=false;
      for(const base of [this.archivePath,this.vectorPath])for(const suffix of ['','-wal','-shm'])await fs.rm(`${base}${suffix}`,{force:true});
      await fs.rename(prepared.archivePath,this.archivePath);if(prepared.vectorPath)await fs.rename(prepared.vectorPath,this.vectorPath);await prepared.dispose();return{ok:true,reading:this.readingSnapshot,restoreReadingToken};
    }catch(e){if(committed||this.pointer?.epoch===epoch)this.poisoned=e;throw e;}
  });}
  async preservedRecoveryDirectories(){
    const root=path.join(this.dataDir,'recovery-preserved'),directories=[];
    for(const name of await fs.readdir(root).catch(e=>{if(e.code==='ENOENT')return[];throw e;})){
      if(!validId(name))continue;const directory=path.join(root,name);let marker;
      try{const stat=await fs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink())continue;marker=JSON.parse(await fs.readFile(path.join(directory,'preservation.json'),'utf8'));}catch{continue;}
      if(marker.format===FORMAT&&marker.version===VERSION&&marker.profileHash===hash(this.dataDir)&&marker.complete===true)directories.push(directory);
    }return directories;
  }
  async preservedRecoverySize(){let bytes=0;for(const directory of await this.preservedRecoveryDirectories())bytes+=await directorySize(directory);return bytes;}
  async reclaimPreservedRecovery(){for(const directory of await this.preservedRecoveryDirectories())await fs.rm(directory,{recursive:true,force:true});}
  async preserveDamagedStorage(){
    const parent=path.join(this.dataDir,'recovery-preserved');await fs.mkdir(parent,{recursive:true,mode:0o700});await preflight(parent,await directorySize(this.root));
    const directory=path.join(parent,uuid());await fs.mkdir(directory,{mode:0o700});
    const copy=async(source,destination)=>{await fs.mkdir(destination,{recursive:true,mode:0o700});for(const entry of await fs.readdir(source,{withFileTypes:true})){if(source===this.root&&['writer.json','writer-gate.json'].includes(entry.name))continue;const from=path.join(source,entry.name),to=path.join(destination,entry.name);if(entry.isDirectory())await copy(from,to);else if(entry.isFile()){await fs.copyFile(from,to);await fs.chmod(to,0o600);await syncFile(to);}else if(entry.isSymbolicLink())await fs.symlink(await fs.readlink(from),to);}await syncDirectory(destination);};
    try{this.emit('preserving-recovery');await copy(this.root,path.join(directory,'local-storage-v2'));await atomicWrite(path.join(directory,'preservation.json'),JSON.stringify({format:FORMAT,version:VERSION,profileHash:hash(this.dataDir),createdAt:new Date().toISOString(),complete:true}));await syncDirectory(directory);await syncDirectory(parent);await syncDirectory(this.dataDir);this.preservedRecoveryPath=directory;return directory;}catch(e){await fs.rm(directory,{recursive:true,force:true}).catch(()=>{});throw e;}
  }
  async finalizeMigration(){return{ok:true,removed:0};}
  async cleanTemporary(){return this.enqueue(async()=>{let removed=0,bytes=0;for(const name of await fs.readdir(this.tempRoot)){if(!name.startsWith('threadshelf-local-'))continue;const directory=path.join(this.tempRoot,name);if(directory===this.workingDir)continue;let owner;try{owner=JSON.parse(await fs.readFile(path.join(directory,'owner.json'),'utf8'));}catch{continue;}if(owner.format!==FORMAT||owner.profileHash!==hash(this.dataDir)||owner.hostname!==os.hostname()||this.processAlive(owner.pid)||!validId(owner.token))continue;const stat=await fs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink())continue;bytes+=await directorySize(directory);await fs.rm(directory,{recursive:true,force:true});removed++;}return{ok:true,removed,bytes};});}
  async close(){await this.queue;this.closed=true;if(this.workingDir){let marker;try{marker=JSON.parse(await fs.readFile(path.join(this.workingDir,'owner.json'),'utf8'));}catch{}if(marker?.token===this.token)await fs.rm(this.workingDir,{recursive:true,force:true});}if(this.lease){let owner;try{owner=JSON.parse(await fs.readFile(this.leasePath,'utf8'));}catch{}if(owner?.token===this.token){await fs.rm(this.leasePath,{force:true});await syncDirectory(this.root);}this.lease=false;}}
}
