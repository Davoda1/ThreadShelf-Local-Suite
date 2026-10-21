// Reproducible synthetic measurement; no user's conversation data is accessed.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ApplicationService} from '../src/core/service.mjs';
import {performance} from 'node:perf_hooks';
const output=process.argv[2]||'docs/evidence/v2.0.0/segmented-benchmark.json';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'tslr-segment-benchmark-'));let service;
let seed=91257;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
const words='controller keyboard archive package measurement database layout windows linux unicode search storage checksum durable signal collection revision vector satellite rotary protocol firmware memory buffer theme display'.split(' ');
const paragraph=()=>Array.from({length:360},()=>words[rnd()%words.length]+(rnd()%13===0?String(rnd()):'')).join(' ');
const report={version:'3.0.0',synthetic:true,source:'Seeded technical word paragraphs with numerical values and raw provenance',node:process.version,platform:process.platform,scales:[]};
try{
 service=await new ApplicationService({dataDir:root}).init();let totalInputBytes=0;
 for(const count of [25,100,400]){
  const startCount=service.store.files().total,started=performance.now();
  for(let i=startCount;i<count;i++){
   const doc={provider:'openai',collection:'Scale',conversationKey:String(i),title:`Measurement ${i}`,raw:{id:i,source:'synthetic',tag:rnd()},turns:Array.from({length:8},(_,t)=>({[t%2?'ai':'user']:paragraph(),turn_index:t*3}))};
   totalInputBytes+=Buffer.byteLength(JSON.stringify(doc));await service.commitMutation(service.store.prepareUpsert(doc));
  }
  await service.checkpoint(true);const importMs=performance.now()-started;await service.shutdown();
  const opening=performance.now();service=await new ApplicationService({dataDir:root}).init();const startupMs=performance.now()-opening;
  const list=await service.handle('files',{limit:25}),before=service.store.cacheStats();
  const openStart=performance.now();await service.handle('thread',{id:list.files[0].id});const selectedMs=performance.now()-openStart,after=service.store.cacheStats();
  const searchStart=performance.now();const result=await service.handle('search',{q:'controller keyboard',searchMode:'keyword',limit:100});const searchMs=performance.now()-searchStart;
  const status=(await service.handle('manager.status')).storage;
  report.scales.push({conversations:count,inputBytes:totalInputBytes,importMs,startupMs,selectedThreadMs:selectedMs,globalSearchMs:searchMs,searchTotal:result.total,compressedBytes:status.compressedBytes,catalogBytes:status.catalogBytes,coldCatalogDecodedObjects:before.decodedObjects,selectedAdditionalDecodedObjects:after.decodedObjects-before.decodedObjects,selectedDecodedBytes:after.decodedBytes-before.decodedBytes,peakRetainedContentCacheBytes:service.store.cacheStats().peakRamBytes,processRssBytes:process.memoryUsage().rss});
  if(before.decodedObjects!==0)throw new Error('Cold catalog browsing unexpectedly decoded content.');
 }
 const start=performance.now();await service.handle('storage.convert',{profile:'zip6'});report.zip6ConversionMs=performance.now()-start;report.zip6Storage=await service.storage.status();
 report.highStorage=report.scales.at(-1);report.caveats=['Timing is from this Linux environment with OS caches warm; cold means empty application content cache.','RAM figure is process RSS at measurement, not sampled peak RSS.','Global text search visits content sequentially; selected thread materializes independently.'];
 await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await service?.shutdown().catch(()=>{});await fs.rm(root,{recursive:true,force:true});}
