import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {applyFilters} from '../src/core/metrics.mjs';
import {buildExplorerB,explorerQuantile,verifiedUsage} from '../src/core/explorer-b.mjs';
import {analyzeExplorerText,EXPLORER_TEXT_ALGORITHM_VERSION} from '../src/core/explorer-a.mjs';
import {canonicalPromptKey,sha256Text} from '../src/core/prompt-key.mjs';

const record=(id,category,extra={})=>({id,objectId:id,logicalId:id,category,text:id,observed:true,selected:true,model:'unknown',timestamp:null,datePrecision:'unknown',coverage:'original',...extra});
const conversation=(id,records,extra={})=>({id,title:'PRIVATE TITLE',provider:'synthetic',format:'synthetic-export',sourceId:'PRIVATE SOURCE PATH',collectionIds:['one'],records,capabilities:{usage:true,originalRecords:true},...extra});
const select=(data,filters={})=>applyFilters(data,{timeZone:'UTC',...filters},{now:Date.parse('2026-10-02T00:00:00Z')});
const chart=(result,id)=>{const found=result.charts.find(c=>c.id===id);assert(found,`Missing ${id}`);return found;};
const make=(data,filters={},options={})=>buildExplorerB(select(data,filters),{originalConversations:data,...options});
const evidence=(result,row)=>{const value=result.evidenceIndex.get(row.evidenceKey);return typeof value==='function'?value():value;};

function tree(){
  const records=[
    record('u','user',{objectId:'u-o',originalObjectId:'u-original',nodeId:'u-node',parentId:'root',text:'Repeated prompt'}),
    record('trace','thinking',{objectId:'a-o',originalObjectId:'a-original',nodeId:'a-node',parentId:'u-node',model:'Alpha',text:'trace'}),
    record('a','response',{objectId:'a-o',originalObjectId:'a-original',nodeId:'a-node',parentId:'u-node',model:'Alpha',text:'1111'}),
    record('u2','user',{objectId:'u2-o',originalObjectId:'u2-original',nodeId:'u2-node',parentId:'a-node',text:'Another prompt'}),
    record('b','response',{objectId:'b-o',originalObjectId:'b-original',nodeId:'b-node',parentId:'u2-node',model:'Beta',text:'22222222'}),
    record('alt','response',{objectId:'alt-o',originalObjectId:'alt-original',nodeId:'alt-node',parentId:'u2-node',model:'Gamma',selected:false,text:'alternative'}),
  ];
  const nodes=[
    {id:'root',parentId:null,selected:true},
    {id:'u-node',parentId:'root',messageObjectId:'u-o',selected:true},
    {id:'a-node',parentId:'u-node',messageObjectId:'a-o',selected:true},
    {id:'u2-node',parentId:'a-node',messageObjectId:'u2-o',selected:true},
    {id:'b-node',parentId:'u2-node',messageObjectId:'b-o',selected:true},
    {id:'alt-node',parentId:'u2-node',messageObjectId:'alt-o',selected:false},
  ];
  return conversation('tree',records,{format:'chatgpt-mapping',topology:{kind:'chatgpt-mapping',complete:true,nodes},branches:{selectedNodes:['root','u-node','a-node','u2-node','b-node'],depthUnit:'legacy retained node counts'}});
}

test('browser prompt SHA-256 agrees with independent native crypto on Unicode and block boundaries',()=>{
  for(const text of ['', 'abc','é😀漢字\u0000', 'a'.repeat(55),'b'.repeat(56),'c'.repeat(63),'d'.repeat(64),'e'.repeat(10000)])assert.equal(sha256Text(text),createHash('sha256').update(text).digest('hex'));
  assert.equal(canonicalPromptKey('  e\u0301\n\t😀  '),createHash('sha256').update('é 😀').digest('hex'));
  assert.notEqual(canonicalPromptKey('Hello'),canonicalPromptKey('hello'));
});

