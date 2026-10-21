import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {renderExplorer,explorerControlSchema} from '../src/ui/explorer.mjs';
import {dictionaries,translator,translateExplorerValue} from '../src/ui/i18n.mjs';
import {syntheticConversations,createSyntheticBridge} from '../src/ui/demo.mjs';
import {buildExplorerReport} from '../src/core/explorer.mjs';
const basic={eligible:2,available:2,unavailable:0,state:'ready',unit:'test',algorithmVersion:'test:1'};
function markup(chart,controls={}){return renderExplorer({report:{explorer:{charts:[{titleKey:'explorer.chart'+String(chart.family).padStart(2,'0'),contract:basic,...chart}]}},subview:chart.subview||'distributions',selectedChart:chart.id,config:{chartControls:{[chart.id]:controls}},pages:{},queries:{},t:translator('en'),formatNumber:v=>typeof v==='number'?String(v):'Unavailable',label:v=>String(v??'Unavailable')});}
const svg=html=>html.match(/<svg[\s\S]*?<\/svg>/)?.[0]||'';
test('ECDF uses actual threshold/fraction, excluding histogram and unrelated populations',()=>{
 const html=markup({id:'01-length-histogram',family:1,subview:'distributions',display:{kind:'histogram',x:'lower',y:'count',ecdfX:'threshold',ecdfY:'fraction'},columns:['population','kind','threshold','fraction'],rows:[{kind:'histogram',population:'response',lower:0,count:2},{kind:'ecdf',population:'response',threshold:10,fraction:.5},{kind:'ecdf',population:'response',threshold:20,fraction:1},{kind:'ecdf',population:'user',threshold:200,fraction:1}]},{presentation:'ecdf',category:'response'});
 const drawing=svg(html);assert.match(drawing,/data-row-index="1"[^>]*cx="404" cy="113"/);assert.match(drawing,/data-row-index="2"[^>]*cx="736" cy="16"/);assert.doesNotMatch(drawing,/data-row-index="0"|data-row-index="3"/);assert.match(html,/Displayed observations: 2 \/ 2/);
});
test('Unavailable scatter values are absent marks while an explicitly observed zero is valid',()=>{
 const html=markup({id:'24-request-input-output',family:24,subview:'sequences',columns:['input','output'],display:{kind:'scatter',x:'input',y:'output'},rows:[{input:10,output:20,count:1},{input:null,output:20,count:1},{input:0,output:0,count:1}]});
 assert.equal((svg(html).match(/<circle/g)||[]).length,2);assert.doesNotMatch(svg(html),/data-row-index="1"/);assert.match(html,/<td>Unavailable<\/td>/);assert.match(svg(html),/data-row-index="2"/);
});
test('Box plot renders genuine quartiles and no invented zero for a missing group',()=>{
 const html=markup({id:'02-length-box',family:2,subview:'distributions',display:{kind:'box',x:'group',y:'median'},columns:['group','q1','median','q3'],rows:[{group:'A',minimum:0,q1:5,median:10,q3:15,maximum:20,n:4},{group:'B',minimum:null,q1:null,median:null,q3:null,maximum:null,n:0}]});
 assert.match(svg(html),/width="332" height="12"/);assert.doesNotMatch(svg(html),/data-row-index="1"/);assert.match(html,/Unavailable/);
});
test('Retained parent graph draws actual edges, alternatives and no fabricated category ladder',()=>{
 const html=markup({id:'20-retained-node-graph',family:20,subview:'sequences',display:{kind:'graph'},columns:['source','target','selected'],rows:[{source:'Node 1',target:'Node 2',selected:true},{source:'Node 1',target:'Node 3',selected:false}]});
 assert.match(svg(html),/explorer-graph-edge alternative/);assert.match(svg(html),/L[\d.]+,[\d.]+/);assert.doesNotMatch(svg(html),/explorer-guide/);
});
test('Lifecycle lanes use recorded interval endpoints to scale bar widths',()=>{
 const html=markup({id:'23-lifecycle-lanes',family:23,subview:'sequences',display:{kind:'lanes',x:'start',y:'task'},columns:['task','start','end'],rows:[{task:'Task 1',start:1000,end:1500},{task:'Task 2',start:1000,end:2000}]});
 assert.match(svg(html),/width="332" height="12"/);assert.match(svg(html),/width="664" height="12"/);assert.match(svg(html),/1970-01-01T00:00:01.000Z/);
});
test('Reply position bands render Q1/Q3 and signed shifts remain within axes',()=>{
 const band=markup({id:'11-response-position',family:11,subview:'sequences',display:{kind:'band',x:'ordinal',y:'median'},columns:['ordinal','q1','median','q3'],rows:[{ordinal:1,q1:10,median:20,q3:30},{ordinal:2,q1:20,median:30,q3:50}]});assert.match(svg(band),/<polygon[^>]*class="explorer-band"/);
 const shift=markup({id:'26-distribution-shifts',family:26,subview:'compare',display:{kind:'line',x:'quantile',y:'shift'},columns:['quantile','shift'],rows:[{quantile:0,shift:-10},{quantile:1,shift:10}]});
 for(const match of svg(shift).matchAll(/ cy="([\d.-]+)"/g))assert(+match[1]>=16&&+match[1]<=210);
});
test('Hourly heatmap retains all 168 cells despite a bounded mark preference',()=>{
 const rows=Array.from({length:168},(_,i)=>({weekday:Math.floor(i/24),hour:i%24,count:i%3}));const html=markup({id:'07-weekday-hour',family:7,subview:'sequences',display:{kind:'heatmap',x:'hour',y:'weekday',value:'count'},columns:['weekday','hour','count'],rows},{topN:20});assert.equal((svg(html).match(/<rect/g)||[]).length,168);assert.match(html,/168 \/ 168/);assert.equal((html.match(/<tr class="selectable"/g)||[]).length,50);
});
test('All Explorer families, schema columns, definitions and controls have five translated catalogs',()=>{
 const charts=buildExplorerReport(syntheticConversations(),{}).charts;
 for(const locale of ['en','hu','de','fr','ja']){const t=translator(locale);for(const chart of charts){assert.notEqual(t(chart.titleKey),chart.titleKey);assert.notEqual(t('explorer.method'+String(chart.family).padStart(2,'0')),'explorer.method'+String(chart.family).padStart(2,'0'));for(const field of chart.columns){const key='explorer.column.'+field;assert(t(key)!==key||t(field)!==field||['a','b','q1','q3'].includes(field),'Missing column '+field+' '+locale);}for(const [key,values]of explorerControlSchema(chart.family)){assert.notEqual(t('explorer.control.'+key),'explorer.control.'+key);for(const value of values)assert.notEqual(t('explorer.value.'+value),'explorer.value.'+value);}}}
 assert.equal(translateExplorerValue('ja','Node 2'),'保存されたノード 2');assert.deepEqual(Object.keys(dictionaries.en),Object.keys(dictionaries.ja));
});
test('Preview bridge persists presets separately, history disabled by default and selected active capture preserved',async()=>{
 const bridge=createSyntheticBridge();const state=await bridge.bootstrap();assert.equal(state.settings.history.enabled,false);assert.equal((await bridge.captureHistory()).captures.length,1);await bridge.saveExploration({id:'test-preset',name:'Synthetic test',filters:{extensionFilter:1},explorer:{chartControls:{}}});assert.equal((await bridge.bootstrap()).savedViews.length,0);assert.equal((await bridge.bootstrap()).explorationPresets[0].filters.extensionFilter,1);await bridge.updateSettings({...state.settings,history:{enabled:true,maxCaptures:1,maxBytes:134217728}});await bridge.refresh();const history=await bridge.captureHistory();assert.equal(history.captures.length,2);assert(history.captures[0].active);const diff=await bridge.compareCaptureHistory('synthetic-archive',history.captures[0].id,history.captures[1].id);assert.equal(diff.metricVersion,'capture-diff:1');assert.equal(diff.summary.changed,0);await bridge.removeCaptureHistory('synthetic-archive',history.captures[1].id);assert.equal((await bridge.captureHistory()).captures.length,1);
});
test('Source text is escaped and only trusted evidence commands can be rendered in Explorer tables',()=>{
 const html=markup({id:'30-diagnostic-profile',family:30,subview:'observability',columns:['diagnostic','count'],rows:[{diagnostic:'<img src="https://example.org/x" onerror="bad()">',count:1}]});assert.doesNotMatch(html,/<img|onerror="bad/);assert.match(html,/&lt;img/);
});
test('Graph styles avoid filled axis triangles and support keyboard evidence activation',async()=>{
 const css=await fs.readFile(new URL('../src/ui/style.css',import.meta.url),'utf8'),app=await fs.readFile(new URL('../src/ui/app.js',import.meta.url),'utf8');assert.match(css,/\.explorer-axis\{fill:none;stroke:/);assert.match(css,/\.explorer-controls\{display:flex;flex-wrap:wrap/);assert.match(app,/data-action="explorer-evidence"/);
});
