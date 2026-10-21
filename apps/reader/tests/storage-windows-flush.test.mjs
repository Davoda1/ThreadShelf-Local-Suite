import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CompressedStorage } from '../src/core/storage.mjs';

// Reproduce the Windows FlushFileBuffers access rule while still flushing real
// files on the host filesystem. This is a platform-semantics regression harness,
// not a native Windows execution claim, and regular-file failures are never ignored.
function windowsFlushRule(t){
  const originalOpen=fs.open,events=[],state={fail:null,legacyReadOnlyReopen:false};
  t.mock.method(fs,'open',async function(file,flags,...args){
    // Recreate the old helper's exact read-only reopen for the retry scenario.
    if(state.legacyReadOnlyReopen&&flags===constants.O_WRONLY&&String(file).includes(`${path.sep}checkpoint-`)&&String(file).endsWith('archive.sqlite'))flags='r';
    const handle=await originalOpen.call(fs,file,flags,...args),originalSync=handle.sync.bind(handle);
    const writable=typeof flags==='number'?Boolean(flags&(constants.O_WRONLY|constants.O_RDWR)):/[wa+]/.test(flags);
    handle.sync=async()=>{
      const stat=await handle.stat();
      if(stat.isFile()){
        const event={file:String(file),flags,writable};events.push(event);
        if(!writable||state.fail?.(event))throw Object.assign(new Error('EPERM: operation not permitted, fsync'),{code:'EPERM',syscall:'fsync'});
      }
      return originalSync();
    };
    return handle;
  });
  return {events,state};
}
async function profile(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ts-win-flush-')),dataDir=path.join(root,'profile'),tempRoot=path.join(root,'temp');
  const f={root,dataDir,tempRoot,storage:null,db:null};
  t.after(async()=>{try{f.db?.close();}catch{}await f.storage?.close().catch(()=>{});await fs.rm(root,{recursive:true,force:true});});
  f.open=async(options={})=>{f.storage=await new CompressedStorage({dataDir,tempRoot}).init(options);if(!options.recovery){f.db=new DatabaseSync(f.storage.archivePath);f.db.exec('CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,value TEXT)');await f.storage.recover(r=>f.apply(r));if(!f.storage.pointer)await f.storage.checkpoint({archiveDb:f.db});}};
  f.apply=r=>f.db.prepare('INSERT OR IGNORE INTO records VALUES(?,?)').run(r.id,r.value);
  f.rows=()=>f.db.prepare('SELECT * FROM records ORDER BY id').all().map(r=>({...r}));
  f.close=async()=>{f.db?.close();f.db=null;await f.storage.close();};return f;
}

test('Win32 writable-flush rule allows clean initialization, journal, backup, restore and recovery preservation',async t=>{
  const {events}=windowsFlushRule(t),f=await profile(t);await f.open();
  await f.storage.commit({id:'saved',value:'Exact Unicode: ő 🌍'},r=>f.apply(r));
  const destination=path.join(f.root,'backup.zip');await f.storage.backup(destination,{archiveDb:f.db,reading:{positions:{},bookmarks:[],recent:[]}});
  const prepared=await f.storage.prepareRestore(destination);f.db.close();f.db=null;await f.storage.installRestore(prepared);f.db=new DatabaseSync(f.storage.archivePath);assert.deepEqual(f.rows(),[{id:'saved',value:'Exact Unicode: ő 🌍'}]);
  await f.close();await f.open();assert.equal(f.rows().length,1);await f.close();
  const corrupt='{"damaged":true}';await fs.writeFile(path.join(f.dataDir,'local-storage-v2','current.json'),corrupt);await f.open({recovery:true});const staged=await f.storage.prepareRestore(destination);await f.storage.installRestore(staged);f.db=new DatabaseSync(f.storage.archivePath);
  assert.deepEqual(f.rows(),[{id:'saved',value:'Exact Unicode: ő 🌍'}]);assert.equal(await fs.readFile(path.join(f.storage.preservedRecoveryPath,'local-storage-v2','current.json'),'utf8'),corrupt);
  assert.ok(events.length>10);assert.ok(events.every(e=>e.writable));
  assert.ok(events.some(e=>e.file.endsWith('archive.sqlite')),'SQLite backups and extracted working files were flushed');
  assert.ok(events.some(e=>/\.(?:7z|zip)(?:\.[a-f0-9-]+\.part)?$/.test(e.file)),'compressed snapshots were flushed');
  assert.ok(events.some(e=>e.file.endsWith('.json.gz.part')),'compressed operation records were flushed');
  assert.ok(events.some(e=>e.file.includes(`${path.sep}recovery-preserved${path.sep}`)),'preserved recovery copies were flushed');
});

