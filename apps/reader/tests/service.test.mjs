import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {ApplicationService} from '../src/core/service.mjs';
import {JsonState,DEFAULTS,validateSettings,resolveImportDirectory} from '../src/core/state.mjs';
import {ThreadShelfClient,remoteId} from '../src/core/server.mjs';

async function fixture(t){
  const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'tslr-service-'));
  const service=await new ApplicationService({dataDir}).init();
  t.after(async()=>{await service.handle('shutdown');await fs.rm(dataDir,{recursive:true,force:true});});
  return {service,dataDir};
}
async function backend(t){
  const state={title:'Server original',fail:false,hits:[]};
  const items=[{collection:'work',sourceFile:'/archive/same.json',conversationKey:'one',title:state.title,turnCount:3,provider:'openai'},{collection:'personal',sourceFile:'/archive/same.json',conversationKey:'one',title:'Personal',turnCount:1,provider:'anthropic'}];
  const server=http.createServer((req,res)=>{
    state.hits.push(req.method+' '+req.url);res.setHeader('Content-Type','application/json');const u=new URL(req.url,'http://localhost');let value;
    if(state.fail){res.statusCode=503;res.end(JSON.stringify({error:'Offline for fixture'}));return;}
    if(u.pathname==='/api/collections')value={collections:['work','personal','empty']};
    else if(u.pathname==='/api/files'){const c=u.searchParams.get('collection');value={files:items.filter(i=>c==='all'||i.collection===c).map(i=>({...i,title:i.collection==='work'?state.title:i.title}))};}
    else if(u.pathname==='/api/thread')value={sourceFile:u.searchParams.get('sourceFile'),conversationKey:u.searchParams.get('conversationKey'),title:state.title,turns:[{user:'Find the cobalt checklist',turn_index:0},{thinking:'Compare schedules',turn_index:3},{ai:state.title+' cobalt checklist',turn_index:7}]};
    else if(u.pathname==='/api/search')value={results:[{document:'cobalt checklist',metadata:{sourceFile:'/archive/same.json',conversationKey:'one',collection:'work',turnIndex:'0',role:'user',provider:'openai'}}]};
    else if(u.pathname==='/api/health')value={ok:true};
    else {res.statusCode=404;value={error:'Not found'};}
    res.end(JSON.stringify(value));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));return {state,url:`http://127.0.0.1:${server.address().port}/`};
}
test('server listing hides empty collections; search retains string index zero and full identity',async t=>{
  const {url}=await backend(t);const client=new ThreadShelfClient(url);
  assert.deepEqual((await client.collections()).map(c=>c.name),['personal','work']);
  const result=await client.search({q:'cobalt'});assert.equal(result.results[0].turnIndex,0);assert.equal(result.results[0].title,'Server original');assert.equal(result.results[0].collection,'work');
  assert.notEqual(remoteId(url,{collection:'work',sourceFile:'/a/file',conversationKey:'x'}),remoteId(url,{collection:'personal',sourceFile:'/a/file',conversationKey:'x'}));
});
test('selective server copy is complete, repeatable, independent, and uses GET only',async t=>{
  const {service}=await fixture(t);const {url,state}=await backend(t);
  const first=await service.handle('server.import',{serverUrl:url,collections:['work']});assert.equal(first.imported,1);assert.deepEqual(first.errors,[]);
  const again=await service.handle('server.import',{serverUrl:url,collections:['work']});assert.equal(again.skipped,1);
  assert.deepEqual((await service.handle('collections',{mode:'local'})).collections.map(c=>c.name),['work']);
  const local=(await service.handle('files',{mode:'local'})).files[0];const thread=await service.handle('thread',{mode:'local',id:local.id});assert.equal(thread.turns.length,3);assert.equal(thread.turns[2].turn_index,7);assert.equal(thread.sourceIdentity.serverUrl,url);
  state.title='Changed on server';const live=(await service.handle('files',{mode:'server',serverUrl:url})).files.find(f=>f.collection==='work');assert.equal(live.title,'Changed on server');assert.equal((await service.handle('thread',{mode:'local',id:local.id})).title,'Server original');
  state.fail=true;await assert.rejects(service.handle('collections',{mode:'server',serverUrl:url}),/Offline/);assert.equal((await service.handle('files',{mode:'local'})).total,1);
  assert.ok(state.hits.every(h=>h.startsWith('GET ')));
});
test('empty server selection cannot import unintended collections',async t=>{
  const {service}=await fixture(t);const {url}=await backend(t);
  const r=await service.handle('server.import',{serverUrl:url,collections:['empty']});assert.equal(r.imported,0);assert.match(r.errors[0].error,/empty/);assert.equal((await service.handle('files',{})).total,0);
});
test('preferences and reading use one root with mode-separated identities and serialized writes',async t=>{
  const {service,dataDir}=await fixture(t);
  await service.handle('settings.save',{values:{language:'hu',mode:'server',localCollection:'work',serverCollection:'personal'}});
  const anchor={turnIndex:7,role:'assistant',offset:0.25,expanded:true,title:'Reading'};
  await Promise.all([service.handle('reading.save',{key:'local:work:one',position:anchor}),service.handle('reading.save',{key:'server:work:one',bookmark:anchor})]);
  const b=await service.handle('bootstrap');assert.equal(b.settings.language,'hu');assert.equal(b.reading.positions['local:work:one'].turnIndex,7);assert.equal(b.reading.bookmarks[0].key,'server:work:one');
  for(const name of ['settings.json','reading-v2.json','local-storage-v2/current.json'])assert.ok((await fs.stat(path.join(dataDir,name))).isFile());
  assert.equal(await fs.stat(path.join(dataDir,'archive.sqlite')).then(()=>true,()=>false),false,'persistent archive stays compressed');
  assert.ok((await fs.stat(service.store.path)).isFile());assert.ok(!service.store.path.startsWith(dataDir+path.sep),'working SQLite lives in private temporary storage');
  await assert.rejects(service.handle('settings.save',{values:{language:'xx'}}),/Invalid/);
  await assert.rejects(service.handle('reading.save',{key:'__proto__',position:anchor}),/Invalid/);
});
test('directory fallback keeps configured custom location and finds last used',async t=>{
  const {dataDir}=await fixture(t);const settings={...DEFAULTS,directoryMode:'custom',customDirectory:path.join(dataDir,'missing'),lastDirectory:dataDir};
  const result=await resolveImportDirectory(settings);assert.equal(result.path,dataDir);assert.match(result.notice,/fallback/);assert.equal(settings.customDirectory,path.join(dataDir,'missing'));
});
test('corrupted settings recover previous valid snapshot, unsupported schema is preserved',async t=>{
  const {dataDir}=await fixture(t);const store=await new JsonState(dataDir,'isolated.json',DEFAULTS,v=>({...DEFAULTS,...validateSettings(v)})).init();
  await store.update(v=>({...v,language:'de'}));await store.update(v=>({...v,language:'fr'}));await fs.writeFile(store.file,'broken');
  const restored=await new JsonState(dataDir,'isolated.json',DEFAULTS,v=>v).init();assert.equal(restored.value.language,'de');assert.match(restored.notice,/backup/);
  await fs.writeFile(store.file,JSON.stringify({schemaVersion:999,data:{}}));await assert.rejects(new JsonState(dataDir,'isolated.json',DEFAULTS).init(),/Unsupported/);assert.match(await fs.readFile(store.file,'utf8'),/999/);
});
