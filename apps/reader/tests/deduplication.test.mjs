import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ArchiveStore } from '../src/core/archive.mjs';
import { describeDeduplication, compareDeduplication, planDeduplication, hasDeduplicationHistory, stripDeduplicationHistory, retainDeduplicationSources } from '../src/core/deduplication.mjs';
import { canonicalProvider, reliableConversationIdentity } from '../src/core/conversation-identity.mjs';
import { reconcileLocalReading, localReadingKey } from '../src/core/manager-reading.mjs';
import { normalizeDocument } from '../src/core/importers.mjs';
import { seedLegacy } from './helpers/legacy-archive.mjs';

const pair = [{ user: 'Question', turn_index: 0 }, { ai: 'Answer', turn_index: 1, model: 'model-a' }];
function document(id, turns = pair, extra = {}) {
  return { provider: 'venice', collection: 'Research', title: 'Same title', conversationKey: id, sourceFile: id + '.json',
    turns: structuredClone(turns), raw: { id, exportedAt: id }, ...extra };
}
function describe(id, turns = pair, extra = {}) {
  return describeDeduplication(document(id, turns, extra), { id, collectionId: 'collection-a', collection: 'Research', importedAt: id });
}
function setup(t) {
  const dataDir = mkdtempSync(join(tmpdir(), 'reader-dedup-'));
  const store = new ArchiveStore({ dataDir }).init();
  t.after(() => { store.close(); rmSync(dataDir, { recursive: true, force: true }); });
  return store;
}

test('source IDs, model record IDs, timestamps and turn indexes do not prevent exact content matching', () => {
  const a = describe('a', pair, { raw: { modelName: 'Model A', modelId: 'opaque-1' } });
  const b = describe('b', [{ user: 'Question', turn_index: 40, source_message_id: 'changed' }, { ai: 'Answer', turn_index: 45, model: 'opaque-2' }], { raw: { modelName: 'Model A', modelId: 'opaque-2' } });
  assert.equal(compareDeduplication(a, b)?.reason, 'identical');
});

test('provider, title, known actual model and collection boundaries are all required', () => {
  const a = describe('a');
  for (const b of [describe('b', pair, { provider: 'grok' }), describe('b', pair, { title: 'Other title' }), describe('b', [{ user: 'Question' }, { ai: 'Answer', model: 'model-b' }]), { ...describe('b'), key: JSON.stringify(['other']) }, describe('b', [{ user: 'Question' }, { ai: 'Answer' }])]) assert.equal(compareDeduplication(a, b), null);
  assert.equal(compareDeduplication(describe('a', [{ user: 'Question' }, { ai: 'Answer', model: 'unknown' }]), describe('b', [{ user: 'Question' }, { ai: 'Answer', model: 'unknown' }])), null);
});

test('exact prefixes keep the longer history, independent of import order', () => {
  const short = describe('short'), long = describe('long', [...pair, { user: 'Next' }, { ai: 'More', model: 'model-a' }]);
  assert.equal(compareDeduplication(short, long).keep.id, 'long');
  assert.equal(compareDeduplication(long, short).keep.id, 'long');
  for (const rows of [[short, long], [long, short]]) assert.equal(planDeduplication(rows)[0].keep.id, 'long');
});

test('reasoning, attachments, code whitespace, message order and unknown rich fields are substantive', () => {
  const a = describe('a');
  const variants = [
    [{ user: 'Question' }, { thinking: 'Hidden reasoning', model: 'model-a' }, { ai: 'Answer', model: 'model-a' }],
    [{ user: 'Question', attachments: [{ name: 'private.pdf' }] }, { ai: 'Answer', model: 'model-a' }],
    [{ user: 'Question ' }, { ai: 'Answer', model: 'model-a' }],
    [{ ai: 'Answer', model: 'model-a' }, { user: 'Question' }],
    [{ user: 'Question' }, { ai: 'Answer', model: 'model-a', futurePayload: { meaningful: true } }],
  ];
  for (const turns of variants) assert.equal(compareDeduplication(a, describe('b', turns)), null);
  assert.equal(compareDeduplication(a, describe('b', pair, { raw: { attachments: [{ sha256: 'different' }] } })), null);
});

