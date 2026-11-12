/** Exact sequence/observability kernels over one conversation; global rows live in SQLite. */
import {buildExplorerB,QUANTILE_DEFINITION} from './explorer-b.mjs';
import {canonicalPromptKey} from './prompt-key.mjs';

const own=(value,key)=>Object.hasOwn(value||{},key);
const quote=value=>JSON.stringify(value);
const grouped=new Map([
 ['19-native-transitions',{keys:['source','target','status'],sums:['count','support']}],
 ['22-call-output-association',{keys:['tool','status','outputs'],sums:['count','matchedOutputs']}],
 ['23-recorded-duration-distribution',{keys:['scope','lower','upper'],sums:['count']}],
 ['24-usage-field-distribution',{keys:['field','meaning','unit','lower','upper'],sums:['count']}],
 ['29-observability-matrix',{keys:['source','format','provider','metric','unit','reason'],sums:['eligible','available','unavailable']}],
 ['30-diagnostic-profile',{keys:['diagnostic','level'],sums:['count']}]
]);
const customFamily=family=>family>=25&&family<=28||family>=31;
const automaticReasons=new Set(['No eligible observations in the applied selection','Required recorded fields are unavailable','Available observations measured; missing data excluded']);
function valuesFor(explorer,row){const found=explorer.evidenceIndex.get(row.evidenceKey);return typeof found==='function'?found():typeof found?.resolve==='function'?found.resolve():found||[];}
const observedCharacters=record=>record?.observed===false||record?.category==='redacted'?null:record?.explorerAnalysis?.observed&&Number.isFinite(record.explorerAnalysis.characters)?record.explorerAnalysis.characters:record?.content?.observed&&Number.isFinite(record.content.characters)?record.content.characters:record?.contentAnalysis?.observed&&Number.isFinite(record.contentAnalysis.characters)?record.contentAnalysis.characters:typeof record?.text==='string'?[...record.text].length:null;

