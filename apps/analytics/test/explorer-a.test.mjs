import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFilters } from '../src/core/metrics.mjs';
import { buildExplorerA,analyzeExplorerText,explorerQuantile,EXPLORER_TEXT_ALGORITHM_VERSION } from '../src/core/explorer-a.mjs';

const record=(id,category,text,extra={})=>({id,objectId:'o-'+id,originalObjectId:id,logicalId:'l-'+id,category,text,model:'m',selected:true,observed:true,timestamp:null,datePrecision:'unknown',...extra});
const conversation=(id,records,extra={})=>({id,sourceId:'source',provider:'openai',format:'chatgpt-mapping',coverage:'original',collectionIds:['one'],records,...extra});
function engine(cs,filters={},options={}){return buildExplorerA(applyFilters(cs,{timeZone:'UTC',...filters}),{originalConversations:cs,...options});}
const chart=(result,n)=>result.charts.find(c=>c.family===n);
const cells=(c,kind)=>c.rows.filter(r=>r.kind===kind);
const dated=(day,hour=12)=>({timestamp:Date.parse(`${day}T${String(hour).padStart(2,'0')}:00:00Z`),datePrecision:'millisecond',timeProvenance:'/message/create_time'});
function evidence(result,row){const value=result.evidenceIndex.get(row.evidenceKey);return typeof value?.resolve==='function'?value.resolve():value;}

test('full Markdown index uses real CommonMark/GFM structure tokens and literal retained fences',()=>{
  const source='# Heading\n\n- one\n- two\n\n> quote\n\n| A | B |\n|---|---|\n|1|2|\n\n`inline` [link](https://EXAMPLE.com/x#part)\n\n```js title\nlet x = 1;\n```\n\n    indented\n\n![alt](https://invalid.example/image.png)';
  const a=analyzeExplorerText(source,record('a','response',source));
  assert.equal(a.version,EXPLORER_TEXT_ALGORITHM_VERSION);
  assert.equal(a.structures.headings,1);assert.equal(a.structures.lists,1);assert.equal(a.structures.listItems,2);assert.equal(a.structures.quotes,1);assert.equal(a.structures.tables,1);assert.equal(a.structures.inlineCode,1);assert.equal(a.structures.fencedCode,1);assert.equal(a.structures.indentedCode,1);assert.equal(a.structures.images,1);
  assert.deepEqual(a.links,[{url:'https://example.com/x',domain:'example.com'}]);
  assert.equal(a.blocks[0].literalDeclaration,'js title');assert.equal(a.blocks[0].characters,10);assert.equal(a.blocks[0].lines,1);
});

test('missing text unavailable, actual empty zero, Unicode code points and trace/summary separate',()=>{
  const cs=[conversation('a',[record('empty','user',''),record('emoji','response','a😀'),record('missing','response',null),record('trace','thinking','1234',{reasoningRepresentation:'trace',originalTraceAvailable:true}),record('summary','thinking','12',{reasoningRepresentation:'summary-only'}),record('redacted','thinking','',{observed:false,reasoningRepresentation:'unavailable',originalTraceAvailable:false})])];
  const c=chart(engine(cs),1);
  assert.equal(c.contract.eligible,6);assert.equal(c.contract.available,4);assert.equal(c.contract.unavailable,2);
  assert.deepEqual(c.contract.populationCoverage,{user:{eligible:1,available:1,unavailable:0},response:{eligible:2,available:1,unavailable:1},trace:{eligible:2,available:1,unavailable:1},summary:{eligible:1,available:1,unavailable:0}});
  assert.equal(c.rows.find(r=>r.kind==='histogram'&&r.population==='user'&&r.lower===0).count,1);
  assert.equal(c.rows.find(r=>r.kind==='ecdf'&&r.population==='response').threshold,2);
  assert.equal(c.rows.find(r=>r.kind==='ecdf'&&r.population==='trace').threshold,4);
  assert.equal(c.rows.find(r=>r.kind==='ecdf'&&r.population==='summary').threshold,2);
  assert.equal(analyzeExplorerText(undefined,{observed:true}).observed,false);
});

test('R7 quantiles, weighted quantiles and model length boxes have independent expected values',()=>{
  assert.equal(explorerQuantile([0,10,20,30].map(value=>({value})),.25),7.5);
  assert.equal(explorerQuantile([0,10,20,30].map(value=>({value})),.5),15);
  assert.equal(explorerQuantile([{value:0,weight:3},{value:10,weight:1}],.75),2.5);
  const cs=[conversation('a',[0,10,20,30].map((n,i)=>record('r'+i,'response','x'.repeat(n))))];
  const r=chart(engine(cs),2).rows[0];assert.equal(r.n,4);assert.equal(r.q1,7.5);assert.equal(r.median,15);assert.equal(r.q3,22.5);assert.equal(r.mean,15);
});

