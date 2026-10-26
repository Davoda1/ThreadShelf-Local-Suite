'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {formatJsonResponse} = require('../renderer/json-response.js');
const {isHiddenThoughtsMessage, summarizeMessages, isHiddenViewEntry} = require('../renderer/message-visibility.js');

// Synthetic fixtures only. These acceptance cases mirror the Reader display
// contract while accounting for Alternative's normalized "reasoning" role.
test('raw assistant and reasoning JSON uses readable two-space indentation', () => {
  const original = '{"content":"Completed reasoning", "content_type":"reasoning_recap"}';
  const expected = '{\n  "content": "Completed reasoning",\n  "content_type": "reasoning_recap"\n}';
  for (const role of ['assistant', 'thinking', 'reasoning']) assert.equal(formatJsonResponse(original, role), expected);
  assert.equal(formatJsonResponse('[1,{"a":[true,false,null]},[]]', 'assistant'), '[\n  1,\n  {\n    "a": [\n      true,\n      false,\n      null\n    ]\n  },\n  []\n]');
  for (const value of ['{}', '[]']) assert.equal(formatJsonResponse(value, 'assistant'), value);
});

test('formatting preserves duplicate keys, exact numbers, escape spelling and key order', () => {
  const original = String.raw`{"b":900719925474099312345,"a":-0,"b":1.2300e+999,"2":2,"1":1,"esc":"\u0041\/\\\"","literal":"<box>![image](https://example.test/x) $x$ </script>"}`;
  const display = formatJsonResponse(original, 'assistant');
  assert.equal(display.replace(/\n +|\n|: /g, match => match === ': ' ? ':' : ''), original);
  assert.match(display, /900719925474099312345/);
  assert.match(display, /1\.2300e\+999/);
  assert.equal((display.match(/"b":/g) || []).length, 2);
});

test('conservative repair removes trailing commas and escapes only literal string controls', () => {
  const original = '{"message":"first\nsecond\tline\r\u0000","values":[1,2,],}';
  const display = formatJsonResponse(original, 'assistant');
  assert.deepEqual(JSON.parse(display), {message: 'first\nsecond\tline\r\u0000', values: [1, 2]});
  assert.equal(formatJsonResponse(display, 'assistant'), display, 'formatting is idempotent');
  assert.equal(original, '{"message":"first\nsecond\tline\r\u0000","values":[1,2,],}', 'original string remains exact');
});

test('uncertain or truncated JSON stays visible without guessing missing data', () => {
  for (const original of [
    '{"content":"An incomplete response', '{"a":1', '{"a":}', '{"a":1 "b":2}',
    '{"a":undefined}', '{"a":NaN}', '{"a":01}', '{"a":1.}', '{"a":"bad\\q"}',
    '{"a":"bad\\uXX01"}', '{"a":[1,,2]}', '{"a":1]', '[{"content":"cut off',
  ]) assert.equal(formatJsonResponse(original, 'assistant'), original, original);
});

test('mixed prose, Markdown and fenced or indented code keep their established rendering', () => {
  for (const original of [
    'Here is JSON: {"a":1}', '{"a":1}\nExplanation follows.', '[1,2]\n**Details**',
    '[link](https://example.test)', '[reference]: https://example.test', '![image](https://example.test)',
    '[1](https://example.test)', '["label"](https://example.test)', '[true story]',
    '```json\n{"a":1}\n```', '~~~json\n{"a":1}\n~~~', '    {"a":1}', '\t{"a":1}',
    '**Bold**, *italic*, <u>underline</u>.', '| A | B |\n|---|---|\n| 1 | 2 |',
    'true', '"scalar"', '42', '{not JSON}', '',
  ]) assert.equal(formatJsonResponse(original, 'assistant'), null, original);
});

test('does not format user/tool/system messages or mutate source data and source identity', () => {
  const content = '{"a":1}';
  for (const role of ['user', 'tool', 'system', '', undefined]) assert.equal(formatJsonResponse(content, role), null);
  for (const content of [undefined, null, 42, {}, []]) assert.equal(formatJsonResponse(content, 'assistant'), null);
  const original = Object.freeze({id: 'message-4', turnIndex: 21, role: 'assistant', content});
  const before = JSON.stringify(original);
  assert.ok(formatJsonResponse(original.content, original.role).includes('\n'));
  assert.equal(JSON.stringify(original), before);
  assert.equal(original.content, content);
  assert.equal(original.turnIndex, 21);
});

test('preserves empty-thought suppression without hiding substantive or unfamiliar JSON', () => {
  const hidden = {id:'message-1', turnIndex:4, role:'reasoning', content:'{"content_type":"thoughts","source_analysis_msg_id":"synthetic","thoughts":[]}'};
  const meaningful = {id:'message-2', turnIndex:8, role:'assistant', content:'{"content_type":"thoughts","source_analysis_msg_id":"synthetic","thoughts":[{"content":"Actual reasoning"}]}'};
  const unknown = {id:'message-3', turnIndex:12, role:'assistant', content:'{"content_type":"thoughts","source_analysis_msg_id":"synthetic","thoughts":[],"unknown_future_field":"Keep this"}'};
  const malformed = {id:'message-4', turnIndex:16, role:'assistant', content:'{"content_type":"thoughts","source_analysis_msg_id":"synthetic","thoughts":[],}'};
  const messages = [hidden, meaningful, unknown, malformed];
  const before = JSON.stringify(messages);
  const summaryBefore = summarizeMessages(messages);
  assert.equal(isHiddenThoughtsMessage(hidden), true);
  for (const message of [meaningful, unknown, malformed]) {
    assert.equal(isHiddenThoughtsMessage(message), false, message.content);
    assert.notEqual(formatJsonResponse(message.content, message.role), null);
    assert.equal(isHiddenThoughtsMessage(message), false, 'display formatting must not replace source before filtering');
  }
  assert.ok(formatJsonResponse(meaningful.content, meaningful.role).includes('Actual reasoning'));
  assert.ok(formatJsonResponse(unknown.content, unknown.role).includes('Keep this'));
  assert.equal(JSON.stringify(messages), before);
  assert.deepEqual(summarizeMessages(messages), summaryBefore);
  assert.equal(summaryBefore.count, 3);
  assert.equal(isHiddenViewEntry({turnIndex:4,role:'reasoning'},summaryBefore),true);
  for (const turnIndex of [8,12,16]) assert.equal(isHiddenViewEntry({turnIndex,role:'assistant'},summaryBefore),false);
});

test('source-size, nesting and output-expansion bounds fall back without throwing', () => {
  const deep = '['.repeat(100) + '0' + ']'.repeat(100);
  assert.equal(formatJsonResponse(deep, 'assistant'), deep);
  const huge = '{"content":"' + 'x'.repeat(1024 * 1024) + '"}';
  assert.equal(formatJsonResponse(huge, 'assistant'), null);
  const expansion = '['.repeat(63) + Array(40000).fill('0').join(',') + ']'.repeat(63);
  assert.equal(formatJsonResponse(expansion, 'assistant'), expansion);
});
