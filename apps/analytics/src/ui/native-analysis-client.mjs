/** Native analysis stays on disk; only bounded views/pages enter the renderer. */
export const nativeFacetKind=name=>({collectionIds:'collections',providers:'providers',formats:'formats',models:'models',conversationModels:'conversationModels',capabilities:'capabilities'})[name];
export function createNativeAnalysisClient(bridge){
 const listeners=new Map(),pageVersions=new Map();let closed=false,reportId=null,comparisonId=null,latestReport=null,latestCompare=null,activeRequest=null,activeCompareRequest=null,pageQueue=Promise.resolve();
 const emit=data=>{if(!closed)for(const listener of listeners.get('message')||[])listener({data});};
 const release=id=>{if(id)Promise.resolve(bridge.releaseReport({reportId:id})).catch(()=>{});};
 const error=(requestId,value)=>emit({type:'error',requestId,error:String(value?.message||value||'Analysis failed.'),code:value?.code,limit:value?.limit});
 const page=(operation,value)=>{const id=reportId,key=operation+':'+(value.table||value.chartId||'')+':'+JSON.stringify(value.columns||[]),version=(pageVersions.get(key)||0)+1;pageVersions.set(key,version);const task=pageQueue.then(()=>{if(closed||reportId!==id||pageVersions.get(key)!==version)throw Object.assign(new Error('Analysis selection changed.'),{code:'REPORT_REPLACED'});return bridge[operation]({reportId:id,...value});});pageQueue=task.catch(()=>{});return task;};
 return{
  native:true,
  get reportId(){return reportId;},
  addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(listener);},
  postMessage(data){
   if(closed)throw new Error('Analysis client is closed.');
   if(data.type==='data'){emit({type:'data',requestId:data.requestId});return;}
   if(data.type==='report'){
    latestReport=data.requestId;if(activeRequest!=null)Promise.resolve(bridge.cancelAnalysis({requestId:activeRequest})).catch(()=>{});activeRequest=data.requestId;
    Promise.resolve(bridge.calculate({requestId:data.requestId,filters:data.filters||{},options:data.options||{}})).then(value=>{if(closed||data.requestId!==latestReport){release(value.reportId);return;}const previous=reportId;reportId=value.reportId;activeRequest=null;if(previous!==reportId)release(previous);emit({type:'report',requestId:data.requestId,report:{...value.report,reportId:value.reportId,native:true,datasetRevision:value.datasetRevision}});},value=>{if(data.requestId===latestReport){activeRequest=null;error(data.requestId,value);}});return;
   }
   if(data.type==='compare'){
    latestCompare=data.requestId;if(activeCompareRequest!=null)Promise.resolve(bridge.cancelAnalysis({requestId:activeCompareRequest})).catch(()=>{});activeCompareRequest=data.requestId;Promise.resolve(bridge.compare({requestId:data.requestId,left:data.left||{},right:data.right||{},options:data.options||{}})).then(value=>{if(closed||data.requestId!==latestCompare){release(value.reportId);return;}activeCompareRequest=null;release(comparisonId);comparisonId=value.reportId;emit({type:'compare',requestId:data.requestId,result:value.result||value});},value=>{if(data.requestId===latestCompare){activeCompareRequest=null;error(data.requestId,value);}});return;
   }
   if(data.type==='evidence'||data.type==='explorerEvidence'){
    const{type,...query}=data;Promise.resolve(bridge.evidence({...query,reportId,limit:Math.min(100,data.limit||100)})).then(value=>emit({type:'evidence',requestId:data.requestId,...value}),value=>error(data.requestId,value));
   }
  },
  tablePage(value){return page('tablePage',{...value,limit:Math.min(100,value.limit||100)});},
  chartData(value){return page('chartData',value);},
  cancel(){const requestId=activeRequest;latestReport=null;activeRequest=null;return requestId==null?Promise.resolve({cancelled:false}):bridge.cancelAnalysis({requestId});},
  terminate(){if(closed)return;closed=true;for(const requestId of [activeRequest,activeCompareRequest])if(requestId!=null)Promise.resolve(bridge.cancelAnalysis({requestId})).catch(()=>{});release(reportId);release(comparisonId);listeners.clear();}
 };
}
