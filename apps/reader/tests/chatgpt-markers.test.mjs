import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRichMarkdown} from '../src/reader/rich-parser.js';
import {createRichContextResolver} from '../src/reader/rich-context.js';
import {normalizeChart} from '../src/reader/rich-charts.js';
const records=source=>[...prepareRichMarkdown(source).records.values()];

test('native web and file citation tokens preserve exact references and line ranges',()=>{
 const citation='citeturn0search1turn3view2',file='fileciteturn2file0L12-L19';
 const nodes=records('Saved source '+citation+' and '+file+'.');
 assert.equal(nodes.length,2);assert.deepEqual(nodes[0].refs,['turn0search1','turn3view2']);
 assert.deepEqual(nodes[1].refs,['turn2file0']);assert.deepEqual(nodes[1].lines,['L12-L19']);
 assert.equal(nodes[0].source,citation);assert.equal(nodes[1].source,file);
 for(const malformed of ['cite','citebad id','fileciteL12-L19','citeturn0search1'])assert.equal(records(malformed).length,0);
});

test('native tokens and GenUI remain literal in Markdown examples, links, escapes and math',()=>{
 for(const marker of ['citeturn0search0','fileciteturn1file0','genui{"unknown":{"label":"Example"}}']) {
  for(const source of ['`'+marker+'`','```text\n'+marker+'\n```','    '+marker+'\n','[Example '+marker+'](https://example.com)','\\'+marker,'\\('+marker+'\\)'])assert.equal(records(source).length,0,source);
 }
});

test('native entity labels are data; unknown and changed GenUI schemas retain their original source',()=>{
 const entity=records('entity["company","<img onerror=bad>","Saved description"]')[0];
 assert.equal(entity.tag,'Entity');assert.equal(entity.attrs.value,'<img onerror=bad>');
 for(const marker of ['genui{"unknown":{"label":"Example","script":"alert(1)"}}','genui{"chart":{"content":{},"version":9}}','genui{"suggest_automation":{"label":"Example","action":"run"}}','iturn0image0turn0image1','navlistSaved sourcesturn0search0;A saved title','new_future_widget{"title":"Example"}']) {
  const node=records(marker)[0];assert.equal(node.kind,'archived-widget');assert.equal(node.source,marker);
 }
 for(const marker of ['genui{"unknown":{"__proto__":{}}}','genui{"unknown":window.desktop}'])assert.equal(records(marker).length,0);
});

test('explicit metadata identities resolve without positional lookup and unsafe links remain unavailable',()=>{
 const message={id:'m',metadata:{content_references:[
  {type:'grouped_webpages',items:[{url:'https://example.com/a',title:'Source',refs:['turn0search0']}]},
  {type:'file',ref_id:'turn2file0',filename:'Report.pdf'},
  {type:'file',ref_id:'unsafe',filename:'Unsafe.svg',url:'javascript:alert(1)'},
  {type:'file',filename:'No identity.pdf'},
  {type:'webpage',ref_id:'direct',title:'Direct',url:'https://example.com/direct'}
 ]}};
 const thread={raw:{mapping:{n:{message}}}},before=JSON.stringify(thread);
 const refs=createRichContextResolver(thread)({source_node_id:'n',source_message_id:'m'}).references;
 assert.equal(refs.turn0search0.url,'https://example.com/a');assert.equal(refs.turn2file0.filename,'Report.pdf');assert.equal(refs.turn2file0.url,null);
 assert.equal(refs.unsafe.url,null);assert.equal(refs.direct.url,'https://example.com/direct');assert.equal(refs.turn0file0,undefined);
 assert.equal(Object.keys(refs).length,4);assert.equal(JSON.stringify(thread),before);
});

test('native area and doughnut chart adapters use explicit types and retain exact values',()=>{
 const area={chartType:'area',xKey:'label',series:[{dataKey:'value',valueSuffix:' V'}],data:[{label:'A',value:-2.5},{label:'B',value:3.125}]};
 const result=normalizeChart(area);assert.equal(result.ok,true);assert.equal(result.chart.type,'area');assert.deepEqual(result.chart.series[0].values,[-2.5,3.125]);
 const ring={chartType:'doughnut',nameKey:'label',valueKey:'value',series:[{dataKey:'value'}],data:[{label:'A',value:2},{label:'B',value:3}]};
 assert.equal(normalizeChart(ring).ok,true);ring.data[0].value=-1;assert.equal(normalizeChart(ring).ok,false);
 area.stacked=true;assert.equal(normalizeChart(area).ok,false);
});
