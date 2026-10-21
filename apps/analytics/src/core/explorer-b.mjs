/** Explorer sequence/comparison/observability algorithms, MIT davoda1.
 * Pure data calculations: no I/O, source changes, archived code execution or network.
 * These definitions are separate from every legacy 1.0 metric.
 */
import {EXPLORER_TEXT_ALGORITHM_VERSION} from './explorer-a.mjs';
import {canonicalPromptKey,sha256Text} from './prompt-key.mjs';
export const EXPLORER_B_VERSION = '2.0.0-b1';
export const QUANTILE_DEFINITION = 'Type 7: linear interpolation at (n−1)p, with integer membership weights.';
const arr = v => Array.isArray(v) ? v : [];
const finite = v => typeof v === 'number' && Number.isFinite(v);
const unique = v => [...new Set(v)];
const w = r => finite(r?.weight) && r.weight > 0 ? r.weight : 1;
const sum = (rows, fn = w) => rows.reduce((s, r) => s + fn(r), 0);
const model = r => !r?.model || /^(unknown|unavailable|unknown model)$/i.test(r.model) ? 'Unknown model' : String(r.model);
const category = r => ['user','response','thinking','recap','commentary','tool_call','tool_output','system','other','redacted'].includes(r?.category) ? r.category : 'other';
const codePointCount = value => {let n=0;for(const _ of value)n++;return n;};
const chars = r => {
  if(r?.observed===false||r?.category==='redacted')return null;
  if(r?.explorerAnalysis?.version===EXPLORER_TEXT_ALGORITHM_VERSION)return r.explorerAnalysis.observed&&finite(r.explorerAnalysis.characters)?r.explorerAnalysis.characters:null;
  if(r?.textExcerpt===true||r?.textTruncated===true||typeof r?.textExcerpt==='string')return null;
  return typeof r?.text==='string'?codePointCount(r.text):null;
};
const ids = rows => unique(rows.map(r => r.id).filter(Boolean));
const observed = r => chars(r) !== null;
const clockDate = r => finite(r?.timestamp) && ['hour','minute','second','millisecond','microsecond','nanosecond','seconds','milliseconds'].includes(r.datePrecision) && !/^(?:import|filesystem|database-operation|operation|unavailable)$/.test(r.timeProvenance || '') && !r.invalidTimestamp;
const parentSupported = (r,c) => r?.relationship?.verified === true || c?.format === 'chatgpt-mapping' && r?.nodeId != null && Object.prototype.hasOwnProperty.call(r,'parentId');
const safeFormat = value => /^[a-z][a-z0-9-]{0,63}$/.test(value || '') ? value : 'Unknown format';
const providerAliases=new Map([['chatgpt','openai'],['openai','openai'],['claude','anthropic'],['anthropic','anthropic'],['veniceai','venice'],['venice','venice'],['grok','grok'],['xai','grok'],['meta ai','meta'],['meta-ai','meta'],['meta','meta'],['gemini','gemini'],['google ai studio','google-ai-studio'],['ai studio','google-ai-studio'],['google-ai-studio','google-ai-studio'],['lm studio','lm-studio'],['lmstudio','lm-studio'],['lm-studio','lm-studio'],['openrouter','openrouter'],['synthetic','synthetic']]);
const safeProvider = value => providerAliases.get(String(value||'').toLowerCase())||'Unknown platform';
const status = value => ['completed','complete','succeeded','success','failed','error','cancelled','canceled','running','pending','queued','in_progress','unknown'].includes(String(value).toLowerCase()) ? String(value).toLowerCase() : 'Unknown status';
const tool = value => /^(?:python|browser|web|web search|web_search|file_search|search|computer|terminal|bash|shell|code_interpreter|dalle|imagegen|image_generation|function|tool|server function)$/i.test(String(value || '')) ? String(value) : value ? 'Other recorded tool' : 'Unknown tool';
const DEFAULT_EDGES = [0,64,256,1024,4096,16384,65536,262144,Infinity];
const DURATION_EDGES = [0,1,10,100,1000,10000,60000,300000,Infinity];
const TOKENS_EDGES = [0,16,64,256,1024,4096,16384,65536,Infinity];
const edgeLabel = v => v === Infinity ? 'unbounded' : v;
const stableJSON=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);

/** Weighted Type-7 quantiles without materializing duplicate membership samples. */
export function explorerQuantile(samples, p) {
  const rows = samples.filter(r => finite(r.value) && Number.isInteger(w(r))).sort((a,b) => a.value-b.value);
  const n = sum(rows); if (!n || !finite(p) || p<0 || p>1) return null;
  const h=(n-1)*p, lo=Math.floor(h), hi=Math.ceil(h);
  let pos=0, a=null, b=null;
  for (const r of rows) { const end=pos+w(r); if (a===null && lo<end) a=r.value; if (hi<end) {b=r.value;break;} pos=end; }
  return a + (b-a)*(h-lo);
}

function fixedBins(samples, edges=DEFAULT_EDGES) {
  const valid=Array.isArray(edges)&&edges.length>1&&edges[0]===0&&edges.at(-1)===Infinity&&edges.slice(1).every((v,i)=>v>edges[i]);
  const bins=(valid?edges:DEFAULT_EDGES).slice(0,-1).map((lower,i)=>({lower,upper:(valid?edges:DEFAULT_EDGES)[i+1],count:0,items:[]}));
  for(const sample of samples) {if(!finite(sample.value)||sample.value<0)continue;const b=bins.find(bin=>sample.value>=bin.lower&&sample.value<bin.upper);if(b){b.count+=w(sample);b.items.push(sample);}}
  return bins;
}

function objectGroups(c) {
  const groups=new Map();
  arr(c?.records).forEach((r,i)=>{
    const key=r.objectId||r.logicalId||r.id; if(!key)return;
    if(!groups.has(key))groups.set(key,{key,records:[],first:i,order:finite(r.originalOrder)?r.originalOrder:finite(r.sourceIndex)?r.sourceIndex:i,nodeIds:[],originalIds:[]});
    const g=groups.get(key);g.records.push(r);if(r.nodeId!=null)g.nodeIds.push(String(r.nodeId));if(r.originalObjectId!=null)g.originalIds.push(String(r.originalObjectId));
  });
  return [...groups.values()].sort((a,b)=>a.order-b.order||a.first-b.first);
}

function topology(c) {
  const objects=objectGroups(c), objectByNode=new Map(), objectByOriginal=new Map(),objectByKey=new Map();
  for(const g of objects){objectByKey.set(g.key,g);for(const id of g.nodeIds)objectByNode.set(id,g);for(const id of g.originalIds)objectByOriginal.set(id,g);}
  const supplied=arr(c?.topology?.nodes), nodes=new Map();
  if(supplied.length)for(const n of supplied){
    if(n.id==null)continue;const key=String(n.id),g=objectByNode.get(key)||objectByKey.get(n.messageObjectId)||objectByOriginal.get(String(n.originalObjectId));
    nodes.set(key,{key,parent:n.parentId==null?null:String(n.parentId),hasParent:Object.prototype.hasOwnProperty.call(n,'parentId'),verified:true,selected:n.selected!==false,hasMessage:!!g||!!n.messageObjectId,messageObjectKey:g?.key||n.messageObjectId||null,records:g?.records||[],object:g});
  }
  else for(const g of objects){
    const r=g.records[0], key=String(r.nodeId??r.originalObjectId??g.key),relation=r.relationship;
    const parent=relation?.parentNodeId??relation?.parentObjectId??relation?.parentOriginalId??r.parentId;
    nodes.set(key,{key,parent:parent==null?null:String(parent),hasParent:!!relation||Object.prototype.hasOwnProperty.call(r,'parentId'),verified:parentSupported(r,c),selected:g.records.some(r=>r.selected!==false),hasMessage:true,messageObjectKey:g.key,records:g.records,object:g});
  }
  // Resolve recorded original-message parent identifiers to retained node identifiers.
  const alias=new Map();for(const n of nodes.values())for(const r of n.records){if(r.originalObjectId!=null)alias.set(String(r.originalObjectId),n.key);if(r.objectId)alias.set(r.objectId,n.key);if(r.logicalId)alias.set(r.logicalId,n.key);}
  for(const n of nodes.values())if(n.parent!==null&&!nodes.has(n.parent)&&alias.has(n.parent))n.parent=alias.get(n.parent);
  const depthCache=new Map();
  function depth(key) {
    if(depthCache.has(key))return depthCache.get(key);
    const chain=[],seen=new Set();let at=key,base=null,reason=null;
    while(at!=null){
      if(depthCache.has(at)){const prior=depthCache.get(at);base=prior.value;reason=prior.reason;break;}
      if(seen.has(at)){reason='cycle';break;}seen.add(at);
      const n=nodes.get(at);if(!n){reason='missing-parent';break;}
      if(!n.verified||!n.hasParent){reason='unverified-parent';break;}
      chain.push(at);at=n.parent;
    }
    if(at===null)base=-1;
    for(let i=chain.length-1;i>=0;i--){if(base!==null)base++;depthCache.set(chain[i],{value:base,reason});}
    const result=depthCache.get(key)||{value:null,reason};depthCache.set(key,result);return result;
  }
  let missingParents=0;const children=new Map();
  for(const n of nodes.values()){n.depth=depth(n.key);if(n.parent!=null){if(!nodes.has(n.parent))missingParents++;if(!children.has(n.parent))children.set(n.parent,[]);children.get(n.parent).push(n.key);}}
  const cycles=[...nodes.values()].filter(n=>n.depth.reason==='cycle').length;
  return {nodes,objects,complete:c?.topology?.complete===true,supplied:!!supplied.length,missingParents,cycles,branchPoints:[...children.values()].filter(v=>v.length>1).length,depthUnit:'Verified retained parent edges; root depth 0, including retained non-message nodes',depthVerified:[...nodes.values()].some(n=>n.depth.value!==null)};
}

