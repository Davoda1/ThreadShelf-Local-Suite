import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { ZipWriter, Uint8ArrayWriter, Uint8ArrayReader } from '@zip.js/zip.js';
import { CompressedStorage } from '../src/core/storage.mjs';

async function fixture(t,options={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ts-storage-test-'));const dataDir=path.join(root,'profile'),tempRoot=path.join(root,'temp');
  const f={root,dataDir,tempRoot,storage:null,db:null};
  t.after(async()=>{try{f.db?.close();}catch{}await f.storage?.close().catch(()=>{});await fs.rm(root,{recursive:true,force:true});});
  f.open=async(opts={})=>{f.storage=await new CompressedStorage({dataDir,tempRoot,...options,...opts}).init();f.db=new DatabaseSync(f.storage.archivePath);f.db.exec('PRAGMA journal_mode=WAL;CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,value TEXT)');await f.storage.recover(record=>f.apply(record));if(!f.storage.pointer)await f.storage.checkpoint({archiveDb:f.db,reading:{bookmarks:[],positions:{},recent:[]}});return f;};
  f.apply=record=>f.db.prepare('INSERT OR IGNORE INTO records VALUES(?,?)').run(record.id,record.value);
  f.values=()=>f.db.prepare('SELECT * FROM records ORDER BY id').all().map(row=>({...row}));
  f.shutdown=async()=>{f.db.close();f.db=null;await f.storage.close();};
  return f;
}

test('7z snapshot and committed records recover after all temporary files disappear',async t=>{
  const f=await fixture(t);await f.open();const working=f.storage.workingDir;
  await f.storage.commit({id:'a',value:'α 🌍'},record=>f.apply(record));await f.storage.commit({id:'b',value:'preserved'},record=>f.apply(record));
  const expected=f.values(),pointer=f.storage.pointer;
  const zip=await fs.readFile(path.join(f.storage.snapshots,pointer.file));assert.ok(zip.subarray(0,6).equals(Buffer.from([0x37,0x7a,0xbc,0xaf,0x27,0x1c])),'real 7z snapshot signature present');
  assert.equal((await f.storage.status()).journalRecords,2);assert.ok((await f.storage.status()).journalBytes>0);
  await f.shutdown();assert.equal(await fs.access(working).then(()=>true,()=>false),false);
  await f.open();assert.deepEqual(f.values(),expected);assert.equal(f.storage.sequence,2);
});

test('uncommitted partial record is ignored; durable record before apply is recovered',async t=>{
  const f=await fixture(t);await f.open();f.storage.fault=name=>{if(name==='record-flushed')throw new Error('simulated disk failure');};
  await assert.rejects(f.storage.commit({id:'before',value:'not committed'},r=>f.apply(r)),/simulated/);assert.equal(f.values().length,0);await f.shutdown();await f.open();assert.equal(f.values().length,0);
  f.storage.fault=name=>{if(name==='record-committed')throw new Error('simulated termination');};
  await assert.rejects(f.storage.commit({id:'after',value:'committed'},r=>f.apply(r)),/termination/);assert.equal(f.values().length,0);
  await assert.rejects(f.storage.commit({id:'next',value:'no'},r=>f.apply(r)),/restart/);await f.shutdown();await f.open();assert.deepEqual(f.values(),[{id:'after',value:'committed'}]);
});

test('failed application is poisoned and committed operation retries from the snapshot',async t=>{
  const f=await fixture(t);await f.open();await assert.rejects(f.storage.commit({id:'x',value:'redo'},()=>{throw new Error('SQLite failure');}),/SQLite/);await f.shutdown();await f.open();assert.equal(f.values()[0].value,'redo');
});

test('corrupt current manifest fails explicitly without selecting an older generation',async t=>{
  const f=await fixture(t);await f.open();await f.storage.checkpoint({archiveDb:f.db});await f.shutdown();await fs.writeFile(path.join(f.dataDir,'local-storage-v2','current.json'),'{}');
  await assert.rejects(new CompressedStorage({dataDir:f.dataDir,tempRoot:f.tempRoot}).init(),/checksum/);
});

test('missing or corrupt committed recovery record cannot silently drop changes',async t=>{
  const f=await fixture(t);await f.open();await f.storage.commit({id:'a',value:'one'},r=>f.apply(r));await f.storage.commit({id:'b',value:'two'},r=>f.apply(r));const records=path.join(f.storage.records,f.storage.epoch);const files=(await fs.readdir(records)).filter(n=>n.endsWith('.gz')).sort();await f.shutdown();
  await fs.rm(path.join(records,files[0]));f.storage=await new CompressedStorage({dataDir:f.dataDir,tempRoot:f.tempRoot}).init();f.db=new DatabaseSync(f.storage.archivePath);await assert.rejects(f.storage.recover(r=>f.apply(r)),/missing/);
});

test('compressed snapshot corruption fails before the archive opens',async t=>{
  const f=await fixture(t);await f.open();const zip=path.join(f.storage.snapshots,f.storage.pointer.file);await f.shutdown();await fs.appendFile(zip,'corruption');await assert.rejects(new CompressedStorage({dataDir:f.dataDir,tempRoot:f.tempRoot}).init(),/checksum/);
});

test('version 2 ignores and preserves legacy catalog and WAL files',async t=>{
  const f=await fixture(t);await fs.mkdir(f.dataDir,{recursive:true});const legacy=new DatabaseSync(path.join(f.dataDir,'archive.sqlite'));try{legacy.exec("PRAGMA journal_mode=WAL;PRAGMA wal_autocheckpoint=0;CREATE TABLE records(id TEXT PRIMARY KEY,value TEXT);INSERT INTO records VALUES('legacy','WAL committed');");
  await f.open();assert.equal(f.storage.migrationNeeded,false);assert.deepEqual(f.values(),[]);await f.storage.compact({archiveDb:f.db,reclaimLegacy:true});assert.equal(legacy.prepare('SELECT value FROM records').get().value,'WAL committed');assert.ok((await fs.stat(path.join(f.dataDir,'archive.sqlite'))).size>0);
  }finally{legacy.close();}
});

test('second writer cannot acquire the same profile',async t=>{
  const f=await fixture(t);await f.open();await assert.rejects(new CompressedStorage({dataDir:f.dataDir,tempRoot:f.tempRoot}).init(),/already open/);await f.storage.commit({id:'still',value:'owned'},r=>f.apply(r));assert.equal(f.values().length,1);
});

test('checkpoint publication failures preserve acknowledged operations',async t=>{
  for(const failure of ['snapshot-written','snapshot-verified','before-pointer','after-pointer']){
    const f=await fixture(t);await f.open();await f.storage.commit({id:failure,value:'durable'},r=>f.apply(r));f.storage.fault=name=>{if(name===failure)throw new Error(failure);};await assert.rejects(f.storage.checkpoint({archiveDb:f.db}),new RegExp(failure));await f.shutdown();await f.open();assert.equal(f.values()[0].id,failure);
  }
});

test('concurrent commits serialize and callbacks observe committed sequence',async t=>{
  const f=await fixture(t);await f.open();const seen=[];await Promise.all(Array.from({length:20},(_,i)=>f.storage.commit({id:String(i),value:'x'},async(r,m)=>{seen.push(m.sequence);await Promise.resolve();return f.apply(r);})));assert.deepEqual(seen,Array.from({length:20},(_,i)=>i+1));await f.shutdown();await f.open();assert.equal(f.values().length,20);
});

test('backup validates, restores in a new epoch and durably marks Local reading replacement',async t=>{
  const f=await fixture(t);await f.open();await f.storage.commit({id:'backup',value:'kept'},r=>f.apply(r));const backup=path.join(f.root,'backup.zip'),reading={positions:{abc:{turn:3}},bookmarks:[],recent:[]};await f.storage.backup(backup,{archiveDb:f.db,reading});await f.storage.commit({id:'later',value:'remove on restore'},r=>f.apply(r));
  const epoch=f.storage.epoch;const prepared=await f.storage.prepareRestore(backup);f.db.close();f.db=null;await f.storage.installRestore(prepared);assert.notEqual(f.storage.epoch,epoch);assert.ok(f.storage.restoreReadingToken);const token=f.storage.restoreReadingToken;f.db=new DatabaseSync(f.storage.archivePath);assert.deepEqual(f.values(),[{id:'backup',value:'kept'}]);await f.shutdown();await f.open();assert.equal(f.storage.restoreReadingToken,token);assert.deepEqual(f.storage.readingSnapshot,reading);assert.equal(f.values().length,1);
});

test('vector snapshots stay compressed until requested and survive archive checkpoint without vector open',async t=>{
  const f=await fixture(t);await f.open();const vector=new DatabaseSync(f.storage.vectorPath);vector.exec('CREATE TABLE vectors(v TEXT);INSERT INTO vectors VALUES(\'derived\')');await f.storage.checkpoint({archiveDb:f.db,vectorDb:vector});vector.close();const saved=f.storage.pointer.vectors.file;await f.shutdown();await f.open();assert.equal(await fs.access(f.storage.vectorPath).then(()=>true,()=>false),false);await f.storage.checkpoint({archiveDb:f.db});assert.equal(f.storage.pointer.vectors.file,saved);await f.storage.ensureVectors();const reopened=new DatabaseSync(f.storage.vectorPath);assert.equal(reopened.prepare('SELECT v FROM vectors').get().v,'derived');reopened.close();
});

test('compaction retains only current snapshot and acknowledged state while preserving unknown files',async t=>{
  const f=await fixture(t);await f.open();for(let i=0;i<3;i++){await f.storage.commit({id:String(i),value:'v'},r=>f.apply(r));await f.storage.checkpoint({archiveDb:f.db});}await fs.writeFile(path.join(f.storage.root,'legacy-rollback.zip'),'dummy');await f.storage.compact({archiveDb:f.db,reclaimLegacy:true});assert.equal((await fs.readdir(f.storage.snapshots)).length,1);assert.equal((await fs.readdir(path.join(f.storage.records,f.storage.epoch))).filter(n=>n.endsWith('.gz')).length,0);assert.equal(await fs.access(path.join(f.storage.root,'legacy-rollback.zip')).then(()=>true,()=>false),true);await f.shutdown();await f.open();assert.equal(f.values().length,3);
});

test('temporary cleanup ignores lookalike and other-profile directories',async t=>{
  const f=await fixture(t);await f.open();const innocent=path.join(f.tempRoot,'threadshelf-local-innocent');await fs.mkdir(innocent);await fs.writeFile(path.join(innocent,'precious'),'keep');assert.deepEqual(await f.storage.cleanTemporary(),{ok:true,removed:0,bytes:0});assert.equal(await fs.readFile(path.join(innocent,'precious'),'utf8'),'keep');
});


test('durable recovery head detects deletion of the last acknowledged operation',async t=>{
  const f=await fixture(t);await f.open();await f.storage.commit({id:'last',value:'must survive'},r=>f.apply(r));const directory=path.join(f.storage.records,f.storage.epoch),files=(await fs.readdir(directory)).filter(n=>n.endsWith('.gz'));await f.shutdown();await fs.rm(path.join(directory,files[0]));f.storage=await new CompressedStorage({dataDir:f.dataDir,tempRoot:f.tempRoot}).init();f.db=new DatabaseSync(f.storage.archivePath);await assert.rejects(f.storage.recover(r=>f.apply(r)),/last committed.*missing/);
});

test('compressed committed record corruption is explicit',async t=>{
  const f=await fixture(t);await f.open();await f.storage.commit({id:'last',value:'must survive'},r=>f.apply(r));const directory=path.join(f.storage.records,f.storage.epoch),files=(await fs.readdir(directory)).filter(n=>n.endsWith('.gz'));await f.shutdown();await fs.writeFile(path.join(directory,files[0]),'broken gzip');f.storage=await new CompressedStorage({dataDir:f.dataDir,tempRoot:f.tempRoot}).init();f.db=new DatabaseSync(f.storage.archivePath);await assert.rejects(f.storage.recover(r=>f.apply(r)),/corrupt/);
});


test('interrupted first snapshot retries clean v2 initialization and preserves legacy data',async t=>{
  const f=await fixture(t);await fs.mkdir(f.dataDir,{recursive:true});const legacy=new DatabaseSync(path.join(f.dataDir,'archive.sqlite'));legacy.exec("CREATE TABLE records(id TEXT PRIMARY KEY,value TEXT);INSERT INTO records VALUES('legacy','preserved')");legacy.close();
  f.storage=await new CompressedStorage({dataDir:f.dataDir,tempRoot:f.tempRoot}).init();f.db=new DatabaseSync(f.storage.archivePath);f.db.exec('CREATE TABLE records(id TEXT PRIMARY KEY,value TEXT)');await f.storage.recover(r=>f.apply(r));f.storage.fault=name=>{if(name==='before-pointer')throw new Error('first publish interrupted');};await assert.rejects(f.storage.checkpoint({archiveDb:f.db}),/interrupted/);await f.shutdown();await f.open();assert.deepEqual(f.values(),[]);await f.storage.finalizeMigration();assert.equal(await fs.access(path.join(f.dataDir,'archive.sqlite')).then(()=>true,()=>false),true);
});

test('missing current manifest after compaction cannot silently create an empty archive',async t=>{
  const f=await fixture(t);await f.open();await f.storage.commit({id:'kept',value:'data'},r=>f.apply(r));await f.storage.compact({archiveDb:f.db});await f.shutdown();await fs.rm(path.join(f.dataDir,'local-storage-v2','current.json'));await assert.rejects(new CompressedStorage({dataDir:f.dataDir,tempRoot:f.tempRoot}).init(),/no current manifest/);
});

test('streamed redo preserves astral Unicode at chunk boundaries and payloads beyond previous 64 MiB cap',async t=>{
  const f=await fixture(t);await f.open();const value='x'.repeat(1024*1024-19)+'🌍'+'z'.repeat(65*1024*1024);await f.storage.commit({id:'unicode',value},r=>f.apply(r));await f.shutdown();await f.open();const result=f.values()[0];assert.equal(result.value.length,value.length);assert.equal(result.value,value);
});


test('in-app recovery stages external backup without modifying corrupt original, preserves it on confirmed install',async t=>{
  const f=await fixture(t);await f.open();await f.storage.commit({id:'backup',value:'safe'},r=>f.apply(r));const backup=path.join(f.root,'external-backup.zip');await f.storage.backup(backup,{archiveDb:f.db});await f.storage.commit({id:'later',value:'preserve damaged original'},r=>f.apply(r));const storageRoot=f.storage.root,oldEpoch=f.storage.epoch;await f.shutdown();const corrupt='{"damaged":"current manifest"}';await fs.writeFile(path.join(storageRoot,'current.json'),corrupt);await assert.rejects(new CompressedStorage({dataDir:f.dataDir,tempRoot:f.tempRoot}).init(),/checksum/);
  f.storage=await new CompressedStorage({dataDir:f.dataDir,tempRoot:f.tempRoot}).init({recovery:true});assert.equal((await f.storage.status()).recoveryMode,true);const prepared=await f.storage.prepareRestore(backup);assert.equal(await fs.readFile(path.join(storageRoot,'current.json'),'utf8'),corrupt);assert.equal(await fs.access(path.join(f.dataDir,'recovery-preserved')).then(()=>true,()=>false),false);
  await f.storage.installRestore(prepared);f.db=new DatabaseSync(f.storage.archivePath);assert.deepEqual(f.values(),[{id:'backup',value:'safe'}]);assert.equal(f.storage.recoveryMode,false);const preserved=f.storage.preservedRecoveryPath;assert.equal(await fs.readFile(path.join(preserved,'local-storage-v2','current.json'),'utf8'),corrupt);assert.ok((await fs.readdir(path.join(preserved,'local-storage-v2','records',oldEpoch))).some(n=>n.endsWith('.gz')));assert.ok((await fs.stat(backup)).size>0);assert.ok((await f.storage.status()).preservedRecoveryBytes>0);await f.storage.compact({archiveDb:f.db});assert.ok((await fs.stat(preserved)).isDirectory());await f.storage.compact({archiveDb:f.db,reclaimLegacy:true});assert.equal(await fs.access(preserved).then(()=>true,()=>false),false);assert.ok((await fs.stat(backup)).size>0);
});


test('forged ZIP manifest size cannot bypass bounded metadata expansion',async t=>{
  const f=await fixture(t);await f.open();const writer=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false,useCompressionStream:false,zip64:false});await writer.add('manifest.json',new Uint8ArrayReader(Buffer.from(JSON.stringify({padding:'x'.repeat(8*1024*1024)}))),{zip64:false});const bytes=Buffer.from(await writer.close());const local=bytes.indexOf(Buffer.from([0x50,0x4b,0x03,0x04])),central=bytes.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));assert.ok(local>=0&&central>=0);bytes.writeUInt32LE(4096,local+22);bytes.writeUInt32LE(4096,central+24);const forged=path.join(f.root,'forged.zip');await fs.writeFile(forged,bytes);const original=f.storage.pointer.file;await assert.rejects(f.storage.prepareRestore(forged),/Unable to read|exceeded|inconsistent|invalid/i);assert.equal(f.storage.pointer.file,original);assert.deepEqual(f.values(),[]);
});

