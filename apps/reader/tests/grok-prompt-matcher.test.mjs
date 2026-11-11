import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeDeduplication, planDeduplication } from '../src/core/deduplication.mjs';
import { normalizeDocument } from '../src/core/importers.mjs';

// Entirely synthetic values; preserves the supported server/native envelope shape.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/grok-unanswered-server.json', import.meta.url), 'utf8'));
const fresh = () => structuredClone(fixture);
const describe = document => describeDeduplication(document, { id: 'candidate', collectionId: 'synthetic' });
const response = document => document.raw.thread.raw.responses[1].response;
const userResponse = document => document.raw.thread.raw.responses[0].response;
const simple = (extra = {}) => ({ provider: 'grok', collection: 'C', conversationKey: 'synthetic', title: 'Question', turns: [{ user: 'Question', ...extra }] });

test('Grok server copy recognizes duplicated turn.raw as source bookkeeping', () => {
  const value = describe(fresh());
  assert.equal(value.events.length, 1); assert.deepEqual(Object.keys(value.events[0].extra), ['raw']);
  assert.equal(value.promptOnly, true);
  const plan = planDeduplication([value]);
  assert.equal(plan.length, 1); assert.equal(plan[0].reason, 'grok-prompt-only'); assert.equal(plan[0].keep, null);
});

test('same source shape works through normalized reimport, server envelope and native Grok importer', () => {
  const source = fresh();
  const native = { conversations: [source.raw.thread.raw] };
  for (const document of [source, ...normalizeDocument(source), ...normalizeDocument(native), ...normalizeDocument(normalizeDocument(source)[0])]) {
    assert.equal(document.provider.toLowerCase(), 'grok');
    assert.equal(describe(document).promptOnly, true);
  }
});

test('raw duplicate text and recognized human source wrappers are accepted only when text matches', () => {
  for (const raw of ['Question', { sender: 'human', message: 'Question', metadata: {} },
    { source_role: 'human', user: 'Question', source_message_id: 'message-id' },
    { response: { sender: 'human', message: 'Question' }, share_link: null }]) {
    assert.equal(describe(simple({ raw })).promptOnly, true);
  }
  for (const raw of ['Different text', { sender: 'human', message: 'Different text' }, { unexpected: 'Question' }]) {
    assert.equal(describe(simple({ raw })).promptOnly, false);
  }
});

test('usage-limit diagnostics do not count as an assistant answer', () => {
  const document = fresh();
  assert.equal(response(document).message, '');
  assert.equal(response(document).metadata.stream_errors.length, 1);
  assert.equal(describe(document).promptOnly, true);
  response(document).message = ' \n\t ';
  assert.equal(describe(document).promptOnly, true);
});

test('a substantive answer hidden in the raw source prevents deletion', () => {
  for (const body of ['A real answer', { content_type: 'text', parts: ['A structured answer'] }, { type: 'custom', data: 'Meaningful answer' },
    { text: '', futurePayload: 'Meaningful answer' }, { text: '', data: { answer: 'Meaningful answer' } },
    { content: [], attachment: { id: 'meaningful' } }, { type: 'image', text: '' }, 0, false]) {
    const document = fresh(); response(document).message = body;
    assert.equal(describe(document).promptOnly, false);
    assert.deepEqual(planDeduplication([describe(document)]), []);
  }
  const noTextField = fresh(); delete response(noTextField).message; response(noTextField).futurePayload = 'Meaningful answer';
  assert.equal(describe(noTextField).promptOnly, false);
  for (const blank of [{ content_type: 'text', parts: [' ', ''] }, { text: '', content: [] }, []]) {
    const document = fresh(); response(document).message = blank;
    assert.equal(describe(document).promptOnly, true, 'provably empty text structures remain unanswered');
  }
});

test('raw reasoning, tool outputs and non-text responses remain meaningful without answer text', () => {
  for (const [key, value] of [
    ['agent_thinking_traces', 'Actual reasoning'], ['thinking', 'Actual reasoning'], ['reasoning', ['Actual reasoning']],
    ['tool_calls', [{ name: 'search', result: 'Actual output' }]], ['tool_results', [{ text: 'Actual output' }]],
    ['images', [{ url: 'https://media.example.invalid/result.png' }]], ['audio', { url: 'https://media.example.invalid/audio.wav' }],
    ['generated_videos', [{ id: 'video-result' }]], ['futurePayload', { content: 'Meaningful unknown data' }],
  ]) {
    const document = fresh(); response(document)[key] = value;
    assert.equal(describe(document).promptOnly, false, key);
  }
  const tool = fresh(); response(tool).sender = 'tool'; response(tool).message = 'Tool output';
  assert.equal(describe(tool).promptOnly, false);
});

test('meaningful user attachments and raw conversation assets prevent deletion', () => {
  for (const change of [
    d => { d.turns[0].attachments = [{ name: 'kept.pdf' }]; },
    d => { d.turns[0].raw.attachments = [{ name: 'kept.pdf' }]; },
    d => { userResponse(d).attachments = [{ name: 'kept.pdf' }]; },
    d => { d.raw.thread.raw.conversation.asset_ids = ['asset-id']; },
    d => { d.raw.thread.raw.conversation.root_asset_id = 'asset-id'; },
    d => { response(d).message = { type: 'image', url: 'https://media.example.invalid/kept.png' }; },
  ]) {
    const document = fresh(); change(document);
    assert.equal(describe(document).promptOnly, false);
  }
});

test('unknown metadata is preserved rather than treated as harmless diagnostics', () => {
  for (const change of [
    d => { d.turns[0].metadata = { custom: { answer: 'Preserve' } }; },
    d => { d.turns[0].raw.metadata = { custom: { answer: 'Preserve' } }; },
    d => { response(d).metadata.extra_response = 'Preserve'; },
    d => { response(d).metadata.request_metadata.custom = { content: 'Preserve' }; },
    d => { response(d).metadata.stream_errors[0].unknownPayload = { content: 'Preserve' }; },
  ]) {
    const document = fresh(); change(document);
    assert.equal(describe(document).promptOnly, false);
  }
});

test('additional raw human messages prevent cleanup even if only one normalized turn is visible', () => {
  const document = fresh(), additional = structuredClone(userResponse(document));
  additional._id = 'another-user-message-id';
  document.raw.thread.raw.responses.push({ response: additional, share_link: null });
  assert.equal(describe(document).promptOnly, false);
});

test('provider distinction and ordinary other-provider cleanup remain unchanged', () => {
  const venice = { ...fresh(), provider: 'venice' };
  assert.deepEqual(planDeduplication([describe(venice)]), []);
  const optional = describe({ ...simple(), provider: 'venice' });
  assert.equal(optional.promptOnly, true); assert.deepEqual(planDeduplication([optional]), []);
  assert.equal(planDeduplication([optional], { deletePromptOnly: true }).length, 1);
  for (const provider of ['Grok', 'xAI', 'x.ai']) assert.equal(describe({ ...fresh(), provider }).promptOnly, true);
});
