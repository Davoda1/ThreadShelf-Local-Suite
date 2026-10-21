import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReport,applyFilters,analyzeText,resolveDateRange,zonedMidnight,compareSelections} from '../src/core/metrics.mjs';
import {reportJSON,reportCSV,reportHTML,csvCell} from '../src/core/reports.mjs';

const record=(id,category,extra={})=>({id,objectId:id,logicalId:id,segmentId:id,category,text:id,model:'unknown',timestamp:null,datePrecision:'unknown',selected:true,observed:true,coverage:'original',...extra});
const conversation=(id,provider,records,extra={})=>({id,title:'Confidential title '+id,provider,format:provider+'-json',collectionIds:['mixed'],sourceId:'source-a',snapshotId:'snapshot-1',adapterVersion:'1.0.0',records,capabilities:{originalRecords:true,branches:false},...extra});
const now=Date.parse('2026-10-01T12:00:00Z');
const fixture=()=>[
 conversation('openai:1','ChatGPT',[
  record('u','user',{timestamp:0,datePrecision:'second',text:'repeat me'}),
  record('t','thinking',{objectId:'a',logicalId:'a',model:'model-A',text:'thought'}),
  record('a','response',{objectId:'a',logicalId:'a',model:'model-A',timestamp:Date.parse('2026-10-01T01:00:00Z'),datePrecision:'second',text:'answer'}),
  record('a2','response',{objectId:'a',logicalId:'a',model:'model-A',text:'second segment'}),
  record('b','response',{model:'model-B',selected:false,text:'Alternative'}),
  record('r','recap',{model:'model-A',durationMs:123,text:'Recap'}),
  record('red','redacted',{text:'',observed:false}),
 ],{collectionIds:['mixed','copy'],branches:{maxDepth:4,branchPoints:1}}),
 conversation('venice:1','VeniceAI',[
  record('vu','user',{text:'repeat me'}),
  record('call','tool_call',{event:{id:'e1',type:'tool_call',callId:'call-1',name:'search',status:'completed'}}),
  record('call-display','tool_call',{event:{id:'e1',type:'tool_call',callId:'call-1',name:'search'}}),
  record('out','tool_output',{event:{type:'tool_output',callId:'call-1'}}),
  record('search','other',{event:{type:'search',name:'Web search'}}),
  record('va','response',{model:'model-B',timestamp:Date.parse('2026-10-01T22:00:00Z'),datePrecision:'second',text:'別の回答です。',usage:{scope:'request',unit:'tokens',verified:true,inputTokens:10,outputTokens:20,totalTokens:30},toolIndicators:['web'],attachments:[{id:'file-a',mimeType:'image/png',sizeBytes:25,file_token_size:500,width:120,height:90,available:false}]}),
 ])
];

test('independent logical/object/segment counts and role distinctions',()=>{
 const report=buildReport(fixture(),{timeZone:'UTC'},{now});
 assert.equal(report.summary.conversations,2);
 assert.equal(report.summary.collectionMemberships,3);
 assert.equal(report.summary.records,12);
 assert.equal(report.summary.userMessages,2);
 assert.equal(report.summary.responseMessages,2);
 assert.equal(report.summary.assistantTextSegments,3);
 assert.equal(report.summary.objects,10);
 assert.equal(report.summary.thinkingSegments,1);
 assert.equal(report.summary.recapRecords,1);
 assert.equal(report.summary.redactedSegments,1);
 assert.equal(report.summary.toolCalls,1);
 assert.equal(report.summary.toolOutputs,1);
 assert.equal(report.summary.searchEvents,1);
 assert.equal(report.summary.toolIndicators,1);
 assert.equal(report.summary.datedRecords,3);
 assert.equal(report.evidence.find(e=>e.id==='red').text,null);
 assert.equal(report.tables.toolAssociations[0].outputCount,1);
 assert.equal(report.tables.repeatedPrompts[0].count,2);
});

test('same mixed collection is additive for compatible segments and preserves provider/model separation',()=>{
 const input=fixture(),combined=buildReport(input,{collectionIds:['mixed']},{now});
 const chat=buildReport(input,{collectionIds:['mixed'],providers:['ChatGPT']},{now});
 const venice=buildReport(input,{collectionIds:['mixed'],providers:['VeniceAI']},{now});
 assert.equal(combined.summary.records,chat.summary.records+venice.summary.records);
 assert.deepEqual(combined.tables.platforms.map(p=>p.label).sort(),['ChatGPT','VeniceAI']);
 assert.equal(combined.tables.models.find(m=>m.label==='model-B').count,1);
});

