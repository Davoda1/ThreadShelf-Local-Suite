// Regression coverage for chat-derived fixtures, not a complete account export.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {normalizeChart, exactChartValue, CHART_LIMITS} from '../src/reader/rich-charts.js';
import {prepareRichMarkdown} from '../src/reader/rich-parser.js';
import {exportedFixtures, readerFixtures, fixtureById, genuiMessage, readerMessage, fixtureLiteral} from './fixtures/chart-compatibility.mjs';
const copy = value => structuredClone(value);
const content = id => copy(fixtureById(id).payload.charts_widget_v2.content);
const wrapped = payload => [...prepareRichMarkdown(genuiMessage(payload)).records.values()];
const adapt = payload => { const nodes=wrapped(payload); assert.equal(nodes.length,1); assert.equal(nodes[0].tag,'Chart'); return normalizeChart(nodes[0].attrs.content,{family:nodes[0].family}); };
const widget = c => adapt({charts_widget_v2:{content:c}});
const hash = value => createHash('sha256').update(fixtureLiteral(value)).digest('hex');

for (const fixture of exportedFixtures) test(`${fixture.id}: original native GenUI envelope reaches supported adapter without rewriting`,()=>{
  const before=hash(fixture.payload), source=genuiMessage(fixture.payload), nodes=wrapped(fixture.payload);
  assert.equal(nodes[0].source,source); assert.equal(nodes[0].family,'charts_widget_v2');
  const result=adapt(fixture.payload); assert.equal(result.ok,true,result.reason);
  assert.equal(result.chart.type,fixture.payload.charts_widget_v2.content.chartType);
  assert.equal(hash(fixture.payload),before);
});

test('native counts, percentages, signs and horizontal bounds retain exact semantics',()=>{
  const c01=widget(content('C01')).chart;assert.deepEqual(c01.series[0].values,[40,52,53]);assert.deepEqual(c01.yDomain,{min:0,max:60});assert.equal(c01.orientation,'vertical');
  const c02=widget(content('C02')).chart;assert.deepEqual(c02.series[0].values,[52.3,70.5,72.6]);assert.deepEqual(c02.yDomain,{min:0,max:100});assert.equal(c02.numericAxisSuffix,'%');assert.equal(exactChartValue(c02.series[0].values[1],c02.series[0],c02.yAxis),'70.5%');
  const c03=widget(content('C03')).chart;assert.deepEqual(c03.series[0].values,[-2.5,0,3.125]);assert.deepEqual(c03.yDomain,{min:-3,max:4});
  const c04=widget(content('C04')).chart;assert.equal(c04.orientation,'horizontal');assert.deepEqual(c04.categories,['Alpha','Beta','Gamma']);assert.equal(c04.numericAxisSuffix,'%');assert.equal(exactChartValue(c04.series[0].values[1],c04.series[0]),'71%');assert.deepEqual(c04.yDomain,{min:0,max:100});
});

test('native line series/order and numeric scatter preserve zeros, fractions and identity',()=>{
  const line=widget(content('C05')).chart;assert.deepEqual(line.series.map(s=>s.label),['Series A','Series B']);assert.deepEqual(line.series.map(s=>s.values),[[1.25,0,3.125,2.5],[0,1,2,4]]);assert.deepEqual(line.yDomain,{min:0,max:4});
  const scatter=widget(content('C09')).chart;assert.equal(scatter.categories,undefined);assert.equal(scatter.categoryLabel,undefined);assert.equal(scatter.xAxis.label,'x');assert.deepEqual(scatter.series[0].points,[{x:.5,y:-2.5},{x:2,y:3.125},{x:4.5,y:1.25}]);assert.deepEqual(scatter.xDomain,{min:.5,max:4.5});assert.equal(scatter.series[0].points.some(p=>Object.hasOwn(p,'label')),false);
  const two=content('C09');two.series.push({dataKey:'z',label:'Probe B'});two.data.forEach((r,i)=>r.z=i);assert.deepEqual(widget(two).chart.series[1].points,[{x:.5,y:0},{x:2,y:1},{x:4.5,y:2}]);
});

