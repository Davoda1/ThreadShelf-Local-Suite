import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { constants } from 'node:fs';
import { SourceAccess, assertOutputOutsideSource } from '../src/core/source-access.mjs';
import { captureReader, observeReader } from '../src/core/reader-capture.mjs';
import { fixture, hash } from './helpers/reader-fixture.mjs';

async function setup(t,options){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'analytics-source-test-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const f=await fixture(directory,options);return {...f,directory,workspace:path.join(directory,'Analytics work')};}
const inside=(root,target)=>{const rel=path.relative(root,target);return !rel.startsWith('..')&&!path.isAbsolute(rel);};
async function fingerprint(root){const values=[];async function walk(directory){for(const item of await fs.readdir(directory,{withFileTypes:true})){const filename=path.join(directory,item.name);if(item.isDirectory())await walk(filename);else values.push([path.relative(root,filename),hash(await fs.readFile(filename))]);}}await walk(root);return values.sort();}
async function auditCapture(source,fn){source=await fs.realpath(source);const writes=[],reads=[],originals={};for(const name of ['open','writeFile','appendFile','mkdir','rm','rename','unlink','truncate','chmod','chown','link','symlink','copyFile']){
  originals[name]=fs[name];fs[name]=async(...args)=>{for(const argument of args.slice(0,name==='rename'||name==='copyFile'||name==='link'?2:1))if(typeof argument==='string'){const resolved=await fs.realpath(argument).catch(()=>path.resolve(argument));if(inside(source,resolved)){if(name==='open'){const flag=args[1];if(typeof flag==='number'?(flag&(constants.O_WRONLY|constants.O_RDWR|constants.O_CREAT|constants.O_TRUNC|constants.O_APPEND))!==0:flag!=='r')writes.push({name,path:resolved,flag});else reads.push({name,path:resolved});}else writes.push({name,path:resolved});}}return originals[name](...args);};
  }try{const result=await fn();return {result,writes,reads};}finally{for(const [name,method]of Object.entries(originals))fs[name]=method;}
}
for(const profile of ['7z','zip6'])test(`${profile}: capture reads only allowed files, emits no source mutations or excluded analytics`,async t=>{
  const f=await setup(t,{profile}),before=await fingerprint(f.source),events=[];
  const {result,writes}=await auditCapture(f.source,()=>captureReader(f.source,{workspace:f.workspace,onAccess:e=>events.push(e)}));
  assert.equal(result.conversations.length,1);assert.equal(result.collections.length,1);assert.equal(result.conversations[0].collectionIds[0],'collection-one');assert.equal(result.conversations[0].turns[0].user,'One synthetic question');assert.equal(result.conversations[0].raw.mapping.node.message.author.role,'user');
  assert.equal(JSON.stringify(result).includes('EXCLUDED-READING-SENTINEL'),false);assert.equal(JSON.stringify(result).includes('copyBookmarks'),false);assert.deepEqual(writes,[]);assert.deepEqual(await fingerprint(f.source),before);assert.ok(events.length>=6);assert.ok(events.every(e=>e.flags==='O_RDONLY'&&!/settings|reading-v2|activity|vectors|search/.test(e.relative)));assert.deepEqual(await fs.readdir(f.workspace),[]);
});
test('reading-only pointer publication does not invalidate analytics identity',async t=>{const f=await setup(t),before=await observeReader(f.source);await f.updateReading();const after=await observeReader(f.source);assert.equal(before.identity,after.identity);});
test('journal manager operations are replayed exactly and policy data are excluded',async t=>{
  const f=await setup(t);await f.append({kind:'archive',copyBookmarks:true,mutation:{version:1,kind:'manage',opId:'rename-op',baseRevision:1,at:'2026-01-02',action:'rename',collectionId:'collection-one',name:'Renamed collection',ids:[],removedCollections:[]}});
  await f.append({kind:'archive',copyBookmarks:true,mutation:{version:1,kind:'manage',opId:'copy-op',baseRevision:2,at:'2026-01-03',action:'copy',target:{id:'collection-two',name:'Copy destination',create:true},ids:['local-one'],copyIds:{'local-one':'local-two'},copyBookmarks:true,removedCollections:[]}});
  await f.append({kind:'clearIndex'});
  const result=await captureReader(f.source,{workspace:f.workspace});assert.equal(result.commit.sequence,3);assert.equal(result.conversations.length,2);assert.deepEqual(result.collections.map(k=>k.name).sort(),['Copy destination','Renamed collection']);assert.equal(JSON.stringify(result).includes('copyBookmarks'),false);
});
test('clear and delete operations maintain catalog revision semantics',async t=>{const f=await setup(t);await f.append({kind:'archive',mutation:{version:1,kind:'manage',opId:'clear-op',baseRevision:1,at:'2026-01-03',action:'clear',count:1,collectionCount:1,ids:[],removedCollections:[]}});const result=await captureReader(f.source,{workspace:f.workspace});assert.deepEqual(result.conversations,[]);assert.deepEqual(result.collections,[]);});
test('unknown journal operation or invalid checksum fails closed',async t=>{
  const f=await setup(t);await f.append({kind:'future-operation'});await assert.rejects(captureReader(f.source,{workspace:f.workspace}),/Unknown committed/);assert.deepEqual(await fs.readdir(f.workspace),[]);await f.corruptPointer();await assert.rejects(observeReader(f.source),/publication checksum/);
});
test('generation replacement retries; missing/reclaimed members never produce partial results',async t=>{
  const f=await setup(t);let raced=false;const result=await captureReader(f.source,{workspace:f.workspace,fault:async phase=>{if(phase==='catalog-copied'&&!raced){raced=true;await f.republishGeneration();}}});assert.equal(result.attempts,2);assert.equal(result.conversations.length,1);
  const object=f.ref.header.blocks[0];await fs.unlink(path.join(f.root,'objects',object.file));await assert.rejects(captureReader(f.source,{workspace:f.workspace,maxAttempts:2}),{code:'SOURCE_RETRY_EXHAUSTED'});assert.deepEqual(await fs.readdir(f.workspace),[]);
});
test('advancing journal after selected boundary gives a complete explicitly stale snapshot',async t=>{
  const f=await setup(t);const result=await captureReader(f.source,{workspace:f.workspace,fault:async phase=>{if(phase==='catalog-copied')await f.append({kind:'archive',mutation:{version:1,kind:'manage',opId:'later-op',baseRevision:1,at:'2026-01-03',action:'rename',collectionId:'collection-one',name:'Later name',ids:[],removedCollections:[]}});}});assert.equal(result.stale,true);assert.equal(result.commit.sequence,0);assert.equal(result.collections[0].name,'Mixed collection');assert.notEqual(result.snapshotId,result.observedIdentity);
});
test('cancellation and disk-full failures clean only owned work and retain source bytes',async t=>{
  const f=await setup(t),before=await fingerprint(f.source),controller=new AbortController();await assert.rejects(captureReader(f.source,{workspace:f.workspace,signal:controller.signal,fault:phase=>{if(phase==='object-copied')controller.abort();}}),{name:'AbortError'});assert.deepEqual(await fs.readdir(f.workspace),[]);
  await assert.rejects(captureReader(f.source,{workspace:f.workspace,fault:phase=>{if(phase==='catalog-copied')throw Object.assign(new Error('Synthetic disk full'),{code:'ENOSPC'});}}),{code:'ENOSPC'});assert.deepEqual(await fs.readdir(f.workspace),[]);assert.deepEqual(await fingerprint(f.source),before);
});
test('source/output traversal, symlink and hard-link aliases are rejected before content reads',async t=>{
  const f=await setup(t),source=await SourceAccess.open(f.source),events=[];for(const relative of ['settings.json','../settings.json','records/../current.json','objects/../../reading-v2.json'])await assert.rejects(source.read(relative),{code:'SOURCE_EXCLUDED'});
  await assert.rejects(assertOutputOutsideSource(path.join(f.source,'report.html'),source),{code:'SOURCE_OUTPUT_OVERLAP'});await assert.rejects(assertOutputOutsideSource(f.directory,source),{code:'SOURCE_OUTPUT_OVERLAP'});
  await assert.rejects(assertOutputOutsideSource(path.join(f.source,'report.html'),[f.root]),{code:'SOURCE_OUTPUT_OVERLAP'});
  if(process.platform!=='win32'){const alias=path.join(f.directory,'linked work');await fs.symlink(f.source,alias);await assert.rejects(assertOutputOutsideSource(path.join(alias,'report.html'),source),/Symlink/);const object=f.ref.header.blocks[0],objectPath=path.join(f.root,'objects',object.file);await fs.unlink(objectPath);await fs.link(path.join(f.source,'reading-v2.json'),objectPath);const access=await SourceAccess.open(f.source,{onAccess:e=>events.push(e)});await assert.rejects(access.read(`objects/${object.file}`),/hard-link/);assert.equal(events.length,0);}
});
test('filesystem-read-only source still captures without an ownership lease',async t=>{
  const f=await setup(t);async function mode(directory,readOnly){for(const entry of await fs.readdir(directory,{withFileTypes:true})){const p=path.join(directory,entry.name);if(entry.isDirectory())await mode(p,readOnly);else await fs.chmod(p,readOnly?0o444:0o600);}await fs.chmod(directory,readOnly?0o555:0o700);}await mode(f.source,true);try{const events=[];const result=await captureReader(f.source,{workspace:f.workspace,onAccess:e=>events.push(e)});assert.equal(result.conversations.length,1);assert.ok(!events.some(e=>/writer|gate/.test(e.relative)));}finally{await mode(f.source,false);}
});
test('disconnected source continues to protect report destinations',async t=>{const f=await setup(t);await fs.rename(f.source,f.source+' disconnected');await assert.rejects(assertOutputOutsideSource(path.join(f.source,'report.html'),[f.source]),{code:'SOURCE_OUTPUT_OVERLAP'});assert.equal(await assertOutputOutsideSource(path.join(f.directory,'external-report.html'),[f.source]),path.join(await fs.realpath(f.directory),'external-report.html'));});
test('unregistered Reader profile and renamed storage destinations are rejected using metadata only',async t=>{const f=await setup(t);await assert.rejects(assertOutputOutsideSource(path.join(f.source,'unregistered-report.html'),[]),{code:'SOURCE_OUTPUT_OVERLAP'});await assert.rejects(assertOutputOutsideSource(path.join(f.root,'subdir','report.json'),[]),{code:'SOURCE_OUTPUT_OVERLAP'});const renamed=path.join(f.directory,'Renamed storage');await fs.rename(f.root,renamed);await assert.rejects(assertOutputOutsideSource(path.join(renamed,'report.html'),[]),{code:'SOURCE_OUTPUT_OVERLAP'});});
