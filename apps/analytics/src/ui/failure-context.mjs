/** Bind each failure to the source and operation that actually produced it. */
export function selectFailure(state,calculationError){
 if(calculationError||state.error)return{error:state.transportError&&!calculationError?state.transportError:state.analysisError||{code:'ANALYSIS_FAILED',message:calculationError||''},source:null,details:{kind:'display-analysis',phase:state.transportError?'transfer':'report'}};
 const job=state.job;if(job?.running)return null;
 if(job?.error&&job.status!=='cancelled')return{error:job.error,source:state.sources.find(source=>source.id===job.sourceId)||(job.sourcePath?{id:null,path:job.sourcePath,kind:job.sourceKind}:null),details:job};
 const source=state.sources.find(value=>['unavailable','cache-corrupt','cache-unavailable','index-invalid'].includes(value.status)&&(value.lastError||value.cacheError));
 if(!source)return null;
 if(['cache-corrupt','cache-unavailable','index-invalid'].includes(source.status)&&source.cacheError)return{error:{code:source.status.toUpperCase().replaceAll('-','_'),message:source.cacheError},source,details:{kind:'load',phase:'load'}};
 return{error:source.lastError||{code:source.status.toUpperCase().replaceAll('-','_'),message:source.cacheError},source,details:source.lastFailure||{kind:'load',phase:'load'}};
}