/** ctx owns canonical selection, immutable captures, disk evidence and paged row artifacts. */
export async function buildDiskExplorerB(ctx){
 const db=ctx.db,filters=ctx.filters||{},options=ctx.options||{},empty={conversations:[],rows:[],filters,dateRange:ctx.dateRange};
 db.function('disk_b_utf16_key',{deterministic:true},value=>Buffer.from(String(value??''),'utf16le').swap16());
 db.exec(`DROP TABLE IF EXISTS disk_b_rows;DROP TABLE IF EXISTS disk_b_evidence;DROP TABLE IF EXISTS disk_b_sources;
 CREATE TEMP TABLE disk_b_rows(seq INTEGER PRIMARY KEY,chart TEXT NOT NULL,gkey TEXT NOT NULL,json TEXT NOT NULL);
 CREATE INDEX disk_b_row_groups ON disk_b_rows(chart,gkey,seq);
 CREATE TABLE disk_b_evidence(chart TEXT NOT NULL,gkey TEXT NOT NULL,id TEXT NOT NULL,PRIMARY KEY(chart,gkey,id)) WITHOUT ROWID;
 CREATE TEMP TABLE disk_b_sources(source TEXT PRIMARY KEY,label TEXT NOT NULL,ordinal INTEGER NOT NULL);`);
 const insert=db.prepare('INSERT INTO disk_b_rows(chart,gkey,json) VALUES(?,?,?)'),insertEvidence=db.prepare('INSERT OR IGNORE INTO disk_b_evidence VALUES(?,?,?)'),sourceFind=db.prepare('SELECT label FROM disk_b_sources WHERE source=?'),sourceInsert=db.prepare('INSERT INTO disk_b_sources VALUES(?,?,?)');
 const templates=new Map(),base=buildExplorerB(empty,{...options,originalConversations:[],comparisonA:null,comparisonB:null,history:{enabled:false}});
 for(const chart of base.charts)templates.set(chart.id,{...chart,rows:undefined,contract:{...chart.contract,eligible:0,available:0,unavailable:0}});
 const first=options.sequenceConversationId||options.chartControls?.['19-path-ladder']?.conversationId||db.prepare('SELECT cid FROM selected_conversations ORDER BY ordinal LIMIT 1').get()?.cid;
 let conversationOrdinal=0,itemOffset=0,requestOffset=0,contextOffset=0,sourceCount=0;
 const sourceLabel=source=>{source=source||'unknown';const prior=sourceFind.get(source);if(prior)return prior.label;const label=`Source ${++sourceCount}`;sourceInsert.run(source,label,sourceCount);return label;};
 for(const conversation of ctx.conversations({selected:true})){
  ctx.signal?.throwIfAborted();const original=ctx.originalConversation(conversation.id)||conversation,selection={conversations:[conversation],rows:conversation.records||[],filters,dateRange:ctx.dateRange};
  const result=buildExplorerB(selection,{...options,originalConversations:[original],sequenceConversationId:first,comparisonA:null,comparisonB:null,history:{enabled:false}});conversationOrdinal++;
  let localItems=0,localRequests=0,localContexts=0;
  for(const chart of result.charts){
   if(customFamily(chart.family))continue;
   const previous=templates.get(chart.id),oldEligible=previous.contract.eligible,oldAvailable=previous.contract.available;
   const scoped=chart.id==='19-path-ladder'||chart.id==='20-retained-node-graph',use=scoped?(conversation.id===first?chart:previous):(chart.contract.eligible>0||oldEligible===0?chart:previous);
   templates.set(chart.id,{...use,rows:undefined,contract:{...use.contract,eligible:oldEligible+chart.contract.eligible,available:oldAvailable+chart.contract.available,unavailable:oldEligible+chart.contract.eligible-oldAvailable-chart.contract.available}});
   for(const entry of chart.rows){
    const {evidenceKey,...row}=entry;
    if(typeof row.conversation==='string'&&/^Conversation \d+$/.test(row.conversation))row.conversation=`Conversation ${conversationOrdinal}`;
    if(chart.id==='23-lifecycle-lanes'){const n=Number(/^Item (\d+)$/.exec(row.task)?.[1]||0);localItems=Math.max(localItems,n);if(n)row.task=`Item ${itemOffset+n}`;}
    if(chart.id==='24-request-input-output'){localRequests++;row.request=`Request ${requestOffset+localRequests}`;}
    if(chart.id==='24-context-occupancy'){localContexts++;row.observation=`Context ${contextOffset+localContexts}`;}
    if(chart.id==='29-observability-matrix')row.source=sourceLabel(conversation.records?.[0]?.sourceId||conversation.sourceId||conversation.sourceInstanceId||'Unknown source');
    const spec=grouped.get(chart.id),gkey=spec?quote(spec.keys.map(key=>row[key])):quote([conversationOrdinal,chart.id,insert.lastInsertRowid||0,entry.evidenceKey]);
    insert.run(chart.id,gkey,quote(row));for(const id of valuesFor(result,entry))if(typeof id==='string')insertEvidence.run(chart.id,gkey,id);
   }
  }
  itemOffset+=localItems;requestOffset+=localRequests;contextOffset+=localContexts;
  if(conversationOrdinal%16===0){ctx.onProgress?.({phase:'calculate',completed:conversationOrdinal});await new Promise(resolve=>setImmediate(resolve));}
 }
 const output=[];
 for(const template of templates.values()){
  if(customFamily(template.family))continue;
  const contract={...template.contract};contract.state=contract.eligible>0&&contract.available>0?'ready':'unavailable';
  if(automaticReasons.has(contract.reason))contract.reason=contract.eligible===0?'No eligible observations in the applied selection':contract.available===0?'Required recorded fields are unavailable':'Available observations measured; missing data excluded';
  const manifest={...template,contract};delete manifest.rows;ctx.registerChart(manifest);output.push(manifest);
  const spec=grouped.get(template.id);
  const evidenceFor=gkey=>({sql:'SELECT id FROM disk_b_evidence WHERE chart=? AND gkey=?',params:[template.id,gkey]});
  if(spec){
   const sums=spec.sums.map((field,index)=>`SUM(COALESCE(json_extract(json,'$.${field}'),0)) AS n${index}`).join(',');
   for(const entry of db.prepare(`SELECT gkey,json,${sums},MIN(seq) AS first FROM disk_b_rows WHERE chart=? GROUP BY gkey ORDER BY first`).iterate(template.id)){
    const row=JSON.parse(entry.json);for(let index=0;index<spec.sums.length;index++)row[spec.sums[index]]=entry['n'+index];if(template.id==='29-observability-matrix')row.fraction=row.eligible?row.available/row.eligible:null;ctx.addRow(template.id,row,evidenceFor(entry.gkey));
   }
  }else for(const entry of db.prepare('SELECT gkey,json FROM disk_b_rows WHERE chart=? ORDER BY seq').iterate(template.id))ctx.addRow(template.id,JSON.parse(entry.json),evidenceFor(entry.gkey));
 }
 const custom=await buildComparisonsAndHistory(ctx,templates);output.push(...custom);return{charts:output};
}

