#!/usr/bin/env node
// All fixtures here are synthetic; no private export content is distributed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {CHART_LIMITS, normalizeChart, chartDomain, exactChartValue} from '../src/reader/rich-charts.js';
const bar = () => ({chartType:'bar',meta:{title:'Synthetic trials',description:'Recorded observations',footer:'Synthetic source'},xKey:'item',series:[{dataKey:'first',label:'Series A',valueFormat:'raw'},{dataKey:'second',label:'Series B',valueSuffix:' ms'}],yAxisMin:-5,yAxisMax:10,data:[{item:'Trial 1',first:-2.25,second:0},{item:'Trial 2',first:6.125,second:8}]});
const reader = (type='bar') => ({schema:'threadshelf-chart',version:1,type,categories:['A','B'],series:[{label:'Synthetic sample',values:[-2.5,3.125],unit:'V'}]});
test('evidenced bar contract retains order, units, metadata, bounds and input bytes',()=>{
  const input=bar(), before=JSON.stringify(input), r=normalizeChart(input);
  assert.equal(r.ok,true);assert.equal(JSON.stringify(input),before);
  assert.deepEqual(r.chart.categories,['Trial 1','Trial 2']);
  assert.deepEqual(r.chart.series.map(s=>s.values),[[-2.25,6.125],[0,8]]);
  assert.equal(r.chart.series[1].valueSuffix,' ms');
  assert.deepEqual(r.chart.yDomain,{min:-5,max:10});
  assert.equal(r.chart.description,'Recorded observations');assert.equal(r.chart.footer,'Synthetic source');
  assert.equal(normalizeChart(input,{family:'chart'}).ok,true);
  input.data[0].first=88;assert.equal(r.chart.series[0].values[0],-2.25);
});
test('pie adapter uses only evidenced nameKey/valueKey, retaining suffix without inventing percentages',()=>{
  const input={chartType:'pie',nameKey:'kind',valueKey:'amount',series:[{dataKey:'amount',label:'Count',valueFormat:'integer'}],data:[{kind:'A',amount:6},{kind:'B',amount:4}]};
  const r=normalizeChart(input,{family:'charts_widget_v2'});assert.equal(r.ok,true);
  assert.equal(own(r.chart.series[0],'valueSuffix'),false);assert.equal(exactChartValue(6,r.chart.series[0]),'6');
  assert.equal(normalizeChart(input).ok,true);
  input.valueKey='wrong';assert.equal(normalizeChart(input,{family:'charts_widget_v2'}).ok,false);
});
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
test('additional area and doughnut types require explicit Reader-owned v1 schema',()=>{
  for(const type of ['bar','line','area'])assert.equal(normalizeChart(reader(type)).ok,true,type);
  for(const type of ['pie','doughnut']){const v=reader(type);v.series[0].values=[1,3];assert.equal(normalizeChart(v).ok,true,type);}
  const v=reader();v.orientation='horizontal';assert.equal(normalizeChart(v).chart.orientation,'horizontal');
  for(const type of ['area','scatter','doughnut','horizontal-bar']){const v=bar();v.chartType=type;assert.equal(normalizeChart(v).ok,false,type);}
  const v2=reader();v2.version=2;assert.equal(normalizeChart(v2).ok,false);
});
test('scatter keeps unambiguous numeric coordinates and units',()=>{
  const v={schema:'threadshelf-chart',version:1,type:'scatter',title:'Synthetic points',xAxis:{label:'Time',unit:'s',min:0,max:10},yAxis:{label:'Voltage',unit:'V',min:-5,max:5},series:[{label:'A',points:[{x:1.25,y:-2.5,label:'First'},{x:9,y:3}]}]};
  const r=normalizeChart(v);assert.equal(r.ok,true);assert.deepEqual(r.chart.xDomain,{min:0,max:10});assert.deepEqual(r.chart.series[0].points,v.series[0].points);
  v.series[0].points[0].x='1.25';assert.equal(normalizeChart(v).ok,false);
});
test('negative bars and areas include zero; explicit clipping becomes data fallback',()=>{
  assert.deepEqual(chartDomain([-8,-3],{},true),{min:-8,max:0});
  assert.deepEqual(chartDomain([0,0],{},true),{min:0,max:1});
  const v=bar();v.yAxisMin=0;const r=normalizeChart(v);assert.equal(r.ok,false);assert.equal(r.reason,'bounds');assert.deepEqual(JSON.parse(JSON.stringify(r.payload)),v);
  assert.throws(()=>chartDomain([1,2],{min:1},true));
});
test('invalid or semantic feature inputs fall back faithfully',()=>{
  for(const mutate of [v=>v.stacked=true,v=>v.series[0].stackId='A',v=>v.series[0].valueFormat='percent',v=>v.data[0].first='3',v=>v.data[0].first=null,v=>v.data[0].first=1e16,v=>v.data[0].error=5,v=>v.meta.source='unknown']){const v=bar();mutate(v);const r=normalizeChart(v);assert.equal(r.ok,false);assert.deepEqual(JSON.parse(JSON.stringify(r.payload)),v);}
  const v=reader('pie');v.series[0].values=[-1,2];assert.equal(normalizeChart(v).ok,false);v.series[0].values=[0,0];assert.equal(normalizeChart(v).ok,false);
});
test('values are never rounded, scaled or coerced',()=>{
  assert.equal(exactChartValue(3.125,{valueFormat:'integer',valueSuffix:'%'}),'3.125%');
  assert.equal(exactChartValue(-0),'-0');assert.equal(exactChartValue(.00000012345,{unit:'V'}),'1.2345e-7 V');
  const r=normalizeChart(bar());assert.equal(own(r.chart.series[0],'unit'),false);assert.equal(own(r.chart.series[0],'valueSuffix'),false);
});
test('unsafe object properties, accessors and cycles never execute',()=>{
  let called=0;const v=bar();Object.defineProperty(v.meta,'footer',{enumerable:true,get(){called++;return 'bad';}});assert.equal(normalizeChart(v).ok,false);assert.equal(called,0);
  const bad=JSON.parse('{"chartType":"bar","__proto__":{"polluted":true}}');assert.equal(normalizeChart(bad).ok,false);assert.equal({}.polluted,undefined);
  const cycle=bar();cycle.self=cycle;assert.equal(normalizeChart(cycle).ok,false);
  const inherited=Object.create({data:[]});inherited.chartType='bar';assert.equal(normalizeChart(inherited).ok,false);
});
test('input budgets and missing cells stop independently',()=>{
  const v=bar();v.data=Array.from({length:CHART_LIMITS.rows+1},(_,i)=>({item:String(i),first:1,second:2}));assert.equal(normalizeChart(v).ok,false);
  const d=bar();d.meta.title='x'.repeat(CHART_LIMITS.string+1);assert.equal(normalizeChart(d).reason,'limit');
  const missing=bar();delete missing.data[0].second;assert.equal(normalizeChart(missing).ok,false);
  const sparse=bar();sparse.data.length=4;assert.equal(normalizeChart(sparse).ok,false);
  const safe=bar();safe.meta.title='<svg onload="window.bad=true">';assert.equal(normalizeChart(safe).chart.title,safe.meta.title);
});

test('explicit numeric axis units flow to categorical exact values without invented metadata',()=>{
  const v=reader();delete v.series[0].unit;v.yAxis={unit:'kg'};
  const r=normalizeChart(v);assert.equal(r.ok,true);
  assert.equal(exactChartValue(r.chart.series[0].values[0],r.chart.series[0],r.chart.yAxis),'-2.5 kg');
  assert.equal(own(r.chart.series[0],'unit'),false);
  assert.equal(exactChartValue(3.125,{},{}),'3.125');
  assert.equal(exactChartValue(3.125,{unit:'g'},{unit:'kg'}),'3.125 g');
  assert.equal(exactChartValue(3.125,{valueSuffix:'%'},{unit:'kg'}),'3.125%');
  assert.equal(exactChartValue(3.125,{valueSuffix:''},{unit:'kg'}),'3.125');
  const original=normalizeChart(bar());assert.equal(own(original.chart.yAxis,'unit'),false);
  assert.equal(exactChartValue(3.125,original.chart.series[0],original.chart.yAxis),'3.125');
});
