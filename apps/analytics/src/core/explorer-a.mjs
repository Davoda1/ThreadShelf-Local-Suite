/** Explorer definitions 01–18. Pure calculations on Analytics-owned observations.
 * Full-text indexes are independent of the legacy regex contentAnalysis object.
 * Evidence maps stay in the analytical worker, never in the renderer payload. */
import { marked } from 'marked';
import { resolvedTimeZone } from './metrics.mjs';
import { canonicalPromptKey } from './prompt-key.mjs';

export const EXPLORER_TEXT_ALGORITHM_VERSION = '2.0.0-marked-r7-v2';
export const EXPLORER_A_VERSION = '2.0.0-explorer-a-v1';
export const LENGTH_EDGES = Object.freeze([0,1,10,50,100,250,500,1000,2500,5000,10000,25000,50000,100000,250000,1000000,Infinity]);
export const BYTE_EDGES = Object.freeze([0,1,1024,16384,262144,1048576,16777216,268435456,4294967296,Infinity]);
const finite = v => typeof v === 'number' && Number.isFinite(v);
const arr = v => Array.isArray(v) ? v : v == null ? [] : [v];
const uniq = v => [...new Set(v)];
const cp = text => { let n=0; for(const _ of String(text)) n++; return n; };
const weight = r => finite(r?.weight) && r.weight>0 ? r.weight : 1;
const total = observations => observations.reduce((n,r)=>n+weight(r),0);
const sum = (items,key) => items.reduce((n,r)=>n+(typeof key==='function'?key(r):r[key]||0),0);
const ratio = (n,d) => d>0 ? n/d : null;
const observed = r => r?.observed!==false && r?.category!=='redacted' && typeof r?.text==='string';
const dateNumber = day => Date.parse(`${day}T00:00:00Z`)/86400000;
const dayString = number => finite(number) ? new Date(number*86400000).toISOString().slice(0,10) : null;
const validDay = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && dayString(dateNumber(value))===value;
const originalDate = r => finite(r.timestamp) && !['import','filesystem','operation','database-operation'].includes(r.timeProvenance);
const clockDate = r => originalDate(r) && ['hour','minute','second','millisecond','microsecond','nanosecond','seconds','milliseconds'].includes(r.datePrecision);
const formatterCache = new Map();
function calendarParts(r,zone) {
  if(!originalDate(r)) return null;
  if(r.datePrecision==='day') {
    const day=r.dateValue||r.originalDate||r.timestampOriginal||r.day;
    return validDay(day) ? {day,weekday:new Date(day+'T00:00:00Z').getUTCDay(),hour:null} : null;
  }
  let formatter=formatterCache.get(zone);
  if(!formatter){formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});formatterCache.set(zone,formatter);}
  try {const parts=Object.fromEntries(formatter.formatToParts(r.timestamp).map(p=>[p.type,p.value]));const day=`${parts.year}-${parts.month}-${parts.day}`;return {day,weekday:new Date(day+'T00:00:00Z').getUTCDay(),hour:Number(parts.hour)};} catch{return null;}
}
function monday(day){const d=new Date(day+'T00:00:00Z'),offset=(d.getUTCDay()+6)%7;return dayString(dateNumber(day)-offset);}
function normalizeURL(value) {
  try {const u=new URL(String(value));if(!['http:','https:'].includes(u.protocol))return null;u.hash='';u.username='';u.password='';return {url:u.href,domain:u.hostname.toLowerCase().replace(/\.$/,'')};}catch{return null;}
}
const analysisCache = new WeakMap();
/** Full text parser index; no archived HTML or code is executed. Recorded text
 * above 16 MiB still has exact lengths/fences, while parser structures become
 * unavailable to keep malformed individual messages bounded. */