test('per-answer model attribution cannot be swapped while retaining the same model set', () => {
  const a = describe('a', [{ user: 'Q1' }, { ai: 'A1', model: 'grok-4' }, { user: 'Q2' }, { ai: 'A2', model: 'grok-3' }]);
  const b = describe('b', [{ user: 'Q1' }, { ai: 'A1', model: 'grok-3' }, { user: 'Q2' }, { ai: 'A2', model: 'grok-4' }]);
  assert.equal(a.model, b.model); assert.equal(compareDeduplication(a, b), null);
  const partial = describe('partial', [{ user: 'Q1' }, { ai: 'A1', model: 'grok-4' }, { user: 'Q2' }, { ai: 'A2' }]);
  assert.equal(partial.key, null, 'a missing model on one answer is not inferred from another answer');
});

test('raw message attachment association survives the real Venice normalizer', () => {
  const imported = (id, attachments) => normalizeDocument({ format: 'venice-chat-history', formatVersion: 1, owners: [{ ownerId: id, conversations: [{ id, title: 'Attachments', modelName: 'model-a', messages: [
    { role: 'user', content: 'Q1', attachments: [{ file: attachments[0] }] }, { role: 'assistant', content: 'A1', modelName: 'model-a' },
    { role: 'user', content: 'Q2', attachments: [{ file: attachments[1] }] }, { role: 'assistant', content: 'A2', modelName: 'model-a' },
  ] }] }] })[0];
  const a = describeDeduplication(imported('a', ['first.pdf', 'second.pdf']), { id: 'a', collectionId: 'same' });
  const b = describeDeduplication(imported('b', ['second.pdf', 'first.pdf']), { id: 'b', collectionId: 'same' });
  assert.equal(compareDeduplication(a, b), null);
});

test('structured input files, unknown AI payloads and raw hidden responses cannot be prompt-only deleted', () => {
  const imported = normalizeDocument({ format: 'venice-chat-history', owners: [{ ownerId: 'x', conversations: [{ id: 'file', title: 'File', messages: [
    { role: 'user', content: [{ type: 'input_file', file_id: 'file123' }] },
  ] }] }] })[0];
  const file = describeDeduplication({ ...imported, provider: 'grok' }, { id: 'file', collectionId: 'same' });
  const unknown = describe('unknown', [{ user: 'Question' }, { role: 'assistant', content: [{ type: 'custom', data: 'Answer' }] }], { provider: 'grok' });
  const hidden = describe('hidden', [{ user: 'Question' }], { provider: 'grok', raw: { messages: [{ role: 'assistant', content: 'Preserve this hidden response' }] } });
  const unknownUser = describe('unknown-user', [{ user: '{"type":"custom","data":"original bytes"}' }], { provider: 'grok', raw: { messages: [{ role: 'user', content: [{ type: 'custom', data: 'original bytes' }] }] } });
  assert.equal(file.promptOnly, false); assert.equal(unknown.promptOnly, false); assert.equal(hidden.promptOnly, false); assert.equal(unknownUser.promptOnly, false);
  assert.deepEqual(planDeduplication([file, unknown, hidden, unknownUser], { deletePromptOnly: true }), []);
  const empty = describe('empty', [{ user: 'Question' }, { ai: '  ' }], { provider: 'grok', raw: { messages: [{ role: 'assistant', content: { content_type: 'text', parts: ['  '] } }] } });
  assert.equal(empty.promptOnly, true);
  assert.equal(describe('empty-structured', [{ user: 'Question' }, { role: 'assistant', content: { content_type: 'text', parts: [' '] } }], { provider: 'grok' }).promptOnly, true);
});

test('represented reasoning and attachment fields can extend a matching prefix', () => {
  const oldTurns = [{ user: 'Question', attachments: [{ file_id: 'same' }] }, { thinking: 'Reasoning', model: 'model-a' }, { ai: 'Answer', model: 'model-a' }];
  const newTurns = [...oldTurns, { user: 'Next' }, { thinking: 'New reasoning', model: 'model-a' }, { ai: 'Next answer', model: 'model-a' }];
  const a = describe('a', oldTurns, { raw: { messages: [{ role: 'user', content: 'Question', attachments: [{ file_id: 'same' }] }, { role: 'assistant', content: 'Answer', reasoningContent: 'Reasoning' }] } });
  const b = describe('b', newTurns, { raw: { messages: [{ role: 'user', content: 'Question', attachments: [{ file_id: 'same' }] }, { role: 'assistant', content: 'Answer', reasoningContent: 'Reasoning' }, { role: 'assistant', content: 'Next answer', reasoningContent: 'New reasoning' }] } });
  assert.equal(compareDeduplication(a, b)?.reason, 'shorter');
});

