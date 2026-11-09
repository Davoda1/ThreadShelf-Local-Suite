import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRichMarkdown} from '../src/reader/rich-parser.js';
import {grokAt, grokFenceAt, collectGrokCards, createGrokContextResolver, grokChartConfig, GROK_LIMITS} from '../src/reader/grok-renderer.js';
import {createRichContextResolver} from '../src/reader/rich-context.js';
const sample='<grok:render card_id="93cdac" card_type="citation_card" type="render_inline_citation"><argument name="citation_id">0</argument></grok:render>';
const records=source=>[...prepareRichMarkdown(source).records.values()].filter(n=>n.kind==='grok');
test('exact reported Grok XML becomes an inline reference with preserved IDs and markup',()=>{
 const [node]=records('Before '+sample+' after.');assert.equal(node.family,'citation_card');assert.deepEqual(node.ids,['93cdac']);assert.equal(node.args.citation_id,'0');assert.equal(node.source,sample);assert.equal(node.inline,true);
});
test('raw tags, URI-encoded DOM forms, groups and citation link targets normalize consistently',()=>{
 const cases=[['<grok-card data-id="id%20a" data-type="image_card" data-plain-type="render_searched_image" data-arg-caption="Hello%20world"></grok-card>','image_card','id a'],['<grok type="render_card" id="opaque" />','','opaque'],['<grok:richcontent type="finance_card" id="stock"></grok:richcontent>','finance_card','stock'],['<grok-card-list data-id="a%2Cb" data-type="citation_card_list"></grok-card-list>','citation_card_list','a'],['[](grok_render_citation_card_json={"cardIds":["a","b"]})','citation_card_list','a']];
 for(const [raw,family,id]of cases){const [node]=records(raw);assert.ok(node,raw);assert.equal(node.family,family);assert.equal(node.ids[0],id);assert.equal(node.source,raw);}
 assert.equal(records(cases[0][0])[0].args.caption,'Hello world');
});
test('code examples, escaped markers, unrelated HTML and math remain literal',()=>{
 for(const raw of ['```xml\n'+sample+'\n```','`'+sample+'`','    '+sample+'\n','\\'+sample,'<div>\n'+sample+'\n</div>','[example '+sample+'](https://example.org)','\\('+sample+'\\)','$x '+sample+'$'])assert.equal(records(raw).length,0,raw);
 const source='Examples:\n\n```xml\n'+sample+'\n```\n\nActual '+sample;
 assert.equal(records(source).length,1);assert.ok(prepareRichMarkdown(source).content.includes('```xml\n'+sample));
});
test('missing and malformed envelopes retain original source without swallowing later code',()=>{
 const opening='<grok:render card_type="future_card" card_id="unknown">',source=opening+'\n\n```js\nconst preserved=1;\n```\n\n'+sample;
 const found=records(source);assert.equal(found.length,2);assert.equal(found[0].incomplete,true);assert.equal(found[0].source,opening);assert.ok(prepareRichMarkdown(source).content.includes('const preserved=1;'));
 const bad='<grok:render card_type="image_card" card_id="a" card_id="b"></grok:render>';
 assert.equal(records(bad)[0].malformed,true);
 const hostile='<grok:render card_type="ui_card" onclick="alert(1)"><argument name="html"><![CDATA[<script>bad()</script>]]></argument></grok:render>';
 assert.equal(records(hostile)[0].args.html,'<script>bad()</script>');
});
test('metadata resolves exact retained card ID across observed container encodings',()=>{
 for(const key of ['cardAttachment','cardAttachmentsJson','card_attachments_json']){
  const card={id:'93cdac',cardType:'citation_card',url:'https://example.org/source',title:'Actual source'};
  const message={[key]:key==='cardAttachment'?JSON.stringify(card):JSON.stringify([card])},before=JSON.stringify(message);
  assert.equal(collectGrokCards(message)['93cdac'].url,card.url);assert.equal(JSON.stringify(message),before);
 }
 const collision={cardAttachment:[{id:'same',url:'https://example.org/a'},{id:'same',url:'https://example.org/b'}]};assert.equal(collectGrokCards(collision).same,undefined);
 assert.equal(Object.keys(collectGrokCards({cardAttachment:[{url:'https://example.org/no-id'}]})).length,0);
 const getter={id:'danger'};Object.defineProperty(getter,'url',{get(){throw new Error('Getter ran');}});assert.doesNotThrow(()=>collectGrokCards({cardAttachment:getter}));assert.equal(collectGrokCards({cardAttachment:getter}).danger,undefined);
 assert.equal(Object.keys(collectGrokCards({cardAttachment:'{"id":"bad","__proto__":{"x":1}}'})).length,0);
});
test('per-message metadata does not cross-bind duplicate IDs or citation numeric positions',()=>{
 const first={_id:'one',card_attachments_json:JSON.stringify([{id:'93cdac',url:'https://example.org/one'}])},second={response_id:'two',card_attachments_json:JSON.stringify([{id:'93cdac',url:'https://example.org/two'}])},thread={raw:{responses:[{response:first},{response:second}]}};
 const resolve=createRichContextResolver(thread);assert.equal(resolve({source_message_id:'one'}).grokCards['93cdac'].url,'https://example.org/one');assert.equal(resolve({source_message_id:'two'}).grokCards['93cdac'].url,'https://example.org/two');assert.equal(Object.keys(resolve({source_message_id:'missing'}).grokCards||{}).length,0);assert.equal(resolve({source_message_id:'one'}).grokCards['0'],undefined);
 thread.raw.responses.push({response:first});assert.equal(Object.keys(createGrokContextResolver(thread)({source_message_id:'one'}).grokCards).length,0);
});
test('Chart.js finite numeric subset retains semantics; unsupported callbacks, stacks and axes fall back',()=>{
 const cfg={type:'bar',data:{labels:['A','B'],datasets:[{label:'Measured',data:[-2,5],backgroundColor:'#123456'}]},options:{indexAxis:'y',plugins:{title:{display:true,text:'Saved chart'}}}};
 const before=JSON.stringify(cfg),chart=grokChartConfig(cfg);assert.equal(chart.orientation,'horizontal');assert.equal(chart.title,'Saved chart');assert.deepEqual(chart.series[0].values,[-2,5]);assert.equal(JSON.stringify(cfg),before);
 for(const extra of [{type:'radar'},{options:{scales:{y:{type:'logarithmic'}}}},{options:{scales:{y:{stacked:true}}}},{options:{plugins:{tooltip:{callbacks:{label:'evil()'}}}}},{options:{parsing:false}}])assert.equal(grokChartConfig({...cfg,...extra}),null);
 assert.equal(grokChartConfig({...cfg,data:{labels:['A'],datasets:[{data:[NaN]}]}}),null);
 assert.equal(grokChartConfig({...cfg,data:{labels:['A'],datasets:[{data:[1],hidden:true}]}}),null);
 assert.equal(grokChartConfig({type:'scatter',data:{datasets:[{data:[{x:1,y:2,r:3}]}]}}),null);
});
test('data fences require explicit complete language and preserve original code separately',()=>{
 const body='{"type":"line","data":{"labels":["A","B"],"datasets":[{"data":[1,2]}]}}',source='```chartjs\n'+body+'\n```\n';const node=grokFenceAt(source,0,source.length).node;
 assert.equal(node.source,source);assert.equal(node.codeSource,body);assert.equal(node.family,'chart_card');
 const task='~~~xaitask\n{"name":"Saved reminder","prompt":"Do not execute","cadence":"daily"}\n~~~';assert.equal(grokFenceAt(task,0,task.length).node.family,'automation_card');
 for(const raw of ['```js\n'+body+'\n```','```chartjs\nnot json\n```','```chartjs\n'+body])assert.equal(grokFenceAt(raw,0,raw.length),null);
});
test('artifacts and tool records remain passive source with Unicode intact',()=>{
 const artifact='<xaiArtifact artifact_id="a" artifact_version_id="v" title="漢字" contentType="text/html"><script>fetch("https://evil.test")</script><h1>Saved</h1></xaiArtifact>';
 const a=records(artifact)[0];assert.equal(a.family,'artifact');assert.equal(a.attrs.title,'漢字');assert.equal(a.body,'<script>fetch("https://evil.test")</script><h1>Saved</h1>');
 const tool='<xai:tool_usage_card><xai:tool_name>web_search</xai:tool_name><xai:tool_args><![CDATA[{"query":"saved"}]]></xai:tool_args></xai:tool_usage_card>';assert.equal(records(tool)[0].family,'tool_usage_card');
});
test('oversized and adversarial shapes are bounded without evaluating input',()=>{
 assert.equal(Object.keys(collectGrokCards({cardAttachment:'x'.repeat(GROK_LIMITS.span+1)})).length,0);
 const cycle={id:'cyclic'};cycle.data=cycle;assert.equal(collectGrokCards({cardAttachment:cycle}).cyclic,undefined);
 assert.equal(grokAt('<grok:render card_type="citation_card" card_id="a" />').node.ids[0],'a');
 assert.equal(grokChartConfig({type:'line',data:{labels:['a'],datasets:[{data:[1]}]},options:{scales:{y:{beginAtZero:true}}}}),null);
});

test('a closing envelope inside literal code cannot consume or destroy that code',()=>{
 for(const literal of ['```xml\n</grok:render>\n```','`</grok:render>`','    </grok:render>\n']) {
  const source='<grok:render card_id="a" card_type="citation_card">\n\n'+literal;
  const result=prepareRichMarkdown(source),found=[...result.records.values()].filter(n=>n.kind==='grok');assert.equal(found.length,1);assert.equal(found[0].incomplete,true);assert.ok(result.content.includes(literal));
 }
});

test('prototype names and hostile array accessors never supply presentation behavior',()=>{
 const result=grokAt('<grok type="constructor" id="x" />');assert.equal(result.node.family,'');
 const array=[];Object.defineProperty(array,'0',{get(){throw new Error('Array getter ran');}});array.length=1;
 assert.doesNotThrow(()=>collectGrokCards({cardAttachment:array}));
 assert.doesNotThrow(()=>createGrokContextResolver({raw:{responses:array}}));
});