test('concentration reconciles observed totals and membership perspective remains explicit',()=>{
  const cs=[conversation('a',[record('a','user','x'.repeat(10))],{collectionIds:['one','two']}),conversation('b',[record('b','response','x'.repeat(30))])];
  const c=chart(engine(cs),3),ranks=cells(c,'rank');assert.equal(ranks[0].value,30);assert.equal(ranks[0].cumulativeShare,.75);assert.equal(ranks[1].cumulativeShare,1);
  const weighted=cells(chart(engine(cs,{perspective:'memberships'}),3),'rank');assert.equal(weighted[0].denominator,50);assert.equal(weighted[1].membershipWeight,2);
});

test('declared code body size, unspecified and unclosed fence observations are retained',()=>{
  const cs=[conversation('a',[record('a','response','```C++\na😀\n```\n\n```\nx\n'),record('b','response','```C++\n12345\n```')])];
  const summary=cells(chart(engine(cs),4),'summary');assert.equal(summary.find(r=>r.language==='C++').median,3.5);assert.equal(summary.find(r=>r.language==='Unspecified').unclosed,1);assert.equal(summary.find(r=>r.language==='C++').closed,2);
});

test('NFC whitespace matching does not merge distinct prompt event identities',()=>{
  const cs=[conversation('a',[record('a','user','e\u0301  two'),record('b','user','é\n two'),record('c','user','É two')])];
  const c=chart(engine(cs),5),groups=cells(c,'group');assert.equal(groups.length,2);assert.equal(groups.find(r=>r.frequency===2).distinctConversations,1);assert.equal(c.rows.find(r=>r.kind==='spectrum'&&r.frequency===2).promptOccurrences,2);
  assert.ok(!JSON.stringify(c).includes('é two'));
});

test('attachment scoped metadata dedupes mirrors; recorded zero bytes valid; dimensions strict positive',()=>{
  const a={id:'f',sizeBytes:0,width:100,height:50},cs=[conversation('a',[record('a','response','',{attachments:[a,{id:'g',sizeBytes:null,width:0,height:1}]}),record('b','thinking','',{attachments:[a]})])];
  const c=chart(engine(cs),6);assert.equal(c.contract.eligible,2);assert.equal(c.contract.available,1);assert.equal(c.contract.dimensionAvailable,1);assert.equal(c.rows.find(r=>r.kind==='histogram'&&r.measure==='bytes'&&r.lower===0).count,1);assert.equal(cells(c,'dimensions')[0].aspectRatio,2);
});

test('weekday-hour object anchor counts mixed-category object exactly once; day precision excluded; epoch zero valid',()=>{
  const same={objectId:'same',logicalId:'same-logical',...dated('2024-02-01',8)},cs=[conversation('a',[record('t','thinking','x',same),record('f','response','xx',same),record('day','user','x',{timestamp:Date.parse('2024-02-02'),datePrecision:'day',dateValue:'2024-02-02',timeProvenance:'/date'}),record('epoch','user','x',{timestamp:0,datePrecision:'second',timeProvenance:'/date'})])];
  const c=chart(engine(cs,{}, {temporalUnit:'object'}),7);assert.equal(c.contract.eligible,3);assert.equal(c.contract.available,2);assert.equal(c.rows.reduce((n,r)=>n+r.count,0),2);assert.equal(c.rows.find(r=>r.weekday===4&&r.hour===8).count,1);assert.equal(c.rows.find(r=>r.weekday===4&&r.hour===0).count,1);
  const convDate=chart(engine(cs,{timeBasis:'conversation'},{temporalUnit:'object'}),7);assert.equal(convDate.contract.available,2);
});

test('seasonality uses actual leap-year calendar denominator and includes zero-count bounded periods',()=>{
  const cs=[conversation('a',[record('a','user','x',dated('2024-02-02'))])],c=chart(engine(cs,{range:'year',year:2024}),8),feb=c.rows.find(r=>r.month===2);
  assert.equal(c.rows.length,12);assert.equal(feb.calendarDays,29);assert.equal(feb.rate,1/29);assert.equal(c.rows.find(r=>r.month===1).count,0);
});

