/** Read-only capture of the published ThreadShelf Local Reader archive.
 * Reader storage lifecycle is deliberately not imported. All SQLite/native
 * decompression operates only on an Analytics-owned, short-lived copy. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { constants } from 'node:fs';
import { SourceAccess, assertOutputOutsideSource, sourceError } from './source-access.mjs';
import { decodeFile, decodeBuffer } from './codec.mjs';

const FORMAT='threadshelf-local-storage-v2', OWNER='threadshelf-local-analytics-capture-v1';
const MAX_METADATA=32*1024*1024, MAX_RECORD=512*1024*1024, MAX_CATALOG=512*1024*1024, MAX_CONTENT=16*1024*1024;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const validHash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const validId=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
const integer=v=>Number.isSafeInteger(v)&&v>=0;
function stableJSON(value){if(Array.isArray(value))return `[${value.map(stableJSON).join(',')}]`;if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stableJSON(value[key])}`).join(',')}}`;return JSON.stringify(value);}
const fail=message=>{throw sourceError(message,'SOURCE_INTEGRITY');};
function safeJSON(bytes){let result;try{result=JSON.parse(bytes.toString('utf8'));}catch{fail('Reader JSON is malformed.');}const stack=[[result,0]];let count=0;while(stack.length){const [value,depth]=stack.pop();if(depth>128||++count>10000000)fail('Reader JSON complexity exceeds the safe limit.');if(value&&typeof value==='object')for(const child of Object.values(value))stack.push([child,depth+1]);}return result;}
function pointer(bytes){
  let envelope=safeJSON(bytes);const value=envelope?.value;
  if(!value||!validHash(envelope.sha256)||hash(JSON.stringify(value))!==envelope.sha256)fail('Reader current publication checksum is invalid.');
  if(value.format!==FORMAT||value.version!==2||!validId(value.epoch)||!integer(value.sequence)||!validHash(value.sha256)||!['7z','zip6'].includes(value.profile)||!new RegExp(`^[a-f0-9]{32}\\.${value.profile==='7z'?'7z':'zip'}$`).test(value.file)||!integer(value.logicalBytes)||value.logicalBytes>MAX_CATALOG)fail('Reader published catalog descriptor is unsupported or exceeds the 512 MiB catalog limit.');
  const descriptor=d=>d&&/^[a-f0-9]{32}\.(?:7z|zip)$/.test(d.file)&&validHash(d.sha256)&&['7z','zip6'].includes(d.profile)&&integer(d.logicalBytes)&&d.logicalBytes<=64*1024**3;
  if(value.vectors&&(!descriptor(value.vectors)||value.vectors.profile!==value.profile)||value.restoreReadingToken!==undefined&&!validId(value.restoreReadingToken)||value.readingPolicy!==undefined&&value.readingPolicy!=='replace-local')fail('Reader publication control metadata is invalid.');
  // User authorized opaque control-file reads for validation. Excluded values
  // never leave this projection or enter caches, analytics, diagnostics/reports.
  const projected={format:FORMAT,version:2,epoch:value.epoch,sequence:value.sequence,file:value.file,sha256:value.sha256,profile:value.profile,logicalBytes:value.logicalBytes,createdAt:typeof value.createdAt==='string'?value.createdAt:null};
  envelope=null;return projected;
}
function head(bytes,p){const envelope=safeJSON(bytes),v=envelope?.value;if(!v||!validHash(envelope.sha256)||hash(JSON.stringify(v))!==envelope.sha256||v.format!==FORMAT||v.version!==2||v.epoch!==p.epoch||!integer(v.sequence)||v.sequence<p.sequence||v.sequence>p.sequence&&(!validId(v.id)||!validHash(v.recordHash)))fail('Reader durable journal head is invalid.');return {epoch:v.epoch,sequence:v.sequence,id:v.id??null,recordHash:v.recordHash??null};}
const generation=p=>hash(JSON.stringify([p.epoch,p.sequence,p.file,p.sha256,p.profile,p.logicalBytes]));
const identity=(p,h)=>hash(JSON.stringify([p.epoch,p.sequence,p.sha256,p.profile,h.sequence,h.id,h.recordHash]));
async function observe(source,signal){const p=pointer(await source.read('current.json',{maxBytes:MAX_METADATA,signal}));const h=head(await source.read(`records/${p.epoch}/head.json`,{maxBytes:MAX_METADATA,signal}),p);return {p,h,snapshotId:identity(p,h)};}
export async function observeReader(sourcePath,{signal,onAccess}={}){const source=await SourceAccess.open(sourcePath,{onAccess});const {p,h,snapshotId}=await observe(source,signal);return {sourceId:source.sourceId,snapshotId,identity:snapshotId,observedAt:new Date().toISOString(),commit:{epoch:p.epoch,baseSequence:p.sequence,sequence:h.sequence},profile:p.profile};}
function objectDescriptor(o){if(!o||!validHash(o.sha256)||!validHash(o.packedSha256)||!integer(o.bytes)||o.bytes>MAX_CONTENT||!integer(o.packedBytes)||o.packedBytes>MAX_CONTENT+1024*1024||!['7z','zip6'].includes(o.codec)||o.file!==`${o.sha256}.${o.packedSha256}.${o.codec==='7z'?'7z':'zip'}`)fail('Invalid Reader content descriptor.');return {file:o.file,sha256:o.sha256,packedSha256:o.packedSha256,bytes:o.bytes,packedBytes:o.packedBytes,codec:o.codec};}
function blobDescriptor(b){if(!b||!integer(b.bytes)||b.bytes>MAX_RECORD||!Array.isArray(b.blocks)||!b.blocks.length||b.blocks.length>1000000)fail('Invalid Reader content blob.');const blocks=b.blocks.map(objectDescriptor);if(blocks.reduce((sum,o)=>sum+o.bytes,0)!==b.bytes)fail('Reader blob lengths are inconsistent.');return {bytes:b.bytes,blocks};}
function contentRef(r){if(!r||r.format!=='threadshelf-content-v2'||r.version!==1||!integer(r.turnCount)||!r.turnCount||!Array.isArray(r.groups)||!r.groups.length||r.groups.length>r.turnCount)fail('Invalid Reader conversation descriptor.');let turns=0;const groups=r.groups.map(g=>{if(!g||g.first!==turns||!integer(g.count)||!g.count)fail('Reader turn ordering is invalid.');turns+=g.count;return {first:g.first,count:g.count,blob:blobDescriptor(g.blob)};});if(turns!==r.turnCount)fail('Reader turn count is inconsistent.');return {format:r.format,version:1,turnCount:turns,header:blobDescriptor(r.header),groups};}
function catalog(file){const db=new DatabaseSync(file,{readOnly:true});try{
  if(db.prepare('PRAGMA application_id').get().application_id!==0x54534c52||db.prepare('PRAGMA user_version').get().user_version!==3)fail('Only ThreadShelf Local Reader catalog schema 3 is supported.');
  const check=db.prepare('PRAGMA quick_check').all();if(check.length!==1||Object.values(check[0])[0]!=='ok')fail('Reader copied catalog integrity check failed.');
  const revision=db.prepare("SELECT value FROM metadata WHERE key='revision'").get()?.value;if(!integer(revision))fail('Reader catalog revision is invalid.');
  const archiveIdentity=db.prepare("SELECT value FROM metadata WHERE key='archiveIdentity'").get()?.value;
  const collections=new Map(db.prepare('SELECT id,name,created_at,updated_at FROM collections').all().map(row=>[row.id,{...row}]));
  const conversations=new Map();for(const row of db.prepare('SELECT id,collection_id,source_identity_json,collection,provider,source_file,conversation_key,title,turn_count,last_turn_at,content_hash,content_ref,created_at,updated_at FROM conversations').iterate()){
    const ref=contentRef(safeJSON(Buffer.from(row.content_ref)));if(row.turn_count!==ref.turnCount||!collections.has(row.collection_id)||!validHash(row.content_hash))fail('Reader conversation catalog metadata is inconsistent.');conversations.set(row.id,{...row,content_ref:ref});
  }
  // No applied_operations.result_json, bookmark policy or unrelated metadata
  // is loaded into the analytical catalog.
  const applied=new Set(db.prepare('SELECT op_id FROM applied_operations').all().map(row=>row.op_id));
  return {revision,archiveIdentity,collections,conversations,applied};
}finally{db.close();}}
function replay(c,original){
  if(original?.kind==='clearIndex')return;
  if(original?.kind!=='archive')fail('Unknown committed Reader operation; capture was not published.');
  const r=original.mutation;if(!r||r.version!==1||!['upsert','manage'].includes(r.kind)||typeof r.opId!=='string'||!r.opId||r.opId.length>200||!integer(r.baseRevision))fail('Unsupported Reader catalog mutation.');
  if(c.applied.has(r.opId))return;if(c.revision!==r.baseRevision)fail('Reader catalog operation revision does not match the selected snapshot.');let changed=false;
  const ensure=k=>{if(!k||typeof k.id!=='string'||typeof k.name!=='string'||!k.name)fail('Invalid Reader collection metadata.');if(k.create){if(c.collections.has(k.id)||[...c.collections.values()].some(v=>v.name===k.name))fail('Reader collection creation conflicts.');c.collections.set(k.id,{id:k.id,name:k.name,created_at:r.at,updated_at:r.at});changed=true;}else if(!c.collections.has(k.id))fail('Referenced Reader collection is missing.');};
  if(r.kind==='upsert'){
    if(typeof r.id!=='string'||!validHash(r.contentHash)||typeof r.sourceIdentity!=='string'||!r.document)fail('Invalid Reader conversation mutation.');const previous=c.conversations.get(r.id);
    if(previous?.content_hash!==r.contentHash){ensure(r.collection);const d=r.document,ref=contentRef(r.contentRef);if(d.turnCount!==ref.turnCount)fail('Reader mutation turn count mismatch.');
      c.conversations.set(r.id,{id:r.id,collection_id:r.collection.id,collection:r.collection.name,source_identity_json:r.sourceIdentity,provider:d.provider,source_file:d.sourceFile,conversation_key:d.conversationKey,title:d.title,turn_count:d.turnCount,last_turn_at:d.lastTurnAt===undefined?null:JSON.stringify(d.lastTurnAt),content_hash:r.contentHash,content_ref:ref,created_at:previous?.created_at??r.at,updated_at:r.at});changed=true;
    }
  }else{
    if(!['create','rename','move','copy','merge','deleteConversations','deleteCollection','clear'].includes(r.action)||!Array.isArray(r.ids)||r.ids.length>1000000||r.ids.some(id=>typeof id!=='string')||!Array.isArray(r.removedCollections))fail('Unknown or malformed Reader manager operation.');
    if(r.action==='create')ensure({id:r.collectionId,name:r.name,create:true});
    if(r.action==='rename'){const existing=c.collections.get(r.collectionId);if(!existing||typeof r.name!=='string'||!r.name)fail('Invalid Reader collection rename.');if(existing.name!==r.name){if([...c.collections.values()].some(k=>k.id!==r.collectionId&&k.name===r.name))fail('Reader rename conflicts.');existing.name=r.name;existing.updated_at=r.at;for(const row of c.conversations.values())if(row.collection_id===r.collectionId){row.collection=r.name;row.updated_at=r.at;}changed=true;}}
    if(r.target){ensure(r.target);for(const id of r.ids){const row=c.conversations.get(id);if(!row)fail('Selected Reader conversation is missing.');if(row.collection_id===r.target.id)continue;const exact=[...c.conversations.values()].filter(candidate=>candidate.collection_id===r.target.id&&candidate.source_identity_json===row.source_identity_json&&candidate.content_hash===row.content_hash).sort((a,b)=>a.id.localeCompare(b.id))[0];
      if(exact){if(r.action!=='copy'){c.conversations.delete(id);changed=true;}continue;}
      if(r.action==='copy'){const newId=r.copyIds?.[id];if(typeof newId!=='string'||c.conversations.has(newId))fail('Invalid Reader copy identity.');c.conversations.set(newId,{...row,id:newId,collection_id:r.target.id,collection:r.target.name,created_at:r.at,updated_at:r.at});}
      else {row.collection_id=r.target.id;row.collection=r.target.name;row.updated_at=r.at;}changed=true;
    }}
    if(r.action==='clear'){changed=(r.count>0||r.collectionCount>0);c.conversations.clear();c.collections.clear();c.applied.clear();}
    if(r.action==='deleteConversations'||r.action==='deleteCollection'&&!r.target)for(const id of r.ids)if(c.conversations.delete(id))changed=true;
    for(const id of r.removedCollections){if([...c.conversations.values()].some(row=>row.collection_id===id))fail('Reader removed collection still has conversations.');if(c.collections.delete(id))changed=true;}
  }
  if(changed)c.revision++;c.applied.add(r.opId);
}
async function copyPacked(source,relative,target,expectedHash,{signal,maxBytes}){const handle=await fs.open(target,'wx',0o600),h=createHash('sha256');let position=0;try{for await(const bytes of source.stream(relative,{maxBytes,signal})){h.update(bytes);let at=0;while(at<bytes.length){const {bytesWritten}=await handle.write(bytes,at,bytes.length-at,position);if(!bytesWritten)throw new Error('Capture copy made no progress.');position+=bytesWritten;at+=bytesWritten;}}await handle.sync();if(h.digest('hex')!==expectedHash)fail('Reader compressed file checksum does not match its committed descriptor.');return position;}finally{await handle.close();}}
async function ownedStage(workspace,source){const resolved=await assertOutputOutsideSource(workspace,source);await fs.mkdir(resolved,{recursive:true,mode:0o700});await assertOutputOutsideSource(resolved,source);const directory=await fs.mkdtemp(path.join(resolved,'capture-'));const token=randomUUID(),stat=await fs.lstat(directory);await fs.writeFile(path.join(directory,'owner.json'),JSON.stringify({format:OWNER,token}),{flag:'wx',mode:0o600});return {directory,token,dev:stat.dev,ino:stat.ino};}
async function cleanup(stage){const stat=await fs.lstat(stage.directory).catch(()=>null);if(!stat||stat.isSymbolicLink()||stat.dev!==stage.dev||stat.ino!==stage.ino)return;const marker=path.join(stage.directory,'owner.json'),before=await fs.lstat(marker).catch(()=>null);if(!before?.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size>4096)return;const handle=await fs.open(marker,constants.O_RDONLY|(constants.O_NOFOLLOW||0));let owner;try{const actual=await handle.stat();if(actual.ino!==before.ino||actual.dev!==before.dev)return;owner=JSON.parse(await handle.readFile('utf8'));}finally{await handle.close();}if(owner.format===OWNER&&owner.token===stage.token)await fs.rm(stage.directory,{recursive:true,force:true});}
async function attempt(sourcePath,{workspace,signal,onProgress,onAccess,fault}){
  const source=await SourceAccess.open(sourcePath,{onAccess}),selected=await observe(source,signal);const stage=await ownedStage(workspace,source),objects=new Map();let sourceBytes=0;const started=performance.now();
  try{
    const {p,h}=selected;onProgress({phase:'catalog',completed:0,total:1});const packed=path.join(stage.directory,`catalog.${p.profile==='7z'?'7z':'zip'}`),decoded=path.join(stage.directory,'catalog.sqlite');
    sourceBytes+=await copyPacked(source,`snapshots/${p.file}`,packed,p.sha256,{maxBytes:MAX_CATALOG+1024*1024,signal});await decodeFile(packed,decoded,{profile:p.profile,maxBytes:p.logicalBytes,expectedBytes:p.logicalBytes,signal});const c=catalog(decoded);await fs.rm(decoded);await fs.rm(packed);await fault?.('catalog-copied',{source,p,h});
    const names=(await source.listRecords(p.epoch,{signal})).filter(name=>{const n=Number(name.slice(0,16));return n>p.sequence&&n<=h.sequence;});let sequence=p.sequence;
    for(const name of names){signal?.throwIfAborted();const number=Number(name.slice(0,16));if(number!==sequence+1)fail('A committed Reader journal sequence is missing.');const bytes=await source.read(`records/${p.epoch}/${name}`,{maxBytes:MAX_RECORD,signal});sourceBytes+=bytes.length;let expanded;try{expanded=gunzipSync(bytes,{maxOutputLength:MAX_RECORD});}catch{fail('Reader journal record is corrupt or oversized.');}let envelope=safeJSON(expanded);if(envelope.version!==2||envelope.epoch!==p.epoch||envelope.sequence!==number||!validId(envelope.id)||!name.includes(`-${envelope.id}.`)||!validHash(envelope.sha256)||!envelope.record||hash(JSON.stringify(envelope.record))!==envelope.sha256)fail('Reader journal checksum or identity is invalid.');if(number===h.sequence&&(envelope.id!==h.id||hash(bytes)!==h.recordHash))fail('Reader last committed journal record does not match its durable head.');
      // Policy flags are read only for whole-record integrity. They never affect
      // catalog replay and are removed before the operation is interpreted.
      delete envelope.record.copyBookmarks;if(envelope.record.mutation)delete envelope.record.mutation.copyBookmarks;replay(c,envelope.record);envelope=null;expanded=null;sequence=number;onProgress({phase:'journal',completed:sequence-p.sequence,total:h.sequence-p.sequence});
    }if(sequence!==h.sequence)fail('The durable Reader journal head cannot be reached.');
    for(const row of c.conversations.values())for(const blob of [row.content_ref.header,...row.content_ref.groups.map(g=>g.blob)])for(const o of blob.blocks)objects.set(o.file,o);
    let completed=0;for(const o of objects.values()){signal?.throwIfAborted();const target=path.join(stage.directory,o.file);const bytes=await copyPacked(source,`objects/${o.file}`,target,o.packedSha256,{maxBytes:o.packedBytes,signal});if(bytes!==o.packedBytes)fail('Reader compressed content size does not match its descriptor.');sourceBytes+=bytes;o.local=target;completed++;onProgress({phase:'content',completed,total:objects.size});await fault?.('object-copied',{source,object:o,completed});}
    // Bounded LRU; only requested content records are assembled. Source packed
    // objects remain compressed until the relevant conversation is normalized.
    const cache=new Map();let cacheBytes=0,peakCacheBytes=0;const block=async descriptor=>{const o=objects.get(descriptor.file);if(!o)fail('Captured content object is missing.');if(cache.has(o.file)){const bytes=cache.get(o.file);cache.delete(o.file);cache.set(o.file,bytes);return bytes;}const packedBytes=await fs.readFile(o.local);const bytes=decodeBuffer(packedBytes,o.codec,{maxBytes:MAX_CONTENT,expectedBytes:o.bytes,tempDir:stage.directory,signal});if(hash(bytes)!==o.sha256)fail('Reader expanded content checksum is invalid.');while(cacheBytes+bytes.length>64*1024*1024&&cache.size){const key=cache.keys().next().value;cacheBytes-=cache.get(key).length;cache.delete(key);}cache.set(o.file,bytes);cacheBytes+=bytes.length;peakCacheBytes=Math.max(peakCacheBytes,cacheBytes);return bytes;};
    const blob=async ref=>{const parts=[];for(const descriptor of ref.blocks){signal?.throwIfAborted();parts.push(await block(descriptor));}return parts.length===1?parts[0]:Buffer.concat(parts,ref.bytes);};
    const conversations=[];completed=0;for(const row of c.conversations.values()){signal?.throwIfAborted();const header=safeJSON(await blob(row.content_ref.header));if(!header||typeof header!=='object'||Array.isArray(header))fail('Reader conversation header is invalid.');const turns=[];for(const group of row.content_ref.groups){const values=safeJSON(await blob(group.blob));if(!Array.isArray(values)||values.length!==group.count||values.some(v=>!v||typeof v!=='object'||Array.isArray(v)))fail('Reader turn group is invalid.');turns.push(...values);}
      const fingerprint={...header,turns};for(const key of ['collection','collectionId','sourceFile','id','turnCount','importedAt','updatedAt'])delete fingerprint[key];if(hash(stableJSON(fingerprint))!==row.content_hash)fail('Reader conversation content identity does not match its catalog.');
      const document={...header,id:row.id,provider:header.provider??row.provider,title:row.title,conversationKey:row.conversation_key,collection:row.collection,collectionIds:[row.collection_id],sourceFile:row.source_file,sourceIdentity:safeJSON(Buffer.from(row.source_identity_json)),contentHash:row.content_hash,turns,importedAt:row.created_at,updatedAt:row.updated_at};
      conversations.push(document);completed++;onProgress({phase:'conversations',completed,total:c.conversations.size});}
    await fault?.('before-validate',{source,p,h});const observed=await observe(source,signal);if(generation(observed.p)!==generation(p))throw sourceError('Reader published a different generation during capture.','SOURCE_CHANGED');
    const counts=new Map();for(const row of c.conversations.values())counts.set(row.collection_id,(counts.get(row.collection_id)||0)+1);const collections=[...c.collections.values()].map(k=>({id:k.id,name:k.name,count:counts.get(k.id)||0}));
    return {sourceId:source.sourceId,snapshotId:selected.snapshotId,capturedAt:new Date().toISOString(),conversations,collections,diagnostics:[],observedIdentity:observed.snapshotId,stale:observed.snapshotId!==selected.snapshotId,archiveIdentity:c.archiveIdentity,commit:{epoch:p.epoch,baseSequence:p.sequence,sequence:h.sequence},metrics:{captureMs:performance.now()-started,sourceBytes,contentObjects:objects.size,peakDecodedCacheBytes:peakCacheBytes}};
  }catch(error){
    // Checkpoint/reclamation may make the old journal appear incomplete before
    // the final validation step. Distinguish a changed publication from stable
    // corruption, rather than presenting a normal maintenance race as damage.
    if(!signal?.aborted){let current;try{current=pointer(await source.read('current.json',{maxBytes:MAX_METADATA,signal}));}catch(controlError){if(controlError.code==='SOURCE_CHANGED')throw controlError;}
      if(current&&generation(current)!==generation(selected.p))throw sourceError('Reader publication changed during an incomplete capture.','SOURCE_CHANGED');}
    throw error;
  }finally{await cleanup(stage);}
}
const delay=(ms,signal)=>new Promise((resolve,reject)=>{if(signal?.aborted)return reject(signal.reason);const timer=setTimeout(done,ms);function done(){signal?.removeEventListener('abort',abort);resolve();}function abort(){clearTimeout(timer);reject(signal.reason);}signal?.addEventListener('abort',abort,{once:true});});
export async function captureReader(sourcePath,{workspace,signal,onProgress=()=>{},onAccess,fault,maxAttempts=4}={}){
  if(typeof workspace!=='string'||!workspace)throw new TypeError('captureReader requires an Analytics-owned workspace.');if(!Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>8)throw new TypeError('Invalid bounded capture attempt count.');let last;
  for(let attemptNumber=1;attemptNumber<=maxAttempts;attemptNumber++){signal?.throwIfAborted();try{const result=await attempt(sourcePath,{workspace,signal,onProgress,onAccess,fault});return {...result,attempts:attemptNumber};}catch(error){last=error;if(signal?.aborted||error.name==='AbortError'||!['SOURCE_CHANGED','ENOENT','EACCES','EPERM','EBUSY'].includes(error.code))throw error;if(attemptNumber===maxAttempts)break;onProgress({phase:'retry',completed:attemptNumber,total:maxAttempts,reason:error.code});await delay(Math.min(400,40*2**(attemptNumber-1)),signal);}}
  throw sourceError(`Reader changed or became unavailable during ${maxAttempts} capture attempts. The previous Analytics snapshot is preserved. (${last?.code||'unavailable'})`,'SOURCE_RETRY_EXHAUSTED');
}
