/** Exact legacy measurements with disk-resident cross-conversation reducers. */
import {buildReport} from './disk-legacy-kernel.mjs';
import {externalSorted} from './disk-analysis-sort.mjs';
const finite=n=>typeof n==='number'&&Number.isFinite(n),parse=JSON.parse,encode=JSON.stringify;
const groups={platforms:['label'],models:['label'],modelDevelopers:['label'],modelFamilies:['label'],composition:['label'],thinkingRepresentations:['label'],timelineDaily:['label'],timelineWeekly:['label'],timelineMonthly:['label'],hour:['label'],weekday:['label'],dateModel:['label'],datePlatform:['label'],codeLanguages:['label'],domains:['label'],tools:['label'],usage:['scope','label','unit'],attachmentTypes:['label'],capabilities:['dimension','label','capability']};
const sortedCount=new Set(['platforms','models','modelDevelopers','modelFamilies','composition','codeLanguages','domains','tools','attachmentTypes']);
const orderedDates=new Set(['timelineDaily','timelineWeekly','timelineMonthly','hour']);
const skip=new Set(['repeatedPrompts','lengthDistribution','calendar','rollingAverage','deduplication']);
const nonsummable=new Set(['activeDays','longestStreak','currentStreak','averagePerActiveDay','averagePerCalendarDay','busiestDay','thinkingResponseRatio','codeCharacterProportion']);
const dayNumber=day=>Date.parse(day+'T00:00:00Z')/86400000;
const shift=(day,n)=>new Date((dayNumber(day)+n)*86400000).toISOString().slice(0,10);
const ratio=(a,b)=>b>0?a/b:null;
function* parts(ctx,name){for(const r of ctx.rows('SELECT seq,json,group_key FROM legacy_parts WHERE table_name=? ORDER BY seq',[name]))yield{...parse(r.json),__part:r.seq,__group:r.group_key};}
function* merged(ctx,name){
 for(const group of ctx.rows('SELECT group_key,MIN(seq) AS first FROM legacy_parts WHERE table_name=? GROUP BY group_key ORDER BY first',[name])){
  let result=null;for(const row of ctx.rows('SELECT json FROM legacy_parts WHERE table_name=? AND group_key=? ORDER BY seq',[name,group.group_key])){const value=parse(row.json);if(!result)result={...value};else for(const[key,n]of Object.entries(value))if(finite(n))result[key]=(result[key]||0)+n;}
  if(result)yield{...result,__group:group.group_key,__first:group.first};
 }
}
const lazyEvidence=new Set(['platforms','models','modelDevelopers','modelFamilies','composition','thinkingRepresentations','timelineDaily','timelineWeekly','timelineMonthly','hour','weekday','dateModel','datePlatform','codeLanguages','domains','searchEvents','conversations','capabilities']);
function evidenceFor(ctx,name,value){
 const label=value.label;
 if(lazyEvidence.has(name)){
  let sql,params=[];const simple={platforms:'provider',models:'model',composition:'category',timelineDaily:'day'};
  if(simple[name]){sql='SELECT id FROM selected_records WHERE '+simple[name]+'=?';params=[label];}
  else if(name==='conversations'){sql='SELECT id FROM selected_records WHERE cid=?';params=[value.id];}
  else if(name==='modelDevelopers'){sql="SELECT id FROM selected_records WHERE COALESCE(NULLIF(json_extract(json,'$.modelDeveloper'),''),'Unknown developer')=?";params=[label];}
  else if(name==='modelFamilies'){sql='SELECT r.id FROM selected_records r JOIN legacy_model_families f ON f.model=r.model WHERE f.family=?';params=[label];}
  else if(name==='timelineWeekly'){sql='SELECT id FROM selected_records WHERE analysis_iso_week(day)=?';params=[label];}
  else if(name==='timelineMonthly'){sql='SELECT id FROM selected_records WHERE substr(day,1,7)=?';params=[label];}
  else if(name==='hour'){sql="SELECT id FROM selected_records WHERE day IS NOT NULL AND json_extract(json,'$.datePrecision')<>'day' AND analysis_hour(timestamp,?)=?";params=[ctx.dateRange.zone,Number(label)];}
  else if(name==='weekday'){sql="SELECT id FROM selected_records WHERE CAST(strftime('%w',day) AS INTEGER)=?";params=[['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(label)];}
  else if(name==='dateModel'||name==='datePlatform'){sql='SELECT id FROM selected_records WHERE day=? AND '+(name==='dateModel'?'model':'provider')+'=?';params=[value.date,value.model??value.provider];}
  else if(name==='thinkingRepresentations'){sql="SELECT id FROM selected_records WHERE category='thinking' AND CASE WHEN json_extract(json,'$.reasoningRepresentation')='summary-only' THEN 'Summary-only exported thinking' WHEN observed=0 OR json_extract(json,'$.reasoningRepresentation')='unavailable' THEN 'Unavailable thinking representation' WHEN json_extract(json,'$.originalTraceAvailable')=0 THEN 'Unavailable original trace' ELSE 'Observed exported trace' END=?";params=[label];}
  else if(name==='codeLanguages'){sql="SELECT r.id FROM selected_records r,json_each(r.json,'$.content.blocks') b WHERE json_extract(b.value,'$.language')=?";params=[label];}
  else if(name==='domains'){sql="SELECT r.id FROM selected_records r,json_each(r.json,'$.content.links') l WHERE json_extract(l.value,'$.domain')=? UNION SELECT r.id FROM selected_records r,json_each(r.json,'$.references') f WHERE analysis_hostname(COALESCE(NULLIF(json_extract(f.value,'$.url'),''),json_extract(f.value,'$.href')))=?";params=[label,label];}
  else if(name==='searchEvents'){sql="SELECT id FROM selected_records WHERE json_extract(json,'$.event.type')='search' AND COALESCE(NULLIF(json_extract(json,'$.event.name'),''),'Recorded search event')=?";params=[label];}
  else if(name==='capabilities'){const path='$.capabilities.'+JSON.stringify(value.capability);let dimension;if(value.dimension==='collection'){dimension="EXISTS(SELECT 1 FROM json_each(c.json,'$.selectedCollectionIds') m WHERE m.value=?)";}else if(value.dimension==='source')dimension="COALESCE(NULLIF(json_extract(c.json,'$.sourceId'),''),NULLIF(json_extract(c.json,'$.sourceInstanceId'),''),'Unknown source')=?";else if(value.dimension==='format')dimension="COALESCE(NULLIF(json_extract(c.json,'$.format'),''),'Unknown format')=?";else dimension="analysis_platform(json_extract(c.json,'$.provider'))=?";sql='SELECT r.id FROM selected_records r JOIN selected_conversations c ON c.cid=r.cid WHERE json_type(c.json,?) IS NOT NULL AND '+dimension;params=[path,label];}
  return{sql,params};
 }
 return value.__group!=null?{sql:'SELECT e.id FROM legacy_part_evidence e JOIN legacy_parts p ON p.seq=e.part WHERE p.table_name=? AND p.group_key=?',params:[name,value.__group]}:{sql:'SELECT id FROM legacy_part_evidence WHERE part=?',params:[value.__part]};}
function clean(value){const{__part,__group,__first,...row}=value;return row;}
const cov=(available,total,original)=>({...original,available,total,percent:total?100*available/total:null});
function floorQuantile(ctx,category,p){const total=Number(ctx.get('SELECT COALESCE(SUM(weight),0) n FROM selected_records WHERE category=? AND observed=1',[category]).n);if(!total)return null;const rank=Math.floor((total-1)*p);const row=ctx.get(`SELECT characters FROM (SELECT characters,SUM(weight) OVER(ORDER BY characters,rid ROWS UNBOUNDED PRECEDING) cumulative FROM selected_records WHERE category=? AND observed=1) WHERE cumulative>? ORDER BY characters LIMIT 1`,[category,rank]);return row?.characters??null;}
export async function buildDiskLegacyReport(ctx){
 const empty=buildReport([],ctx.filters,{...ctx.options,previousPeriod:false}),summary={...empty.summary},coverageSums={},db=ctx.db;
 for(const key of Object.keys(summary))if(!nonsummable.has(key)&&finite(summary[key]))summary[key]=0;
 db.exec(`CREATE TABLE legacy_parts(seq INTEGER PRIMARY KEY,table_name TEXT NOT NULL,group_key TEXT,json TEXT NOT NULL);CREATE INDEX legacy_part_group ON legacy_parts(table_name,group_key,seq);CREATE TABLE legacy_part_evidence(part INTEGER NOT NULL,id TEXT NOT NULL,PRIMARY KEY(part,id));CREATE TABLE legacy_summary(cid TEXT PRIMARY KEY,json TEXT NOT NULL);CREATE TABLE legacy_model_families(model TEXT PRIMARY KEY,family TEXT NOT NULL);CREATE INDEX legacy_family_name ON legacy_model_families(family);`);
 const familyInsert=db.prepare('INSERT INTO legacy_model_families VALUES(?,?)');for(const row of ctx.rows('SELECT model FROM selected_records GROUP BY model'))familyInsert.run(row.model,(ctx.filters.modelFamilyAliases||ctx.filters.modelAliases||{})[row.model]||row.model);
 const put=db.prepare('INSERT INTO legacy_parts(table_name,group_key,json) VALUES(?,?,?)'),ev=db.prepare('INSERT OR IGNORE INTO legacy_part_evidence VALUES(?,?)'),sumPut=db.prepare('INSERT INTO legacy_summary VALUES(?,?)');let pairedThinking=0,pairedResponses=0,pairedCount=0,derivedTiming=false,completed=0;
 const total=Number(ctx.get('SELECT COUNT(*) n FROM selected_conversations').n);ctx.onProgress?.({phase:'report',completed:0,total});
 for(const c of ctx.conversations()){
  ctx.check();const original=ctx.originalConversation(c.id),local=buildReport([original],{...ctx.filters,aliases:{}},{...ctx.options,previousPeriod:false});sumPut.run(c.id,encode(local.summary));
  for(const[key,n]of Object.entries(local.summary))if(!nonsummable.has(key)&&finite(n))summary[key]=(summary[key]||0)+n;
  for(const[key,v]of Object.entries(local.coverage)){if(!coverageSums[key])coverageSums[key]={available:0,total:0,original:v};coverageSums[key].available+=v.available;coverageSums[key].total+=v.total;}
  if(local.coverage.thinkingResponseRatio.available){pairedCount++;pairedThinking+=local.summary.thinkingTraceCharacters;pairedResponses+=local.summary.responseCharacters;}
  if(local.definitions.timing.reliability==='Derived from recorded data')derivedTiming=true;
  for(const[name,rows]of Object.entries(local.tables)){
   if(skip.has(name))continue;
   for(const raw of rows){
    if(name==='quality'&&!raw.conversationId)continue;
    const actual=name==='quality'&&raw.label==='Uninterpreted usage metadata'?'quality_usage':name,{evidenceIds,...value}=raw;if(name==='conversations'){const originalContext=parse(ctx.get('SELECT json FROM legacy_original_context WHERE cid=?',[c.id]).json);value.allRetainedSegments=originalContext.allRetainedSegments;value.selectedSegments=originalContext.selectedSegments;if(c.branches?.alternativeRecords==null)value.retainedAlternatives=originalContext.retainedAlternatives;}const key=groups[name]?encode(groups[name].map(k=>value[k]??null)):null;
    const inserted=put.run(actual,key,encode(value));if(!lazyEvidence.has(name))for(const id of evidenceIds||[])if(typeof id==='string')ev.run(inserted.lastInsertRowid,id);
   }
  }
  completed++;ctx.onProgress?.({phase:'report',completed,total});if(completed%16===0)await new Promise(resolve=>setImmediate(resolve));
 }
 const names=Object.keys(empty.tables);
 for(const name of names){
  ctx.registerTable(name);if(skip.has(name))continue;
  let population=groups[name]?merged(ctx,name):parts(ctx,name),compare=null;
  if(sortedCount.has(name))compare=(a,b)=>b.count-a.count||String(a.label).localeCompare(String(b.label));
  else if(orderedDates.has(name))compare=(a,b)=>String(a.date??a.label).localeCompare(String(b.date??b.label));
  else if(name==='conversations')compare=(a,b)=>b.characters-a.characters;
  else if(name==='capabilities'){const order={source:0,format:1,collection:2,provider:3};compare=(a,b)=>order[a.dimension]-order[b.dimension]||a.__first-b.__first;}
  if(compare)for await(const value of externalSorted(ctx,population,compare))ctx.addRow('table:'+name,clean(value),evidenceFor(ctx,name,value));
  else for(const value of population)ctx.addRow('table:'+name,clean(value),evidenceFor(ctx,name,value));
 }
 // Warnings occur once globally, after conversation diagnostics, then usage limitations.
 for(const warning of ctx.warnings)ctx.addRow('table:quality',{label:warning.code,count:1,reason:warning.message});
 for(const value of parts(ctx,'quality_usage'))ctx.addRow('table:quality',clean(value),evidenceFor(ctx,'quality_usage',value));
 for(const value of ctx.rows('SELECT json FROM decisions ORDER BY ordinal'))ctx.addRow('table:deduplication',parse(value.json));
 // Equal-prompt groups are distinct scoped events, regardless of membership weights.
 let promptOrdinal=0;for(const g of ctx.rows(`SELECT prompt_key,MIN(rid) first,COUNT(DISTINCT json_array(cid,COALESCE(logical_id,object_id,id))) n FROM selected_records WHERE category='user' AND observed=1 AND prompt_key IS NOT NULL GROUP BY prompt_key HAVING n>1 ORDER BY first`))ctx.addRow('table:repeatedPrompts',{label:'Exact prompt group '+(++promptOrdinal),count:g.n,matchingRule:'Unicode NFC; trim and collapse whitespace; case-sensitive; no semantic matching'},{sql:"SELECT id FROM selected_records WHERE category='user' AND observed=1 AND prompt_key=?",params:[g.prompt_key]});
 for(const category of ['user','response']){
  const m=ctx.get('SELECT COALESCE(SUM(weight),0) n,MIN(characters) minimum,MAX(characters) maximum,SUM(characters*weight) total FROM selected_records WHERE category=? AND observed=1',[category]);
  ctx.addRow('table:lengthDistribution',{label:category,count:m.n,minimum:m.minimum,median:floorQuantile(ctx,category,.5),p90:floorQuantile(ctx,category,.9),maximum:m.maximum,mean:ratio(m.total,m.n),unit:'Unicode code points per observed content segment'},{sql:'SELECT id FROM selected_records WHERE category=? AND observed=1',params:[category]});
 }
 // Calendar state is reduced one day at a time; population records stay on disk.
 let firstDay=null,lastDay=null,longest=0,run=0,activeDays=0,busiest=null;
 for(const row of ctx.rows("SELECT json FROM result_rows WHERE scope='table:timelineDaily' ORDER BY ordinal")){
  const value=parse(row.json);if(firstDay===null)firstDay=value.date;run=lastDay&&dayNumber(value.date)-dayNumber(lastDay)===1?run+1:1;longest=Math.max(longest,run);lastDay=value.date;activeDays++;if(!busiest||value.count>busiest.count)busiest=value;
 }
 const start=ctx.dateRange.startDay||firstDay,end=ctx.dateRange.endDay?shift(ctx.dateRange.endDay,-1):lastDay,span=start&&end?dayNumber(end)-dayNumber(start)+1:0;
 const dated=Number(ctx.get('SELECT COALESCE(SUM(weight),0) n FROM selected_records WHERE day IS NOT NULL').n),today=new Intl.DateTimeFormat('en-CA',{timeZone:ctx.dateRange.zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(ctx.options.now??Date.now());
 summary.activeDays=activeDays;summary.longestStreak=longest;summary.currentStreak=lastDay===today||lastDay===shift(today,-1)?run:0;summary.averagePerActiveDay=ratio(dated,activeDays);summary.averagePerCalendarDay=ratio(dated,span);summary.busiestDay=busiest?Object.fromEntries(Object.entries(clean(busiest)).filter(([key])=>key!=='rowId')):null;summary.thinkingResponseRatio=pairedCount&&pairedResponses>0?pairedThinking/pairedResponses:null;summary.codeCharacterProportion=ratio(summary.codeCharacters,summary.characters);
 if(span>0&&span<=20000)for(let i=0;i<span;i++){
  const day=shift(start,i),n=ctx.get('SELECT COALESCE(SUM(weight),0) n FROM selected_records WHERE day=?',[day]).n,rolling=ctx.get('SELECT COALESCE(SUM(weight),0) n FROM selected_records WHERE day>=? AND day<=?',[shift(day,-6),day]).n,value={label:day,date:day,count:n,rolling7:rolling/7,windowDays:7},evidence={sql:'SELECT id FROM selected_records WHERE day=?',params:[day]};ctx.addRow('table:calendar',value,evidence);ctx.addRow('table:rollingAverage',value,evidence);
 }
 const coverage={};for(const[key,base]of Object.entries(empty.coverage)){const value=coverageSums[key]||{available:0,total:0};coverage[key]=cov(value.available,value.total,base);}
 const definitions={...empty.definitions};for(const[key,coverageName]of Object.entries({activity:'timestamps',messages:'logicalMessages',composition:'text',words:'text',structure:'objects',content:'text',timing:'durations',usage:'usage',quality:'originalRecords'}))definitions[key]={...definitions[key],coverage:coverage[coverageName]};definitions.tools={...definitions.tools,coverage:cov(summary.toolCalls,summary.records,empty.definitions.tools.coverage)};definitions.timing.reliability=derivedTiming?'Derived from recorded data':'Recorded';
 const distinct=(sql,params=[])=>{const values=[];let count=0;for(const row of ctx.rows(sql,params)){count++;if(count<=128)values.push(row.value);}return{values:count<=128?values:[],count,paged:count>128};};
 const source=distinct("SELECT DISTINCT COALESCE(json_extract(json,'$.sourceId'),json_extract(json,'$.sourceInstanceId'),'Unknown source') value FROM selected_conversations ORDER BY ordinal"),snapshot=distinct("SELECT DISTINCT json_extract(json,'$.snapshotId') value FROM selected_conversations WHERE json_extract(json,'$.snapshotId') IS NOT NULL ORDER BY ordinal"),collection=distinct("SELECT DISTINCT j.value FROM selected_conversations c,json_each(json_extract(c.json,'$.selectedCollectionIds')) j ORDER BY c.ordinal");
 const adapters=distinct("SELECT DISTINCT COALESCE(json_extract(json,'$.adapterVersion'),'unknown') value FROM selected_conversations ORDER BY ordinal");
 const header={...empty,application:{...empty.application,adapterVersions:adapters.values},summary,coverage,definitions,filters:ctx.filters,dateRange:ctx.dateRange,selection:{sourceIds:source.values,sourceCount:source.count,sourceIdsPaged:source.paged,snapshotIds:snapshot.values,snapshotCount:snapshot.count,snapshotIdsPaged:snapshot.paged,collectionIds:collection.values,collectionCount:collection.count,collectionIdsPaged:collection.paged,conversationCount:Number(ctx.get('SELECT COUNT(*) n FROM selected_conversations').n),perspective:ctx.filters.perspective,unit:'Content segments',coveragePeriod:{start:firstDay,end:lastDay},snapshotComplete:ctx.options.snapshotComplete??null,capturedAt:ctx.options.capturedAt||null,sourceScope:ctx.options.sourceScope||ctx.sourceScope||null},warnings:ctx.warnings,tables:{},charts:{},evidence:[],evidenceCount:Number(ctx.get('SELECT COUNT(*) n FROM selected_records').n)};
 ctx.putMetadata('legacyHeader',header);return header;
}
