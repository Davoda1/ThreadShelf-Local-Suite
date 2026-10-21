import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ApplicationService} from '../src/core/service.mjs';
import {localReadingKey} from '../src/core/manager-reading.mjs';
function gate(){let enter,release;return {entered:new Promise(r=>enter=r),blocked:new Promise(r=>release=r),enter:()=>enter(),release:()=>release()};}
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'tslr-conversion-')),dataDir=path.join(root,'Unicode Árvíztűrő 🧪');
 let service=await new ApplicationService({dataDir}).init();
 t.after(async()=>{await service.shutdown().catch(()=>{});await fs.rm(root,{recursive:true,force:true});});
 const doc={provider:'openai',collection:'A',conversationKey:'stable',sourceFile:'source.json',title:'Cobalt Unicode 🧪',raw:{nested:['preserve','你好',19]},turns:[{user:'Cobalt keyboard layout',turn_index:7},{ai:'Árvíztűrő keyboard profile F24',turn_index:91}]};
 const result=await service.commitMutation(service.store.prepareUpsert(doc));const id=result.summary.id,key=localReadingKey(id);
 await service.handle('reading.save',{key,position:{turnIndex:91,role:'assistant',offset:.37,ref:{mode:'local',id}},bookmark:{turnIndex:7,role:'user',ref:{mode:'local',id}}});
 return {root,dataDir,id,key,doc,get service(){return service;},async reopen(){await service.shutdown();service=await new ApplicationService({dataDir}).init();return service;}};
}
test('both complete profile conversions preserve content, identity, reading and search across restart',async t=>{
 const f=await fixture(t),thread=await f.service.handle('thread',{id:f.id}),revision=f.service.store.searchRevision();
 const before=(await f.service.handle('search',{q:'keyboard'})).results.map(({score,...row})=>row);
 for(const profile of ['zip6','7z','zip6']){
  const result=await f.service.handle('storage.convert',{profile});assert.equal(result.ok,true);
  assert.equal((await f.service.handle('manager.status')).storage.profile,profile);
  assert.deepEqual(await f.service.handle('thread',{id:f.id}),thread);assert.equal(f.service.store.searchRevision(),revision);
  assert.deepEqual((await f.service.handle('search',{q:'keyboard'})).results.map(({score,...row})=>row),before);
  await f.reopen();assert.equal(f.service.storage.profile,profile);
  assert.equal((await f.service.handle('bootstrap')).reading.positions[f.key].offset,.37);
  assert.equal((await f.service.handle('bootstrap')).reading.bookmarks[0].turnIndex,7);
  assert.equal((await f.service.handle('manager.maintenance',{operation:'verify'})).ok,true);
 }
});
test('conversion queues Local reads and reading saves while settings remain available',async t=>{
 const f=await fixture(t),paused=gate();
 f.service.storage.fault=async name=>{if(name==='before-pointer'){paused.enter();await paused.blocked;}};
 const converting=f.service.handle('storage.convert',{profile:'zip6'});await paused.entered;
 let readDone=false;const read=f.service.handle('thread',{id:f.id}).finally(()=>readDone=true);
 const reading=f.service.handle('reading.save',{key:f.key,position:{turnIndex:91,role:'assistant',offset:.72,ref:{mode:'local',id:f.id}}});
 await f.service.handle('settings.save',{values:{language:'de'}});
 await assert.rejects(f.service.handle('manager.mutate',{operation:'create',name:'Forbidden during conversion'}),/Another.*operation/);
 await assert.rejects(f.service.handle('search',{q:'cobalt'}),/being managed/);
 assert.equal(readDone,false);paused.release();await Promise.all([converting,read,reading]);
 const boot=await f.service.handle('bootstrap');assert.equal(boot.settings.language,'de');assert.equal(boot.reading.positions[f.key].offset,.72);
});
test('prepublication conversion failure retains old durable generation and all acknowledged records',async t=>{
 const f=await fixture(t);f.service.storage.fault=name=>{if(name==='before-pointer')throw Object.assign(new Error('Injected disk exhaustion'),{code:'ENOSPC'});};
 await assert.rejects(f.service.handle('storage.convert',{profile:'zip6'}),/Injected disk/);
 assert.deepEqual((await f.service.handle('thread',{id:f.id})).turns,f.doc.turns);
 assert.equal(f.service.storage.profile,'7z');await f.reopen();assert.equal(f.service.store.files().total,1);
});
test('postpublication conversion interruption adopts new committed profile on next open',async t=>{
 const f=await fixture(t);f.service.storage.fault=name=>{if(name==='after-pointer')throw new Error('Injected postcommit interruption');};
 await assert.rejects(f.service.handle('storage.convert',{profile:'zip6'}),/Injected postcommit/);
 assert.equal((await f.service.handle('files')).total,1);assert.equal(f.service.storage.profile,'zip6');
 assert.deepEqual((await f.service.handle('thread',{id:f.id})).raw,f.doc.raw);await f.reopen();assert.equal(f.service.storage.profile,'zip6');
});
test('cancellation before publication keeps old active codec and usable archive',async t=>{
 const f=await fixture(t);f.service.storage.fault=async name=>{if(name==='before-pointer')await f.service.handle('operation.cancel',{scope:'operation'});};
 await assert.rejects(f.service.handle('storage.convert',{profile:'zip6'}),{name:'AbortError'});
 assert.equal((await f.service.handle('files')).total,1);assert.equal(f.service.storage.profile,'7z');
 await assert.rejects(f.service.handle('storage.convert',{profile:'bogus'}),/Choose High/);
});

