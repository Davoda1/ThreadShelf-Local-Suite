import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { captureReader } from '../src/core/reader-capture.mjs';
import { AnalyticsService } from '../src/core/application-service.mjs';
import { currentReaderFixture, syntheticDocument, fingerprint } from './helpers/reader-cleanup-fixture.mjs';

async function setup(t,options){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'analytics-reader-cleanup-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));return{...await currentReaderFixture(directory,options),directory,workspace:path.join(directory,'Analytics capture work')};}
async function checkedCapture(f,ids){const before=await fingerprint(f.source),result=await captureReader(f.source,{workspace:f.workspace});assert.deepEqual(result.conversations.map(d=>d.id).sort(),[...ids].sort());assert.equal(result.collections.reduce((sum,c)=>sum+c.count,0),ids.length);assert.deepEqual(await fingerprint(f.source),before,'capture must leave every source file byte-identical');assert.deepEqual(await fs.readdir(f.workspace),[],'temporary captured bodies are removed');return result;}
const deduplicate=(extra={})=>({kind:'manage',action:'deduplicate',ids:[],historyIds:[],inspectedIds:[],replacements:[],remap:{},turnRemap:{},removedCollections:[],...extra});

for(const profile of ['7z','zip6'])for(const legacy of [false,true])test(`${profile}: retained deduplicationHistory validates ${legacy?'legacy included':'current excluded'} content fingerprint`,async t=>{
  const document=syntheticDocument('history',{deduplicationHistory:[{title:'Synthetic discarded predecessor',turns:[{user:'Historical question',ai:'Historical answer'}]}]});
  const f=await setup(t,{profile,documents:[{id:'keep',document,legacy,cleanupVersion:0}]});const result=await checkedCapture(f,['keep']);assert.equal(result.conversations[0].title,document.title);assert.equal(result.conversations[0].turns.length,1);
  // A second observation models reopening Analytics against the unchanged publication.
  await checkedCapture(f,['keep']);
});

test('deduplicate removes losers, replaces history-bearing retained content and advances revision once',async t=>{
  const document=syntheticDocument('shared',{deduplicationHistory:[{discarded:true}]}),f=await setup(t,{documents:[{id:'keep',document,cleanupVersion:0},{id:'loser',document,cleanupVersion:0}]});
  const replacement=await f.descriptor('keep',syntheticDocument('shared'));
  await f.appendMutation(deduplicate({ids:['loser'],historyIds:['keep'],inspectedIds:['keep','loser'],replacements:[replacement],remap:{loser:'keep'}}));await f.rename(2);
  const result=await checkedCapture(f,['keep']);assert.equal(result.conversations[0].deduplicationHistory,undefined);assert.equal(result.collections[0].name,'Renamed after cleanup');
});
test('deduplicate inspected-only cleanup does not advance revision and marks same-hash rows current',async t=>{
  const f=await setup(t,{documents:[{id:'keep',document:syntheticDocument('keep'),cleanupVersion:0}]});await f.appendMutation(deduplicate({inspectedIds:['keep']}));
  await f.appendMutation({kind:'upsert',...f.rows[0],baseRevision:1,skip:false,removeIds:[]});await f.rename(1);await checkedCapture(f,['keep']);
});
test('removal-only skipped upsert requires no retained id, hash, document or content objects',async t=>{
  const f=await setup(t);await f.appendMutation({kind:'upsert',skip:true,collection:f.rows[0].collection,removeIds:['keep']});await f.rename(2);await checkedCapture(f,[]);
});
test('same-content upsert applies removeIds and advances exactly once before following operation',async t=>{
  const document=syntheticDocument('shared'),f=await setup(t,{documents:[{id:'keep',document},{id:'loser',document}]});await f.appendMutation({kind:'upsert',...f.rows[0],skip:false,removeIds:['loser']});await f.rename(2);await checkedCapture(f,['keep']);
});
for(const cleanupColumn of [true,false])test(`same-hash current Reader rewrite of legacy row ${cleanupColumn?'with':'without'} cleanup column advances revision`,async t=>{
  const f=await setup(t,{cleanupColumn,documents:[{id:'keep',document:syntheticDocument('keep'),cleanupVersion:0}]});await f.appendMutation({kind:'upsert',...f.rows[0],skip:false,removeIds:[]});await f.rename(2);await checkedCapture(f,['keep']);
});
test('legacy catalog and old same-hash upsert preserve historical no-op revision semantics',async t=>{
  const f=await setup(t,{cleanupColumn:false}),{nativeIdentity,cleanupVersion,...row}=f.rows[0];await f.appendMutation({kind:'upsert',...row});await f.rename(1);await checkedCapture(f,['keep']);
});
test('current same-hash upsert is a no-op while changed payload and new conversation are writes',async t=>{
  const f=await setup(t);await f.appendMutation({kind:'upsert',...f.rows[0],skip:false,removeIds:[]});const updated=await f.descriptor('keep',syntheticDocument('keep',{title:'Updated synthetic title'}));await f.appendMutation({kind:'upsert',...updated,skip:false,removeIds:[],baseRevision:1});const added=await f.descriptor('new',syntheticDocument('new'));await f.appendMutation({kind:'upsert',...added,skip:false,removeIds:[],baseRevision:2});await f.rename(3);const result=await checkedCapture(f,['keep','new']);assert.equal(result.conversations.find(d=>d.id==='keep').title,'Updated synthetic title');
});
for(const [label,mutation] of [
  ['unknown manager operation',()=>({kind:'manage',action:'future-cleanup',ids:[],removedCollections:[]})],
  ['self-removing upsert',f=>({kind:'upsert',...f.rows[0],removeIds:['keep']})],
  ['missing removal candidate',f=>({kind:'upsert',skip:true,collection:f.rows[0].collection,removeIds:['absent']})],
  ['deduplication removing retained replacement',f=>deduplicate({ids:['keep'],replacements:[f.rows[0]]})],
  ['missing retained deduplication target',()=>deduplicate({ids:['keep'],remap:{keep:'absent'}})],
  ['unknown deduplication candidate',()=>deduplicate({ids:['absent']})],
  ['malformed replacement descriptor',f=>deduplicate({replacements:[{...f.rows[0],contentRef:{}}]})]
])test(`${label} fails closed without changing source files`,async t=>{
  const f=await setup(t);await f.appendMutation(mutation(f));const before=await fingerprint(f.source);await assert.rejects(captureReader(f.source,{workspace:f.workspace}),{code:'SOURCE_INTEGRITY'});assert.deepEqual(await fingerprint(f.source),before);assert.deepEqual(await fs.readdir(f.workspace),[]);
});
test('metadata-compatible fingerprint fallback still rejects an altered content identity',async t=>{
  const f=await setup(t,{documents:[{id:'keep',document:syntheticDocument('history',{deduplicationHistory:[{old:true}]})}]});await f.rewriteCatalog(db=>db.prepare('UPDATE conversations SET content_hash=?').run('0'.repeat(64)));const before=await fingerprint(f.source);await assert.rejects(captureReader(f.source,{workspace:f.workspace}),{code:'SOURCE_INTEGRITY'});assert.deepEqual(await fingerprint(f.source),before);
});
test('packed object checksum remains mandatory for retained-history input',async t=>{
  const f=await setup(t,{documents:[{id:'keep',document:syntheticDocument('history',{deduplicationHistory:[{old:true}]})}]});const object=f.rows[0].contentRef.header.blocks[0],filename=path.join(f.root,'objects',object.file),bytes=await fs.readFile(filename);bytes[bytes.length-1]^=1;await fs.writeFile(filename,bytes);const before=await fingerprint(f.source);await assert.rejects(captureReader(f.source,{workspace:f.workspace}),{code:'SOURCE_INTEGRITY'});assert.deepEqual(await fingerprint(f.source),before);
});
test('expanded object checksum remains mandatory with valid compressed descriptor and history fallback',async t=>{
  const f=await setup(t,{documents:[{id:'keep',document:syntheticDocument('history',{deduplicationHistory:[{old:true}]})}]});const ref=structuredClone(f.rows[0].contentRef),object=ref.header.blocks[0],original=path.join(f.root,'objects',object.file);object.sha256='0'.repeat(64);object.file=`${object.sha256}.${object.packedSha256}.zip`;await fs.copyFile(original,path.join(f.root,'objects',object.file));await f.rewriteCatalog(db=>db.prepare('UPDATE conversations SET content_ref=?').run(JSON.stringify(ref)));const before=await fingerprint(f.source);await assert.rejects(captureReader(f.source,{workspace:f.workspace}),/expanded content checksum/);assert.deepEqual(await fingerprint(f.source),before);
});
for(const action of ['upsert','deduplicate'])test(`${action} rejects cleanup crossing collection boundaries`,async t=>{
  const f=await setup(t,{documents:[{id:'keep',document:syntheticDocument('keep')},{id:'other',document:syntheticDocument('other')}]});await f.rewriteCatalog(db=>{db.prepare('INSERT INTO collections VALUES(?,?,?,?)').run('collection-other','Other collection','2026-01-01','2026-01-01');db.prepare('UPDATE conversations SET collection_id=?,collection=? WHERE id=?').run('collection-other','Other collection','other');});await f.appendMutation(action==='upsert'?{kind:'upsert',skip:true,collection:f.rows[0].collection,removeIds:['other']}:deduplicate({ids:['other'],remap:{other:'keep'}}));const before=await fingerprint(f.source);await assert.rejects(captureReader(f.source,{workspace:f.workspace}),{code:'SOURCE_INTEGRITY'});assert.deepEqual(await fingerprint(f.source),before);
});
test('full Analytics worker imports retained history and preserves completed memory/disk data after invalid refresh',async t=>{
  const f=await setup(t,{documents:[{id:'keep',document:syntheticDocument('history',{deduplicationHistory:[{old:true}]})}]});const own=path.join(f.directory,'Analytics app data');let app=await new AnalyticsService(own).init();t.after(()=>app?.close());const before=await fingerprint(f.source),source=await app.registerSource('reader',[f.source]);assert.equal(source.status,'ready');assert.equal(app.payload().conversations.length,1);assert.deepEqual(await fingerprint(f.source),before);const previous=JSON.stringify(app.payload().conversations),snapshotBefore=JSON.stringify(await app.storage.loadSnapshot(source.id));
  await f.appendMutation({kind:'manage',action:'unknown-cleanup',ids:[],removedCollections:[]});const invalidSource=await fingerprint(f.source);await app.refresh(source.id);assert.equal(source.status,'unavailable');assert.equal(source.stale,true);assert.equal(app.job.error.code,'SOURCE_INTEGRITY');assert.equal(JSON.stringify(app.payload().conversations),previous);assert.equal(JSON.stringify(await app.storage.loadSnapshot(source.id)),snapshotBefore);assert.deepEqual(await fingerprint(f.source),invalidSource);
  await app.close();app=await new AnalyticsService(own).init();assert.equal(app.payload().conversations.length,1);assert.equal(JSON.stringify(app.payload().conversations),previous);
});
