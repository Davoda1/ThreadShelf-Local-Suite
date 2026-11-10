import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ApplicationService} from '../src/core/service.mjs';
import {localReadingKey} from '../src/core/manager-reading.mjs';
import {validateDeduplicationSettings,validateDeduplicationPreferenceChange} from '../src/core/deduplication-settings.mjs';

async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'tslr-dedup-service-')),dataDir=path.join(root,'profile');
 let service=await new ApplicationService({dataDir}).init();
 t.after(async()=>{await service.shutdown().catch(()=>{});await fs.rm(root,{recursive:true,force:true});});
 return {root,dataDir,get service(){return service;},async reopen(){await service.shutdown();service=await new ApplicationService({dataDir}).init();return service;}};
}
const turns=(extra=false)=>[{user:'Shared question',turn_index:0},{ai:'Shared answer',model:'Example stable model',turn_index:1},...(extra?[{user:'A new question',turn_index:2},{ai:'Additional answer',model:'Example stable model',turn_index:3}]:[])];
async function input(f,{id='one',title='Shared title',provider='venice',messages=turns()}={}){
 const filename=path.join(f.root,id+'.json');await fs.writeFile(filename,JSON.stringify({provider,conversationKey:id,title,turns:messages}));return filename;
}
async function rows(f,collection){return (await f.service.handle('files',{mode:'local',collection:collection||'all',pageSize:100})).files;}

test('new destructive preference defaults off, requires explicit confirmation, and rejects unexpected types',()=>{
 assert.deepEqual(validateDeduplicationSettings({}),{deleteOtherPromptOnlyAutomatically:false});
 assert.throws(()=>validateDeduplicationSettings({deleteOtherPromptOnlyAutomatically:'true'}));
 assert.throws(()=>validateDeduplicationPreferenceChange({deleteOtherPromptOnlyAutomatically:true},{deleteOtherPromptOnlyAutomatically:false}),/Confirm/);
 assert.equal(validateDeduplicationPreferenceChange({deleteOtherPromptOnlyAutomatically:true,confirmed:true},{deleteOtherPromptOnlyAutomatically:false}).deleteOtherPromptOnlyAutomatically,true);
});

test('post-import dedup keeps longest history, remaps bookmarks and reading, and survives restart',async t=>{
 const f=await fixture(t),short=await input(f,{id:'short'}),long=await input(f,{id:'long',messages:turns(true)});
 await f.service.handle('import.paths',{paths:[short],collection:'Same collection'});
 const original=(await rows(f))[0],key=localReadingKey(original.id),ref={mode:'local',id:original.id,collection:original.collection,sourceFile:original.sourceFile,conversationKey:original.conversationKey};
 await f.service.handle('reading.save',{key,position:{turnIndex:1,role:'ai',offset:.2,ref},bookmark:{turnIndex:1,role:'ai',title:original.title,ref}});
 const result=await f.service.handle('import.paths',{paths:[long],collection:'Same collection'});
 assert.equal(result.errors.length,0);assert.equal(result.deduplication.removed,1);
 const kept=(await rows(f))[0];assert.equal((await rows(f)).length,1);assert.equal(kept.turnCount,4);
 assert.equal(result.remap[original.id],kept.id);assert.equal(result.reading.bookmarks[0].key,localReadingKey(kept.id));
 await f.reopen();assert.equal((await rows(f)).length,1);assert.equal(f.service.reading.snapshot().bookmarks[0].key,localReadingKey(kept.id));
});

test('collections remain separate until explicit merge triggers target-only deduplication',async t=>{
 const f=await fixture(t),a=await input(f,{id:'a'}),b=await input(f,{id:'b',messages:turns(true)});
 await f.service.handle('import.paths',{paths:[a],collection:'First'});await f.service.handle('import.paths',{paths:[b],collection:'Second'});
 assert.equal((await rows(f)).length,2);
 const status=await f.service.handle('manager.status'),first=status.collections.find(c=>c.name==='First'),second=status.collections.find(c=>c.name==='Second');
 const result=await f.service.handle('manager.mutate',{operation:'merge',collectionIds:[first.id],targetId:second.id,expectedRevision:status.revision});
 assert.equal(result.deduplication.removed,1);assert.equal((await rows(f)).length,1);assert.equal((await rows(f))[0].collection,'Second');
});

test('Grok provider cleanup is automatic but a Grok model on Venice does not make prompt-only deletion automatic',async t=>{
 const f=await fixture(t);
 const grok=await input(f,{id:'grok-empty',provider:'grok',messages:[{user:'Unanswered',model:'Model',turn_index:0}]}),venice=await input(f,{id:'venice-empty',provider:'venice',messages:[{user:'Unanswered',model:'Grok',turn_index:0}]});
 const result=await f.service.handle('import.paths',{paths:[grok,venice],collection:'Exports'});
 assert.equal(result.deduplication.removed,1);assert.equal((await rows(f)).length,1);assert.equal((await rows(f))[0].provider,'venice');
});

