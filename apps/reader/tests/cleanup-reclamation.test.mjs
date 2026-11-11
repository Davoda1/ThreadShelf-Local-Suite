import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ApplicationService } from '../src/core/service.mjs';
import { prepareLegacyUpsert } from './helpers/legacy-archive.mjs';
import { contentObjects } from '../src/core/content-packs.mjs';
import { localReadingKey } from '../src/core/manager-reading.mjs';

async function setup(t) {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'reader-cleanup-reclaim-'));
  const service = await new ApplicationService({ dataDir: path.join(directory, 'profile') }).init();
  await service.ensureLocal();
  t.after(async () => { await service.shutdown(); await fs.rm(directory, { recursive: true, force: true }); });
  return { service, directory };
}
const document = (answer, extra = {}) => ({ provider: 'openai', collection: 'ChatGPT', conversationKey: 'openai:same', sourceFile: 'same.json', title: 'Same conversation',
  turns: [{ user: 'Question', turn_index: 0 }, { ai: answer, model: 'test-model', turn_index: 1 }], raw: { id: 'same', answer }, ...extra });
const filesFor = (service, id) => [...contentObjects(JSON.parse(service.store.db.prepare('SELECT content_ref FROM conversations WHERE id=?').get(id).content_ref))].map(item => item.file);

test('manual cleanup immediately retires obsolete snapshots, journals and source objects', async t => {
  const { service } = await setup(t);
  const old = await service.commitMutation(prepareLegacyUpsert(service.store, document('Old answer'), { at: '2020-01-01T00:00:00.000Z' }));
  await service.commitMutation(prepareLegacyUpsert(service.store, document('Current answer'), { at: '2021-01-01T00:00:00.000Z' }));
  const oldFiles = filesFor(service, old.summary.id);
  await service.checkpoint(false);
  const preview = await service.handle('manager.dedup.preview', {});
  const result = await service.handle('manager.dedup.apply', { expectedRevision: preview.revision, ids: preview.entries.map(entry => entry.id) });
  assert.equal(result.removedIds.length, 1); assert.equal(result.cleanupPending, false);
  const kept = service.store.files().files[0], live = new Set(filesFor(service, kept.id));
  const obsolete = oldFiles.filter(name => !live.has(name)); assert.ok(obsolete.length > 0);
  for (const file of obsolete) await assert.rejects(fs.stat(path.join(service.store.contentDir, file)), error => error.code === 'ENOENT');
  const status = await service.storage.status();
  assert.equal(status.orphanObjectBytes, 0); assert.equal(status.journalRecords, 0); assert.equal(status.recoveryBytes, 0);
});

test('inline file updates reclaim old objects once; failed reclamation preserves committed rows and bookmarks', async t => {
  const { service, directory } = await setup(t), filename = path.join(directory, 'input.json');
  await fs.writeFile(filename, JSON.stringify(document('Original answer')));
  await service.handle('import.paths', { paths: [filename], collection: 'ChatGPT' });
  const before = service.store.files().files[0], oldFiles = filesFor(service, before.id), key = localReadingKey(before.id);
  await service.handle('reading.save', { key, bookmark: { turnIndex: 1, role: 'ai', title: before.title, ref: { mode: 'local', id: before.id, collection: before.collection } } });
  await fs.writeFile(filename, JSON.stringify(document('Updated answer')));
  const checkpoint = service.checkpoint.bind(service); let checkpoints = 0;
  service.checkpoint = async (...args) => { checkpoints++; return checkpoint(...args); };
  const updated = await service.handle('import.paths', { paths: [filename], collection: 'ChatGPT' });
  assert.equal(checkpoints, 1); assert.equal(updated.updated, 1); assert.equal(updated.cleanupPending, false);
  const live = new Set(filesFor(service, before.id));
  for (const file of oldFiles.filter(name => !live.has(name))) await assert.rejects(fs.stat(path.join(service.store.contentDir, file)), error => error.code === 'ENOENT');
  await fs.writeFile(filename, JSON.stringify(document('Latest committed answer')));
  service.checkpoint = async () => { throw new Error('Synthetic snapshot write failure'); };
  const pending = await service.handle('import.paths', { paths: [filename], collection: 'ChatGPT' });
  service.checkpoint = checkpoint;
  assert.equal(pending.updated, 1); assert.equal(pending.changed, true); assert.equal(pending.cleanupPending, true);
  assert.match(pending.cleanupError, /Synthetic snapshot write failure/); assert.ok(pending.errors.some(item => /changes were saved/.test(item.error)));
  assert.equal(service.store.files().total, 1); assert.equal(service.store.thread({ id: before.id }).turns[1].ai, 'Latest committed answer');
  assert.equal(pending.reading.bookmarks.length, 1); assert.equal(pending.reading.bookmarks[0].key, key);
  await service.checkpoint(true); assert.equal((await service.storage.status()).orphanObjectBytes, 0);
});

test('manual reclamation failure returns committed deletion and bookmark reconciliation', async t => {
  const { service } = await setup(t);
  const old = await service.commitMutation(prepareLegacyUpsert(service.store, document('Old answer'), { at: '2020-01-01T00:00:00.000Z' }));
  const current = await service.commitMutation(prepareLegacyUpsert(service.store, document('Current answer'), { at: '2021-01-01T00:00:00.000Z' }));
  await service.handle('reading.save', { key: localReadingKey(old.summary.id), bookmark: { turnIndex: 1, role: 'ai', title: old.summary.title,
    ref: { mode: 'local', id: old.summary.id, collection: old.summary.collection } } });
  const preview = await service.handle('manager.dedup.preview', {}), checkpoint = service.checkpoint.bind(service);
  service.checkpoint = async () => { throw new Error('Synthetic reclamation failure'); };
  const result = await service.handle('manager.dedup.apply', { expectedRevision: preview.revision, ids: preview.entries.map(entry => entry.id) });
  service.checkpoint = checkpoint;
  assert.equal(result.changed, true); assert.equal(result.cleanupPending, true); assert.equal(result.removedIds.length, 1);
  assert.equal(result.remap[old.summary.id], current.summary.id); assert.equal(service.store.files().total, 1);
  assert.equal(result.reading.bookmarks[0].key, localReadingKey(current.summary.id));
  await service.checkpoint(true);
});
