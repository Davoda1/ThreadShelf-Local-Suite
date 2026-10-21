import {buildReport,compareSelections} from '../core/metrics.mjs';
import {buildExplorerReport,resolveExplorerEvidence} from '../core/explorer.mjs';
import {compactReport,compactComparison} from './worker-payload.mjs';
let conversations=[],latest=null;
self.onmessage=({data})=>{
  try{
    if(data.type==='data'){conversations=data.conversations||[];latest=null;self.postMessage({type:'data',requestId:data.requestId});return;}
    if(data.type==='report'){
      latest=buildReport(conversations,data.filters||{},data.options||{});
      latest.explorer=buildExplorerReport(conversations,data.filters||{},data.options?.annotations||{},data.options?.explorer||{});
      // Keep full source excerpts in this worker until explicitly requested.
      self.postMessage({type:'report',requestId:data.requestId,report:compactReport(latest)});return;
    }
    if(data.type==='compare'){
      const result=compareSelections(conversations,data.left,data.right,data.options||{});
      self.postMessage({type:'compare',requestId:data.requestId,result:compactComparison(result)});return;
    }
    if(data.type==='explorerEvidence'){
      const resolved=resolveExplorerEvidence(latest?.explorer,conversations,data);
      self.postMessage({type:'evidence',requestId:data.requestId,...resolved});return;
    }
    if(data.type==='evidence'){
      let ids=new Set(data.ids||[]),population=latest?.evidence||[],targeted=ids.size>0;
      if(data.table){
        const table=latest?.tables?.[data.table]||[];
        const selected=data.series!=null?table.filter(row=>row[data.field]===data.series):[table[data.rowIndex]].filter(Boolean);
        ids=new Set(selected.flatMap(row=>row.evidenceIds||[]));targeted=true;
        if(!ids.size){const conversations=new Set(selected.map(row=>row.conversationId).filter(Boolean));population=population.filter(e=>conversations.has(e.conversationId));targeted=false;}
      }
      const rows=population.filter(e=>(!targeted||ids.has(e.id))&&(!data.category||e.category===data.category)&&(!data.conversationId||e.conversationId===data.conversationId));
      self.postMessage({type:'evidence',requestId:data.requestId,total:rows.length,offset:Math.max(0,Number(data.offset)||0),evidence:rows.slice(Math.max(0,Number(data.offset)||0),Math.max(0,Number(data.offset)||0)+Math.min(100,Number(data.limit)||100)).map(e=>({...e,text:e.text?.slice(0,20000)??null}))});return;
    }
  }catch(error){self.postMessage({type:'error',requestId:data.requestId,error:String(error.message||error)});}
};
