/** Desktop production jobs: disk-backed captures and paged analysis responses. */
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import fs from 'node:fs/promises';
import path from 'node:path';
import {assertOutputOutsideSource} from '../core/source-access.mjs';
import {captureReader,observeReaderAnalytical} from '../core/reader-capture.mjs';
import {prepareConversationDocument,ADAPTER_VERSION} from '../core/adapters.mjs';
import {ingestExports} from '../core/ingest.mjs';
import {PRODUCT_VERSION,NORMALIZED_SCHEMA_VERSION} from '../core/storage-versions.mjs';
import {STATISTICS_CAPTURE_VERSION} from '../core/compact-capture.mjs';
import {indexedOwnedDescriptor} from '../core/owned-index.mjs';
const CONTENT_VERSION='1.0.0';
const check=signal=>signal?.throwIfAborted();
const pause=()=>new Promise(resolve=>setImmediate(resolve));
const validPage=value=>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('Invalid analytical page request.');
 const offset=value.offset??0,limit=value.limit??100;if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error('Analytical pages contain at most 100 rows.');
 if(value.query!==undefined&&(typeof value.query!=='string'||value.query.length>4096))throw new Error('Invalid analytical page search.');
 return{...value,offset,limit};
};
async function observeOwned(storage,source,previous,signal){const work=await storage.newWork();try{return await observeReaderAnalytical(source.path,{signal,workspace:work.path,previous});}finally{await storage.removeWork(work.name);}}
const sourceIdentity=writer=>{const hash=createHash('sha256');for(const row of writer.db.prepare('SELECT id,raw_hash FROM conversations ORDER BY seq').iterate())hash.update(JSON.stringify([row.id,row.raw_hash])+'\n');return hash.digest('hex');};
async function analyze(request,storage,signal,onProgress){
 const source=request.source,started=performance.now();let previousReader=await storage.openSnapshot(source.id,{signal}).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 const previous=previousReader?.descriptor();previousReader?.close();previousReader=null;
 if(source.kind==='reader'&&previous&&previous.textRetained===true&&!request.rebuild){const observed=await observeOwned(storage,source,{identity:previous.source.observedIdentity,publicationIdentity:previous.source.publicationIdentity},signal);if(observed.identity===previous.source.observedIdentity)return{...previous,unchanged:true,source:{...previous.source,stale:false,statisticsRecaptureRequired:false,cacheError:null,publicationIdentity:observed.publicationIdentity,lastCheckedAt:new Date().toISOString()},performance:{refreshMs:performance.now()-started,unchanged:true}};}
 const writer=await storage.beginSnapshot(source.id,{signal,history:request.history,retainText:true});let work,captured;
 try{
  work=await storage.newWork();
  onProgress({phase:'capture',completed:0,total:0});
  if(source.kind==='reader'){
   captured=await captureReader(source.path,{workspace:work.path,signal,onProgress,onAttempt:()=>writer.resetAttempt(),collectConversations:false,transformConversation:async(document,{index,total})=>{const prepared=prepareConversationDocument(document,{sourceId:source.id,collectionId:'reader',rawPath:`/${index}`,documentIndex:index});writer.addDiagnostics(prepared.diagnostics);for(const conversation of prepared.conversations){check(signal);await writer.addConversation(conversation);}onProgress({phase:'normalize',completed:index+1,total,records:writer.recordCount});return null;}});
  }else{
   const imported=await ingestExports(source.paths,{sourceId:source.id,collectionId:'exports:'+source.id.slice(0,12),signal,onProgress,workspace:work.path,consumer:{onConversation:async conversation=>{check(signal);await writer.addConversation(conversation);onProgress({phase:'normalize',completed:writer.conversationCount,total:0,records:writer.recordCount});await pause();},onDiagnostics:values=>writer.addDiagnostics(values),onFile:(report,index)=>writer.addAuxiliary('source-files',String(index),report),beginUnit:()=>writer.beginUnit(),commitUnit:unit=>writer.commitUnit(unit),rollbackUnit:unit=>writer.rollbackUnit(unit),onAuxiliary:(namespace,key,value)=>writer.addAuxiliary(namespace,key,value)}});
   check(signal);if(!imported.diagnosticsAreStreamed)writer.addDiagnostics(imported.diagnostics||[]);const snapshotId=sourceIdentity(writer);captured={snapshotId,capturedAt:new Date().toISOString(),observedIdentity:snapshotId,metrics:{sourceBytes:imported.bytes,fileCount:imported.fileCount??imported.files.length},diagnostics:[]};
  }
  check(signal);writer.addDiagnostics(captured.diagnostics||[]);
  if(!writer.conversationCount&&writer.errorCount)throw Object.assign(new Error('No complete analytical data could be captured. The previous snapshot has been retained.'),{code:'SOURCE_DATA_INVALID'});
  const data={version:2,normalizedSchemaVersion:NORMALIZED_SCHEMA_VERSION,producer:{applicationVersion:PRODUCT_VERSION,adapterVersion:ADAPTER_VERSION,contentVersion:CONTENT_VERSION,capturedAt:captured.capturedAt},adapterVersion:ADAPTER_VERSION,contentVersion:CONTENT_VERSION,statisticsCaptureVersion:STATISTICS_CAPTURE_VERSION,source:{...source,textRecaptureRequired:false,statisticsRecaptureRequired:false,cacheError:null,snapshotId:captured.snapshotId,capturedAt:captured.capturedAt,observedIdentity:captured.analyticalIdentity||captured.snapshotId,publicationIdentity:captured.publicationIdentity||null,currentObservedIdentity:captured.observedIdentity,conversationCount:writer.conversationCount,complete:writer.errorCount===0,stale:!!captured.stale,commit:captured.commit,collections:captured.collections||[],metrics:captured.metrics},performance:{buildMs:performance.now()-started,conversations:writer.conversationCount,records:writer.recordCount,sourceBytes:captured.metrics?.sourceBytes||0,memory:process.memoryUsage(),processing:'conversation-stream+sqlite-rows'}};
  onProgress({phase:'publish',completed:writer.conversationCount,total:writer.conversationCount});const result=await writer.publish(data);await storage.collectUnreferenced();return result;
 }catch(error){await writer.abort();throw error;}finally{if(work)await storage.removeWork(work.name);}
}
async function withReaders(storage,sources,signal,fn){const readers=[];try{for(const source of sources){check(signal);const reader=source.captureRef?await storage.openReference(source.captureRef,{signal}):await storage.openSnapshot(source.id,{signal});if(reader)readers.push(reader);}return await fn(readers);}finally{for(const reader of readers)reader.close();}}
export async function runBoundedWorker(request,{storage,signal,onProgress=()=>{}}){
 check(signal);
 if(request.kind==='load'){const datasets=[],errors=[];for(const source of request.sources||[]){try{const data=await indexedOwnedDescriptor(storage,source.id,{signal,onProgress});if(data)datasets.push(data);else if(source.conversationCount>0||['ready','stale','partial','refreshing'].includes(source.status))errors.push({id:source.id,status:'cache-unavailable',message:'No retained Analytics capture is available for this source.'});}catch(error){errors.push({id:source.id,status:error.code==='CAPTURE_UNSUPPORTED'?'index-invalid':'cache-corrupt',message:error.message});}}return{datasets,errors};}
 if(request.kind==='analyze')return analyze(request,storage,signal,onProgress);
 if(request.kind==='index'){const result=await indexedOwnedDescriptor(storage,request.source.id,{rebuild:true,signal,onProgress});if(!result)throw new Error('No owned capture is available to rebuild.');return result;}
 if(request.kind==='observe')return observeOwned(storage,request.source,{identity:request.source.observedIdentity,publicationIdentity:request.source.publicationIdentity},signal);
 const analysisKinds=new Set(['calculate','compare','table-page','evidence-page','chart-data','release-report']);
 if(analysisKinds.has(request.kind)){
  const engine=await import('../core/disk-analysis.mjs');const value=request.value||{};const common={storage,sources:request.sources||[],annotations:request.annotations||{},signal,onProgress};
  if(request.kind==='calculate')return engine.calculateOwnedReport({...common,filters:value.filters||{},options:{...value.options,datasetRevision:request.datasetRevision}});
  if(request.kind==='compare')return engine.compareOwnedReport({...common,left:value.left||{},right:value.right||{},options:{...value.options,datasetRevision:request.datasetRevision}});
  if(request.kind==='table-page')return engine.reportPage({...validPage(value),storage,signal});
  if(request.kind==='evidence-page')return engine.evidencePage({...validPage(value),storage,signal});
  if(request.kind==='chart-data')return engine.chartData({...value,storage,signal});
  try{return await engine.releaseAnalysis(storage,value.reportId);}catch(error){if(error.code==='ENOENT')return{released:false};throw error;}
 }
 if(request.kind==='filter-options'||request.kind==='conversation-page'||request.kind==='conversation-metadata')return boundedMetadataPage(request,storage,signal);
 if(request.kind==='history-evidence'||request.kind==='history-diff'||request.kind==='history-diff-page'){const history=await import('../core/disk-history.mjs');return history.runHistoryJob({...request,storage,signal,onProgress});}
 if(request.kind==='report'||request.kind==='export-table'){
  const exporter=await import('../core/streaming-report-export.mjs'),engine=await import('../core/disk-analysis.mjs');let selection={...(request.selection||request.value)};let temporaryReport;
  try{if(!selection.reportId){const prepared=await engine.calculateOwnedReport({storage,sources:request.sources||[],filters:selection.filters||{},annotations:request.annotations||{},options:{...selection.explorer,datasetRevision:request.datasetRevision},signal,onProgress});selection.reportId=prepared.reportId;temporaryReport=prepared.reportId;}
   if(request.kind==='export-table'&&selection.chartId)await engine.chartData({storage,reportId:selection.reportId,chartId:selection.chartId,controls:selection.controls,signal,onProgress});
   const sources=(request.sources||[]).flatMap(source=>source.kind==='reader'?[source.path]:source.paths||[]),bytes=await streamReportFile(request.destination,exporter.streamOwnedReport({storage,selection,signal,onProgress,exportWorkDirectory:request.exportWorkDirectory}),sources,signal,onProgress,request.reportOutput);return{file:request.destination,bytes,format:selection.format};
  }finally{if(temporaryReport)await engine.releaseAnalysis(storage,temporaryReport).catch(()=>{});}
 }
 throw new Error('Unknown bounded Analytics operation.');
}