test('real process termination at six conversion boundaries preserves one complete generation',async t=>{
 const {spawn}=await import('node:child_process');const {fileURLToPath}=await import('node:url');
 for(const boundary of ['conversion-staged','conversion-objects-verified','before-pointer','after-pointer','conversion-published','before-cleanup']){
  const f=await fixture(t);await f.service.shutdown();
  const exit=await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,[fileURLToPath(new URL('./conversion-crash-worker.mjs',import.meta.url)),f.dataDir,boundary],{stdio:['ignore','ignore','pipe']});let errors='';
   child.stderr.on('data',b=>errors+=b);child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal,errors}));
  });
  assert.ok(exit.errors.includes(`READER_CONVERSION_CRASH_BOUNDARY:${boundary}\n`),exit.errors);
  // Windows TerminateProcess reports an exit code, not a POSIX signal.
  if(process.platform==='win32'){assert.equal(exit.signal,null,exit.errors);assert.equal(exit.code,1,exit.errors);}
  else assert.equal(exit.signal,'SIGKILL',exit.errors);
  await f.reopen();
  const expected=['after-pointer','conversion-published','before-cleanup'].includes(boundary)?'zip6':'7z';
  assert.equal(f.service.storage.profile,expected,boundary);assert.deepEqual((await f.service.handle('thread',{id:f.id})).turns,f.doc.turns);
  assert.equal((await f.service.handle('bootstrap')).reading.positions[f.key].offset,.37);
  assert.equal((await f.service.handle('manager.maintenance',{operation:'verify'})).ok,true);
  await f.service.handle('manager.maintenance',{operation:'compact'});
 }
});

test('postcommit deletion failures report cleanup pending across restart and retry safely',async t=>{
 const f=await fixture(t);f.service.storage.fault=name=>{if(name==='before-cleanup')throw Object.assign(new Error('Injected locked file'),{code:'EACCES'});};
 const converted=await f.service.handle('storage.convert',{profile:'zip6'});
 assert.equal(converted.storage.profile,'zip6');assert.equal(converted.storage.cleanupPending,true);
 assert.deepEqual((await f.service.handle('thread',{id:f.id})).turns,f.doc.turns);await f.reopen();
 assert.equal((await f.service.handle('manager.status')).storage.cleanupPending,true);
 const result=await f.service.handle('manager.maintenance',{operation:'compact'});assert.equal(result.storage.cleanupPending,false);
});
