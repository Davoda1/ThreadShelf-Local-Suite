// Synthetic no-op import benchmark; no private exports or installed profile used.
// Run: node tests/manager-skip-benchmark.mjs [result.json]
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {ApplicationService} from '../src/core/service.mjs';
import {importPaths} from '../src/core/importers.mjs';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'tslr-skip-benchmark-'));
let service;
try {
 const count=5000, filename=path.join(root,'source.json');
 const docs=Array.from({length:count},(_,i)=>({id:'source-'+i,title:'Fixture '+i,messages:[{role:'user',content:'Question '+i+' Ősz 🧪'},{role:'assistant',content:'Source content preserved exactly '+i}],raw_extension:{number:i}}));
 await fs.writeFile(filename,JSON.stringify(docs));
 service=await new ApplicationService({dataDir:path.join(root,'profile')}).init();
 for await(const document of importPaths([filename]))service.store.upsert({...document,collection:'Source'});
 await service.handle('manager.maintenance',{operation:'compact'});
 const beforeSequence=service.storage.sequence, beforeRevision=service.store.revision();
 const beforeOpCount=service.store.db.prepare('SELECT count(*) AS count FROM applied_operations').get().count;
 const start=performance.now();
 const response=await service.handle('import.paths',{paths:[filename],collection:'Source'});
 const ms=Math.round(performance.now()-start);
 assert.deepEqual(response.errors,[]);assert.equal(response.skipped,count);
 assert.equal(service.storage.sequence,beforeSequence);assert.equal(service.store.revision(),beforeRevision);
 assert.equal(service.store.db.prepare('SELECT count(*) AS count FROM applied_operations').get().count,beforeOpCount);
 const result={status:'PASS',count,inputBytes:(await fs.stat(filename)).size,node:process.version,platform:process.platform,skippedImportMs:ms,maxRssMiB:Math.round(process.resourceUsage().maxRSS/1024),journalRecordsAdded:service.storage.sequence-beforeSequence,contentRevisionUnchanged:true,appliedOperationCountUnchanged:true,fixturePreparation:'Normalized synthetic import records inserted directly and checkpointed before timing.'};
 console.log(JSON.stringify(result,null,2));if(process.argv[2])await fs.writeFile(path.resolve(process.argv[2]),JSON.stringify(result,null,2));
}finally{await service?.shutdown().catch(()=>{});await fs.rm(root,{recursive:true,force:true});}
