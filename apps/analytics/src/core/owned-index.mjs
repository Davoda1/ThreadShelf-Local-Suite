/** Rebuild new calculations only from complete owned snapshots; producer fields are immutable. */
import {createHash} from 'node:crypto';
import {analyzeText} from './metrics.mjs';
import {TEXT_INDEX_SCHEMA_VERSION,supportedCapture,PRODUCT_VERSION} from './storage-versions.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const promptKey=text=>createHash('sha256').update(text.normalize('NFC').replace(/\s+/gu,' ').trim()).digest('hex');
export async function indexedOwnedCapture(storage,sourceId,{rebuild=false,signal,onProgress}={}){
 const data=await storage.loadSnapshot(sourceId);if(!data)return null;if(!supportedCapture(data))throw Object.assign(new Error('This capture adapter/content format is unsupported; its bytes have been preserved.'),{code:'CAPTURE_UNSUPPORTED'});
 const {analyzeExplorerText,EXPLORER_TEXT_ALGORITHM_VERSION}=await import('./explorer-a.mjs');
 const pointer=await storage.pointer(sourceId),baseSnapshotFingerprint=data.captureRecovery?.baseFingerprint||pointer.active.fingerprint;let index=rebuild?null:await storage.loadIndex(sourceId).catch(()=>null);
 if(index?.schemaVersion!==TEXT_INDEX_SCHEMA_VERSION||index?.algorithmVersion!==EXPLORER_TEXT_ALGORITHM_VERSION||index?.baseSnapshotFingerprint!==baseSnapshotFingerprint||index?.sourceId!==sourceId)index=null;
 const total=(data.conversations||[]).reduce((n,c)=>n+c.records.length,0);if(index&&Object.keys(index.records||{}).length!==total)index=null;let completed=0;const rebuilt=!index;const entries=index?.records||{};let persistenceError=null;
 for(const c of data.conversations)for(const r of c.records){signal?.throwIfAborted();const key=hash([c.id,r.id]);let entry=entries[key];
  if(!entry){entry={id:r.id,conversationId:c.id,explorerAnalysis:analyzeExplorerText(r.text,r)};if(!r.contentAnalysis)entry.legacyContentAnalysis=analyzeText(r.text,r);if(r.category==='user'&&typeof r.text==='string'&&!r.promptMatchKey)entry.promptMatchKey=promptKey(r.text);entries[key]=entry;}
  if(!r.contentAnalysis&&entry.legacyContentAnalysis)r.contentAnalysis=entry.legacyContentAnalysis;r.explorerAnalysis=entry.explorerAnalysis;if(!r.promptMatchKey&&entry.promptMatchKey)r.promptMatchKey=entry.promptMatchKey;
  completed++;if(completed%128===0){onProgress?.({phase:'index',completed,total,ownedCaptureOnly:true});await new Promise(resolve=>setImmediate(resolve));}
 }
 // Hash original user units before excerpts; do not transfer repeated ID/text arrays.
 if(rebuilt)for(const c of data.conversations)for(const [field,name,countName] of [['objectId','objectPromptKey','objectPromptSegments'],['logicalId','logicalPromptKey','logicalPromptSegments']]){
  const groups=new Map();for(const r of c.records)if(r.category==='user'&&r[field]){if(!groups.has(r[field]))groups.set(r[field],[]);groups.get(r[field]).push(r);}
  for(const records of groups.values()){const complete=records.every(r=>r.explorerAnalysis?.observed&&typeof r.text==='string'),key=complete?promptKey(records.map(r=>r.text).join('\n\n')):null;
   for(const r of records){r.explorerAnalysis={...r.explorerAnalysis,[name]:key,[countName]:records.length};const entry=entries[hash([c.id,r.id])];entry.explorerAnalysis=r.explorerAnalysis;}
  }
 }
 if(rebuilt){signal?.throwIfAborted();index={schemaVersion:TEXT_INDEX_SCHEMA_VERSION,algorithmVersion:EXPLORER_TEXT_ALGORITHM_VERSION,baseSnapshotFingerprint,sourceId,records:entries,builtAt:new Date().toISOString(),producerVersion:PRODUCT_VERSION,sourceProducer:data.producer||{adapterVersion:data.adapterVersion,contentVersion:data.contentVersion},fullOwnedText:true};try{await storage.saveIndex(sourceId,index);}catch(error){if(signal?.aborted)throw error;persistenceError=error.message;}}
 return{...data,indexManifest:{schemaVersion:index.schemaVersion,algorithmVersion:index.algorithmVersion,baseSnapshotFingerprint,builtAt:index.builtAt,status:'Ready',persisted:!persistenceError,persistence:persistenceError?'Rebuild needed':'Ready',persistenceReason:persistenceError,fullOwnedText:true,producerVersion:PRODUCT_VERSION},compatibility:{legacyCapture:data.adapterVersion==='1.0.0',sourceRecaptureRequired:false,producerPreserved:true},indexRebuilt:rebuilt};
}