async function streamReportFile(destination,chunks,sources,signal,onProgress,prepared){
 await assertOutputOutsideSource(destination,sources);const parent=path.dirname(destination),name=path.basename(destination),initial=await fs.lstat(parent);if(!initial.isDirectory()||initial.isSymbolicLink())throw new Error('Unsafe report directory.');
 if(!prepared||prepared.parent!==parent||!/^\.analytics-export-[a-f0-9-]{36}\.tmp$/.test(prepared.temporaryName)||prepared.parentDev!==initial.dev||prepared.parentIno!==initial.ino)throw new Error('Report output ownership was not prepared by the application.');
 let handle,temporary,anchor;let bytes=0;
 try{
  if(process.platform==='linux'){if(!Number.isSafeInteger(prepared.directoryFd)||prepared.directoryFd<0)throw new Error('Report directory handle is unavailable.');anchor=`/proc/self/fd/${prepared.directoryFd}`;}else anchor=parent;
  await assertOutputOutsideSource(destination,sources);temporary=path.join(anchor,prepared.temporaryName);handle=await fs.open(temporary,'r+');const temporaryState=await handle.stat();if(!temporaryState.isFile()||temporaryState.nlink!==1||temporaryState.dev!==prepared.dev||temporaryState.ino!==prepared.ino)throw new Error('Prepared report output identity changed.');
  for await(const chunk of chunks){check(signal);if(typeof chunk!=='string'&&!ArrayBuffer.isView(chunk))throw new TypeError('Invalid report output chunk.');await handle.writeFile(chunk);bytes+=typeof chunk==='string'?Buffer.byteLength(chunk):chunk.byteLength;if(!Number.isSafeInteger(bytes))throw new Error('Report byte count exceeds supported integer precision.');onProgress({phase:'export',completed:bytes,total:0});}
  check(signal);await handle.sync();await handle.close();handle=null;const current=await fs.lstat(parent);if(current.isSymbolicLink()||current.ino!==initial.ino||current.dev!==initial.dev)throw new Error('Report directory changed before publication.');await assertOutputOutsideSource(destination,sources);
  if(process.platform==='linux'){const actual=await fs.realpath(`/proc/self/fd/${prepared.directoryFd}`);await assertOutputOutsideSource(path.join(actual,name),sources);}
  await fs.rename(temporary,path.join(anchor,name));return bytes;
 }finally{await handle?.close().catch(()=>{});}
 // The main process owns cleanup of the registered temporary file and parent
 // handle, including forced worker termination before this finally can run.
}

