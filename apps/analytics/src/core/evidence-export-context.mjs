/** Explicit shown-evidence exports use an owned immutable analysis capability. */
const reportId=/^[a-f0-9]{32}$/,captureId=/^[a-f0-9]{64}$/;
const tables=new Set(['added','removed','changed','unchanged','capabilityChanges','selectedPathChanges','conversationsAdded','conversationsRemoved']);
const invalid=()=>Object.assign(new Error('The shown evidence context is unavailable or does not match its retained capture. Open the evidence again before exporting.'),{code:'INVALID_EVIDENCE_CONTEXT'});
export function validateEvidenceExportContext(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||!reportId.test(value.reportId||''))throw invalid();
 if(value.kind==='capture'){if(Object.keys(value).some(key=>!['kind','reportId','sourceId','captureId'].includes(key))||!captureId.test(value.sourceId||'')||!captureId.test(value.captureId||''))throw invalid();return{kind:value.kind,reportId:value.reportId,sourceId:value.sourceId,captureId:value.captureId};}
 if(value.kind==='history-diff'){if(Object.keys(value).some(key=>!['kind','reportId','table'].includes(key))||!tables.has(value.table))throw invalid();return{kind:value.kind,reportId:value.reportId,table:value.table};}
 throw invalid();
}
export async function openEvidenceExportContext(storage,value,{signal}={}){
 const context=validateEvidenceExportContext(value),{openAnalysis}=await import('./disk-analysis.mjs'),owned=await openAnalysis(storage,context.reportId,{signal});
 try{
  if(context.kind==='capture'){
   const scope=owned.metadata('historyEvidenceScope');if(!scope||scope.sourceId!==context.sourceId||scope.captureId!==context.captureId)throw invalid();
   return{async*iterateEvidence(query){for await(const row of owned.iterateEvidence(query))yield{...row,captureId:context.captureId};},evidenceCount:query=>owned.evidenceCount(query),hasEvidenceForConversation:(id,query)=>owned.hasEvidenceForConversation(id,query),close:()=>owned.close()};
  }
  if(owned.metadata('kind')!=='history-diff'||!owned.metadata('historyDiff')?.tableCounts||!Object.hasOwn(owned.metadata('historyDiff').tableCounts,context.table))throw invalid();
  const {iterateHistoryDiffEvidence,countHistoryDiffEvidence}=await import('./disk-history.mjs');
  return{iterateEvidence:query=>iterateHistoryDiffEvidence({storage,reportId:context.reportId,table:context.table,ids:query.ids,fullText:query.fullText===true,signal}),evidenceCount:query=>countHistoryDiffEvidence({storage,reportId:context.reportId,table:context.table,ids:query.ids,signal}),hasEvidenceForConversation:(id,query)=>countHistoryDiffEvidence({storage,reportId:context.reportId,table:context.table,ids:query.ids,conversationId:id,signal}).then(count=>count>0),close:()=>owned.close()};
 }catch(error){owned.close();throw error;}
}