function originalMap(selected, options) {
  const m=new Map(), originals=arr(options.originalConversations).length?options.originalConversations:selected.conversations;
  for(const c of originals){const key=selected.filters?.aliases?.[c.id]||c.canonicalId||c.id;const prior=m.get(key);if(!prior||(c.snapshotCapturedAt||0)>(prior.snapshotCapturedAt||0))m.set(key,c);}
  return m;
}
function measurementRows(selection,options,sourceRecords) {
  if(!sourceRecords){const originals=originalMap(selection||{conversations:[],filters:{}},options);sourceRecords=new Map([...originals.values()].flatMap(c=>arr(c.records)).map(r=>[r.id,r]));}
  return arr(selection?.rows).map(r=>{const source=sourceRecords.get(r.id);return source&&(r.timestamp!==source.timestamp||r.datePrecision!==source.datePrecision||r.timeProvenance!==source.timeProvenance)?{...r,timestamp:source.timestamp,datePrecision:source.datePrecision,timeProvenance:source.timeProvenance,invalidTimestamp:source.invalidTimestamp}:r;});
}
function sourcePopulation(selected, originals, mode) {
  if(mode!=='conversation-context')return arr(selected.rows);
  return arr(selected.conversations).flatMap(c=>arr((originals.get(c.id)||c).records).map(r=>({...r,conversationId:c.id,provider:c.provider,weight:w(c)})));
}

/** Trust an audited normalizer contract, never the source's generic verified flag. */
export function verifiedUsage(r, options={}) {
  const u=r?.usage;if(!u||typeof u!=='object'||!r.objectId)return null;
  const audit=options.usageAudits?.[u.auditId];
  if(!audit||audit.status!=='verified'||safeProvider(audit.provider)==='Unknown platform'||safeProvider(audit.provider)!==safeProvider(r.provider)||audit.scope!==u.scope||audit.unit!==(u.unit||'tokens')||!audit.fields||u.scope!=='request')return null;
  const fields=[];
  for(const [name,meaning]of Object.entries(audit.fields)){
    const value=Array.isArray(u.fields)?u.fields.find(f=>f.name===name)?.value:u[name];
    if(finite(value)&&value>=0&&['input','output','total','cached-overlap','reasoning-overlap','cache-creation'].includes(meaning))fields.push({name,meaning,value});
  }
  return fields.length?{identity:`${r.conversationId}:${u.id||r.objectId}`,fields,scope:u.scope,unit:u.unit||'tokens',auditId:u.auditId,record:r}:null;
}

const durationScopes=new Set(['event-execution','source-execution','execution','request-execution','recap','recorded-item-lifecycle','source-item-lifecycle']);
const durationFactor=unit=>({milliseconds:1,millisecond:1,ms:1,seconds:1000,second:1000,s:1000,microseconds:0.001,microsecond:0.001,us:0.001})[unit];
export function verifiedDuration(r) {
  const observations=[];
  const e=r?.event||{},d=r?.duration;
  if(d&&durationScopes.has(d.scope)&&finite(d.value)&&d.value>=0&&durationFactor(d.unit)!=null&&(d.semanticsVerified===true||d.scope==='recap'&&/^(?:recorded|derived from recorded)/i.test(d.reliability||'')))
    observations.push({identity:`${r.conversationId}:${d.id||d.scope==='source-item-lifecycle'&&(r.sourceItemId||e.id)||r.objectId||r.id}:source:${d.scope}`,value:d.value*durationFactor(d.unit),scope:d.scope==='execution'?'source-execution':d.scope,unit:'milliseconds',record:r});
  if(finite(e.durationMs)&&e.durationMs>=0&&(e.semanticsVerified===true||e.lifecycle?.semanticsVerified===true))observations.push({identity:`${r.conversationId}:${e.id||r.id}:event`,value:e.durationMs,scope:e.lifecycle?.scope||'event-execution',unit:'milliseconds',record:r});
  return observations;
}

function lifecycle(r) {
  const value=r?.event?.lifecycle||r?.lifecycle;if(!value||value.semanticsVerified!==true)return null;
  const start=value.startedAt??value.startTimestamp??value.start,end=value.completedAt??value.endTimestamp??value.end;
  if(!finite(start)||!finite(end)||end<start||!value.taskId)return null;
  return {identity:`${r.conversationId}:${r.event?.id||r.objectId||r.id}`,task:`${r.conversationId}:${value.taskId}`,start,end,scope:durationScopes.has(value.scope)?value.scope:'recorded-item-lifecycle',intervalKind:'verified task lifecycle',record:r};
}
function recordedItemInterval(r) {
  const d=r?.duration,e=r?.event?.lifecycle;
  if(d?.scope!=='source-item-lifecycle'||d.semanticsVerified!==true||!e)return null;
  const start=e.startedAt,end=e.completedAt;if(!finite(start)||!finite(end)||end<start)return null;
  return {identity:`${r.conversationId}:${r.event?.id||r.objectId||r.id}`,task:`${r.conversationId}:${r.event?.id||r.objectId||r.id}`,start,end,scope:'source-item-lifecycle',intervalKind:'recorded item creation/completion; not execution',record:r};
}
function context(r) {
  const c=r?.contextOccupancy;return c&&finite(c.totalTokens)&&c.totalTokens>=0&&finite(c.maxContextLength)&&c.maxContextLength>0?{total:c.totalTokens,limit:c.maxContextLength,fraction:c.totalTokens/c.maxContextLength}:null;
}
function distinctBy(rows, key,prefer=()=>false) {const m=new Map();for(const r of rows){const k=key(r);if(k!=null&&(!m.has(k)||prefer(r)&&!prefer(m.get(k))))m.set(k,r);}return [...m.values()];}

function promptSets(selected,originals) {
  const set=new Map();for(const c of arr(selected?.conversations))for(const g of objectGroups(c)){
    const users=g.records.filter(r=>category(r)==='user');if(!users.length||users.some(r=>!observed(r)))continue;
    const analysis=users.map(r=>r.explorerAnalysis).find(a=>a?.version===EXPLORER_TEXT_ALGORITHM_VERSION&&a.objectPromptKey);
    const expected=analysis?.objectPromptSegments??arr((originals?.get(c.id)||c).records).filter(r=>(r.objectId||r.logicalId||r.id)===g.key&&category(r)==='user').length;
    if(expected!==users.length)continue;
    const precomputed=analysis?.objectPromptKey;
    const partial=users.some(r=>r.textExcerpt===true||r.textTruncated===true||typeof r.textExcerpt==='string');
    if(partial&&!precomputed&&!(users.length===1&&users[0].promptMatchKey))continue;
    const key=`sha256:${precomputed||users.length===1&&users[0].promptMatchKey||canonicalPromptKey(users.map(r=>String(r.text)).join('\n\n'))}`;
    if(!set.has(key))set.set(key,[]);set.get(key).push(...ids(users));
  }return set;
}

