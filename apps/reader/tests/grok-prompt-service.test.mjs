import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ApplicationService } from '../src/core/service.mjs';
import { ThreadShelfClient } from '../src/core/server.mjs';
import { prepareLegacyUpsert } from './helpers/legacy-archive.mjs';
import { localReadingKey } from '../src/core/manager-reading.mjs';

// Synthetic fixture only. Private diagnostic exports are never distributed.
const source = JSON.parse(await fs.readFile(new URL('./fixtures/grok-unanswered-server.json', import.meta.url), 'utf8'));
function sample(id = 'synthetic-grok-unanswered', collection = 'Grok') {
  const document = structuredClone(source);
  document.collection = collection; document.conversationKey = `grok:${id}`;
  document.title = 'Synthetic unanswered conversation'; document.sourceFile = `${id}.json`;
  delete document.id; delete document.collectionId;
  document.sourceIdentity = { kind: 'threadshelf', serverUrl: 'http://127.0.0.1:3000', collection, sourceFile: `${id}.json`, conversationKey: document.conversationKey };
  if (document.raw?.thread) {
    document.raw.thread.collection = collection; document.raw.thread.conversationKey = document.conversationKey;
    document.raw.thread.sourceFile = document.sourceFile; document.raw.thread.sourceIdentity = document.sourceIdentity;
    document.raw.thread.raw.conversation.id = id;
  }
  return document;
}
const answered = (collection = 'Grok') => ({ provider: 'grok', collection, conversationKey: 'grok:synthetic-answered-control', sourceFile: 'answered.json', title: 'Synthetic answered conversation',
  turns: [{ user: 'A synthetic question', turn_index: 0 }, { ai: 'A meaningful answer', model: 'grok-test', turn_index: 1 }] });

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'reader-grok-'));
  const dataDir = path.join(directory, 'profile'); let service = await new ApplicationService({ dataDir }).init(); await service.ensureLocal();
  t.after(async () => { await service.shutdown(); await fs.rm(directory, { recursive: true, force: true }); });
  return { directory, get service() { return service; }, async reopen() { await service.shutdown(); service = await new ApplicationService({ dataDir }).init(); await service.ensureLocal(); } };
}
async function seed(service, document) { return service.commitMutation(prepareLegacyUpsert(service.store, document)); }
async function bookmark(service, row) {
  return service.handle('reading.save', { key: localReadingKey(row.id), bookmark: { turnIndex: 0, role: 'user', title: row.title,
    ref: { mode: 'local', id: row.id, collection: row.collection, conversationKey: row.conversationKey, sourceFile: row.sourceFile } } });
}

test('Settings review rescans existing Grok rows and deletes only selected unanswered conversations', async t => {
  const f = await fixture(t);
  const first = (await seed(f.service, sample('legacy-a', 'Grok A'))).summary;
  const second = (await seed(f.service, sample('legacy-b', 'Grok B'))).summary;
  const keep = (await seed(f.service, answered('Grok A'))).summary;
  for (const row of [first, second, keep]) await bookmark(f.service, row);
  f.service.store.db.exec('UPDATE conversations SET cleanup_version=1');
  await f.service.checkpoint(false); await f.reopen();
  assert.equal(f.service.deduplicationSettings.value.deleteOtherPromptOnlyAutomatically, false);
  assert.ok(f.service.store.db.prepare('SELECT cleanup_version FROM conversations').all().every(row => row.cleanup_version === 1));
  const all = await f.service.handle('manager.dedup.preview', {});
  assert.equal(all.promptOnly, 2); assert.equal(all.count, 2);
  const scoped = await f.service.handle('manager.dedup.preview', { collectionIds: [first.collectionId] });
  assert.equal(scoped.count, 1); assert.equal(scoped.entries[0].id, first.id); assert.equal(scoped.entries[0].reason, 'grok-prompt-only');
  const removed = await f.service.handle('manager.dedup.apply', { collectionIds: [first.collectionId], expectedRevision: scoped.revision, ids: [first.id] });
  assert.deepEqual(removed.removedIds, [first.id]); assert.equal(removed.cleanupPending, false);
  assert.equal(f.service.store.files().total, 2); assert.ok(f.service.store.getConversationSummary(second.id)); assert.ok(f.service.store.getConversationSummary(keep.id));
  assert.equal(removed.reading.bookmarks.length, 2); assert.ok(removed.reading.bookmarks.some(item => item.key === localReadingKey(keep.id)));
  assert.equal((await f.service.storage.status()).orphanObjectBytes, 0);
  const remaining = await f.service.handle('manager.dedup.preview', {});
  assert.equal(remaining.count, 1); assert.equal(remaining.entries[0].id, second.id);
});

