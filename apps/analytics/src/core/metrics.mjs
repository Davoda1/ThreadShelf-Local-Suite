import {PRODUCT_VERSION} from './storage-versions.mjs';
/** Deterministic, browser-compatible analytical calculation. No filesystem or network access. */
export const ANALYTICAL_SCHEMA_VERSION = '1.0.0';
export const SUPPORTED_FILTER_KEYS = new Set(['aliases','displayAliases','language','virtualGroup','searchScope','searchLimit','branch','branchScope','capabilities','categories','characteristics','collectionIds','collections','content','conversationIds','conversationModels','coverage','end','excludedConversationIds','exclusions','formats','includeUndated','modelAliases','modelDevelopers','modelFamilies','modelFamilyAliases','models','perspective','platforms','providers','range','reliability','search','snapshotIds','snapshots','sourceIds','sources','start','timeBasis','timeZone','timezone','year']);
export const CATEGORIES = ['user','response','thinking','recap','commentary','tool_call','tool_output','system','other','redacted'];
export const UNKNOWN_MODEL = 'Unknown model';
export const UNKNOWN_PLATFORM = 'Unknown platform';
const own = (o,k) => Object.prototype.hasOwnProperty.call(o || {},k);
const finite = v => typeof v === 'number' && Number.isFinite(v);
const array = v => Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]);
const unique = v => [...new Set(v)];
const textAnalysisCache = new WeakMap();
const codePointLength = value => {let n=0;for(const _ of value)n++;return n;};
const sum = (rows,fn) => rows.reduce((n,r) => n + fn(r),0);
const count = rows => sum(rows,r => r.weight || 1);
const modelName = v => !v || /^(unknown|unavailable)$/i.test(v) ? UNKNOWN_MODEL : String(v);
const platformName = v => !v || /^(unknown|unavailable)$/i.test(v) ? UNKNOWN_PLATFORM : String(v);
const clampText = v => String(v ?? '');
const calendarDayNumber = day => Date.parse(day + 'T00:00:00Z') / 86400000;
const shiftDay = (day,n) => {const value=(calendarDayNumber(day)+n)*86400000;return finite(value)?new Date(value).toISOString().slice(0,10):null;};
const ratio = (n,d) => d > 0 ? n/d : null;
export function resolvedTimeZone(value = 'local') {
  const zone = !value || value === 'local' || value === 'Local' ? Intl.DateTimeFormat().resolvedOptions().timeZone : value;
  try { new Intl.DateTimeFormat('en',{timeZone:zone}).format(0); return zone; }
  catch { return 'UTC'; }
}
const formatters = new Map();
function timeParts(timestamp,zone) {
  if (!finite(timestamp)) return null;
  const key=resolvedTimeZone(zone);
  let f=formatters.get(key);
  if(!f) { f=new Intl.DateTimeFormat('en-CA',{timeZone:key,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}); formatters.set(key,f); }
  try {
    const p=Object.fromEntries(f.formatToParts(timestamp).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
    return {day:`${p.year}-${p.month}-${p.day}`,hour:Number(p.hour),minute:Number(p.minute),second:Number(p.second)};
  } catch { return null; }
}
/** Calendar midnight in selected IANA zone; adjusts for UTC offsets and DST. */
export function zonedMidnight(day,zone='UTC') {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const target=Date.parse(day+'T00:00:00Z');
  if(!finite(target) || new Date(target).toISOString().slice(0,10)!==day) return null;
  let guess=target;
  for(let i=0;i<6;i++) {
    const p=timeParts(guess,zone); if(!p) return null;
    const represented=Date.parse(p.day+'T00:00:00Z')+(p.hour*3600+p.minute*60+p.second)*1000;
    const adjustment=target-represented; if(!adjustment) return guess;
    guess += adjustment;
  }
  // Extremely rare nonexistent midnight: first observed instant on that calendar day.
  for(let delta=-10800000;delta<=10800000;delta+=60000) if(timeParts(guess+delta,zone)?.day===day) return guess+delta;
  return null;
}
export function resolveDateRange(filters={},now=Date.now()) {
  const zone=resolvedTimeZone(filters.timeZone || filters.timezone || 'local');
  const today=timeParts(finite(now)?now:Date.now(),zone).day;
  const mode=filters.range || 'all';
  let start=null,end=null,startDay=null,endDay=null;
  if(mode==='7d'||mode==='7-day') {startDay=shiftDay(today,-6);endDay=shiftDay(today,1);}
  else if(mode==='30d'||mode==='30-day') {startDay=shiftDay(today,-29);endDay=shiftDay(today,1);}
  else if(mode==='rolling-year') {startDay=shiftDay(today,-364);endDay=shiftDay(today,1);}
  else if(mode==='year'||mode==='calendar-year') {const year=Number(filters.year)||Number(today.slice(0,4));startDay=`${year}-01-01`;endDay=`${year+1}-01-01`;}
  else if(mode==='custom' || filters.start!=null || filters.end!=null) {
    if(typeof filters.start==='string' && /^\d{4}-\d{2}-\d{2}$/.test(filters.start)) startDay=filters.start;
    else if(filters.start!=null) start=finite(filters.start)?filters.start:Date.parse(filters.start);
    if(typeof filters.end==='string' && /^\d{4}-\d{2}-\d{2}$/.test(filters.end)) endDay=shiftDay(filters.end,1);
    else if(filters.end!=null) end=finite(filters.end)?filters.end:Date.parse(filters.end);
  }
  if(startDay) start=zonedMidnight(startDay,zone);
  if(endDay) end=zonedMidnight(endDay,zone);
  const invalidCalendar=(startDay&&start==null)||(endDay&&end==null)||(typeof filters.end==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(filters.end)&&zonedMidnight(filters.end,zone)==null);
  return {mode,zone,start:finite(start)?start:null,end:finite(end)?end:null,startDay,endDay,invalid:!!invalidCalendar||(start!=null&&!finite(start))||(end!=null&&!finite(end))||(finite(start)&&finite(end)&&start>=end),endExclusive:true};
}
function listMatch(value,filter) { const wanted=array(filter); return !wanted.length || wanted.includes(value); }
function family(model,aliases={}) { return aliases[model] || model; }
function recordTimestamp(r,c,basis) {
  if(basis==='conversation') return finite(c.createdAt) ? c.createdAt : null;
  return finite(r.timestamp) && !['import','filesystem','database-operation','operation'].includes(r.timeProvenance) ? r.timestamp : null;
}
function originalDay(r,timestamp,zone,basis) {
  if(basis!=='conversation' && r.datePrecision==='day') {
    const value=r.dateValue || r.originalDate || r.timestampOriginal;
    if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  }
  return timeParts(timestamp,zone)?.day || null;
}
function branchMatch(r,branch) {return branch==='all'||(branch==='alternative'?r.selected===false:r.selected!==false);}
function hasCapability(c,key) { const value=c.capabilities?.[key];return value===true || value==='recorded' || value==='available' || (typeof value==='number'&&value>0); }
function thinkingKind(r) {return r.reasoningRepresentation==='summary-only'?'Summary-only exported thinking':r.observed===false||r.reasoningRepresentation==='unavailable'?'Unavailable thinking representation':r.originalTraceAvailable===false?'Unavailable original trace':'Observed exported trace';}
function traceAvailable(r) {return r.category==='thinking'&&r.content.observed&&thinkingKind(r)==='Observed exported trace';}
/** Explicit aliasing only: no text-similarity deduplication. Memberships weight each selected collection. */
export function applyFilters(conversations=[],filters={},options={}) {
  const dateRange=resolveDateRange(filters,options.now);
  const effective={...filters,timeZone:dateRange.zone,branch:filters.branch||filters.branchScope||'selected',perspective:filters.perspective||'unique',timeBasis:filters.timeBasis||'message'};
  if(filters.search){effective.searchScope=filters.searchScope||'excerpt';effective.searchLimit=filters.searchScope==='full'?null:(finite(filters.searchLimit)?Math.max(1,Math.min(8000,filters.searchLimit)):8000);}
  const unsupportedFilterKeys=Object.keys(filters).filter(key=>!SUPPORTED_FILTER_KEYS.has(key));
  const warnings=unsupportedFilterKeys.length?[{code:'unsupported-filter-keys',message:'This saved selection contains filters this version cannot apply.',keys:unsupportedFilterKeys}]:[];const decisions=[];const canonical=new Map();
  for(const original of conversations) {
    const key=filters.aliases?.[original.id] || original.canonicalId || original.id;
    if(!key) {warnings.push({code:'missing-conversation-id',message:'A conversation without a scoped identity was skipped.'});continue;}
    if(canonical.has(key)) {
      const prior=canonical.get(key); const memberships=unique([...array(prior.collectionIds),...array(original.collectionIds)]);
      const takeNew=(original.snapshotCapturedAt||0)>(prior.snapshotCapturedAt||0);
      canonical.set(key,{...(takeNew?original:prior),id:key,collectionIds:memberships});
      decisions.push({label:'Explicit conversation identity',conversationId:key,aliasId:original.id,reason:filters.aliases?.[original.id]?'User-saved alias':'Repeated scoped identity',count:1});
    } else canonical.set(key,{...original,id:key});
  }
  const selected=[];const rows=[];
  for(const c of canonical.values()) {
    if(Array.isArray(filters.conversationIds)&&!filters.conversationIds.includes(c.id)) continue;
    if(array(filters.excludedConversationIds||filters.exclusions).includes(c.id)) continue;
    if(!listMatch(c.sourceId||c.sourceInstanceId||'Unknown source',filters.sourceIds||filters.sources)) continue;
    if(!listMatch(c.snapshotId||'Unknown snapshot',filters.snapshotIds||filters.snapshots)) continue;
    if(!listMatch(platformName(c.provider),array(filters.providers||filters.platforms).map(platformName))) continue;
    if(!listMatch(c.format||'Unknown format',filters.formats)) continue;
    if(array(filters.capabilities).some(k=>!hasCapability(c,k))) continue;
    const membership=array(c.collectionIds);const matches=array(filters.collectionIds||filters.collections);
    const selectedMemberships=matches.length?membership.filter(m=>matches.includes(m)):membership;
    if(matches.length&&!selectedMemberships.length) continue;
    const conversationModels=unique(array(c.records).map(r=>modelName(r.model)));
    if(array(filters.conversationModels).length&&!conversationModels.some(m=>array(filters.conversationModels).includes(m))) continue;
    const weight=effective.perspective==='memberships'?Math.max(1,selectedMemberships.length):1;
    const kept=[];const seen=new Set();
    for(const r of array(c.records)) {
      if(!r.id || seen.has(r.id)) {if(r.id) decisions.push({label:'Repeated segment identity',conversationId:c.id,aliasId:r.id,reason:'Same segment identifier',count:weight});continue;} seen.add(r.id);
      if(!branchMatch(r,effective.branch)) continue;
      const model=modelName(r.model);
      if(!listMatch(model,filters.models)) continue;
      if(!listMatch(r.modelDeveloper||'Unknown developer',filters.modelDevelopers)) continue;
      if(!listMatch(family(model,filters.modelFamilyAliases||filters.modelAliases),filters.modelFamilies)) continue;
      if(!listMatch(r.category||'other',filters.categories)) continue;
      if(!listMatch(r.coverage||'partial',filters.coverage)) continue;
      if(!listMatch(r.reliability||'Recorded',filters.reliability)) continue;
      const timestamp=recordTimestamp(r,c,effective.timeBasis),day=originalDay(r,timestamp,dateRange.zone,effective.timeBasis);
      if(dateRange.invalid) continue;
      if(dateRange.start!=null||dateRange.end!=null) {
        if(timestamp==null) {if(!filters.includeUndated) continue;}
        else if(effective.timeBasis!=='conversation'&&r.datePrecision==='day'&&day) {
          if(dateRange.startDay&&day<dateRange.startDay || dateRange.endDay&&day>=dateRange.endDay) continue;
          if(!dateRange.startDay&&dateRange.start!=null&&timestamp<dateRange.start || !dateRange.endDay&&dateRange.end!=null&&timestamp>=dateRange.end) continue;
        } else if(dateRange.start!=null&&timestamp<dateRange.start || dateRange.end!=null&&timestamp>=dateRange.end) continue;
      }
      const content=analyzeText(r.text,r);
      const characteristics=array(filters.content||filters.characteristics);
      if(characteristics.includes('code')&&!content.codeBlocks) continue;
      if(characteristics.includes('attachments')&&!array(r.attachments).length) continue;
      if(characteristics.includes('links')&&!content.links.length) continue;
      const searchableText=effective.searchScope==='full'?String(r.text||''):String(r.text||'').slice(0,effective.searchLimit||8000);
      if(filters.search&&!`${c.title||''} ${searchableText} ${model} ${c.provider||''}`.toLocaleLowerCase().includes(String(filters.search).toLocaleLowerCase())) continue;
      const row={...r,category:CATEGORIES.includes(r.category)?r.category:'other',model,provider:platformName(c.provider),conversationId:c.id,title:c.title||'Untitled conversation',sourceId:c.sourceId||c.sourceInstanceId||'Unknown source',snapshotId:c.snapshotId||null,format:c.format||'Unknown format',collectionIds:selectedMemberships,weight,timestamp,day,content};
      kept.push(row);rows.push(row);
    }
    // Keep structurally empty/unsupported conversations visible when no record-level selection is requested.
    const recordFilter=array(filters.models).length||array(filters.categories).length||filters.search||array(filters.content).length||dateRange.start!=null||dateRange.end!=null;
    if(kept.length||(!array(c.records).length&&!recordFilter)) selected.push({...c,records:kept,weight,selectedCollectionIds:selectedMemberships});
  }
  if(dateRange.invalid) warnings.push({code:'invalid-date-range',message:'The date range is invalid; no records are selected.'});
  if(filters.timeZone && resolvedTimeZone(filters.timeZone)!==filters.timeZone && !['local','Local'].includes(filters.timeZone)) warnings.push({code:'invalid-timezone',message:'An invalid timezone was replaced by UTC.'});
  return {conversations:selected,rows,filters:effective,dateRange,warnings,deduplication:decisions,originalConversationCount:conversations.length,unsupportedFilterKeys,filterStatus:unsupportedFilterKeys.length?'partial':'applied'};
}
const segmenter = typeof Intl.Segmenter==='function' ? new Intl.Segmenter(undefined,{granularity:'word'}) : null;
export function analyzeText(value,record={}) {
  if(record.contentAnalysis && typeof record.contentAnalysis==='object')return record.contentAnalysis;
  const cached=textAnalysisCache.get(record);
  if(cached&&cached.value===value&&cached.observed===record.observed&&cached.category===record.category&&cached.references===record.references)return cached.analysis;
  const text=clampText(value); const observed=record.observed!==false && record.category!=='redacted';
  const blocks=[];let inFence=false,delimiter='',body=[],language='',start=0;
  const lines=text.split(/\r?\n/);
  for(let i=0;i<lines.length;i++) {
    const open=lines[i].match(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/);
    if(!inFence&&open) {inFence=true;delimiter=open[1];language=open[2].trim().split(/\s+/)[0]||'Unspecified';body=[];start=i;continue;}
    if(inFence) {
      if(new RegExp('^ {0,3}'+(delimiter[0]==='`'?'`':'~')+'{'+delimiter.length+',}\\s*$').test(lines[i])) {blocks.push({language,lines:body.length,characters:codePointLength(body.join('\n')),closed:true,startLine:start+1,endLine:i+1});inFence=false;}
      else body.push(lines[i]);
    }
  }
  if(inFence) blocks.push({language,lines:body.length,characters:codePointLength(body.join('\n')),closed:false,startLine:start+1,endLine:lines.length});
  const fenceRows=new Set(); for(const b of blocks) for(let i=b.startLine-1;i<b.endLine;i++) fenceRows.add(i);
  const prose=lines.filter((_,i)=>!fenceRows.has(i)).join('\n');
  const links=[];
  const linkPattern=/\[[^\]\n]*\]\((https?:\/\/[^\s)]+)(?:\s+['"][^\n]*?['"])?\)|<((?:https?):\/\/[^<>\s]+)>|\b(https?:\/\/[^\s<>]+)/gu;
  for(const m of prose.matchAll(linkPattern)) {
    const url=(m[1]||m[2]||m[3]).replace(/[.,;!?]+$/,'');
    try {const parsed=new URL(url);links.push({url,domain:parsed.hostname.toLowerCase(),offset:m.index});} catch { /* malformed URL stays ordinary text */ }
  }
  let tables=0;
  for(let i=1;i<lines.length;i++) if(!fenceRows.has(i)&&/\|/.test(lines[i-1])&&/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i])) tables++;
  const textualCitations=[...prose.matchAll(/(?:cite|genui)[\s\S]*?|\[\^[^\]\n]+\]/g)].length;
  let words=0;if(segmenter){for(const s of segmenter.segment(text))if(s.isWordLike)words++;}else{words=(text.match(/[\p{L}\p{N}]+/gu)||[]).length;}
  const analysis={observed,characters:observed?codePointLength(text):null,words:observed?words:null,segmentation:segmenter?'Intl.Segmenter word-like segments':'Unicode letter/number runs (fallback)',codeBlocks:blocks.length,codeLines:sum(blocks,b=>b.lines),codeCharacters:sum(blocks,b=>b.characters),proseCharacters:codePointLength(prose),blocks,links,tables,textualCitations,structuredReferences:array(record.references).length,truncated:text.length<String(value??'').length};
  textAnalysisCache.set(record,{value,observed:record.observed,category:record.category,references:record.references,analysis});return analysis;
}
function groups(rows,key,extra={}) {
  const map=new Map();
  for(const r of rows) {
    const label=key(r);if(label==null) continue;
    if(!map.has(label)) map.set(label,{label,count:0,user:0,thinking:0,response:0,characters:0,words:0,evidenceIds:[],...extra});
    const g=map.get(label);g.count+=r.weight;g[r.category] = (g[r.category]||0)+r.weight;
    g.characters+=(r.content.characters||0)*r.weight;g.words+=(r.content.words||0)*r.weight;g.evidenceIds.push(r.id);
  }
  return [...map.values()].map(g=>({...g,evidenceIds:unique(g.evidenceIds)}));
}
function sortedCount(rows) {return rows.sort((a,b)=>b.count-a.count||String(a.label).localeCompare(String(b.label)));}
function logicalCounts(rows,category) {
  const map=new Map();for(const r of rows) if(r.category===category&&r.logicalId) map.set(`${r.conversationId}:${r.logicalId}`,r.weight);
  return sum([...map.values()],v=>v);
}
function uniqueObjectCounts(rows) {const map=new Map();for(const r of rows) if(r.objectId) map.set(`${r.conversationId}:${r.objectId}`,r.weight);return sum([...map.values()],v=>v);}
function coverage(available,total,explanation,reliability='Derived from recorded data') {return {available,total,percent:total?100*available/total:null,explanation,reliability};}
function percentile(values,p) {if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)*p)];}
function distribution(rows,category) {
  const list=rows.filter(r=>r.category===category&&r.content.observed);const values=[];
  for(const r of list) for(let i=0;i<r.weight;i++) values.push(r.content.characters);
  return {label:category,count:count(list),minimum:values.length?values.reduce((a,b)=>Math.min(a,b),Infinity):null,median:percentile(values,.5),p90:percentile(values,.9),maximum:values.length?values.reduce((a,b)=>Math.max(a,b),-Infinity):null,mean:ratio(values.reduce((a,b)=>a+b,0),values.length),unit:'Unicode code points per observed content segment',evidenceIds:list.map(r=>r.id)};
}
function isoWeek(day) {const date=new Date(day+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+4-(date.getUTCDay()||7));const yearStart=new Date(Date.UTC(date.getUTCFullYear(),0,1));return `${date.getUTCFullYear()}-W${String(Math.ceil(((date-yearStart)/86400000+1)/7)).padStart(2,'0')}`;}
function measuredUsage(rows) {
  const groupsMap=new Map(),seen=new Set(),unsupported=[];
  const add=(r,key,value,scope,unit='tokens',provenance='recorded')=>{
    if(!finite(value)||value<0) return;
    const identity=`${r.conversationId}:${r.usage?.id||r.objectId||r.id}:${scope}:${key}`;
    if(seen.has(identity))return;seen.add(identity);
    const grouping=`${scope}:${key}:${unit}`;
    if(!groupsMap.has(grouping))groupsMap.set(grouping,{label:key,scope,unit,value:0,count:0,evidenceIds:[],provenance});
    const g=groupsMap.get(grouping);g.value+=value*r.weight;g.count+=r.weight;g.evidenceIds.push(r.id);
  };
  for(const r of rows) {
    const u=r.usage;if(!u||typeof u!=='object')continue;
    const fields=Array.isArray(u)?u:array(u.fields);
    if(fields.length) {for(const f of fields) if(f.verified!==false && f.scope && f.name) add(r,f.name,f.value,f.scope,f.unit||'tokens',f.provenance||r.rawPath);continue;}
    const scope=u.scope;
    if(!scope || !['request','generation','context','recap','execution'].includes(scope)) {unsupported.push({label:'Uninterpreted usage metadata',recordId:r.id,conversationId:r.conversationId,count:r.weight,reason:'No validated usage scope; excluded from consumption totals',evidenceIds:[r.id]});continue;}
    for(const [key,value] of Object.entries(u)) {
      if(['id','scope','unit','durationMs','provenance','verified','raw'].includes(key))continue;
      if(finite(value))add(r,key,value,scope,u.unit||'tokens',u.provenance||r.rawPath);
    }
  }
  return {values:[...groupsMap.values()],unsupported};
}
function tools(rows) {
  const calls=new Map(),outputs=new Map(),indicators=[];const search=[];const sequences=[];const indicatorSeen=new Set(),outputSeen=new Set();
  for(const r of rows) {
    const event=r.event || {};
    const callKey=`${r.conversationId}:${event.callId||event.id||r.id}`;
    if(r.category==='tool_call'||event.type==='tool_call') {
      if(!calls.has(callKey))calls.set(callKey,{key:callKey,label:event.name||r.toolName||'Unnamed recorded tool',callId:event.callId||event.id||null,count:r.weight,conversationId:r.conversationId,status:event.status||'Unknown',outputCount:0,evidenceIds:[r.id]});
      else calls.get(callKey).evidenceIds.push(r.id);
    }
    if(r.category==='tool_output'||event.type==='tool_output') {
      const outputKey=`${r.conversationId}:${event.id||r.objectId||r.id}`;
      if(!outputSeen.has(outputKey)){outputSeen.add(outputKey);if(!outputs.has(callKey)) outputs.set(callKey,[]);outputs.get(callKey).push(r);}
    }
    if(event.type==='search') search.push(r);
    for(const indicator of array(r.toolIndicators||r.toolIcons)){const label=typeof indicator==='string'?indicator:(indicator.name||'Unspecified indicator');const key=`${r.conversationId}:${r.objectId||r.id}:${label}`;if(!indicatorSeen.has(key)){indicatorSeen.add(key);indicators.push({label,count:r.weight,evidenceIds:[r.id],unit:'Exported indicators; not invocations'});}}
    if(r.event)sequences.push({label:event.name||event.type||'Recorded event',id:r.id,conversationId:r.conversationId,type:event.type||'other',status:event.status||'Unknown',timestamp:r.timestamp,callId:event.callId||null,count:r.weight,evidenceIds:[r.id]});
  }
  for(const [key,call] of calls) { const matched=outputs.get(key)||[];call.outputCount=count(matched);call.evidenceIds=unique([...call.evidenceIds,...matched.map(r=>r.id)]); }
  const named=new Map();for(const c of calls.values()){if(!named.has(c.label))named.set(c.label,{label:c.label,count:0,outputCount:0,evidenceIds:[]});const n=named.get(c.label);n.count+=c.count;n.outputCount+=c.outputCount;n.evidenceIds.push(...c.evidenceIds);}
  const outputCount=sum([...outputs.values()],v=>count(v));
  return {named:sortedCount([...named.values()]),associations:[...calls.values()],outputCount,unmatchedOutputs:[...outputs.entries()].filter(([key])=>!calls.has(key)).flatMap(([,v])=>v).map(r=>({label:r.event?.name||'Unmatched output',count:r.weight,evidenceIds:[r.id],conversationId:r.conversationId})),indicators,search,sequences};
}
function attachmentTables(rows) {
  const types=new Map();const metadata=[];let total=0,sizeKnown=0,imageKnown=0,missing=0;const seen=new Set();
  for(const r of rows)for(const a of array(r.attachments)) {
    const key=`${r.conversationId}:${a.id||a.fileId||a.asset_pointer||`${r.objectId}:${a.rawPath||a.sourcePath||a.name||a.filename||''}:${a.mimeType||a.mime_type||a.type||''}`}`;if(seen.has(key))continue;seen.add(key);
    const label=a.mimeType||a.mime_type||a.type||'Unknown type';
    const bytes=finite(a.sizeBytes)?a.sizeBytes:finite(a.size_bytes)?a.size_bytes:null;
    if(!types.has(label))types.set(label,{label,count:0,recordedBytes:0,knownSizeCount:0,evidenceIds:[]});
    const g=types.get(label);g.count+=r.weight;g.recordedBytes+=(bytes||0)*r.weight;g.knownSizeCount+=bytes!=null?r.weight:0;g.evidenceIds.push(r.id);total+=r.weight;sizeKnown+=bytes!=null?r.weight:0;
    const width=finite(a.width)?a.width:finite(a.imageWidth)?a.imageWidth:null,height=finite(a.height)?a.height:finite(a.imageHeight)?a.imageHeight:null;
    imageKnown+=(width!=null&&height!=null)?r.weight:0;missing+=a.available===false||a.missing===true?r.weight:0;
    metadata.push({label,count:r.weight,bytes,width,height,availability:a.available===false||a.missing===true?'Recorded missing':a.available===true?'Recorded available':'Unknown',evidenceIds:[r.id],conversationId:r.conversationId});
  }
  return {types:sortedCount([...types.values()]),metadata,total,sizeKnown,imageKnown,missing};
}
function numericalRecapDuration(text) {
  const label=String(text||'').trim();
  const prefix=/^(?:Thought|Thinking) for\s+(.+)$/i.exec(label);if(!prefix)return null;
  const units={ms:1,millisecond:1,milliseconds:1,s:1000,sec:1000,second:1000,seconds:1000,m:60000,min:60000,minute:60000,minutes:60000,h:3600000,hour:3600000,hours:3600000};
  const pattern=/(\d+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|sec|s|minutes?|min|m|hours?|h)\b/gi;
  let milliseconds=0,remainder=prefix[1],matches=0;
  for(const match of prefix[1].matchAll(pattern)){milliseconds+=Number(match[1])*units[match[2].toLowerCase()];remainder=remainder.replace(match[0],'');matches++;}
  return matches&&!remainder.replace(/[\s,]+|and/gi,'')?{milliseconds,label}:null;
}
/** All chart arrays are the exact numerical table arrays, so report/table/chart agreement is structural. */
export function buildReport(conversations=[],filters={},options={}) {
  const now=finite(options.now)?options.now:Date.now();
  const annotations=options.annotations||{};
  const committedFilters={...filters};
  for(const [key,value] of Object.entries({aliases:annotations.dedupAliases,displayAliases:annotations.aliases,excludedConversationIds:annotations.exclusions,modelFamilyAliases:annotations.modelFamilyAliases}))if(value!==undefined&&!own(committedFilters,key))committedFilters[key]=value;
  const selected=applyFilters(conversations,committedFilters,{now});const {rows,dateRange}=selected;const convs=selected.conversations;
  const total=count(rows),observed=rows.filter(r=>r.content.observed),dated=rows.filter(r=>r.day!=null);
  const timed=dated.filter(r=>r.datePrecision!=='day'&&selected.filters.timeBasis!=='conversation');
  const categories=sortedCount(groups(rows,r=>r.category));
  const platforms=sortedCount(groups(rows,r=>r.provider)),models=sortedCount(groups(rows,r=>r.model));
  const modelDevelopers=sortedCount(groups(rows,r=>r.modelDeveloper||'Unknown developer'));
  const modelFamilies=sortedCount(groups(rows,r=>family(r.model,filters.modelFamilyAliases||filters.modelAliases)));
  const timelineDaily=groups(dated,r=>r.day).map(g=>({...g,date:g.label})).sort((a,b)=>a.date.localeCompare(b.date));
  const timelineWeekly=groups(dated,r=>isoWeek(r.day)).map(g=>({...g,date:g.label})).sort((a,b)=>a.date.localeCompare(b.date));
  const timelineMonthly=groups(dated,r=>r.day.slice(0,7)).map(g=>({...g,date:g.label})).sort((a,b)=>a.date.localeCompare(b.date));
  const hour=groups(timed,r=>String(timeParts(r.timestamp,dateRange.zone).hour).padStart(2,'0')).sort((a,b)=>a.label.localeCompare(b.label));
  const weekday=groups(dated,r=>['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(r.day+'T00:00:00Z').getUTCDay()]);
  const dateModel=groups(dated,r=>`${r.day}|${r.model}`).map(g=>({...g,date:g.label.split('|')[0],model:g.label.slice(11)}));
  const datePlatform=groups(dated,r=>`${r.day}|${r.provider}`).map(g=>({...g,date:g.label.split('|')[0],provider:g.label.slice(11)}));
  const activeDays=timelineDaily.length;let longestStreak=0,currentStreak=0,lastDay=null;
  for(const d of timelineDaily){currentStreak=lastDay&&calendarDayNumber(d.date)-calendarDayNumber(lastDay)===1?currentStreak+1:1;longestStreak=Math.max(longestStreak,currentStreak);lastDay=d.date;}
  const dayCounts=new Map(timelineDaily.map(d=>[d.date,d]));const rolling=[];
  const spanStart=dateRange.startDay||timelineDaily[0]?.date,spanEnd=dateRange.endDay?shiftDay(dateRange.endDay,-1):timelineDaily.at(-1)?.date;
  const spanDays=spanStart&&spanEnd?calendarDayNumber(spanEnd)-calendarDayNumber(spanStart)+1:0;
  // Bound rendered daily grids; metrics still cover all selected records.
  if(spanDays>0&&spanDays<=20000) for(let i=0;i<spanDays;i++){const day=shiftDay(spanStart,i);let n=0;for(let j=0;j<7;j++)n+=dayCounts.get(shiftDay(day,-j))?.count||0;rolling.push({label:day,date:day,count:dayCounts.get(day)?.count||0,rolling7:n/7,windowDays:7,evidenceIds:dayCounts.get(day)?.evidenceIds||[]});}
  const codeMap=new Map(),domains=new Map();
  for(const r of rows) {
    for(const b of r.content.blocks){if(!codeMap.has(b.language))codeMap.set(b.language,{label:b.language,language:b.language,count:0,lines:0,characters:0,unclosed:0,evidenceIds:[],classification:'Declared fence language; no language inference'});const g=codeMap.get(b.language);g.count+=r.weight;g.lines+=b.lines*r.weight;g.characters+=b.characters*r.weight;g.unclosed+=!b.closed?r.weight:0;g.evidenceIds.push(r.id);}
    for(const link of r.content.links){if(!domains.has(link.domain))domains.set(link.domain,{label:link.domain,count:0,evidenceIds:[]});const g=domains.get(link.domain);g.count+=r.weight;g.evidenceIds.push(r.id);}
    for(const ref of array(r.references)){const url=ref.url||ref.href;if(!url)continue;try{const domain=new URL(url).hostname;if(!domains.has(domain))domains.set(domain,{label:domain,count:0,evidenceIds:[]});const g=domains.get(domain);g.count+=r.weight;g.evidenceIds.push(r.id);}catch{}}
  }
  const toolInfo=tools(rows),attachments=attachmentTables(rows),usage=measuredUsage(rows);
  const durations=[],contextOccupancy=[],durationSeen=new Set(),contextSeen=new Set();
  for(const r of rows) {
    const e=r.event||{};
    const eventKey=`${r.conversationId}:${e.id||r.objectId||r.id}:event-duration`;
    if(finite(e.durationMs)&&e.durationMs>=0&&!durationSeen.has(eventKey)){durationSeen.add(eventKey);durations.push({label:e.name||e.type||'Recorded event',scope:'recorded-event',milliseconds:e.durationMs,count:r.weight,evidenceIds:[r.id],provenance:r.rawPath||null,reliability:'Recorded'});}
    const recordKey=`${r.conversationId}:${r.objectId||r.id}:source-duration`;
    if(finite(r.durationMs)&&r.durationMs>=0&&!durationSeen.has(recordKey)){durationSeen.add(recordKey);durations.push({label:r.category==='recap'?(/^derived/i.test(r.duration?.reliability||'')?'Numerical exported recap duration':'Recorded recap duration'):'Recorded duration',scope:r.category==='recap'?'recap (not total compute)':r.duration?.scope||'explicit-source-duration',milliseconds:r.durationMs,originalValue:r.duration?.value??r.durationMs,originalUnit:r.duration?.unit||'milliseconds',count:r.weight,evidenceIds:[r.id],provenance:r.duration?.provenance||r.rawPath||null,reliability:/^derived/i.test(r.duration?.reliability||'')?'Derived from recorded data':'Recorded'});}
    else if(r.category==='recap'&&!finite(r.durationMs)){const parsed=numericalRecapDuration(r.text);if(parsed)durations.push({label:parsed.label,scope:'numerical exported recap label (not total compute)',milliseconds:parsed.milliseconds,count:r.weight,evidenceIds:[r.id],provenance:r.rawPath||null,reliability:'Derived from recorded data'});}
    if(r.contextOccupancy){const key=`${r.conversationId}:${r.objectId||r.id}`;if(!contextSeen.has(key)){contextSeen.add(key);const c=r.contextOccupancy;contextOccupancy.push({label:'Recorded context occupancy',totalTokens:finite(c.totalTokens)?c.totalTokens:null,maxContextLength:finite(c.maxContextLength)?c.maxContextLength:null,scope:'Context occupancy; not consumed or billable usage',count:r.weight,evidenceIds:[r.id],provenance:c.provenance||r.rawPath});}}
  }
  const originalIndex=new Map(conversations.map(c=>[filters.aliases?.[c.id]||annotations.dedupAliases?.[c.id]||c.canonicalId||c.id,c]));
  const conversationRows=convs.map(c=>{
    const r=c.records;const branch=c.branches||{};const all=array(originalIndex.get(c.id)?.records);
    const retainedAlternatives=all.filter(x=>x.selected===false).length;
    const ids=unique(r.map(x=>x.logicalId).filter(Boolean));
    return {id:c.id,label:c.title||'Untitled conversation',title:c.title||'Untitled conversation',provider:platformName(c.provider),format:c.format||'Unknown format',sourceId:c.sourceId||c.sourceInstanceId||'Unknown source',count:count(r),segments:count(r),objects:uniqueObjectCounts(r),userMessages:logicalCounts(r,'user'),responseMessages:logicalCounts(r,'response'),logicalMessages:ids.length*c.weight,interactionDepth:(selected.filters.branch==='selected'?branch.selectedDepth??branch.maxDepth:branch.maxDepth)??null,depthUnit:branch.depthUnit||'Unavailable when parent-chain depth is not retained',retainedAlternatives:branch.alternativeRecords??retainedAlternatives,retainedAlternativeNodes:hasCapability(c,'branches')?array(branch.alternativeNodes).length:null,branchPoints:hasCapability(c,'branches')?branch.branchPoints??null:null,selectedSegments:all.filter(x=>x.selected!==false).length,allRetainedSegments:all.length,characters:sum(r,x=>(x.content.characters||0)*x.weight),models:unique(r.map(x=>x.model)),collectionIds:c.selectedCollectionIds,evidenceIds:r.map(x=>x.id)};
  }).sort((a,b)=>b.characters-a.characters);
  const modelChanges=[];const repeatedMap=new Map();const versions=[];
  for(const c of convs) {
    let previous=null;
    for(const r of c.records){if(r.category==='response'&&r.model!==UNKNOWN_MODEL){if(previous&&previous!==r.model)modelChanges.push({label:`${previous} → ${r.model}`,conversationId:c.id,count:r.weight,evidenceIds:[r.id],from:previous,to:r.model});previous=r.model;}
      if(r.category==='user'&&r.content.observed&&(r.promptMatchKey||r.promptFingerprint||r.text)){const prompt=r.promptMatchKey||r.promptFingerprint||String(r.text).normalize('NFC').replace(/\s+/gu,' ').trim();if(!repeatedMap.has(prompt))repeatedMap.set(prompt,[]);repeatedMap.get(prompt).push(r);}
      if(r.versionId!=null||r.version!=null)versions.push({label:String(r.versionId??r.version),conversationId:c.id,selected:r.selected!==false,count:r.weight,category:r.category,characters:r.content.characters,evidenceIds:[r.id]});
    }
  }
  const repeatedPrompts=[...repeatedMap.values()].filter(v=>unique(v.map(r=>`${r.conversationId}:${r.logicalId||r.objectId||r.id}`)).length>1).map((v,i)=>({label:`Exact prompt group ${i+1}`,count:unique(v.map(r=>`${r.conversationId}:${r.logicalId||r.objectId||r.id}`)).length,matchingRule:'Unicode NFC; trim and collapse whitespace; case-sensitive; no semantic matching',evidenceIds:v.map(r=>r.id)}));
  const quality=[];
  for(const c of convs) for(const d of array(c.diagnostics))quality.push({label:d.code||'Diagnostic',count:1,conversationId:c.id,reason:d.message||String(d),evidenceIds:array(d.recordId)});
  quality.push(...selected.warnings.map(w=>({label:w.code,count:1,reason:w.message,evidenceIds:[]})),...usage.unsupported);
  const capabilityRows=[];
  for(const dimension of ['source','format','collection','provider']){
    const caps=new Map();
    for(const c of convs){const labels=dimension==='collection'?array(c.selectedCollectionIds):[dimension==='source'?(c.sourceId||c.sourceInstanceId||'Unknown source'):dimension==='format'?(c.format||'Unknown format'):platformName(c.provider)];
      for(const label of labels)for(const [cap,value] of Object.entries(c.capabilities||{})){const key=`${label}:${cap}`;if(!caps.has(key))caps.set(key,{label,dimension,capability:cap,count:0,available:0,total:0,evidenceIds:[]});const row=caps.get(key);row.total++;row.count++;if(value===true||value==='recorded'||value==='available'||(finite(value)&&value>0))row.available++;row.evidenceIds.push(...c.records.map(r=>r.id));}}
    capabilityRows.push(...caps.values());
  }
  const thinkingChars=sum(rows.filter(r=>r.category==='thinking'),r=>(r.content.characters||0)*r.weight),responseChars=sum(rows.filter(r=>r.category==='response'),r=>(r.content.characters||0)*r.weight);
  const pairable=convs.filter(c=>c.records.some(traceAvailable)&&c.records.some(r=>r.category==='response'&&r.content.observed));
  const pairedThinking=sum(pairable,c=>sum(c.records.filter(traceAvailable),r=>r.content.characters*r.weight));
  const pairedResponses=sum(pairable,c=>sum(c.records.filter(r=>r.category==='response'&&r.content.observed),r=>r.content.characters*r.weight));
  const summary={conversations:convs.length,collectionMemberships:sum(convs,c=>c.selectedCollectionIds.length),selectedPopulation:sum(convs,c=>c.weight),records:total,segments:total,messages:logicalCounts(rows,'user')+logicalCounts(rows,'response'),objects:uniqueObjectCounts(rows),userMessages:logicalCounts(rows,'user'),responseMessages:logicalCounts(rows,'response'),userSegments:count(rows.filter(r=>r.category==='user')),assistantTextSegments:count(rows.filter(r=>r.category==='response')),thinkingSegments:count(rows.filter(r=>r.category==='thinking')),recapRecords:count(rows.filter(r=>r.category==='recap')),commentarySegments:count(rows.filter(r=>r.category==='commentary')),redactedSegments:count(rows.filter(r=>r.category==='redacted')),toolCalls:sum(toolInfo.associations,r=>r.count),toolOutputs:toolInfo.outputCount,searchEvents:count(toolInfo.search),toolIndicators:sum(toolInfo.indicators,r=>r.count),characters:sum(observed,r=>r.content.characters*r.weight),words:sum(observed,r=>r.content.words*r.weight),thinkingCharacters:thinkingChars,responseCharacters:responseChars,thinkingResponseRatio:pairable.length&&pairedResponses>0?pairedThinking/pairedResponses:null,activeDays,longestStreak,averagePerActiveDay:ratio(count(dated),activeDays),averagePerCalendarDay:ratio(count(dated),spanDays),busiestDay:[...timelineDaily].sort((a,b)=>b.count-a.count)[0]||null,datedRecords:count(dated),undatedRecords:total-count(dated),knownModelRecords:count(rows.filter(r=>r.model!==UNKNOWN_MODEL)),unknownModelRecords:count(rows.filter(r=>r.model===UNKNOWN_MODEL)),codeBlocks:sum(rows,r=>r.content.codeBlocks*r.weight),codeLines:sum(rows,r=>r.content.codeLines*r.weight),codeCharacters:sum(rows,r=>r.content.codeCharacters*r.weight),proseCharacters:sum(rows,r=>r.content.proseCharacters*r.weight),links:sum(rows,r=>r.content.links.length*r.weight),markdownTables:sum(rows,r=>r.content.tables*r.weight),textualCitations:sum(rows,r=>r.content.textualCitations*r.weight),structuredReferences:sum(rows,r=>r.content.structuredReferences*r.weight),attachments:attachments.total,recordedDurations:sum(durations,r=>r.count),usageRecords:unique(usage.values.flatMap(r=>r.evidenceIds)).length,unsupportedConversations:convs.filter(c=>c.supported===false||c.capabilities?.supported===false).length};
  summary.durationObservations=sum(durations,r=>r.count);
  summary.recordedDurations=sum(durations.filter(r=>r.reliability==='Recorded'),r=>r.count);
  summary.recapDurationObservations=sum(durations.filter(r=>r.scope.includes('recap')),r=>r.count);
  summary.toolIndicatorObjects=uniqueObjectCounts(rows.filter(r=>array(r.toolIndicators||r.toolIcons).length));
  const thinkingRows=rows.filter(r=>r.category==='thinking');
  summary.thinkingTraceSegments=count(thinkingRows.filter(traceAvailable));
  summary.thinkingSummarySegments=count(thinkingRows.filter(r=>r.reasoningRepresentation==='summary-only'));
  summary.thinkingUnavailableSegments=count(thinkingRows.filter(r=>!r.content.observed||r.reasoningRepresentation==='unavailable'));
  summary.thinkingTraceCharacters=sum(thinkingRows.filter(traceAvailable),r=>r.content.characters*r.weight);
  summary.thinkingSummaryCharacters=sum(thinkingRows.filter(r=>r.reasoningRepresentation==='summary-only'),r=>(r.content.characters||0)*r.weight);
  const today=timeParts(now,dateRange.zone).day;
  summary.currentStreak=lastDay===today||lastDay===shiftDay(today,-1)?currentStreak:0;
  summary.codeCharacterProportion=ratio(summary.codeCharacters,summary.characters);
  const metricCoverage={timestamps:coverage(count(dated),total,'Original message/event dates only unless explicit conversation-date basis is selected. Undated records remain visible.'),hourOfDay:coverage(count(timed),total,'Day-only and conversation dates are excluded from hour distributions.'),models:coverage(summary.knownModelRecords,total,'Only exported exact model identifiers. Platform names are not substitute model IDs.'),platforms:coverage(count(rows.filter(r=>r.provider!==UNKNOWN_PLATFORM)),total,'Known original provenance; container shape is not proof of platform.'),logicalMessages:coverage(count(rows.filter(r=>r.logicalId)),total,'Segments with an identifiable logical message boundary. Source-native segments remain counted separately.'),objects:coverage(count(rows.filter(r=>r.objectId)),total,'Segments retaining original stored-object identity.'),text:coverage(count(observed),total,'Export-observed text. Redacted or unobserved content is unavailable, not zero.'),thinkingResponseRatio:coverage(pairable.length,convs.length,'Conversations containing both observed thinking and response text; the ratio is Unicode code points, not hidden reasoning.'),attachmentSize:coverage(attachments.sizeKnown,attachments.total,'Explicit byte sizes only; attachment file_token_size never enters request usage.'),attachmentAvailability:coverage(attachments.metadata.filter(a=>a.availability!=='Unknown').reduce((n,a)=>n+a.count,0),attachments.total,'Availability only when recorded; metadata absence does not imply no attachment.'),durations:coverage(unique(durations.flatMap(r=>r.evidenceIds)).length,rows.length,'Explicit nonnegative durations only. Recap duration is not total compute time.'),usage:coverage(unique(usage.values.flatMap(r=>r.evidenceIds)).length,rows.length,'Only metadata with validated request/generation/context scope. No consumed-token estimate, billable cost or subscription inference.'),originalRecords:coverage(count(rows.filter(r=>r.coverage==='original')),total,'Normalized and partial records have reduced source detail.')};
  metricCoverage.thinkingTrace=coverage(summary.thinkingTraceSegments,count(thinkingRows),'Exported thinking records retaining an observed original trace. Summary-only representations and unavailable text remain separate.');
  metricCoverage.thinkingResponseRatio.explanation='Conversations containing both an observed exported thinking trace and response text. Summary-only thinking is excluded from this trace/response code-point ratio; hidden reasoning is never reconstructed.';
  const definitions={
    activity:{countingUnit:'Content segment',eligiblePopulation:'Selected retained records',filterScope:'Applied shared filters; models select individual records',timeBasis:selected.filters.timeBasis,branchPolicy:selected.filters.branch,derivation:'Sum of source-native content segments, weighted only in membership perspective',coverage:metricCoverage.timestamps,reliability:'Derived from recorded data'},
    messages:{countingUnit:'Logical message with identified boundary',eligiblePopulation:'User or final response records with logicalId',filterScope:'Applied record-level filters',timeBasis:selected.filters.timeBasis,branchPolicy:selected.filters.branch,derivation:'Distinct scoped logical identities separately for user and final response categories',coverage:metricCoverage.logicalMessages,reliability:'Derived from recorded data'},
    composition:{countingUnit:'Content segment and Unicode code points',eligiblePopulation:'Selected observed text; redacted text unavailable',filterScope:'Applied shared filters',timeBasis:selected.filters.timeBasis,branchPolicy:selected.filters.branch,derivation:'Category remains separate from author role; code points count Array.from(text)',coverage:metricCoverage.text,reliability:'Derived from recorded data'},
    words:{countingUnit:segmenter?'Intl.Segmenter word-like segment':'Unicode letter/number run',eligiblePopulation:'Selected observed text',filterScope:'Applied shared filters',timeBasis:selected.filters.timeBasis,branchPolicy:selected.filters.branch,derivation:'Unicode multilingual segmentation; depends on runtime ICU version, not whitespace-only word counting',coverage:metricCoverage.text,reliability:'Derived from recorded data'},
    structure:{countingUnit:'Conversation, object, logical boundary or retained branch',eligiblePopulation:'Selected conversations; retained structure comparisons within them',filterScope:'Selected conversations and applied records; all-retained structural totals are explicitly labelled',timeBasis:selected.filters.timeBasis,branchPolicy:selected.filters.branch,derivation:'Explicit branch/version identities; no missing boundary invention; alternative segments are not extra logical requests',coverage:metricCoverage.objects,reliability:'Derived from recorded data'},
    content:{countingUnit:'Recognizable Markdown structure or recorded attachment/reference',eligiblePopulation:'Observed selected text and retained metadata',filterScope:'Applied shared filters',timeBasis:selected.filters.timeBasis,branchPolicy:selected.filters.branch,derivation:'Fenced code; declared languages only; reliable Markdown separator tables; HTTP(S) links; exported references separately from textual citations',coverage:metricCoverage.text,reliability:'Derived from recorded data'},
    tools:{countingUnit:'Scoped recorded call/event identity',eligiblePopulation:'Selected recorded tool/event records',filterScope:'Applied shared filters',timeBasis:selected.filters.timeBasis,branchPolicy:selected.filters.branch,derivation:'Join call/output IDs within conversation; display segments and tool indicators do not create invocations',coverage:coverage(summary.toolCalls,total,'Calls present in selected records; absence is no proof of no hidden tools'),reliability:'Recorded'},
    timing:{countingUnit:'Milliseconds with original scope',eligiblePopulation:'Explicit validated durations',filterScope:'Applied shared filters',timeBasis:'Recorded duration, never user/assistant timestamp delta',branchPolicy:selected.filters.branch,derivation:'Preserve source duration scope; recap is not compute time',coverage:metricCoverage.durations,reliability:durations.some(r=>r.reliability==='Derived from recorded data')?'Derived from recorded data':'Recorded'},
    usage:{countingUnit:'Recorded unit, grouped by verified scope and field',eligiblePopulation:'Explicit interpretable usage metadata',filterScope:'Applied shared filters',timeBasis:'Usage record timestamp when available',branchPolicy:selected.filters.branch,derivation:'No addition across overlapping fields or across context occupancy and request consumption',coverage:metricCoverage.usage,reliability:'Recorded'},
    quality:{countingUnit:'Conversation/segment with diagnostic or capability',eligiblePopulation:'Selected source data',filterScope:'Applied shared filters',timeBasis:'Snapshot capture identity; source timestamps separate',branchPolicy:selected.filters.branch,derivation:'Original metadata, adapter diagnostics and explicit deduplication decisions',coverage:metricCoverage.originalRecords,reliability:'Derived from recorded data'}
  };
  const evidence=rows.map(r=>({id:r.id,recordId:r.id,conversationId:r.conversationId,title:r.title,provider:r.provider,model:r.model,modelDeveloper:r.modelDeveloper||'Unknown developer',category:r.category,text:r.observed===false||r.category==='redacted'?null:(typeof r.textExcerpt==='string'?r.textExcerpt:r.text),textTruncated:r.textTruncated===true||r.textExcerpt===true||typeof r.textExcerpt==='string',fullTextCharacters:r.content.characters,date:r.timestamp,day:r.day,datePrecision:r.datePrecision||'unknown',sourceId:r.sourceId,snapshotId:r.snapshotId,sourceFormat:r.format,classification:r.coverage||'partial',provenance:r.rawPath||null,timeProvenance:r.timeProvenance||'unavailable',modelProvenance:r.modelProvenance||'unknown',logicalId:r.logicalId||null,objectId:r.objectId||null,originalObjectId:r.originalObjectId||null,reasoningRepresentation:r.reasoningRepresentation||null,originalTraceAvailable:r.originalTraceAvailable??null,reasoningUnavailable:r.reasoningUnavailable||false,selected:r.selected!==false,reason:`Included as ${r.category} content segment by applied filters`,weight:r.weight,event:r.event||null,usage:r.usage||null,attachments:r.attachments||[],references:r.references||[]}));
  const tables={platforms,models,modelDevelopers,modelFamilies,composition:categories,thinkingRepresentations:groups(thinkingRows,thinkingKind),timelineDaily,timelineWeekly,timelineMonthly,hour,weekday,dateModel,datePlatform,calendar:rolling,rollingAverage:rolling,codeLanguages:sortedCount([...codeMap.values()]),domains:sortedCount([...domains.values()]),lengthDistribution:[distribution(rows,'user'),distribution(rows,'response')],conversations:conversationRows,modelChanges,repeatedPrompts,versions,tools:toolInfo.named,toolAssociations:toolInfo.associations,toolOutputs:toolInfo.unmatchedOutputs,toolIndicators:toolInfo.indicators,searchEvents:groups(toolInfo.search,r=>r.event?.name||'Recorded search event'),eventSequences:toolInfo.sequences,durations,usage:usage.values,contextOccupancy,attachmentTypes:attachments.types,attachments:attachments.metadata,capabilities:capabilityRows,quality,deduplication:selected.deduplication};
  const report={application:{name:'ThreadShelf Local Analytics',version:PRODUCT_VERSION,analyticalSchemaVersion:ANALYTICAL_SCHEMA_VERSION,adapterVersions:unique(convs.map(c=>c.adapterVersion||'unknown'))},generatedAt:new Date(now).toISOString(),filters:selected.filters,dateRange,selection:{conversationIds:convs.map(c=>c.id),sourceIds:unique(convs.map(c=>c.sourceId||c.sourceInstanceId||'Unknown source')),snapshotIds:unique(convs.map(c=>c.snapshotId).filter(Boolean)),collectionIds:unique(convs.flatMap(c=>c.selectedCollectionIds)),perspective:selected.filters.perspective,unit:'Content segments',coveragePeriod:{start:timelineDaily[0]?.date||null,end:timelineDaily.at(-1)?.date||null},snapshotComplete:options.snapshotComplete??null,capturedAt:options.capturedAt||null,sourceScope:options.sourceScope||null},summary,tables,charts:{platforms,models,composition:categories,timeline:timelineDaily,weekly:timelineWeekly,monthly:timelineMonthly,calendar:rolling,hour,weekday,dateModel,datePlatform,codeLanguages:tables.codeLanguages},coverage:metricCoverage,definitions,warnings:selected.warnings,evidence};
  if(options.previousPeriod!==false&&dateRange.startDay&&dateRange.endDay&&!dateRange.invalid){const length=calendarDayNumber(dateRange.endDay)-calendarDayNumber(dateRange.startDay);if(length>0){const previousFilters={...filters,range:'custom',start:shiftDay(dateRange.startDay,-length),end:shiftDay(dateRange.startDay,-1),timeZone:dateRange.zone};const previous=buildReport(conversations,previousFilters,{...options,now,previousPeriod:false});report.previousPeriod={filters:previous.filters,dateRange:previous.dateRange,calendarDays:length,comparison:compareSummaries(summary,previous.summary)};}}
  return report;
}
function compareSummaries(current,previous) {return ['conversations','records','userMessages','responseMessages','thinkingSegments','characters','activeDays','toolCalls'].map(metric=>({metric,current:current[metric],previous:previous[metric],difference:current[metric]-previous[metric],percentageChange:previous[metric]>0?100*(current[metric]-previous[metric])/previous[metric]:null}));}
export function compareSelections(conversations,leftFilters,rightFilters,options={}) {const left=buildReport(conversations,leftFilters,options),right=buildReport(conversations,rightFilters,options);return {left,right,differences:compareSummaries(left.summary,right.summary),scopeDifferences:Object.keys({...left.filters,...right.filters}).filter(k=>JSON.stringify(left.filters[k])!==JSON.stringify(right.filters[k])).map(k=>({filter:k,left:left.filters[k]??null,right:right.filters[k]??null})),compatibleUnits:left.selection.unit===right.selection.unit&&left.filters.perspective===right.filters.perspective,warnings:left.filters.perspective!==right.filters.perspective?['Unique-conversation and membership-weighted selections use different populations.']:[]};}
