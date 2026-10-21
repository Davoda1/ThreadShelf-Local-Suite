import { parentPort,workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { OwnedStorage,atomicFile } from '../core/owned-storage.mjs';
import {indexedOwnedCapture} from '../core/owned-index.mjs';
import {supportedCapture,PRODUCT_VERSION,NORMALIZED_SCHEMA_VERSION} from '../core/storage-versions.mjs';
import { captureReader,observeReader } from '../core/reader-capture.mjs';
import { normalizeConversations,ADAPTER_VERSION } from '../core/adapters.mjs';
import { ingestExports } from '../core/ingest.mjs';
import { buildExplorerReport } from '../core/explorer.mjs';
import { buildReport,analyzeText,applyFilters } from '../core/metrics.mjs';
import { assertOutputOutsideSource } from '../core/source-access.mjs';

const controller=new AbortController();parentPort.on('message',message=>{if(message.type==='cancel')controller.abort();});
const signal=controller.signal;const progress=value=>parentPort.postMessage({type:'progress',value});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const storage=await new OwnedStorage(workerData.dataDir).init();
const CONTENT_VERSION='1.0.0';
function compact(data){return{...data,conversations:(data.conversations||[]).map(c=>({...c,records:c.records.map(r=>{if(typeof r.text!=='string'||r.text.length<=8000)return r;let excerpt=r.text.slice(0,8000);if(/[\uD800-\uDBFF]$/.test(excerpt))excerpt=excerpt.slice(0,-1);return{...r,text:excerpt,textExcerpt:true,fullTextCharacters:r.contentAnalysis?.characters??null};})}))};}

async function safeReportWrite(destination,bytes,sources){
  await assertOutputOutsideSource(destination,sources);
  const parent=path.dirname(destination),basename=path.basename(destination);const before=await fs.lstat(parent);if(!before.isDirectory()||before.isSymbolicLink())throw new Error('Unsafe report directory.');
  if(process.platform==='linux'){
    const handle=await fs.open(parent,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
    try{const actual=await handle.stat();if(actual.ino!==before.ino||actual.dev!==before.dev)throw new Error('Report directory changed.');const anchored=`/proc/self/fd/${handle.fd}/${basename}`;await assertOutputOutsideSource(destination,sources);await atomicFile(anchored,bytes);}
    finally{await handle.close();}
  }else{await assertOutputOutsideSource(destination,sources);await atomicFile(destination,bytes);}
}
async function run(){
  if(workerData.kind==='load'){const datasets=[],errors=[];for(const source of workerData.sources||[]){try{const data=await indexedOwnedCapture(storage,source.id,{signal,onProgress:progress});if(data)datasets.push(compact(data));else if(source.conversationCount>0||['ready','stale','partial','refreshing'].includes(source.status))errors.push({id:source.id,status:'cache-unavailable',message:'No retained Analytics capture is available for this previously captured source.'});}catch(error){errors.push({id:source.id,status:error.code==='CAPTURE_UNSUPPORTED'?'index-invalid':'cache-corrupt',message:error.message||'Captured Analytics data could not be loaded. Its bytes have been preserved.'});}}return{datasets,errors};}
  if(workerData.kind==='index'){const data=await indexedOwnedCapture(storage,workerData.source.id,{rebuild:true,signal,onProgress:progress});if(!data)throw new Error('No owned capture is available to rebuild.');return compact(data);}
  if(workerData.kind==='history-evidence'){
    // Only a positively owned reference in this registered source's retained
    // capture pointer can be loaded. No caller-supplied path is accepted.
    const capture=await storage.loadHistorical(workerData.sourceId,workerData.captureId);if(!supportedCapture(capture))throw new Error('Historical capture format is unsupported.');
    const requested=workerData.filters||{},annotations=workerData.annotations||{};
    const filters={...requested,aliases:requested.aliases||annotations.dedupAliases||{},displayAliases:requested.displayAliases||annotations.aliases||{},excludedConversationIds:requested.excludedConversationIds||annotations.exclusions||[],modelFamilyAliases:requested.modelFamilyAliases||annotations.modelFamilyAliases||{}};
    if(filters.virtualGroup&&annotations.groups?.[filters.virtualGroup])filters.conversationIds=annotations.groups[filters.virtualGroup];
    const selected=applyFilters(capture.conversations||[],filters),query=workerData.query||{},ids=query.ids??query.recordIds,identities=ids===undefined?null:new Set(ids),conversations=query.conversationIds===undefined?null:new Set(query.conversationIds);
    const matches=selected.rows.filter(r=>(!identities||identities.has(r.id))&&(!conversations||conversations.has(r.conversationId))&&(!query.category||r.category===query.category));
    const offset=query.offset??0,limit=query.limit??100;
    const evidence=matches.slice(offset,offset+limit).map(r=>{
      const original=r.observed===false||r.category==='redacted'?null:typeof r.text==='string'?r.text:null;let text=original===null?null:original.slice(0,20000);if(text&&/[\uD800-\uDBFF]$/.test(text))text=text.slice(0,-1);
      return{id:r.id,recordId:r.id,conversationId:r.conversationId,title:r.title,provider:r.provider,model:r.model,modelDeveloper:r.modelDeveloper||'Unknown developer',category:r.category,text,textTruncated:r.textExcerpt===true||r.textTruncated===true||typeof r.textExcerpt==='string'||original!==null&&text.length<original.length,fullTextCharacters:r.content?.characters??r.explorerAnalysis?.characters??r.contentAnalysis?.characters??null,date:r.timestamp,day:r.day??r.dateValue,datePrecision:r.datePrecision||'unknown',sourceId:workerData.sourceId,snapshotId:r.snapshotId||capture.source?.snapshotId||null,captureId:workerData.captureId,sourceFormat:r.format,classification:r.coverage||'partial',provenance:r.rawPath||null,timeProvenance:r.timeProvenance||'unavailable',logicalId:r.logicalId||null,objectId:r.objectId||null,originalObjectId:r.originalObjectId||null,selected:r.selected!==false,reason:'Exact retained-capture observation selected by applied filters and scoped identities',weight:r.weight||1,event:r.event||null,attachments:r.attachments||[],references:r.references||[]};
    });
    return{total:matches.length,offset,limit,evidence,capture:{id:workerData.captureId,sourceId:workerData.sourceId,snapshotId:capture.source?.snapshotId||null,capturedAt:capture.source?.capturedAt||null},filters:selected.filters,filterStatus:selected.filterStatus,warnings:selected.warnings,contract:{countingUnit:'Scoped retained content segment',sourceScope:'Explicit registered Analytics-owned retained capture',eligible:matches.length,available:matches.length,textAvailable:matches.filter(r=>r.observed!==false&&r.category!=='redacted'&&typeof r.text==='string').length,textUnavailable:matches.filter(r=>r.observed===false||r.category==='redacted'||typeof r.text!=='string').length,availabilityMeaning:'Retained identity availability; observed text coverage is counted separately',classification:'Recorded',branchPolicy:selected.filters.branch,filterScope:selected.filters,dateBasis:selected.filters.timeBasis,provenance:'Immutable retained capture; original source is not opened',captureTimeMeaning:'Capture timestamp is provenance, never activity time',excerptLimit:20000},row:null};
  }
  if(workerData.kind==='history-diff'){
    const left=await storage.loadHistorical(workerData.sourceId,workerData.leftId),right=await storage.loadHistorical(workerData.sourceId,workerData.rightId);if(!supportedCapture(left)||!supportedCapture(right))throw new Error('Historical capture format is unsupported.');
    const filters=workerData.filters||{},a=applyFilters(left.conversations,filters),b=applyFilters(right.conversations,filters);const leftRecords=new Map(a.rows.map(r=>[hash([r.conversationId,r.id]),r])),rightRecords=new Map(b.rows.map(r=>[hash([r.conversationId,r.id]),r]));
    const added=[],removed=[],changed=[],unchanged=[];const descriptor=r=>({id:r.id,conversationId:r.conversationId,objectId:r.objectId||null,logicalId:r.logicalId||null,rawPath:r.rawPath||null,provider:r.provider,category:r.category});const measurement=r=>hash({text:r.text,model:r.model,category:r.category,usage:r.usage,attachments:r.attachments,references:r.references,event:r.event,selected:r.selected,date:r.timestamp,capabilities:r.capabilities});
    for(const [key,r] of leftRecords){const current=rightRecords.get(key);if(!current)removed.push(descriptor(r));else if(measurement(r)!==measurement(current))changed.push({...descriptor(current),leftFingerprint:measurement(r),rightFingerprint:measurement(current)});else unchanged.push(descriptor(r));}for(const [key,r] of rightRecords)if(!leftRecords.has(key))added.push(descriptor(r));
    const convMap=selected=>new Map(selected.conversations.map(c=>[c.id,{id:c.id,capabilities:c.capabilities||{},branches:c.branches||{},selectedPath:{known:c.branches?.selectedPathKnown??false,nodes:c.branches?.selectedNodes||[],sourceSelectedLeaf:c.topology?.sourceSelectedLeaf??null,selectedLeaf:c.topology?.selectedLeaf??null,versions:(c.versions||[]).filter(v=>v.selected).map(v=>({messageIndex:v.messageIndex,versionIndex:v.versionIndex,id:v.id}))},rawHash:c.rawHash||null}]));const ca=convMap(a),cb=convMap(b);const capabilityChanges=[...cb].filter(([id,c])=>ca.has(id)&&hash(c.capabilities)!==hash(ca.get(id).capabilities)).map(([id,c])=>({conversationId:id,left:ca.get(id).capabilities,right:c.capabilities}));const selectedPathChanges=[...cb].filter(([id,c])=>ca.has(id)&&hash(c.selectedPath)!==hash(ca.get(id).selectedPath)).map(([id,c])=>({conversationId:id,left:ca.get(id).selectedPath,right:c.selectedPath}));
    return{metricVersion:'capture-diff:1',countingUnit:'Scoped retained content identity',filters,summary:{added:added.length,removed:removed.length,changed:changed.length,unchanged:unchanged.length},tables:{added,removed,changed,capabilityChanges,selectedPathChanges,conversationsAdded:[...cb.values()].filter(c=>!ca.has(c.id)),conversationsRemoved:[...ca.values()].filter(c=>!cb.has(c.id))},captures:{left:{id:workerData.leftId,snapshotId:left.source.snapshotId,capturedAt:left.source.capturedAt,producer:left.producer||{adapterVersion:left.adapterVersion,contentVersion:left.contentVersion}},right:{id:workerData.rightId,snapshotId:right.source.snapshotId,capturedAt:right.source.capturedAt,producer:right.producer||{adapterVersion:right.adapterVersion,contentVersion:right.contentVersion}}},limitations:['Only retained captures can be compared.','Capture times are observation times, never activity dates.','Identity equality uses scoped IDs, never title/text similarity.'],rollbackBaselinePreserved:true};
  }
  if(workerData.kind==='observe')return observeReader(workerData.source.path,{signal});
  if(workerData.kind==='analyze'){
    const source=workerData.source;const previous=workerData.rebuild?null:await storage.loadSnapshot(source.id);const started=performance.now();
    if(source.kind==='reader'&&supportedCapture(previous)){const observed=await observeReader(source.path,{signal});if(observed.identity===previous.source.observedIdentity)return compact({...await indexedOwnedCapture(storage,source.id,{signal,onProgress:progress}),unchanged:true,source:{...previous.source,lastCheckedAt:new Date().toISOString()},performance:{refreshMs:performance.now()-started,unchanged:true}});}
    const work=await storage.newWork();let normalized,captured;
    try{
      progress({phase:'capture',completed:0,total:0});
      if(source.kind==='reader'){
        captured=await captureReader(source.path,{workspace:work.path,signal,onProgress:progress});signal.throwIfAborted();progress({phase:'normalize',completed:0,total:captured.conversations.length});
        normalized=normalizeConversations(captured.conversations,{sourceId:source.id,collectionId:'reader'});
      }else{normalized=await ingestExports(source.paths,{sourceId:source.id,collectionId:'exports:'+source.id.slice(0,12),signal,onProgress:progress});captured={snapshotId:hash(normalized.conversations.map(c=>[c.id,c.rawHash])),capturedAt:new Date().toISOString(),observedIdentity:null,metrics:{sourceBytes:normalized.bytes,fileCount:normalized.files.length}};captured.observedIdentity=captured.snapshotId;}
      signal.throwIfAborted();
      const inputFailures=(normalized.diagnostics||[]).filter(d=>d.severity==='error'||/^(?:file-error|parse-error|ingest-error)$/.test(d.code||''));
      if(!normalized.conversations.length&&inputFailures.length)throw Object.assign(new Error('No complete analytical data could be captured. The previous snapshot has been retained.'),{code:'SOURCE_DATA_INVALID'});
      const previousMap=new Map((previous?.conversations||[]).map(c=>[c.id,c]));let reused=0;
      const conversations=normalized.conversations.map(c=>{const old=previousMap.get(c.id);if(old?.rawHash&&old.rawHash===c.rawHash&&previous.adapterVersion===ADAPTER_VERSION){reused++;c={...old,collectionIds:c.collectionIds};}return{...c,sourceId:source.id,snapshotId:captured.snapshotId,snapshotCapturedAt:Date.parse(captured.capturedAt)};});
      const totalRecords=conversations.reduce((n,c)=>n+c.records.length,0);let completed=0;
      for(const c of conversations)for(const r of c.records){signal.throwIfAborted();if(!r.contentAnalysis||previous?.contentVersion!==CONTENT_VERSION)r.contentAnalysis=analyzeText(r.text,r);if(r.category==='user'&&!r.promptMatchKey)r.promptMatchKey=createHash('sha256').update(String(r.text).normalize('NFC').replace(/\s+/gu,' ').trim()).digest('hex');completed++;if(completed%128===0){progress({phase:'index',completed,total:totalRecords});await new Promise(resolve=>setImmediate(resolve));}}
      const data={version:2,normalizedSchemaVersion:NORMALIZED_SCHEMA_VERSION,producer:{applicationVersion:PRODUCT_VERSION,adapterVersion:ADAPTER_VERSION,contentVersion:CONTENT_VERSION,capturedAt:captured.capturedAt},adapterVersion:ADAPTER_VERSION,contentVersion:CONTENT_VERSION,source:{...source,snapshotId:captured.snapshotId,capturedAt:captured.capturedAt,observedIdentity:captured.snapshotId,currentObservedIdentity:captured.observedIdentity,conversationCount:conversations.length,complete:inputFailures.length===0,stale:!!captured.stale,commit:captured.commit,collections:captured.collections||[],metrics:captured.metrics},conversations,diagnostics:[...(captured.diagnostics||[]),...(normalized.diagnostics||[])],performance:{buildMs:performance.now()-started,conversations:conversations.length,records:totalRecords,reusedConversations:reused,sourceBytes:captured.metrics?.sourceBytes||0,memory:process.memoryUsage()}};
      progress({phase:'publish',completed:conversations.length,total:conversations.length});signal.throwIfAborted();await storage.saveSnapshot(source.id,data,{history:workerData.history,signal});await storage.collectUnreferenced();try{return compact(await indexedOwnedCapture(storage,source.id,{signal,onProgress:progress}));}catch(error){return compact({...data,indexManifest:{status:'Rebuild needed',reason:error.message,fullOwnedText:true}});}
    }finally{await storage.removeWork(work.name);}
  }
  if(workerData.kind==='report'){
    const conversations=[];const scope=[];for(const source of workerData.sources){const data=await indexedOwnedCapture(storage,source.id,{signal,onProgress:progress}).catch(()=>null);if(data){conversations.push(...data.conversations);scope.push({...data.source,stale:!!source.stale,status:source.status});}else scope.push({...source,complete:false});}
    const selection=workerData.selection;const annotations=workerData.annotations||{};const filters={...selection.filters,aliases:selection.filters?.aliases||annotations.dedupAliases||{},displayAliases:selection.filters?.displayAliases||annotations.aliases||{},excludedConversationIds:selection.filters?.excludedConversationIds||annotations.exclusions||[],modelFamilyAliases:selection.filters?.modelFamilyAliases||annotations.modelFamilyAliases||{}};if(filters.virtualGroup&&annotations.groups?.[filters.virtualGroup])filters.conversationIds=annotations.groups[filters.virtualGroup];const appliedScope=scope.filter(s=>(!filters.sourceIds?.length||filters.sourceIds.includes(s.id))&&(!filters.snapshotIds?.length||filters.snapshotIds.includes(s.snapshotId)));const report=buildReport(conversations,filters,{sourceScope:appliedScope,snapshotComplete:appliedScope.length?appliedScope.every(s=>s.complete!==false):null,capturedAt:appliedScope.map(s=>s.capturedAt).filter(Boolean).sort().at(-1)});
    if(selection.legacyCompatible!==true)report.explorer=buildExplorerReport(conversations,filters,annotations,selection.explorer||{});
    const {reportCSV,reportJSON,reportHTML}=await import('../core/reports.mjs');const options={language:selection.language||'en',codeTheme:selection.codeTheme||'default',includeEvidence:selection.includeEvidence===true,includeLabels:selection.includeLabels===true,legacyCompatible:selection.legacyCompatible===true,evidenceIds:Array.isArray(selection.evidenceIds)?selection.evidenceIds:[],conversations,sourceScope:scope};
    const content=selection.format==='csv'?reportCSV(report,options):selection.format==='json'?reportJSON(report,options):reportHTML(report,options);
    const sources=workerData.sources.flatMap(s=>s.kind==='reader'?[s.path]:s.paths);await safeReportWrite(workerData.destination,content,sources);return{file:workerData.destination,bytes:Buffer.byteLength(content),format:selection.format};
  }
  throw new Error('Unknown Analytics worker operation.');
}
try{const result=await run();parentPort.postMessage({type:'result',value:result});}catch(error){parentPort.postMessage({type:'error',error:{code:signal.aborted?'ABORT_ERR':error.code||'ANALYTICS_ERROR',message:signal.aborted?'Analysis cancelled.':String(error.message).slice(0,1200)}});}
