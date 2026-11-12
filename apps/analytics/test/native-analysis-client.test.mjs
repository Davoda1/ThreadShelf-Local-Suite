import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeAnalysisClient,nativeFacetKind} from '../src/ui/native-analysis-client.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('message-model and conversation-model selectors keep independent query pages',()=>{
 const message=nativeFacetKind('models'),conversation=nativeFacetKind('conversationModels'),pages=new Map([[message,{query:'synthetic'}],[conversation,{query:''}]]);assert.notEqual(message,conversation);pages.set(message,{query:'new model'});assert.equal(pages.get(conversation).query,'');assert.equal(nativeFacetKind('collectionIds'),'collections');
});
function harness(overrides={}){const calls=[],bridge={calculate:async value=>({reportId:'report-'+value.requestId,report:{summary:{conversations:2000,records:9000}},datasetRevision:'dataset'}),compare:async()=>({reportId:'comparison',result:{differences:[]}}),releaseReport:async()=>({released:true}),cancelAnalysis:async()=>({cancelled:true}),tablePage:async value=>({rows:[{rowId:'exact',count:9}],total:2000,offset:value.offset||0,limit:value.limit}),chartData:async()=>({chart:{id:'chart',rows:[]}}),evidence:async()=>({evidence:[{id:'record'}],total:9000,offset:0}),...overrides};for(const[key,fn]of Object.entries(bridge))bridge[key]=value=>{calls.push({operation:key,value});return fn(value);};const client=createNativeAnalysisClient(bridge),messages=[];client.addEventListener('message',({data})=>messages.push(data));return{client,calls,messages};}

test('native requests contain selection metadata and bounded pages, never a conversation corpus',async()=>{
 const h=harness();h.client.postMessage({type:'data',dataset:{revision:'dataset',conversationCount:2000}});h.client.postMessage({type:'report',requestId:1,filters:{branch:'selected'},options:{calendarYear:2026}});await tick();
 assert.equal(h.messages.at(-1).type,'report');assert.equal(h.messages.at(-1).report.native,true);assert.equal(h.messages.at(-1).report.reportId,'report-1');assert.equal(h.messages.at(-1).report.summary.records,9000);
 const request=h.calls.find(value=>value.operation==='calculate').value;assert.equal(Object.hasOwn(request,'conversations'),false);assert.deepEqual(request.filters,{branch:'selected'});
 const page=await h.client.tablePage({table:'conversations',limit:1000,offset:100});assert.equal(page.total,2000);assert.equal(h.calls.at(-1).value.limit,100);assert.equal(h.calls.at(-1).value.reportId,'report-1');
 h.client.postMessage({type:'evidence',requestId:2,rowId:'exact',limit:1000});await tick();assert.equal(h.calls.find(value=>value.operation==='evidence').value.limit,100);assert.equal(h.messages.at(-1).evidence[0].id,'record');h.client.terminate();
});

test('a newer selection cancels its predecessor and stale completion never replaces the visible report',async()=>{
 const pending=new Map(),h=harness({calculate:value=>new Promise(resolve=>pending.set(value.requestId,resolve))});
 h.client.postMessage({type:'report',requestId:1});h.client.postMessage({type:'report',requestId:2});assert.equal(h.calls.find(value=>value.operation==='cancelAnalysis').value.requestId,1);
 pending.get(2)({reportId:'new',report:{summary:{records:20}}});await tick();pending.get(1)({reportId:'old',report:{summary:{records:10}}});await tick();
 assert.equal(h.messages.filter(value=>value.type==='report').length,1);assert.equal(h.messages.at(-1).report.summary.records,20);assert(h.calls.some(value=>value.operation==='releaseReport'&&value.value.reportId==='old'));h.client.terminate();assert(h.calls.some(value=>value.operation==='releaseReport'&&value.value.reportId==='new'));
});

test('queued table searches coalesce before dispatch and backend failures stay visible without fallback',async()=>{
 const h=harness();h.client.postMessage({type:'report',requestId:1});await tick();
 const first=h.client.tablePage({table:'conversations',query:'older'}),rejected=assert.rejects(first,{code:'REPORT_REPLACED'}),second=h.client.tablePage({table:'conversations',query:'newer'});await rejected;await second;
 assert.equal(h.calls.filter(value=>value.operation==='tablePage').length,1);assert.equal(h.calls.at(-1).value.query,'newer');h.client.terminate();
 const failing=harness({calculate:async()=>{throw Object.assign(new Error('Specific bounded-backend failure'),{code:'ANALYSIS_TEST_FAILURE'});}});failing.client.postMessage({type:'report',requestId:8});await tick();assert.equal(failing.messages.at(-1).type,'error');assert.equal(failing.messages.at(-1).code,'ANALYSIS_TEST_FAILURE');assert.equal(failing.messages.at(-1).requestId,8);assert.equal(failing.calls.filter(value=>value.operation==='calculate').length,1);failing.client.terminate();
});

test('public native evidence keeps the bounded retained text and actual next-page offset',async()=>{
 const body='## Retained public body\n\n```python\nprint("Synthetic 🧪")\n```',h=harness({evidence:async()=>({evidence:[{id:'record',text:body,textTruncated:true,fullTextCharacters:22000}],total:250,offset:5,limit:100,nextOffset:6,hasNext:true})});
 h.client.postMessage({type:'report',requestId:1});await tick();h.client.postMessage({type:'explorerEvidence',requestId:2,chartId:'01-length-histogram',offset:5,limit:100});await tick();const value=h.messages.at(-1);assert.equal(value.evidence[0].text,body);assert.equal(value.evidence[0].textTruncated,true);assert.equal(value.evidence[0].fullTextCharacters,22000);assert.equal(value.nextOffset,6);assert.equal(value.offset,5);assert.equal(value.total,250);h.client.terminate();
});