test('Grok supersession removes only unanswered trailing prompt variants after shared answered history', () => {
  const old = describe('old', [...pair, { user: 'Old version' }, { user: 'Still unanswered' }], { provider: 'grok' });
  const answered = describe('answered', [...pair, { user: 'Edited version' }, { ai: 'Answer to edit', model: 'model-a' }], { provider: 'xai' });
  assert.equal(compareDeduplication(old, answered)?.reason, 'grok-superseded');
  assert.equal(compareDeduplication(old, answered)?.keep.id, 'answered');
  const divergent = describe('divergent', [...pair, { user: 'Old version' }, { ai: 'A different answer', model: 'model-a' }], { provider: 'grok' });
  assert.equal(compareDeduplication(divergent, answered), null);
  assert.equal(compareDeduplication(describe('old', [...pair, { user: 'Old version' }]), describe('new', [...pair, { user: 'Edited version' }, { ai: 'Reply', model: 'model-a' }])), null, 'Grok model/provider rules must not leak to Venice');
  assert.equal(compareDeduplication(describe('old', [{ user: 'Entirely different', model: 'model-a' }], { provider: 'grok' }), describe('new', pair, { provider: 'grok' })), null, 'no shared answered history');
});

test('prompt-only cleanup uses provider precedence and refuses substantive extra content', () => {
  const entries = [
    describe('grok', [{ user: 'Empty export' }], { provider: 'grok' }),
    describe('xai', [{ user: 'Empty export' }, { ai: '   ' }], { provider: 'xai' }),
    describe('venice', [{ user: 'Real draft', model: 'grok' }]),
    describe('attachment', [{ user: 'Read this', attachments: [{ name: 'photo.jpg' }] }], { provider: 'grok' }),
    describe('thinking', [{ user: 'Think' }, { thinking: 'Working' }], { provider: 'grok' }),
    describe('tool', [{ user: 'Use a tool' }, { ai: 'Result', source_role: 'tool' }], { provider: 'grok' }),
  ];
  assert.deepEqual(planDeduplication(entries).map(entry => entry.remove.id).sort(), ['grok', 'xai']);
  assert.deepEqual(planDeduplication(entries, { deletePromptOnly: true }).map(entry => entry.remove.id).sort(), ['grok', 'venice', 'xai']);
});

test('multiple identical Grok prompt-only artifacts are removed without dangling winners', t => {
  const store = setup(t);
  seedLegacy(store, document('a', [{ user: 'Empty export', model: 'model-a' }], { provider: 'grok' }));
  seedLegacy(store, document('b', [{ user: 'Empty export', model: 'model-a' }], { provider: 'grok' }));
  const preview = store.previewDeduplication();
  assert.equal(preview.promptOnly, 2); assert.ok(preview.entries.every(entry => entry.keepId === null));
  store.applyMutation(store.prepareDeduplication()); assert.equal(store.files().total, 0);
});

test('transitive supersession maps every removed identity directly to the final retained history', () => {
  const a = describe('a', [...pair, { user: 'Draft' }], { provider: 'grok' });
  const b = describe('b', [...pair, { user: 'Draft' }, { user: 'More unanswered draft' }], { provider: 'grok' });
  const c = describe('c', [...pair, { user: 'Edited and answered' }, { ai: 'Done', model: 'model-a' }], { provider: 'grok' });
  for (const rows of [[a, b, c], [c, a, b], [b, c, a]]) {
    const plan = planDeduplication(rows);
    assert.equal(plan.length, 2); assert.ok(plan.every(entry => entry.keep.id === 'c'));
  }
});