test('19 groups segments inside original objects, preserves non-message root and native reply adjacency',()=>{
  const result=make([tree()]);
  const ladder=chart(result,'19-path-ladder');assert.equal(ladder.rows.length,5);
  assert.equal(ladder.rows[0].lane,'non-message');assert.equal(ladder.rows[2].lane,'thinking / response');assert.equal(ladder.rows[2].segments,2);
  const native=chart(result,'19-native-transitions');const transition=native.rows.find(r=>r.status==='native adjacency');
  assert.deepEqual([transition.source,transition.target,transition.count,transition.support],['Alpha','Beta',1,1]);
  assert.deepEqual(evidence(result,transition),['a','b']);
  assert.equal(native.rows.filter(r=>r.status==='native adjacency').length,1);
  const serial=JSON.stringify(result.charts);assert(!serial.includes('PRIVATE TITLE'));assert(!serial.includes('PRIVATE SOURCE PATH'));assert(!serial.includes('Repeated prompt'));
});

test('19 native filtered gaps never become new native adjacency; unknown models remain explicit',()=>{
  const c=tree();const result=make([c],{models:['Beta']});const rows=chart(result,'19-native-transitions').rows;
  assert.equal(rows.find(r=>r.source==='Alpha'&&r.target==='Beta').status,'filtered gap');
  assert.equal(rows.filter(r=>r.status==='native adjacency').length,0);
  const noParents=conversation('unlinked',[record('a','response',{model:'A'}),record('b','response',{model:'B'})]);
  assert.equal(chart(make([noParents]),'19-native-transitions').rows.filter(r=>r.status==='native adjacency').length,0);
  c.records.find(r=>r.id==='a').model='unknown';
  assert.equal(chart(make([c]),'19-native-transitions').rows.find(r=>r.status==='native adjacency').source,'Unknown model');
});

test('20/21 all-retained topology and versions remain distinct from selected text filters',()=>{
  const c=tree();c.versions=[{id:'v0',selected:true},{id:'v1',selected:false},{id:'v2',selected:false}];
  const result=make([c],{models:['Beta']});const b=chart(result,'20-retained-branches-versions').rows[0],d=chart(result,'21-depth-alternatives').rows[0];
  assert.deepEqual([b.nodes,b.messageObjects,b.nonMessageNodes,b.selectedNodes,b.alternativeNodes,b.branchPoints,b.versions,b.alternativeVersions],[6,5,1,5,1,1,3,2]);
  assert.deepEqual([d.maxDepth,d.alternativeSegments,d.retainedSegments,d.observedSelectedSegments,d.alternativeShare],[4,1,6,1,1/6]);
  assert.match(d.depthUnit,/root depth 0/);
});

test('20/21 missing parents and cycles produce unavailable depth rather than fabricated factors',()=>{
  const c=conversation('broken',[
    record('one','response',{nodeId:'n1',parentId:'missing',relationship:{verified:true,parentOriginalId:'missing'}}),
    record('two','response',{nodeId:'n2',parentId:'n3',relationship:{verified:true,parentOriginalId:'n3'}}),
    record('three','response',{nodeId:'n3',parentId:'n2',relationship:{verified:true,parentOriginalId:'n2'}}),
  ]);
  const result=make([c]),row=chart(result,'20-retained-branches-versions').rows[0];assert.equal(row.missingParents,1);assert.equal(row.cycleAffectedNodes,2);
  assert.equal(chart(result,'21-depth-alternatives').rows[0].maxDepth,null);
  assert.equal(chart(result,'20-retained-node-graph').rows.find(r=>r.source==='Missing parent').status,'missing-parent');
});

