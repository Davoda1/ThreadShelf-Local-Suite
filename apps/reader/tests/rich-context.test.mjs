import test from 'node:test';
import assert from 'node:assert/strict';
import {createRichContextResolver} from '../src/reader/rich-context.js';
const item = (url, turn=4, index=2) => ({url,title:'Saved source',refs:[{turn_index:turn,ref_type:'search',ref_index:index}]});
const make = items => ({raw:{mapping:{node:{message:{id:'message',metadata:{content_references:[{type:'grouped_webpages',items}]}}}}},turns:[{ai:'Text',source_node_id:'node',source_message_id:'message'}]});
test('citation metadata uses exact source identity and explicit recorded tuples without mutation',()=>{
  const thread=make([item('https://example.com/a')]), before=JSON.stringify(thread);
  const resolve=createRichContextResolver(thread), context=resolve(thread.turns[0]);
  assert.equal(context.references.turn4search2.url,'https://example.com/a');
  assert.equal(JSON.stringify(thread),before);assert.ok(Object.isFrozen(context.references));
  assert.equal(Object.keys(resolve({source_message_id:'wrong',source_node_id:'node'}).references).length,0);
  assert.equal(Object.keys(resolve({source_message_id:'message',source_node_id:'missing'}).references).length,0);
  assert.equal(Object.keys(resolve({}).references).length,0);
});
test('missing metadata, list-only sources, unsafe URLs, conflicts and unknown tuple types do not invent bindings',()=>{
  for(const url of ['javascript:alert(1)','file:///tmp/data','https://user:secret@example.com','https://example.com/\n']){
    const t=make([item(url)]); assert.equal(Object.keys(createRichContextResolver(t)(t.turns[0]).references).length,0);
  }
  const t=make([item('https://example.com/a'),item('https://example.com/b')]);
  assert.equal(Object.keys(createRichContextResolver(t)(t.turns[0]).references).length,0);
  const s=make([{url:'https://example.com/a',title:'No ref binding'}]);
  assert.equal(Object.keys(createRichContextResolver(s)(s.turns[0]).references).length,0);
  assert.equal(Object.keys(createRichContextResolver({turns:[{ai:'server text'}]})({}).references).length,0);
});
test('duplicate source IDs, inherited fields and accessor fields are not read as bindings',()=>{
  const t=make([item('https://example.com/a')]);t.raw.mapping.other=structuredClone(t.raw.mapping.node);
  const resolve=createRichContextResolver(t);
  assert.equal(Object.keys(resolve({source_message_id:'message'}).references).length,0);
  assert.equal(Object.keys(resolve(Object.create(t.turns[0])).references).length,0);
  const hostile={};Object.defineProperty(hostile,'raw',{get(){throw new Error('getter ran')}});
  assert.equal(Object.keys(createRichContextResolver(hostile)({}).references).length,0);
});
test('query-only images and list-only sources never acquire an invented citation or image binding',()=>{
  const t=make([]),md=t.raw.mapping.node.message.metadata;
  md.content_references=[{type:'client_defined_widget',alt:null,prompt_text:null},{type:'sources_footnote',sources:[]}];
  md.view_state={};md.search_result_groups=[{domain:'example.com',entries:[{title:'A matching-looking title',url:'https://example.com/source',thumbnail_url:'https://example.com/unrelated.jpg'}]}];
  t.raw.mapping.other={message:{id:'other',metadata:{content_references:[{type:'grouped_webpages',items:[item('https://example.com/other')]}]}}};
  const before=JSON.stringify(t),context=createRichContextResolver(t)(t.turns[0]);
  assert.equal(Object.keys(context.references).length,0);
  assert.equal(context.images,undefined);assert.equal(JSON.stringify(t),before);
});
