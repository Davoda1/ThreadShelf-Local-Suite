import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReport} from '../src/core/metrics.mjs';
import {buildExplorerReport,resolveExplorerEvidence} from '../src/core/explorer.mjs';
import {exportPayload,reportJSON,reportCSV,reportHTML} from '../src/core/reports.mjs';

const now=Date.parse('2026-10-02T00:00:00Z');
function record(id,category,text,parent=null,extra={}) {
  return {id,category,text,objectId:'object:'+id,logicalId:'logical:'+id,originalObjectId:id,nodeId:id,parentId:parent,relationship:{verified:true,parentOriginalId:parent},logicalProvenance:'recorded message identifier',timestamp:Date.parse('2026-09-01T00:00:00Z'),datePrecision:'second',timeProvenance:'message.create_time',observed:true,selected:true,coverage:'original',model:'model-A',rawPath:'/mapping/'+id,...extra};
}
function fixture() {
  const first=[record('u1','user','ask'),record('t1','thinking','1234','u1',{objectId:'object:a1',logicalId:'logical:a1',nodeId:'a1',originalObjectId:'a1',reasoningRepresentation:'trace',originalTraceAvailable:true}),record('a1','response','1234567890','u1'),record('u2','user','ask','a1'),record('a2','response','12345678901234567890','u2',{model:'model-B'}),record('alternative','response','alternate','u2',{selected:false,model:'model-C'})];
  const second=[record('u3','user','why'),record('a3','response','123456789012345678901234567890','u3',{model:'model-B',timestamp:Date.parse('2026-09-03T00:00:00Z')}),record('unobserved','response','','a3',{observed:false})];
  const conversation=(id,records,collections)=>({id,title:'Synthetic '+id,sourceId:'synthetic-source',snapshotId:'synthetic-snapshot',provider:'openai',format:'chatgpt-mapping',schemaVersion:'2.0.0',adapterVersion:'2.0.0',coverage:'original',records,collectionIds:collections,ordering:{verified:true,kind:'recorded-parent-path'},branches:{selectedPathKnown:true,selectedNodes:records.filter(r=>r.selected).map(r=>r.nodeId),alternativeNodes:records.filter(r=>!r.selected).map(r=>r.nodeId),branchPoints:id==='c1'?1:0},diagnostics:[],versions:[]});
  return [conversation('c1',first,['one','two']),conversation('c2',second,['one'])];
}
const chart=(result,id)=>{const value=result.charts.find(c=>c.id===id);assert(value,id);return value;};
const numbers=value=>Array.isArray(value)?value.map(numbers):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([k,v])=>typeof v==='number'||v&&typeof v==='object').map(([k,v])=>[k,numbers(v)])):value;

test('actual wrapper implements all 32 chart families with complete contracts and exact report rows',()=>{
  const input=fixture(),filters={timeZone:'UTC'},explorer=buildExplorerReport(input,filters,{}, {now});
  assert.deepEqual([...new Set(explorer.charts.map(c=>c.family))].sort((a,b)=>a-b),Array.from({length:32},(_,i)=>i+1));
  assert.equal(new Set(explorer.charts.map(c=>c.id)).size,explorer.charts.length);
  for(const c of explorer.charts){
    assert(Array.isArray(c.rows));assert(Array.isArray(c.columns));assert(c.contract.unit);assert(c.contract.observationUnit);assert(c.contract.algorithmVersion);assert(c.contract.filterScope);assert(c.contract.branchPolicy);assert(c.contract.dateBasis);assert.equal(c.contract.timeZone,'UTC');assert(Number.isFinite(c.contract.eligible));assert(Number.isFinite(c.contract.available));assert.equal(c.contract.unavailable,c.contract.eligible-c.contract.available,c.id);assert(['ready','unknown','unavailable','partial'].includes(c.contract.state),c.id);assert.equal(c.exactRowCount,c.rows.length);
  }
  const legacy=buildReport(input,filters,{now}),combined={...legacy,explorer},payload=JSON.parse(reportJSON(combined));
  assert.equal(payload.explorer.charts.length,explorer.charts.length);assert.deepEqual(numbers(payload.explorer.charts.map(c=>c.rows)),numbers(explorer.charts.map(c=>c.rows)));assert.equal(payload.explorer.filterStatus,'applied');
  const csv=reportCSV(combined),html=reportHTML(combined);
  for(const c of explorer.charts){assert(csv.includes('"table","explorer:'+c.id+'"'),c.id);assert(payload.explorer.charts.find(e=>e.id===c.id).exactRowCount===c.rows.length);}
  assert.equal((html.match(/id="explorer-[0-9]+"/g)||[]).length,explorer.charts.length);assert(!reportJSON(combined).includes('"evidenceIndex"'));assert(!reportJSON(combined).includes('"evidenceKey"'));
  assert.equal(legacy.summary.records,8);assert.equal(legacy.summary.characters,73);assert.equal(legacy.summary.responseMessages,4);
});

