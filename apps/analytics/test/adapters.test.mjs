import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {normalizeConversations,normalizeTimestamp,reconcileConversations,ADAPTER_REGISTRY} from '../src/core/adapters.mjs';
import {chatgpt,claude,studio,venice,lmstudio,openrouter,grok,meta,gemini,normalized,mixedDocuments} from './fixtures/provider-fixtures.mjs';
const normalize=(v,o={})=>normalizeConversations(structuredClone(v),{sourceId:'synthetic-source',collectionId:'mixed',...o});
const one=(v,o)=>normalize(v,o).conversations[0];
const count=(c,k)=>c.records.filter(r=>r.category===k).length;

test('registry is explicit and versioned for every provider family',()=>{assert.equal(ADAPTER_REGISTRY.length,11);for(const a of ADAPTER_REGISTRY){assert.equal(a.version,'2.0.0');assert.ok(a.formats.length);assert.equal(typeof a.recognize,'function');}});
test('mixed collections dispatch each conversation, preserve models and unsupported neighbors',()=>{
  const result=normalize(mixedDocuments());assert.equal(result.conversations.length,10);
  assert.deepEqual(new Set(result.conversations.map(c=>c.provider)),new Set(['openai','anthropic','google-ai-studio','venice','lm-studio','openrouter','grok','meta','gemini']));
  assert.ok(result.conversations.every(c=>c.collectionIds.includes('mixed')));assert.ok(result.diagnostics.some(d=>d.code==='unsupported-format'));
  const chat=result.conversations.find(c=>c.format==='chatgpt-mapping');assert.deepEqual(new Set(chat.records.filter(r=>r.model!=='unknown').map(r=>r.model)),new Set(['model-A','model-B']));
});
test('ChatGPT reconstructs children from parents and preserves selected/all branches',()=>{
  const c=one(chatgpt);assert.equal(c.branches.branchPoints,1);assert.deepEqual(c.branches.alternativeNodes,['alternate']);assert.equal(c.records.filter(r=>r.selected).length,4);assert.equal(c.records.length,5);assert.equal(count(c,'thinking'),1);assert.equal(count(c,'recap'),1);assert.equal(count(c,'response'),2);assert.equal(c.records.find(r=>r.category==='user').timestamp,0);assert.ok(c.records.find(r=>r.nodeId==='answer').rawPath.endsWith('/content/parts/0'));
});
test('ChatGPT cycles, missing parents, fallback and duplicate message objects are diagnosed',()=>{
  const data={id:'bad-graph',current_node:'cycle-a',mapping:{'cycle-a':{parent:'cycle-b',message:{id:'same',author:{role:'assistant'},content:{parts:['First.']}}},'cycle-b':{parent:'cycle-a',message:{id:'b',author:{role:'assistant'},content:{parts:['Second.']}}},copy:{parent:'missing',message:{id:'same',author:{role:'assistant'},content:{parts:['First.']}}}}};
  const c=one(data);assert.ok(c.branches.cycles>0);assert.equal(c.branches.missingParents,1);assert.equal(new Set(c.records.map(r=>r.objectId)).size,2);assert.ok(c.diagnostics.some(d=>d.code==='duplicate-message-object'));
  data.current_node='invalid';assert.ok(one(data).diagnostics.some(d=>d.code==='selected-path-fallback'));
});
test('ChatGPT multimodal metadata and tool indicators never become consumed tokens or calls',()=>{
  const data={id:'media',mapping:{a:{parent:null,message:{id:'a',author:{role:'assistant'},metadata:{tool_icons:['browser'],attachments:[{id:'f',mime_type:'image/png',file_token_size:1000,size_bytes:123}]},content:{content_type:'multimodal_text',parts:['Text',{content_type:'image_asset_pointer',asset_pointer:'image',width:64,height:32}]}}}}};
  const c=one(data);assert.equal(count(c,'tool_call'),0);assert.ok(c.records.some(r=>r.toolIndicators.includes('browser')));assert.ok(c.records.some(r=>r.attachments.some(a=>a.fileTokenSize===1000)));assert.ok(c.records.every(r=>!r.usage));assert.equal(count(c,'other'),1);
});
test('ChatGPT explicit tool recipients remain calls, distinct from tool output',()=>{
  const data={id:'tools',current_node:'out',mapping:{call:{parent:null,message:{id:'call',author:{role:'assistant'},recipient:'python',content:{content_type:'code',text:'print(2)'}}},out:{parent:'call',message:{id:'out',author:{role:'tool',name:'python'},metadata:{tool_call_id:'call'},content:{content_type:'execution_output',text:'2'}}}}};
  const c=one(data);assert.equal(count(c,'tool_call'),1);assert.equal(count(c,'tool_output'),1);assert.equal(count(c,'response'),0);
});
test('Claude preserves object/block boundaries and redacted trace is unavailable',()=>{
  const c=one(claude);assert.equal(count(c,'user'),1);assert.equal(count(c,'response'),1);assert.equal(count(c,'thinking'),1);assert.equal(count(c,'redacted'),1);assert.equal(count(c,'tool_call'),1);assert.equal(count(c,'tool_output'),1);const redacted=c.records.find(r=>r.category==='redacted');assert.equal(redacted.observed,false);assert.equal(redacted.text,'');assert.equal(new Set(c.records.map(r=>r.objectId)).size,3);assert.equal(c.records.find(r=>r.category==='response').timestamp,null);assert.notEqual(c.createdAt,null);
});
test('Claude project snapshots recognize content.content and block models independently',()=>{
  const c=one({uuid:'project',project:{uuid:'p'},messages:[{id:'u',role:'user',content:{content:'Question'}},{id:'a',role:'assistant',content:{content:'Answer',contentBlocks:[{type:'thinking',thinking:'Plan'}]}}]});assert.equal(c.provider,'anthropic');assert.equal(count(c,'thinking'),1);
});
test('AI Studio groups same-role chunks without equating chunks to requests',()=>{
  const c=one(studio);assert.equal(count(c,'user'),3);assert.equal(count(c,'response'),3);assert.equal(count(c,'thinking'),1);assert.equal(new Set(c.records.filter(r=>r.category==='user').map(r=>r.logicalId)).size,2);assert.equal(new Set(c.records.filter(r=>r.category==='response').map(r=>r.logicalId)).size,2);assert.equal(new Set(c.records.map(r=>r.objectId)).size,7);
});
test('AI Studio Imagen preserves generated-image metadata rather than inventing response text',()=>{
  const c=one({id:'image',imagenPrompt:{imagenTurns:[{prompt:'A synthetic square',generatedImages:[{id:'image-1',width:32,height:32}]}]}});assert.equal(count(c,'user'),1);assert.equal(count(c,'response'),0);assert.ok(c.records.some(r=>r.generatedMedia&&r.attachments.length));
});
test('LM Studio retains selected and alternative versions plus execution steps',()=>{
  const c=one(lmstudio);assert.equal(c.versions.length,3);assert.equal(c.versions.filter(v=>!v.selected).length,1);assert.equal(count(c,'thinking'),1);assert.equal(count(c,'response'),2);assert.equal(c.records.filter(r=>r.category==='response'&&r.selected).length,1);assert.equal(new Set(c.records.filter(r=>r.category==='response').map(r=>r.logicalId)).size,1);assert.ok(c.records.some(r=>r.event?.type==='status'));
});
test('Venice agent mirrors reconcile; message/object/text/tool/search units remain distinct',()=>{
  const c=one(venice);assert.equal(count(c,'user'),1);assert.equal(count(c,'thinking'),1);assert.equal(count(c,'response'),1);assert.equal(count(c,'tool_call'),1);assert.equal(count(c,'tool_output'),1);assert.equal(c.records.filter(r=>r.event?.type==='search').length,1);assert.equal(new Set(c.records.map(r=>r.objectId)).size,2);assert.equal(c.diagnostics.filter(d=>d.code==='duplicate-agent-representation').length,5);assert.equal(c.records.find(r=>r.category==='tool_call').event.callId,c.records.find(r=>r.category==='tool_output').event.callId);assert.equal(c.records.find(r=>r.event?.type==='search').event.durationMs,1000);assert.ok(c.records.every(r=>!r.usage));assert.ok(c.records.some(r=>r.contextOccupancy?.totalTokens===500));
});
test('Venice identical call ids in distinct turns remain independently scoped',()=>{
  const data=structuredClone(venice),m=structuredClone(data.owners[0].conversations[0].messages[1]);m.id='other-agent';data.owners[0].conversations[0].messages.push(m);const c=one(data),calls=c.records.filter(r=>r.category==='tool_call');assert.equal(calls.length,2);assert.notEqual(calls[0].event.callId,calls[1].event.callId);
});
test('Venice provenance survives Grok-compatible conversion and original identities dedup',()=>{
  const raw=structuredClone(venice),conv=raw.owners[0].conversations[0];const converted={venice_conversion:{format:'venice-to-threadshelf-grok'},conversations:[{conversation:{id:conv.id,title:'Retitled synthetic',venice_owner_id:'synthetic-owner',venice_metadata:Object.fromEntries(Object.entries(conv).filter(([k])=>k!=='messages'))},responses:conv.messages.map(m=>({response:{_id:m.id,sender:m.role==='user'?'human':'ASSISTANT',message:m.content,venice_metadata:Object.fromEntries(Object.entries(m).filter(([k])=>k!=='content'))}}))}]};
  const native=one(raw),compat=one(converted);assert.equal(compat.provider,'venice');assert.equal(compat.id,native.id);assert.equal(compat.rawHash,native.rawHash);assert.equal(reconcileConversations([native,compat]).length,1);
});
test('Grok source envelope records genuine platform; unlabeled compatible shape stays unknown',()=>{
  assert.equal(one(grok).provider,'grok');const unknown=one(grok.conversations[0]);assert.equal(unknown.provider,'unknown');assert.ok(unknown.diagnostics.some(d=>d.code==='unknown-original-platform'));assert.equal(unknown.records.find(r=>r.category==='user').timestamp,0);assert.equal(count(unknown,'thinking'),1);
});
test('OpenRouter request usage is recorded independently of platform/model and absent fields',()=>{
  const c=one(openrouter),a=c.records.find(r=>r.category==='response');assert.equal(c.provider,'openrouter');assert.equal(a.model,'vendor/model');assert.equal(a.usage.scope,'request');assert.equal(a.usage.inputTokens,4);assert.equal(a.usage.outputTokens,5);assert.equal(a.usage.reasoningTokens,1);assert.equal(a.durationMs,250);assert.ok(!c.records.find(r=>r.category==='user').usage);
});
test('Meta speaker boundaries ignore labels within code fences and do not date messages',()=>{
  const c=one(meta);assert.equal(c.provider,'meta');assert.equal(count(c,'user'),1);assert.equal(count(c,'response'),1);assert.match(c.records.find(r=>r.category==='user').text,/inside code/);assert.equal(c.createdDate.datePrecision,'day');assert.ok(c.records.every(r=>r.timestamp===null&&r.model==='unknown'));
});
test('Gemini activity retains event granularity, day precision and missing response',()=>{
  const c=one(gemini);assert.equal(c.provider,'gemini');assert.equal(count(c,'user'),2);assert.equal(count(c,'response'),1);assert.ok(c.records.every(r=>r.logicalId===null));const day=c.records.find(r=>r.datePrecision==='day');assert.equal(day.dateValue,'2026-09-22');assert.equal(new Set(c.records.map(r=>r.activityId)).size,2);
});
test('normalized surviving records keep reduced coverage and source object associations',()=>{
  const c=one(normalized);assert.equal(c.coverage,'normalized');assert.equal(c.capabilities.originalRecords,false);assert.equal(count(c,'thinking'),1);assert.equal(count(c,'response'),1);assert.equal(c.records.find(r=>r.category==='thinking').objectId,c.records.find(r=>r.category==='response').objectId);assert.ok(c.limitations.some(v=>/original branches/.test(v)));
});
test('retained originals take precedence over normalized display copy',()=>{
  const c=one({provider:'openai',conversationKey:'key',raw:chatgpt,turns:[{user:'Normalized copy'}, {ai:'Normalized copy'}]});assert.equal(c.format,'chatgpt-mapping');assert.equal(c.records.length,5);assert.ok(!c.records.some(r=>r.text==='Normalized copy'));
});
test('equal provider ids from unrelated source instances never collide; exact copies preserve memberships',()=>{
  const a=one(chatgpt,{sourceId:'instance-A',collectionId:'one'}),b=one(chatgpt,{sourceId:'instance-B',collectionId:'two'});assert.notEqual(a.id,b.id);const duplicate=one(chatgpt,{sourceId:'instance-A',collectionId:'three'});const combined=reconcileConversations([a,duplicate]);assert.equal(combined.length,1);assert.deepEqual(combined[0].collectionIds,['one','three']);
});
test('conflicting native identities remain reviewable, genuine repeated prompts persist',()=>{
  const changed=structuredClone(chatgpt);changed.mapping.prompt.message.id='p2';changed.mapping.prompt.message.content.parts=['Explain a tiny example.'];const result=normalize([chatgpt,changed]);assert.equal(result.conversations.length,2);assert.ok(result.diagnostics.some(d=>d.code==='ambiguous-conversation-identity'));assert.equal(new Set(result.conversations.flatMap(c=>c.records).map(r=>r.id)).size,10);assert.ok(result.conversations.every(c=>c.records.every(r=>r.id.startsWith(c.id+':')&&r.objectId.startsWith(c.id+':'))));
});
test('timestamp strictness supports offsets, epoch zero, day precision and invalid dates',()=>{
  assert.equal(normalizeTimestamp(0).timestamp,0);assert.equal(normalizeTimestamp('2026-02-30').timestamp,null);assert.equal(normalizeTimestamp(false).timestamp,null);assert.equal(normalizeTimestamp('2026-09-21').datePrecision,'day');assert.equal(normalizeTimestamp('2026-09-21T10:00:00+02:00').timestamp,Date.parse('2026-09-21T08:00:00Z'));assert.match(normalizeTimestamp('2026-09-21T10:00:00').timeZoneAssumption,/UTC assumed/);assert.equal(normalizeTimestamp(10,'timestamp_ms').timestamp,10);
});
test('unknown structures stay inert, empty message objects remain distinguishable',()=>{
  const c=one({id:'future',mapping:{empty:{parent:null,message:{id:'e',author:{role:'assistant'},content:{parts:[]}}},future:{parent:'empty',message:{id:'f',author:{role:'assistant'},content:{content_type:'future_widget',payload:'<script>unsafe</script>'}}}}});assert.equal(new Set(c.records.map(r=>r.objectId)).size,2);assert.equal(count(c,'response'),0);assert.equal(count(c,'other'),2);assert.ok(c.diagnostics.some(d=>d.code==='unsupported-content'));assert.equal(globalThis.unsafe,undefined);
});
test('empty exported thoughts preserve the source object without inventing an observed trace',()=>{
  const c=one({id:'empty-thought',mapping:{n:{parent:null,message:{id:'empty',author:{role:'assistant'},content:{content_type:'thoughts',thoughts:[]}}}}});assert.equal(c.records.length,1);assert.equal(count(c,'thinking'),0);assert.equal(c.records[0].observed,false);assert.equal(c.records[0].reasoningUnavailable,true);assert.equal(c.capabilityCoverage.objects,1);
});
test('ChatGPT summary-only and absent thought content preserve honest trace coverage',()=>{
  const c=one({id:'thought-coverage',mapping:{n:{parent:null,message:{id:'n',author:{role:'assistant'},content:{content_type:'thoughts',thoughts:[{summary:'Recorded summary',content:'',chunks:[]},{summary:'',content:'',chunks:[]},{summary:'Heading',content:'Recorded trace',chunks:[]}]}}}}});assert.equal(count(c,'thinking'),3);assert.equal(c.records[0].text,'Recorded summary');assert.equal(c.records[0].reasoningRepresentation,'summary-only');assert.equal(c.records[0].originalTraceAvailable,false);assert.equal(c.records[1].observed,false);assert.equal(c.records[2].originalTraceAvailable,true);
});
test('recap durations require a complete numerical label and preserve duration scope',()=>{
  const data={id:'recaps',mapping:{a:{parent:null,message:{id:'a',author:{role:'assistant'},content:{content_type:'reasoning_recap',content:'Thought for 1m 26s'}}},b:{parent:'a',message:{id:'b',author:{role:'assistant'},content:{content_type:'reasoning_recap',content:'Thought for a few seconds'}}}}};const c=one(data);assert.equal(c.records[0].durationMs,86000);assert.equal(c.records[0].duration.scope,'recap');assert.equal(c.records[1].durationMs,undefined);
});
test('Claude project toolCall and result remain recorded events beside response text',()=>{
  const c=one({uuid:'project-tools',project:{uuid:'p'},messages:[{id:'a',role:'assistant',content:{content:'Final text',contentBlocks:[{type:'tool_call',toolCall:{id:'c',name:'calculator',input:{expr:'2+2'},output:'4'}},{type:'thinking',text:''},{type:'text',text:'Final text'}]}}]});assert.equal(count(c,'tool_call'),1);assert.equal(count(c,'tool_output'),1);assert.equal(count(c,'response'),1);assert.equal(count(c,'thinking'),0);assert.equal(c.records.filter(r=>r.category==='response')[0].text,'Final text');
});