test('widget pie is locally presented as ring without changing source type/raw values',()=>{
  const c=content('C07'), before=hash(c), r=widget(c).chart;
  assert.equal(r.type,'pie');assert.equal(r.circularPresentation,'ring');assert.deepEqual(r.series[0].values,[6,3,1]);assert.equal(hash(c),before);assert.equal(c.chartType,'pie');assert.equal(Object.hasOwn(c,'circularPresentation'),false);
  for(const id of ['R05','R06']){const own=fixtureById(id).content,r=normalizeChart(own);assert.equal(r.ok,true);assert.equal(r.chart.type,own.type);assert.equal(r.chart.circularPresentation,undefined);}
});

test('series suffix, explicit empty suffix and explicit unit override chart inheritance',()=>{
  const c=content('C02');
  for(const [override, expected] of [[{},'70.5%'],[{valueSuffix:' ms'},'70.5 ms'],[{valueSuffix:''},'70.5'],[{unit:'V'},'70.5 V'],[{unit:''},'70.5']]){
    const v=copy(c);Object.assign(v.series[0],override);const r=widget(v);assert.equal(r.ok,true);assert.equal(exactChartValue(70.5,r.chart.series[0],r.chart.yAxis),expected);assert.equal(r.chart.numericAxisSuffix,expected.slice(4));
  }
  assert.equal(c.series[0].valueSuffix,undefined);
  for(const suffix of [1,0,null,{},['%']]){const v=copy(c);v.valueSuffix=suffix;assert.equal(widget(v).ok,false);}
  const empty=copy(c);empty.valueSuffix='';assert.equal(widget(empty).chart.series[0].valueSuffix,'');
});

test('shared numeric axis labels never borrow an incompatible series suffix or unit',()=>{
  const c=content('C05');c.valueSuffix='%';c.series[1].unit='V';let r=widget(c).chart;assert.equal(r.numericAxisSuffix,'');assert.equal(exactChartValue(1,r.series[0],r.yAxis),'1%');assert.equal(exactChartValue(1,r.series[1],r.yAxis),'1 V');
  c.series[1]={dataKey:'b',label:'Series B',valueSuffix:''};assert.equal(widget(c).chart.numericAxisSuffix,'');
  delete c.series[1].valueSuffix;assert.equal(widget(c).chart.numericAxisSuffix,'%');
  const own=copy(fixtureById('R03').content);own.series[1].unit='g';r=normalizeChart(own).chart;assert.equal(r.numericAxisSuffix,'');assert.equal(r.yAxis.unit,'kg');assert.equal(exactChartValue(1,r.series[0],r.yAxis),'1 kg');assert.equal(exactChartValue(1,r.series[1],r.yAxis),'1 g');
});

test('metadata and all source keys remain in preserved native source; no input mutation',()=>{
  const c=content('C01');c.meta={title:'<script>inert</script>',description:'**literal** {#each x as y}',footer:'Saved observation — not a live rate'};
  const before=hash(c), r=widget(c).chart;assert.equal(r.title,c.meta.title);assert.equal(r.description,c.meta.description);assert.equal(r.footer,c.meta.footer);assert.equal(r.categoryLabel,'category');assert.equal(r.series[0].dataKey,'count');assert.equal(hash(c),before);
});

for(const fixture of readerFixtures) test(`${fixture.id}: existing Reader-owned presentation through component message remains accepted`,()=>{
  const source=readerMessage(fixture.content), nodes=[...prepareRichMarkdown(source).records.values()];assert.equal(nodes.length,1);const r=normalizeChart(nodes[0].attrs.content);assert.equal(r.ok,true,r.reason);assert.equal(r.chart.type,fixture.content.type);
  if(fixture.id==='R01'||fixture.id==='R03')assert.equal(Object.is(r.chart.series[0].values[0],-0),true);
  if(fixture.id==='R04')assert.deepEqual(r.chart.series[0].values,[2,5,3,6]);
  if(fixture.id==='R06')assert.deepEqual(r.chart.series[0].values,[5,3,2]);
  if(fixture.id==='R07')assert.equal(r.chart.series[0].points[1].label,'P2');
});

