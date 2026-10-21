// Synthetic, optional integration benchmark: node tests/manager-benchmark.mjs [result.json]
// Uses an isolated temporary profile and deletes every generated fixture on exit.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {ApplicationService} from '../src/core/service.mjs';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'tslr-5000-review-'));
const count=5000, result={count,node:process.version,platform:process.platform,steps:[]};
let service;
const measure=async(name,fn)=>{const start=performance.now(); const value=await fn(); const entry={name,ms:Math.round(performance.now()-start),rssMiB:Math.round(process.memoryUsage().rss/1048576),maxRssMiB:Math.round(process.resourceUsage().maxRSS/1024)};result.steps.push(entry); console.log(JSON.stringify(entry));return value;};
try {
 const filename=path.join(root,'source.json'),backup=path.join(root,'backup.zip');
 const docs=Array.from({length:count},(_,i)=>({id:'source-'+i,title:'Fixture '+i,messages:[{role:'user',content:'Question '+i+' Ősz 🧪'},{role:'assistant',content:'Source content preserved exactly '+i}],raw_extension:{number:i}}));
 await fs.writeFile(filename,JSON.stringify(docs));result.inputBytes=(await fs.stat(filename)).size;
 service=await new ApplicationService({dataDir:path.join(root,'profile')}).init();
 await measure('import5000',async()=>{const response=await service.handle('import.paths',{paths:[filename],collection:'Source'});assert.equal(response.errors.length,0);assert.equal(response.imported,count);});
 const revision=service.store.revision();
 await measure('repeatSkipped5000',async()=>{const response=await service.handle('import.paths',{paths:[filename],collection:'Source'});assert.equal(response.errors.length,0);assert.equal(response.skipped,count);assert.equal(service.store.revision(),revision);});
 const originalRows=service.store.files({collection:'Source',pageSize:2}).files;
 const before=service.store.thread({id:originalRows[0].id});
 await measure('backup',()=>service.handle('manager.backup',{path:backup}));result.backupBytes=(await fs.stat(backup)).size;
 await measure('copy5000',async()=>{const response=await service.handle('manager.mutate',{operation:'copy',selection:{allMatching:true,collection:'Source'},targetName:'Copy'});assert.equal(response.copied,count);assert.equal(service.store.files().total,count*2);});
 const source=service.store.collections({includeEmpty:true}).find(c=>c.name==='Source');
 const destination=service.store.collections({includeEmpty:true}).find(c=>c.name==='Copy');
 await measure('merge5000Duplicates',async()=>{const response=await service.handle('manager.mutate',{operation:'merge',collectionIds:[source.id],targetId:destination.id});assert.equal(response.duplicates,count);assert.equal(response.removedIds.length,count);assert.equal(service.store.files().total,count);});
 await measure('restorePreview',()=>service.handle('manager.restore.preview',{path:backup}));
 await measure('restore',()=>service.handle('manager.restore',{path:backup}));
 assert.equal(service.store.files().total,count);assert.deepEqual(service.store.thread({id:before.id}),before);
 await measure('reopen',async()=>{await service.shutdown();service=await new ApplicationService({dataDir:path.join(root,'profile')}).init();});
 assert.equal(service.store.files().total,count);assert.deepEqual(service.store.thread({id:before.id}),before);
 await measure('pagedAndFullTextRead',async()=>{assert.equal(service.store.files({page:100,pageSize:50}).files.length,50);assert.equal((await service.handle('search',{mode:'local',searchMode:'keyword',q:'preserved exactly 4999'})).results.length>0,true);});
 result.storage=await service.storage.status();delete result.storage.workingDir;result.status='PASS';
 console.log(JSON.stringify(result,null,2));if(process.argv[2])await fs.writeFile(path.resolve(process.argv[2]),JSON.stringify(result,null,2));
} finally {await service?.shutdown().catch(()=>{});await fs.rm(root,{recursive:true,force:true});}
