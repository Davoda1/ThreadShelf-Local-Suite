import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ApplicationService} from '../src/core/service.mjs';
import {localReadingKey} from '../src/core/manager-reading.mjs';

const serverRef={mode:'server',serverUrl:'http://127.0.0.1:3000/',id:'server-only',collection:'Remote',sourceFile:'server.json',conversationKey:'remote'};
const serverKey=JSON.stringify(serverRef);
const position=(ref,turnIndex=0)=>({turnIndex,role:'user',offset:.27,title:'Saved fixture',ref});
const serverPart=r=>({position:r.positions[serverKey],bookmarks:r.bookmarks.filter(x=>x.key===serverKey),recent:r.recent.filter(x=>x.key===serverKey)});
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'tslr-manager-integration-')),dataDir=path.join(root,'profile');
 let service=await new ApplicationService({dataDir}).init();
 t.after(async()=>{await service.shutdown().catch(()=>{});await fs.rm(root,{recursive:true,force:true});});
 return {root,dataDir,get service(){return service;},async reopen(){await service.shutdown();service=await new ApplicationService({dataDir}).init();return service;}};
}
async function imported(f,{collection='Source',id='one',text='cobalt preserved source',title='Fixture conversation'}={}){
 const filename=path.join(f.root,id+'.json');
 await fs.writeFile(filename,JSON.stringify({id,title,messages:[{role:'user',content:text},{role:'assistant',content:'A retained answer with Unicode: Árvíztűrő 🧪.'}]}));
 const result=await f.service.handle('import.paths',{paths:[filename],collection});
 assert.deepEqual(result.errors,[]);assert.equal(result.imported,1);
 return (await f.service.handle('files',{mode:'local',collection})).files.find(x=>x.conversationKey===id)|| (await f.service.handle('files',{mode:'local',collection})).files.find(x=>x.title===title);
}
async function collection(service,name){return (await service.handle('manager.status')).collections.find(x=>x.name===name);}
async function saveReading(service,row){const ref={mode:'local',...row};return service.handle('reading.save',{key:localReadingKey(row.id),position:position(ref),bookmark:position(ref)});}
async function saveServer(service){return service.handle('reading.save',{key:serverKey,position:position(serverRef),bookmark:position(serverRef)});}
async function mutate(service,args){const status=await service.handle('manager.status');await service.handle('manager.preview',{...args,expectedRevision:status.revision});return service.handle('manager.mutate',{...args,expectedRevision:status.revision});}

test('manager rename and move retain immutable identities, provenance, bookmarks, offsets and restart durability',async t=>{
 const f=await fixture(t),item=await imported(f),source=await collection(f.service,'Source');
 assert.ok(item?.id&&source?.id);await saveReading(f.service,item);await saveServer(f.service);
 await f.service.handle('settings.save',{values:{localCollection:'Source'}});
 const before=(await f.service.handle('bootstrap')).reading,original=await f.service.handle('thread',{mode:'local',id:item.id});
 const renameResult=await mutate(f.service,{operation:'rename',collectionId:source.id,name:'Renamed'});assert.equal(renameResult.localCollection,'Renamed');assert.equal((await f.service.handle('bootstrap')).settings.localCollection,'Renamed');
 const renamed=await f.service.handle('thread',{mode:'local',id:item.id});assert.equal(renamed.id,item.id);assert.equal(renamed.collection,'Renamed');assert.deepEqual(renamed.raw,original.raw);assert.deepEqual(renamed.turns,original.turns);
 let reading=(await f.service.handle('bootstrap')).reading;assert.equal(reading.positions[localReadingKey(item.id)].offset,.27);assert.equal(reading.positions[localReadingKey(item.id)].ref.collection,'Renamed');assert.deepEqual(serverPart(reading),serverPart(before));
 await mutate(f.service,{operation:'create',name:'Destination'});const destination=await collection(f.service,'Destination');
 await mutate(f.service,{operation:'move',ids:[item.id],targetId:destination.id});await f.reopen();
 assert.equal((await f.service.handle('thread',{mode:'local',id:item.id})).collection,'Destination');
 reading=(await f.service.handle('bootstrap')).reading;assert.equal(reading.bookmarks.find(x=>x.key===localReadingKey(item.id)).ref.collection,'Destination');assert.deepEqual(serverPart(reading),serverPart(before));
 assert.equal((await f.service.handle('search',{mode:'local',q:'cobalt',searchMode:'keyword'})).results[0].conversationId,item.id);
});