function callFixture(){return conversation('calls',[
  record('call1','tool_call',{event:{id:'c1-event',type:'tool_call',callId:'c1',name:'python',status:'completed'}}),
  record('call1-display','tool_call',{event:{id:'c1-event',type:'tool_call',callId:'c1',name:'python',status:'completed'}}),
  record('call2','tool_call',{event:{id:'c2-event',type:'tool_call',callId:'c2',name:'PRIVATE FUNCTION NAME',status:'PRIVATE STATUS'}}),
  record('out1','tool_output',{event:{id:'o1',type:'tool_output',callId:'c1'}}),
  record('out1-display','tool_output',{event:{id:'o1',type:'tool_output',callId:'c1'}}),
  record('out2','tool_output',{event:{id:'o2',type:'tool_output',callId:'c1'}}),
  record('orphan','tool_output',{event:{id:'o3',type:'tool_output',callId:'no-call'}}),
]);}

test('22 distinct scoped calls/outputs reconcile mirrors and unmatched output populations',()=>{
  const result=make([callFixture()]),rows=chart(result,'22-call-output-association').rows;
  assert.equal(rows.find(r=>r.outputs==='multiple').count,1);assert.equal(rows.find(r=>r.outputs==='multiple').matchedOutputs,2);
  assert.equal(rows.find(r=>r.outputs==='zero').count,1);assert.equal(rows.find(r=>r.outputs==='unmatched').count,1);
  assert.equal(rows.find(r=>r.outputs==='zero').tool,'Other recorded tool');assert.equal(rows.find(r=>r.outputs==='zero').status,'Unknown status');
  assert(!JSON.stringify(rows).includes('PRIVATE'));assert.equal(chart(result,'22-call-output-association').contract.available,3);
});

test('22 explicitly selected call-only association differs from all-retained conversation context',()=>{
  const data=[callFixture()],selected=make(data,{categories:['tool_call']}),context=make(data,{categories:['tool_call']},{chartControls:{'22-call-output-association':{sequenceScope:'conversation-context'}}});
  assert.equal(chart(selected,'22-call-output-association').rows.filter(r=>r.outputs==='multiple').length,0);
  assert.equal(chart(context,'22-call-output-association').rows.find(r=>r.outputs==='multiple').matchedOutputs,2);
  assert.equal(chart(context,'22-call-output-association').contract.branchPolicy,'All retained conversation context');
});

test('23 partitions verified zero/source/recap durations and excludes unverified generic timing',()=>{
  const c=conversation('timings',[
    record('zero','response',{duration:{value:0,unit:'milliseconds',scope:'source-execution',semanticsVerified:true}}),
    record('long','response',{duration:{value:2,unit:'seconds',scope:'source-execution',semanticsVerified:true}}),
    record('recap','recap',{duration:{value:3,unit:'seconds',scope:'recap',reliability:'derived from recorded numerical recap'}}),
    record('unverified','response',{durationMs:500,duration:{value:500,unit:'milliseconds',scope:'execution'},timingMetadata:{executionTime:123}}),
  ]);
  const chart23=chart(make([c]),'23-recorded-duration-distribution');
  assert.equal(chart23.rows.filter(r=>r.scope==='source-execution').reduce((n,r)=>n+r.count,0),2);
  assert.equal(chart23.rows.find(r=>r.scope==='source-execution'&&r.lower===0).count,1);
  assert.equal(chart23.rows.filter(r=>r.scope==='recap').reduce((n,r)=>n+r.count,0),1);
  assert.deepEqual([chart23.contract.eligible,chart23.contract.available,chart23.contract.unavailable],[4,3,1]);
});

test('23 source-item creation/completion supports labelled intervals but cannot prove execution concurrency',()=>{
  const c=conversation('items',[record('item','tool_call',{event:{id:'e',type:'tool_call',lifecycle:{startedAt:0,completedAt:100,taskId:'task',semanticsVerified:false}},duration:{value:100,unit:'milliseconds',scope:'source-item-lifecycle',semanticsVerified:true}})]);
  const result=make([c]);assert.equal(chart(result,'23-recorded-duration-distribution').rows.reduce((n,r)=>n+r.count,0),1);
  assert.match(chart(result,'23-lifecycle-lanes').rows[0].intervalKind,/not execution/);
  assert.equal(chart(result,'23-verified-task-concurrency').contract.state,'unavailable');
});