test('native Chart and chart contracts accept evidenced types without adding unknown families',()=>{
  const c=content('C01');assert.equal(normalizeChart(c).ok,true);assert.equal(adapt({chart:{content:c}}).ok,true);
  const component=[...prepareRichMarkdown(`<Chart content={${fixtureLiteral(c)}}/>`).records.values()][0];assert.equal(normalizeChart(component.attrs.content).ok,true);
  for(const type of ['area','doughnut','scatter','horizontal-bar']){const v=copy(c);v.chartType=type;assert.equal(normalizeChart(v,{family:'Chart'}).ok,false);assert.equal(normalizeChart(v,{family:'chart'}).ok,false);}
  assert.equal(adapt({charts_widget_v2:{language:'recharts-json',content:content('C07')}}).ok,true);
});

test('unknown versions, unsupported chart semantics/layouts and unrecognized fields fall back',()=>{
  const mutations=[v=>v.version=3,v=>v.schema='unknown',v=>v.layout='horizontal',v=>v.layout='diagonal',v=>v.orientation='horizontal',v=>v.stacked=true,v=>v.stackOffset='expand',v=>v.series[0].stackId='a',v=>v.series[0].labelKey='name',v=>v.series[0].valueFormat='percent',v=>v.series[0].unit='V',v=>v.data[0].error=2,v=>v.data[0].label='P1',v=>v.yAxis={min:0},v=>v.xAxisMax=100,v=>v.meta={source:'unknown'},v=>v.valueSuffix=100];
  // A nonempty unit and suffix on the same series are conflicting semantics.
  const base=content('C04');for(const mutate of mutations){const v=copy(base);mutate(v);const r=widget(v);assert.equal(r.ok,false,fixtureLiteral(v));assert.deepEqual(JSON.parse(JSON.stringify(r.payload)),v);}
  for(const id of ['C05','C07','C09']){const v=content(id);v.layout='vertical';assert.equal(widget(v).ok,false);}
  for(const type of ['area','doughnut','horizontal-bar','radar']){const v=content('C01');v.chartType=type;assert.equal(widget(v).ok,false);}
  for(const extra of [{version:3},{language:'javascript'},{callback:'run'}])assert.equal(wrapped({charts_widget_v2:{content:content('C01'),...extra}}).length,0);
  const r=copy(fixtureById('R04').content);r.version=2;assert.equal(normalizeChart(r).ok,false);
});

test('nonnumeric cells, absent/ambiguous key mappings and clipping bounds retain bounded fallback',()=>{
  for(const value of ['70.5',null,true]){const c=content('C02');c.data[1].score=value;assert.equal(widget(c).ok,false);}
  for(const mutate of [v=>v.series.push({...v.series[0]}),v=>v.series[0].dataKey='category',v=>v.series[0].dataKey='',v=>v.xKey='',v=>delete v.data[1].score,v=>v.yAxisMax=70,v=>v.yAxisMin=10,v=>v.yAxisMin=v.yAxisMax,v=>v.yAxisMin='0']){const c=content('C02');mutate(c);assert.equal(widget(c).ok,false);}
  const scatter=content('C09');scatter.data[1].x='2';assert.equal(widget(scatter).ok,false);
  const pie=content('C07');pie.valueKey='another';assert.equal(widget(pie).ok,false);
});

test('circular zero/negative data and single positive slice are handled without fake shares',()=>{
  for(const values of [[0,0,0],[-1,3,1]]){const c=content('C07');c.data.forEach((r,i)=>r.value=values[i]);assert.equal(widget(c).ok,false);}
  const c=content('C07');c.data.forEach((r,i)=>r.value=i===1?3:0);const r=widget(c);assert.equal(r.ok,true);assert.deepEqual(r.chart.categories,['Alpha','Beta','Gamma']);assert.deepEqual(r.chart.series[0].values,[0,3,0]);
});

test('data-only snapshot rejects accessors, nonfinite/executable values, symbols and prototypes',()=>{
  let calls=0;const getter=content('C01');Object.defineProperty(getter,'data',{get(){calls++;return [];}});assert.equal(normalizeChart(getter,{family:'charts_widget_v2'}).ok,false);assert.equal(calls,0);
  for(const value of [NaN,Infinity,-Infinity,1e16,()=>0,1n,new Date()]){const c=content('C01');c.data[0].count=value;assert.equal(normalizeChart(c,{family:'charts_widget_v2'}).ok,false);}
  for(const key of ['__proto__','constructor','prototype']){const c=content('C01');Object.defineProperty(c,key,{enumerable:true,value:{inert:true}});assert.equal(normalizeChart(c,{family:'charts_widget_v2'}).ok,false);}
  const symbol=content('C01');symbol[Symbol('hidden')]='unknown semantics';assert.equal(normalizeChart(symbol,{family:'charts_widget_v2'}).ok,false);
  const cycle=content('C01');cycle.self=cycle;assert.equal(normalizeChart(cycle,{family:'charts_widget_v2'}).ok,false);
  const sparse=content('C01');delete sparse.data[1];assert.equal(normalizeChart(sparse,{family:'charts_widget_v2'}).ok,false);
});

