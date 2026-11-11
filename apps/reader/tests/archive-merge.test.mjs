import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArchiveStore } from '../src/core/archive.mjs';
import { seedLegacy } from './helpers/legacy-archive.mjs';
import { serializeArchiveWorkerError, restoreArchiveWorkerError } from '../src/core/archive-work-errors.mjs';

function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), 'reader-merge-archive-'));
  const store = new ArchiveStore({ dataDir: directory, compression: 'zip6' }).init();
  t.after(async () => { const workers = store.workers; store.close(); await workers?.close(); rmSync(directory, { recursive: true, force: true }); });
  return store;
}
function conversation(id, extra = {}) {
  return { provider: 'openai', collection: 'ChatGPT', sourceFile: 'export.json', conversationKey: `openai:${id}`,
    title: `Conversation ${id}`, turns: [{ user: 'Question', turn_index: 0 }, { ai: 'Answer', model: 'test-model', turn_index: 1 }],
    raw: { id }, ...extra };
}
async function importOne(store, document, options) { return store.applyMutation(await store.prepareUpsertAsync(document, options)); }

test('server updates 2 existing to 3 authoritative IDs without creating a fourth row', async t => {
  const store = setup(t), first = store.upsert(conversation('one')).summary.id;
  store.upsert(conversation('two'));
  const updated = conversation('one', { title: 'Renamed title', turns: [{ user: 'Question' }, { ai: 'Edited answer', model: 'other-model' }],
    sourceIdentity: { kind: 'threadshelf', serverUrl: 'http://127.0.0.1:3000', collection: 'ChatGPT', sourceFile: 'new-server-export.json', conversationKey: 'one' } });
  const results = [await importOne(store, updated), await importOne(store, conversation('two')), await importOne(store, conversation('three'))];
  assert.deepEqual(results.map(result => result.status), ['updated', 'skipped', 'imported']);
  assert.equal(store.files().total, 3); assert.equal(results[0].summary.id, first);
  assert.equal(store.thread({ id: first }).turns[1].ai, 'Edited answer');
  const repeated = await importOne(store, updated); assert.equal(repeated.status, 'skipped'); assert.equal(store.files().total, 3);
});

test('incoming stable ID atomically removes all legacy repeats across titles and transports', async t => {
  const store = setup(t);
  const a = seedLegacy(store, conversation('one', { title: 'Old title' }), { at: '2020-01-01T00:00:00.000Z' }).summary;
  const b = seedLegacy(store, conversation('one', { provider: 'chatgpt', conversationKey: 'one', title: 'Other title',
    sourceIdentity: { kind: 'threadshelf', serverUrl: 'http://localhost:4000', collection: 'server-collection', sourceFile: 'old.json', conversationKey: 'one' },
    turns: [{ user: 'Question' }, { ai: 'Older branch', model: 'test-model' }] }), { at: '2021-01-01T00:00:00.000Z' }).summary;
  const other = store.upsert(conversation('different', { title: 'Latest', turns: [{ user: 'Question' }, { ai: 'Latest answer', model: 'test-model' }] })).summary;
  const result = await importOne(store, conversation('one', { title: 'Latest', turns: [{ user: 'Question' }, { ai: 'Latest answer', model: 'test-model' }] }));
  assert.equal(store.files().total, 2); assert.ok([a.id, b.id].includes(result.summary.id));
  assert.equal(result.removedIds.length, 1); assert.equal(result.remap[result.removedIds[0]], result.summary.id);
  assert.equal(store.thread({ id: result.summary.id }).turns[1].ai, 'Latest answer');
  assert.ok(store.getConversationSummary(other.id));
  assert.equal(Object.hasOwn(store.thread({ id: result.summary.id }), 'deduplicationHistory'), false);
});

test('Venice prefix matching and Grok prompt-only removal happen before insertion', async t => {
  const store = setup(t), short = conversation('unstable-old', { provider: 'venice', collection: 'Venice', title: 'Same title' });
  const before = await importOne(store, short);
  const longer = { ...short, conversationKey: 'unreliable-new', turns: [...short.turns, { user: 'Next' }, { ai: 'More', model: 'test-model' }] };
  const updated = await importOne(store, longer);
  assert.equal(store.files({ collection: 'Venice' }).total, 1); assert.equal(updated.summary.id, before.summary.id);
  assert.equal(updated.summary.turnCount, 4); assert.equal(updated.deduplication.removed, 1);
  const revision = store.revision();
  const prompt = await importOne(store, conversation('abandoned', { provider: 'xai', collection: 'Grok', turns: [{ user: 'Unanswered' }] }));
  assert.equal(prompt.status, 'skipped'); assert.equal(prompt.summary, null); assert.equal(prompt.deduplication.promptOnly, 1);
  assert.equal(store.revision(), revision); assert.equal(store.files({ collection: 'Grok' }).total, 0);
});