test('manager copies have independent identities with opt-in bookmarks and exact deletion scope',async t=>{
 const f=await fixture(t),item=await imported(f);await saveReading(f.service,item);await saveServer(f.service);const before=(await f.service.handle('bootstrap')).reading;
 await mutate(f.service,{operation:'copy',ids:[item.id],targetName:'Copy without bookmarks'});
 const first=(await f.service.handle('files',{mode:'local',collection:'Copy without bookmarks'})).files[0];assert.notEqual(first.id,item.id);
 assert.equal((await f.service.handle('bootstrap')).reading.bookmarks.some(x=>x.key===localReadingKey(first.id)),false);
 await mutate(f.service,{operation:'copy',ids:[item.id],targetName:'Copy with bookmarks',copyBookmarks:true});
 const second=(await f.service.handle('files',{mode:'local',collection:'Copy with bookmarks'})).files[0];assert.notEqual(second.id,item.id);assert.notEqual(second.id,first.id);
 let reading=(await f.service.handle('bootstrap')).reading;assert.equal(reading.bookmarks.find(x=>x.key===localReadingKey(second.id)).ref.id,second.id);assert.equal(reading.positions[localReadingKey(second.id)],undefined);
 await mutate(f.service,{operation:'deleteConversations',ids:[item.id]});reading=(await f.service.handle('bootstrap')).reading;
 assert.equal(reading.positions[localReadingKey(item.id)],undefined);assert.equal(reading.bookmarks.some(x=>x.key===localReadingKey(item.id)),false);assert.deepEqual(serverPart(reading),serverPart(before));
 assert.deepEqual(new Set((await f.service.handle('files',{mode:'local'})).files.map(x=>x.id)),new Set([first.id,second.id]));
 await f.reopen();assert.equal((await f.service.handle('files',{mode:'local'})).total,2);
});

test('all-matching manager selection honors filters and stale previews reject without partial mutation',async t=>{
 const f=await fixture(t);await imported(f,{id:'match-a',text:'target cobalt'});await imported(f,{id:'match-b',text:'target cobalt'});const kept=await imported(f,{id:'keep',text:'untouched violet'});await imported(f,{id:'other',collection:'Other',text:'target cobalt'});
 const source=await collection(f.service,'Source'),status=await f.service.handle('manager.status');
 await mutate(f.service,{operation:'create',name:'Concurrent change'});
 await assert.rejects(f.service.handle('manager.mutate',{operation:'deleteCollection',collectionId:source.id,expectedRevision:status.revision}),/changed|refresh|revision|stale/i);
 assert.equal((await f.service.handle('files',{mode:'local'})).total,4);
 await mutate(f.service,{operation:'deleteConversations',selection:{allMatching:true,collectionId:source.id,query:'target'}});
 const remaining=(await f.service.handle('files',{mode:'local'})).files;assert.equal(remaining.length,2);assert.ok(remaining.some(x=>x.id===kept.id));assert.ok(remaining.some(x=>x.collection==='Other'));
});

test('backup and restore replace Local contents and reading while preserving current Server data and preferences',async t=>{
 const f=await fixture(t),item=await imported(f);await saveReading(f.service,item);await saveServer(f.service);
 const backup=path.join(f.root,'user-backup.zip');await f.service.handle('manager.backup',{path:backup});assert.ok((await fs.stat(backup)).size>0);
 await f.service.handle('settings.save',{values:{language:'hu',uiPalette:'oled'}});
 await f.service.handle('reading.save',{key:serverKey,position:position(serverRef,23)});const serverNow=serverPart((await f.service.handle('bootstrap')).reading);
 await mutate(f.service,{operation:'deleteConversations',ids:[item.id]});await imported(f,{id:'after-backup',text:'post backup amber'});
 await f.service.handle('manager.restore.preview',{path:backup});await f.service.handle('manager.restore',{path:backup});
 const boot=await f.service.handle('bootstrap');assert.equal(boot.settings.language,'hu');assert.equal(boot.settings.uiPalette,'oled');assert.deepEqual(serverPart(boot.reading),serverNow);assert.equal(boot.reading.positions[localReadingKey(item.id)].offset,.27);
 assert.deepEqual((await f.service.handle('files',{mode:'local'})).files.map(x=>x.id),[item.id]);await f.reopen();assert.equal((await f.service.handle('files',{mode:'local'})).files[0].id,item.id);assert.deepEqual(serverPart((await f.service.handle('bootstrap')).reading),serverNow);
 await fs.writeFile(path.join(f.root,'corrupt.zip'),'not a zip');await assert.rejects(f.service.handle('manager.restore.preview',{path:path.join(f.root,'corrupt.zip')}),/compressed|backup|zip|archive/i);assert.equal((await f.service.handle('files',{mode:'local'})).files[0].id,item.id);
});