test('manual preview is read-only; selected cleanup removes source variants and remaps sparse bookmarks', t => {
  const store = setup(t);
  const short = seedLegacy(store, document('short')).summary;
  const long = seedLegacy(store, document('long', [{ user: 'Question', turn_index: 10 }, { ai: 'Answer', turn_index: 20, model: 'model-a' }, { user: 'Next', turn_index: 30 }, { ai: 'More', turn_index: 40, model: 'model-a' }])).summary;
  const other = seedLegacy(store, document('other', pair, { collection: 'Independent' })).summary;
  const before = store.revision(), preview = store.previewDeduplication();
  assert.equal(preview.count, 1); assert.equal(preview.entries[0].keepId, long.id); assert.equal(store.revision(), before); assert.equal(store.files().total, 3);
  const record = store.prepareDeduplication({ ids: [short.id], expectedRevision: preview.revision });
  const result = store.applyMutation(record);
  assert.equal(result.remap[short.id], long.id); assert.equal(store.files().total, 2);
  assert.equal(store.thread({ id: other.id }).collection, 'Independent');
  assert.equal(store.thread({ id: long.id }).deduplicationHistory, undefined);
  assert.deepEqual(store.applyMutation(record), result, 'journal replay must be idempotent');
  const oldKey = localReadingKey(short.id), reading = { positions: { [oldKey]: { turnIndex: 1, role: 'assistant', offset: .2, updatedAt: 1 } }, bookmarks: [{ key: oldKey, turnIndex: 1, role: 'assistant', text: 'Answer' }], recent: [oldKey] };
  const next = reconcileLocalReading(reading, result, id => store.getConversationSummary(id));
  assert.equal(next.bookmarks[0].key, localReadingKey(long.id)); assert.equal(next.bookmarks[0].turnIndex, 20);
  assert.equal(next.positions[localReadingKey(long.id)].turnIndex, 20);
  assert.deepEqual(next.recent, [localReadingKey(long.id)]);
});

test('reviews reject stale revisions and selection of a retained conversation', t => {
  const store = setup(t);
  const a = seedLegacy(store, document('a')).summary, b = seedLegacy(store, document('b')).summary;
  const preview = store.previewDeduplication();
  assert.throws(() => store.prepareDeduplication({ ids: [preview.entries[0].keepId], expectedRevision: preview.revision }), /candidate changed/);
  seedLegacy(store, document('unrelated', pair, { title: 'Unrelated' }));
  assert.throws(() => store.prepareDeduplication({ expectedRevision: preview.revision }), /changed after the preview/);
  assert.ok(store.thread({ id: a.id })); assert.ok(store.thread({ id: b.id }));
  assert.equal(store.previewDeduplication({ collectionIds: [] }).count, 0);
});

test('subset selection does not remove unchecked duplicates and can be cleaned later', t => {
  const store = setup(t);
  for (const id of ['a', 'b', 'c']) seedLegacy(store, document(id));
  const preview = store.previewDeduplication(); assert.equal(preview.count, 2);
  const result = store.applyMutation(store.prepareDeduplication({ ids: [preview.entries[0].id], expectedRevision: preview.revision }));
  assert.equal(result.removedIds.length, 1); assert.equal(store.files().total, 2);
  assert.equal(store.previewDeduplication().count, 1);
});

test('same-source older snapshots cannot replace a known longer conversation', t => {
  const store = setup(t), longer = document('same', [...pair, { user: 'Next' }, { ai: 'More', model: 'model-a' }]);
  const first = store.upsert(longer).summary;
  store.upsert(document('same'));
  const saved = store.thread({ id: first.id });
  assert.equal(saved.turns.length, 4); assert.equal(saved.deduplicationHistory, undefined);
  store.upsert(longer);
  assert.equal(store.thread({ id: first.id }).turns.length, 4);
});

test('same native identity protects missing-model prefixes and updates changed attachments or answers in place', t => {
  const store = setup(t);
  const bare = [{ user: 'Q' }, { ai: 'A' }];
  const first = store.upsert(document('unknown', [...bare, { user: 'Q2' }, { ai: 'A2' }], { provider: 'openai' })).summary;
  store.upsert(document('unknown', bare, { provider: 'openai' }));
  assert.equal(store.thread({ id: first.id }).turns.length, 4);
  const branch = store.upsert(document('branch', pair, { provider: 'openai' })).summary;
  const divergent = store.upsert(document('branch', [{ user: 'Question' }, { ai: 'Different answered branch', model: 'model-a' }], { provider: 'openai' }));
  assert.equal(divergent.summary.id, branch.id); assert.equal(store.thread({ id: branch.id }).turns[1].ai, 'Different answered branch');
  const attached = store.upsert(document('attachment', pair, { provider: 'openai', raw: { attachments: ['first.pdf'] } })).summary;
  const changed = store.upsert(document('attachment', pair, { provider: 'openai', raw: { attachments: ['second.pdf'] } }));
  assert.equal(changed.summary.id, attached.id);
  assert.deepEqual(store.thread({ id: attached.id }).raw.attachments, ['second.pdf']);
  assert.equal(store.files().total, 3);
});