test('active-day runs, intervening empty days and archive censoring match calendar dates',()=>{
  const cs=[conversation('a',['2024-02-01','2024-02-02','2024-02-04'].map((day,i)=>record('r'+i,'user','x',dated(day))))],c=chart(engine(cs),9);
  assert.deepEqual(cells(c,'streak').map(r=>r.length),[2,1]);assert.equal(cells(c,'gap')[0].length,1);assert.equal(cells(c,'streak')[0].leftCensored,true);assert.equal(cells(c,'streak')[1].rightCensored,true);
});

test('continuation uses first observed week and excludes insufficient followup from denominator',()=>{
  const cs=[conversation('old',[record('o1','user','x',dated('2024-02-01')),record('o2','response','x',dated('2024-02-15'))]),conversation('recent',[record('n1','user','x',dated('2024-04-01'))])];
  const c=chart(engine(cs),10),old=c.rows.find(r=>r.cohort==='2024-01-29'&&r.weekOffset===2),recent=c.rows.find(r=>r.cohort==='2024-04-01'&&r.weekOffset===1);assert.equal(old.count,1);assert.equal(old.eligible,1);assert.equal(old.fraction,1);assert.equal(recent.eligible,0);assert.equal(recent.fraction,null);assert.equal(recent.insufficientFollowup,1);
});

test('reply ordinals and intervals establish original adjacency before record filtering',()=>{
  const cs=[conversation('a',[record('u','user','x',{sourceIndex:0,...dated('2024-02-01',1)}),record('r1','response','xx',{sourceIndex:1,model:'omit',...dated('2024-02-01',2)}),record('r2','response','xxx',{sourceIndex:2,model:'keep',...dated('2024-02-01',3)})],{format:'claude-chat-messages'})];
  const result=engine(cs,{models:['keep']}),position=chart(result,11);assert.equal(position.rows[0].ordinal,2);assert.equal(position.rows[0].filteredGaps,1);const intervals=chart(result,12);assert.equal(intervals.contract.available,0);assert.equal(intervals.rows.find(r=>r.status==='filtered-gap').count,1);assert.equal(cells(intervals,'histogram').reduce((n,r)=>n+r.count,0),0);
});

test('recorded intervals preserve ties and reversed timestamps, exclude date-only endpoints',()=>{
  const cs=[conversation('a',[record('a','user','x',{sourceIndex:0,...dated('2024-02-01',2)}),record('b','response','x',{sourceIndex:1,...dated('2024-02-01',2)}),record('c','user','x',{sourceIndex:2,...dated('2024-02-01',1)}),record('d','response','x',{sourceIndex:3,timestamp:Date.parse('2024-02-02'),datePrecision:'day',dateValue:'2024-02-02',timeProvenance:'/date'})],{format:'claude-chat-messages'})];
  const c=chart(engine(cs),12);assert.equal(c.contract.eligible,3);assert.equal(c.contract.available,2);assert.equal(c.rows.find(r=>r.status==='tied').count,1);assert.equal(c.rows.find(r=>r.kind==='reversed-observation').milliseconds,-3600000);assert.equal(c.rows.find(r=>r.status==='date-precision-unavailable').count,1);
});

test('paired lens requires recorded parent/turn association rather than order or logical id',()=>{
  const bare=conversation('bare',[record('u','user','xxxx',{sourceIndex:0}),record('r','response','xx',{sourceIndex:1})],{format:'claude-chat-messages'}),paired=conversation('paired',[record('u2','user','xxxx',{nodeId:'user-node'}),record('r2','response','xx',{nodeId:'response-node',parentId:'user-node'})]);
  const result=engine([bare,paired],{}, {relationshipLens:'paired'}),c=chart(result,13);assert.equal(c.contract.eligible,2);assert.equal(c.contract.available,1);assert.equal(c.rows[0].xSum,4);assert.equal(c.rows[0].ySum,2);assert.deepEqual(evidence(result,c.rows[0]).sort(),['r2','u2']);
});

test('original trace and summary relationships separate ratio of sums from per-conversation ratios',()=>{
  const cs=[conversation('a',[record('t','thinking','xx',{originalTraceAvailable:true}),record('s','thinking','x'.repeat(99),{reasoningRepresentation:'summary-only'}),record('r','response','xxxx')]),conversation('b',[record('t2','thinking','xxxx',{originalTraceAvailable:true}),record('r2','response','xx')])];
  const c=chart(engine(cs),14),trace=c.rows.find(r=>r.kind==='ratio-summary'&&r.representation==='trace'),summary=c.rows.find(r=>r.kind==='ratio-summary'&&r.representation==='summary');assert.equal(trace.ratioOfSums,1);assert.equal(trace.ratioMedian,1.25);assert.equal(summary.traceSum,99);
});