test('23 verified concurrency merges same-task spans and does not count zero-length/tied intervals',()=>{
  const records=[['a',0,10,'task1'],['a2',5,15,'task1'],['b',8,20,'task2'],['c',20,30,'task3'],['zero',9,9,'zero']].map(([id,start,end,taskId])=>record(id,'tool_call',{event:{id,lifecycle:{startedAt:start,completedAt:end,taskId,semanticsVerified:true,scope:'event-execution'}}}));
  const result=make([conversation('execution',records)]),row=chart(result,'23-verified-task-concurrency').rows[0];
  assert.equal(row.recordedTasks,4);assert.equal(row.maxConcurrentTasks,2);
  assert.equal(chart(result,'23-lifecycle-lanes').rows[0].start,0);
});

const auditOptions={usageAudits:{'synthetic-audit':{status:'verified',provider:'synthetic',scope:'request',unit:'tokens',fields:{inputTokens:'input',outputTokens:'output',totalTokens:'total',cachedTokens:'cached-overlap'}}}};
test('24 generic verified flag cannot establish usage semantics; audited same-object fields pair without overlap sums',()=>{
  const usage={id:'u1',scope:'request',unit:'tokens',verified:true,inputTokens:0,outputTokens:20,totalTokens:20,cachedTokens:3};
  const c=conversation('usage',[record('untrusted','response',{usage}),record('trusted','response',{usage:{...usage,id:'u2',auditId:'synthetic-audit'}}),record('mirror','response',{objectId:'trusted',usage:{...usage,id:'u2',auditId:'synthetic-audit'}})]);
  const result=make([c],{},auditOptions),distributions=chart(result,'24-usage-field-distribution'),pairs=chart(result,'24-request-input-output');
  assert.equal(verifiedUsage({...c.records[0],provider:'synthetic'},auditOptions),null);
  assert.deepEqual([distributions.contract.eligible,distributions.contract.available],[2,1]);
  assert.equal(distributions.rows.filter(r=>r.field==='inputTokens').reduce((n,r)=>n+r.count,0),1);
  assert.equal(pairs.rows.length,1);assert.deepEqual([pairs.rows[0].input,pairs.rows[0].output],[0,20]);
  assert.equal(pairs.rows[0].count,1);assert.equal(chart(make([c]),'24-usage-field-distribution').contract.available,0);
});

test('24 context occupancy requires same supplied positive limit; explicit zero stays observed',()=>{
  const c=conversation('context',[
    record('zero','response',{contextOccupancy:{totalTokens:0,maxContextLength:100}}),
    record('full','response',{contextOccupancy:{totalTokens:120,maxContextLength:100}}),
    record('bad','response',{contextOccupancy:{totalTokens:100,maxContextLength:0}}),
    record('missing','response',{contextOccupancy:{totalTokens:100}}),record('none','response'),
  ]);
  const data=chart(make([c]),'24-context-occupancy');assert.deepEqual([data.contract.eligible,data.contract.available,data.contract.unavailable],[5,2,3]);
  assert.deepEqual(data.rows.map(r=>r.fraction),[0,1.2]);assert.equal(data.rows[1].exceedsSuppliedLimit,true);
});

function compareFixture(){return [
  conversation('one',[record('u1','user',{text:'same prompt'}),record('a1','response',{text:'xx',model:'M1'}),record('a2','response',{text:'xxxx',model:'M1'}),record('a3','response',{text:'xxxxxx',model:'unknown'})],{collectionIds:['A']}),
  conversation('two',[record('u2','user',{text:'same\n prompt'}),record('b1','response',{text:'xxxx',model:'M1'}),record('b2','response',{text:'xxxxxxxx',model:'M2'})],{collectionIds:['B']}),
];}
const compare=(data,extra={})=>make(data,{}, {comparisonA:select(data,{collectionIds:['A']}),comparisonB:select(data,{collectionIds:['B']}),...extra});

