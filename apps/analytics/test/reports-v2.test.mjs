import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'parse5';
import {buildReport} from '../src/core/metrics.mjs';
import {reportJSON,reportCSV,reportHTML,exportPayload} from '../src/core/reports.mjs';

function report() {
  const result=buildReport([],{timeZone:'UTC'},{now:Date.parse('2026-10-02T00:00:00Z')});
  result.explorer={versions:{application:'2.0.0',explorerSchema:'2.0.0',metricAlgorithm:'R7:2',normalizer:'2.0.0'},filters:{timeZone:'UTC',search:'PRIVATE-QUERY'},charts:[
    {id:'01-histogram',family:1,subview:'distributions',titleKey:'Lengths',columns:['lower','upper','upperUnbounded','count'],rows:[{lower:0,upper:10,upperUnbounded:false,count:2,evidenceKey:'private-drilldown',rankEvidenceKey:'private-rank-drilldown'},{lower:10,upper:null,upperUnbounded:true,count:1,evidenceKey:'private-drilldown2'}],contract:{unit:'Unicode code points',eligible:4,available:3,unavailable:1,algorithmVersion:'R7:2',reasonCounts:{'unobserved-text':1},filterScope:{search:'PRIVATE-QUERY',timeZone:'UTC'}},display:{kind:'histogram',x:'lower',value:'count'}},
    {id:'02-ecdf',family:2,subview:'distributions',titleKey:'ECDF',columns:['threshold','count','cumulative','denominator','fraction'],rows:[{threshold:3,count:2,cumulative:2,denominator:3,fraction:2/3},{threshold:21,count:1,cumulative:3,denominator:3,fraction:1}],contract:{eligible:4,available:3,unavailable:1},display:{kind:'ecdf'}},
    {id:'17-domains',family:17,subview:'relationships',titleKey:'References',columns:['domain','source','target','count','url','filename','promptWording'],rows:[{domain:'private.invalid',source:'private.invalid',target:'other-private.invalid',count:7,url:'https://private.invalid/?PRIVATE-FULL-URL',filename:'PRIVATE-FILENAME.txt',promptWording:'PRIVATE-PROMPT'}],privateColumns:['domain','source','target'],contract:{eligible:8,available:7,unavailable:1},display:{kind:'matrix'}},
    {id:'16-presence',family:16,subview:'relationships',titleKey:'Co-presence',columns:['dimension','source','target','joint','union','jaccard'],rows:[{dimension:'model',source:'model-A',target:'model-B',joint:1,union:2,jaccard:.5},{dimension:'language',source:'PRIVATE-LANGUAGE',target:'text',joint:1,union:1,jaccard:1}],privateColumns:['source','target'],privateColumnCondition:{dimension:'language'},contract:{eligible:2,available:2,unavailable:0},display:{kind:'matrix'}}
  ],warnings:[]};return result;
}

test('all three current serializers preserve exact chart bins, cumulative denominators, contracts and versions',()=>{
  const original=report(),payload=JSON.parse(reportJSON(original));
  const histogram=payload.explorer.charts[0],ecdf=payload.explorer.charts[1];
  assert.deepEqual(histogram.rows,[{lower:0,upper:10,upperUnbounded:false,count:2},{lower:10,upper:null,upperUnbounded:true,count:1}]);
  assert.deepEqual(ecdf.rows,original.explorer.charts[1].rows);assert.equal(histogram.contract.unavailable,1);assert.equal(histogram.contract.reasonCounts['unobserved-text'],1);
  assert.deepEqual(payload.explorer.versions,original.explorer.versions);assert.equal(payload.export.reportSchemaVersion,'2.0.0');
  const csv=reportCSV(original);assert(csv.includes('"table","explorer:01-histogram"'));assert(csv.includes('"0","10","false","2"'));assert(csv.includes('"threshold","count","cumulative","denominator","fraction"'));assert(csv.includes('"3","2","2","3","0.6666666666666666"'));
  const html=reportHTML(original);assert(html.includes('id="explorer-data"'));assert(html.includes('<td>0</td><td>10</td><td>false</td><td>2</td>'));assert(html.includes('<td>0.6666666666666666</td>'));assert(html.includes('R7:2'));
  for(const value of [reportJSON(original),csv,html]){assert(!value.includes('private-drilldown'));assert(!value.includes('private-rank-drilldown'));}
});

test('new private prompt/URL/filename/domain/language labels are neutral by default and explicit inclusion restores them',()=>{
  const original=report();
  for(const fn of [reportJSON,reportCSV,reportHTML]){
    const aggregate=fn(original);for(const value of ['PRIVATE-QUERY','PRIVATE-PROMPT','PRIVATE-FULL-URL','PRIVATE-FILENAME','private.invalid','other-private.invalid','PRIVATE-LANGUAGE'])assert(!aggregate.includes(value),value);
    const explicit=fn(original,{includeLabels:true});for(const value of ['PRIVATE-QUERY','PRIVATE-PROMPT','PRIVATE-FULL-URL','PRIVATE-FILENAME','private.invalid','PRIVATE-LANGUAGE'])assert(explicit.includes(value),value);
  }
  const payload=exportPayload(original),domain=payload.explorer.charts[2].rows[0];assert.equal(domain.source,domain.domain);assert.notEqual(domain.source,domain.target);assert.equal(domain.count,7);
  const model=payload.explorer.charts[3].rows[0];assert.equal(model.source,'model-A');assert.equal(model.target,'model-B');
  assert(payload.export.disclosures.some(v=>v.includes('wording is omitted')));assert(payload.privacy.legacyCategoryLabels.includes('not anonymous'));
  // Evidence inclusion never silently opts in to new chart labels.
  assert(!reportJSON(original,{includeEvidence:true}).includes('PRIVATE-PROMPT'));
});