test('async cleanup has bounded progress, reuses reviewed plan and preserves separate collections', async t => {
  const store = setup(t);
  for (let i = 0; i < 8; i++) { seedLegacy(store, conversation(`legacy-${i}`)); seedLegacy(store, conversation(`legacy-${i}`, { title: `Changed ${i}` })); }
  seedLegacy(store, conversation('legacy-0', { collection: 'Separate' }));
  const progress = [], pool = store._workPool(); let described = 0;
  const run = pool.run.bind(pool); pool.run = (task, options) => { if (task.kind === 'describe') described++; return run(task, options); };
  const preview = await store.previewDeduplicationAsync({}, { onProgress: event => progress.push(event) });
  assert.equal(preview.count, 8); assert.equal(preview.scanned, 17);
  assert.equal(progress.at(-1).current, 17); assert.equal(progress.at(-1).total, 17);
  assert.ok(progress.every((event, index) => !index || event.current >= progress[index - 1].current));
  const reads = described;
  assert.deepEqual(await store.previewDeduplicationAsync({}), preview); assert.equal(described, reads);
  const mutation = await store.prepareDeduplicationAsync({ expectedRevision: preview.revision, ids: preview.entries.map(entry => entry.id) });
  assert.equal(described, reads, 'apply must not repeat the scan');
  const result = store.applyMutation(mutation); assert.equal(result.removedIds.length, 8); assert.equal(store.files().total, 9);
  assert.equal(store.files({ collection: 'Separate' }).total, 1);
});

test('history-only selection keeps the conversation and leaves unselected history reviewable', async t => {
  const store = setup(t), ids = [];
  for (const id of ['history-a', 'history-b']) {
    const saved = seedLegacy(store, conversation(id, { deduplicationHistory: [conversation(`superseded-${id}`)] })).summary;
    store._open().prepare('UPDATE conversations SET cleanup_version=0 WHERE id=?').run(saved.id); ids.push(saved.id);
  }
  const preview = await store.previewDeduplicationAsync({});
  assert.equal(preview.count, 2); assert.equal(preview.historyRecords, 2); assert.equal(preview.duplicates, 0);
  assert.ok(preview.entries.every(entry => entry.historyOnly && entry.keepId === entry.id));
  const mutation = await store.prepareDeduplicationAsync({ expectedRevision: preview.revision, ids: [ids[0]] });
  assert.equal(mutation.ids.length, 0); assert.equal(mutation.replacements.length, 1);
  const result = store.applyMutation(mutation); assert.equal(result.historyCleaned, 1); assert.equal(store.files().total, 2);
  assert.equal(Object.hasOwn(store.thread({ id: ids[0] }), 'deduplicationHistory'), false);
  assert.equal(Object.hasOwn(store.thread({ id: ids[1] }), 'deduplicationHistory'), true);
  const remaining = await store.previewDeduplicationAsync({}); assert.equal(remaining.count, 1); assert.equal(remaining.entries[0].id, ids[1]);
});

test('wrapped legacy source histories are repairable without touching message text or user data', async t => {
  const store = setup(t);
  const literal = 'Keep the literal property name deduplicationHistory in this explanation.';
  const userData = { deduplicationHistory: ['This is user-provided data, not stored conversation history.'] };
  const original = conversation('wrapped-original', {
    turns: [{ user: literal, attachments: [{ data: userData }] }, { ai: 'Answer', model: 'test-model' }],
    deduplicationHistory: [conversation('obsolete-hidden-copy')],
    raw: { arbitraryDictionary: userData },
  });
  const documents = [
    conversation('wrapped-file', { raw: original }),
    conversation('wrapped-server', { raw: { serverUrl: 'http://localhost:3000', thread: original } }),
    conversation('legitimate-data', { turns: original.turns, raw: { arbitraryDictionary: userData } }),
  ];
  const ids = documents.map(document => seedLegacy(store, document).summary.id);
  const preview = await store.previewDeduplicationAsync({});
  assert.equal(preview.historyRecords, 2); assert.equal(preview.duplicates, 0);
  assert.deepEqual(new Set(preview.entries.map(entry => entry.id)), new Set(ids.slice(0, 2)));
  const result = store.applyMutation(await store.prepareDeduplicationAsync({ expectedRevision: preview.revision, ids: ids.slice(0, 2) }));
  assert.equal(result.historyCleaned, 2); assert.equal(result.removedIds.length, 0); assert.equal(store.files().total, 3);
  const local = store.thread({ id: ids[0] }).raw;
  const remote = store.thread({ id: ids[1] }).raw.thread;
  for (const saved of [local, remote]) {
    assert.equal(Object.hasOwn(saved, 'deduplicationHistory'), false);
    assert.equal(saved.turns[0].user, literal);
    assert.deepEqual(saved.turns[0].attachments[0].data, userData);
    assert.deepEqual(saved.raw.arbitraryDictionary, userData);
  }
  assert.deepEqual(store.thread({ id: ids[2] }).raw.arbitraryDictionary, userData);
  assert.equal((await store.previewDeduplicationAsync({})).count, 0);
});

