/** Dataset publications and status updates have independent delivery watermarks. */
export function mergeAnalyticsUpdate(state,payload,versions={metadata:-1,data:-1}){
 if(!payload||typeof payload!=='object')return{state,versions,changed:false,dataChanged:false};
 const revision=Number.isFinite(payload.__updateRevision)?payload.__updateRevision:null;
 const metadataAccepted=revision===null||revision>versions.metadata;
 const hasConversations=Object.hasOwn(payload,'conversations'),hasDataset=Object.hasOwn(payload,'dataset'),dataAccepted=(hasConversations||hasDataset)&&(revision===null||revision>versions.data);
 if(!metadataAccepted&&!dataAccepted)return{state,versions,changed:false,dataChanged:false};
 let next=state;
 if(metadataAccepted){const{conversations,diagnostics,dataset,...metadata}=payload;next={...next,...metadata,settings:{...next.settings,...metadata.settings}};}
 if(dataAccepted)next={...next,...(hasConversations?{conversations:next.backendAnalysis?[]:payload.conversations}:{}),...(hasDataset?{dataset:payload.dataset}:{}),...(Object.hasOwn(payload,'diagnostics')?{diagnostics:payload.diagnostics}:{})};
 return{state:next,versions:{metadata:metadataAccepted&&revision!==null?revision:versions.metadata,data:dataAccepted&&revision!==null?revision:versions.data},changed:true,dataChanged:dataAccepted&&(hasConversations||!state.dataset||state.dataset.revision!==payload.dataset?.revision)};
}

/** Recover a missing publication without confusing completed capture with empty data. */
export function needsDataResync(state){
 if(state.job?.running||state.registrationBusy)return false;
 if(state.backendAnalysis){
  if(!state.dataset)return(state.sources||[]).some(source=>source.conversationCount>0);
  const snapshots=new Map((state.dataset.sourceSnapshots||[]).map(source=>[source.sourceId||source.id,source.snapshotId]));
  for(const source of state.sources||[]){if(['ready','partial','stale'].includes(source.status)&&source.conversationCount>0&&(!snapshots.has(source.id)||source.snapshotId&&snapshots.get(source.id)!==source.snapshotId))return true;}
  return[...snapshots.keys()].some(id=>!(state.sources||[]).some(source=>source.id===id));
 }
 const sources=new Map((state.sources||[]).map(source=>[source.id,source])),rows=new Map();
 for(const conversation of state.conversations||[]){const id=conversation.sourceId||conversation.sourceInstanceId;if(!sources.has(id))return true;if(!rows.has(id))rows.set(id,[]);rows.get(id).push(conversation);}
 for(const source of sources.values()){
  const captured=rows.get(source.id)||[];
  if(['ready','partial','stale'].includes(source.status)&&source.conversationCount>0){if(!captured.length)return true;if(source.snapshotId&&captured.some(c=>c.snapshotId&&c.snapshotId!==source.snapshotId))return true;}
  if(source.status==='registered'&&source.conversationCount===0&&captured.length)return true;
 }
 return false;
}