test('legacy-compatible mode explicitly omits Explorer additions and preserves supported old numerical tables',()=>{
  const original=report(),payload=JSON.parse(reportJSON(original,{legacyCompatible:true}));
  assert.equal(payload.explorer,undefined);assert.equal(payload.export.mode,'legacy-compatible');assert.equal(payload.export.reportSchemaVersion,'1.0.0');
  assert.deepEqual(payload.summary,exportPayload(original).summary);assert.deepEqual(payload.tables,exportPayload(original).tables);
  assert(payload.export.disclosures.some(v=>v.includes('neither a lossless downgrade nor an application-state backup')));
  assert(!reportCSV(original,{mode:'legacy'}).includes('explorer:01-histogram'));assert(!reportHTML(original,{legacyCompatible:true}).includes('id="explorer-data"'));
});

test('opt-in HTML evidence uses safe shared Markdown with literal archived HTML and zero loading attributes',()=>{
  const original=report();original.evidence=[{id:'e1',title:'Synthetic evidence',category:'response',sourceId:'synthetic',model:'model-A',text:'# Heading\n\n**Strong** [link](https://track.invalid/pixel) ![image](https://track.invalid/image)\n\n<script>alert(1)</script>\n\n~~~python\nprint("hello")\n~~~\n',provenance:'/synthetic/message',classification:'original',textTruncated:true,fullTextCharacters:100}];
  const html=reportHTML(original,{includeEvidence:true,codeTheme:'nord'});
  assert(html.includes('<h1>Heading</h1>'));assert(html.includes('<strong>Strong</strong>'));assert(html.includes('Image omitted'));assert(html.includes('hljs-built_in'));assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));assert(!html.includes('<script>'));assert(html.includes('--syntax-keyword:#4c6290;'));
  const document=parse(html),elements=[];const visit=node=>{if(node.tagName)elements.push(node);for(const child of node.childNodes||[])visit(child);};visit(document);
  assert(!elements.some(e=>['img','script','iframe','form','svg','math'].includes(e.tagName)&&e.tagName!=='svg'));
  for(const element of elements)for(const attr of element.attrs||[]){assert(!/^on/.test(attr.name));if(['src','href'].includes(attr.name))assert(attr.value.startsWith('#')||attr.value.startsWith('data:image/svg+xml,'),attr.value);}
  assert(html.includes('Evidence excerpt; original full-text measurements remain unchanged.'));
  assert(!reportHTML(original).includes('Synthetic evidence'));
});

test('CSV formula safety and table IDs also cover new exact chart data and hostile source strings',()=>{
  const original=report();original.explorer.charts=[{id:'safe-chart',family:1,titleKey:'Literal title',columns:['model','count'],rows:[{model:'=SUM(1,2)',count:-3}],contract:{},display:{}}];original.tables['\"><img src=x onerror=alert(1)>']=[{label:'<button data-action="clear-cache">',count:2}];
  const csv=reportCSV(original);assert(csv.includes('"\'=SUM(1,2)","-3"'));
  const html=reportHTML(original);assert(!html.includes('<img'));assert(!html.includes('<button'));assert(html.includes('&lt;button data-action=&quot;clear-cache&quot;&gt;'));
});

test('unknown saved filter values remain internal and are explicitly unapplied rather than leaking nested wording',()=>{
  const filters={timeZone:'UTC',futureFilter:{text:'PRIVATE-UNKNOWN-FILTER-WORDING',nested:{value:'PRIVATE-NESTED-UNKNOWN-VALUE'}}};
  const original=buildReport([],filters),raw=structuredClone(filters);original.explorer={versions:{application:'2.0.0'},filters,filterStatus:'partial',unsupportedFilterKeys:['futureFilter'],charts:[{id:'unknown-filter-test',family:1,columns:[],rows:[],contract:{filterScope:filters,sourceMetadata:{title:'PRIVATE-SOURCE-METADATA-TITLE',excerpt:'PRIVATE-SOURCE-METADATA-EXCERPT'}},display:{}}]};
  for(const fn of [reportJSON,reportCSV,reportHTML])for(const text of ['PRIVATE-UNKNOWN-FILTER-WORDING','PRIVATE-NESTED-UNKNOWN-VALUE','PRIVATE-SOURCE-METADATA-TITLE','PRIVATE-SOURCE-METADATA-EXCERPT'])assert(!fn(original).includes(text),text);
  const payload=exportPayload(original);assert.deepEqual(payload.filters.futureFilter,{status:'unapplied',valueOmitted:true});assert.deepEqual(payload.explorer.charts[0].contract.filterScope.futureFilter,{status:'unapplied',valueOmitted:true});assert.equal(payload.explorer.filterStatus,'partial');assert.deepEqual(filters,raw);
  assert(reportJSON(original,{includeLabels:true}).includes('PRIVATE-UNKNOWN-FILTER-WORDING'));
});