test('message model filtering genuinely excludes unmatched messages; conversation model filter is separate',()=>{
 const input=fixture();
 const messages=buildReport(input,{models:['model-A']},{now});
 assert.equal(messages.summary.records,4);
 assert.equal(messages.summary.userMessages,0);
 assert(messages.evidence.every(r=>r.model==='model-A'));
 const conv=buildReport(input,{conversationModels:['model-A']},{now});
 assert.equal(conv.summary.records,6);
 assert.equal(conv.summary.userMessages,1);
 assert.equal(conv.summary.conversations,1);
});

test('branch/version scope and memberships preserve counting policies',()=>{
 const input=fixture(),selected=buildReport(input,{}, {now}),all=buildReport(input,{branch:'all'}, {now}),alternative=buildReport(input,{branch:'alternative'},{now});
 assert.equal(all.summary.records,selected.summary.records+alternative.summary.records);
 assert.equal(alternative.summary.records,1);
 const memberships=buildReport(input,{perspective:'memberships'}, {now});
 assert.equal(memberships.summary.records,18);
 const copy=buildReport(input,{collectionIds:['copy'],perspective:'memberships'}, {now});
 assert.equal(copy.summary.records,6);
 const compared=compareSelections(input,{}, {perspective:'memberships'},{now});assert.equal(compared.compatibleUnits,false);
});

test('dedup uses explicit identity, preserves repeated prompts and separate source namespaces',()=>{
 const input=fixture();
 const duplicate={...input[0],collectionIds:['third']};
 const report=buildReport([...input,duplicate],{}, {now});
 assert.equal(report.summary.records,12);
 assert.equal(report.summary.collectionMemberships,4);
 assert.equal(report.tables.deduplication.length,1);
 const independent={...input[0],id:'source-b:openai:1'};
 assert.equal(buildReport([...input,independent],{},{now}).summary.conversations,3);
 const alias=buildReport([...input,independent],{},{now,annotations:{dedupAliases:{'source-b:openai:1':'openai:1'}}});
 assert.equal(alias.summary.conversations,2);
});

test('epoch zero valid; date boundaries, undated behavior and explicit conversation date basis',()=>{
 const input=fixture();
 assert.equal(buildReport(input,{range:'custom',start:'1970-01-01',end:'1970-01-01',timeZone:'UTC'},{now}).summary.records,1);
 const day=buildReport(input,{range:'custom',start:'2026-10-01',end:'2026-10-01',timeZone:'UTC'},{now});
 assert.equal(day.summary.records,2);
 assert.equal(day.summary.undatedRecords,0);
 assert.equal(buildReport(input,{range:'custom',start:'2026-10-01',end:'2026-10-01',timeZone:'UTC',includeUndated:true},{now}).summary.records,11);
 const datedConversation=conversation('c','Meta AI',[record('m','user')],{createdAt:now});
 assert.equal(buildReport([datedConversation],{range:'7d',timeZone:'UTC'},{now}).summary.records,0);
 const explicit=buildReport([datedConversation],{range:'7d',timeZone:'UTC',timeBasis:'conversation'},{now});
 assert.equal(explicit.summary.records,1);assert.equal(explicit.tables.hour.length,0);
});

test('day-only precision preserves original calendar day and excludes hour metric',()=>{
 const input=[conversation('day','Gemini',[record('d','user',{timestamp:Date.parse('2026-10-01T00:00:00Z'),datePrecision:'day',dateValue:'2026-10-01'})])];
 const report=buildReport(input,{range:'custom',start:'2026-10-01',end:'2026-10-01',timeZone:'America/Los_Angeles'},{now});
 assert.equal(report.summary.records,1);assert.equal(report.tables.timelineDaily[0].date,'2026-10-01');assert.equal(report.tables.hour.length,0);
});

test('IANA timezones account for DST and equal calendar-length previous periods',()=>{
 const start=zonedMidnight('2026-03-29','Europe/Budapest');
 const end=zonedMidnight('2026-03-30','Europe/Budapest');
 assert.equal((end-start)/3600000,23);
 const report=buildReport(fixture(),{range:'custom',start:'2026-03-29',end:'2026-03-30',timeZone:'Europe/Budapest'},{now});
 assert.equal(report.previousPeriod.calendarDays,2);
 assert.equal(report.previousPeriod.dateRange.startDay,'2026-03-27');
 assert.equal(report.previousPeriod.dateRange.endDay,'2026-03-29');
 assert.equal(report.previousPeriod.comparison[0].percentageChange,null);
 assert.equal(resolveDateRange({range:'custom',start:'2026-10-02',end:'2026-10-01'},now).invalid,true);
});