test('regular-file EPERM on a writable snapshot handle aborts publication and retains durable records',async t=>{
  const {state,events}=windowsFlushRule(t),f=await profile(t);await f.open();await f.storage.commit({id:'durable',value:'retained'},r=>f.apply(r));const before=f.storage.pointer.file;
  state.fail=e=>e.file.includes(`${path.sep}checkpoint-`)&&e.file.endsWith('archive.sqlite');
  await assert.rejects(f.storage.checkpoint({archiveDb:f.db}),{code:'EPERM',syscall:'fsync'});assert.equal(f.storage.pointer.file,before);assert.ok(events.filter(state.fail).every(e=>e.writable));
  state.fail=null;await f.close();await f.open();assert.deepEqual(f.rows(),[{id:'durable',value:'retained'}]);
});

test('regular-file EPERM on a writable journal handle cannot acknowledge or apply a mutation',async t=>{
  const {state,events}=windowsFlushRule(t),f=await profile(t);await f.open();state.fail=e=>e.file.endsWith('.json.gz.part');let applied=false;
  await assert.rejects(f.storage.commit({id:'uncommitted',value:'must not apply'},r=>{applied=true;return f.apply(r);}),{code:'EPERM',syscall:'fsync'});assert.equal(applied,false);assert.equal(f.storage.sequence,0);assert.ok(events.filter(state.fail).every(e=>e.writable));
  state.fail=null;await f.close();await f.open();assert.deepEqual(f.rows(),[]);
});


test('corrected flush retries the profile left by the original fresh-start failure without clearing settings',async t=>{
  const {state,events}=windowsFlushRule(t),f=await profile(t);await fs.mkdir(f.dataDir,{recursive:true});const settings='{"language":"hu","listMode":"pages"}';await fs.writeFile(path.join(f.dataDir,'settings.json'),settings);
  state.legacyReadOnlyReopen=true;await assert.rejects(f.open(),{code:'EPERM',syscall:'fsync'});assert.ok(events.some(e=>e.flags==='r'&&!e.writable));await f.close();
  const persistent=path.join(f.dataDir,'local-storage-v2');assert.equal(await fs.access(path.join(persistent,'initializing.json')).then(()=>true,()=>false),true);assert.equal(await fs.access(path.join(persistent,'current.json')).then(()=>true,()=>false),false);const epochs=await fs.readdir(path.join(persistent,'records'));assert.ok(epochs.length>=1);assert.ok((await fs.readFile(path.join(persistent,'records',epochs[0],'head.json'),'utf8')).includes('"sequence":0'));
  state.legacyReadOnlyReopen=false;await f.open();assert.ok(f.storage.pointer);assert.equal(await fs.access(path.join(persistent,'initializing.json')).then(()=>true,()=>false),false);assert.equal(await fs.readFile(path.join(f.dataDir,'settings.json'),'utf8'),settings);await f.storage.commit({id:'after-retry',value:'saved'},r=>f.apply(r));await f.close();await f.open();assert.deepEqual(f.rows(),[{id:'after-retry',value:'saved'}]);
});
