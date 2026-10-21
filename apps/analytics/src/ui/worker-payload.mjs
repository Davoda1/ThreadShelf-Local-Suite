// Browser-worker output contains analytical values, never redundant evidence-ID
// arrays. The worker retains the original report for exact drilldown lookup.
function compact(value){
 if(Array.isArray(value))return value.map(compact);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['evidenceIds','evidence','evidenceIndex','contextRecords','originalConversations'].includes(key)).map(([key,v])=>[key,compact(v)]));
 return value;
}
export function compactReport(report){return {...compact(report),evidence:[],evidenceCount:report.evidence?.length||0};}
export function compactComparison(result){return {...result,left:compactReport(result.left),right:compactReport(result.right)};}