test('25 aligned categories share units and show signed deltas with unavailable relative zero baseline',()=>{
  const result=compare(compareFixture()),row=chart(result,'25-aligned-deltas').rows.find(r=>r.key==='response');
  assert.deepEqual([row.a,row.b,row.delta,row.relative,row.aAvailable,row.bAvailable],[12,12,0,0,3,2]);
  const noApply=chart(make(compareFixture()),'25-aligned-deltas');assert.equal(noApply.rows.length,0);assert.equal(noApply.contract.state,'unavailable');
  const data=compareFixture();data[0].records=data[0].records.map(r=>r.category==='response'?{...r,observed:false}:r);const unknown=chart(compare(data),'25-aligned-deltas').rows.find(r=>r.key==='response');
  assert.equal(unknown.a,null);assert.equal(unknown.delta,null);assert.equal(unknown.relative,null);
});

test('26 Type-7 quantiles and fixed-bin/ECDF overlays reconcile independent sample populations',()=>{
  assert.equal(explorerQuantile([{value:2},{value:4},{value:6}],.25),3);assert.equal(explorerQuantile([{value:2,weight:2},{value:10}],.5),2);
  const result=compare(compareFixture()),median=chart(result,'26-distribution-shifts').rows.find(r=>r.quantile===.5);
  assert.deepEqual([median.a,median.b,median.shift,median.aN,median.bN],[4,6,2,3,2]);
  const histogram=chart(result,'26-distribution-overlay').rows;assert.equal(histogram.reduce((n,r)=>n+r.aCount,0),3);assert.equal(histogram.reduce((n,r)=>n+r.bCount,0),2);
  const last=chart(result,'26-ecdf-overlay').rows.at(-1);assert.deepEqual([last.aCumulative,last.bCumulative,last.aFraction,last.bFraction],[3,2,1,1]);
});

test('27 exact content intersections remain separate from scoped request/conversation identity',()=>{
  const result=compare(compareFixture()),rows=chart(result,'27-selection-intersections').rows;
  assert.equal(rows.find(r=>r.lens==='scoped-conversation-identity'&&r.region==='A ∩ B').count,0);
  assert.equal(rows.find(r=>r.lens==='exact-prompt-content'&&r.region==='A ∩ B').count,1);
  assert(!JSON.stringify(rows).includes('same prompt'));
  const data=compareFixture();data[0].records[0].explorerAnalysis={...analyzeExplorerText(data[0].records[0].text,data[0].records[0]),objectPromptKey:canonicalPromptKey('same prompt'),objectPromptSegments:1};
  assert.equal(chart(compare(data),'27-selection-intersections').rows.find(r=>r.lens==='exact-prompt-content'&&r.region==='A ∩ B').count,1);
});

test('28 every additive component including Unknown reconciles to aggregate B−A',()=>{
  const result=compare(compareFixture(),{compareDimension:'model'}),contribution=chart(result,'28-change-contributions');
  assert(contribution.rows.some(r=>r.component==='Unknown model'));
  assert.equal(contribution.contract.reconciled,true);assert.equal(contribution.contract.reconciliationResidual,0);
  assert.equal(contribution.rows.reduce((n,r)=>n+r.contribution,0),contribution.contract.totalDelta);
});

test('29 observability counts record/object eligibility, not existential conversation capability',()=>{
  const c=conversation('observable',[record('zero','response',{text:'',timestamp:0,datePrecision:'second',timeProvenance:'/recorded/date'}),record('day','response',{timestamp:0,datePrecision:'day'}),record('missing','response',{observed:false}),record('same-object','response',{objectId:'zero',text:'extra'})]);
  const result=make([c]),rows=chart(result,'29-observability-matrix').rows;
  const clock=rows.find(r=>r.metric==='clock'),text=rows.find(r=>r.metric==='text'),usage=rows.find(r=>r.metric==='usage');
  assert.deepEqual([clock.eligible,clock.available,clock.unavailable],[4,1,3]);assert.deepEqual([text.eligible,text.available],[4,3]);
  assert.deepEqual([usage.eligible,usage.available],[3,0]);assert.equal(usage.source,'Source 1');
});