export function analyzeExplorerText(value,record={}) {
  const text=typeof value==='string'?value:'';
  const isObserved=typeof value==='string'&&observed({...record,text});
  const structures={headings:0,lists:0,listItems:0,quotes:0,tables:0,inlineCode:0,fencedCode:0,indentedCode:0,links:0,images:0,thematicBreaks:0,paragraphs:0};
  const blocks=[];const lines=text.split(/\r?\n/);let fence=null;
  for(let i=0;i<lines.length;i++) {
    const start=lines[i].match(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/);
    if(!fence&&start){fence={delimiter:start[1],literalDeclaration:start[2].trim(),start:i,body:[]};continue;}
    if(fence){const closing=new RegExp(`^ {0,3}${fence.delimiter[0]}{${fence.delimiter.length},}\\s*$`).test(lines[i]);if(closing){const body=fence.body.join('\n');blocks.push({language:fence.literalDeclaration.split(/\s+/u)[0]||'Unspecified',literalDeclaration:fence.literalDeclaration,characters:cp(body),lines:fence.body.length,closed:true,startLine:fence.start+1,endLine:i+1});fence=null;}else fence.body.push(lines[i]);}
  }
  if(fence){blocks.push({language:fence.literalDeclaration.split(/\s+/u)[0]||'Unspecified',literalDeclaration:fence.literalDeclaration,characters:cp(fence.body.join('\n')),lines:fence.body.length,closed:false,startLine:fence.start+1,endLine:lines.length});}
  const links=[],parsedBlocks=[];let parserAvailable=isObserved,parserReason=null,parserCitationMarkers=0;
  if(isObserved && text.length<=16*1024*1024) {
    try {
      const tokens=marked.lexer(text,{gfm:true,breaks:false,pedantic:false});
      let visited=0;
      marked.walkTokens(tokens,t=>{if(++visited>500000)throw new Error('parser token bound');
        const field={heading:'headings',list:'lists',list_item:'listItems',blockquote:'quotes',table:'tables',codespan:'inlineCode',link:'links',image:'images',hr:'thematicBreaks',paragraph:'paragraphs'}[t.type];
        if(field)structures[field]++;
        if(t.type==='code'){
          structures[t.codeBlockStyle==='indented'?'indentedCode':'fencedCode']++;
          if(t.codeBlockStyle!=='indented'){
            const rawLines=t.raw.split(/\r?\n/),opening=rawLines[0].match(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/);
            if(opening){let last=rawLines.length-1;while(last>0&&rawLines[last]==='')last--;const closing=new RegExp(`^ {0,3}${opening[1][0]}{${opening[1].length},}\\s*$`).test(rawLines[last]),body=closing?rawLines.slice(1,last):rawLines.slice(1),declaration=opening[2].trim();parsedBlocks.push({language:declaration.split(/\s+/u)[0]||'Unspecified',literalDeclaration:declaration,characters:cp(body.join('\n')),lines:body.length,closed:closing,startLine:null,endLine:null,bodyRepresentation:'CommonMark container prefixes removed; retained raw token body'});}
          }
        }
        if(t.type==='link'){const url=normalizeURL(t.href);if(url)links.push(url);}
        if(t.type==='text'&&!arr(t.tokens).length)parserCitationMarkers+=[...String(t.text||'').matchAll(/(?:cite|genui)[\s\S]*?|\[\^[^\]\n]+\]/gu)].length;
      });
    } catch {parserAvailable=false;parserReason='parser-complexity-or-malformed-limit';}
  } else if(isObserved) {parserAvailable=false;parserReason='parser-text-bound-16MiB';}
  if(!isObserved){parserAvailable=false;parserReason='text-unavailable';}
  const fencedLines=new Set();for(const b of blocks)for(let i=b.startLine-1;i<b.endLine;i++)fencedLines.add(i);
  const withoutFences=lines.filter((_,i)=>!fencedLines.has(i)).join('\n');
  const citationMarkers=parserAvailable?parserCitationMarkers:[...withoutFences.matchAll(/(?:cite|genui)[\s\S]*?|\[\^[^\]\n]+\]/gu)].length;
  const measuredBlocks=parserAvailable?parsedBlocks:blocks;
  return {version:EXPLORER_TEXT_ALGORITHM_VERSION,observed:isObserved,characters:isObserved?cp(text):null,blocks:measuredBlocks,codeCharacters:sum(measuredBlocks,'characters'),codeLines:sum(measuredBlocks,'lines'),structures:parserAvailable?structures:null,parserAvailable,parserReason,links:parserAvailable?links:[],citationMarkers};
}
export const explorerTextAnalysis=analyzeExplorerText;
function analysis(r) {
  if(r.explorerAnalysis?.version===EXPLORER_TEXT_ALGORITHM_VERSION)return r.explorerAnalysis;
  if(r.textExcerpt===true||r.textTruncated===true||typeof r.textExcerpt==='string')return {version:EXPLORER_TEXT_ALGORITHM_VERSION,observed:false,characters:null,blocks:[],structures:null,parserAvailable:false,parserReason:'full-text-index-rebuild-needed',links:[],citationMarkers:null};
  const prior=analysisCache.get(r);if(prior?.text===r.text&&prior.observed===r.observed&&prior.category===r.category)return prior.result;
  const result=analyzeExplorerText(r.text,r);analysisCache.set(r,{text:r.text,observed:r.observed,category:r.category,result});return result;
}
/** R7 (Hyndman–Fan type 7), frequency-weighted without expanded arrays. */
export function explorerQuantile(observations,p) {
  const rows=observations.filter(r=>finite(r.value)).sort((a,b)=>a.value-b.value),n=total(rows);
  if(!n)return null;const rank=(n-1)*Math.max(0,Math.min(1,p));const lo=Math.floor(rank),hi=Math.ceil(rank);
  const at=index=>{let cumulative=0;for(const r of rows){cumulative+=weight(r);if(index<cumulative)return r.value;}return rows.at(-1).value;};
  const a=at(lo),b=at(hi);return a+(b-a)*(rank-lo);
}
function summaries(population) {const n=total(population);return {n,minimum:n?population.reduce((v,r)=>Math.min(v,r.value),Infinity):null,q1:explorerQuantile(population,.25),median:explorerQuantile(population,.5),q3:explorerQuantile(population,.75),maximum:n?population.reduce((v,r)=>Math.max(v,r.value),-Infinity):null,mean:ratio(sum(population,r=>r.value*weight(r)),n)};}
function populationKind(r) {if(r.category==='thinking')return r.reasoningRepresentation==='summary-only'?'summary':r.originalTraceAvailable===false||r.reasoningRepresentation==='unavailable'?'unavailable-trace':'trace';return r.category;}
function trustworthyLogical(r,c) {return !!r.logicalId && !/derived contiguous|derived unindented|inferred|fallback/i.test(r.logicalProvenance||'') && !(c?.coverage==='normalized'&&!r.originalObjectId&&!r.logicalProvenance);}
function scopedKey(r,lens='object'){return `${r.conversationId||''}:${lens==='logical'?r.logicalId:r.objectId||r.id}`;}
function groupedUnits(records,lens,cmap,splitCategory=true) {
  if(lens==='segment')return records.map(r=>({key:r.id,records:[r],weight:weight(r),category:populationKind(r),anchor:r}));
  const groups=new Map();for(const r of records){if(lens==='logical'&&!trustworthyLogical(r,cmap.get(r.conversationId)))continue;if(lens==='object'&&!r.objectId)continue;const version=lens==='logical'&&splitCategory&&r.versionId!=null?`:version:${r.versionId}`:'',key=`${scopedKey(r,lens)}${version}${splitCategory?':'+populationKind(r):''}`;if(!groups.has(key))groups.set(key,{key,records:[],weight:weight(r),category:populationKind(r),anchor:r});groups.get(key).records.push(r);}
  return [...groups.values()];
}
function observedLength(unit) {return unit.records.every(r=>analysis(r).observed&&finite(analysis(r).characters))?sum(unit.records,r=>analysis(r).characters):null;}
function originalObjects(c) {
  const map=new Map();for(const r of arr(c.records)){if(!r.objectId)continue;if(!map.has(r.objectId))map.set(r.objectId,{id:r.objectId,records:[],r,order:r.originalOrder??r.sourceIndex});map.get(r.objectId).records.push(r);}
  return [...map.values()];
}
function parentNative(r){return r.relationship?r.relationship.verified===true?r.relationship.parentObjectId??r.relationship.parentOriginalId??r.relationship.parentNodeId??r.parentId:null:r.parentId;}
function nativeGraph(c) {
  const objects=originalObjects(c),byId=new Map();
  for(const object of objects)for(const r of object.records)for(const alias of uniq([r.nodeId,r.originalObjectId,r.objectId,...arr(r.nodeAliases)]).filter(v=>v!=null))byId.set(String(alias),object);
  const topology=new Map(arr(c.topology?.nodes).map(n=>[String(n.id),n]));
  const resolveParent=object=>{let id=parentNative(object.r),visited=new Set();while(id!=null&&!visited.has(String(id))){visited.add(String(id));if(byId.has(String(id)))return byId.get(String(id));id=topology.get(String(id))?.parentId;}return null;};
  let edges=objects.filter(o=>parentNative(o.r)!=null).map(o=>({from:resolveParent(o),to:o,provenance:'recorded-parent'})).filter(e=>e.from&&e.from!==e.to);
  const hasNativeOrder=c.ordering?.verified===true||c.sequence?.verified===true||(!/normalized|meta-converted|gemini-activity/.test(c.format||'')&&objects.length&&objects.every(o=>finite(o.order)));
  // Versions share an original message position; they are alternatives, never
  // successive user requests. The selected original version anchors a linear
  // source path before record filtering; alternative variants remain in objects.
  const orderedObjects=(objects.some(o=>o.r.versionId!=null)?objects.filter(o=>o.records.some(r=>r.selected!==false)):objects).slice().sort((a,b)=>a.order-b.order);
  if(!edges.length&&hasNativeOrder)edges=orderedObjects.slice(1).map((o,i)=>({from:orderedObjects[i],to:o,provenance:'original-recorded-source-order'}));
  return {objects,edges,byId,resolveParent,hasNativeOrder,orderedObjects};
}