async function boundedMetadataPage(request,storage,signal){
 const value=validPage(request.value||{});return withReaders(storage,request.sources||[],signal,async readers=>{
  if(request.kind==='conversation-metadata'){
   if(typeof value.id!=='string'||!value.id.length||value.id.length>32768)throw new Error('Invalid conversation identity.');
   for(const reader of readers){const conversation=reader.conversation(value.id,{includeRecords:false});if(conversation){const expression="CASE WHEN model='' OR lower(model) IN ('unknown','unavailable') THEN 'Unknown model' ELSE model END",total=reader.database.prepare(`SELECT COUNT(DISTINCT ${expression}) AS n FROM records WHERE conversation_id=?`).get(value.id).n,rows=[...reader.database.prepare(`SELECT ${expression} AS value,COUNT(*) AS count FROM records WHERE conversation_id=? GROUP BY ${expression} ORDER BY ${expression} LIMIT ? OFFSET ?`).iterate(value.id,value.limit,value.offset)];return{conversation:{...conversationPreview(conversation),models:rows.map(row=>row.value),modelsTotal:total,modelsNextOffset:value.offset+rows.length},modelOptions:{rows,total,offset:value.offset,limit:value.limit,nextOffset:value.offset+rows.length}};}}return{conversation:null};
  }
  const {DatabaseSync}=await import('node:sqlite'),work=await storage.newWork(),filename=work.path+'/metadata.sqlite';const db=new DatabaseSync(filename);db.exec('PRAGMA cache_size=-4096;PRAGMA temp_store=FILE;PRAGMA mmap_size=0;CREATE TABLE values_page(id TEXT PRIMARY KEY,label TEXT NOT NULL,count INTEGER NOT NULL,json TEXT);BEGIN;');
  try{
   const put=db.prepare('INSERT INTO values_page(id,label,count,json) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET count=count+excluded.count');
   if(request.kind==='filter-options'){
    const field=value.field;const kinds={provider:'providers',providers:'providers',format:'formats',formats:'formats',model:'models',models:'models',conversationModels:'models',collectionIds:'collections',collections:'collections',capabilities:'capabilities'};if(!kinds[field])throw new Error('Unknown analytical filter field.');
    const canonical=item=>!item||/^(unknown|unavailable)$/i.test(item)?(kinds[field]==='models'?'Unknown model':kinds[field]==='providers'?'Unknown platform':String(item??'')):String(item);
    for(const reader of readers){if(value.conversationId&&kinds[field]==='models'){for(const row of reader.database.prepare('SELECT model AS value,COUNT(*) AS count FROM records WHERE conversation_id=? GROUP BY model').iterate(value.conversationId)){const option=canonical(row.value);put.run(option,option,row.count??0,null);}continue;}let at=0;while(true){check(signal);const page=reader.filterOptions(kinds[field],{offset:at,limit:500});for(const row of page.rows){const option=kinds[field]==='models'||kinds[field]==='providers'?canonical(row.value):String(row.value);put.run(option,option,row.count??0,null);}at+=page.rows.length;if(at>=page.total||!page.rows.length)break;await pause();}}
   }else{
    for(const reader of readers)for(const conversation of reader.iterateConversations({includeRecords:false})){check(signal);put.run(conversation.id,String(conversation.title||'Untitled conversation'),1,JSON.stringify(conversationPreview(conversation)));}
   }
   db.exec('COMMIT;');const query=String(value.query||'').replace(/[\\%_]/g,'\\$&'),where=query?" WHERE label LIKE ? ESCAPE '\\'":'',args=query?['%'+query+'%']:[];const total=db.prepare('SELECT COUNT(*) AS n FROM values_page'+where).get(...args).n;
   const rows=[];for(const row of db.prepare('SELECT id,label,count,json FROM values_page'+where+' ORDER BY label COLLATE NOCASE,id LIMIT ? OFFSET ?').iterate(...args,value.limit,value.offset))rows.push(row.json?JSON.parse(row.json):{value:row.id,label:row.label,count:row.count});
   return{rows,total,offset:value.offset,limit:value.limit,nextOffset:value.offset+rows.length,hasMore:value.offset+rows.length<total,hasNext:value.offset+rows.length<total};
  }finally{db.close();await storage.removeWork(work.name);}
 });
}
function conversationPreview(conversation){const title=String(conversation.title||'Untitled conversation');return{id:conversation.id,title:title.slice(0,4096),provider:conversation.provider,format:conversation.format,sourceId:conversation.sourceId,snapshotId:conversation.snapshotId,recordCount:conversation.recordCount??conversation.records?.length??0,...(title.length>4096?{titleTruncated:true}:{})};}