test('size/node/depth budgets and missing rows do not become unbounded adapters',()=>{
  const c=content('C01');c.data=Array.from({length:CHART_LIMITS.rows+1},(_,i)=>({category:String(i),count:i}));assert.equal(normalizeChart(c,{family:'charts_widget_v2'}).reason,'limit');
  const max=content('C01');delete max.yAxisMax;max.series=Array.from({length:5},(_,i)=>({dataKey:'v'+i,label:'S'+i}));max.data=Array.from({length:200},(_,i)=>Object.fromEntries([['category',String(i)],...max.series.map(s=>[s.dataKey,i])]));assert.equal(widget(max).ok,true);max.series.push({dataKey:'v5'});max.data.forEach(row=>row.v5=1);assert.equal(normalizeChart(max,{family:'charts_widget_v2'}).reason,'limit');
  const large=content('C01');large.meta={title:'x'.repeat(CHART_LIMITS.string+1)};assert.equal(normalizeChart(large,{family:'charts_widget_v2'}).reason,'limit');
  const deep=content('C01');deep.unknown={};let at=deep.unknown;for(let i=0;i<CHART_LIMITS.depth+2;i++)at=at.next={};assert.equal(normalizeChart(deep,{family:'charts_widget_v2'}).reason,'limit');
  const empty=content('C01');empty.data=[];assert.equal(widget(empty).ok,false);
});

test('invalid fragments and malformed literals cannot swallow later valid siblings',()=>{
  const good=genuiMessage(fixtureById('C02').payload),bad=content('C01');bad.stacked=true;
  const source='Before\n\n'+genuiMessage({charts_widget_v2:{content:bad}})+'\n\n'+good+'\n\nAfter TS32-NATIVE-UI-END';const parsed=prepareRichMarkdown(source),nodes=[...parsed.records.values()];assert.equal(nodes.length,2);assert.equal(normalizeChart(nodes[0].attrs.content,{family:nodes[0].family}).ok,false);assert.equal(normalizeChart(nodes[1].attrs.content,{family:nodes[1].family}).ok,true);assert.match(parsed.content,/Before/);assert.match(parsed.content,/After TS32-NATIVE-UI-END/);
  for(const badLiteral of ['{"charts_widget_v2":{"content":window.desktop}}','{"charts_widget_v2":{"content":{"chartType":"bar","data":NaN}}}','{"charts_widget_v2":{"content":{"__proto__":{}}}}','{"charts_widget_v2":{"content":{"a":1,"a":2}}}']){const result=prepareRichMarkdown('genui'+badLiteral+'\n\n'+good);assert.equal(result.records.size,1);assert.match(result.content,/genui/);}
});

test('fenced JSON and native envelopes in code remain literal; passive data is preserved',()=>{
  const f=fixtureById('C02'), msg=genuiMessage(f.payload);
  for(const source of ['```json\n'+fixtureLiteral(f.payload)+'\n```','```text\n'+msg+'\n```','`'+msg+'`','    '+msg+'\n','| Category | Value |\n|---|---|\n| Alpha | 52.3 |','[Interactive visualization not included in this export.]','Saved as of 2026-10-12: 1 USD = 315.68 HUF — not a live rate.']){const r=prepareRichMarkdown(source);assert.equal(r.records.size,0);assert.equal(r.content,source);}
  assert.equal(wrapped({suggest_automation:{label:'Archived suggestion'}})[0].kind,'passive');assert.equal(wrapped({citation:{ref:'turn1view0'}})[0].tag,'Cite');assert.equal(wrapped({map_widget:{points:[{name:'Saved place',category:'Saved',ref:'turn1business0'}]}})[0].kind,'passive');
});