test('a collection merge enables comparison only after membership changes', t => {
  const store = setup(t);
  seedLegacy(store, document('a', pair, { collection: 'A' }));
  seedLegacy(store, document('b', pair, { collection: 'B' }));
  assert.equal(store.previewDeduplication().count, 0);
  const collections = store.collections({ includeEmpty: true }), a = collections.find(row => row.name === 'A'), b = collections.find(row => row.name === 'B');
  store.manage({ action: 'merge', collectionIds: [b.id], targetId: a.id });
  const preview = store.previewDeduplication({ collectionIds: [a.id] }); assert.equal(preview.count, 1);
  store.applyMutation(store.prepareDeduplication({ collectionIds: [a.id], expectedRevision: preview.revision }));
  assert.equal(store.files().total, 1);
});

test('superseded Grok source is removed while the bookmark retains its bounded excerpt', t => {
  const store = setup(t);
  const old = seedLegacy(store, document('old', [...pair, { user: 'Original unanswered edit', turn_index: 2 }], { provider: 'grok' })).summary;
  const current = seedLegacy(store, document('new', [...pair, { user: 'New answered edit', turn_index: 20 }, { ai: 'Completed', model: 'model-a', turn_index: 21 }], { provider: 'grok' })).summary;
  const result = store.applyMutation(store.prepareDeduplication());
  assert.equal(result.remap[old.id], current.id);
  assert.equal(store.thread({ id: current.id }).deduplicationHistory, undefined);
  const reading = { positions: {}, bookmarks: [{ key: localReadingKey(old.id), turnIndex: 2, role: 'user', text: 'Original unanswered edit' }], recent: [] };
  const next = reconcileLocalReading(reading, result, id => store.getConversationSummary(id));
  assert.equal(next.bookmarks[0].turnIndex, 20); assert.equal(next.bookmarks[0].supersededSource.text, 'Original unanswered edit');
});

test('superseded bookmarks with matching bounded excerpts keep distinct full-content fingerprints', t => {
  const store = setup(t), prefix = 'x'.repeat(600);
  const old = seedLegacy(store, document('old', [...pair, { user: prefix + 'first', turn_index: 2 }, { user: prefix + 'second', turn_index: 3 }], { provider: 'grok' })).summary;
  seedLegacy(store, document('new', [...pair, { user: 'New answered edit', turn_index: 20 }, { ai: 'Completed', model: 'model-a', turn_index: 21 }], { provider: 'grok' }));
  const result = store.applyMutation(store.prepareDeduplication());
  const reading = { positions: {}, bookmarks: [2, 3].map(turnIndex => ({ key: localReadingKey(old.id), turnIndex, role: 'user', text: prefix.slice(0, 150) })), recent: [] };
  const next = reconcileLocalReading(reading, result, id => store.getConversationSummary(id));
  assert.equal(next.bookmarks.length, 2);
  assert.notEqual(next.bookmarks[0].supersededSource.fingerprint, next.bookmarks[1].supersededSource.fingerprint);
});

test('failed publication rolls back removals and replacements together', t => {
  const store = setup(t);
  seedLegacy(store, document('a')); seedLegacy(store, document('b'));
  const record = store.prepareDeduplication(), before = store.revision();
  store.db.exec("CREATE TEMP TRIGGER reject_dedup BEFORE DELETE ON conversations BEGIN SELECT RAISE(ABORT,'dedup failure'); END");
  assert.throws(() => store.applyMutation(record), /dedup failure/);
  assert.equal(store.files().total, 2); assert.equal(store.revision(), before);
  assert.ok(store.files().files.every(row => !store.thread({ id: row.id }).deduplicationHistory));
});

