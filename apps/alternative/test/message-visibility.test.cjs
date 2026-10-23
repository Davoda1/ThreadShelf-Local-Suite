'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {isHiddenThoughtsMessage, summarizeMessages, isHiddenViewEntry, visibleExcerpt} = require('../renderer/message-visibility.js');
const payload = thoughts => ({content_type:'thoughts',source_analysis_msg_id:'synthetic-source-id',thoughts});
const empty = {chunks:[],content:'',finished:true,summary:'Searched the web'};
const message = (value, role='assistant') => ({role,content:JSON.stringify(value,null,2)});

test('hides only empty ChatGPT thoughts bodies, including Alternative reasoning roles', () => {
  for (const thoughts of [[], [empty], [{...empty,summary:'\u2068Searched\u2069 \u206830 websites\u2069'}], [{...empty,content:' \n\t'}]]) {
    for (const role of ['assistant','thinking','reasoning','analysis','ai']) assert.equal(isHiddenThoughtsMessage(message(payload(thoughts),role)),true);
    assert.equal(isHiddenThoughtsMessage({role:'assistant',content:payload(thoughts)}),true);
  }
});

test('preserves substantive, mixed, unknown, malformed and oversize responses', () => {
  for (const value of [payload([{...empty,content:'A useful explanation.'}]),payload([{...empty,chunks:[{text:'A useful chunk.'}]}]),payload([empty,{...empty,content:'Keep this.'}]),{...payload([empty]),parts:['Keep this additional text.']},payload([{...empty,explanation:'Unknown future field.'}]),{...payload([]),thoughts:null},payload([null]),payload([{...empty,chunks:'unrecognized'}]),payload([{...empty,content:{text:'Unknown body structure.'}}]),{content_type:'text',parts:['thoughts']},{content_type:'thoughts',thoughts:[]}, {...payload([]),source_analysis_msg_id:13}, {...payload([]),source_analysis_msg_id:''}]) {
    assert.equal(isHiddenThoughtsMessage(message(value)),false,JSON.stringify(value));
  }
  for (const content of ['A note before\n'+JSON.stringify(payload([])),JSON.stringify(payload([]))+'\nA note after','{"content_type":"thoughts", invalid','Ordinary thoughts in prose.',JSON.stringify(payload([{...empty,summary:'x'.repeat(1024*1024)}]))]) assert.equal(isHiddenThoughtsMessage({role:'assistant',content}),false);
});

test('preserves user/tool/system messages and fenced or indented literal JSON examples', () => {
  const json=JSON.stringify(payload([empty]),null,2);
  for(const role of ['user','tool','system']) assert.equal(isHiddenThoughtsMessage({role,content:json}),false);
  for(const content of ['```json\n'+json+'\n```','~~~json\n'+json+'\n~~~',...['    ','\t','  \t'].map(indent=>json.split('\n').map(line=>indent+line).join('\n'))]) assert.equal(isHiddenThoughtsMessage({role:'assistant',content}),false);
});

test('display filtering preserves original IDs, source indexes and source bytes', () => {
  const messages=[{id:'message-0',turnIndex:4,role:'user',content:'First prompt'},{id:'message-1',turnIndex:12,...message(payload([empty]))},{id:'message-2',turnIndex:19,role:'assistant',content:'Useful reply'},{id:'message-3',turnIndex:23,role:'user',content:'Second prompt'}];
  const before=JSON.stringify(messages), displayed=messages.filter(m=>!isHiddenThoughtsMessage(m));
  assert.deepEqual(displayed.map(m=>m.turnIndex),[4,19,23]);
  assert.deepEqual(displayed.map(m=>m.id),['message-0','message-2','message-3']);
  const summary=summarizeMessages(messages);
  assert.equal(summary.count,3);
  assert.equal(isHiddenViewEntry({turnIndex:12,role:'ai',text:'truncated fragment'},summary),true);
  assert.equal(isHiddenViewEntry({turnIndex:19,role:'assistant',text:'Useful reply'},summary),false);
  assert.equal(visibleExcerpt({turnIndex:12,role:'assistant',excerpt:'Searched the web'},summary),'');
  assert.equal(JSON.stringify(messages),before);
});

test('result filtering uses complete source text, keeps useful JSON and never guesses from a marker', () => {
  const hidden={role:'assistant',text:JSON.stringify(payload([empty])),excerpt:'Searched the web'};
  assert.equal(isHiddenViewEntry(hidden),true);
  assert.equal(visibleExcerpt(hidden),'');
  const useful={role:'assistant',text:JSON.stringify(payload([{...empty,content:'A useful explanation'}])),excerpt:'A useful explanation'};
  assert.equal(isHiddenViewEntry(useful),false);
  assert.equal(visibleExcerpt(useful),'A useful explanation');
  const partial={role:'assistant',excerpt:'{"content_type":"thoughts", "source_analysis_msg_id":"unfinished…'};
  assert.equal(isHiddenViewEntry(partial),false);
  assert.equal(visibleExcerpt(partial),partial.excerpt);
  assert.equal(isHiddenViewEntry({role:'user',text:hidden.text}),false);
});

test('mixed-role and duplicate source indexes do not conceal visible companion messages', () => {
  const summary=summarizeMessages([{turnIndex:2,...message(payload([]))},{turnIndex:2,role:'user',content:'Prompt'},{turnIndex:8,...message(payload([]))},{turnIndex:8,role:'assistant',content:'Keep visible answer'}]);
  assert.equal(isHiddenViewEntry({turnIndex:2},summary),false);
  assert.equal(isHiddenViewEntry({turnIndex:2,role:'assistant'},summary),true);
  assert.equal(isHiddenViewEntry({turnIndex:2,role:'user'},summary),false);
  assert.equal(isHiddenViewEntry({turnIndex:8,role:'assistant'},summary),false);
});

test('browser and CommonJS helper use the same predicate', () => {
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../renderer/message-visibility.js'),'utf8'),context);
  assert.equal(context.TSAVisibility.isHiddenThoughtsMessage(message(payload([]))),true);
  assert.equal(context.TSAVisibility.isHiddenThoughtsMessage(message({answer:42})),false);
});