test('native Grok exports and normalized Reader files discard empty usage-limit responses during import', async t => {
  const f = await fixture(t), normalized = sample('normalized-file'), raw = sample('native-file');
  const files = [path.join(f.directory, 'normalized.json'), path.join(f.directory, 'native.json'), path.join(f.directory, 'answered.json')];
  await fs.writeFile(files[0], JSON.stringify(normalized));
  await fs.writeFile(files[1], JSON.stringify({ conversations: [raw.raw.thread.raw] }));
  await fs.writeFile(files[2], JSON.stringify(answered()));
  const result = await f.service.handle('import.paths', { paths: files, collection: 'Grok' });
  assert.equal(result.errors.length, 0); assert.equal(result.processed, 3); assert.equal(result.skipped, 2); assert.equal(result.imported, 1);
  assert.equal(result.deduplication.promptOnly, 2); assert.equal(f.service.store.files().total, 1);
  assert.equal(f.service.store.thread({ id: f.service.store.files().files[0].id }).turns[1].ai, 'A meaningful answer');
  const again = await f.service.handle('import.paths', { paths: files, collection: 'Grok' });
  assert.equal(again.errors.length, 0); assert.equal(again.imported, 0); assert.equal(f.service.store.files().total, 1);
});

test('server copy discards unanswered raw-backed Grok turns while preserving an answered conversation', async t => {
  const f = await fixture(t), documents = [sample('server-a'), sample('server-b'), answered()];
  const summaries = documents.map(document => ({ collection: 'Grok', sourceFile: document.sourceFile, conversationKey: document.conversationKey,
    title: document.title, provider: document.provider, turnCount: document.turns.length }));
  const get = ThreadShelfClient.prototype.get;
  ThreadShelfClient.prototype.get = async function(endpoint, params = {}) {
    if (endpoint === 'api/collections') return { collections: ['Grok'] };
    if (endpoint === 'api/files') return { files: summaries };
    if (endpoint === 'api/thread') {
      const document = documents.find(item => item.conversationKey === params.conversationKey);
      return document.raw?.thread || document;
    }
    throw new Error('Unexpected synthetic endpoint.');
  };
  try {
    const result = await f.service.handle('server.import', { serverUrl: 'http://127.0.0.1:3000', collections: ['Grok'] });
    assert.equal(result.errors.length, 0); assert.equal(result.processed, 3); assert.equal(result.imported, 1); assert.equal(result.skipped, 2);
    assert.equal(result.deduplication.promptOnly, 2); assert.equal(f.service.store.files().total, 1);
    const again = await f.service.handle('server.import', { serverUrl: 'http://127.0.0.1:3000', collections: ['Grok'] });
    assert.equal(again.imported, 0); assert.equal(f.service.store.files().total, 1);
  } finally { ThreadShelfClient.prototype.get = get; }
});

test('Grok cleanup is independent of the optional other-provider switch and model names', async t => {
  const f = await fixture(t);
  const grok = sample('grok-provider');
  const venice = { ...sample('venice-provider'), provider: 'venice', conversationKey: 'venice:synthetic-unreliable-id' };
  const chatgpt = { ...sample('chatgpt-provider'), provider: 'openai', conversationKey: 'openai:synthetic-trusted-id' };
  const paths = [];
  for (const [index, document] of [grok, venice, chatgpt].entries()) { const file = path.join(f.directory, `provider-${index}.json`); await fs.writeFile(file, JSON.stringify(document)); paths.push(file); }
  const result = await f.service.handle('import.paths', { paths, collection: 'Mixed' });
  assert.equal(f.service.deduplicationSettings.value.deleteOtherPromptOnlyAutomatically, false);
  assert.equal(result.errors.length, 0); assert.equal(result.deduplication.promptOnly, 1); assert.equal(f.service.store.files().total, 2);
  assert.deepEqual(new Set(f.service.store.files().files.map(row => row.provider)), new Set(['venice', 'openai']));
  assert.equal((await f.service.handle('manager.dedup.preview', {})).count, 0);
});
