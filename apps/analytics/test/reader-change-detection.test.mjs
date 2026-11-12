import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { fixture,hash,id } from './helpers/reader-fixture.mjs';
import { encodeFile } from '../src/core/codec.mjs';
import { observeReaderAnalytical as observeReader } from '../src/core/reader-capture.mjs';
import { AnalyticsService } from '../src/core/application-service.mjs';

async function setup(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'analytics-freshness-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));return {...await fixture(directory,{profile:'zip6'}),directory};}
async function inventory(root){const files=[];async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else files.push([path.relative(root,p),hash(await fs.readFile(p))]);}}await walk(root);return files.sort();}
async function checkpoint(f,{profile='zip6',modify}={}){
  const catalog=path.join(f.directory,'synthetic-catalog.sqlite');if(modify){const db=new DatabaseSync(catalog);try{modify(db);}finally{db.close();}}
  const file=`${id()}.${profile==='7z'?'7z':'zip'}`;await encodeFile(catalog,path.join(f.root,'snapshots',file),{profile,maxBytes:1024*1024});
  const old=JSON.parse(await fs.readFile(path.join(f.root,'current.json'),'utf8')).value;
  const value={...old,file,profile,sequence:f.head.sequence,sha256:hash(await fs.readFile(path.join(f.root,'snapshots',file))),logicalBytes:(await fs.stat(catalog)).size,createdAt:new Date().toISOString()};
  await fs.writeFile(path.join(f.root,'current.json'),JSON.stringify({value,sha256:hash(JSON.stringify(value))}));
}

test('freshness ignores timestamps, private reading, no-op journal and checkpoint/codec maintenance',async t=>{
  const f=await setup(t),first=await observeReader(f.source);await f.updateReading();
  const fixed=new Date('2020-01-01T00:00:00Z');await fs.utimes(path.join(f.root,'current.json'),fixed,fixed);
  assert.equal((await observeReader(f.source)).identity,first.identity);
  await f.append({kind:'clearIndex'});let next=await observeReader(f.source);assert.equal(next.identity,first.identity);assert.notEqual(next.publicationIdentity,first.publicationIdentity);
  await checkpoint(f,{profile:'7z',modify:db=>{db.exec("UPDATE metadata SET value=value+10 WHERE key='revision'; UPDATE conversations SET updated_at='2026-11-11';");}});
  const before=await inventory(f.source);next=await observeReader(f.source);assert.equal(next.identity,first.identity);assert.notEqual(next.publicationIdentity,first.publicationIdentity);assert.deepEqual(await inventory(f.source),before);
});

test('same-length committed catalogue changes are detected even with preserved file timestamps',async t=>{
  const f=await setup(t),first=await observeReader(f.source);const headFile=path.join(f.root,'records',f.epoch,'head.json'),oldStat=await fs.stat(headFile);
  await f.append({kind:'archive',mutation:{version:1,kind:'manage',opId:'same-length-rename',baseRevision:1,at:'2026-01-02',action:'rename',collectionId:'collection-one',name:'Other collection',ids:[],removedCollections:[]}});
  await fs.utimes(headFile,oldStat.atime,oldStat.mtime);const next=await observeReader(f.source,{previous:{identity:first.identity,publicationIdentity:first.publicationIdentity}});
  assert.notEqual(next.identity,first.identity);
});

test('validated unchanged publications use only control reads; malformed controls and new unknown operations fail',async t=>{
  const f=await setup(t),first=await observeReader(f.source),events=[];
  const value=await observeReader(f.source,{previous:{identity:first.identity,publicationIdentity:first.publicationIdentity},onAccess:e=>events.push(e)});
  assert.equal(value.identity,first.identity);assert.deepEqual(events.map(e=>e.relative),['current.json',`records/${f.epoch}/head.json`]);
  await f.append({kind:'future-operation'});await assert.rejects(observeReader(f.source,{previous:{identity:first.identity,publicationIdentity:first.publicationIdentity}}),{code:'SOURCE_INTEGRITY'});
  await f.corruptPointer();await assert.rejects(observeReader(f.source,{previous:{identity:first.identity,publicationIdentity:first.publicationIdentity}}),{code:'SOURCE_INTEGRITY'});
});