const sideRef=side=>side==='a'?'cmp_a':'cmp_b';
const validText="observed=1 AND characters IS NOT NULL";
const numeric=row=>Number(row?.n||0);
function sideTotals(ctx,side,category){const ref=sideRef(side),where=category?' WHERE category=?':'',args=category?[category]:[];return ctx.db.prepare(`SELECT COALESCE(SUM(weight),0) eligible,COALESCE(SUM(CASE WHEN ${validText} THEN weight ELSE 0 END),0) available,COALESCE(SUM(CASE WHEN ${validText} THEN weight*characters ELSE 0 END),0) value FROM ${ref}.selected_records${where}`).get(...args);}
function selectionFor(context,cid){const c=context?.selectedConversation(cid);return{conversations:c?[c]:[],rows:c?.records||[],filters:context?.filters||{},dateRange:context?.dateRange};}
function metadataChart(ctx,templates,id,eligible,available,extra={}){const template=templates.get(id),contract={...template.contract,...extra,eligible,available,unavailable:eligible-available,state:eligible>0&&available>0?'ready':'unavailable'};const manifest={...template,contract};delete manifest.rows;ctx.registerChart(manifest);return manifest;}
function sideEvidence(sqlA,sqlB,paramsA=[],paramsB=[]){return{sql:`SELECT id FROM (${sqlA}) UNION SELECT id FROM (${sqlB})`,params:[...paramsA,...paramsB]};}
function weightedQuantile(ctx,side,category,p,n){if(!n)return null;const lo=Math.floor((n-1)*p),hi=Math.ceil((n-1)*p);let at=0,a=null,b=null;for(const row of ctx.rows(`SELECT characters value,SUM(weight) weight FROM ${sideRef(side)}.selected_records WHERE category=? AND ${validText} AND weight=CAST(weight AS INTEGER) GROUP BY characters ORDER BY characters`,[category])){const end=at+row.weight;if(a===null&&lo<end)a=row.value;if(hi<end){b=row.value;break;}at=end;}return a===null||b===null?null:a+(b-a)*((n-1)*p-lo);}
function objectPromptEntries(conversation,original){
 const groups=new Map();for(const r of conversation.records||[]){const key=r.objectId||r.logicalId||r.id;if(!key)continue;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 const result=[];for(const[key,records]of groups){const users=records.filter(r=>r.category==='user');if(!users.length||users.some(r=>observedCharacters(r)===null))continue;const analysis=users.map(r=>r.explorerAnalysis).find(a=>a?.objectPromptKey),expected=analysis?.objectPromptSegments??(original.records||[]).filter(r=>(r.objectId||r.logicalId||r.id)===key&&r.category==='user').length;if(expected!==users.length)continue;const precomputed=analysis?.objectPromptKey;if(users.some(r=>r.textExcerpt===true||r.textTruncated===true)&&!precomputed&&!(users.length===1&&users[0].promptMatchKey))continue;result.push({key:'sha256:'+(precomputed||users.length===1&&users[0].promptMatchKey||canonicalPromptKey(users.map(r=>String(r.text)).join('\n\n'))),ids:users.map(r=>r.id)});}return result;
}
async function buildComparisonsAndHistory(ctx,unused){
 const a=ctx.side?.('a'),b=ctx.side?.('b'),options=ctx.options||{},empty={conversations:[],rows:[],filters:ctx.filters,dateRange:ctx.dateRange};
 const sample=buildExplorerB(empty,{...options,originalConversations:[],comparisonA:a?selectionFor(a,'__none__'):null,comparisonB:b?selectionFor(b,'__none__'):null,history:{enabled:false}}),templates=new Map(sample.charts.map(c=>[c.id,c]));
 const comparable=!!a&&!!b&&(a.filters.perspective||'unique')===(b.filters.perspective||'unique')&&(a.filters.timeZone||a.dateRange?.zone||'UTC')===(b.filters.timeZone||b.dateRange?.zone||'UTC')&&(a.filters.timeBasis||'message')===(b.filters.timeBasis||'message');
 const output=[],ids=sample.charts.filter(c=>c.family>=25&&c.family<=28||c.family===31).map(c=>c.id),totals={a:a?sideTotals(ctx,'a'):{eligible:0,available:0,value:0},b:b?sideTotals(ctx,'b'):{eligible:0,available:0,value:0}},eligible=totals.a.eligible+totals.b.eligible,available=totals.a.available+totals.b.available;
 const compareContract={comparisonApplied:!!a&&!!b,scopeA:a?{perspective:a.filters.perspective||'unique',branch:a.filters.branch||'selected',records:totals.a.eligible}:null,scopeB:b?{perspective:b.filters.perspective||'unique',branch:b.filters.branch||'selected',records:totals.b.eligible}:null};
 if(!comparable){for(const id of ids){const template=templates.get(id),contract={...template.contract,...compareContract};if(id==='28-change-contributions'){contract.totalA=totals.a.available>0?totals.a.value:null;contract.totalB=totals.b.available>0?totals.b.value:null;contract.totalDelta=contract.totalA!==null&&contract.totalB!==null?contract.totalB-contract.totalA:null;}const manifest={...template,contract};delete manifest.rows;ctx.registerChart(manifest);output.push(manifest);}await historyRows(ctx,output);return output;}
 const dimension=options.chartControls?.['25-aligned-deltas']?.dimension||options.compareDimension||'category',groupSQL=dimension==='model'?'model':dimension==='day'?"COALESCE(day,'Undated')":'category';
 ctx.db.exec('DROP TABLE IF EXISTS disk_b_delta;CREATE TEMP TABLE disk_b_delta(key TEXT PRIMARY KEY,json TEXT NOT NULL)');const deltaPut=ctx.db.prepare('INSERT INTO disk_b_delta VALUES(?,?)');
 const grouped=`WITH facts AS (SELECT ${groupSQL} key,weight,observed,characters,'a' side FROM cmp_a.selected_records UNION ALL SELECT ${groupSQL},weight,observed,characters,'b' FROM cmp_b.selected_records) SELECT key,COALESCE(SUM(CASE WHEN side='a' THEN weight ELSE 0 END),0) ae,COALESCE(SUM(CASE WHEN side='b' THEN weight ELSE 0 END),0) be,COALESCE(SUM(CASE WHEN side='a' AND ${validText} THEN weight ELSE 0 END),0) aa,COALESCE(SUM(CASE WHEN side='b' AND ${validText} THEN weight ELSE 0 END),0) ba,COALESCE(SUM(CASE WHEN side='a' AND ${validText} THEN characters*weight ELSE 0 END),0) av,COALESCE(SUM(CASE WHEN side='b' AND ${validText} THEN characters*weight ELSE 0 END),0) bv FROM facts GROUP BY key ORDER BY disk_b_utf16_key(key)`;
 output.push(metadataChart(ctx,templates,'25-aligned-deltas',eligible,available,{...compareContract,dimension}));let componentDelta=0,allKnown=true,components=0;
 for(const r of ctx.rows(grouped)){
  const av=r.aa>0?r.av:r.ae>0?null:totals.a.available>0?0:null,bv=r.ba>0?r.bv:r.be>0?null:totals.b.available>0?0:null,row={key:r.key,a:av,b:bv,delta:av!==null&&bv!==null?bv-av:null,relative:av>0&&bv!==null?(bv-av)/av:null,aEligible:r.ae,aAvailable:r.aa,bEligible:r.be,bAvailable:r.ba};deltaPut.run(r.key,quote(row));components++;if(row.delta===null)allKnown=false;else componentDelta+=row.delta;
  ctx.addRow('25-aligned-deltas',row,sideEvidence(`SELECT id FROM cmp_a.selected_records WHERE ${groupSQL}=? AND ${validText}`,`SELECT id FROM cmp_b.selected_records WHERE ${groupSQL}=? AND ${validText}`,[r.key],[r.key]));
 }
 const totalA=totals.a.available>0?totals.a.value:null,totalB=totals.b.available>0?totals.b.value:null,totalDelta=totalA!==null&&totalB!==null?totalB-totalA:null,component=allKnown&&components?componentDelta:null;
 output.push(metadataChart(ctx,templates,'28-change-contributions',eligible,available,{...compareContract,totalA,totalB,totalDelta,componentDelta:component,reconciliationResidual:component!==null&&totalDelta!==null?totalDelta-component:null,reconciled:component!==null&&totalDelta===component}));
 for(const entry of ctx.rows('SELECT json FROM disk_b_delta ORDER BY disk_b_utf16_key(key)')){const r=JSON.parse(entry.json);ctx.addRow('28-change-contributions',{component:r.key,a:r.a,b:r.b,contribution:r.delta,aAvailable:r.aAvailable,bAvailable:r.bAvailable},sideEvidence(`SELECT id FROM cmp_a.selected_records WHERE ${groupSQL}=? AND ${validText}`,`SELECT id FROM cmp_b.selected_records WHERE ${groupSQL}=? AND ${validText}`,[r.key],[r.key]));}
 const category=options.chartControls?.['26-distribution-shifts']?.category||'response',ta=sideTotals(ctx,'a',category),tb=sideTotals(ctx,'b',category),nA=ta.available,nB=tb.available,eA=ta.eligible,eB=tb.eligible,distributionExtra={...compareContract,category};
 output.push(metadataChart(ctx,templates,'26-distribution-shifts',eA+eB,nA+nB,distributionExtra));
 for(const p of[0,.1,.25,.5,.75,.9,1]){const qa=weightedQuantile(ctx,'a',category,p,nA),qb=weightedQuantile(ctx,'b',category,p,nB);ctx.addRow('26-distribution-shifts',{quantile:p,a:qa,b:qb,shift:qa!==null&&qb!==null?qb-qa:null,aN:nA,bN:nB,aUnavailable:eA-nA,bUnavailable:eB-nB},sideEvidence(`SELECT id FROM cmp_a.selected_records WHERE category=? AND ${validText}`,`SELECT id FROM cmp_b.selected_records WHERE category=? AND ${validText}`,[category],[category]));}
 output.push(metadataChart(ctx,templates,'26-distribution-overlay',eA+eB,nA+nB,distributionExtra));const edges=[0,64,256,1024,4096,16384,65536,262144,Infinity];
 for(let index=0;index<edges.length-1;index++){const lower=edges[index],upper=edges[index+1],condition=`category=? AND ${validText} AND characters>=?`+(upper===Infinity?'':' AND characters<?'),params=upper===Infinity?[category,lower]:[category,lower,upper],ac=numeric(ctx.get(`SELECT COALESCE(SUM(weight),0)n FROM cmp_a.selected_records WHERE ${condition}`,params)),bc=numeric(ctx.get(`SELECT COALESCE(SUM(weight),0)n FROM cmp_b.selected_records WHERE ${condition}`,params));ctx.addRow('26-distribution-overlay',{lower,upper:upper===Infinity?'unbounded':upper,aCount:ac,bCount:bc,aN:nA,bN:nB,aFraction:nA?ac/nA:null,bFraction:nB?bc/nB:null},sideEvidence(`SELECT id FROM cmp_a.selected_records WHERE ${condition}`,`SELECT id FROM cmp_b.selected_records WHERE ${condition}`,params,params));}
 output.push(metadataChart(ctx,templates,'26-ecdf-overlay',eA+eB,nA+nB,compareContract));
 const ecdf=`WITH facts AS(SELECT characters value,weight,'a' side FROM cmp_a.selected_records WHERE category=? AND ${validText} UNION ALL SELECT characters,weight,'b' FROM cmp_b.selected_records WHERE category=? AND ${validText}),groups AS(SELECT value,SUM(CASE WHEN side='a' THEN weight ELSE 0 END)ac,SUM(CASE WHEN side='b' THEN weight ELSE 0 END)bc FROM facts GROUP BY value) SELECT value,SUM(ac) OVER(ORDER BY value ROWS UNBOUNDED PRECEDING)ac,SUM(bc) OVER(ORDER BY value ROWS UNBOUNDED PRECEDING)bc FROM groups ORDER BY value`;
 for(const row of ctx.rows(ecdf,[category,category]))ctx.addRow('26-ecdf-overlay',{threshold:row.value,aCumulative:row.ac,bCumulative:row.bc,aN:nA,bN:nB,aFraction:nA?row.ac/nA:null,bFraction:nB?row.bc/nB:null},sideEvidence(`SELECT id FROM cmp_a.selected_records WHERE category=? AND ${validText} AND characters=?`,`SELECT id FROM cmp_b.selected_records WHERE category=? AND ${validText} AND characters=?`,[category,row.value],[category,row.value]));
 await intersectionRows(ctx,templates,compareContract,output);
 await coverageRows(ctx,templates,compareContract,eligible,available,output);
 await historyRows(ctx,output);return output;
}

async function intersectionRows(ctx,templates,compareContract,output){
 ctx.db.exec('DROP TABLE IF EXISTS disk_b_set_keys;DROP TABLE IF EXISTS disk_b_set_evidence;CREATE TABLE disk_b_set_keys(lens TEXT,side TEXT,key TEXT,PRIMARY KEY(lens,side,key)) WITHOUT ROWID;CREATE TABLE disk_b_set_evidence(lens TEXT,side TEXT,key TEXT,id TEXT,PRIMARY KEY(lens,side,key,id)) WITHOUT ROWID;');const keyPut=ctx.db.prepare('INSERT OR IGNORE INTO disk_b_set_keys VALUES(?,?,?)'),idPut=ctx.db.prepare('INSERT OR IGNORE INTO disk_b_set_evidence VALUES(?,?,?,?)');
 const put=(lens,side,key,ids)=>{keyPut.run(lens,side,key);for(const id of ids)if(typeof id==='string')idPut.run(lens,side,key,id);};
 for(const side of['a','b']){const context=ctx.side(side);let done=0;for(const c of context.conversations({selected:true})){ctx.check?.();const original=context.originalConversation(c.id)||c;put('scoped-conversation-identity',side,original.originalScopedId||original.id,c.records.map(r=>r.id));put('explicit-alias-identity',side,c.id,c.records.map(r=>r.id));for(const group of objectPromptEntries(c,original))put('exact-prompt-content',side,group.key,group.ids);if(++done%16===0)await new Promise(resolve=>setImmediate(resolve));}}
 const convA=numeric(ctx.get('SELECT COUNT(*)n FROM cmp_a.selected_conversations')),convB=numeric(ctx.get('SELECT COUNT(*)n FROM cmp_b.selected_conversations'));output.push(metadataChart(ctx,templates,'27-selection-intersections',convA+convB,convA+convB,compareContract));
 for(const lens of['scoped-conversation-identity','explicit-alias-identity','exact-prompt-content']){const a=numeric(ctx.get("SELECT COUNT(*)n FROM disk_b_set_keys WHERE lens=? AND side='a'",[lens])),b=numeric(ctx.get("SELECT COUNT(*)n FROM disk_b_set_keys WHERE lens=? AND side='b'",[lens])),union=numeric(ctx.get('SELECT COUNT(DISTINCT key)n FROM disk_b_set_keys WHERE lens=?',[lens]));
  for(const region of['A only','A ∩ B','B only']){const side=region==='B only'?'b':'a',other=side==='a'?'b':'a',exists=region==='A ∩ B'?'EXISTS':'NOT EXISTS',keys=`SELECT k.key FROM disk_b_set_keys k WHERE k.lens=? AND k.side=? AND ${exists}(SELECT 1 FROM disk_b_set_keys o WHERE o.lens=k.lens AND o.side=? AND o.key=k.key)`,params=[lens,side,other],count=numeric(ctx.get(`SELECT COUNT(*)n FROM(${keys})`,params));ctx.addRow('27-selection-intersections',{lens,region,count,aPopulation:a,bPopulation:b,union},{sql:`SELECT DISTINCT id FROM disk_b_set_evidence WHERE lens=? AND key IN(${keys})`,params:[lens,...params]});}
 }
}

async function coverageRows(ctx,templates,compareContract,eligible,available,output){
 ctx.db.exec('DROP TABLE IF EXISTS disk_b_metric_parts;CREATE TEMP TABLE disk_b_metric_parts(metric TEXT,json TEXT)');const put=ctx.db.prepare('INSERT INTO disk_b_metric_parts VALUES(?,?)');let done=0;
 for(const row of ctx.rows('SELECT cid FROM cmp_a.selected_conversations UNION SELECT cid FROM cmp_b.selected_conversations')){const sa=selectionFor(ctx.side('a'),row.cid),sb=selectionFor(ctx.side('b'),row.cid),originals=[];for(const side of['a','b']){const c=ctx.side(side).originalConversation(row.cid);if(c)originals.push(c);}const result=buildExplorerB({conversations:[],rows:[],filters:ctx.filters,dateRange:ctx.dateRange},{...ctx.options,originalConversations:originals,comparisonA:sa,comparisonB:sb,history:{enabled:false}}),chart=result.charts.find(c=>c.id==='31-coverage-change');for(const entry of chart.rows){const{evidenceKey,...value}=entry;put.run(entry.metric,quote(value));for(const id of valuesFor(result,entry))ctx.db.prepare('INSERT OR IGNORE INTO disk_b_evidence VALUES(?,?,?)').run('31-coverage-change',entry.metric,id);}if(++done%16===0)await new Promise(resolve=>setImmediate(resolve));}
 output.push(metadataChart(ctx,templates,'31-coverage-change',eligible,available,compareContract));
 for(const metric of['text','trace','clock','usage','duration','context']){const r=ctx.get(`SELECT SUM(COALESCE(json_extract(json,'$.a'),0))a,SUM(COALESCE(json_extract(json,'$.b'),0))b,SUM(json_extract(json,'$.aEligible'))ae,SUM(json_extract(json,'$.bEligible'))be,SUM(json_extract(json,'$.aAvailable'))aa,SUM(json_extract(json,'$.bAvailable'))ba,MIN(json_extract(json,'$.unit'))unit FROM disk_b_metric_parts WHERE metric=?`,[metric]),ae=r.ae||0,be=r.be||0,aa=r.aa||0,ba=r.ba||0,av=aa>0?r.a:null,bv=ba>0?r.b:null;ctx.addRow('31-coverage-change',{metric,unit:r.unit||(['text','trace'].includes(metric)?'Unicode code points':'available recorded observations'),a:av,b:bv,delta:av!==null&&bv!==null?bv-av:null,aEligible:ae,bEligible:be,eligibleDelta:be-ae,aAvailable:aa,bAvailable:ba,availableDelta:ba-aa,aFraction:ae?aa/ae:null,bFraction:be?ba/be:null},{sql:"SELECT id FROM disk_b_evidence WHERE chart='31-coverage-change' AND gkey=?",params:[metric]});}
}

async function historyRows(ctx,output){
 const history=ctx.options?.history||{},diff=history.diff;
 if(history.enabled===true&&diff?.metricVersion==='capture-diff:2'){
  for(const kind of['added','removed','changed','unchanged'])if(!Number.isSafeInteger(diff.summary?.[kind])||diff.summary[kind]<0)throw Object.assign(new Error('Invalid retained capture-diff summary.'),{code:'HISTORY_DIFF_INVALID'});
  if(typeof diff.queryHandle!=='string'||!diff.queryHandle||!diff.captures?.left||!diff.captures?.right)throw Object.assign(new Error('Retained capture-diff query is unavailable.'),{code:'HISTORY_DIFF_INVALID'});
  const metadataDiff={...diff,metricVersion:'capture-diff:1',tables:{capabilityChanges:[],selectedPathChanges:[],conversationsAdded:[],conversationsRemoved:[]}},kernel=buildExplorerB({conversations:[],rows:[],filters:ctx.filters,dateRange:ctx.dateRange},{...ctx.options,originalConversations:[],comparisonA:null,comparisonB:null,history:{...history,diff:metadataDiff}}),chart=kernel.charts.find(c=>c.family===32),manifest={...chart,contract:{...chart.contract,captureDiffVersion:'capture-diff:2'}};delete manifest.rows;ctx.registerChart(manifest);output.push(manifest);
  const put=(table,row)=>{const capture=diff.captures[table==='removed'||table==='conversationsRemoved'?'left':'right'];ctx.addRow(chart.id,{...row,evidenceAvailability:'identity list retained; paginated query',historyEvidence:{reportId:diff.queryHandle,table,captureId:capture.id,sourceId:history.sourceId||capture.sourceId||null}},null);};
  for(const kind of['added','removed','changed','unchanged'])put(kind,{change:`${kind} retained content identity`,identityScope:'content-segment',hashBasis:kind==='changed'?'Service-owned normalized content fingerprint':'scoped retained identity',count:diff.summary[kind]});
  for(const[table,change]of[['capabilityChanges','capabilities changed'],['selectedPathChanges','selected path changed'],['conversationsAdded','added conversation'],['conversationsRemoved','removed conversation']]){const count=diff.tableCounts?.[table]??0;if(!Number.isSafeInteger(count)||count<0)throw Object.assign(new Error('Invalid retained capture-diff table count.'),{code:'HISTORY_DIFF_INVALID'});put(table,{change,identityScope:'conversation',hashBasis:'retained scoped conversation metadata',count});}return;
 }
 const result=buildExplorerB({conversations:[],rows:[],filters:ctx.filters,dateRange:ctx.dateRange},{...ctx.options,originalConversations:[],comparisonA:null,comparisonB:null}),chart=result.charts.find(c=>c.family===32),manifest={...chart};delete manifest.rows;ctx.registerChart(manifest);output.push(manifest);for(const entry of chart.rows){const{evidenceKey,...row}=entry;ctx.addRow(chart.id,row,valuesFor(result,entry));}
}
