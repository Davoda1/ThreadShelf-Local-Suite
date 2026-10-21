import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { standardReaderProfile, detectStandardReader } from '../src/core/reader-discovery.mjs';
import { AnalyticsService } from '../src/core/application-service.mjs';
import { observeReader } from '../src/core/reader-capture.mjs';
import { fixture, hash } from './helpers/reader-fixture.mjs';

async function setup(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'analytics-discovery-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const config=path.join(directory,'Config árvíz'),f=await fixture(config,{sourceName:'ThreadShelf Local Reader'});return {...f,directory,config,own:path.join(directory,'Analytics own'),options:{platform:process.platform,env:{[process.platform==='win32'?'APPDATA':'XDG_CONFIG_HOME']:config},home:path.join(directory,'Home')}};}
async function snapshot(root){const values=[];async function walk(folder){for(const entry of await fs.readdir(folder,{withFileTypes:true})){const p=path.join(folder,entry.name);if(entry.isDirectory())await walk(p);else values.push([path.relative(root,p),hash(await fs.readFile(p))]);}}await walk(root);return values.sort();}
async function readAudit(source,fn){source=await fs.realpath(source);const original=fs.open,access=[];fs.open=async(file,flags,...args)=>{const actual=await fs.realpath(file).catch(()=>path.resolve(file));const rel=path.relative(source,actual);if(!rel.startsWith('..')&&!path.isAbsolute(rel))access.push({file:rel,flags});return original(file,flags,...args);};try{return {result:await fn(),access};}finally{fs.open=original;}}
const next=()=>new Promise(resolve=>setImmediate(resolve));
async function settled(app){await next();if(app.discoveryTask)await app.discoveryTask;}

test('known profiles exactly match Reader desktop paths, with no speculative library suffix',()=>{
  assert.equal(standardReaderProfile({platform:'win32',env:{APPDATA:'C:\\Users\\Name\\AppData\\Roaming'},home:'C:\\Users\\Fallback'}),'C:\\Users\\Name\\AppData\\Roaming\\ThreadShelf Local Reader');
  assert.equal(standardReaderProfile({platform:'win32',env:{},home:'C:\\Users\\Name'}),'C:\\Users\\Name\\AppData\\Roaming\\ThreadShelf Local Reader');
  assert.equal(standardReaderProfile({platform:'linux',env:{XDG_CONFIG_HOME:'/custom/config'},home:'/home/user'}),'/custom/config/ThreadShelf Local Reader');
  assert.equal(standardReaderProfile({platform:'linux',env:{},home:'/home/user'}),'/home/user/.config/ThreadShelf Local Reader');
  assert.equal(standardReaderProfile({platform:'linux',env:{XDG_CONFIG_HOME:'relative/untrusted'},home:'/home/user'}),'/home/user/.config/ThreadShelf Local Reader');
  assert.equal(standardReaderProfile({platform:'darwin',env:{},home:'/Users/user'}),null);
});
test('discovery validates only the archive publication, with zero mutations or excluded file reads',async t=>{
  const f=await setup(t),before=await snapshot(f.source),events=[];
  const {result,access}=await readAudit(f.source,()=>detectStandardReader({...f.options,analyticsRoot:f.own,onAccess:event=>events.push(event)}));
  assert.equal(result.status,'available');assert.equal(result.path,await fs.realpath(f.source));assert.equal(result.archiveRoot,await fs.realpath(f.root));assert.ok(result.readerSourceId);assert.deepEqual(events.map(e=>e.relative),['current.json',`records/${f.epoch}/head.json`]);
  assert.ok(access.length>0);assert.ok(access.every(e=>typeof e.flags==='number'&&(e.flags&(constants.O_WRONLY|constants.O_RDWR|constants.O_CREAT|constants.O_TRUNC|constants.O_APPEND))===0));assert.ok(access.every(e=>!/(?:settings|interface|appearance|layout|reading-v2|activity|search)/.test(e.file)));assert.deepEqual(await snapshot(f.source),before);assert(!JSON.stringify(result).includes('EXCLUDED-READING-SENTINEL'));assert.equal(await fs.access(f.own).then(()=>true,()=>false),false);
});
test('absent, malformed, unavailable and unsupported standard paths are harmless',async t=>{
  const f=await setup(t);let probes=0;const absent=await detectStandardReader({...f.options,env:{[process.platform==='win32'?'APPDATA':'XDG_CONFIG_HOME']:path.join(f.directory,'No config')},probe:()=>{probes++;throw new Error('Must not probe absent path');}});assert.equal(absent.status,'absent');assert.equal(probes,0);
  await f.corruptPointer();assert.equal((await detectStandardReader(f.options)).status,'invalid');
  const unavailable=await detectStandardReader({...f.options,probe:()=>{throw Object.assign(new Error('Synthetic permission failure'),{code:'EACCES'});}});assert.equal(unavailable.status,'unavailable');assert.equal(unavailable.available,false);
  assert.equal((await detectStandardReader({platform:'darwin',home:f.directory,env:{}})).status,'unsupported');
});
test('standard source links and Analytics/source overlap are rejected before manifest reads',async t=>{
  const f=await setup(t);let probes=0;const overlap=await detectStandardReader({...f.options,analyticsRoot:path.join(f.source,'Analytics must not write here'),probe:()=>{probes++;return {};}});assert.equal(overlap.status,'unsafe');assert.equal(probes,0);
  if(process.platform!=='win32'){const original=f.source+' original';await fs.rename(f.source,original);await fs.symlink(original,f.source,'dir');const linked=await detectStandardReader({...f.options,probe:()=>{probes++;return {};}});assert.equal(linked.status,'unsafe');assert.equal(probes,0);}
});
test('automatic discovery registers/captures once and recognizes manual profile/storage-root aliases',async t=>{
  const f=await setup(t),app=await new AnalyticsService(f.own,{discoveryOptions:f.options}).init();t.after(()=>app.close());const before=await snapshot(f.source);
  const automatic=await app.discoverReader({automatic:true});assert.equal(automatic.status,'registered');assert.equal(app.state.sources.length,1);assert.equal(app.state.sources[0].discoveredAutomatically,true);assert.equal(app.payload().conversations.length,1);
  const id=app.state.sources[0].id;await app.registerSource('reader',f.root);assert.equal(app.state.sources.length,1);assert.equal(app.state.sources[0].id,id);const repeated=await app.discoverReader();assert.equal(repeated.sourceId,id);assert.equal(app.state.sources.length,1);assert.deepEqual(await snapshot(f.source),before);assert(!JSON.stringify(app.payload().conversations).includes('EXCLUDED-READING-SENTINEL'));
});
test('removal is respected across restarts without Reader reads; explicit detection restores the source',async t=>{
  const f=await setup(t);let app=await new AnalyticsService(f.own,{discoveryOptions:f.options}).init();t.after(()=>app.close());await app.discoverReader({automatic:true});await app.removeSource(app.state.sources[0].id);assert.equal(app.discovery.status,'suppressed');await app.close();
  let probes=0;app=await new AnalyticsService(f.own,{discoveryOptions:{...f.options,probe:()=>{probes++;return observeReader(f.source);}}}).init();const {access}=await readAudit(f.source,async()=>{app.startReaderDiscovery();await settled(app);});assert.equal(app.discovery.status,'suppressed');assert.equal(probes,0);assert.deepEqual(access,[]);assert.equal(app.state.sources.length,0);
  await app.discoverReader();assert.equal(app.discovery.status,'registered');assert.equal(app.state.sources.length,1);assert.equal(probes,1);assert.deepEqual(app.state.readerDiscovery.dismissedPaths,[]);
});
test('discovery shows the standard Reader while preserving an existing custom source',async t=>{
  const f=await setup(t),custom=await fixture(path.join(f.directory,'Custom source'));const app=await new AnalyticsService(f.own,{discoveryOptions:f.options}).init();t.after(()=>app.close());await app.registerSource('reader',custom.root);const customId=app.state.sources[0].id;await app.discoverReader({automatic:true});assert.equal(app.state.sources.length,2);assert.ok(app.state.sources.some(s=>s.id===customId));assert.equal(app.discovery.path,await fs.realpath(f.source));assert.ok(app.discovery.sourceId);
});
test('startup discovery does not delay initialization/bootstrap while validation and capture run asynchronously',async t=>{
  const f=await setup(t);let release,signalEntered,entered=false;const gate=new Promise(resolve=>{release=resolve;}),enteredGate=new Promise(resolve=>{signalEntered=resolve;});const app=await new AnalyticsService(f.own,{discoveryOptions:{...f.options,probe:async()=>{entered=true;signalEntered();await gate;return observeReader(f.source);}}}).init();t.after(()=>app.close());assert.equal(entered,false);assert.equal(app.payload().discovery.status,'not-started');
  const returned=app.startReaderDiscovery();assert.equal(returned,undefined);assert.equal(entered,false);await enteredGate;assert.equal(entered,true);assert.equal(app.payload().discovery.status,'checking');assert.equal(app.state.sources.length,0);assert.equal(app.payload().job.running,false);release();await settled(app);assert.equal(app.discovery.status,'registered');assert.equal(app.payload().conversations.length,1);
});
test('automatic detection defers safely during another analysis and pending startup stops on close',async t=>{
  const f=await setup(t),app=await new AnalyticsService(f.own,{discoveryOptions:f.options}).init();t.after(()=>app.close());app.job={running:true};app.startReaderDiscovery();await settled(app);assert.equal(app.discovery.status,'busy');assert.equal(app.state.sources.length,0);app.job={running:false};await app.discoverReader({automatic:true});assert.equal(app.state.sources.length,1);
  let probes=0;const closed=await new AnalyticsService(path.join(f.directory,'Closed own'),{discoveryOptions:{...f.options,probe:()=>{probes++;return {};}}}).init();closed.startReaderDiscovery();await closed.close();await next();assert.equal(probes,0);assert.equal(closed.state.sources.length,0);
});

test('configured path aliases remain suppressed without probing and explicit registration clears both spellings',async t=>{
  const f=await setup(t),app=await new AnalyticsService(f.own,{discoveryOptions:f.options}).init();t.after(()=>app.close());
  await app.discoverReader({automatic:true});const canonical=app.state.sources[0].path;
  const aliasConfig=path.join(f.directory,'Configured alias'),aliasProfile=path.join(aliasConfig,'ThreadShelf Local Reader');
  app.discoveryOptions={...f.options,env:{[process.platform==='win32'?'APPDATA':'XDG_CONFIG_HOME']:aliasConfig},probe:()=>{throw new Error('Removed Reader must not be probed');}};
  const realpath=fs.realpath;fs.realpath=async(file,...args)=>path.resolve(file)===aliasProfile?canonical:realpath(file,...args);
  try{
    await app.removeSource(app.state.sources[0].id);assert.equal(app.state.readerDiscovery.dismissedPaths.length,2);
    await app.discoverReader({automatic:true});assert.equal(app.discovery.status,'suppressed');assert.equal(app.state.sources.length,0);
    await app.registerSource('reader',f.source);assert.deepEqual(app.state.readerDiscovery.dismissedPaths,[]);assert.deepEqual(app.state.readerDiscovery.dismissedSourceIds,[]);
  }finally{fs.realpath=realpath;}
});