test('cancelling a parallel review changes no archive rows and the pool can be reused', async t => {
  const store = setup(t); for (let i = 0; i < 12; i++) seedLegacy(store, conversation(`cancel-${i}`, { provider: 'grok' }));
  const before = store.revision(), controller = new AbortController();
  await assert.rejects(store.previewDeduplicationAsync({}, { signal: controller.signal, onProgress: event => { if (event.current > 0) controller.abort(); } }), /abort|cancel/i);
  assert.equal(store.revision(), before); assert.equal(store.files().total, 12);
  const preview = await store.previewDeduplicationAsync({}); assert.equal(preview.count, 0);
});

test('a failed canonical update rolls back every superseded deletion and retains old content', async t => {
  const store = setup(t), first = seedLegacy(store, conversation('rollback')).summary;
  seedLegacy(store, conversation('rollback', { title: 'Other old title' }));
  const revision = store.revision();
  const mutation = await store.prepareUpsertAsync(conversation('rollback', { title: 'Rejected title' }));
  store._open().exec("CREATE TRIGGER reject_update BEFORE UPDATE ON conversations WHEN NEW.title='Rejected title' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
  assert.throws(() => store.applyMutation(mutation), /synthetic failure/);
  assert.equal(store.files().total, 2); assert.equal(store.revision(), revision); assert.equal(store.thread({ id: first.id }).title, 'Conversation rollback');
});

test('unique repaired stable-ID rows are reviewed without decoding their bodies', async t => {
  const store = setup(t); for (let i = 0; i < 5; i++) store.upsert(conversation(`unique-${i}`));
  store._workPool().run = () => { throw new Error('Unnecessary decode'); };
  const preview = await store.previewDeduplicationAsync({}); assert.equal(preview.count, 0); assert.equal(preview.scanned, 5);
});

test('disk preflight runs before new immutable objects and failure leaves the archive unchanged', async t => {
  const store = setup(t); let bytes = 0;
  await assert.rejects(store.prepareUpsertAsync(conversation('space'), { beforeWrite: ({ expandedBytes }) => { bytes = expandedBytes; throw new Error('Insufficient disk space'); } }), /Insufficient disk space/);
  assert.ok(bytes > 0); assert.equal(store.files().total, 0); assert.equal(store.revision(), 0);
});

test('aborting an actual 8 MiB worker write removes its private codec and partial-file staging', async t => {
  const store = setup(t), pool = store._workPool(), controller = new AbortController();
  const document = conversation('cancel-write', { raw: { bytes: randomBytes(8 * 1024 * 1024).toString('base64') } });
  let sawCodec = false;
  const timer = setInterval(() => {
    for (const slot of pool.slots) {
      try {
        if (readdirSync(slot.stagingDirectory).some(name => name.startsWith('threadshelf-codec-'))) {
          sawCodec = true; controller.abort(); clearInterval(timer); break;
        }
      } catch { /* The worker may have completed its cleanup between reads. */ }
    }
  }, 5);
  try {
    await assert.rejects(pool.run({ kind: 'write', document, estimatedBytes: 12 * 1024 * 1024 }, { signal: controller.signal }), /abort|cancel/i);
    await pool.close();
  } finally { clearInterval(timer); }
  assert.equal(sawCodec, true, 'cancellation happened during real native compression');
  assert.equal(readdirSync(store.contentDir).some(name => name.startsWith('reader-archive-worker-') || name.endsWith('.part')), false);
  assert.equal(store.files().total, 0);
});

test('worker filesystem codes and wrapped ENOSPC survive the worker error protocol', async t => {
  const diskFull = Object.assign(new Error('No space left on device'), { code: 'ENOSPC' });
  const wrapped = Object.assign(new Error('Storage compression failed', { cause: diskFull }), { code: 'CODEC_PROCESS' });
  for (const source of [diskFull, wrapped]) {
    const message = JSON.parse(JSON.stringify(serializeArchiveWorkerError(source)));
    const error = restoreArchiveWorkerError(message);
    assert.equal(error.code, 'ENOSPC'); assert.equal(error.message, source.message);
  }
  const store = setup(t), saved = store.upsert(conversation('missing-object'));
  const row = store._open().prepare('SELECT content_ref FROM conversations WHERE id=?').get(saved.summary.id);
  const ref = JSON.parse(row.content_ref);
  unlinkSync(join(store.contentDir, ref.header.blocks[0].file));
  await assert.rejects(store._workPool().run({ kind: 'read', contentRef: ref }), error => error.code === 'ENOENT');
});