test('reliable identity is provider plus native ID across file and server transports', () => {
  const native = { provider: 'openai', conversationKey: 'openai:stable-id', sourceFile: 'old.json' };
  const remote = { provider: 'ChatGPT', conversationKey: 'stable-id', sourceFile: 'renamed.json',
    sourceIdentity: { kind: 'threadshelf', serverUrl: 'http://example.test', collection: 'Remote', conversationKey: 'stable-id' } };
  assert.equal(reliableConversationIdentity(native), reliableConversationIdentity(remote));
  assert.equal(reliableConversationIdentity({ provider: 'xAI', conversationKey: 'grok:id' }), reliableConversationIdentity({ provider: 'grok', conversationKey: 'id' }));
  assert.notEqual(reliableConversationIdentity(native), reliableConversationIdentity({ ...native, provider: 'anthropic' }));
  assert.equal(reliableConversationIdentity({ provider: 'openai', id: 'local:random-row-id' }), null);
  for (const provider of ['Venice', 'VeniceAI', 'venice.ai']) assert.equal(reliableConversationIdentity({ provider, conversationKey: 'apparently-stable' }), null);
  assert.equal(canonicalProvider(' CLAUDE '), 'anthropic');
});

test('distinct reliable IDs stay separate despite identical or prefix content', () => {
  for (const provider of ['openai', 'anthropic', 'meta', 'google-ai-studio']) {
    const a = describe('one', pair, { provider });
    const identical = describe('two', pair, { provider });
    const longer = describe('three', [...pair, { user: 'Next' }, { ai: 'More', model: 'model-a' }], { provider });
    assert.equal(compareDeduplication(a, identical), null, provider);
    assert.equal(compareDeduplication(a, longer), null, provider);
    assert.deepEqual(planDeduplication([a, identical, longer]), [], provider);
  }
});

test('same reliable ID repairs changed title/model/answers to one latest snapshot', () => {
  const old = describe('old-row', pair, { provider: 'openai', conversationKey: 'same-id' });
  const current = describe('current-row', [{ user: 'Question' }, { ai: 'Edited answer', model: 'model-b' }],
    { provider: 'openai', conversationKey: 'openai:same-id', title: 'Renamed conversation' });
  old.updatedAt = '2026-11-09T10:00:00Z'; current.updatedAt = '2026-11-10T10:00:00Z';
  for (const rows of [[old, current], [current, old]]) {
    const plan = planDeduplication(rows);
    assert.equal(plan.length, 1); assert.equal(plan[0].keep.id, current.id); assert.equal(plan[0].reason, 'same-id');
  }
  assert.equal(compareDeduplication(old, current).keep.id, current.id);
});

test('same reliable ID preserves fuller exact history despite changed title/model metadata', () => {
  const full = describe('old-row', [...pair, { user: 'Next' }, { ai: 'More', model: 'model-a' }], { provider: 'openai', conversationKey: 'same-id' });
  const short = describe('new-row', [{ user: 'Question' }, { ai: 'Answer', model: 'renamed-model' }], { provider: 'openai', conversationKey: 'same-id', title: 'Renamed' });
  full.updatedAt = '2026-11-09'; short.updatedAt = '2026-11-10';
  assert.equal(compareDeduplication(full, short).keep.id, full.id);
  assert.equal(planDeduplication([short, full])[0].keep.id, full.id);
});

test('stable identity repair respects collections and newest branch across multiple old variants', () => {
  const make = (id, answer, updatedAt, more = []) => ({ ...describe(id, [{ user: 'Question' }, { ai: answer, model: 'model-a' }, ...more], { provider: 'openai', conversationKey: 'same-id' }), updatedAt });
  const newest = make('newest', 'Current', '2026-11-10');
  const full = make('older-full', 'Current', '2026-11-08', [{ user: 'Next' }, { ai: 'More', model: 'model-a' }]);
  const different = make('middle-divergent', 'Different', '2026-11-09');
  const separate = { ...newest, id: 'another-collection', collectionKey: 'collection-b' };
  for (const rows of [[newest, full, different, separate], [different, full, newest, separate]]) {
    const plan = planDeduplication(rows);
    assert.equal(plan.length, 2); assert.ok(plan.every(entry => entry.keep.id === full.id));
    assert.ok(plan.every(entry => entry.remove.id !== separate.id));
  }
});

