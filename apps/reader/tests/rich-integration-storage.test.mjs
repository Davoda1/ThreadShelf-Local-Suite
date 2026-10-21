// Public suite integration checks. Set ANALYTICS_SOURCE to the Analytics app.
// BASELINE_READER_SOURCE can optionally select an older compatible Reader; the
// current Reader is used by default. All generated data are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {ApplicationService} from '../src/core/service.mjs';
import {localReadingKey} from '../src/core/manager-reading.mjs';

const analytics=process.env.ANALYTICS_SOURCE;
const baseline=process.env.BASELINE_READER_SOURCE || path.resolve('.');
const enabled=!!analytics&&!!baseline;
const moduleAt=(root,file)=>import(pathToFileURL(path.resolve(root,file)).href);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rich='<box gap={12}><title>Synthetic preserved chart</title><text>**Exact** values.</text><Chart content={'+JSON.stringify({type:'bar',data:[{name:'Alpha',value:0},{name:'Beta',value:-3.125}],xKey:'name',series:[{key:'value',label:'Value'}]})+'} /></box>';
const doc={provider:'openai',collection:'Synthetic source',sourceFile:'/synthetic/rich.json',conversationKey:'synthetic-rich-v320',title:'Synthetic archive compatibility',
 sourceIdentity:{kind:'threadshelf',serverUrl:'http://127.0.0.1:3000/',collection:'Synthetic source',sourceFile:'/synthetic/rich.json',conversationKey:'synthetic-rich-v320'},
 turns:[{user:'Keep these source bytes and identities.',turn_index:2,source_message_id:'synthetic-user'},
 {ai:rich+'\n\n| Category | Value |\n| --- | --- |\n| Alpha | 0 |\n| Beta | -3.125 |\n\n1 USD = 315.68 HUF (historical snapshot; not a live rate).\n[Interactive visualization not included in this export.]',turn_index:8,source_message_id:'synthetic-answer',model:'synthetic-model',createdAt:'2026-01-02T12:00:00Z'}],
 raw:{synthetic:true,preservedUnknown:{array:[0,-3.125,'Árvíztűrő 日本語',null,false]}}};

async function treeHashes(root){const output={};async function scan(base){for(const e of await fs.readdir(path.join(root,base),{withFileTypes:true})){const rel=path.join(base,e.name);if(e.isDirectory())await scan(rel);else if(e.isFile())output[rel]=createHash('sha256').update(await fs.readFile(path.join(root,rel))).digest('hex');}}await scan('');return output;}
async function inspect(service,id){const thread=await service.handle('thread',{mode:'local',id});const boot=await service.handle('bootstrap');const reading={positions:boot.reading.positions,bookmarks:boot.reading.bookmarks,recent:boot.reading.recent};return {thread,threadHash:hash(thread),rawHash:hash(thread.raw),turnsHash:hash(thread.turns),sourceHash:hash(thread.sourceIdentity),passagesHash:hash(service.store.passages()),searchRevision:service.store.searchRevision(),reading,readingHash:hash(reading),schema:service.store.db.prepare('PRAGMA user_version').get().user_version};}
async function mutate(service,args){const s=await service.handle('manager.status');return service.handle('manager.mutate',{...args,expectedRevision:s.revision});}

