import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ArchiveStore } from '../src/core/archive.mjs';
import { describeDeduplication, compareDeduplication, planDeduplication } from '../src/core/deduplication.mjs';
import { reconcileLocalReading, localReadingKey } from '../src/core/manager-reading.mjs';
import { normalizeDocument } from '../src/core/importers.mjs';

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
  store.upsert(document('a', [{ user: 'Empty export', model: 'model-a' }], { provider: 'grok' }));
  store.upsert(document('b', [{ user: 'Empty export', model: 'model-a' }], { provider: 'grok' }));
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

test('manual preview is read-only; selected cleanup retains full source variants and remaps sparse bookmarks', t => {
  const store = setup(t);
  const short = store.upsert(document('short')).summary;
  const long = store.upsert(document('long', [{ user: 'Question', turn_index: 10 }, { ai: 'Answer', turn_index: 20, model: 'model-a' }, { user: 'Next', turn_index: 30 }, { ai: 'More', turn_index: 40, model: 'model-a' }])).summary;
  const other = store.upsert(document('other', pair, { collection: 'Independent' })).summary;
  const before = store.revision(), preview = store.previewDeduplication();
  assert.equal(preview.count, 1); assert.equal(preview.entries[0].keepId, long.id); assert.equal(store.revision(), before); assert.equal(store.files().total, 3);
  const record = store.prepareDeduplication({ ids: [short.id], expectedRevision: preview.revision });
  const result = store.applyMutation(record);
  assert.equal(result.remap[short.id], long.id); assert.equal(store.files().total, 2);
  assert.equal(store.thread({ id: other.id }).collection, 'Independent');
  assert.equal(store.thread({ id: long.id }).deduplicationHistory[0].raw.id, 'short');
  assert.deepEqual(store.applyMutation(record), result, 'journal replay must be idempotent');
  const oldKey = localReadingKey(short.id), reading = { positions: { [oldKey]: { turnIndex: 1, role: 'assistant', offset: .2, updatedAt: 1 } }, bookmarks: [{ key: oldKey, turnIndex: 1, role: 'assistant', text: 'Answer' }], recent: [oldKey] };
  const next = reconcileLocalReading(reading, result, id => store.getConversationSummary(id));
  assert.equal(next.bookmarks[0].key, localReadingKey(long.id)); assert.equal(next.bookmarks[0].turnIndex, 20);
  assert.equal(next.positions[localReadingKey(long.id)].turnIndex, 20);
  assert.deepEqual(next.recent, [localReadingKey(long.id)]);
});

test('reviews reject stale revisions and selection of a retained conversation', t => {
  const store = setup(t);
  const a = store.upsert(document('a')).summary, b = store.upsert(document('b')).summary;
  const preview = store.previewDeduplication();
  assert.throws(() => store.prepareDeduplication({ ids: [preview.entries[0].keepId], expectedRevision: preview.revision }), /candidate changed/);
  store.upsert(document('unrelated', pair, { title: 'Unrelated' }));
  assert.throws(() => store.prepareDeduplication({ expectedRevision: preview.revision }), /changed after the preview/);
  assert.ok(store.thread({ id: a.id })); assert.ok(store.thread({ id: b.id }));
  assert.equal(store.previewDeduplication({ collectionIds: [] }).count, 0);
});

test('subset selection does not remove unchecked duplicates and can be cleaned later', t => {
  const store = setup(t);
  for (const id of ['a', 'b', 'c']) store.upsert(document(id));
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
  assert.equal(saved.turns.length, 4); assert.equal(saved.deduplicationHistory[0].turns.length, 2);
  store.upsert(longer);
  assert.equal(store.thread({ id: first.id }).turns.length, 4);
});

