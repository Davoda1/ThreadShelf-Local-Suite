import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {CompressedStorage} from '../src/core/storage.mjs';
import {initializeVectorCatalog,VectorBlockWriter,referencedVectorObjects,verifyVectorCatalog} from '../src/core/search-index.mjs';

async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ts-v2-storage-'));const dataDir=path.join(root,'árvíz 🧪'),tempRoot=path.join(root,'tmp');
 let storage,db;const open=async()=>{storage=await new CompressedStorage({dataDir,tempRoot}).init();db=new DatabaseSync(storage.archivePath);db.exec('CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,value TEXT)');await storage.recover(r=>db.prepare('INSERT OR IGNORE INTO records VALUES(?,?)').run(r.id,r.value));if(!storage.pointer)await storage.checkpoint({archiveDb:db});};
 await open();t.after(async()=>{try{db?.close();}catch{}await storage?.close().catch(()=>{});await fs.rm(root,{recursive:true,force:true});});
 return {root,dataDir,tempRoot,get storage(){return storage;},get db(){return db;},async closeDb(){db.close();db=null;},async reopen(){db?.close();db=null;await storage.close();await open();},openDb(){db=new DatabaseSync(storage.archivePath);},async add(id){await storage.commit({id,value:'kept'},r=>db.prepare('INSERT INTO records VALUES(?,?)').run(r.id,r.value));}};
}

test('journal byte budget is reconstructed on reopen and reset only by durable checkpoint',async t=>{
 const f=await fixture(t);await f.add('one');await f.add('two');const bytes=f.storage.pendingJournalBytes;assert.ok(bytes>0);await f.reopen();assert.equal(f.storage.pendingJournalBytes,bytes);assert.equal((await f.storage.status()).journalBytes,bytes);await f.storage.checkpoint({archiveDb:f.db});assert.equal(f.storage.pendingJournalBytes,0);await f.reopen();assert.equal(f.storage.pendingJournalBytes,0);
});

test('conversion cleanup failure commits new codec, reports pending work, and later compaction retries',async t=>{
 const f=await fixture(t);await f.add('committed');const old=f.storage.pointer.file;await f.closeDb();f.storage.fault=name=>{if(name==='before-cleanup')throw Object.assign(new Error('Injected sharing violation'),{code:'EPERM'});};
 const converted=await f.storage.convert('zip6');assert.equal(converted.ok,true);assert.equal(converted.storage.profile,'zip6');assert.equal(converted.storage.cleanupPending,true);assert.ok(converted.storage.pendingCleanupBytes>0);assert.ok(await fs.stat(path.join(f.storage.snapshots,old)));
 f.storage.fault=null;f.openDb();assert.equal(f.db.prepare('SELECT value FROM records').get().value,'kept');await f.storage.compact({archiveDb:f.db});assert.equal((await f.storage.status()).cleanupPending,false);await f.reopen();assert.equal(f.storage.profile,'zip6');assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM records').get().n,1);
});

test('compaction preserves unowned object files and foreign recovery marker versions',async t=>{
 const f=await fixture(t);const note=path.join(f.storage.objectsDir,'important-note.txt');await fs.writeFile(note,'unknown ownership');const directory=path.join(f.dataDir,'recovery-preserved','a'.repeat(32));await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'preservation.json'),JSON.stringify({format:'threadshelf-local-storage-v2',version:1,complete:true,profileHash:createHash('sha256').update(f.dataDir).digest('hex')}));await fs.writeFile(path.join(directory,'foreign'),'keep');
 await f.storage.compact({archiveDb:f.db,reclaimLegacy:true});assert.equal(await fs.readFile(note,'utf8'),'unknown ownership');assert.equal(await fs.readFile(path.join(directory,'foreign'),'utf8'),'keep');
});