for(const profile of ['7z','zip6'])test(`rich export: ${profile} archive stays compatible with Reader and read-only Analytics`,{skip:!enabled,timeout:120000},async t=>{
 const {ApplicationService:BaselineService}=await moduleAt(baseline,'src/core/service.mjs');
 const {captureReader}=await moduleAt(analytics,'src/core/reader-capture.mjs');
 const {normalizeConversations}=await moduleAt(analytics,'src/core/adapters.mjs');
 const {buildReport}=await moduleAt(analytics,'src/core/metrics.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'threadshelf-rich-contract-'));
 const dataDir=path.join(root,'Reader profile'),workspace=path.join(root,'Analytics capture');
 let service=await new BaselineService({dataDir}).init();
 t.after(async()=>{await service?.shutdown().catch(()=>{});await fs.rm(root,{recursive:true,force:true});});
 const imported=await service.commitMutation(service.store.prepareUpsert(structuredClone(doc))),id=imported.summary.id,key=localReadingKey(id);
 await service.handle('reading.save',{key,position:{turnIndex:8,role:'assistant',offset:.375,ref:{mode:'local',id}},bookmark:{turnIndex:2,role:'user',ref:{mode:'local',id}}});
 if(profile==='zip6')await service.handle('storage.convert',{profile});
 const original=await inspect(service,id);
 assert.equal(original.schema,3);
 const reference=JSON.parse(service.store.db.prepare('SELECT content_ref FROM conversations WHERE id=?').get(id).content_ref);
 assert.equal(reference.format,'threadshelf-content-v2');assert.equal(reference.version,1);
 const pointer=JSON.parse(await fs.readFile(path.join(dataDir,'local-storage-v2/current.json'),'utf8')).value;
 assert.equal(pointer.format,'threadshelf-local-storage-v2');assert.equal(pointer.version,2);assert.equal(pointer.profile,profile);
 await service.shutdown();
 const audit=[];
 const capture=async()=>captureReader(dataDir,{workspace,onAccess:entry=>audit.push(entry)});
 const report=snapshot=>buildReport(normalizeConversations(snapshot.conversations,{sourceId:snapshot.sourceId}).conversations,{timeZone:'UTC',range:'all'},{now:Date.UTC(2026,9,13)});
 const baselineSnapshot=await capture(),baselineReport=report(baselineSnapshot);
 service=await new ApplicationService({dataDir}).init();
 const reopened=await inspect(service,id);
 assert.deepEqual(reopened,original,'reopening the archive must preserve content, passages, source and reading identities');
 const storageBefore=await treeHashes(path.join(dataDir,'local-storage-v2'));
 const readingBefore=await fs.readFile(path.join(dataDir,'reading-v2.json')).catch(()=>null);
 const currentSnapshot=await capture();
 assert.deepEqual(currentSnapshot.conversations,baselineSnapshot.conversations);
 assert.deepEqual(report(currentSnapshot),baselineReport);
 for(let i=0;i<3;i++){
   const returned=await service.handle('thread',{mode:'local',id});
   assert.equal(hash(returned),original.threadHash);
   await service.handle('search',{mode:'local',q:'Exact',searchMode:'keyword'});
 }
 const concurrent=await captureReader(dataDir,{workspace,onAccess:entry=>audit.push(entry),fault:async phase=>{
   if(phase==='object-copied')assert.equal(hash(await service.handle('thread',{mode:'local',id})),original.threadHash);
 }});
 assert.deepEqual(concurrent.conversations,currentSnapshot.conversations);
 assert.deepEqual(report(concurrent),baselineReport);
 assert.deepEqual(await treeHashes(path.join(dataDir,'local-storage-v2')),storageBefore,'capture and reading must never rewrite archived bytes');
 assert.deepEqual(await fs.readFile(path.join(dataDir,'reading-v2.json')).catch(()=>null),readingBefore);
 assert.deepEqual(await inspect(service,id),original);
 assert.ok(audit.length>0);
 assert.ok(audit.every(x=>x.flags==='O_RDONLY'&&['read','list'].includes(x.operation)));
 assert.ok(audit.every(x=>!/settings|reading|bookmarks|activity|cache/i.test(x.relative)),'Analytics must not read excluded Reader state');
 const backup=path.join(root,'synthetic-backup.zip');
 await service.handle('manager.backup',{path:backup});
 const source=(await service.handle('manager.status')).collections.find(c=>c.name===doc.collection);
 await mutate(service,{operation:'rename',collectionId:source.id,name:'Renamed synthetic source'});
 await mutate(service,{operation:'copy',ids:[id],targetName:'Merge test',copyBookmarks:true});
 const destination=(await service.handle('manager.status')).collections.find(c=>c.name==='Merge test');
 const merged=await mutate(service,{operation:'merge',collectionIds:[destination.id],targetId:source.id});
 assert.equal((await service.handle('files',{mode:'local'})).total,1);
 const renamed=await service.handle('thread',{mode:'local',id});
 assert.equal(hash(renamed.turns),original.turnsHash);assert.equal(hash(renamed.raw),original.rawHash);
 assert.equal(hash(renamed.sourceIdentity),original.sourceHash);
 assert.equal((await service.handle('bootstrap')).reading.positions[key].turnIndex,8);
 await service.handle('manager.restore.preview',{path:backup});await service.handle('manager.restore',{path:backup});
 await service.shutdown();service=await new ApplicationService({dataDir}).init();
 assert.deepEqual(await inspect(service,id),original,'backup/restore must preserve original source/reading/passage identities');
 const restored=await capture();assert.deepEqual(restored.conversations,baselineSnapshot.conversations);assert.deepEqual(report(restored),baselineReport);
 assert.equal((await service.handle('manager.maintenance',{operation:'verify'})).ok,true);
 let committedDuringCapture=false;
 const whileWriting=await captureReader(dataDir,{workspace,onAccess:entry=>audit.push(entry),fault:async phase=>{
   if(phase==='catalog-copied'&&!committedDuringCapture){committedDuringCapture=true;await service.commitMutation(service.store.prepareUpsert({...structuredClone(doc),conversationKey:'synthetic-concurrent-write',sourceIdentity:{kind:'native',provider:'openai',conversationKey:'synthetic-concurrent-write'},title:'Synthetic concurrent write'}));}
 }});
 assert.equal(committedDuringCapture,true);assert.equal(whileWriting.stale,true);
 assert.deepEqual(whileWriting.conversations,restored.conversations,'a concurrently committed journal record must not corrupt the selected snapshot');
 assert.equal((await capture()).conversations.length,2,'the next capture must see the committed Reader update');
 assert.equal(hash((await service.handle('thread',{mode:'local',id})).turns),original.turnsHash);
 console.log(JSON.stringify({synthetic:true,profile,schema:original.schema,threadHash:original.threadHash,turnsHash:original.turnsHash,rawHash:original.rawHash,passagesHash:original.passagesHash,analyticsReportHash:hash(baselineReport),analyticsReadOnlyAccesses:audit.length,sourceArchive:true,backupRestore:true,renameMerge:true,concurrentJournalWrite:true,mergeRemoved:merged.removedIds?.length??0}));
});
