import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ApplicationService } from '../src/core/service.mjs';
import { localReadingKey, reconcileLocalReading } from '../src/core/manager-reading.mjs';
import { readingSourceFor } from '../src/core/reading-identity.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tslr-reading-recovery-')), dataDir = path.join(root, 'profile');
  let service = await new ApplicationService({ dataDir }).init();
  t.after(async () => { await service?.shutdown().catch(() => {}); await fs.rm(root, { recursive: true, force: true }); });
  const filename = path.join(root, 'source.json');
  await fs.writeFile(filename, JSON.stringify({ id: 'reading-fixture', title: 'Saved conversation', messages: [{ role: 'user', content: 'Retain the original reading anchor.' }] }));
  assert.deepEqual((await service.handle('import.paths', { paths: [filename], collection: 'Original' })).errors, []);
  const row = (await service.handle('files', { mode: 'local' })).files[0], key = localReadingKey(row.id);
  const ref = { mode: 'local', id: row.id, collection: row.collection, sourceFile: row.sourceFile, conversationKey: row.conversationKey };
  const anchor = { turnIndex: 0, role: 'user', offset: .25, ref };
  await service.handle('reading.save', { key, position: anchor, bookmark: anchor });
  return { root, dataDir, row, key, ref, anchor, get service() { return service; }, async stop() { await service.shutdown(); }, async open() { service = await new ApplicationService({ dataDir }).init(); }, async reopen() { await service.shutdown(); service = await new ApplicationService({ dataDir }).init(); } };
}
const reading = async service => (await service.handle('bootstrap')).reading;

test('missing primary and backup reading files recover Local reading from the verified normal snapshot', async t => {
  const f = await fixture(t); await f.service.handle('manager.maintenance', { operation: 'compact' });
  const expected = await reading(f.service); await f.stop();
  await fs.rm(path.join(f.dataDir, 'reading-v2.json')); await fs.rm(path.join(f.dataDir, 'reading-v2.json.bak'), { force: true });
  await f.open(); const restored = await reading(f.service);
  assert.deepEqual(restored.positions[f.key], expected.positions[f.key]);
  assert.deepEqual(restored.bookmarks, expected.bookmarks); assert.deepEqual(restored.recent, expected.recent);
});

test('manager clear preserves ambiguous legacy reading ownership instead of guessing Local', () => {
  const key = 'legacy-ambiguous';
  const entry = { key, turnIndex: 0, role: 'user', ref: { mode: 'local', id: 'local-one' }, position: { ref: { mode: 'server', serverUrl: 'https://example.test/', id: 'server-one' } } };
  assert.equal(readingSourceFor(entry), null, 'established source resolver refuses contradictory ownership');
  const value = { positions: { [key]: entry }, bookmarks: [entry], recent: [entry] };
  assert.deepEqual(reconcileLocalReading(value, { clearLocal: true }), value);
});

test('late reading callbacks after a collection rename keep authoritative collection metadata', async t => {
  const f = await fixture(t), collection = (await f.service.handle('manager.status')).collections.find(c => c.name === 'Original');
  await f.service.handle('manager.mutate', { operation: 'rename', collectionId: collection.id, name: 'Renamed' });
  // The reader may finish a debounced save with the original navigation ref.
  await f.service.handle('reading.save', { key: f.key, position: f.anchor, bookmark: f.anchor });
  const saved = await reading(f.service);
  assert.equal(saved.positions[f.key].ref.collection, 'Renamed');
  assert.equal(saved.bookmarks.find(b => b.key === f.key).ref.collection, 'Renamed');
  assert.equal(saved.recent.find(b => b.key === f.key).ref.collection, 'Renamed');
});