test('actual histogram/R7/ECDF populations and lazy evidence match independently known response lengths',()=>{
  const input=fixture(),result=buildExplorerReport(input,{timeZone:'UTC'}, {},{now});
  const lengths=chart(result,'01-length-histogram'),ecdf=lengths.rows.filter(r=>r.kind==='ecdf'&&r.population==='response');
  assert.deepEqual(ecdf.map(({threshold,count,cumulative,denominator,fraction})=>({threshold,count,cumulative,denominator,fraction})),[{threshold:10,count:1,cumulative:1,denominator:3,fraction:1/3},{threshold:20,count:1,cumulative:2,denominator:3,fraction:2/3},{threshold:30,count:1,cumulative:3,denominator:3,fraction:1}]);
  const bins=lengths.rows.filter(r=>r.kind==='histogram'&&r.population==='response');assert.equal(bins.reduce((n,r)=>n+r.count,0),3);assert.equal(bins.find(r=>r.lower===10&&r.upper===50).count,3);
  const box=chart(result,'02-length-box').rows[0];assert.equal(box.n,3);assert.equal(box.eligible,4);assert.equal(box.unavailable,1);assert.deepEqual([box.minimum,box.q1,box.median,box.q3,box.maximum,box.mean],[10,15,20,25,30,20]);
  assert.equal(typeof result.evidenceIndex.get(ecdf[1].evidenceKey).resolve,'function');
  const first=resolveExplorerEvidence(result,input,{chartId:lengths.id,evidenceKey:ecdf[0].evidenceKey}),second=resolveExplorerEvidence(result,input,{chartId:lengths.id,evidenceKey:ecdf[1].evidenceKey}),last=resolveExplorerEvidence(result,input,{chartId:lengths.id,evidenceKey:ecdf[2].evidenceKey,limit:1,offset:2});
  assert.deepEqual(first.evidence.map(r=>r.id),['a1']);assert.deepEqual(second.evidence.map(r=>r.id),['a1','a2']);assert.equal(last.total,3);assert.deepEqual(last.evidence.map(r=>r.id),['a3']);
  const weighted=buildExplorerReport(input,{timeZone:'UTC',perspective:'memberships'}, {},{now}),weightedECDF=chart(weighted,'01-length-histogram').rows.filter(r=>r.kind==='ecdf'&&r.population==='response');
  assert.deepEqual(weightedECDF.map(r=>[r.threshold,r.cumulative,r.denominator]),[[10,2,5],[20,4,5],[30,5,5]]);
});

test('comparison remains unavailable until two explicitly applied compatible selections and reconciles exact deltas',()=>{
  const input=fixture(),base=buildExplorerReport(input,{timeZone:'UTC'}, {},{now});
  for(const family of [25,26,27,28,31])for(const c of base.charts.filter(c=>c.family===family)){assert.equal(c.contract.comparisonApplied,false);assert.equal(c.contract.state,'unavailable');assert.equal(c.rows.length,0);}
  const options={now,comparisonFiltersA:{timeZone:'UTC',conversationIds:['c1']},comparisonFiltersB:{timeZone:'UTC',conversationIds:['c2']}},result=buildExplorerReport(input,{timeZone:'UTC'}, {},options);
  const deltas=chart(result,'25-aligned-deltas');assert(deltas.contract.comparisonApplied);const user=deltas.rows.find(r=>r.key==='user'),response=deltas.rows.find(r=>r.key==='response');
  assert.deepEqual([user.a,user.b,user.delta,user.relative],[6,3,-3,-.5]);assert.deepEqual([response.a,response.b,response.delta,response.aAvailable,response.bAvailable],[30,30,0,2,1]);
  const shift=chart(result,'26-distribution-shifts').rows.find(r=>r.quantile===.5);assert.deepEqual([shift.a,shift.b,shift.shift,shift.aN,shift.bN,shift.aUnavailable,shift.bUnavailable],[15,30,15,2,1,0,1]);
  const contribution=chart(result,'28-change-contributions');assert.equal(contribution.contract.totalA,40);assert.equal(contribution.contract.totalB,33);assert.equal(contribution.contract.totalDelta,-7);assert.equal(contribution.rows.reduce((n,r)=>n+r.contribution,0),-7);assert.equal(contribution.contract.reconciliationResidual,0);
  const coverage=chart(result,'31-coverage-change').rows.find(r=>r.metric==='text');assert.deepEqual([coverage.a,coverage.b,coverage.delta,coverage.aEligible,coverage.bEligible,coverage.aAvailable,coverage.bAvailable],[40,33,-7,5,3,5,2]);
  const mismatch=buildExplorerReport(input,{timeZone:'UTC'}, {},{...options,comparisonFiltersB:{...options.comparisonFiltersB,perspective:'memberships'}});assert.equal(chart(mismatch,'25-aligned-deltas').rows.length,0);assert.equal(chart(mismatch,'25-aligned-deltas').contract.state,'unavailable');
});