test('application observation and refresh stay ready through maintenance, then flag real data change',async t=>{
  const f=await setup(t),app=await new AnalyticsService(path.join(f.directory,'Analytics')).init();t.after(()=>app.close());
  await app.registerSource('reader',f.source);const source=app.state.sources[0],identity=source.observedIdentity;
  await f.append({kind:'clearIndex'});await app.observe();assert.equal(source.status,'ready');assert.equal(source.stale,false);assert.equal(source.observedIdentity,identity);
  await app.refresh(source.id);assert.equal(app.job.status,'unchanged');assert.equal(source.status,'ready');
  await checkpoint(f,{profile:'7z'});await app.observe();assert.equal(source.status,'ready');assert.equal(source.stale,false);
  await f.append({kind:'archive',mutation:{version:1,kind:'manage',opId:'actual-rename',baseRevision:1,at:'2026-01-02',action:'rename',collectionId:'collection-one',name:'Real name',ids:[],removedCollections:[]}});
  await app.observe();assert.equal(source.status,'stale');assert.equal(source.stale,true);
  await app.refresh(source.id);assert.equal(source.status,'ready');assert.notEqual(source.observedIdentity,identity);
  await f.corruptPointer();await app.observe();assert.equal(source.status,'unavailable');assert.equal(source.stale,true);assert.equal(app.datasets.get(source.id).conversations.length,1);
});

test('older physical freshness tokens upgrade on refresh without resetting captures or losing prior results',async t=>{
  const f=await setup(t),own=path.join(f.directory,'Analytics legacy-token data');let app=await new AnalyticsService(own).init();t.after(()=>app?.close());
  await app.registerSource('reader',f.source);const sourceId=app.state.sources[0].id,stored=await app.storage.loadSnapshot(sourceId),physical=stored.source.snapshotId;
  // Older public captures used the physical publication token for freshness.
  stored.source.observedIdentity=physical;delete stored.source.publicationIdentity;
  await app.storage.saveSnapshot(sourceId,stored);Object.assign(app.state.sources[0],{observedIdentity:physical});delete app.state.sources[0].publicationIdentity;await app.persistState();await app.close();
  app=await new AnalyticsService(own).init();const source=app.state.sources[0],previous=JSON.stringify(app.payload().conversations),retained=JSON.stringify(await app.storage.loadSnapshot(sourceId));
  assert.equal(source.observedIdentity,physical);assert.equal(app.payload().conversations.length,1);assert((await app.storage.loadSnapshot(sourceId)).conversations[0].records.some(r=>typeof r.text==='string'&&r.text.length>0),'existing full-text captures remain usable');
  const pointer=path.join(f.root,'current.json'),original=await fs.readFile(pointer);await f.corruptPointer();await app.refresh(sourceId);
  assert.equal(source.status,'unavailable');assert.equal(JSON.stringify(app.payload().conversations),previous);assert.equal(JSON.stringify(await app.storage.loadSnapshot(sourceId)),retained,'failed first refresh preserves the older capture');
  await fs.writeFile(pointer,original);const before=await inventory(f.source);await app.refresh(sourceId);assert.equal(source.status,'ready');assert.equal(app.job.status,'complete');assert.notEqual(source.observedIdentity,physical);assert.equal(source.publicationIdentity,physical);
  assert.deepEqual((await app.storage.loadSnapshot(sourceId)).conversations.map(c=>c.records.map(r=>r.text)),stored.conversations.map(c=>c.records.map(r=>r.text)),'refresh retains public full-text capture semantics');
  await app.observe();assert.equal(source.status,'ready');assert.equal(source.stale,false);await app.refresh(sourceId);assert.equal(app.job.status,'unchanged');assert.deepEqual(await inventory(f.source),before,'freshness token upgrade does not modify the Reader');
});