function metricPopulation(selected, metric, options={}) {
  const rows=arr(selected?.rows);
  if(metric==='text'){return {eligible:sum(rows),available:sum(rows.filter(observed)),value:sum(rows.filter(observed),r=>chars(r)*w(r)),evidence:ids(rows.filter(observed)),missing:ids(rows.filter(r=>!observed(r)))};}
  if(metric==='trace'){
    const eligible=rows.filter(r=>category(r)==='thinking'),available=eligible.filter(r=>observed(r)&&r.reasoningRepresentation!=='summary-only'&&r.reasoningRepresentation!=='unavailable'&&r.originalTraceAvailable!==false);
    const availableIds=new Set(available.map(r=>r.id));return {eligible:sum(eligible),available:sum(available),value:sum(available,r=>chars(r)*w(r)),evidence:ids(available),missing:ids(eligible.filter(r=>!availableIds.has(r.id)))};
  }
  if(metric==='clock') {const available=rows.filter(clockDate);return {eligible:sum(rows),available:sum(available),value:sum(available),evidence:ids(available),missing:ids(rows.filter(r=>!clockDate(r)))};}
  if(metric==='usage'){
    const eligible=distinctBy(rows.filter(r=>r.usage||category(r)==='response'),r=>`${r.conversationId}:${r.objectId||r.id}`,r=>!!verifiedUsage(r,options)),available=eligible.filter(r=>verifiedUsage(r,options));
    // Separate fields in chart 24; this observation count is additive and has no token overlap.
    return {eligible:sum(eligible),available:sum(available),value:sum(available),evidence:ids(available),missing:ids(eligible.filter(r=>!verifiedUsage(r,options)))};
  }
  if(metric==='duration'){
    const eligible=distinctBy(rows.filter(r=>r.duration||r.event||r.timingMetadata||['response','recap','tool_call','tool_output'].includes(category(r))),r=>`${r.conversationId}:${r.duration?.id||r.duration?.scope==='source-item-lifecycle'&&(r.sourceItemId||r.event?.id)||r.event?.lifecycle&&r.event?.id||r.objectId||r.id}`,r=>!!verifiedDuration(r).length||!!lifecycle(r)),available=eligible.filter(r=>verifiedDuration(r).length||lifecycle(r));
    return {eligible:sum(eligible),available:sum(available),value:sum(available),evidence:ids(available),missing:ids(eligible.filter(r=>!verifiedDuration(r).length&&!lifecycle(r)))};
  }
  if(metric==='context'){
    const eligible=distinctBy(rows.filter(r=>r.contextOccupancy||category(r)==='response'),r=>`${r.conversationId}:${r.objectId||r.id}`,r=>!!context(r)),available=eligible.filter(context);
    return {eligible:sum(eligible),available:sum(available),value:sum(available),evidence:ids(available),missing:ids(eligible.filter(r=>!context(r)))};
  }
  return {eligible:0,available:0,value:null,evidence:[],missing:[]};
}