test('same native identity protects missing-model prefixes and preserves changed attachment or answered branches', t => {
  const store = setup(t);
  const bare = [{ user: 'Q' }, { ai: 'A' }];
  const first = store.upsert(document('unknown', [...bare, { user: 'Q2' }, { ai: 'A2' }])).summary;
  store.upsert(document('unknown', bare));
  assert.equal(store.thread({ id: first.id }).turns.length, 4);
  const branch = store.upsert(document('branch')).summary;
  const divergent = store.upsert(document('branch', [{ user: 'Question' }, { ai: 'Different answered branch', model: 'model-a' }]));
  assert.notEqual(divergent.summary.id, branch.id); assert.equal(store.thread({ id: branch.id }).turns[1].ai, 'Answer');
  const attached = store.upsert(document('attachment', pair, { raw: { attachments: ['first.pdf'] } })).summary;
  const changed = store.upsert(document('attachment', pair, { raw: { attachments: ['second.pdf'] } }));
  assert.notEqual(changed.summary.id, attached.id);
  assert.deepEqual(store.thread({ id: attached.id }).raw.attachments, ['first.pdf']);
});

test('a collection merge enables comparison only after membership changes', t => {
  const store = setup(t);
  store.upsert(document('a', pair, { collection: 'A' }));
  store.upsert(document('b', pair, { collection: 'B' }));
  assert.equal(store.previewDeduplication().count, 0);
  const collections = store.collections({ includeEmpty: true }), a = collections.find(row => row.name === 'A'), b = collections.find(row => row.name === 'B');
  store.manage({ action: 'merge', collectionIds: [b.id], targetId: a.id });
  const preview = store.previewDeduplication({ collectionIds: [a.id] }); assert.equal(preview.count, 1);
  store.applyMutation(store.prepareDeduplication({ collectionIds: [a.id], expectedRevision: preview.revision }));
  assert.equal(store.files().total, 1);
});

test('superseded Grok prompt text and its bookmark survive in retained source history', t => {
  const store = setup(t);
  const old = store.upsert(document('old', [...pair, { user: 'Original unanswered edit', turn_index: 2 }], { provider: 'grok' })).summary;
  const current = store.upsert(document('new', [...pair, { user: 'New answered edit', turn_index: 20 }, { ai: 'Completed', model: 'model-a', turn_index: 21 }], { provider: 'grok' })).summary;
  const result = store.applyMutation(store.prepareDeduplication());
  assert.equal(result.remap[old.id], current.id);
  assert.equal(store.thread({ id: current.id }).deduplicationHistory[0].turns.at(-1).user, 'Original unanswered edit');
  const reading = { positions: {}, bookmarks: [{ key: localReadingKey(old.id), turnIndex: 2, role: 'user', text: 'Original unanswered edit' }], recent: [] };
  const next = reconcileLocalReading(reading, result, id => store.getConversationSummary(id));
  assert.equal(next.bookmarks[0].turnIndex, 20); assert.equal(next.bookmarks[0].supersededSource.text, 'Original unanswered edit');
});

test('superseded bookmarks with matching bounded excerpts keep distinct full-content fingerprints', t => {
  const store = setup(t), prefix = 'x'.repeat(600);
  const old = store.upsert(document('old', [...pair, { user: prefix + 'first', turn_index: 2 }, { user: prefix + 'second', turn_index: 3 }], { provider: 'grok' })).summary;
  store.upsert(document('new', [...pair, { user: 'New answered edit', turn_index: 20 }, { ai: 'Completed', model: 'model-a', turn_index: 21 }], { provider: 'grok' }));
  const result = store.applyMutation(store.prepareDeduplication());
  const reading = { positions: {}, bookmarks: [2, 3].map(turnIndex => ({ key: localReadingKey(old.id), turnIndex, role: 'user', text: prefix.slice(0, 150) })), recent: [] };
  const next = reconcileLocalReading(reading, result, id => store.getConversationSummary(id));
  assert.equal(next.bookmarks.length, 2);
  assert.notEqual(next.bookmarks[0].supersededSource.fingerprint, next.bookmarks[1].supersededSource.fingerprint);
});

test('failed publication rolls back removals and replacements together', t => {
  const store = setup(t);
  store.upsert(document('a')); store.upsert(document('b'));
  const record = store.prepareDeduplication(), before = store.revision();
  store.db.exec("CREATE TEMP TRIGGER reject_dedup BEFORE DELETE ON conversations BEGIN SELECT RAISE(ABORT,'dedup failure'); END");
  assert.throws(() => store.applyMutation(record), /dedup failure/);
  assert.equal(store.files().total, 2); assert.equal(store.revision(), before);
  assert.ok(store.files().files.every(row => !store.thread({ id: row.id }).deduplicationHistory));
});
