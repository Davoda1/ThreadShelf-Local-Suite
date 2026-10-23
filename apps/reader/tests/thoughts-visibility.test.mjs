import test from 'node:test';
import assert from 'node:assert/strict';
import { isHiddenThoughtsMessage, turnToMessage } from '../src/reader/messages.js';

const payload = thoughts => ({ content_type: 'thoughts', source_analysis_msg_id: 'synthetic-source-id', thoughts });
const empty = { chunks: [], content: '', finished: true, summary: 'Searched the web' };
const message = (value, role = 'assistant') => ({ role, content: JSON.stringify(value, null, 2) });

test('empty and search-status-only ChatGPT thoughts are hidden in the view', () => {
  for (const thoughts of [[], [empty], [{ ...empty, summary: '\u2068Searched\u2069 \u2068\u206830\u2069 websites\u2069' }], [{ ...empty, content: ' \n\t' }]]) {
    for (const role of ['assistant', 'thinking']) assert.equal(isHiddenThoughtsMessage(message(payload(thoughts), role)), true);
    assert.equal(isHiddenThoughtsMessage({ role: 'assistant', content: payload(thoughts) }), true);
  }
});

test('substantive, mixed, unknown and malformed thoughts remain readable', () => {
  const cases = [
    payload([{ ...empty, content: 'A useful reasoning explanation.' }]),
    payload([{ ...empty, chunks: [{ text: 'A useful exported reasoning chunk.' }] }]),
    payload([empty, { ...empty, content: 'Keep this second thought.' }]),
    { ...payload([empty]), parts: ['Keep this additional text.'] },
    payload([{ ...empty, explanation: 'Unknown future fields are preserved.' }]),
    { ...payload([]), thoughts: null },
    payload([null]),
    payload([{ ...empty, chunks: 'unrecognized' }]),
    payload([{ ...empty, content: { text: 'Unrecognized body structure.' } }]),
    { content_type: 'text', parts: ['thoughts'] },
    { content_type: 'thoughts', thoughts: [] },
  ];
  for (const value of cases) assert.equal(isHiddenThoughtsMessage(message(value)), false, JSON.stringify(value));
  for (const content of ['A note before\n' + JSON.stringify(payload([])), JSON.stringify(payload([])) + '\nA note after', '{"content_type":"thoughts", invalid', 'Ordinary thoughts in prose.']) {
    assert.equal(isHiddenThoughtsMessage({ role: 'assistant', content }), false);
  }
});

test('user, tool, system and literal code examples are never hidden', () => {
  const json = JSON.stringify(payload([empty]), null, 2);
  for (const role of ['user', 'tool', 'system']) assert.equal(isHiddenThoughtsMessage({ role, content: json }), false);
  for (const content of ['```json\n' + json + '\n```', '~~~json\n' + json + '\n~~~', ...['    ', '\t', '  \t'].map(indent => json.split('\n').map(line => indent + line).join('\n'))]) {
    assert.equal(isHiddenThoughtsMessage({ role: 'assistant', content }), false);
  }
});

test('display filtering preserves original turn indexes, IDs, text and array contents', () => {
  const turns = [{ user: 'First prompt', turn_index: 4 }, { ai: JSON.stringify(payload([empty])), turn_index: 12 }, { ai: 'Useful reply', turn_index: 19 }, { user: 'Second prompt', turn_index: 23 }];
  const before = JSON.stringify(turns);
  const messages = turns.map(turnToMessage);
  const displayed = messages.filter(message => !isHiddenThoughtsMessage(message));
  assert.deepEqual(displayed.map(message => message.turn_index), [4, 19, 23]);
  assert.deepEqual(displayed.map(message => message.message_id), ['turn-0-user', 'turn-2-assistant', 'turn-3-user']);
  assert.equal(messages.length, 4);
  assert.equal(messages[1].content, turns[1].ai);
  assert.equal(JSON.stringify(turns), before);
});