test('actual default Explorer exports exclude original prompt wording, URLs, filenames and sensitive declarations',()=>{
  const input=fixture();input[0].title='PRIVATE-TITLE';input[0].records[0].text='PRIVATE-PROMPT-WORDING';input[0].records[2].text='```private-language-token\nlet example = 1;\n```\n[link](https://private.invalid/path?PRIVATE-URL-QUERY)';input[0].records[2].attachments=[{mimeType:'text/plain',filename:'PRIVATE-FILENAME.txt',sizeBytes:19}];
  const filters={timeZone:'UTC',search:'PRIVATE',searchScope:'full'},legacy=buildReport(input,filters,{now}),explorer=buildExplorerReport(input,filters,{}, {now}),combined={...legacy,explorer},payload=exportPayload(combined);
  const newData=JSON.stringify(payload.explorer);for(const value of ['PRIVATE-PROMPT-WORDING','PRIVATE-TITLE','PRIVATE-URL-QUERY','PRIVATE-FILENAME','private-language-token','private.invalid'])assert(!newData.includes(value),value);
  for(const fn of [reportJSON,reportCSV,reportHTML])for(const value of ['PRIVATE-PROMPT-WORDING','PRIVATE-TITLE','PRIVATE-URL-QUERY','PRIVATE-FILENAME'])assert(!fn(combined).includes(value),value);
  assert(!Object.hasOwn(payload.filters,'search'));assert.equal(payload.filters.searchApplied,true);assert(payload.export.disclosures.some(d=>d.includes('wording is omitted')));
  const labels=exportPayload(combined,{includeLabels:true});assert(JSON.stringify(labels.explorer).includes('private-language-token'));assert(JSON.stringify(labels.explorer).includes('private.invalid'));assert.equal(labels.filters.search,'PRIVATE');
  // No archived wording is added by the independent label choice.
  assert(!JSON.stringify(labels.explorer).includes('PRIVATE-PROMPT-WORDING'));assert(!reportJSON(combined,{includeLabels:true}).includes('PRIVATE-TITLE'));
  const evidence=JSON.parse(reportJSON(combined,{includeEvidence:true,evidenceIds:['u1']}));assert.equal(evidence.evidence.length,1);assert.equal(evidence.evidence[0].text,'PRIVATE-PROMPT-WORDING');
});

test('captured-source history uses only actual immutable capture pairs and stays unavailable by default',()=>{
  const input=fixture(),base=buildExplorerReport(input,{timeZone:'UTC'}, {},{now});assert.equal(chart(base,'32-source-capture-diff').contract.state,'unavailable');assert.equal(chart(base,'32-source-capture-diff').rows.length,0);
  const previous=structuredClone(input),current=structuredClone(input);previous[0].rawHash='before';current[0].rawHash='after';previous[1].rawHash=current[1].rawHash='same';
  const result=buildExplorerReport(input,{timeZone:'UTC'}, {},{now,history:{enabled:true,previousCapture:{capturedAt:'2026-09-01',conversations:previous},currentCapture:{capturedAt:'2026-09-02',conversations:current}}});
  const diff=chart(result,'32-source-capture-diff');assert.equal(diff.contract.state,'ready');assert.equal(diff.rows.find(r=>r.change==='changed content hash').count,1);assert.equal(diff.rows.find(r=>r.change==='unchanged content hash').count,1);assert.equal(diff.contract.previousCapturedAt,'2026-09-01');
});
