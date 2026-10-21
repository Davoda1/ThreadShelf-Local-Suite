#!/usr/bin/env node
// Run with ELECTRON_RUN_AS_NODE=1 and the shipped Linux Electron executable.
// The embedding fixture is deterministic; storage and SQLite are real.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {ZipReader,Uint8ArrayReader} from '@zip.js/zip.js';
const sourceRoot=fileURLToPath(new URL('..',import.meta.url));
const appRoot=process.env.READER_APP_ROOT?path.resolve(process.env.READER_APP_ROOT):sourceRoot;
const {ApplicationService}=await import(pathToFileURL(path.join(appRoot,'src/core/service.mjs')));
const root=await fs.mkdtemp(path.join(os.tmpdir(),'tslr-packaged-storage-'));
const dataDir=path.join(root,'profile with spaces Árvíztűrő'),filename=path.join(root,'readonly source 🧪.json');
const fixture={id:'packaged-storage',title:'A durable Unicode archive 🧪',messages:[{role:'user',content:'cobalt checkpoint and restore'},{role:'assistant',content:'Árvíztűrő tükörfúrógép'}]};
const passed=[],runtime={electron:process.versions.electron||null,node:process.versions.node,platform:process.platform},report={version:JSON.parse(await fs.readFile(path.join(appRoot,'package.json'),'utf8')).version,runtime,appRoot,passed,embedding:'deterministic three-dimensional fixture; real SQLite/vector storage'};
let service;
const key=id=>JSON.stringify({mode:'local',id});
const bootstrap=()=>service.handle('bootstrap');
const fakeRuntime=()=>({async call(operation,texts){return operation==='setup'?{dimension:3}:texts.map(()=>[1,.25,.125]);},async close(){}});
async function reopen(){await service.shutdown();service=await new ApplicationService({dataDir}).init();assert.equal((await service.handle('manager.status')).recoveryMode,undefined);service.searcher.runtimeFactory=fakeRuntime;}
async function members(file){const zip=new ZipReader(new Uint8ArrayReader(await fs.readFile(file)),{useWebWorkers:false});try{return (await zip.getEntries()).map(x=>x.filename);}finally{await zip.close();}}
try{
 await fs.writeFile(filename,JSON.stringify(fixture),{mode:0o444});const originalHash=createHash('sha256').update(await fs.readFile(filename)).digest('hex');
 service=await new ApplicationService({dataDir}).init();assert.equal((await bootstrap()).notice,'');assert.equal((await service.handle('manager.status')).storage.health,'ok');
 const imported=await service.handle('import.paths',{paths:[filename],collection:'Fresh import'});assert.equal(imported.imported,1);assert.deepEqual(imported.errors,[]);
 const item=(await service.handle('files',{mode:'local'})).files[0];assert.equal(item.title,fixture.title);
 await service.handle('settings.save',{values:{language:'hu',theme:'dark',uiPalette:'ocean',codeTheme:'vscode',pageSize:20}});
 await service.handle('reading.save',{key:key(item.id),position:{turnIndex:0,role:'user',offset:.32,ref:{mode:'local',...item}},bookmark:{turnIndex:0,role:'user',ref:{mode:'local',...item}}});
 passed.push('Fresh profile mounts, readonly Unicode export imports, and preferences/reading commit');
 service.searcher.runtimeFactory=fakeRuntime;await service.handle('semantic.setup');await service.handle('semantic.index');assert.equal((await service.handle('search.status')).needsIndexing,false);
 const originalThread=await service.handle('thread',{id:item.id});
 for(const profile of ['zip6','7z']){
  await service.handle('storage.convert',{profile});service.searcher.runtimeFactory=fakeRuntime;
  assert.equal((await service.handle('manager.status')).storage.profile,profile);
  assert.deepEqual(await service.handle('thread',{id:item.id}),originalThread);
  assert.equal((await service.handle('search',{mode:'local',q:'meaning',searchMode:'semantic'})).results[0].conversationId,item.id);
 }
 passed.push('Both real bundled codec conversions preserve the indexed archive and exact thread in shipped Electron runtime');
 const modelFile=path.join(dataDir,'search','models','preserved-model-sentinel');await fs.mkdir(path.dirname(modelFile),{recursive:true});await fs.writeFile(modelFile,'preserve optional model files');
 const backups=[];
 for(const includeIndex of [false,true]){const file=path.join(root,includeIndex?'with-index.zip':'without-index.zip');await service.handle('manager.backup',{path:file,includeIndex});const names=await members(file);assert.ok(names.includes('archive.sqlite'));assert.equal(names.includes('vectors.sqlite'),includeIndex);backups.push({file,includeIndex});}
 passed.push('Default and includeIndex backups contain the intended real SQLite databases');
 for(const operation of ['verify','compact','cleanup']){const result=await service.handle('manager.maintenance',{operation});assert.equal(result.ok,true);}
 passed.push('Integrity verification, compressed compaction and eligible temporary cleanup complete');
 await service.handle('manager.maintenance',{operation:'clearIndex'});assert.equal((await service.handle('search.status')).indexedPassages,0);assert.equal(await fs.readFile(modelFile,'utf8'),'preserve optional model files');
 for(const {file,includeIndex} of backups){
  await service.handle('manager.mutate',{operation:'clear'});assert.equal((await service.handle('files',{mode:'local'})).total,0);
  await service.handle('manager.restore.preview',{path:file});await service.handle('manager.restore',{path:file});
  assert.equal((await service.handle('files',{mode:'local'})).files[0].id,item.id);let reading=(await bootstrap()).reading;assert.equal(reading.positions[key(item.id)].offset,.32);assert.equal(reading.bookmarks.length,1);
  await reopen();assert.equal((await bootstrap()).settings.language,'hu');assert.equal((await bootstrap()).settings.uiPalette,'ocean');assert.equal((await bootstrap()).settings.codeTheme,'vscode');assert.equal((await bootstrap()).settings.pageSize,20);
  assert.equal((await service.handle('search',{mode:'local',q:'cobalt',searchMode:'keyword'})).results[0].conversationId,item.id);
  await service.vectors();const status=await service.handle('search.status');assert.equal(status.needsIndexing,!includeIndex);assert.equal(status.indexedPassages,includeIndex?2:0);
  if(includeIndex)assert.equal((await service.handle('search',{mode:'local',q:'meaning',searchMode:'semantic'})).results[0].conversationId,item.id);
  passed.push((includeIndex?'Indexed':'Archive-only')+' backup restores content, exact reading and preferences across restart; index state is accurate');
 }
 assert.equal(await fs.readFile(modelFile,'utf8'),'preserve optional model files');assert.equal(createHash('sha256').update(await fs.readFile(filename)).digest('hex'),originalHash);
 await service.handle('manager.maintenance',{operation:'clearIndex'});await reopen();assert.equal((await service.handle('search.status')).indexedPassages,0);assert.equal(await fs.readFile(modelFile,'utf8'),'preserve optional model files');
 passed.push('Semantic index clearing persists without deleting downloaded models or source exports');
 report.status='PASS';
 if(process.env.READER_EVIDENCE){await fs.mkdir(process.env.READER_EVIDENCE,{recursive:true});await fs.writeFile(path.join(process.env.READER_EVIDENCE,'packaged-storage-smoke.json'),JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify(report,null,2));
}catch(error){report.status='FAIL';report.error=error.stack;console.error(JSON.stringify(report,null,2));process.exitCode=1;}
finally{await service?.shutdown().catch(()=>{});await fs.rm(root,{recursive:true,force:true});}