test('ordinary Local history and bookmark clears stay cleared across old journal replay', async t => {
  const f = await fixture(t);
  await f.service.handle('manager.mutate', { operation: 'copy', ids: [f.row.id], targetName: 'Copy', copyBookmarks: true });
  const serverKey = JSON.stringify({ mode: 'server', serverUrl: 'https://example.test/', id: 'remote-one' });
  const serverAnchor = { turnIndex: 4, role: 'user', offset: .8, ref: JSON.parse(serverKey) };
  await f.service.handle('reading.save', { key: serverKey, position: serverAnchor, bookmark: serverAnchor });
  await f.service.handle('reading.save', { key: f.key, clear: 'all', sourceScope: { mode: 'local' } });
  const expected = await reading(f.service);
  for (let i = 0; i < 2; i++) {
    await f.reopen(); const saved = await reading(f.service);
    assert.deepEqual(saved.positions, expected.positions); assert.deepEqual(saved.bookmarks, expected.bookmarks); assert.deepEqual(saved.recent, expected.recent);
    assert.deepEqual(Object.keys(saved.positions), [serverKey]);
  }
});

test('recovering reading.json.bak does not merge an older Local snapshot over an intentional clear', async t => {
  const f = await fixture(t), serverKey = JSON.stringify({ mode: 'server', serverUrl: 'https://example.test/', id: 'remote-backup' });
  const serverAnchor = { turnIndex: 2, role: 'user', offset: .5, ref: JSON.parse(serverKey) };
  await f.service.handle('reading.save', { key: serverKey, position: serverAnchor, bookmark: serverAnchor });
  await f.service.handle('manager.maintenance', { operation: 'compact' });
  await f.service.handle('reading.save', { key: f.key, clear: 'all', sourceScope: { mode: 'local' } });
  const expected = await reading(f.service);
  // A later saved Server position makes the cleared state the validated .bak.
  await f.service.handle('reading.save', { key: serverKey, position: { ...serverAnchor, turnIndex: 5 } });
  await f.stop(); await fs.rm(path.join(f.dataDir, 'reading-v2.json')); await f.open();
  const restored = await reading(f.service);
  assert.deepEqual(restored.positions, expected.positions); assert.deepEqual(restored.bookmarks, expected.bookmarks); assert.deepEqual(restored.recent, expected.recent);
  assert.ok(!restored.positions[f.key]);
});

test('restore preview rejects checksum-valid malformed reading metadata before publishing a database', async t => {
  const f = await fixture(t), filename = path.join(f.root, 'invalid-reading.zip');
  // Exercise semantic validation: all ZIP CRCs, manifest hashes and SQLite checks pass.
  await f.service.storage.backup(filename, { archiveDb: f.service.store.db, reading: { positions: null, bookmarks: [], recent: [] } });
  await assert.rejects(f.service.handle('manager.restore.preview', { path: filename }), /reading|saved|metadata/i);
  assert.equal((await f.service.handle('files', { mode: 'local' })).files[0].id, f.row.id);
});

test('lazy Local snapshot recovery preserves Server reading saved after missing-file startup', async t => {
  const f = await fixture(t); await f.service.handle('manager.maintenance', { operation: 'compact' });
  const originalLocal = (await reading(f.service)).positions[f.key];
  await f.service.handle('settings.save', { values: { mode: 'server' } }); await f.stop();
  await fs.rm(path.join(f.dataDir, 'reading-v2.json')); await fs.rm(path.join(f.dataDir, 'reading-v2.json.bak'), { force: true });
  await f.open(); assert.equal(f.service.store, null);
  const key = JSON.stringify({ mode: 'server', serverUrl: 'https://example.test/', id: 'new-server-reading' });
  const anchor = { turnIndex: 13, role: 'user', offset: .75, ref: JSON.parse(key) };
  await f.service.handle('reading.save', { key, position: anchor, bookmark: anchor });
  const serverBefore = await reading(f.service); assert.equal(f.service.store, null);
  await f.service.handle('files', { mode: 'local' }); const saved = await reading(f.service);
  assert.deepEqual(saved.positions[f.key], originalLocal);
  assert.deepEqual(saved.positions[key], serverBefore.positions[key]);
  assert.deepEqual(saved.bookmarks.filter(entry => entry.key === key), serverBefore.bookmarks);
  assert.deepEqual(saved.recent.filter(entry => entry.key === key), serverBefore.recent);
});