test('same-object trace/final volume lens is available and not category-split',()=>{
  const cs=[conversation('a',[record('t','thinking','xx',{objectId:'object',logicalId:'logical',originalTraceAvailable:true}),record('f','response','xxxx',{objectId:'object',logicalId:'logical'})])];
  const c=chart(engine(cs,{}, {traceLens:'object'}),14);assert.equal(c.contract.available,1);assert.equal(c.rows.find(r=>r.kind==='ratio-summary'&&r.representation==='trace').ratioOfSums,.5);
});

test('feature presence, co-occurrence and parser structures use full text; repeated blocks do not multiply presence',()=>{
  const cs=[conversation('a',[record('a','response','```js\nx\n```\n```js\ny\n```'),record('b','response','plain',{model:'n'})]),conversation('b',[record('c','response','[x](https://example.com)')])];
  const result=engine(cs),features=chart(result,15),f=features.rows.find(r=>r.model==='m'&&r.feature==='fences');assert.equal(f.numerator,1);assert.equal(f.denominator,2);assert.equal(f.prevalence,.5);assert.equal(f.occurrences,2);assert.equal(features.rows.find(r=>r.model==='m'&&r.feature==='attachment-metadata').denominator,0);
  const languages=chart(result,16).rows.find(r=>r.dimension==='language'&&r.source==='js'&&r.target==='js');assert.equal(languages.joint,1);const models=chart(result,16).rows.find(r=>r.dimension==='model'&&r.source==='m'&&r.target==='n');assert.equal(models.joint,1);assert.equal(models.union,2);assert.equal(models.jaccard,.5);
  assert.equal(chart(result,18).rows.find(r=>r.structure==='fencedCode').occurrences,2);
});

test('reference channel URL normalization cross-channel dedupe and unlinked markers preserve numerical tables',()=>{
  const text='[a](https://EXAMPLE.com/x#frag) [b](https://example.com/x#two) [^marker]',cs=[conversation('a',[record('a','response',text,{references:[{id:'ref',url:'https://example.com/x#three'},{id:'unlinked'}]})])],result=engine(cs),c=chart(result,17);
  assert.equal(c.rows.find(r=>r.kind==='channel'&&r.channel==='textual-link').count,2);assert.equal(c.rows.find(r=>r.kind==='channel'&&r.channel==='structured-reference').count,1);assert.equal(c.rows.find(r=>r.kind==='channel'&&r.channel==='unlinked-citation-markers').count,1);assert.equal(c.rows.find(r=>r.kind==='channel'&&r.channel==='unlinked-structured-references').count,1);assert.equal(cells(c,'concentration')[0].count,1);assert.equal(cells(c,'concentration')[0].domain,'example.com');assert.equal(cells(c,'concentration')[0].cumulativeShare,1);
  assert.ok(!JSON.stringify(c).includes('https://'));
});

test('matrix top axes aggregate explicit Other without losing qualifying presence population',()=>{
  const cs=[conversation('a',[record('a','response','```js\nx\n```\n```py\nx\n```\n```c\nx\n```')])],c=chart(engine(cs,{}, {topN:1}),16),population=c.rows.find(r=>r.kind==='population'&&r.dimension==='language');assert.equal(population.originalLabels,3);assert.equal(population.retainedLabels,1);assert.equal(population.otherLabels,2);assert.ok(c.rows.some(r=>r.dimension==='language'&&r.source==='Other (2 labels)'&&r.joint===1));
});

test('ECDF evidence is lazy cumulative population and numerical table remains exact',()=>{
  const cs=[conversation('a',[record('a','user','x'),record('b','user','xxx'),record('c','user','xxx')])],result=engine(cs),r=chart(result,1).rows.find(r=>r.kind==='ecdf'&&r.population==='user'&&r.threshold===3);assert.equal(r.count,2);assert.equal(r.cumulative,3);assert.equal(r.denominator,3);assert.equal(r.fraction,1);assert.equal(typeof result.evidenceIndex.get(r.evidenceKey).resolve,'function');assert.deepEqual(evidence(result,r).sort(),['a','b','c']);
});

test('valid full-text index survives excerpts; absent index needs rebuild and is not measured as short text',()=>{
  const full='x'.repeat(10000)+'\n```js\nx\n```',r=record('a','response',full);r.explorerAnalysis=analyzeExplorerText(full,r);r.text=full.slice(0,10);r.textExcerpt=true;const cs=[conversation('a',[r])],result=engine(cs);assert.equal(chart(result,1).rows.find(r=>r.kind==='ecdf'&&r.population==='response').threshold,10012);assert.equal(chart(result,18).rows.find(r=>r.structure==='fencedCode').occurrences,1);
  const without=engine([conversation('a',[{...r,explorerAnalysis:undefined}])]);assert.equal(chart(without,1).contract.available,0);assert.equal(chart(without,18).contract.unavailable,1);
});