test('clear all Local data purges automatic recovery copies but preserves models, preferences, external backups and Server reading',async t=>{
 const f=await fixture(t),item=await imported(f);await saveReading(f.service,item);await saveServer(f.service);await f.service.handle('settings.save',{values:{language:'de'}});
 const model=path.join(f.dataDir,'search','models','synthetic-cached-model');await fs.mkdir(path.dirname(model),{recursive:true});await fs.writeFile(model,'retained model');
 const backup=path.join(f.root,'external.zip');await f.service.handle('manager.backup',{path:backup});const before=serverPart((await f.service.handle('bootstrap')).reading);
 await mutate(f.service,{operation:'clear'});await f.reopen();
 const boot=await f.service.handle('bootstrap'),status=await f.service.handle('manager.status');assert.equal((await f.service.handle('files',{mode:'local'})).total,0);assert.equal(status.collections.length,0);assert.equal(boot.settings.language,'de');assert.deepEqual(serverPart(boot.reading),before);assert.equal(Object.keys(boot.reading.positions).length,1);assert.equal(await fs.readFile(model,'utf8'),'retained model');assert.ok((await fs.stat(backup)).size>0);
 assert.equal(await fs.stat(path.join(f.dataDir,'local-storage-v2','legacy-rollback.zip')).then(()=>true,()=>false),false);
});

test('acknowledged import is stored compressed and reopens after its entire temporary working directory is discarded',async t=>{
 const f=await fixture(t),item=await imported(f),work=f.service.storage.workingDir;
 assert.ok(!work.startsWith(f.dataDir+path.sep));assert.ok((await fs.stat(path.join(work,'archive.sqlite'))).isFile());assert.equal(await fs.stat(path.join(f.dataDir,'archive.sqlite')).then(()=>true,()=>false),false);
 const status=await f.service.handle('manager.status');assert.ok(status.storage.persistentBytes>0);assert.ok(status.storage.journalRecords>0);
 await f.reopen();assert.equal(await fs.stat(work).then(()=>true,()=>false),false);assert.equal((await f.service.handle('thread',{mode:'local',id:item.id})).title,item.title);
});

test('committed manager mutation recovers after interruption before database apply without relying on temporary files',async t=>{
 const f=await fixture(t),item=await imported(f);await saveReading(f.service,item);await saveServer(f.service);const before=serverPart((await f.service.handle('bootstrap')).reading);
 f.service.storage.fault=name=>{if(name==='record-committed')throw new Error('Injected process interruption after durable commit');};
 await assert.rejects(f.service.handle('manager.mutate',{operation:'deleteConversations',ids:[item.id]}),/Injected|recover|restart/i);
 f.service.storage.fault=null;await f.reopen();assert.equal((await f.service.handle('files',{mode:'local'})).total,0);
 const reading=(await f.service.handle('bootstrap')).reading;assert.equal(reading.positions[localReadingKey(item.id)],undefined);assert.equal(reading.bookmarks.some(x=>x.key===localReadingKey(item.id)),false);assert.deepEqual(serverPart(reading),before);
 await f.reopen();assert.equal((await f.service.handle('files',{mode:'local'})).total,0);
});

