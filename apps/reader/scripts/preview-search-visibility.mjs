// The offline bridge classifies only originals referenced by the returned page.
// It uses the same pure source/position rules as the desktop service.
import {classifySearchTurns,searchHitDecision} from '../src/core/search-visibility-model.mjs';
const validIndex=value=>Number.isSafeInteger(value)&&value>=0;
const unknown=()=>({classified:false,emptyHidden:false,intermediateHidden:false});
export function createPreviewSearchVisibility(data){
 return (args={})=>{
  if(!Array.isArray(args.hits)||args.hits.length>500)throw new Error('Search visibility requires at most 500 current-page results.');
  const cache=new Map();
  return {decisions:args.hits.map(hit=>{
   if(!hit||typeof hit!=='object')return unknown();
   if(Object.hasOwn(hit,'sourceTurnPosition')?!validIndex(hit.sourceTurnPosition):!validIndex(hit.turnIndex))return unknown();
   const id=hit.conversationId||hit.id;
   const thread=data.find(row=>id?row.id===id:hit.sourceFile&&row.sourceFile===hit.sourceFile&&row.collection===(hit.collection||args.collection)&&(row.conversationKey||'')===(hit.conversationKey||''));
   if(!thread)return unknown();
   if(!cache.has(thread))cache.set(thread,classifySearchTurns(thread.turns));
   return searchHitDecision(hit,cache.get(thread));
  })};
 };
}