test('backup cancellation leaves an existing external file intact',async t=>{
  const f=await fixture(t);await f.open();const file=path.join(f.root,'cancelled.zip');await fs.writeFile(file,'original destination');const controller=new AbortController();controller.abort();await assert.rejects(f.storage.backup(file,{archiveDb:f.db,signal:controller.signal}),{name:'AbortError'});assert.equal(await fs.readFile(file,'utf8'),'original destination');
});

test('verification validates committed journal bytes before reporting health',async t=>{
  const f=await fixture(t);await f.open();await f.storage.commit({id:'v',value:'verify'},r=>f.apply(r));const directory=path.join(f.storage.records,f.storage.epoch),record=(await fs.readdir(directory)).find(n=>n.endsWith('.gz'));await fs.writeFile(path.join(directory,record),'bad');await assert.rejects(f.storage.verify(),/recovery record is corrupt/);
});


test('real process termination recovers committed journal/snapshot and stale writer lease',async t=>{
  for(const boundary of ['record-committed','after-pointer']){const f=await fixture(t);const worker=fileURLToPath(new URL('./storage-crash-worker.mjs',import.meta.url));const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[worker,f.dataDir,f.tempRoot,boundary],{stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',bytes=>{stderr+=bytes;});child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal,stderr}));});assert.ok(result.signal||result.code!==0,result.stderr);await f.open();assert.deepEqual(f.values(),[{id:'killed',value:boundary}]);const cleaned=await f.storage.cleanTemporary();assert.equal(cleaned.removed,1);}
});