test('Unicode multilingual segmentation, fences, declared code language, links, tables, citations',()=>{
 const text='日本語の文章です。 👩‍💻\n\n```rust\nfn main() {}\n```\n\n[Link](https://example.org/page)\n\n|A|B|\n|---|---|\n|1|2|\n\n[^1]';
 const data=analyzeText(text,{references:[{url:'https://reference.example/a'}]});
 assert.equal(data.characters,[...text].length);assert(data.words>0);assert.equal(data.codeBlocks,1);assert.equal(data.blocks[0].language,'rust');assert.equal(data.codeLines,1);assert.equal(data.links.length,1);assert.equal(data.tables,1);assert.equal(data.textualCitations,1);assert.equal(data.structuredReferences,1);
 assert.equal(analyzeText('```unknown\nx\n').blocks[0].closed,false);
 assert.equal(analyzeText('secret',{observed:false}).characters,null);
});

test('usage scopes, fields and source-object repetition never invent consumption',()=>{
 const input=fixture();const r=buildReport(input,{}, {now});
 assert.equal(r.tables.usage.find(u=>u.label==='inputTokens').value,10);
 assert.equal(r.tables.usage.find(u=>u.label==='outputTokens').value,20);
 assert.equal(r.tables.usage.find(u=>u.label==='totalTokens').value,30);
 assert.equal(r.summary.usageRecords,1);
 assert(!r.tables.usage.some(u=>u.value===500));
 const unsafe=conversation('unsafe','VeniceAI',[record('x','response',{usage:{total_tokens:800}})]);
 const absent=buildReport([unsafe],{}, {now});assert.equal(absent.tables.usage.length,0);assert.equal(absent.tables.quality[0].label,'Uninterpreted usage metadata');
 assert.equal(absent.coverage.usage.available,0);assert.equal(absent.summary.thinkingResponseRatio,null);
});

test('ratio applies only paired exported traces; missing thinking is unavailable',()=>{
 const paired=conversation('paired','Claude',[record('t','thinking',{text:'1234'}),record('a','response',{text:'12'})]);
 const missing=conversation('missing','Claude',[record('a2','response',{text:'1234567890'})]);
 const r=buildReport([paired,missing],{}, {now});assert.equal(r.summary.thinkingResponseRatio,2);assert.equal(r.coverage.thinkingResponseRatio.available,1);assert.equal(r.coverage.thinkingResponseRatio.total,2);
});

test('reports share applied tables, privacy default and opt-in escaped evidence',()=>{
 const input=[conversation('evil','ChatGPT',[record('x','user',{text:'PRIVATE <script>alert(1)</script> =SUM(1,2)'})])];
 const r=buildReport(input,{categories:['user'],timeZone:'UTC'}, {now});
 assert.deepEqual(r.charts.composition,r.tables.composition);
 const exported=JSON.parse(reportJSON(r));assert.deepEqual(exported.filters,r.filters);assert.equal(exported.evidence,undefined);
 assert(!reportJSON(r).includes('PRIVATE'));assert(!reportCSV(r).includes('PRIVATE'));assert(!reportHTML(r).includes('PRIVATE'));
 const opted=reportHTML(r,{includeEvidence:true,evidenceIds:['x']});assert(opted.includes('PRIVATE &lt;script&gt;'));assert(!opted.includes('<script>'));assert(!opted.includes('<script src='));assert(opted.includes('Content-Security-Policy'));
 const json=JSON.parse(reportJSON(r,{includeEvidence:true,evidenceIds:[]}));assert.equal(json.evidence.length,0);
 const csv=reportCSV(r);assert(csv.includes('"table","composition"'));assert(csv.includes('"count"'));
});

test('CSV formula injection rejects leading controls and respects literal numeric values',()=>{
 assert.equal(csvCell('=1+1'),'"\'=1+1"');assert.equal(csvCell('\t@cmd'),'"\'\t@cmd"');assert.equal(csvCell('-1'),'"\'-1"');assert.equal(csvCell(-1),'"-1"');assert.equal(csvCell('a"b'),'"a""b"');
});

test('unsupported empty neighbors, unknown categories and empty denominator remain honest',()=>{
 const unknown=conversation('unsupported','unknown',[],{supported:false,diagnostics:[{code:'unsupported-record',message:'Unknown source structure'}]});
 const r=buildReport([unknown],{}, {now});assert.equal(r.summary.conversations,1);assert.equal(r.summary.records,0);assert.equal(r.summary.unsupportedConversations,1);assert.equal(r.coverage.timestamps.percent,null);assert.equal(r.summary.averagePerActiveDay,null);assert.equal(r.summary.thinkingResponseRatio,null);assert.equal(r.tables.quality.length,1);
 const empty=buildReport([],{}, {now});assert.equal(empty.tables.models.length,0);assert.equal(empty.summary.words,0);
});