/** All numerical rows are exact. Evidence IDs are worker-owned, never copied into rows. */
export function buildExplorerB(selected={conversations:[],rows:[],filters:{}}, options={}) {
  const charts=[],evidenceIndex=new Map(),originals=originalMap(selected,options),sourceRecords=new Map([...originals.values()].flatMap(c=>arr(c.records)).map(r=>[r.id,r])),allRows=measurementRows(selected,options,sourceRecords),convs=arr(selected.conversations),filters=selected.filters||{};
  selected={...selected,rows:allRows};
  const structural=new Map(convs.map(c=>[c.id,topology(originals.get(c.id)||c)]));
  let evidenceSerial=0;
  const evidence=(chartId,recordIds)=>{const key=`${chartId}:${++evidenceSerial}`;evidenceIndex.set(key,typeof recordIds==='function'?recordIds:unique(recordIds.filter(Boolean)));return key;};
  const add=(family,suffix,subview,columns,rows,details={})=>{
    const id=`${String(family).padStart(2,'0')}-${suffix}`,eligible=details.eligible??sum(allRows),available=Math.max(0,Math.min(eligible,details.available??eligible));
    const state=details.state||(eligible===0||available===0?'unavailable':'ready');
    const contract={variable:details.variable||suffix,unit:details.unit||'observations',observationUnit:details.observationUnit||'content segment',filterScope:'Applied shared filters',eligible,available,unavailable:eligible-available,dateBasis:filters.timeBasis||'message',timeZone:selected.dateRange?.zone||filters.timeZone||'UTC',datePrecision:details.datePrecision||'Original precision retained; no substitute activity dates',branchPolicy:filters.branch||'selected',perspective:filters.perspective||'unique',sourceRepresentation:'Permitted retained normalized objects; original metadata only where retained',reliability:'Derived from recorded data',algorithmVersion:EXPLORER_B_VERSION,evidenceRule:details.evidenceRule||'Exact contributing scoped segment identities; lazy paginated resolution',state,reason:details.reason||(eligible===0?'No eligible observations in the applied selection':available===0?'Required recorded fields are unavailable':'Available observations measured; missing data excluded'),...details.contract};
    const output=rows.map(row=>{const {_ids=[],...data}=row;return {...data,evidenceKey:evidence(id,_ids)};});
    charts.push({id,family,subview,titleKey:`explorer.chart${String(family).padStart(2,'0')}`,columns,rows:output,contract,display:{kind:details.kind||'bar',...details.display}});return charts.at(-1);
  };
  const sequenceControl=options.chartControls?.['19-path-ladder']||{},sequenceId=options.sequenceConversationId||sequenceControl.conversationId||convs[0]?.id;
  const sequence=convs.find(c=>c.id===sequenceId),sequenceOriginal=sequence&&(originals.get(sequence.id)||sequence),sequenceGraph=sequence&&structural.get(sequence.id);
  const selectedIds=new Set(ids(allRows));

  // 19. One explicitly scoped conversation ladder; all native transitions aggregate.
  const ladder=[];
  if(sequenceGraph){const labels=new Map([...sequenceGraph.nodes.keys()].map((key,i)=>[key,`Node ${i+1}`]));
    const ordering=sequenceOriginal.branches?.selectedNodes;
    const rank=new Map(arr(ordering).map((key,i)=>[String(key),i]));
    const nodes=[...sequenceGraph.nodes.values()].filter(n=>filters.branch==='all'||filters.branch==='alternative'?!n.selected||filters.branch==='all':n.selected).sort((a,b)=>(rank.get(a.key)??a.object?.order??Infinity)-(rank.get(b.key)??b.object?.order??Infinity));
    const seenObjects=new Map();for(const [i,n]of nodes.entries()){
      const visible=n.records.filter(r=>selectedIds.has(r.id)),response=n.records.filter(r=>category(r)==='response');
      const aliasOf=n.messageObjectKey?seenObjects.get(n.messageObjectKey)||null:null;if(n.messageObjectKey&&!aliasOf)seenObjects.set(n.messageObjectKey,labels.get(n.key));
      ladder.push({node:labels.get(n.key),aliasOf,position:i+1,lane:unique(n.records.map(category)).join(' / ')||'non-message',model:response.length?unique(response.map(model)).join(' / '):'No reply model',segments:aliasOf?0:visible.length,filteredSegments:aliasOf?0:n.records.length-visible.length,selected:n.selected,depth:n.depth.value,status:aliasOf?'retained object alias':!n.hasMessage?'non-message node':!visible.length?'filtered gap':n.depth.reason||'retained object',ordering:rank.size?'recorded selected parent path':n.object&&n.records.some(r=>finite(r.originalOrder)||finite(r.sourceIndex))?'source-record order':'retained serialization order',_ids:ids(visible)});
    }
  }
  add(19,'path-ladder','sequences',['node','aliasOf','position','lane','model','segments','filteredSegments','selected','depth','status','ordering'],ladder,{unit:'source object / retained node',observationUnit:'source object with grouped content segments',eligible:ladder.length,available:ladder.filter(r=>r.status!=='filtered gap').length,kind:'ladder',display:{x:'lane',y:'position',value:'segments'},contract:{additionalScope:sequence?'First selected conversation or explicitly selected conversation; neutral node labels':'No selected conversation',nativeAdjacency:false,orderingPolicy:'Recorded selected parent path when retained; source/serialization order labelled separately',aliasPolicy:'Topology aliases are retained nodes; original object segments count once'}});
  const transitions=new Map();let transitionEligible=0,transitionAvailable=0;
  for(const c of convs){const graph=structural.get(c.id),seen=new Set(),seenReplies=new Set(),objectParents=new Map();
    for(const node of graph.nodes.values())if(node.messageObjectKey){if(!objectParents.has(node.messageObjectKey))objectParents.set(node.messageObjectKey,new Set());objectParents.get(node.messageObjectKey).add(node.parent);}
    for(const n of graph.nodes.values()){
      const target=n.records.filter(r=>category(r)==='response');if(!target.length||filters.branch==='alternative'&&n.selected||!n.selected&&!['all','alternative'].includes(filters.branch))continue;
      const replyKey=n.messageObjectKey||n.key;if(seenReplies.has(replyKey))continue;seenReplies.add(replyKey);
      const aliased=objectParents.get(replyKey)?.size>1;
      transitionEligible+=w(c);let at=n.parent,prior=null,reason=aliased?'ambiguous aliased reply topology':n.verified?'no preceding reply':'unverified parent',visited=new Set([n.key]);
      while(!aliased&&n.verified&&at!=null){if(visited.has(at)){reason='cycle';break;}visited.add(at);const p=graph.nodes.get(at);if(!p){reason='missing parent';break;}if(!p.verified){reason='unverified parent';break;}const replies=p.records.filter(r=>category(r)==='response');if(replies.length&&p.messageObjectKey!==replyKey){prior=p;break;}at=p.parent;}
      if(!prior){const key=`Unknown adjacency|${model(target[0])}|${reason}`;if(!transitions.has(key))transitions.set(key,{source:'Unknown adjacency',target:model(target[0]),status:reason,count:0,support:0,_ids:[]});const row=transitions.get(key);row.count+=w(c);row.support++;row._ids.push(...ids(target.filter(r=>selectedIds.has(r.id))));continue;}
      const identity=`${prior.key}:${n.key}`;if(seen.has(identity))continue;seen.add(identity);
      const from=prior.records.filter(r=>category(r)==='response'),bothVisible=from.some(r=>selectedIds.has(r.id))&&target.some(r=>selectedIds.has(r.id));
      const key=`${model(from[0])}|${model(target[0])}|${bothVisible?'native adjacency':'filtered gap'}`;if(!transitions.has(key))transitions.set(key,{source:model(from[0]),target:model(target[0]),status:bothVisible?'native adjacency':'filtered gap',count:0,support:0,_ids:[]});
      const row=transitions.get(key);row.count+=w(c);row.support++;row._ids.push(...ids([...from,...target].filter(r=>selectedIds.has(r.id))));if(bothVisible)transitionAvailable+=w(c);
    }
  }
  add(19,'native-transitions','sequences',['source','target','status','count','support'],[...transitions.values()],{variable:'native-reply-model-transition',unit:'verified original reply adjacency',eligible:transitionEligible,available:transitionAvailable,kind:'matrix',display:{x:'target',y:'source',value:'count',series:'status'},reason:'Recorded parent chains establish original adjacency before filters; hidden endpoints produce filtered gaps. Legacy modelChanges retains its filtered-order definition.',contract:{branchPolicy:'Selected native reply path; all retained when branch=all',unavailableReasons:['unverified parent','missing parent','cycle','no preceding reply','filtered gap']}});

  // 20/21. Structural totals intentionally use all retained context, not text-filter subsets.
  const branchRows=[],depthRows=[];let structuralAvailable=0;
  for(const [i,c]of convs.entries()){
    const original=originals.get(c.id)||c,g=structural.get(c.id),nodes=[...g.nodes.values()],validDepth=nodes.filter(n=>n.depth.value!==null),versionNodes=arr(original.versions);
    const hasStructure=g.supplied||nodes.some(n=>n.verified)||versionNodes.length>0;if(hasStructure)structuralAvailable+=w(c);
    const alternatives=nodes.filter(n=>!n.selected),messageNodes=nodes.filter(n=>n.hasMessage),depth=validDepth.length?validDepth.reduce((maximum,n)=>Math.max(maximum,n.depth.value),0):null;
    const distinctMessageObjects=unique(messageNodes.map(n=>n.messageObjectKey||n.key)).length;
    branchRows.push({conversation:`Conversation ${i+1}`,format:safeFormat(c.format),nodes:nodes.length,messageObjects:distinctMessageObjects,nonMessageNodes:nodes.length-messageNodes.length,selectedNodes:nodes.filter(n=>n.selected).length,alternativeNodes:alternatives.length,branchPoints:hasStructure?g.branchPoints:null,missingParents:hasStructure?g.missingParents:null,cycleAffectedNodes:g.cycles,versions:versionNodes.length,alternativeVersions:versionNodes.filter(v=>v.selected===false).length,topology:g.complete?'complete original topology':g.supplied?'partial supplied topology':'partial retained message graph',count:w(c),_ids:ids(arr(c.records))});
    const retainedSegments=distinctBy(nodes.flatMap(n=>n.records),r=>r.id),alternativeSegments=retainedSegments.filter(r=>r.selected===false);
    depthRows.push({conversation:`Conversation ${i+1}`,format:safeFormat(c.format),depthUnit:g.depthUnit,maxDepth:depth,alternativeNodes:alternatives.length,branchPoints:hasStructure?g.branchPoints:null,alternativeSegments:alternativeSegments.length,retainedSegments:retainedSegments.length,alternativeShare:retainedSegments.length?alternativeSegments.length/retainedSegments.length:null,observedSelectedSegments:arr(c.records).length,complete:g.complete,count:w(c),_ids:ids(arr(c.records))});
  }
  add(20,'retained-branches-versions','sequences',['conversation','format','nodes','messageObjects','nonMessageNodes','selectedNodes','alternativeNodes','branchPoints','missingParents','cycleAffectedNodes','versions','alternativeVersions','topology','count'],branchRows,{unit:'retained nodes and version metadata observations',observationUnit:'conversation',eligible:sum(convs),available:structuralAvailable,kind:'table',contract:{branchPolicy:'All retained structural context; selected text counts remain separate',versionMeaning:'Retained source variants are not extra user requests or retry costs'}});
  const graphRows=[];if(sequenceGraph){const labels=new Map([...sequenceGraph.nodes.keys()].map((key,i)=>[key,`Node ${i+1}`]));for(const n of sequenceGraph.nodes.values())graphRows.push({source:n.parent===null?'Retained root':labels.get(n.parent)||'Missing parent',target:labels.get(n.key),count:1,support:n.records.length,selected:n.selected,hasMessage:n.hasMessage,depth:n.depth.value,status:n.depth.reason||(!n.hasMessage?'non-message node':'verified retained node'),_ids:ids(n.records.filter(r=>selectedIds.has(r.id)))});}
  add(20,'retained-node-graph','sequences',['source','target','count','support','selected','hasMessage','depth','status'],graphRows,{unit:'retained parent edge / root',eligible:graphRows.length,available:graphRows.filter(r=>r.depth!==null).length,kind:'graph',contract:{additionalScope:'Same explicitly scoped conversation as selected-path ladder',branchPolicy:'All retained structural context',topologyCompleteness:sequenceGraph?.complete?'complete':'partial'}});
  add(21,'depth-alternatives','sequences',['conversation','format','depthUnit','maxDepth','alternativeNodes','branchPoints','alternativeSegments','retainedSegments','alternativeShare','observedSelectedSegments','complete','count'],depthRows,{unit:'verified parent depth versus retained alternatives',observationUnit:'conversation',eligible:sum(convs),available:sum(depthRows.filter(r=>r.maxDepth!==null),r=>r.count),kind:'scatter',display:{x:'maxDepth',y:'alternativeNodes',value:'count',series:'format'},contract:{branchPolicy:'All retained structural context versus selected text scope',depthCompatibility:'Partition by format and depthUnit; no pooled incompatible depth values'}});

  // 22. Distinct call/output identities; never infer failures from missing output.
  const associationMode=options.chartControls?.['22-call-output-association']?.sequenceScope||options.sequenceScope||'selected';
  const toolRows=sourcePopulation(selected,originals,associationMode),calls=new Map(),outputs=new Map();
  for(const r of toolRows){const e=r.event||{};if(category(r)==='tool_call'||e.type==='tool_call'){
    const key=`${r.conversationId}:${e.id||`${r.objectId||r.id}:${e.callId||r.id}`}`;if(!calls.has(key))calls.set(key,{key,callId:e.callId,record:r,records:[]});calls.get(key).records.push(r);
  }if(category(r)==='tool_output'||e.type==='tool_output'){
    const key=`${r.conversationId}:${e.id||r.sourceItemId||`${r.objectId||r.id}:${r.rawPath||r.id}`}`;if(!outputs.has(key))outputs.set(key,{key,callId:e.callId,record:r,records:[]});outputs.get(key).records.push(r);
  }}
  const associations=new Map(),matchedOutputs=new Set(),ambiguousOutputs=new Set(),callsByJoin=new Map(),outputsByJoin=new Map();
  for(const call of calls.values())if(call.callId){const key=`${call.record.conversationId}:${call.callId}`;if(!callsByJoin.has(key))callsByJoin.set(key,[]);callsByJoin.get(key).push(call);}
  for(const output of outputs.values())if(output.callId){const key=`${output.record.conversationId}:${output.callId}`;if(!outputsByJoin.has(key))outputsByJoin.set(key,[]);outputsByJoin.get(key).push(output);}
  let associationAvailable=0;
  for(const call of calls.values()){
    const matches=call.callId?outputsByJoin.get(`${call.record.conversationId}:${call.callId}`)||[]:[],ambiguous=call.callId&&callsByJoin.get(`${call.record.conversationId}:${call.callId}`).length>1&&matches.length>0;
    matches.forEach(o=>(ambiguous?ambiguousOutputs:matchedOutputs).add(o.key));
    const bucket=ambiguous?'ambiguous':matches.length===0?'zero':matches.length===1?'one':'multiple',name=tool(call.record.event?.name),st=status(call.record.event?.status),key=`${name}|${st}|${bucket}`;
    if(!associations.has(key))associations.set(key,{tool:name,status:st,outputs:bucket,count:0,matchedOutputs:0,_ids:[]});const row=associations.get(key);row.count+=w(call.record);row.matchedOutputs+=(ambiguous?0:matches.length)*w(call.record);row._ids.push(...ids(call.records),...matches.flatMap(o=>ids(o.records)));if(!ambiguous)associationAvailable+=w(call.record);
  }
  const unmatched=[...outputs.values()].filter(o=>!matchedOutputs.has(o.key)&&!ambiguousOutputs.has(o.key)),ambiguousOutputRows=[...outputs.values()].filter(o=>ambiguousOutputs.has(o.key));
  if(unmatched.length)associations.set('unmatched',{tool:'Unmatched outputs',status:'No retained matching call',outputs:'unmatched',count:sum(unmatched,o=>w(o.record)),matchedOutputs:0,_ids:unmatched.flatMap(o=>ids(o.records))});
  if(ambiguousOutputRows.length)associations.set('ambiguous-output',{tool:'Ambiguous outputs',status:'Reused call identifier',outputs:'unmatched-ambiguous',count:sum(ambiguousOutputRows,o=>w(o.record)),matchedOutputs:0,_ids:ambiguousOutputRows.flatMap(o=>ids(o.records))});
  add(22,'call-output-association','sequences',['tool','status','outputs','count','matchedOutputs'],[...associations.values()],{unit:'distinct scoped recorded calls / outputs',observationUnit:'distinct call event identity; unmatched output identities separate',eligible:sum([...calls.values()],c=>w(c.record))+sum(unmatched,o=>w(o.record))+sum(ambiguousOutputRows,o=>w(o.record)),available:associationAvailable+sum(unmatched,o=>w(o.record)),kind:'matrix',display:{x:'outputs',y:'tool',value:'count'},contract:{additionalScope:associationMode==='conversation-context'?'Explicit conversation-context: all retained conversation records':'Selected records only',branchPolicy:associationMode==='conversation-context'?'All retained conversation context':filters.branch||'selected',missingOutputMeaning:'Retained association condition; zero outputs is not proof of failure',ambiguousCallPolicy:'Distinct event identities preserved; reused call join identifiers cannot assign one output to multiple calls',freeTextToolPolicy:'Unrecognized function names use a neutral aggregate label'}});

  // 23. Independent duration scopes and original lifecycle endpoints.
  const durations=distinctBy(allRows.flatMap(r=>verifiedDuration(r)),d=>d.identity),durationRows=[];
  for(const scope of unique(durations.map(d=>d.scope))){const samples=durations.filter(d=>d.scope===scope).map(d=>({...d,weight:w(d.record)}));for(const b of fixedBins(samples,DURATION_EDGES))durationRows.push({scope,lower:b.lower,upper:edgeLabel(b.upper),count:b.count,_ids:ids(b.items.map(d=>d.record))});}
  const durationEligible=metricPopulation(selected,'duration',options);
  add(23,'recorded-duration-distribution','sequences',['scope','lower','upper','count'],durationRows,{unit:'milliseconds with separately validated scope',observationUnit:'distinct source object/item bearing one or more separately scoped duration fields',eligible:durationEligible.eligible,available:durationEligible.available,display:{x:'lower',y:'count',series:'scope'},reason:'Only scoped durations with verified unit semantics, recorded item lifecycle durations, or numerical recap representations; uninterpreted timing scalars excluded.',contract:{binClosure:'[lower, upper)',scopePolicy:'Event execution, source execution and recap stay separate'}});
  const executionSpans=distinctBy(allRows.map(lifecycle).filter(Boolean),s=>s.identity),spans=distinctBy(allRows.map(r=>lifecycle(r)||recordedItemInterval(r)).filter(Boolean),s=>s.identity),taskLabels=new Map(),lifeRows=[];
  for(const s of spans){if(!taskLabels.has(s.task))taskLabels.set(s.task,`Item ${taskLabels.size+1}`);lifeRows.push({task:taskLabels.get(s.task),scope:s.scope,intervalKind:s.intervalKind,start:s.start,end:s.end,milliseconds:s.end-s.start,count:w(s.record),_ids:[s.record.id]});}
  add(23,'lifecycle-lanes','sequences',['task','scope','intervalKind','start','end','milliseconds','count'],lifeRows,{unit:'original timestamp milliseconds and recorded interval milliseconds',observationUnit:'recorded source-item interval or verified task lifecycle, separately labelled',eligible:sum(allRows.filter(r=>r.event?.lifecycle||r.lifecycle)),available:sum(spans,s=>w(s.record)),kind:'lanes',display:{x:'start',y:'end',value:'milliseconds',series:'scope'},contract:{dateBasis:'Original source-item lifecycle endpoints, never ordinary message gaps',intervalInterpretation:'Recorded item creation/completion stays separate from verified task lifecycle; neither is generation latency or TTFT',concurrencyPolicy:'Only verified task lifecycle with meaningful endpoints can enter concurrency; source-item creation alone is excluded'}});
  const concurrencyRows=[];for(const [i,c]of convs.entries()){
    const group=executionSpans.filter(s=>s.record.conversationId===c.id);if(!group.length)continue;
    const tasks=new Map();for(const s of group){if(!tasks.has(s.task))tasks.set(s.task,[]);tasks.get(s.task).push(s);}
    const events=[];for(const taskSpans of tasks.values()){
      const ordered=[...taskSpans].sort((a,b)=>a.start-b.start||a.end-b.end),merged=[];
      for(const s of ordered){if(s.start===s.end)continue;const last=merged.at(-1);if(last&&s.start<=last.end)last.end=Math.max(last.end,s.end);else merged.push({start:s.start,end:s.end});}
      for(const interval of merged){events.push({time:interval.start,delta:1},{time:interval.end,delta:-1});}
    }
    events.sort((a,b)=>a.time-b.time||a.delta-b.delta);let active=0,maximum=0;for(const e of events){active+=e.delta;maximum=Math.max(maximum,active);}
    concurrencyRows.push({conversation:`Conversation ${i+1}`,recordedTasks:tasks.size,maxConcurrentTasks:maximum,count:w(c),_ids:ids(group.map(s=>s.record))});
  }
  add(23,'verified-task-concurrency','sequences',['conversation','recordedTasks','maxConcurrentTasks','count'],concurrencyRows,{unit:'distinct simultaneous verified lifecycle task identities',observationUnit:'conversation-scoped verified tasks',eligible:sum(convs),available:sum(concurrencyRows,r=>r.count),kind:'bar',display:{x:'conversation',y:'maxConcurrentTasks'},reason:'Meaningful recorded lifecycle endpoints and task identity are required. Source-item creation/completion and ordinary message dates never establish execution concurrency.',contract:{intervalPolicy:'Half-open [start,end); merge overlapping intervals of same task before sweep; end before start at ties',branchPolicy:filters.branch||'selected'}});

  // 24. Request identities and audited field semantics; overlapping fields never stacked.
  const usageRecords=distinctBy(allRows.map(r=>verifiedUsage(r,options)).filter(Boolean),u=>u.identity),usageRows=[],pairRows=[];
  const fieldGroups=new Map();for(const u of usageRecords){for(const field of u.fields){const key=`${field.name}|${field.meaning}|${u.unit}`;if(!fieldGroups.has(key))fieldGroups.set(key,[]);fieldGroups.get(key).push({value:field.value,weight:w(u.record),record:u.record,field,unit:u.unit});}
    const input=u.fields.find(f=>f.meaning==='input'),output=u.fields.find(f=>f.meaning==='output');if(input&&output)pairRows.push({request:`Request ${pairRows.length+1}`,input:input.value,output:output.value,unit:u.unit,count:w(u.record),_ids:[u.record.id]});}
  for(const samples of fieldGroups.values())for(const b of fixedBins(samples,TOKENS_EDGES))usageRows.push({field:samples[0].field.name,meaning:samples[0].field.meaning,unit:samples[0].unit,lower:b.lower,upper:edgeLabel(b.upper),count:b.count,_ids:ids(b.items.map(s=>s.record))});
  const usageEligible=metricPopulation(selected,'usage',options);
  add(24,'usage-field-distribution','sequences',['field','meaning','unit','lower','upper','count'],usageRows,{unit:'recorded request tokens per audited field',observationUnit:'request usage identity',eligible:usageEligible.eligible,available:usageEligible.available,display:{x:'lower',y:'count',series:'field'},reason:'A provider/export semantics audit must establish scope, unit and field meaning. A generic verified flag is insufficient. Input, output, total, cached and reasoning fields can overlap.',contract:{scopePolicy:'Request fields separate; no summed or stacked overlapping fields',auditPolicy:'options.usageAudits normalized audit registry matched by provider, audit identity, scope and unit'}});
  add(24,'request-input-output','sequences',['request','input','output','unit','count'],pairRows,{unit:'same-request input and output token observations',observationUnit:'same source object and usage identity',eligible:usageEligible.eligible,available:sum(pairRows,r=>r.count),kind:'scatter',display:{x:'input',y:'output',value:'count'},contract:{relationshipPolicy:'Both fields from a single audited usage identity; never paired through model or timestamp proximity'}});
  const contexts=distinctBy(allRows.filter(context),r=>`${r.conversationId}:${r.objectId||r.id}`),contextRows=contexts.map((r,i)=>({observation:`Context ${i+1}`,totalTokens:context(r).total,maxContextLength:context(r).limit,fraction:context(r).fraction,exceedsSuppliedLimit:context(r).fraction>1,count:w(r),_ids:[r.id]}));
  const contextEligible=metricPopulation(selected,'context',options);
  add(24,'context-occupancy','sequences',['observation','totalTokens','maxContextLength','fraction','exceedsSuppliedLimit','count'],contextRows,{unit:'supplied totalTokens / positive supplied maxContextLength',observationUnit:'distinct source object carrying context metadata',eligible:contextEligible.eligible,available:contextEligible.available,kind:'scatter',display:{x:'totalTokens',y:'fraction',value:'count'},contract:{interpretation:'Context occupancy is not consumed usage or billable tokens; historical limits come only from the same recorded observation'}});

  // 25–28. Explicit applied selections only; no automatic comparison fallback.
  const a=options.comparisonA?{...options.comparisonA,rows:measurementRows(options.comparisonA,options,sourceRecords)}:null,b=options.comparisonB?{...options.comparisonB,rows:measurementRows(options.comparisonB,options,sourceRecords)}:null,comparable=!!a&&!!b&&(a.filters?.perspective||'unique')===(b.filters?.perspective||'unique')&&(a.filters?.timeZone||a.dateRange?.zone||'UTC')===(b.filters?.timeZone||b.dateRange?.zone||'UTC')&&(a.filters?.timeBasis||'message')===(b.filters?.timeBasis||'message');
  const compareReason=!a||!b?'Apply both comparison selections A and B':!comparable?'Comparison requires matching counting perspective, timezone and date basis':'Two explicitly applied selections; overlap allowed and coverage shown';
  const compareContract={filterScope:'Explicitly applied comparison A/B selections',comparisonApplied:!!a&&!!b,scopeA:a?{perspective:a.filters?.perspective||'unique',branch:a.filters?.branch||'selected',records:sum(arr(a.rows))}:null,scopeB:b?{perspective:b.filters?.perspective||'unique',branch:b.filters?.branch||'selected',records:sum(arr(b.rows))}:null};
  const groupDimension=options.chartControls?.['25-aligned-deltas']?.dimension||options.compareDimension||'category';
  const groupKey=r=>groupDimension==='model'?model(r):groupDimension==='day'?r.day||'Undated':category(r);
  function groupedValues(selection){const map=new Map();for(const r of arr(selection?.rows)){const key=groupKey(r);if(!map.has(key))map.set(key,{eligible:0,available:0,value:0,items:[]});const g=map.get(key);g.eligible+=w(r);if(observed(r)){g.available+=w(r);g.value+=chars(r)*w(r);g.items.push(r);}}return map;}
  const ag=comparable?groupedValues(a):new Map(),bg=comparable?groupedValues(b):new Map(),pa=metricPopulation(a,'text',options),pb=metricPopulation(b,'text',options),deltaRows=[];
  const sideValue=(g,p)=>g?.available>0?g.value:g?.eligible>0?null:p.available>0?0:null;
  for(const key of unique([...ag.keys(),...bg.keys()]).sort()){
    const ga=ag.get(key),gb=bg.get(key),av=sideValue(ga,pa),bv=sideValue(gb,pb);
    deltaRows.push({key,a:av,b:bv,delta:av!=null&&bv!=null?bv-av:null,relative:av>0&&bv!=null?(bv-av)/av:null,aEligible:ga?.eligible||0,aAvailable:ga?.available||0,bEligible:gb?.eligible||0,bAvailable:gb?.available||0,_ids:ids([...(ga?.items||[]),...(gb?.items||[])])});
  }
  add(25,'aligned-deltas','compare',['key','a','b','delta','relative','aEligible','aAvailable','bEligible','bAvailable'],deltaRows,{unit:'observed Unicode code points; signed B−A',eligible:comparable?pa.eligible+pb.eligible:0,available:comparable?pa.available+pb.available:0,reason:compareReason,kind:'delta',display:{x:'key',y:'delta'},contract:{...compareContract,dimension:groupDimension,missingPolicy:'No available text produces unavailable values. Missing categories are zero only within an observed compatible population.',relativeChange:'(B−A)/A only for A>0'}});
  const compareCategory=options.chartControls?.['26-distribution-shifts']?.category||'response';
  const sampleSide=s=>arr(s?.rows).filter(r=>category(r)===compareCategory&&observed(r)).map(r=>({value:chars(r),weight:w(r),record:r}));
  const sa=comparable?sampleSide(a):[],sb=comparable?sampleSide(b):[],ea=comparable?sum(arr(a.rows).filter(r=>category(r)===compareCategory)):0,eb=comparable?sum(arr(b.rows).filter(r=>category(r)===compareCategory)):0;
  const na=sum(sa),nb=sum(sb),shiftRows=[];
  const compareEvidence=()=>ids([...sa,...sb].map(s=>s.record));
  for(const p of [0,.1,.25,.5,.75,.9,1]){const qa=explorerQuantile(sa,p),qb=explorerQuantile(sb,p);shiftRows.push({quantile:p,a:qa,b:qb,shift:qa!=null&&qb!=null?qb-qa:null,aN:na,bN:nb,aUnavailable:ea-na,bUnavailable:eb-nb,_ids:compareEvidence});}
  add(26,'distribution-shifts','compare',['quantile','a','b','shift','aN','bN','aUnavailable','bUnavailable'],comparable?shiftRows:[],{unit:'Unicode code points; Q_B(p)−Q_A(p)',eligible:ea+eb,available:na+nb,reason:compareReason,kind:'line',display:{x:'quantile',y:'shift'},contract:{...compareContract,category:compareCategory,quantileAlgorithm:QUANTILE_DEFINITION,statisticalMeaning:'Descriptive retained archive comparison; no significance or random-sample claim'}});
  const binsA=fixedBins(sa),binsB=fixedBins(sb),overlayRows=comparable?binsA.map((bin,i)=>({lower:bin.lower,upper:edgeLabel(bin.upper),aCount:bin.count,bCount:binsB[i].count,aN:na,bN:nb,aFraction:na?bin.count/na:null,bFraction:nb?binsB[i].count/nb:null,_ids:ids([...bin.items,...binsB[i].items].map(s=>s.record))})):[];
  add(26,'distribution-overlay','compare',['lower','upper','aCount','bCount','aN','bN','aFraction','bFraction'],overlayRows,{unit:'content-segment counts in common code-point bins',eligible:ea+eb,available:na+nb,reason:compareReason,kind:'histogram',display:{x:'lower',y:'aCount',series:['aCount','bCount']},contract:{...compareContract,category:compareCategory,binClosure:'[lower,upper)',fixedEdges:DEFAULT_EDGES.map(edgeLabel)}});
  const ecdfKeys=unique([...sa,...sb].map(s=>s.value)).sort((x,y)=>x-y),ecdfRows=[];let ai=0,bi=0,ac=0,bc=0;const sortedA=[...sa].sort((x,y)=>x.value-y.value),sortedB=[...sb].sort((x,y)=>x.value-y.value);
  for(const threshold of ecdfKeys){const itemIds=[];while(ai<sortedA.length&&sortedA[ai].value<=threshold){ac+=w(sortedA[ai]);itemIds.push(sortedA[ai++].record.id);}while(bi<sortedB.length&&sortedB[bi].value<=threshold){bc+=w(sortedB[bi]);itemIds.push(sortedB[bi++].record.id);}ecdfRows.push({threshold,aCumulative:ac,bCumulative:bc,aN:na,bN:nb,aFraction:na?ac/na:null,bFraction:nb?bc/nb:null,_ids:itemIds});}
  add(26,'ecdf-overlay','compare',['threshold','aCumulative','bCumulative','aN','bN','aFraction','bFraction'],ecdfRows,{unit:'fraction of available segments at or below code-point threshold',eligible:ea+eb,available:na+nb,reason:compareReason,kind:'line',display:{x:'threshold',y:'aFraction',series:['aFraction','bFraction']},contract:{...compareContract,evidenceRule:'Exact threshold contributors, cumulative counts explicitly reported; table denominators cover full available populations'}});
  const overlapRows=[];if(comparable){
    const ac=new Map(arr(a.conversations).map(c=>[c.id,ids(arr(c.records))])),bc=new Map(arr(b.conversations).map(c=>[c.id,ids(arr(c.records))]));
    const recordOwners=new Map();for(const c of arr(options.originalConversations))for(const r of arr(c.records))recordOwners.set(r.id,c.id);
    const originalIdentitySet=selection=>{const map=new Map();for(const c of arr(selection.conversations)){const groups=new Map();for(const r of arr(c.records)){const key=recordOwners.get(r.id)||c.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r.id);}if(!groups.size)groups.set(c.id,[]);for(const [key,items]of groups)map.set(key,unique([...(map.get(key)||[]),...items]));}return map;};
    const rawA=originalIdentitySet(a),rawB=originalIdentitySet(b);
    const ap=promptSets(a,originalMap(a,options)),bp=promptSets(b,originalMap(b,options));
    for(const [lens,left,right]of [['scoped-conversation-identity',rawA,rawB],['explicit-alias-identity',ac,bc],['exact-prompt-content',ap,bp]])for(const region of ['A only','A ∩ B','B only']){
      const keys=region==='A only'?[...left.keys()].filter(k=>!right.has(k)):region==='B only'?[...right.keys()].filter(k=>!left.has(k)):[...left.keys()].filter(k=>right.has(k));
      overlapRows.push({lens,region,count:keys.length,aPopulation:left.size,bPopulation:right.size,union:unique([...left.keys(),...right.keys()]).length,_ids:unique(keys.flatMap(k=>[...(left.get(k)||[]),...(right.get(k)||[])]))});
    }
  }
  add(27,'selection-intersections','compare',['lens','region','count','aPopulation','bPopulation','union'],overlapRows,{unit:'distinct scoped identities or exact prompt-content groups',observationUnit:'distinct conversation identity / canonical observed user-object text',eligible:comparable?arr(a.conversations).length+arr(b.conversations).length:0,available:comparable?arr(a.conversations).length+arr(b.conversations).length:0,reason:compareReason,kind:'intersection',display:{x:'region',y:'count',series:'lens'},contract:{...compareContract,identityPolicy:'Source-scoped original identities, explicitly applied alias identities, and equal prompt content are separate lenses; no similarity merge',promptMatchingRule:'Full observed user-object text; NFC, Unicode whitespace collapsed to one space, trimmed; content equality does not establish event identity',perspective:'Distinct sets; membership weights do not create duplicate identities'}});
  const contributionRows=deltaRows.map(r=>({component:r.key,a:r.a,b:r.b,contribution:r.delta,aAvailable:r.aAvailable,bAvailable:r.bAvailable,_ids:r._ids})),allKnown=contributionRows.length>0&&contributionRows.every(r=>r.contribution!==null);
  const totalA=pa.available>0?pa.value:null,totalB=pb.available>0?pb.value:null,totalDelta=totalA!=null&&totalB!=null?totalB-totalA:null,componentDelta=allKnown?sum(contributionRows,r=>r.contribution):null;
  add(28,'change-contributions','compare',['component','a','b','contribution','aAvailable','bAvailable'],contributionRows,{unit:'additive observed Unicode code points',eligible:comparable?pa.eligible+pb.eligible:0,available:comparable?pa.available+pb.available:0,reason:compareReason,kind:'waterfall',display:{x:'component',y:'contribution'},contract:{...compareContract,totalA,totalB,totalDelta,componentDelta,reconciliationResidual:componentDelta!=null&&totalDelta!=null?totalDelta-componentDelta:null,reconciled:componentDelta!=null&&totalDelta===componentDelta,additivityPolicy:'Only additive compatible character totals; all components including Unknown/Other retained. Arithmetic decomposition, not causation.'}});

  // 29. Record/object/pair eligibility, never existential capability flags.
  const sourceLabels=new Map(),observabilityGroups=new Map();for(const r of allRows){const source=r.sourceId||'unknown';if(!sourceLabels.has(source))sourceLabels.set(source,`Source ${sourceLabels.size+1}`);const key=`${source}|${r.format||''}|${r.provider||''}`;if(!observabilityGroups.has(key))observabilityGroups.set(key,{source:sourceLabels.get(source),format:safeFormat(r.format),provider:safeProvider(r.provider),rows:[],conversations:[]});observabilityGroups.get(key).rows.push(r);}
  const observability=[];for(const g of observabilityGroups.values()){
    const part={...selected,rows:g.rows};for(const metric of ['text','clock','trace','duration','usage','context']){const p=metricPopulation(part,metric,options);observability.push({source:g.source,format:g.format,provider:g.provider,metric,unit:['usage','context'].includes(metric)?'reply or metadata-bearing source object':metric==='duration'?'reply/recap/event source object':'content segment',eligible:p.eligible,available:p.available,unavailable:p.eligible-p.available,fraction:p.eligible?p.available/p.eligible:null,reason:metric==='usage'?'Provider/export field semantics audit required; absent metadata unavailable':metric==='duration'?'Validated unit/scope or recorded lifecycle required':metric==='context'?'Same observation needs supplied positive context limit; absent metadata unavailable':metric==='clock'?'Original clock-precision timestamp required':metric==='trace'?'Observed original trace; summary/redacted remain separate':'Complete observed text required',_ids:[...p.evidence,...p.missing]});}
    const parentEligible=g.rows.filter(r=>category(r)==='response'),parentAvailable=parentEligible.filter(r=>parentSupported(r,originals.get(r.conversationId)));
    observability.push({source:g.source,format:g.format,provider:g.provider,metric:'recorded-parent',unit:'reply content segment',eligible:sum(parentEligible),available:sum(parentAvailable),unavailable:sum(parentEligible)-sum(parentAvailable),fraction:sum(parentEligible)?sum(parentAvailable)/sum(parentEligible):null,reason:'Recorded supported parent relation, not logical ID alone',_ids:ids(parentEligible)});
  }
  add(29,'observability-matrix','observability',['source','format','provider','metric','unit','eligible','available','unavailable','fraction','reason'],observability,{unit:'available / eligible by documented record or object unit',eligible:sum(observability,r=>r.eligible),available:sum(observability,r=>r.available),kind:'matrix',display:{x:'metric',y:'source',value:'fraction',series:'format'},contract:{capabilityPolicy:'Existential conversation capability flags are not completeness guarantees',aggregationPolicy:'Cells have distinct measurement units; the contract population sums cells only for chart readiness, never a cross-metric activity total'}});

  // 30. Explicitly associated diagnostics; otherwise conversation-level counts.
  const knownDiagnostic=new Set(['missing-parent','branch-cycle','invalid-date','unknown-agent-item','unsupported-record','unsupported-format','adapter-error','normalized-fallback','selected-path-fallback','selected-version-fallback','ambiguous-agent-display','duplicate-agent-representation','duplicate-message-object','duplicate-conversation-representation','ambiguous-conversation-identity','invalid-event-duration','transcript-boundaries-unavailable','unknown-original-platform','unsupported-version','invalid-message','html-json-unrecognized','unrecognized-gemini-activity','unknown-gemini-activity','gemini-date-uncertainty','parent-not-retained']);
  const diagnosticMap=new Map();const diagnosticAdd=(code,level,records,count=1)=>{const safe=knownDiagnostic.has(code)?code:'other-recorded-diagnostic',key=`${safe}|${level}`;if(!diagnosticMap.has(key))diagnosticMap.set(key,{diagnostic:safe,level,count:0,_ids:[]});const row=diagnosticMap.get(key);row.count+=count;row._ids.push(...ids(records));};
  for(const c of convs){const original=originals.get(c.id)||c;for(const d of arr(original.diagnostics)){
    const explicit=arr(d.recordIds).length?arr(c.records).filter(r=>d.recordIds.includes(r.id)):d.recordId?arr(c.records).filter(r=>r.id===d.recordId):d.path?arr(c.records).filter(r=>r.rawPath===d.path):[];
    if(explicit.length&&(d.recordId||d.recordIds||explicit.length===1))diagnosticAdd(d.code,'explicitly affected selected record',explicit,sum(explicit));else diagnosticAdd(d.code,'conversation diagnostic',arr(c.records),w(c));
  }
    if(c.coverage==='normalized'||arr(c.records).some(r=>r.coverage==='normalized'))diagnosticAdd('normalized-fallback','conversation representation',arr(c.records),w(c));
    const bad=arr(c.records).filter(r=>r.invalidTimestamp);if(bad.length&&!arr(original.diagnostics).some(d=>d.code==='invalid-date'&&(d.recordId||d.recordIds)))diagnosticAdd('invalid-date','explicitly affected selected record',bad,sum(bad));
  }
  add(30,'diagnostic-profile','observability',['diagnostic','level','count'],[...diagnosticMap.values()],{unit:'record-linked diagnostics or conversation-level occurrences, separately labelled',observationUnit:'explicit record linkage or conversation diagnostic',eligible:sum(convs),available:sum(convs),kind:'bar',contract:{diagnosticMeaning:'Representation/parser measurement limitation, not model quality',privateLabelPolicy:'Unknown/free-text diagnostic codes use a neutral aggregate label'}});

  // 31. Same metric scope and denominator on both sides.
  const coverageChange=[];if(comparable)for(const metric of ['text','trace','clock','usage','duration','context']){const ma=metricPopulation(a,metric,options),mb=metricPopulation(b,metric,options),av=ma.available>0?ma.value:null,bv=mb.available>0?mb.value:null;coverageChange.push({metric,unit:['text','trace'].includes(metric)?'Unicode code points':'available recorded observations',a:av,b:bv,delta:av!=null&&bv!=null?bv-av:null,aEligible:ma.eligible,bEligible:mb.eligible,eligibleDelta:mb.eligible-ma.eligible,aAvailable:ma.available,bAvailable:mb.available,availableDelta:mb.available-ma.available,aFraction:ma.eligible?ma.available/ma.eligible:null,bFraction:mb.eligible?mb.available/mb.eligible:null,_ids:[...ma.evidence,...ma.missing,...mb.evidence,...mb.missing]});}
  add(31,'coverage-change','observability',['metric','unit','a','b','delta','aEligible','bEligible','eligibleDelta','aAvailable','bAvailable','availableDelta','aFraction','bFraction'],coverageChange,{unit:'separate per-metric values and coverage deltas',eligible:comparable?pa.eligible+pb.eligible:0,available:comparable?pa.available+pb.available:0,reason:compareReason,kind:'table',contract:compareContract});

  // 32. Diffs require actual retained immutable captures. Capture dates are provenance only.
  const history=options.history||{},diff=history.diff,prior=history.previousCapture||history.previous,current=history.currentCapture||history.current,historyRows=[];
  const fullHistoryReady=history.enabled===true&&prior&&current&&Array.isArray(prior.conversations)&&Array.isArray(current.conversations);
  const diffHistoryReady=history.enabled===true&&diff?.metricVersion==='capture-diff:1'&&diff.captures?.left&&diff.captures?.right&&['added','removed','changed','unchanged'].every(k=>finite(diff.summary?.[k])&&diff.summary[k]>=0);
  const historyReady=fullHistoryReady||diffHistoryReady;
  if(fullHistoryReady){
    const before=new Map(prior.conversations.map(c=>[c.id,c])),after=new Map(current.conversations.map(c=>[c.id,c])),changes=new Map();
    const push=(change,records,identityScope='conversation',hashBasis='original retained conversation hash')=>{const key=`${identityScope}:${change}`;if(!changes.has(key))changes.set(key,{change,identityScope,hashBasis,count:0,_ids:[]});const row=changes.get(key);row.count++;row._ids.push(...ids(records));};
    for(const [key,c]of after){const old=before.get(key);if(!old){push('added conversation',arr(c.records));continue;}if(c.rawHash&&old.rawHash){if(c.rawHash!==old.rawHash)push('changed content hash',arr(c.records));else push('unchanged content hash',arr(c.records));}else push('content hash unavailable',arr(c.records));
      const path=n=>JSON.stringify({selected:arr(n.branches?.selectedNodes),versions:arr(n.versions).filter(v=>v.selected).map(v=>v.id),selectedObjects:objectGroups(n).filter(g=>g.records.some(r=>r.selected!==false)).map(g=>g.key)});
      if(path(c)!==path(old))push('selected path changed',arr(c.records));if(stableJSON(c.capabilities||{})!==stableJSON(old.capabilities||{}))push('capabilities changed',arr(c.records));
    }
    for(const [key,c]of before)if(!after.has(key))push('removed conversation',arr(c.records));
    const beforeRecords=new Map(prior.conversations.flatMap(c=>arr(c.records).map(r=>[`${c.id}:${r.id}`,r]))),afterRecords=new Map(current.conversations.flatMap(c=>arr(c.records).map(r=>[`${c.id}:${r.id}`,r])));
    const segmentFingerprint=r=>{
      if(r.textExcerpt===true||r.textTruncated===true||typeof r.textExcerpt==='string')return null;
      // Curated retained representation only: derived indexes and capture times do
      // not manufacture content changes. The digest is never an activity event.
      return sha256Text(stableJSON({text:r.text??null,observed:r.observed,category:r.category,model:r.model,timestamp:r.timestamp,datePrecision:r.datePrecision,parentId:r.parentId,relationship:r.relationship,event:r.event,usage:r.usage,contextOccupancy:r.contextOccupancy,duration:r.duration,attachments:r.attachments,references:r.references}));
    };
    for(const [key,r]of afterRecords){const old=beforeRecords.get(key);if(!old){push('added content segment',[r],'content-segment','scoped segment identity');continue;}
      const oldHash=segmentFingerprint(old),newHash=segmentFingerprint(r);if(!oldHash||!newHash)push('segment fingerprint unavailable',[r],'content-segment','complete owned text required');else if(oldHash!==newHash)push('changed retained segment',[r],'content-segment','normalized-owned-segment-sha256:1');
    }
    for(const [key,r]of beforeRecords)if(!afterRecords.has(key))push('removed content segment',[r],'content-segment','scoped segment identity');
    historyRows.push(...changes.values());
  }
  else if(diffHistoryReady){
    for(const kind of ['added','removed','changed','unchanged']){const entries=arr(diff.tables?.[kind]);historyRows.push({change:`${kind} retained content identity`,identityScope:'content-segment',hashBasis:kind==='changed'?'Service-owned normalized content fingerprint':'scoped retained identity',count:diff.summary[kind],evidenceAvailability:entries.length===diff.summary[kind]?'identity list retained':'summary count; evidence identities not retained in this response',_ids:entries.map(r=>r.id).filter(Boolean)});}
    for(const [table,change]of [['capabilityChanges','capabilities changed'],['selectedPathChanges','selected path changed'],['conversationsAdded','added conversation'],['conversationsRemoved','removed conversation']])if(Array.isArray(diff.tables?.[table]))historyRows.push({change,identityScope:'conversation',hashBasis:'retained scoped conversation metadata',count:diff.tables[table].length,evidenceAvailability:'conversation identities retained',_ids:diff.tables[table].map(r=>r.conversationId||r.id).filter(Boolean)});
  }
  const historyPopulation=fullHistoryReady?prior.conversations.length+current.conversations.length:diffHistoryReady?diff.summary.added+diff.summary.removed+2*(diff.summary.changed+diff.summary.unchanged):0;
  add(32,'source-capture-diff','observability',['change','identityScope','hashBasis','count','evidenceAvailability'],historyRows,{unit:'scoped conversation/segment identities and separately labelled original/derived fingerprints',observationUnit:fullHistoryReady?'conversation or segment in actual immutable retained captures':'retained scoped content identity in an actual service-computed capture diff',eligible:historyPopulation,available:historyPopulation,state:historyReady?'ready':'unavailable',reason:history.enabled!==true?'Optional capture history is disabled by default':!historyReady?'Two actual retained immutable captures are required; earlier unretained captures cannot be reconstructed':'Actual retained captures compared by scoped identity, hash, selected path and capabilities',kind:'bar',display:{x:'change',y:'count'},contract:{filterScope:'Explicitly selected immutable capture pair',dateBasis:'Capture timestamps are provenance only, never activity dates',historyEnabled:history.enabled===true,previousCapturedAt:prior?.capturedAt||diff?.captures?.left?.capturedAt||null,currentCapturedAt:current?.capturedAt||diff?.captures?.right?.capturedAt||null,captureProducerA:diff?.captures?.left?.producer||null,captureProducerB:diff?.captures?.right?.producer||null,captureDiffVersion:diffHistoryReady?diff.metricVersion:'normalized-owned-segment-sha256:1',rollbackPolicy:'Legacy 1.0 rollback baseline is separate from routine history retention',categoryPolicy:'Conversation and segment scopes separate; content/path/capability categories may overlap, so summing rows is not a distinct-change total',evidenceRule:'Contributing identities in selected actual capture pair; removed observations require prior-capture evidence access. Summary-only rows disclose absent identity lists.'}});
  return {charts,evidenceIndex};
}
