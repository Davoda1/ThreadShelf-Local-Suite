import test from 'node:test';
import assert from 'node:assert/strict';
import { formatJsonResponse } from '../src/reader/json-response.js';
import { isHiddenThoughtsMessage, turnToMessage } from '../src/reader/messages.js';

test('raw assistant and reasoning JSON becomes readable two-space code text', () => {
  const original = '{"content":"Completed reasoning", "content_type":"reasoning_recap"}';
  const expected = '{\n  "content": "Completed reasoning",\n  "content_type": "reasoning_recap"\n}';
  for (const role of ['assistant', 'thinking']) assert.equal(formatJsonResponse(original, role), expected);
  assert.equal(formatJsonResponse('[1,{"a":[true,false,null]},[]]', 'assistant'), '[\n  1,\n  {\n    "a": [\n      true,\n      false,\n      null\n    ]\n  },\n  []\n]');
  for (const value of ['{}', '[]']) assert.equal(formatJsonResponse(value, 'assistant'), value);
});

test('formatting preserves duplicate keys, exact numbers, escaped strings and key order', () => {
  const original = String.raw`{"b":900719925474099312345,"a":-0,"b":1.2300e+999,"2":2,"1":1,"esc":"\u0041\/\\\"","literal":"<box>![image](https://example.test/x) $x$ </script>"}`;
  const display = formatJsonResponse(original, 'assistant');
  assert.equal(display.replace(/\n +|\n|: /g, match => match === ': ' ? ':' : ''), original);
  assert.match(display, /900719925474099312345/);
  assert.match(display, /1\.2300e\+999/);
  assert.equal((display.match(/"b":/g) || []).length, 2);
});

test('only trailing commas and literal controls inside strings are repaired', () => {
  const original = '{"message":"first\nsecond\tline\r\u0000","values":[1,2,],}';
  const display = formatJsonResponse(original, 'assistant');
  assert.deepEqual(JSON.parse(display), { message: 'first\nsecond\tline\r\u0000', values: [1, 2] });
  assert.equal(formatJsonResponse(display, 'assistant'), display, 'formatting is idempotent');
  assert.equal(original, '{"message":"first\nsecond\tline\r\u0000","values":[1,2,],}', 'original string remains exact');
});

test('uncertain or truncated JSON stays visible without guessing missing data', () => {
  for (const original of [
    '{"content":"An incomplete response', '{"a":1', '{"a":}', '{"a":1 "b":2}',
    '{"a":undefined}', '{"a":NaN}', '{"a":01}', '{"a":1.}', '{"a":"bad\\q"}',
    '{"a":"bad\\uXX01"}', '{"a":[1,,2]}', '{"a":1]', '[{"content":"cut off',
  ]) assert.equal(formatJsonResponse(original, 'assistant'), original);
});

test('mixed prose, Markdown and already fenced/indented code retain established rendering', () => {
  for (const original of [
    'Here is JSON: {"a":1}', '{"a":1}\nExplanation follows.', '[1,2]\n**Details**',
    '[link](https://example.test)', '[reference]: https://example.test', '![image](https://example.test)',
    '[1](https://example.test)', '["label"](https://example.test)', '[true story]',
    '```json\n{"a":1}\n```', '~~~json\n{"a":1}\n~~~', '    {"a":1}', '\t{"a":1}',
    '**Bold**, *italic*, <u>underline</u>.', '| A | B |\n|---|---|\n| 1 | 2 |',
    'true', '"scalar"', '42', '{not JSON}', '',
  ]) assert.equal(formatJsonResponse(original, 'assistant'), null, original);
});

test('roles, source data, turn identity and existing hiding policy are unchanged', () => {
  const content = '{"a":1}';
  for (const role of ['user', 'tool', 'system', '', undefined]) assert.equal(formatJsonResponse(content, role), null);
  const turn = Object.freeze({ ai: content, turnIndex: 21 });
  const message = Object.freeze(turnToMessage(turn, 2));
  formatJsonResponse(message.content, message.role);
  assert.equal(message.content, content);
  assert.equal(message.turn_index, 21);
  assert.equal(turn.ai, content);
  const hidden = { role: 'thinking', content: '{"content_type":"thoughts","source_analysis_msg_id":"synthetic","thoughts":[]}' };
  assert.equal(isHiddenThoughtsMessage(hidden), true);
  const meaningful = { role: 'assistant', content: '{"content_type":"thoughts","source_analysis_msg_id":"synthetic","thoughts":[{"content":"Actual reasoning"}]}' };
  assert.equal(isHiddenThoughtsMessage(meaningful), false);
  assert.ok(formatJsonResponse(meaningful.content, meaningful.role)?.includes('Actual reasoning'));
});

test('size, depth and output expansion limits retain source without exceptions', () => {
  const deep = '['.repeat(100) + '0' + ']'.repeat(100);
  assert.equal(formatJsonResponse(deep, 'assistant'), deep);
  const huge = '{"content":"' + 'x'.repeat(1024 * 1024) + '"}';
  assert.equal(formatJsonResponse(huge, 'assistant'), null);
  const expansion = '['.repeat(63) + Array(40000).fill('0').join(',') + ']'.repeat(63);
  assert.equal(formatJsonResponse(expansion, 'assistant'), expansion);
});