test('precomputed full-text metrics survive compact boolean or string excerpt flags',()=>{
 const full='長い文章 '.repeat(3000);
 const fullAnalysis=analyzeText(full);
 const compact=record('long','response',{text:full.slice(0,8000),textExcerpt:true,contentAnalysis:fullAnalysis});
 const r=buildReport([conversation('long','Claude',[compact])],{}, {now});
 assert.equal(typeof r.evidence[0].text,'string');assert.equal(r.evidence[0].text.length,8000);
 assert.equal(r.evidence[0].textTruncated,true);assert.equal(r.summary.characters,[...full].length);
 assert.equal(r.evidence[0].fullTextCharacters,[...full].length);
 const string=buildReport([conversation('long','Claude',[{...compact,textExcerpt:'custom excerpt'}])],{}, {now});assert.equal(string.evidence[0].text,'custom excerpt');
});

test('aggregate export removes source paths; HTML headings follow all five locales',()=>{
 const r=buildReport(fixture(),{}, {now,sourceScope:[{id:'source-a',path:'/private/export.json',paths:['C:\\private\\archive'],snapshotId:'one',capturedAt:'2026-10-01'}]});
 for(const output of [reportJSON(r),reportCSV(r),reportHTML(r)]) {assert(!output.includes('/private/export.json'));assert(!output.includes('C:\\private\\archive'));}
 for(const [lang,heading] of [['en','Counting definitions'],['hu','Számlálási definíciók'],['de','Zähldefinitionen'],['fr','Définitions de comptage'],['ja','集計の定義']]) {const html=reportHTML(r,{language:lang});assert(html.includes('<html lang="'+lang+'">'));assert(html.includes(heading));}
});

test('saved virtual groups, explicit model families and numeric recap metadata preserve scope',()=>{
 const input=fixture();
 const group=buildReport(input,{conversationIds:['venice:1'],modelAliases:{'model-B':'B family'},modelFamilies:['B family']},{now});assert.equal(group.summary.conversations,1);assert.equal(group.summary.records,1);assert.equal(group.tables.models[0].label,'model-B');assert.equal(group.tables.modelFamilies[0].label,'B family');
 const recap=conversation('recap','ChatGPT',[record('seconds','recap',{text:'Thought for 2m 3s'}),record('vague','recap',{text:'Thought for a few seconds'}),record('occupancy','response',{contextOccupancy:{totalTokens:1000,maxContextLength:16000}})]);
 const report=buildReport([recap],{}, {now});assert.equal(report.tables.durations.length,1);assert.equal(report.tables.durations[0].milliseconds,123000);assert.equal(report.tables.contextOccupancy.length,1);assert.equal(report.tables.usage.length,0);assert.equal(report.summary.usageRecords,0);
});

test('summary-only reasoning stays distinct from observed traces and paired ratios',()=>{
 const input=[conversation('summary','ChatGPT',[record('summary','thinking',{text:'exported summary',reasoningRepresentation:'summary-only',originalTraceAvailable:false}),record('final','response',{text:'ok'}),record('missing','thinking',{text:'',observed:false,reasoningRepresentation:'unavailable',originalTraceAvailable:false})])];
 const report=buildReport(input,{}, {now});assert.equal(report.summary.thinkingSegments,2);assert.equal(report.summary.thinkingTraceSegments,0);assert.equal(report.summary.thinkingSummarySegments,1);assert.equal(report.summary.thinkingUnavailableSegments,1);assert.equal(report.summary.thinkingResponseRatio,null);assert.equal(report.coverage.thinkingTrace.available,0);assert.equal(report.coverage.thinkingTrace.total,2);assert.equal(report.tables.thinkingRepresentations.length,2);assert.equal(report.evidence[0].originalTraceAvailable,false);
});

test('repeated object metadata does not duplicate indicators, attachments, outputs or usage',()=>{
 const metadata={objectId:'shared-object',toolIndicators:['web','web'],attachments:[{type:'image/png',name:'image.png',sizeBytes:5}],usage:{scope:'request',unit:'tokens',inputTokens:7},event:{id:'shared-output',type:'tool_output',callId:'unused'}};
 const input=[conversation('repeated','VeniceAI',[record('one','tool_output',metadata),record('two','tool_output',metadata)])];
 const report=buildReport(input,{}, {now});assert.equal(report.summary.records,2);assert.equal(report.summary.objects,1);assert.equal(report.summary.toolOutputs,1);assert.equal(report.summary.toolIndicators,1);assert.equal(report.summary.toolIndicatorObjects,1);assert.equal(report.summary.attachments,1);assert.equal(report.tables.usage[0].value,7);
});