test('1200 distinct ChatGPT identities survive repair of 233 repeated changed snapshots', () => {
  const rows = [];
  for (let i = 0; i < 1200; i++) {
    rows.push({ ...describe('original-' + i, pair, { provider: 'openai', conversationKey: 'chat-' + i }), updatedAt: '2026-11-09' });
    if (i < 233) rows.push({ ...describe('updated-' + i, [{ user: 'Question' }, { ai: 'Updated ' + i, model: 'model-b' }],
      { provider: 'openai', conversationKey: 'chat-' + i, title: 'Changed title ' + i }), updatedAt: '2026-11-10' });
  }
  const plan = planDeduplication(rows), removed = new Set(plan.map(entry => entry.remove.id));
  const survivors = rows.filter(row => !removed.has(row.id));
  assert.equal(plan.length, 233); assert.equal(survivors.length, 1200);
  assert.equal(new Set(survivors.map(row => row.identity)).size, 1200);
  assert.ok(plan.every(entry => entry.keep.id.startsWith('updated-')));
});

test('Grok single-prompt cleanup ignores known transport bookkeeping but preserves meaningful data', () => {
  const prompt = describe('draft', [{ user: 'Question', source_node_id: 'node', sender: 'human', index: 3, parentMessageId: 'parent', createdAtUnixTimestamp: 1234 }], { provider: 'xai' });
  assert.equal(prompt.promptOnly, true); assert.equal(planDeduplication([prompt]).length, 1);
  for (const extra of [{ attachments: ['photo.jpg'] }, { futurePayload: { text: 'Meaningful' } }]) {
    const keep = describe('draft', [{ user: 'Question', ...extra }], { provider: 'grok' });
    assert.equal(keep.promptOnly, false); assert.deepEqual(planDeduplication([keep]), []);
  }
});

test('cleanup strips legacy historical copies without retaining losers or mutating source', () => {
  const winner = document('winner'), loser = document('loser');
  winner.deduplicationHistory = [loser];
  const stripped = stripDeduplicationHistory(winner);
  assert.equal(stripped.deduplicationHistory, undefined); assert.deepEqual(stripped.turns, winner.turns);
  assert.equal(winner.deduplicationHistory.length, 1);
  assert.equal(retainDeduplicationSources(winner, [loser]).deduplicationHistory, undefined);
});

test('same-ID shorter imports cannot truncate raw attachments confined to appended messages', () => {
  const messages = [{ role: 'user', content: 'Q' }, { role: 'assistant', content: 'A' }];
  const base = { provider: 'openai', collection: 'C', conversationKey: 'same', title: 'T',
    turns: [{ user: 'Q' }, { ai: 'A', model: 'M' }] };
  const full = { ...base, turns: [...base.turns, { user: 'Next' }, { ai: 'More', model: 'M' }],
    raw: { messages: [...messages, { role: 'user', content: 'Next' }, { role: 'assistant', content: 'More', attachments: [{ name: 'chart.png' }] }] } };
  const short = { ...base, raw: { messages } };
  for (const source of [full, { ...full, raw: { serverUrl: 'https://example.test', summary: { conversationKey: 'same' }, thread: full } }]) {
    const a = describeDeduplication(source, { id: 'full', collectionId: 'C', updatedAt: '2026-11-09' });
    const b = describeDeduplication(short, { id: 'short', collectionId: 'C', updatedAt: '2026-11-10' });
    assert.equal(compareDeduplication(a, b).keep.id, 'full');
    for (const rows of [[a, b], [b, a]]) {
      const plan = planDeduplication(rows);
      assert.equal(plan.length, 1); assert.equal(plan[0].keep.id, 'full'); assert.equal(plan[0].reason, 'shorter');
    }
  }
});

