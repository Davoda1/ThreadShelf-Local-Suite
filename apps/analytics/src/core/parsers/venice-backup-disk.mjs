/** Disk-backed Venice v4/Dexie assembly. MIT davoda1.
 * Caller verifies ZIP CRC, stable source identity and per-chunk JSON bounds.
 * Raw backup rows exist only in the caller's private, disposable work directory.
 */
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {isVeniceBackupManifest,isVeniceDexieChunk} from './venice-backup.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const forbidden=/(?:^|\/)(?:settings|preferences|bookmarks|reading(?:-v2)?|activity|vectors|cookies|credentials|accounts?|profiles?|sessions?|logs?|crash|cache)(?:[.\/]|$)/i;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function plainRow(raw){
 const result=structuredClone(raw),types=result.$types??{};delete result.$types;
 if(!object(types))throw new Error('Unsupported Dexie type annotations.');
 for(const[keyPath,kind]of Object.entries(types)){
  if(kind==='arrayNonindexKeys')continue;
  if(kind!=='undef')throw new Error('Unsupported Dexie chat value type; use the console JSON export.');
  const pieces=keyPath.split('.');let target=result;
  for(const piece of pieces.slice(0,-1))target=object(target)||Array.isArray(target)?Object.hasOwn(target,piece)?target[piece]:null:null;
  const last=pieces.at(-1);
  if(Array.isArray(target)&&/^\d+$/.test(last)&&Number(last)<target.length)target[Number(last)]=null;
  else if(object(target))delete target[last];
 }
 return result;
}
export class DiskVeniceBackup{
 constructor({filename,signal,limits={}}={}){
  if(typeof filename!=='string'||!path.isAbsolute(filename))throw new TypeError('An absolute private work filename is required.');
  this.filename=filename;this.signal=signal;this.limits=limits;this.part=null;this.sequence=0;this.closed=false;this.validated=false;
  const fd=fs.openSync(filename,'wx',0o600);fs.closeSync(fd);
  try{this.database=new DatabaseSync(filename);this.database.exec(`PRAGMA journal_mode=DELETE;PRAGMA temp_store=FILE;PRAGMA cache_size=-8192;PRAGMA mmap_size=0;PRAGMA trusted_schema=OFF;
   CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
   CREATE TABLE chunks(idx INTEGER PRIMARY KEY,database_version TEXT NOT NULL,row_count INTEGER NOT NULL);
   CREATE TABLE conversations(id TEXT PRIMARY KEY,owner_id TEXT,has_owner INTEGER NOT NULL,chunk_idx INTEGER NOT NULL,block_idx INTEGER NOT NULL,row_idx INTEGER NOT NULL,value TEXT NOT NULL,owner_ordinal INTEGER,owner_conv_idx INTEGER);
   CREATE TABLE messages(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,stamp REAL NOT NULL,chunk_idx INTEGER NOT NULL,block_idx INTEGER NOT NULL,row_idx INTEGER NOT NULL,value TEXT NOT NULL);
   CREATE INDEX message_conversation ON messages(conversation_id,stamp,chunk_idx,block_idx,row_idx);
   CREATE INDEX conversation_order ON conversations(chunk_idx,block_idx,row_idx);
   CREATE TABLE media(source_part TEXT NOT NULL,name TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(source_part,name));
   CREATE TABLE owners(id TEXT PRIMARY KEY,ordinal INTEGER NOT NULL UNIQUE,next_index INTEGER NOT NULL DEFAULT 0);`);
   this.insertConversation=this.database.prepare('INSERT INTO conversations(id,owner_id,has_owner,chunk_idx,block_idx,row_idx,value) VALUES(?,?,?,?,?,?,?)');
   this.insertMessage=this.database.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?)');
  }catch(error){this.database?.close();fs.rmSync(filename,{force:true});throw error;}
 }
 check(){if(this.closed)throw new Error('Venice backup work database is closed.');if(this.signal?.aborted)throw new DOMException('Import cancelled.','AbortError');}
 beginPart(){this.check();if(this.part)throw new Error('A Venice ZIP part is already open.');this.part='part_'+(++this.sequence);this.database.exec(`SAVEPOINT ${this.part}`);this.validated=false;}
 commitPart(){this.check();if(!this.part)throw new Error('No Venice ZIP part is open.');this.database.exec(`RELEASE SAVEPOINT ${this.part}`);this.part=null;}
 rollbackPart(){if(!this.part||this.closed)return;this.database.exec(`ROLLBACK TO SAVEPOINT ${this.part};RELEASE SAVEPOINT ${this.part}`);this.part=null;this.validated=false;}
 addManifest(manifest){
  this.check();if(!isVeniceBackupManifest(manifest))throw new Error('Unsupported or invalid Venice backup manifest (expected version 4).');
  if(manifest.encrypted!==false)throw new Error("Venice encrypted backups are unsupported; export with Don't encrypt this backup.");
  const current=this.database.prepare("SELECT value FROM metadata WHERE key='manifest'").get();
  if(current&&!isDeepStrictEqual(JSON.parse(current.value),manifest))throw new Error('Selected Venice ZIP parts belong to different backups.');
  this.database.prepare("INSERT OR IGNORE INTO metadata VALUES('manifest',?)").run(JSON.stringify(manifest));this.validated=false;
 }
 addChunk(name,chunk){
  this.check();const savepoint='chunk_'+(++this.sequence);this.database.exec(`SAVEPOINT ${savepoint}`);
  try{this._addChunk(name,chunk);this.database.exec(`RELEASE SAVEPOINT ${savepoint}`);}catch(error){this.database.exec(`ROLLBACK TO SAVEPOINT ${savepoint};RELEASE SAVEPOINT ${savepoint}`);throw error;}
 }
 _addChunk(name,chunk){
  this.check();const match=/^db\/chunk-(0|[1-9][0-9]*)\.json$/.exec(name),index=match?Number(match[1]):NaN;
  if(!Number.isSafeInteger(index)||index<0||!isVeniceDexieChunk(chunk))throw new Error('Unsupported or invalid Dexie v1 chunk.');
  if(this.database.prepare('SELECT 1 FROM chunks WHERE idx=?').get(index))throw new Error('Duplicate or invalid Venice database chunk.');
  let rowCount=0;for(const block of chunk.data.data)rowCount+=block.rows.length;
  this.database.prepare('INSERT INTO chunks VALUES(?,?,?)').run(index,String(chunk.data.databaseVersion),rowCount);
  for(let bi=0;bi<chunk.data.data.length;bi++){
   const block=chunk.data.data[bi];if(!block.rows.every(object))throw new Error('Invalid or unsupported Dexie table encoding.');
   if(!['conversations','messages'].includes(block.tableName))continue;
   for(let ri=0;ri<block.rows.length;ri++){
    this.check();const row=plainRow(block.rows[ri]);
    if(typeof row.id!=='string'||!row.id)throw new Error(block.tableName==='conversations'?'Missing, duplicate, or ambiguous Venice conversation.':'Missing or duplicate Venice message ID.');
    try{
     if(block.tableName==='conversations'){
      if(Object.hasOwn(row,'messages'))throw new Error('Missing, duplicate, or ambiguous Venice conversation.');
      const hasOwner=Object.hasOwn(row,'ownerId');if(hasOwner&&typeof row.ownerId!=='string')throw new Error('Invalid Venice owner ID.');
      this.insertConversation.run(row.id,hasOwner?row.ownerId:null,Number(hasOwner),index,bi,ri,JSON.stringify(row));
     }else{
      if(typeof row.conversationId!=='string'||!row.conversationId)throw new Error('Venice messages lack their conversation; select every part.');
      const stamp=['number','bigint'].includes(typeof row.createdAtUnixTimestamp)?Number(row.createdAtUnixTimestamp):0;
      this.insertMessage.run(row.id,row.conversationId,Number.isNaN(stamp)?0:stamp,index,bi,ri,JSON.stringify(row));
     }
    }catch(error){if(/UNIQUE constraint failed/.test(error.message))throw new Error(block.tableName==='conversations'?'Missing, duplicate, or ambiguous Venice conversation.':'Missing or duplicate Venice message ID.');throw error;}
   }
  }
  this.validated=false;
 }
 addMedia(member){
  this.check();const name=member?.name;if(typeof name!=='string'||name==='manifest.json'||/^db\/chunk-/.test(name)||forbidden.test(name))return;
  const sourcePart=typeof member.sourcePart==='string'?member.sourcePart:'',inventoryKey=createHash('sha256').update(sourcePart+'\0'+name).digest('hex');
  const value={name,...(sourcePart?{sourcePart}:{}),inventoryKey,sizeBytes:Number.isSafeInteger(member.sizeBytes)&&member.sizeBytes>=0?member.sizeBytes:null,compressedSizeBytes:Number.isSafeInteger(member.compressedSizeBytes)&&member.compressedSizeBytes>=0?member.compressedSizeBytes:null,kind:'archive member; no conversation association established',bytesOpened:false};
  this.database.prepare('INSERT INTO media VALUES(?,?,?) ON CONFLICT(source_part,name) DO UPDATE SET value=excluded.value').run(sourcePart,name,JSON.stringify(value));
 }
 validate(){
  this.check();if(this.part)throw new Error('A Venice ZIP part has not been validated/committed.');
  const stored=this.database.prepare("SELECT value FROM metadata WHERE key='manifest'").get();if(!stored)throw new Error('Missing Venice manifest.json; select every complete ZIP part together.');
  const manifest=JSON.parse(stored.value),count=manifest.chunkCount;
  if(!Number.isSafeInteger(count)||count<0||count>(this.limits.entries??100000))throw new Error('Invalid Venice manifest chunkCount.');
  const available=this.database.prepare('SELECT count(*) AS n FROM chunks WHERE idx<?').get(count).n,extra=this.database.prepare('SELECT count(*) AS n FROM chunks WHERE idx>=?').get(count).n;
  if(available!==count||extra)throw new Error(`Incomplete/inconsistent Venice backup: ${count-available} missing chunks; ${extra} unexpected chunks. Select all parts together.`);
  if(this.database.prepare('SELECT 1 FROM chunks WHERE database_version<>? LIMIT 1').get(String(manifest.databaseVersion)))throw new Error('Venice database version mismatch.');
  const rows=this.database.prepare('SELECT coalesce(sum(row_count),0) AS n FROM chunks').get().n;
  if(rows>(this.limits.records??Number.MAX_SAFE_INTEGER))throw new Error('Venice backup exceeds the database row limit.');
  if(this.database.prepare('SELECT 1 FROM messages m LEFT JOIN conversations c ON c.id=m.conversation_id WHERE c.id IS NULL LIMIT 1').get())throw new Error('Venice messages lack their conversation; select every part.');
  this.manifest=manifest;this.validated=true;return this.metadata();
 }
 metadata(){
  this.check();const manifest=this.manifest||JSON.parse(this.database.prepare("SELECT value FROM metadata WHERE key='manifest'").get()?.value||'null');
  return{kind:'venice-v4-dexie',manifest:manifest?{backupVersion:manifest.backupVersion,encrypted:manifest.encrypted,chunkCount:manifest.chunkCount,databaseVersion:manifest.databaseVersion,createdAt:manifest.createdAt??null}:null,mediaMemberCount:this.database.prepare('SELECT count(DISTINCT name) AS n FROM media').get().n,physicalMediaMemberCount:this.database.prepare('SELECT count(*) AS n FROM media').get().n,inventoryNamespace:'venice-media',mediaBytesEmbedded:false,association:'container inventory; not conversation attachment observations',retainedTables:['conversations','messages']};
 }
 *iterateMedia(){this.check();for(const row of this.database.prepare('SELECT value FROM media ORDER BY source_part,name').iterate()){this.check();yield JSON.parse(row.value);}}
 async *conversations(){
  if(!this.validated)this.validate();this.database.exec('DELETE FROM owners');let ordinal=0,completed=0;
  // Preserve the legacy owner-first order, including owner-local path indexes,
  // independently of ZIP part selection or chunk arrival order.
  for(const row of this.database.prepare('SELECT id,owner_id,has_owner FROM conversations ORDER BY chunk_idx,block_idx,row_idx').iterate()){
   this.check();const ownerId=row.has_owner?row.owner_id:this.manifest.ownerId;
   let owner=this.database.prepare('SELECT ordinal,next_index FROM owners WHERE id=?').get(ownerId);
   if(!owner){owner={ordinal:ordinal++,next_index:0};this.database.prepare('INSERT INTO owners VALUES(?,?,0)').run(ownerId,owner.ordinal);}
   this.database.prepare('UPDATE owners SET next_index=next_index+1 WHERE id=?').run(ownerId);
   this.database.prepare('UPDATE conversations SET owner_ordinal=?,owner_conv_idx=? WHERE id=?').run(owner.ordinal,owner.next_index,row.id);
   if(++completed%64===0)await tick();
  }
  const backupMetadata=this.metadata();completed=0;
  for(const row of this.database.prepare('SELECT * FROM conversations ORDER BY owner_ordinal,owner_conv_idx').iterate()){
   this.check();const conversation=JSON.parse(row.value),ownerId=row.has_owner?row.owner_id:this.manifest.ownerId;
   conversation.messages=[];for(const item of this.database.prepare('SELECT value FROM messages WHERE conversation_id=? ORDER BY stamp,chunk_idx,block_idx,row_idx').iterate(row.id)){this.check();conversation.messages.push(JSON.parse(item.value));}
   yield{conversation,ownerId,ownerIndex:row.owner_ordinal,conversationIndex:row.owner_conv_idx,backupMetadata};
   if(++completed%64===0)await tick();
  }
 }
 async finish(callback){let completed=0;for await(const value of this.conversations()){await callback(value);completed++;}return{conversations:completed,...this.metadata()};}
 close(){if(this.closed)return;this.rollbackPart();this.database.close();this.closed=true;}
}