test('30 diagnostics count records only when linked and keep unlinked source limitations at conversation level',()=>{
  const c=conversation('diagnostics',[record('a','response'),record('b','response')],{coverage:'normalized',diagnostics:[{code:'invalid-date',recordId:'a'},{code:'missing-parent',path:'/parent'},{code:'PRIVATE DIAGNOSTIC',message:'PRIVATE MESSAGE'}]});
  const rows=chart(make([c]),'30-diagnostic-profile').rows;
  assert.equal(rows.find(r=>r.diagnostic==='invalid-date').level,'explicitly affected selected record');
  assert.equal(rows.find(r=>r.diagnostic==='missing-parent').level,'conversation diagnostic');
  assert.equal(rows.find(r=>r.diagnostic==='normalized-fallback').count,1);assert(!JSON.stringify(rows).includes('PRIVATE'));
});

test('31 coverage change exposes text absence alongside value change without zero imputation',()=>{
  const data=compareFixture();data[1].records.find(r=>r.id==='b2').observed=false;
  const row=chart(compare(data),'31-coverage-change').rows.find(r=>r.metric==='text');
  assert.deepEqual([row.aEligible,row.bEligible,row.aAvailable,row.bAvailable,row.eligibleDelta,row.availableDelta],[4,3,4,2,-1,-2]);
  assert(row.bFraction<row.aFraction);assert.equal(row.delta,row.b-row.a);
});

test('32 disabled history cannot reconstruct unretained snapshots; enabled actual hash/identity/path diffs work',()=>{
  const before=[conversation('same',[record('s','response')],{rawHash:'h1',branches:{selectedNodes:['a']},capabilities:{x:true}}),conversation('removed',[record('r','user')],{rawHash:'hr'})];
  const after=[conversation('same',[record('s','response')],{rawHash:'h2',branches:{selectedNodes:['b']},capabilities:{x:false}}),conversation('added',[record('a','user')],{rawHash:'ha'})];
  const disabled=chart(make(after),'32-source-capture-diff');assert.equal(disabled.contract.state,'unavailable');assert.equal(disabled.contract.historyEnabled,false);
  const result=make(after,{}, {history:{enabled:true,previousCapture:{conversations:before,capturedAt:'2026-10-01'},currentCapture:{conversations:after,capturedAt:'2026-10-02'}}});
  const rows=chart(result,'32-source-capture-diff').rows;
  for(const change of ['added conversation','removed conversation','changed content hash','selected path changed','capabilities changed'])assert.equal(rows.find(r=>r.change===change).count,1);
  assert.equal(chart(result,'32-source-capture-diff').contract.dateBasis,'Capture timestamps are provenance only, never activity dates');
});

test('new measurements reject stale legacy text analysis and excerpt fallback while valid complete index survives excerpts',()=>{
  const c=conversation('index',[record('a','response',{text:'😀x',contentAnalysis:{characters:999}})]);
  const full=compare([c],{comparisonA:select([c]),comparisonB:select([c])});assert.equal(chart(full,'25-aligned-deltas').rows[0].a,2);
  c.records[0].textExcerpt=true;
  const unavailable=compare([c],{comparisonA:select([c]),comparisonB:select([c])});assert.equal(chart(unavailable,'25-aligned-deltas').rows[0].a,null);
  c.records[0].explorerAnalysis={version:EXPLORER_TEXT_ALGORITHM_VERSION,observed:true,characters:12345};
  const indexed=compare([c],{comparisonA:select([c]),comparisonB:select([c])});assert.equal(chart(indexed,'25-aligned-deltas').rows[0].a,12345);
});