test('manual review can remove selected unanswered prompts; stale reviews cannot mutate the archive',async t=>{
 const f=await fixture(t),file=await input(f,{id:'manual',messages:[{user:'Keep until reviewed',turn_index:0}]});
 await f.service.handle('import.paths',{paths:[file],collection:'Manual'});
 const preview=await f.service.handle('manager.dedup.preview',{deletePromptOnly:true});assert.equal(preview.entries.length,1);
 await f.service.handle('manager.mutate',{operation:'create',name:'Other'});
 await assert.rejects(f.service.handle('manager.dedup.apply',{deletePromptOnly:true,expectedRevision:preview.revision,ids:preview.entries.map(x=>x.id)}),/changed|review|revision/i);
 assert.equal((await rows(f)).length,1);
 const fresh=await f.service.handle('manager.dedup.preview',{deletePromptOnly:true});
 const result=await f.service.handle('manager.dedup.apply',{deletePromptOnly:true,expectedRevision:fresh.revision,ids:fresh.entries.map(x=>x.id)});
 assert.equal(result.removedIds.length,1);assert.equal((await rows(f)).length,0);
});

test('confirmed other-provider automatic prompt cleanup persists separately from ordinary settings',async t=>{
 const f=await fixture(t);
 await assert.rejects(f.service.handle('manager.dedup.settings',{deleteOtherPromptOnlyAutomatically:true}),/Confirm/);
 await f.service.handle('manager.dedup.settings',{deleteOtherPromptOnlyAutomatically:true,confirmed:true});await f.reopen();
 const status=await f.service.handle('manager.status');assert.equal(status.deduplication.deleteOtherPromptOnlyAutomatically,true);
 const file=await input(f,{id:'opted-in',messages:[{user:'Only a prompt',turn_index:0}]});
 const result=await f.service.handle('import.paths',{paths:[file],collection:'Opt in'});assert.equal(result.deduplication.removed,1);assert.equal((await rows(f)).length,0);
});

test('post-server-copy cleanup stays partitioned by collection and returns reading reconciliation',async t=>{
 const {ThreadShelfClient}=await import('../src/core/server.mjs');
 const original=Object.fromEntries(['collections','allFiles','thread'].map(key=>[key,ThreadShelfClient.prototype[key]]));
 const f=await fixture(t);
 const documents=[
  {id:'server-short',collection:'Remote one',conversationKey:'server-short',sourceFile:'short.json',title:'Server duplicate',provider:'venice',turns:turns()},
  {id:'server-long',collection:'Remote one',conversationKey:'server-long',sourceFile:'long.json',title:'Server duplicate',provider:'venice',turns:turns(true)},
  {id:'server-separate',collection:'Remote two',conversationKey:'server-separate',sourceFile:'separate.json',title:'Server duplicate',provider:'venice',turns:turns(true)},
 ];
 ThreadShelfClient.prototype.collections=async()=>[{name:'Remote one',count:2},{name:'Remote two',count:1}];
 ThreadShelfClient.prototype.allFiles=async function(collection){return documents.filter(x=>x.collection===collection).map(x=>({...x,turnCount:x.turns.length}));};
 ThreadShelfClient.prototype.thread=async function(summary){return documents.find(x=>x.id===summary.id);};
 try{
  const result=await f.service.handle('server.import',{serverUrl:'http://127.0.0.1:3000/',collections:['Remote one','Remote two']});
  assert.equal(result.errors.length,0);assert.equal(result.deduplication.removed,1);assert.equal((await rows(f)).length,2);assert.ok(result.reading);
  assert.equal((await rows(f,'Remote one'))[0].turnCount,4);assert.equal((await rows(f,'Remote two')).length,1);
 }finally{for(const [key,value] of Object.entries(original))ThreadShelfClient.prototype[key]=value;}
});

test('a saved merge still returns reconciliation when its later cleanup cannot finish',async t=>{
 const f=await fixture(t),a=await input(f,{id:'move-a'}),b=await input(f,{id:'move-b',title:'Different conversation'});
 await f.service.handle('import.paths',{paths:[a],collection:'Before'});await f.service.handle('import.paths',{paths:[b],collection:'After'});
 const status=await f.service.handle('manager.status'),from=status.collections.find(c=>c.name==='Before'),target=status.collections.find(c=>c.name==='After');
 const original=f.service.store.prepareDeduplication;f.service.store.prepareDeduplication=()=>{throw new Error('Synthetic cleanup interruption');};
 try{
  const result=await f.service.handle('manager.mutate',{operation:'merge',collectionIds:[from.id],targetId:target.id,expectedRevision:status.revision});
  assert.equal(result.deduplicationError,'Synthetic cleanup interruption');assert.ok(result.reading);assert.equal((await rows(f,'After')).length,2);
 }finally{f.service.store.prepareDeduplication=original;}
});