test('display aliases never merge data or leak into aggregate report filters; empty virtual groups stay empty',()=>{
 const input=fixture();const r=buildReport(input,{range:'7d',timeZone:'UTC'},{now,annotations:{aliases:{'openai:1':'PRIVATE DISPLAY ALIAS'}}});
 assert.equal(r.filters.displayAliases['openai:1'],'PRIVATE DISPLAY ALIAS');assert(!reportJSON(r).includes('PRIVATE DISPLAY ALIAS'));assert(!reportCSV(r).includes('PRIVATE DISPLAY ALIAS'));assert(!reportHTML(r).includes('PRIVATE DISPLAY ALIAS'));
 assert.equal(buildReport(input,{conversationIds:[]},{now}).summary.conversations,0);
 const unknown=conversation('u','unknown',[record('unknown-platform','user')]);assert.equal(buildReport([unknown],{providers:['unknown']},{now}).summary.records,1);
 const opted=JSON.parse(reportJSON(buildReport(input,{}, {now}),{includeEvidence:true,evidenceIds:['va']}));assert(opted.tables.conversations.find(c=>c.id==='venice:1').title);assert(!opted.tables.conversations.find(c=>c.id==='openai:1').title);
});

test('applied excerpt search gives matching GUI and report populations beyond the 8k boundary',()=>{
 const text='x'.repeat(8100)+' late-secret';const full=record('search-record','response',{text});const compact={...full,text:text.slice(0,8000),textExcerpt:true,contentAnalysis:analyzeText(text,full)};
 const fullReport=buildReport([conversation('search','Claude',[full])],{search:'late-secret'},{now});const compactReport=buildReport([conversation('search','Claude',[compact])],{search:'late-secret'},{now});assert.equal(fullReport.summary.records,0);assert.equal(compactReport.summary.records,0);assert.equal(fullReport.filters.searchLimit,8000);assert.equal(fullReport.filters.searchScope,'excerpt');
 assert.equal(buildReport([conversation('search','Claude',[full])],{search:'late-secret',searchScope:'full'},{now}).summary.records,1);
});

test('report scaffold translates visible headings, subtitle, unavailable cells and previous-period prose directly',()=>{
 const report=buildReport(fixture(),{range:'7d',timeZone:'UTC'},{now});
 for(const [language,unavailable] of [['hu','Nem elérhető'],['de','Nicht verfügbar'],['fr','Indisponible'],['ja','利用不可']]) {
   const html=reportHTML(report,{language,includeEvidence:true,evidenceIds:['red']});
   for(const text of ['>Scope<','>Coverage<','>Definitions<','>Generated<','>Capture time<','>Applied filters<','>Counting definitions<','>Applied selection and provenance<','>Adapter versions<','>Perspective<','>Unavailable<','>Equal calendar-length previous period<',' calendar days · ','Calendar comparisons preserve local boundaries across DST.',' · Analytical schema ','aria-label="Report navigation"'])assert(!html.includes(text),`${language}: ${text}`);
   assert(html.includes(unavailable));
 }
});

test('aggregate serializers omit every nested evidence ID list without changing numerical cells',()=>{
 const report=buildReport(fixture(),{range:'7d',timeZone:'UTC'},{now});
 const payload=JSON.parse(reportJSON(report));
 assert(!JSON.stringify(payload).includes('"evidenceIds"'));assert(!reportCSV(report).includes('"evidenceIds"'));assert(!reportHTML(report).includes('evidenceIds'));
 const numericCells=value=>Array.isArray(value)?value.map(numericCells):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key,item])=>key!=='evidenceIds'&&(typeof item==='number'||item&&typeof item==='object')).map(([key,item])=>[key,numericCells(item)])):value;
 assert.deepEqual(numericCells(payload.tables),numericCells(report.tables));assert.deepEqual(numericCells(payload.summary),numericCells(report.summary));
 assert(report.tables.timelineDaily.some(r=>r.evidenceIds.length));assert(report.summary.busiestDay.evidenceIds.length);
 const explicit=JSON.parse(reportJSON(report,{includeEvidence:true,evidenceIds:['va']}));assert.deepEqual(explicit.evidence.map(e=>e.id),['va']);assert(explicit.tables.timelineDaily.some(r=>r.evidenceIds?.length));
});