test('all required 19–32 families provide scalar exact rows and complete measurement contracts',()=>{
  const result=compare(compareFixture());
  assert.deepEqual([...new Set(result.charts.map(c=>c.family))],[19,20,21,22,23,24,25,26,27,28,29,30,31,32]);
  for(const c of result.charts){for(const key of ['variable','unit','observationUnit','filterScope','eligible','available','unavailable','dateBasis','timeZone','datePrecision','branchPolicy','perspective','sourceRepresentation','reliability','algorithmVersion','evidenceRule','state','reason'])assert(key in c.contract,`${c.id} lacks ${key}`);
    assert.equal(c.contract.available+c.contract.unavailable,c.contract.eligible);
    for(const row of c.rows){assert(!('evidenceIds' in row));assert(!('_ids' in row));for(const value of Object.values(row))assert(value===null||['string','boolean','number'].includes(typeof value));assert(result.evidenceIndex.has(row.evidenceKey));}
  }
});

test('22 reused call join IDs preserve distinct call events and disclose ambiguous matching outputs',()=>{
  const c=conversation('reuse',[
    record('first','tool_call',{event:{id:'first-event',callId:'reused',type:'tool_call',name:'python'}}),
    record('second','tool_call',{event:{id:'second-event',callId:'reused',type:'tool_call',name:'python'}}),
    record('out','tool_output',{event:{id:'output-event',callId:'reused',type:'tool_output'}}),
  ]);
  const rows=chart(make([c]),'22-call-output-association').rows;
  assert.equal(rows.find(r=>r.outputs==='ambiguous').count,2);assert.equal(rows.find(r=>r.outputs==='ambiguous').matchedOutputs,0);
  assert.equal(rows.find(r=>r.outputs==='unmatched-ambiguous').count,1);
});

test('23 independently scoped source items in one enclosing message retain each duration',()=>{
  const c=conversation('source-items',[record('one','tool_call',{objectId:'enclosing',sourceItemId:'item-one',duration:{id:'item-one-duration',value:10,unit:'milliseconds',scope:'source-item-lifecycle',semanticsVerified:true}}),record('two','tool_call',{objectId:'enclosing',sourceItemId:'item-two',duration:{id:'item-two-duration',value:50,unit:'milliseconds',scope:'source-item-lifecycle',semanticsVerified:true}})]);
  const d=chart(make([c]),'23-recorded-duration-distribution');
  assert.equal(d.rows.reduce((n,r)=>n+r.count,0),2);assert.deepEqual([d.contract.eligible,d.contract.available],[2,2]);
});

test('29 canonical provider aliases retain source provenance and usage audits match canonical provider',()=>{
  for(const [display,canonical]of [['ChatGPT','openai'],['Claude','anthropic'],['VeniceAI','venice'],['OpenRouter','openrouter'],['LM Studio','lm-studio']]){
    const c=conversation(display,[record('a','response')],{provider:display});
    assert.equal(chart(make([c]),'29-observability-matrix').rows[0].provider,canonical);
  }
  const u=record('u','response',{provider:'OpenRouter',usage:{id:'u',auditId:'a',unit:'tokens',scope:'request',inputTokens:1}});
  assert(verifiedUsage(u,{usageAudits:{a:{status:'verified',provider:'openrouter',unit:'tokens',scope:'request',fields:{inputTokens:'input'}}}}));
});

test('29 conversation date basis cannot manufacture original clock timestamp availability',()=>{
  const c=conversation('conversation-clock',[record('missing-clock','response',{timestamp:null,datePrecision:'second',timeProvenance:'unavailable'})],{createdAt:0});
  const clock=chart(make([c],{timeBasis:'conversation'}),'29-observability-matrix').rows.find(r=>r.metric==='clock');
  assert.equal(clock.eligible,1);assert.equal(clock.available,0);
});