test('manager recovery reconciles a database change when its reading-state write fails',async t=>{
 const f=await fixture(t),item=await imported(f);await saveReading(f.service,item);await saveServer(f.service);const before=serverPart((await f.service.handle('bootstrap')).reading),update=f.service.reading.update.bind(f.service.reading);
 f.service.reading.update=async()=>{throw new Error('Injected reading-state write failure');};
 await assert.rejects(f.service.handle('manager.mutate',{operation:'deleteConversations',ids:[item.id]}),/Injected|recover|restart/i);
 f.service.reading.update=update;await f.reopen();assert.equal((await f.service.handle('files',{mode:'local'})).total,0);
 const reading=(await f.service.handle('bootstrap')).reading;assert.equal(reading.positions[localReadingKey(item.id)],undefined);assert.equal(reading.bookmarks.some(x=>x.key===localReadingKey(item.id)),false);assert.deepEqual(serverPart(reading),before);
});

test('Server-only startup and status do not expand Local archive; Local actions mount once',async t=>{
 const f=await fixture(t),item=await imported(f);await f.service.handle('settings.save',{values:{mode:'server'}});await f.reopen();
 assert.equal(f.service.store,null);assert.equal(f.service.storage,null);const boot=await f.service.handle('bootstrap');assert.equal(boot.settings.mode,'server');await f.service.handle('search.status');assert.equal(f.service.store,null);assert.equal(f.service.storage,null);
 assert.equal((await f.service.handle('thread',{mode:'local',id:item.id})).id,item.id);const work=f.service.storage.workingDir;await f.service.handle('manager.status');assert.equal(f.service.storage.workingDir,work);
});

test('replaying archive journal does not resurrect a deliberately removed copied bookmark',async t=>{
 const f=await fixture(t),item=await imported(f);await saveReading(f.service,item);
 await mutate(f.service,{operation:'copy',ids:[item.id],targetName:'Copied',copyBookmarks:true});
 const copied=(await f.service.handle('files',{mode:'local',collection:'Copied'})).files[0],key=localReadingKey(copied.id);
 assert.ok((await f.service.handle('bootstrap')).reading.bookmarks.some(x=>x.key===key));
 await f.service.handle('reading.save',{key,removeBookmark:{turnIndex:0,role:'user'}});
 for(let i=0;i<2;i++){await f.reopen();const bookmarks=(await f.service.handle('bootstrap')).reading.bookmarks;assert.equal(bookmarks.some(x=>x.key===key),false);assert.equal(bookmarks.some(x=>x.key===localReadingKey(item.id)),true);}
});

test('failed restore publication releases closed handles and remounts the surviving committed archive',async t=>{
 const f=await fixture(t),item=await imported(f),backup=path.join(f.root,'recovery.zip');await f.service.handle('manager.backup',{path:backup});await imported(f,{id:'newer',title:'Newer surviving conversation'});
 await f.service.handle('manager.restore.preview',{path:backup});
 f.service.storage.fault=name=>{if(name==='before-pointer')throw new Error('Injected restore publication failure');};
 await assert.rejects(f.service.handle('manager.restore',{path:backup}),/Injected/);
 const files=await f.service.handle('files',{mode:'local'});assert.equal(files.total,2);assert.ok(files.files.some(x=>x.id===item.id));assert.ok(files.files.some(x=>x.title==='Newer surviving conversation'));
});

test('clearing semantic index is durable, preserves models, and cannot return deleted results from old vectors',async t=>{
 const f=await fixture(t),item=await imported(f);
 f.service.searcher.runtimeFactory=()=>({async call(operation,texts){return operation==='setup'?{dimension:3}:texts.map(()=>[1,0,0]);},async close(){}});
 await f.service.handle('semantic.setup');await f.service.handle('semantic.index');
 assert.equal((await f.service.handle('search',{mode:'local',q:'cobalt',searchMode:'semantic'})).results[0].conversationId,item.id);
 await mutate(f.service,{operation:'deleteConversations',ids:[item.id]});
 const result=await f.service.handle('search',{mode:'local',q:'cobalt',searchMode:'semantic'});assert.equal(result.results.length,0);assert.match(result.notice,/outdated|index/i);
 await f.service.handle('manager.maintenance',{operation:'clearIndex'});await f.reopen();const status=await f.service.handle('search.status');assert.equal(status.modelReady,true);assert.equal(status.indexedPassages,0);assert.equal((await f.service.handle('files',{mode:'local'})).total,0);
});