test('semantic object conversion, unopened metadata and ZIP64 backup restore preserve model revision',async t=>{
 const f=await fixture(t);await f.add('archive');const vector=new DatabaseSync(f.storage.vectorPath);initializeVectorCatalog(vector);const generation='generation',model='tiny-test';
 const writer=new VectorBlockWriter({db:vector,objectsDir:f.storage.objectsDir,model,generation,profile:'7z'});const bytes=Buffer.alloc(8);bytes.writeFloatLE(.25);bytes.writeFloatLE(.75,4);writer.add({passage:'passage',conversationId:'conv',turnIndex:5,role:'user',offset:0,part:0,fingerprint:'a'.repeat(64),vector:bytes.toString('base64')});writer.flush();vector.prepare('INSERT INTO indexes VALUES(?,?,?,?,?,?)').run(model,'logical-revision',1,1,new Date().toISOString(),generation);await f.storage.checkpoint({archiveDb:f.db,vectorDb:vector});vector.close();const original=referencedVectorObjects(f.storage.vectorPath);await f.reopen();assert.equal(await fs.access(f.storage.vectorPath).then(()=>true,()=>false),false);assert.ok((await f.storage.status()).expandedObjectBytes>0);
 await f.closeDb();await f.storage.convert('zip6');f.openDb();const converted=referencedVectorObjects(f.storage.vectorPath);assert.ok(converted.every(n=>n.endsWith('.zip')));assert.notDeepEqual(converted,original);await verifyVectorCatalog(f.storage.vectorPath,f.storage.objectsDir);const v=new DatabaseSync(f.storage.vectorPath);assert.equal(v.prepare('SELECT revision FROM indexes').get().revision,'logical-revision');const backup=path.join(f.root,'all-components.zip');await f.storage.backup(backup,{archiveDb:f.db,vectorDb:v});v.close();const archiveBytes=await fs.readFile(backup);assert.ok(archiveBytes.includes(Buffer.from([0x50,0x4b,0x06,0x06])),'ZIP64 end record');
 const prepared=await f.storage.prepareRestore(backup);await verifyVectorCatalog(prepared.vectorPath,prepared.objectsDir);await f.closeDb();await f.storage.installRestore(prepared);f.openDb();assert.equal(f.storage.profile,'zip6');assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM records').get().n,1);await verifyVectorCatalog(f.storage.vectorPath,f.storage.objectsDir);
});

test('storage refuses symlinked owned directories and does not reclaim files through them',async t=>{
 if(process.platform==='win32')return t.skip('Creating symlinks can require Windows developer mode.');
 const f=await fixture(t),foreign=path.join(f.root,'foreign'),saved=path.join(f.storage.root,'objects-owned');await fs.mkdir(foreign);const file=path.join(foreign,'a'.repeat(64)+'.7z');await fs.writeFile(file,'foreign data');await fs.rename(f.storage.objectsDir,saved);await fs.symlink(foreign,f.storage.objectsDir,'dir');
 await assert.rejects(f.storage.compact({archiveDb:f.db}),/unsafe type/);assert.equal(await fs.readFile(file,'utf8'),'foreign data');await fs.unlink(f.storage.objectsDir);await fs.rename(saved,f.storage.objectsDir);await f.storage.compact({archiveDb:f.db});
});

test('ordinary confirmed restore repairs a damaged same-name immutable object after preserving the original',async t=>{
 const f=await fixture(t);const {ArchiveStore}=await import('../src/core/archive.mjs');const archive=await new ArchiveStore({dataDir:f.storage.workingDir,contentDir:f.storage.objectsDir,compression:f.storage.profile}).init();
 const preparedMutation=archive.prepareUpsert({provider:'openai',collection:'Recovery',conversationKey:'same-name',title:'Keep recovery',turns:[{user:'intact bytes',turn_index:2}]});await f.storage.commit(preparedMutation,r=>archive.applyMutation(r));const id=archive.files().files[0].id;archive.close();
 const file=path.join(f.root,'recovery.zip');await f.storage.backup(file,{archiveDb:f.db});const prepared=await f.storage.prepareRestore(file);const [object]=await f.storage.componentFiles();const damaged=path.join(f.storage.objectsDir,object);await fs.writeFile(damaged,'damaged original object');await f.closeDb();assert.equal(f.storage.recoveryMode,false);await f.storage.installRestore(prepared);f.openDb();const reopened=await new ArchiveStore({dataDir:f.storage.workingDir,contentDir:f.storage.objectsDir,compression:f.storage.profile}).init();assert.equal(reopened.thread({id}).turns[0].user,'intact bytes');reopened.close();assert.equal(await fs.readFile(path.join(f.storage.preservedRecoveryPath,'local-storage-v2','objects',object),'utf8'),'damaged original object');
});