test('27 partial filtered prompt objects cannot reuse full-object prompt digests',()=>{
  const fullKey=canonicalPromptKey('one\n\ntwo'),c1=conversation('a',[record('a1','user',{objectId:'o',text:'one',model:'keep',explorerAnalysis:{...analyzeExplorerText('one'),objectPromptKey:fullKey,objectPromptSegments:2}}),record('a2','user',{objectId:'o',text:'two',model:'drop',explorerAnalysis:{...analyzeExplorerText('two'),objectPromptKey:fullKey,objectPromptSegments:2}})],{collectionIds:['A']}),c2=conversation('b',[record('b','user',{text:'one two'})],{collectionIds:['B']});
  const data=[c1,c2],result=make(data,{}, {comparisonA:select(data,{collectionIds:['A'],models:['keep']}),comparisonB:select(data,{collectionIds:['B']})});
  const overlap=chart(result,'27-selection-intersections').rows.find(r=>r.lens==='exact-prompt-content'&&r.region==='A ∩ B');assert.equal(overlap.count,0);assert.equal(overlap.aPopulation,0);
});

test('32 service-owned metadata diffs produce exact counts without transferring private paths or full text',()=>{
  const diff={metricVersion:'capture-diff:1',summary:{added:2,removed:1,changed:1,unchanged:5},tables:{added:[{id:'new1',rawPath:'/PRIVATE/path'},{id:'new2'}],removed:[{id:'old'}],changed:[{id:'same',leftFingerprint:'a',rightFingerprint:'b'}],capabilityChanges:[{conversationId:'changed-c'}],selectedPathChanges:[{conversationId:'changed-c'}],conversationsAdded:[{id:'new-c'}],conversationsRemoved:[{id:'old-c'}]},captures:{left:{id:'before',capturedAt:'2026-10-01',producer:{adapterVersion:'1.0.0'}},right:{id:'after',capturedAt:'2026-10-02',producer:{adapterVersion:'2.0.0'}}}};
  const result=make([],{}, {history:{enabled:true,diff}}),h=chart(result,'32-source-capture-diff');
  assert.equal(h.contract.state,'ready');assert.equal(h.contract.eligible,15);
  assert.equal(h.rows.find(r=>r.change==='added retained content identity').count,2);assert.equal(h.rows.find(r=>r.change==='unchanged retained content identity').count,5);
  assert.match(h.rows.find(r=>r.change==='unchanged retained content identity').evidenceAvailability,/summary/);
  assert.equal(h.rows.find(r=>r.change==='selected path changed').count,1);assert.deepEqual(evidence(result,h.rows.find(r=>r.change==='added retained content identity')),['new1','new2']);
  assert(!JSON.stringify(h).includes('PRIVATE'));assert.equal(h.contract.captureProducerA.adapterVersion,'1.0.0');
});

test('32 capability property order alone cannot manufacture a capture change',()=>{
  const a=conversation('same',[record('same','response')],{rawHash:'same-hash',capabilities:{first:true,second:false}}),b={...a,capabilities:{second:false,first:true}};
  const result=make([b],{}, {history:{enabled:true,previousCapture:{conversations:[a]},currentCapture:{conversations:[b]}}});
  assert.equal(chart(result,'32-source-capture-diff').rows.filter(r=>r.change==='capabilities changed').length,0);
});

test('19/20 topology aliases preserve nodes without doubling object segments or native activity',()=>{
  const c=tree();c.topology.nodes.push({id:'a-alias',parentId:'a-node',messageObjectId:'a-o',selected:true});c.branches.selectedNodes.push('a-alias');
  const result=make([c]),ladder=chart(result,'19-path-ladder').rows,structure=chart(result,'20-retained-branches-versions').rows[0];
  assert.equal(structure.nodes,7);assert.equal(structure.messageObjects,5);
  assert.equal(ladder.filter(r=>r.aliasOf!==null).length,1);assert.equal(ladder.filter(r=>r.aliasOf!==null)[0].segments,0);
  assert.equal(ladder.reduce((n,r)=>n+r.segments,0),5);
  const native=chart(result,'19-native-transitions');assert.equal(native.contract.eligible,2);
  assert.equal(native.rows.find(r=>r.target==='Alpha').status,'ambiguous aliased reply topology');
});
