/** Statistics-only capture projection. Source text exists only during analysis. */
import {analyzeText,numericalRecapDuration} from './metrics.mjs';
import {analyzeExplorerText,EXPLORER_TEXT_ALGORITHM_VERSION,trustworthyLogical} from './explorer-a.mjs';
import {canonicalPromptKey,sha256Text} from './prompt-key.mjs';

export const STATISTICS_CAPTURE_VERSION=1;
const stableJSON=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value||{},key)).map(key=>[key,value[key]]));
// Public captures retain their recorded metadata; only message body fields are separated.
function measuredMetadata(record){return record;}
export function segmentFingerprint(r){return r.segmentFingerprint||sha256Text(stableJSON({text:r.text??null,observed:r.observed,category:r.category,model:r.model,timestamp:r.timestamp,datePrecision:r.datePrecision,parentId:r.parentId,relationship:r.relationship,event:r.event,usage:r.usage,contextOccupancy:r.contextOccupancy,duration:r.duration,attachments:r.attachments,references:r.references}));}
export function historyFingerprint(r){return r.historyFingerprint||sha256Text(JSON.stringify({text:r.text,model:r.model,category:r.category,usage:r.usage,attachments:r.attachments,references:r.references,event:r.event,selected:r.selected,date:r.timestamp,capabilities:r.capabilities}));}

export function statisticsCapture(data){
 if(!data||!Array.isArray(data.conversations))return data;
 const conversations=data.conversations.map(c=>{
  const records=(c.records||[]).map(r=>{
   const text=typeof r.text==='string'?r.text:null;
   if(text===null&&r.textRetained===false&&(!r.contentAnalysis||r.explorerAnalysis?.version!==EXPLORER_TEXT_ALGORITHM_VERSION))throw Object.assign(new Error('Stored statistics use an unavailable measurement algorithm. Refresh the source to recalculate them.'),{code:'CAPTURE_RECAPTURE_REQUIRED'});
   const next={...r,contentAnalysis:r.contentAnalysis||analyzeText(text,r),explorerAnalysis:r.explorerAnalysis?.version===EXPLORER_TEXT_ALGORITHM_VERSION?r.explorerAnalysis:analyzeExplorerText(text,r),segmentFingerprint:segmentFingerprint(r),historyFingerprint:historyFingerprint(r),textRetained:false};
   if(text!==null&&r.category==='user')next.promptMatchKey=r.promptMatchKey||canonicalPromptKey(text);
   if(!trustworthyLogical(r,c)){const {logicalPromptKey,logicalPromptSegments,...analysis}=next.explorerAnalysis;next.explorerAnalysis=analysis;}
   if(r.category==='recap'&&!next.recapDuration){const duration=numericalRecapDuration(text);next.recapDuration=duration?{milliseconds:duration.milliseconds,label:duration.label}:null;}
   next.fullTextCharacters=next.explorerAnalysis?.characters??next.contentAnalysis?.characters??null;
   return next;
  });
  // Whole original prompt units are hashed before individual segments are discarded.
  for(const [field,name,countName] of [['objectId','objectPromptKey','objectPromptSegments'],['logicalId','logicalPromptKey','logicalPromptSegments']]){
   const groups=new Map();for(const r of records)if(r.category==='user'&&r[field]&&(field!=='logicalId'||trustworthyLogical(r,c))){if(!groups.has(r[field]))groups.set(r[field],[]);groups.get(r[field]).push(r);}
   for(const group of groups.values()){
    const complete=group.every(r=>r.explorerAnalysis?.observed&&typeof r.text==='string');
    const key=complete?canonicalPromptKey(group.map(r=>r.text).join('\n\n')):group[0].explorerAnalysis?.[name]||null;
    for(const r of group)r.explorerAnalysis={...r.explorerAnalysis,[name]:key,[countName]:group.length};
   }
  }
  for(const r of records){delete r.text;delete r.textExcerpt;delete r.textTruncated;}
  return {...c,records:records.map(measuredMetadata)};
 });
 return {...data,statisticsCaptureVersion:STATISTICS_CAPTURE_VERSION,textRetained:false,conversations};
}