test('explicit conversation aliases preserve original adjacency and ordinal gaps',()=>{
  const cs=[conversation('original',[record('a','response','x',{sourceIndex:0,model:'X',...dated('2024-02-01',1)}),record('b','response','x',{sourceIndex:1,model:'Y',...dated('2024-02-01',2)}),record('c','response','x',{sourceIndex:2,model:'X',...dated('2024-02-01',3)})],{format:'claude-chat-messages'})];
  const result=engine(cs,{aliases:{original:'alias'},models:['X']}),interval=chart(result,12);assert.equal(interval.contract.available,0);assert.equal(interval.rows.find(r=>r.status==='filtered-gap').count,2);assert.deepEqual(chart(result,11).rows.map(r=>r.ordinal),[1,3]);
});

test('nested list and quote fenced-code bodies are parser measured, inline code markers excluded',()=>{
  const source='> ```js title\n> 😀\n> [^inside]\n> ```\n\n- item\n\n  ```py\n  12\n  ```\n\n`[^inline]` [^outside]';
  const a=analyzeExplorerText(source,record('a','response',source));assert.equal(a.blocks.length,2);assert.equal(a.blocks[0].literalDeclaration,'js title');assert.equal(a.blocks[0].characters,11);assert.equal(a.blocks[1].characters,2);assert.equal(a.citationMarkers,1);
});

test('indexed/raw prompt digests compare equally, partial logical prompts are unavailable',()=>{
  const a=record('a','user','same prompt'),b=record('b','user','same\n prompt');a.promptMatchKey='737987e3c59528e6bc9f1f98da6f1b7eb2437192f71fbb5a0a5e2d6b15f2e9ca';
  // Use an independent Node crypto digest of the documented normalized text.
  return import('node:crypto').then(({createHash})=>{a.promptMatchKey=createHash('sha256').update('same prompt').digest('hex');const result=engine([conversation('a',[a,b])]);assert.equal(cells(chart(result,5),'group')[0].frequency,2);
    const part1=record('p1','user','first',{logicalId:'logical',model:'X'}),part2=record('p2','user','second',{logicalId:'logical',model:'Y'});const partial=engine([conversation('p',[part1,part2])],{models:['X']});assert.equal(chart(partial,5).contract.eligible,1);assert.equal(chart(partial,5).contract.available,0);
  });
});

test('alternative versions do not manufacture native request adjacency or reply ordinals',()=>{
  const cs=[conversation('a',[record('u','user','x',{originalOrder:0,...dated('2024-02-01',1)}),record('v1','response','x',{originalOrder:1,logicalId:'reply-one',versionId:'1:0',selected:false,...dated('2024-02-01',2)}),record('v2','response','xx',{originalOrder:1,logicalId:'reply-one',versionId:'1:1',selected:true,...dated('2024-02-01',3)}),record('last','response','xxx',{originalOrder:2,...dated('2024-02-01',4)})],{format:'lm-studio-versions',ordering:{verified:true}})];
  const result=engine(cs,{branch:'all'});assert.deepEqual(chart(result,11).rows.map(r=>r.ordinal),[1,2]);const intervals=chart(result,12);assert.equal(intervals.contract.eligible,2);assert.equal(intervals.contract.available,2);assert.equal(intervals.rows.find(r=>r.status==='forward').count,2);
});

test('length population coverage follows logical grouping and membership weights independently',()=>{
  const cs=[conversation('a',[record('u1','user','x',{logicalId:'prompt'}),record('u2','user','xx',{logicalId:'prompt'}),record('r1','response','xxx',{logicalId:'reply'}),record('r2','response',null,{logicalId:'reply'})],{collectionIds:['one','two']})],c=chart(engine(cs,{perspective:'memberships'},{lengthLens:'logical'}),1);
  assert.deepEqual(c.contract.populationCoverage,{user:{eligible:2,available:2,unavailable:0},response:{eligible:2,available:0,unavailable:2},trace:{eligible:0,available:0,unavailable:0},summary:{eligible:0,available:0,unavailable:0}});
  assert.equal(c.contract.eligible,4);assert.equal(c.contract.available,2);assert.equal(c.contract.unavailable,2);assert.equal(c.rows.find(r=>r.kind==='ecdf'&&r.population==='user').denominator,2);
});