test('same-ID rich prefix compares shared attachment positions and preserves unassigned fuller source data', () => {
  const turns = [{ user: 'Q' }, { ai: 'A', model: 'M' }];
  const make = (id, extra, more = false) => describeDeduplication({ provider: 'openai', collection: 'C', conversationKey: 'same', title: 'T',
    turns: more ? [...turns, { user: 'Next' }, { ai: 'More', model: 'M' }] : turns,
    raw: extra }, { id, collectionId: 'C', updatedAt: more ? '2026-11-09' : '2026-11-10' });
  const old = make('old', { messages: [{ role: 'user', content: 'Q', attachments: ['old.pdf'] }, { role: 'assistant', content: 'A' }] }, true);
  const edited = make('edited', { messages: [{ role: 'user', content: 'Q', attachments: ['new.pdf'] }, { role: 'assistant', content: 'A' }] });
  assert.equal(compareDeduplication(old, edited).keep.id, 'edited', 'changed shared-prefix attachment is an updated version');
  const removed = make('removed', { messages: [{ role: 'user', content: 'Q' }, { role: 'assistant', content: 'A' }] });
  assert.equal(compareDeduplication(old, removed).keep.id, 'removed', 'explicitly absent shared attachment is not a confirmed prefix');
  const unknownFull = make('unknown-full', { attachments: [{ name: 'unassigned.pdf' }] }, true);
  assert.equal(compareDeduplication(unknownFull, removed).keep.id, 'unknown-full', 'unassignable richer data must not truncate the fuller history');
  assert.equal(planDeduplication([unknownFull, removed])[0].keep.id, 'unknown-full');
});

test('actual normalized provider aliases converge with native and plain server IDs', () => {
  for (const [provider, namespace] of [['ChatGPT', 'openai'], ['xAI', 'grok'], ['Claude', 'anthropic']]) {
    const normalized = normalizeDocument({ provider, conversationKey: namespace + ':stable-id', turns: pair })[0];
    const server = { provider: namespace, conversationKey: 'stable-id' };
    assert.equal(reliableConversationIdentity(normalized), reliableConversationIdentity(server));
    assert.equal(reliableConversationIdentity({ provider, conversationKey: `${provider}:${namespace}:${provider}:stable-id` }), reliableConversationIdentity(server));
    assert.notEqual(reliableConversationIdentity({ provider, conversationKey: namespace + ':different-provider:stable-id' }), reliableConversationIdentity(server));
  }
  assert.notEqual(reliableConversationIdentity({ provider: 'openai', conversationKey: 'openai:anthropic:stable-id' }),
    reliableConversationIdentity({ provider: 'openai', conversationKey: 'openai:stable-id' }));
});

test('normalized reimport removes nested internal history without touching structured message data', () => {
  const legitimate = { deduplicationHistory: ['This is user data'], raw: { turns: [], deduplicationHistory: ['Also user data'] } };
  const original = document('same', [{ user: 'Keep this', futurePayload: legitimate }, { ai: 'Answer', model: 'model-a' }], { provider: 'openai' });
  original.deduplicationHistory = [document('obsolete')];
  original.raw = { messages: [{ role: 'user', content: legitimate }], deduplicationHistory: [document('older')] };
  const once = normalizeDocument(original)[0], twice = normalizeDocument(once)[0];
  assert.equal(hasDeduplicationHistory(twice), true);
  const cleaned = stripDeduplicationHistory(twice);
  assert.equal(hasDeduplicationHistory(cleaned), false);
  assert.equal(cleaned.raw.raw.deduplicationHistory, undefined);
  assert.equal(cleaned.raw.raw.raw.deduplicationHistory, undefined);
  assert.deepEqual(cleaned.turns[0].futurePayload, legitimate);
  assert.deepEqual(cleaned.raw.raw.raw.messages[0].content, legitimate);
  assert.equal(hasDeduplicationHistory(twice), true, 'the input remains unchanged');
  assert.equal(stripDeduplicationHistory(cleaned), cleaned, 'unchanged wrappers are not copied again');
});

test('server conversation wrappers strip internal history and leave unrelated raw dictionaries intact', () => {
  const thread = document('same', pair, { provider: 'openai' });
  thread.deduplicationHistory = [document('old')];
  const rawUserDictionary = { deduplicationHistory: ['legitimate'], other: 'No conversation shape' };
  thread.raw = rawUserDictionary;
  const wrapped = { ...document('same', pair, { provider: 'openai' }), raw: { serverUrl: 'https://example.test',
    summary: { conversationKey: 'same' }, thread } };
  assert.equal(hasDeduplicationHistory(wrapped), true);
  const cleaned = stripDeduplicationHistory(wrapped);
  assert.equal(cleaned.raw.thread.deduplicationHistory, undefined);
  assert.equal(cleaned.raw.thread.raw, rawUserDictionary);
  assert.equal(hasDeduplicationHistory(cleaned), false);
  assert.deepEqual(cleaned.turns, wrapped.turns);
});