export function buildExplorerA(selected,options={}) {
  const conversations=selected.conversations||[],filters=selected.filters||{},zone=resolvedTimeZone(filters.timeZone||'UTC');
  // Resolve the same explicit canonical identities and newest retained producer
  // as applyFilters before examining native adjacency. An alias must never turn
  // a missing original into the already-filtered visible sequence.
  const cmap=new Map();for(const c of options.originalConversations||conversations){const key=filters.aliases?.[c.id]||c.canonicalId||c.id,prior=cmap.get(key);if(!prior||(c.snapshotCapturedAt||0)>(prior.snapshotCapturedAt||0))cmap.set(key,{...c,id:key});}
  const originals=[...cmap.values()],originalRecords=new Map(originals.flatMap(c=>arr(c.records)).map(r=>[r.id,r]));
  const records=(selected.rows||[]).map(r=>{const source=originalRecords.get(r.id);return source?{...r,timestamp:source.timestamp,datePrecision:source.datePrecision,dateValue:source.dateValue,timeProvenance:source.timeProvenance}:r;}),selectedIds=new Set(records.map(r=>r.id));
  const selectedRecords=new Map(records.map(r=>[r.id,r])),originalObjectRecords=new Map(),originalLogicalRecords=new Map();
  for(const c of originals)for(const r of arr(c.records)){for(const [key,map] of [[r.objectId,originalObjectRecords],[r.logicalId,originalLogicalRecords]]){if(!key)continue;const scoped=`${c.id}:${key}`;if(!map.has(scoped))map.set(scoped,[]);map.get(scoped).push(r);}}
  const selectedFrom=rs=>rs.map(r=>selectedRecords.get(r.id)).filter(Boolean);
  const charts=[],evidenceIndex=new Map();let evidenceOrdinal=0;
  const control=(id,key,fallback)=>options.chartControls?.[id]?.[key]??options[key]??fallback;
  const evidenceIds=items=>uniq(items.flatMap(r=>typeof r==='string'?[r]:r.records?r.records.map(v=>v.id):r.ids||[r.id]).filter(v=>v!=null&&selectedIds.has(v)));
  const evidence=(id,items)=>{const key=`${id}:e${evidenceOrdinal++}`;evidenceIndex.set(key,typeof items==='function'?{resolve:()=>evidenceIds(items())}:evidenceIds(items));return key;};
  const row=(id,value,items=[])=>({...value,evidenceKey:evidence(id,items)});
  const contract=(variable,unit,eligible,available,extra={})=>({variable,unit,observationUnit:unit,filterScope:'Applied shared record filters and visible chart-local eligibility',eligible,available,unavailable:Math.max(0,eligible-available),dateBasis:'Original message/event timestamps only',timeZone:zone,datePrecision:'Preserved; day-only excluded from hourly measurements',branchPolicy:filters.branch||'selected',perspective:filters.perspective||'unique',sourceRepresentation:uniq(conversations.map(c=>c.coverage||'partial')),reliability:'Derived from recorded data',algorithmVersion:EXPLORER_A_VERSION,evidenceRule:'Exact contributing selected segment identities; grouped units resolve all selected contributing segments',state:available>0?'ready':eligible>0?'unavailable':'unknown',reason:available>0?'observed-population':eligible>0?'required-observation-unavailable':'no-matching-observations',...extra});
  const add=(id,family,subview,columns,table,measurement,display={},extra={})=>{if(measurement.available===0&&[1,2,3,4,5,11,13,14,15,16,17,18].includes(family)&&records.some(r=>analysis(r).parserReason==='full-text-index-rebuild-needed'))measurement={...measurement,state:'rebuild-needed',reason:'full-text-index-rebuild-needed'};const number=String(family).padStart(2,'0'),c={id,family,subview,titleKey:`explorer.chart${number}`,columns,rows:table,contract:{...measurement,indexVersion:EXPLORER_TEXT_ALGORITHM_VERSION,variableKey:`explorer.chart${number}`,unitKey:`explorer.unit${number}`,dateBasisKey:'explorer.originalDateBasis',evidenceRuleKey:'explorer.exactEvidence',reasonKey:`explorer.reason.${measurement.reason}`,stateKey:`explorer.state.${measurement.state}`},display,...extra};charts.push(c);return c;};
  const histogram=(id,pop,edges,labels={})=>edges.slice(0,-1).map((lower,i)=>{const upper=edges[i+1],matching=pop.filter(p=>p.value>=lower&&p.value<upper);return row(id,{kind:'histogram',...labels,lower,upper:upper===Infinity?null:upper,upperUnbounded:upper===Infinity,count:total(matching)},matching);});
  const ecdf=(id,pop,labels={})=>{const byValue=new Map();for(const p of pop)byValue.set(p.value,(byValue.get(p.value)||0)+weight(p));let cumulative=0;const n=total(pop);return [...byValue].sort((a,b)=>a[0]-b[0]).map(([threshold,count])=>{cumulative+=count;return row(id,{kind:'ecdf',...labels,threshold,count,cumulative,denominator:n,fraction:ratio(cumulative,n)},()=>pop.filter(p=>p.value<=threshold));});};

  // 01. Segment populations or explicitly supported logical-message grouping.
  {
    const id='01-length-histogram',lens=control(id,'lengthLens','segment'),units=groupedUnits(records,lens==='logical'?'logical':'segment',cmap),wanted=['user','response','trace','summary'];
    const table=[],populationCoverage={};let eligible=0,available=0,partial=0;
    for(const category of wanted){const subset=units.filter(u=>u.category===category||(category==='trace'&&u.category==='unavailable-trace'));const pop=subset.map(u=>({...u,value:u.category==='unavailable-trace'?null:observedLength(u)})).filter(u=>finite(u.value)),populationEligible=total(subset),populationAvailable=total(pop);populationCoverage[category]={eligible:populationEligible,available:populationAvailable,unavailable:populationEligible-populationAvailable};eligible+=populationEligible;available+=populationAvailable;if(lens==='logical')partial+=subset.filter(u=>(originalLogicalRecords.get(scopedKey(u.records[0],'logical'))||[]).some(r=>populationKind(r)===category&&!selectedIds.has(r.id))).length;table.push(...histogram(id,pop,LENGTH_EDGES,{population:category}),...ecdf(id,pop,{population:category}));}
    add(id,1,'distributions',['kind','population','lower','upper','upperUnbounded','threshold','count','cumulative','denominator','fraction'],table,contract('Observed text length','Unicode code points per '+(lens==='logical'?'supported logical message':'content segment'),eligible,available,{populationCoverage,partialMessageSelections:partial,binPolicy:'Fixed half-open [lower,upper); final upper unbounded',algorithmVersion:EXPLORER_TEXT_ALGORITHM_VERSION}),{kind:'histogram',x:'lower',y:'count',series:'population',ecdfX:'threshold',ecdfY:'fraction'});
  }
  // 02. R7 small multiples; never reuse legacy floor-index quantiles.
  {
    const id='02-length-box',category=control(id,'category','response'),groupBy=control(id,'groupBy','provider'),subset=records.filter(r=>populationKind(r)===category),groups=new Map();
    for(const r of subset){const p=calendarParts(r,zone),key=groupBy==='period'?(p?.day.slice(0,7)||'Unknown period'):groupBy==='model'?r.model||'Unknown model':r.provider||'Unknown platform';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
    const table=[...groups].map(([label,rs])=>{const pop=rs.filter(r=>analysis(r).observed).map(r=>({...r,value:analysis(r).characters}));return row(id,{group:label,category,...summaries(pop),eligible:total(rs),unavailable:total(rs)-total(pop),smallSample:total(pop)<5,quantileAlgorithm:'Hyndman–Fan type 7 (R7)'},rs);});
    add(id,2,'distributions',['group','category','n','eligible','unavailable','minimum','q1','median','q3','maximum','mean','smallSample'],table,contract('Observed segment length by '+groupBy,'Unicode code points',total(subset),total(subset.filter(r=>analysis(r).observed)),{quantileAlgorithm:'R7 frequency weighted; no uncertainty/significance claim'}),{kind:'box',x:'group',y:'median',low:'q1',high:'q3'});
  }
  // 03. Neutral identity labels; every selected conversation enters the rank.
  {
    const id='03-conversation-concentration',unit=control(id,'concentrationUnit','characters');let unavailable=0;
    const ranked=conversations.map((c,i)=>{const rs=c.records||[],known=rs.filter(r=>analysis(r).observed),value=unit==='segments'?total(rs):known.length?sum(known,r=>analysis(r).characters*weight(r)):null;if(value==null)unavailable++;return {c,label:`Conversation ${i+1}`,value,records:rs};}).filter(r=>finite(r.value)).sort((a,b)=>b.value-a.value||a.c.id.localeCompare(b.c.id));
    const denominator=sum(ranked,'value'),n=ranked.length;let cumulative=0;
    const table=ranked.map((r,i)=>{cumulative+=r.value;return row(id,{kind:'rank',conversation:r.label,rank:i+1,value:r.value,denominator,share:ratio(r.value,denominator),cumulativeValue:cumulative,cumulativeShare:ratio(cumulative,denominator),membershipWeight:weight(r.c),rankEvidenceKey:evidence(id,r.records)},()=>ranked.slice(0,i+1).flatMap(p=>p.records));});
    for(const percentage of [1,5,10]){const k=n?Math.max(1,Math.ceil(n*percentage/100)):0,top=ranked.slice(0,k),value=sum(top,'value');table.push(row(id,{kind:'top-share',percentage,conversationCount:k,value,denominator,share:ratio(value,denominator)},top.flatMap(r=>r.records)));}
    add(id,3,'distributions',['kind','conversation','rank','value','denominator','share','cumulativeValue','cumulativeShare','membershipWeight','percentage','conversationCount'],table,contract('Ranked observed conversation contribution',unit==='segments'?'Content segments':'Observed Unicode code points',conversations.length,conversations.length-unavailable,{weighting:'Conversation ranks are distinct; contributions use shared membership weights when selected',zeroDenominator:'Shares unavailable',evidenceRule:'Cumulative curve point resolves all selected segment contributors through that rank; rankEvidenceKey resolves the individual conversation contribution'}),{kind:'concentration',x:'rank',y:'cumulativeShare'});
  }
  // 04. Retained literal fenced declarations and exact body lengths.
  {
    const id='04-code-size',measure=control(id,'codeMeasure','characters'),groups=new Map();let available=0;
    for(const r of records){const a=analysis(r);if(!a.observed)continue;available+=weight(r);for(const b of a.blocks){const language=options.codeLanguageAliases?.[b.language]||b.language;if(!groups.has(language))groups.set(language,[]);groups.get(language).push({...r,block:b,value:measure==='lines'?b.lines:b.characters});}}
    const table=[];for(const [language,pop] of groups){table.push(...histogram(id,pop,measure==='lines'?[0,1,5,10,25,50,100,250,500,1000,5000,Infinity]:LENGTH_EDGES,{language}));table.push(row(id,{kind:'summary',language,...summaries(pop),closed:total(pop.filter(p=>p.block.closed)),unclosed:total(pop.filter(p=>!p.block.closed)),literalDeclarations:uniq(pop.map(p=>p.block.literalDeclaration)).join(' | ')},pop));}
    add(id,4,'distributions',['kind','language','lower','upper','upperUnbounded','count','n','minimum','q1','median','q3','maximum','closed','unclosed','literalDeclarations'],table,contract('Fenced code body size',measure==='lines'?'Retained body lines per fenced block':'Unicode code points per fenced block',total(records),available,{eligibilityUnit:'Segments with available full-text analysis',fencePolicy:'Recognized CommonMark backtick/tilde fences; unterminated fence retained and flagged; no complexity inference'}),{kind:'histogram',x:'lower',y:'count',series:'language'},{privateColumns:['language','literalDeclarations']});
  }
  // 05. Full normalized prompt keys; distinct recorded events are preserved.
  {
    const id='05-prompt-repeat',users=records.filter(r=>r.category==='user'),groups=new Map(),units=groupedUnits(users,'logical',cmap),fallback=users.filter(r=>!trustworthyLogical(r,cmap.get(r.conversationId))).map(r=>({key:r.id,records:[r],weight:weight(r)}));let available=0;
    for(const u of [...units,...fallback]){if(!u.records.every(r=>analysis(r).observed))continue;let key;const indexed=analysis(u.records[0]),expected=indexed.logicalPromptSegments??(trustworthyLogical(u.records[0],cmap.get(u.records[0].conversationId))?(originalLogicalRecords.get(scopedKey(u.records[0],'logical'))||[]).filter(r=>r.category==='user').length:1);if(expected!==u.records.length)continue;if(indexed.logicalPromptKey)key=indexed.logicalPromptKey;else if(u.records.length===1&&u.records[0].promptMatchKey)key=u.records[0].promptMatchKey;else if(u.records.some(r=>r.textExcerpt===true||r.textTruncated===true))continue;else key=canonicalPromptKey(u.records.map(r=>r.text).join('\n\n'));if(!groups.has(key))groups.set(key,[]);groups.get(key).push(u);available+=u.weight;}
    const table=[],spectrum=new Map();let ordinal=1;
    for(const pop of groups.values()){const frequency=pop.length,weightedFrequency=total(pop),ids=pop.flatMap(u=>u.records);if(!spectrum.has(frequency))spectrum.set(frequency,[]);spectrum.get(frequency).push({pop,ids});table.push(row(id,{kind:'group',group:`Prompt group ${ordinal++}`,frequency,weightedFrequency,distinctConversations:uniq(ids.map(r=>r.conversationId)).length,distinctModels:uniq(ids.map(r=>r.model||'Unknown model')).length},ids));}
    for(const [frequency,groupItems] of [...spectrum].sort((a,b)=>a[0]-b[0]))table.push(row(id,{kind:'spectrum',frequency,groups:groupItems.length,promptOccurrences:sum(groupItems,g=>g.pop.length)},groupItems.flatMap(g=>g.ids)));
    add(id,5,'distributions',['kind','group','frequency','weightedFrequency','groups','promptOccurrences','distinctConversations','distinctModels'],table,contract('Exact normalized prompt frequency','Distinct scoped prompt logical events; segment fallback explicit',total([...units,...fallback]),available,{matchingRule:'Complete Unicode NFC; collapse all whitespace to one space; trim; case-sensitive. SHA-256 stored full-text keys; no semantic matching',eventPolicy:'Equal wording does not merge request identities; membership weight is separate from event frequency'}),{kind:'spectrum',x:'frequency',y:'groups'});
  }
  // 06. Identity dedupe is scoped to conversation/object, never filename.
  {
    const id='06-attachment-size',seen=new Map();
    for(const r of records)for(const [i,a] of arr(r.attachments).entries()){const key=`${r.conversationId}:${a.id?'attachment:'+a.id:(r.objectId||r.id)+':'+(a.sourcePath||i)}`;if(!seen.has(key))seen.set(key,{...a,weight:weight(r),records:[r]});else seen.get(key).records.push(r);}
    const all=[...seen.values()],sizes=all.filter(a=>finite(a.sizeBytes)&&a.sizeBytes>=0).map(a=>({...a,value:a.sizeBytes})),dimensions=all.filter(a=>finite(a.width)&&a.width>0&&finite(a.height)&&a.height>0),table=[...histogram(id,sizes,BYTE_EDGES,{measure:'bytes'}),...ecdf(id,sizes,{measure:'bytes'})];
    const pixels=new Map();for(const a of dimensions){const key=`${a.width}×${a.height}`;if(!pixels.has(key))pixels.set(key,[]);pixels.get(key).push(a);}
    for(const pop of pixels.values())table.push(row(id,{kind:'dimensions',measure:'pixels',width:pop[0].width,height:pop[0].height,aspectRatio:pop[0].width/pop[0].height,count:total(pop)},pop));
    table.push(...histogram(id,dimensions.map(a=>({...a,value:a.width/a.height})),[0,.5,.75,1,1.25,1.5,2,3,5,Infinity],{measure:'aspect-ratio'}));
    const measure=control(id,'attachmentMeasure','bytes');
    add(id,6,'distributions',['kind','measure','lower','upper','upperUnbounded','threshold','count','cumulative','denominator','fraction','width','height','aspectRatio'],table,contract('Recorded attachment bytes and dimensions','Distinct scoped attachment metadata observations',total(all),total(sizes),{dimensionAvailable:total(dimensions),dimensionUnavailable:total(all)-total(dimensions),metadataPolicy:'Metadata does not establish accessibility; missing size stays unavailable; explicit zero bytes valid'}),{kind:measure==='pixels'?'density':'histogram',x:measure==='pixels'?'width':'lower',y:measure==='pixels'?'height':'count',filterBy:{measure}});
  }
  // 07. Timestamp anchors: first original segment in each unit, once per unit.
  {
    const id='07-weekday-hour',lens=control(id,'temporalUnit','segment'),units=groupedUnits(records,lens,cmap,false),cells=Array.from({length:168},()=>[]);let available=0;
    for(const u of units){let original=lens==='segment'?[originalRecords.get(u.anchor.id)]:lens==='logical'?originalLogicalRecords.get(scopedKey(u.anchor,'logical')):originalObjectRecords.get(scopedKey(u.anchor,'object'));if(lens==='logical'&&original?.some(r=>r.versionId!=null))original=original.filter(r=>r.selected!==false);const anchor=original?.[0]||u.anchor;if(!clockDate(anchor))continue;const parts=calendarParts(anchor,zone);if(!parts)continue;cells[parts.weekday*24+parts.hour].push(u);available+=u.weight;}
    const table=cells.map((pop,i)=>row(id,{weekday:Math.floor(i/24),hour:i%24,count:total(pop)},pop));
    add(id,7,'sequences',['weekday','hour','count'],table,contract('Observed original timestamp weekday × hour',lens==='logical'?'Supported logical messages':lens==='object'?'Stored source objects':'Content segments',total(units),available,{timestampAnchor:'First retained original source segment before record filtering; logical versions use the source-selected variant. Anchor must have clock precision.',appliedTimeBasisIgnored:filters.timeBasis==='conversation',datePrecision:'Hour or finer; date-only, unknown and conversation dates excluded'}),{kind:'heatmap',x:'hour',y:'weekday',value:'count'});
  }
  // 08. Rate denominators are real calendar days, clipped to observed/applied range.
  {
    const id='08-seasonality',dated=records.map(r=>({r,p:calendarParts(r,zone)})).filter(x=>x.p),available=total(dated.map(x=>x.r)),groups=new Map();
    for(const x of dated){const key=x.p.day.slice(0,7);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(x.r);}
    const days=dated.map(x=>x.p.day).sort(),start=selected.dateRange?.startDay||days[0],endExclusive=selected.dateRange?.endDay||(days.length?dayString(dateNumber(days.at(-1))+1):null),table=[];
    if(validDay(start)&&validDay(endExclusive)){let y=Number(start.slice(0,4)),m=Number(start.slice(5,7));const periodTotal=new Map();for(const [key,pop] of groups)periodTotal.set(key.slice(0,4),(periodTotal.get(key.slice(0,4))||0)+total(pop));let guards=0;
      while(`${y}-${String(m).padStart(2,'0')}-01`<endExclusive&&guards++<12000){const key=`${y}-${String(m).padStart(2,'0')}`,monthStart=key+'-01',next=m===12?`${y+1}-01-01`:`${y}-${String(m+1).padStart(2,'0')}-01`,calendarDays=Math.max(0,Math.min(dateNumber(next),dateNumber(endExclusive))-Math.max(dateNumber(monthStart),dateNumber(start))),pop=groups.get(key)||[],count=total(pop);table.push(row(id,{year:y,month:m,count,calendarDays,rate:ratio(count,calendarDays),withinYearShare:ratio(count,periodTotal.get(String(y))||0)},pop));if(m===12){m=1;y++;}else m++;}
    }
    add(id,8,'sequences',['year','month','count','calendarDays','rate','withinYearShare'],table,contract('Month-of-year × year observed seasonality','Content segments; segments per actual calendar day',total(records),available,{calendarDenominator:'Applied date range if bounded, otherwise first through last observed dated day inclusive; absent archived events not inferred'}),{kind:'heatmap',x:'month',y:'year',value:control(id,'seasonalityMeasure','count')==='rate'?'rate':control(id,'seasonalityMeasure','count')==='share'?'withinYearShare':'count'});
  }
  // 09. Active-day gaps are intervening empty calendar days; censor archive edges.
  {
    const id='09-streak-gaps',dated=records.map(r=>({r,p:calendarParts(r,zone)})).filter(x=>x.p),byDay=new Map();for(const x of dated){if(!byDay.has(x.p.day))byDay.set(x.p.day,[]);byDay.get(x.p.day).push(x.r);}
    const days=[...byDay.keys()].sort(),runs=[],gaps=[];let run=[];
    for(const day of days){if(run.length&&dateNumber(day)-dateNumber(run.at(-1))>1){runs.push(run);gaps.push({days:[run.at(-1),day],emptyDays:dateNumber(day)-dateNumber(run.at(-1))-1});run=[];}run.push(day);}if(run.length)runs.push(run);
    const table=runs.map((run,i)=>row(id,{kind:'streak',start:run[0],end:run.at(-1),length:run.length,count:1,leftCensored:i===0,rightCensored:i===runs.length-1},run.flatMap(d=>byDay.get(d))));
    for(const gap of gaps)table.push(row(id,{kind:'gap',start:gap.days[0],end:gap.days[1],length:gap.emptyDays,count:1,leftCensored:false,rightCensored:false},gap.days.flatMap(d=>byDay.get(d))));
    const distributions=new Map();for(const r of table){const key=`${r.kind}:${r.length}`;if(!distributions.has(key))distributions.set(key,{kind:`${r.kind}-distribution`,length:r.length,count:0,ids:[]});const d=distributions.get(key);d.count++;d.ids.push(...evidenceIndex.get(r.evidenceKey));}for(const r of distributions.values())table.push(row(id,{kind:r.kind,length:r.length,count:r.count},r.ids));
    add(id,9,'sequences',['kind','start','end','length','count','leftCensored','rightCensored'],table,contract('Retained active-day runs and intervening empty days','Distinct active calendar days',total(records),total(dated.map(x=>x.r)),{coverageUnit:'Dated segment coverage, runs and gaps are unweighted calendar observations',censoring:'First and last runs are archive-boundary censored; gaps do not prove absence of unexported activity'}),{kind:'histogram',x:'length',y:'count'});
  }
  // 10. First observed message, never account retention or recorded creation.
  {
    const id='10-continuation',cohorts=new Map(),allDated=originals.flatMap(c=>arr(c.records).filter(r=>filters.branch==='all'||(filters.branch==='alternative'?r.selected===false:r.selected!==false)).map(r=>calendarParts(r,zone)?.day).filter(Boolean)),archiveThrough=allDated.sort().at(-1)||null;let available=0;
    for(const c of conversations){const base=cmap.get(c.id)||c,retained=arr(base.records).filter(r=>filters.branch==='all'||(filters.branch==='alternative'?r.selected===false:r.selected!==false)),first=retained.map(r=>calendarParts(r,zone)?.day).filter(Boolean).sort()[0];if(!first)continue;available++;const cohort=monday(first),dates=arr(c.records).map(r=>({r,p:calendarParts(r,zone)})).filter(x=>x.p);if(!cohorts.has(cohort))cohorts.set(cohort,[]);cohorts.get(cohort).push({c,first,dates});}
    const offsets=arr(options.continuationOffsets).length?arr(options.continuationOffsets).filter(v=>Number.isInteger(v)&&v>=0&&v<=520):[0,1,2,3,4,8,12,26,52],table=[];
    for(const [cohort,pop] of cohorts)for(const offset of offsets){const eligible=pop.filter(p=>offset===0||(archiveThrough&&dateNumber(archiveThrough)>=dateNumber(monday(p.first))+(offset+1)*7-1)),qualifying=eligible.map(p=>({p,rs:p.dates.filter(x=>Math.floor((dateNumber(x.p.day)-dateNumber(monday(p.first)))/7)===offset&&(offset===0||x.p.day>p.first)).map(x=>x.r)})).filter(x=>x.rs.length);table.push(row(id,{cohort,weekOffset:offset,cohortConversations:pop.length,eligible:eligible.length,count:qualifying.length,fraction:ratio(qualifying.length,eligible.length),insufficientFollowup:pop.length-eligible.length},qualifying.flatMap(x=>x.rs)));}
    add(id,10,'sequences',['cohort','weekOffset','cohortConversations','eligible','count','fraction','insufficientFollowup'],table,contract('Additional retained dated conversation messages by observed cohort','Distinct selected conversations',conversations.length,available,{cohortBasis:'First observed retained message week before record filtering; branch scope applied; selected additional messages measure continuation',followupBoundary:archiveThrough,followupPolicy:'Later offsets require complete calendar opportunity through offset-week end in retained archive. No claim of user retention, churn or unexported activity.'}),{kind:'heatmap',x:'weekOffset',y:'cohort',value:'fraction'});
  }
  // 11. Reply ordinal from verified path/source sequence before filtering.
  {
    const id='11-response-position',position=new Map();let eligible=0,available=0,filteredGaps=0;
    for(const c of conversations){const original=cmap.get(c.id)||c,graph=nativeGraph(original);let ordered=[];if(original.branches?.selectedPathKnown&&arr(original.branches.selectedNodes).length)ordered=uniq(original.branches.selectedNodes.map(n=>graph.byId.get(String(n))).filter(Boolean));else if(graph.hasNativeOrder)ordered=graph.orderedObjects;else continue;let ordinal=0;
      for(const o of ordered){const originals=o.records.filter(r=>r.category==='response'&&trustworthyLogical(r,original));if(!originals.length)continue;ordinal++;const rs=selectedFrom(originals);if(!rs.length){filteredGaps++;continue;}eligible+=weight(c);const known=rs.every(r=>analysis(r).observed);if(!known)continue;available+=weight(c);const partial=originals.some(r=>!selectedIds.has(r.id)),chars=sum(rs,r=>analysis(r).characters),code=sum(rs,r=>analysis(r).codeCharacters||0),pop={value:chars,codeShare:ratio(code,chars),weight:weight(c),records:rs,partial};if(!position.has(ordinal))position.set(ordinal,[]);position.get(ordinal).push(pop);}}
    const table=[...position].sort((a,b)=>a[0]-b[0]).map(([ordinal,pop])=>row(id,{ordinal,...summaries(pop),medianCodeShare:explorerQuantile(pop.filter(p=>p.codeShare!=null).map(p=>({...p,value:p.codeShare})),.5),partialMessages:pop.filter(p=>p.partial).length,filteredGaps},pop));
    add(id,11,'sequences',['ordinal','n','minimum','q1','median','q3','maximum','medianCodeShare','partialMessages','filteredGaps'],table,contract('Logical final-reply shape at original sequence position','Supported logical final replies; Unicode code points',eligible,available,{positionPolicy:'Original retained selected path or verified source sequence is established before filtering; missing selected replies leave ordinal gaps. Versions use the source-selected variant at each original message position, never serial alternatives.',quantileAlgorithm:'R7; code share is retained fenced body code points / observed reply points',contextConversations:conversations.length}),{kind:'band',x:'ordinal',y:'median',low:'q1',high:'q3'});
  }
  // 12. Native adjacency, endpoints present; ties and reverse dates explicit.
  {
    const id='12-recorded-intervals',observations=[],status=new Map();let eligible=0,available=0;
    for(const c of conversations){const original=cmap.get(c.id)||c,graph=nativeGraph(original);for(const e of graph.edges){const a=e.from.records[0],b=e.to.records[0],from=selectedFrom(e.from.records),to=selectedFrom(e.to.records);if(!from.length&&!to.length)continue;eligible+=weight(c);let state='filtered-gap';let value=null;if(from.length&&to.length){state=!clockDate(a)||!clockDate(b)?'date-precision-unavailable':b.timestamp===a.timestamp?'tied':b.timestamp<a.timestamp?'reversed':'forward';if(clockDate(a)&&clockDate(b)){value=b.timestamp-a.timestamp;available+=weight(c);observations.push({value,weight:weight(c),records:[...from,...to],state,provenance:e.provenance});}}if(!status.has(state))status.set(state,[]);status.get(state).push({weight:weight(c),records:[...from,...to]});}}
    const table=histogram(id,observations.filter(p=>p.value>=0),[0,1,1000,10000,60000,300000,3600000,86400000,604800000,Infinity]);for(const [state,pop] of status)table.push(row(id,{kind:'status',status:state,count:total(pop)},pop));for(const p of observations.filter(p=>p.value<0))table.push(row(id,{kind:'reversed-observation',status:'reversed',milliseconds:p.value,count:p.weight,orderingProvenance:p.provenance},[p]));
    add(id,12,'sequences',['kind','lower','upper','upperUnbounded','status','milliseconds','count','orderingProvenance'],table,contract('Original recorded timestamp intervals','Milliseconds between native adjacent source objects',eligible,available,{intervalPolicy:'No newly adjacent filtered records are connected; both endpoint timestamps must have clock precision. Original object first segment is the anchor.',interpretation:'Recorded message timestamp gap, never generation latency/TTFT or execution duration'}),{kind:'histogram',x:'lower',y:'count'});
  }
  // 13. Conversation sums or positively verified parent/turn associations.
  {
    const id='13-prompt-reply',lens=control(id,'relationshipLens','conversation'),pop=[];let eligible=0;
    if(lens==='paired')for(const c of conversations){const original=cmap.get(c.id)||c,graph=nativeGraph(original);for(const o of graph.objects){const replyOriginal=o.records.filter(r=>r.category==='response');if(!replyOriginal.length)continue;const reply=selectedFrom(replyOriginal);if(!reply.length)continue;eligible+=weight(c);let parent=graph.resolveParent(o),visited=new Set();while(parent&&!parent.records.some(r=>r.category==='user')&&!visited.has(parent.id)){visited.add(parent.id);parent=graph.resolveParent(parent);}let userOriginal=parent?.records.filter(r=>r.category==='user')||[];if(!userOriginal.length){const turn=o.r.turnId??o.r.relationship?.turnId;if(turn&&o.r.relationship?.verified===true)userOriginal=graph.objects.flatMap(u=>u.records.filter(r=>r.category==='user'&&(r.turnId??r.relationship?.turnId)===turn&&r.relationship?.verified===true));}const users=selectedFrom(userOriginal);if(!users.length||![...users,...reply].every(r=>analysis(r).observed))continue;pop.push({x:sum(users,r=>analysis(r).characters),y:sum(reply,r=>analysis(r).characters),weight:weight(c),records:[...users,...reply]});}}
    else for(const c of conversations){eligible+=weight(c);const users=c.records.filter(r=>r.category==='user'),responses=c.records.filter(r=>r.category==='response');if(!users.length||!responses.length||![...users,...responses].every(r=>analysis(r).observed))continue;pop.push({x:sum(users,r=>analysis(r).characters),y:sum(responses,r=>analysis(r).characters),weight:weight(c),records:[...users,...responses]});}
    const table=density(id,pop,LENGTH_EDGES,LENGTH_EDGES,row);
    add(id,13,'relationships',['xLower','xUpper','xUnbounded','yLower','yUpper','yUnbounded','count','xSum','ySum'],table,contract('Observed prompt volume × final reply volume',lens==='paired'?'Parent/turn-associated reply objects':'Distinct conversations',eligible,total(pop),{lens,pairingRule:lens==='paired'?'Recorded parent ancestry to user object, or verified shared turn relationship; array position/logical ID alone insufficient':'Both user and response categories observed in selected conversation. These sums do not imply turn pairing.',binPolicy:'Fixed half-open length density cells; exact weighted counts and sums'}),{kind:'density',x:'xLower',y:'yLower',value:'count'});
  }
  // 14. Original trace and summary remain distinct; ratio of sums is separate.
  {
    const id='14-trace-response',lens=control(id,'traceLens','conversation'),units=lens==='object'?groupedUnits(records,'object',cmap,false):conversations.map(c=>({records:c.records,weight:weight(c)})),table=[];let available=0,eligible=0;
    for(const representation of ['trace','summary']){const pop=[];for(const u of units){const traces=u.records.filter(r=>populationKind(r)===representation),responses=u.records.filter(r=>r.category==='response');if(representation==='trace')eligible+=u.weight;if(!traces.length||!responses.length||![...traces,...responses].every(r=>analysis(r).observed))continue;pop.push({x:sum(traces,r=>analysis(r).characters),y:sum(responses,r=>analysis(r).characters),weight:u.weight,records:[...traces,...responses]});}if(representation==='trace')available=total(pop);table.push(...density(id,pop,LENGTH_EDGES,LENGTH_EDGES,row,{representation}));const ratios=pop.filter(p=>p.y>0).map(p=>({...p,value:p.x/p.y}));table.push(row(id,{kind:'ratio-summary',representation,n:total(pop),ratioEligible:total(ratios),traceSum:sum(pop,p=>p.x*p.weight),responseSum:sum(pop,p=>p.y*p.weight),ratioOfSums:ratio(sum(pop,p=>p.x*p.weight),sum(pop,p=>p.y*p.weight)),ratioMedian:explorerQuantile(ratios,.5),ratioQ1:explorerQuantile(ratios,.25),ratioQ3:explorerQuantile(ratios,.75)},pop));}
    add(id,14,'relationships',['kind','representation','xLower','xUpper','xUnbounded','yLower','yUpper','yUnbounded','count','xSum','ySum','n','ratioEligible','traceSum','responseSum','ratioOfSums','ratioMedian','ratioQ1','ratioQ3'],table,contract('Exported original trace × final response volume',lens==='object'?'Recorded object groups':'Distinct conversations',eligible,available,{representationPolicy:'Observed original trace only; summary-only thinking has separate rows. Unavailable/redacted reasoning is excluded. No hidden-effort or compute interpretation',ratioPolicy:'Ratio of weighted sums distinct from R7 quantiles of per-unit ratios; zero response denominator unavailable'}),{kind:'density',x:'xLower',y:'yLower',value:'count',series:'representation'});
  }
  // 15. Feature presence per supported reply, occurrence totals separate.
  {
    const id='15-model-features',units=groupedUnits(records.filter(r=>r.category==='response'),'logical',cmap),groups=new Map();
    for(const u of units){const models=uniq(u.records.map(r=>r.model||'Unknown model'));const model=models.length===1?models[0]:'Mixed model';if(!groups.has(model))groups.set(model,[]);groups.get(model).push(u);}
    const table=[];let available=0;
    for(const [model,pop] of groups){const known=pop.filter(u=>u.records.every(r=>analysis(r).parserAvailable));available+=total(known);for(const feature of ['fences','links','tables']){const counts=u=>sum(u.records,r=>feature==='fences'?analysis(r).blocks.length:feature==='links'?analysis(r).structures?.links||0:analysis(r).structures?.tables||0),qualifying=known.filter(u=>counts(u)>0);table.push(row(id,{model,feature,numerator:total(qualifying),denominator:total(known),eligible:total(pop),unavailable:total(pop)-total(known),prevalence:ratio(total(qualifying),total(known)),occurrences:sum(known,u=>counts(u)*u.weight)},known));}
      const attachmentKnown=pop.filter(u=>u.records.some(r=>arr(r.attachments).length||r.attachmentCoverage==='complete'||r.attachmentsObserved===true)),withMetadata=attachmentKnown.filter(u=>u.records.some(r=>arr(r.attachments).length));table.push(row(id,{model,feature:'attachment-metadata',numerator:total(withMetadata),denominator:total(attachmentKnown),eligible:total(pop),unavailable:total(pop)-total(attachmentKnown),prevalence:ratio(total(withMetadata),total(attachmentKnown)),occurrences:sum(attachmentKnown,u=>sum(u.records,r=>arr(r.attachments).length)*u.weight)},attachmentKnown));}
    add(id,15,'relationships',['model','feature','numerator','denominator','eligible','unavailable','prevalence','occurrences'],table,contract('Model × retained content-feature prevalence','Supported logical final replies',total(units),available,{presencePolicy:'Each qualifying reply counts once per feature; occurrence totals separate. Missing attachment metadata is unknown unless complete metadata observation is supplied.'}),{kind:'matrix',x:'feature',y:'model',value:'prevalence'});
  }
  // 16. Presence sets; repeated blocks never multiply joint support.
  {
    const id='16-cooccurrence',table=[],lens=control(id,'cooccurrenceLens','conversation');let qualifying=0;const sets={model:[],language:[]};
    const replyUnits=lens==='reply'?groupedUnits(records.filter(r=>r.category==='response'),'logical',cmap):conversations.map(c=>({records:c.records.filter(r=>r.category==='response'),weight:weight(c)}));
    for(const u of replyUnits){const replies=u.records.filter(r=>analysis(r).observed);if(!replies.length)continue;qualifying++;sets.model.push({set:new Set(replies.map(r=>options.modelAliases?.[r.model]||r.model||'Unknown model')),records:replies,weight:u.weight});sets.language.push({set:new Set(replies.flatMap(r=>analysis(r).blocks.map(b=>options.codeLanguageAliases?.[b.language]||b.language))),records:replies,weight:u.weight});}
    for(const dimension of ['model','language'])table.push(...cooccurrenceTable(id,sets[dimension],dimension,control(id,'topN',40),row));
    add(id,16,'relationships',['kind','dimension','source','target','joint','union','jaccard','eligible','originalLabels','retainedLabels','otherLabels'],table,contract('Model and declared-language co-presence',lens==='reply'?'Supported logical final reply presence sets':'Distinct qualifying conversation presence sets',replyUnits.length,qualifying,{lens,presencePolicy:'Observed selected final reply text supports presence. Repeated blocks/model records do not multiply presence. Explicit aliases only.',matrixPolicy:'Separate model/language matrices; top-N axes by weighted presence, omitted labels grouped into an explicit Other presence set. Complete population summaries and exact grouped cells; joint / union documented.'}),{kind:'matrix',x:'source',y:'target',value:'joint',filterBy:{dimension:control(id,'cooccurrenceDimension','model')}},{privateColumns:['source','target'],privateColumnCondition:{dimension:'language'}});
  }
  // 17. Channels separate, domain union cross-channel dedup per source object.
  {
    const id='17-reference-domains',events=[],domainEntries=new Map(),seenStructured=new Set(),unlinked=[];let available=0,textualAvailable=0,structuredAvailable=0;
    for(const r of records){const a=analysis(r);if(a.parserAvailable||arr(r.references).length)available+=weight(r);if(arr(r.references).length)structuredAvailable+=weight(r);if(a.parserAvailable){textualAvailable+=weight(r);for(const link of a.links)events.push({channel:'textual-link',...link,records:[r],weight:weight(r)});if(a.citationMarkers)unlinked.push({count:a.citationMarkers*weight(r),records:[r]});}
      for(const [i,reference] of arr(r.references).entries()){const key=`${r.conversationId}:${r.objectId||r.id}:${reference.id||reference.sourcePath||i}`;if(seenStructured.has(key))continue;seenStructured.add(key);const url=normalizeURL(reference.url||reference.href);if(url)events.push({channel:'structured-reference',...url,records:[r],weight:weight(r)});else unlinked.push({count:weight(r),records:[r],structured:true});}}
    for(const event of events){const r=event.records[0],key=`${r.conversationId}:${r.objectId||r.id}:${event.url}`;if(!domainEntries.has(key))domainEntries.set(key,{...event,channels:new Set([event.channel])});else{const prior=domainEntries.get(key);prior.channels.add(event.channel);prior.records.push(r);}}
    const table=[];for(const channel of ['textual-link','structured-reference']){const pop=events.filter(e=>e.channel===channel);table.push(row(id,{kind:'channel',channel,count:total(pop),distinctURLs:uniq(pop.map(p=>p.url)).length,distinctDomains:uniq(pop.map(p=>p.domain)).length},pop));}
    table.push(row(id,{kind:'channel',channel:'unlinked-citation-markers',count:sum(unlinked.filter(u=>!u.structured),'count')},unlinked.filter(u=>!u.structured)),row(id,{kind:'channel',channel:'unlinked-structured-references',count:sum(unlinked.filter(u=>u.structured),'count')},unlinked.filter(u=>u.structured)));
    const byDomain=new Map(),byDomainModel=new Map(),byConversation=new Map();for(const e of domainEntries.values()){if(!byDomain.has(e.domain))byDomain.set(e.domain,[]);byDomain.get(e.domain).push(e);const model=e.records[0].model||'Unknown model',key=`${e.domain}\u0000${model}`;if(!byDomainModel.has(key))byDomainModel.set(key,{domain:e.domain,model,pop:[]});byDomainModel.get(key).pop.push(e);const cid=e.records[0].conversationId;if(!byConversation.has(cid))byConversation.set(cid,[]);byConversation.get(cid).push(e);}
    const ranked=[...byDomain].sort((a,b)=>total(b[1])-total(a[1])||a[0].localeCompare(b[0])),denominator=total([...domainEntries.values()]);let cumulative=0;
    for(const [i,[domain,pop]] of ranked.entries()){cumulative+=total(pop);table.push(row(id,{kind:'concentration',domain,rank:i+1,count:total(pop),denominator,share:ratio(total(pop),denominator),cumulativeShare:ratio(cumulative,denominator),distinctConversations:uniq(pop.flatMap(p=>p.records.map(r=>r.conversationId))).length,rankEvidenceKey:evidence(id,pop)},()=>ranked.slice(0,i+1).flatMap(([,entries])=>entries)));}
    for(const {domain,model,pop} of byDomainModel.values())table.push(row(id,{kind:'domain-model',domain,model,count:total(pop)},pop));
    const coSets=[...byConversation.values()].map(pop=>({domains:new Set(pop.map(e=>e.domain)),records:pop.flatMap(e=>e.records),weight:weight(pop[0])}));
    table.push(...cooccurrenceTable(id,coSets.map(p=>({...p,set:p.domains})),'domain',control(id,'topN',40),row).map(r=>({...r,kind:r.kind==='cell'?'domain-cooccurrence':'domain-matrix-population',count:r.joint})));
    const diversity=new Map();for(const p of coSets){if(!diversity.has(p.domains.size))diversity.set(p.domains.size,[]);diversity.get(p.domains.size).push(p);}for(const [distinctDomains,pop] of diversity)table.push(row(id,{kind:'diversity',distinctDomains,count:pop.length},pop));
    add(id,17,'relationships',['kind','channel','domain','model','source','target','rank','count','denominator','share','cumulativeShare','distinctURLs','distinctDomains','distinctConversations','union','jaccard','eligible','originalLabels','retainedLabels','otherLabels'],table,contract('Reference channels and domain concentration','Textual link occurrences, structured reference entries, or deduplicated object/URL domain observations',total(records),available,{textualAvailable,structuredAvailable,normalization:'HTTP(S) only; lower-case hostname, remove trailing dot/default port/fragment/credentials; retain path and query internally. Same URL deduped across textual/structured channels within scoped object.',citationPolicy:'Unlinked markers never enter domain cells. Domains do not imply visits, searches, credibility or grounding.',cooccurrencePolicy:'Distinct conversation domain presence; zero-domain unknown observations excluded; top-N matrix axes group remaining domains into explicit Other. Full domain concentration ranking remains complete.'}),{kind:'concentration',x:'rank',y:'cumulativeShare'},{privateColumns:['domain','source','target']});
  }
  // 18. CommonMark/GFM parser-derived identifiers, full owned text only.
  {
    const id='18-markdown-structure',known=records.filter(r=>analysis(r).parserAvailable),fields=['headings','lists','listItems','quotes','tables','inlineCode','fencedCode','indentedCode','links','images','thematicBreaks','paragraphs'],table=[];
    for(const field of fields){const qualifying=known.filter(r=>analysis(r).structures[field]>0);table.push(row(id,{structure:field,occurrences:sum(known,r=>analysis(r).structures[field]*weight(r)),presentSegments:total(qualifying),eligibleSegments:total(known),presenceFraction:ratio(total(qualifying),total(known))},known));}
    add(id,18,'relationships',['structure','occurrences','presentSegments','eligibleSegments','presenceFraction'],table,contract('Parser-derived Markdown structure profile','Observed content segments and recognized structure occurrences',total(records),total(known),{parser:'marked 16.4.2, CommonMark/GFM lexer; independent new identifiers',algorithmVersion:EXPLORER_TEXT_ALGORITHM_VERSION,reasonCounts:countReasons(records.filter(r=>!analysis(r).parserAvailable).map(r=>analysis(r).parserReason)),parserSafety:'No execution or network; 16 MiB individual text / 500,000 token bound; bounded failures explicitly unavailable; original text unchanged'}),{kind:'bars',x:'structure',y:'occurrences'});
  }
  return {charts,evidenceIndex};
}
function countReasons(reasons){const out={};for(const reason of reasons)out[reason||'unavailable']=(out[reason||'unavailable']||0)+1;return out;}
function cooccurrenceTable(id,pop,dimension,requested,row) {
  const topN=Number.isInteger(Number(requested))?Math.max(1,Math.min(100,Number(requested))):40,presence=new Map();
  for(const p of pop)for(const label of p.set)presence.set(label,(presence.get(label)||0)+weight(p));
  const ranked=[...presence].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])),kept=ranked.slice(0,topN).map(([label])=>label),keptSet=new Set(kept),otherLabels=Math.max(0,ranked.length-kept.length);let other='Other ('+otherLabels+' labels)';while(presence.has(other))other+=' [aggregate]';const labels=otherLabels?[...kept,other]:kept;
  const normalized=pop.map(p=>({...p,set:new Set([...p.set].map(label=>keptSet.has(label)?label:other))})),counts=new Map(),joint=new Map();
  for(const p of normalized){const axes=[...p.set].sort();for(const axis of axes)counts.set(axis,(counts.get(axis)||0)+weight(p));for(let i=0;i<axes.length;i++)for(let j=i;j<axes.length;j++){const key=JSON.stringify([axes[i],axes[j]]);joint.set(key,(joint.get(key)||0)+weight(p));}}
  const rows=[row(id,{kind:'population',dimension,eligible:total(pop),originalLabels:ranked.length,retainedLabels:kept.length,otherLabels},()=>pop)];
  for(let i=0;i<labels.length;i++)for(let j=i;j<labels.length;j++){const source=labels[i],target=labels[j],pair=[source,target].sort(),n=joint.get(JSON.stringify(pair))||0,union=(counts.get(source)||0)+(counts.get(target)||0)-n;rows.push(row(id,{kind:'cell',dimension,source,target,joint:n,union,jaccard:ratio(n,union),eligible:total(pop)},()=>normalized.filter(p=>p.set.has(source)&&p.set.has(target))));}
  return rows;
}
function density(id,pop,xEdges,yEdges,row,extra={}) {
  const cells=new Map();for(const p of pop){const xi=xEdges.findIndex((edge,i)=>i<xEdges.length-1&&p.x>=edge&&p.x<xEdges[i+1]),yi=yEdges.findIndex((edge,i)=>i<yEdges.length-1&&p.y>=edge&&p.y<yEdges[i+1]);if(xi<0||yi<0)continue;const key=`${xi}:${yi}`;if(!cells.has(key))cells.set(key,{xi,yi,pop:[]});cells.get(key).pop.push(p);}
  return [...cells.values()].sort((a,b)=>a.xi-b.xi||a.yi-b.yi).map(({xi,yi,pop})=>row(id,{kind:'density',...extra,xLower:xEdges[xi],xUpper:finite(xEdges[xi+1])?xEdges[xi+1]:null,xUnbounded:!finite(xEdges[xi+1]),yLower:yEdges[yi],yUpper:finite(yEdges[yi+1])?yEdges[yi+1]:null,yUnbounded:!finite(yEdges[yi+1]),count:total(pop),xSum:sum(pop,p=>p.x*p.weight),ySum:sum(pop,p=>p.y*p.weight)},pop));
}
