import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ApplicationService } from '../src/core/service.mjs';
import { localReadingKey } from '../src/core/manager-reading.mjs';

function gate() {
  let entered, release;
  return { entered: new Promise(resolve => { entered = resolve; }),
    blocked: new Promise(resolve => { release = resolve; }),
    arrive: () => entered(), release: () => release() };
}
const settleTurn = () => new Promise(resolve => setImmediate(resolve));
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tslr-service-lifecycle-'));
  const dataDir = path.join(root, 'profile');
  let service = await new ApplicationService({ dataDir }).init();
  t.after(async () => { await service.shutdown().catch(() => {}); await fs.rm(root, { recursive: true, force: true }); });
  const source = path.join(root, 'source.json');
  await fs.writeFile(source, JSON.stringify({ id: 'one', title: 'Retained conversation', messages: [{ role: 'user', content: 'Durable cobalt text' }] }));
  const imported = await service.handle('import.paths', { paths: [source], collection: 'Original' });
  assert.equal(imported.imported, 1); assert.deepEqual(imported.errors, []);
  return { root, dataDir, get service() { return service; },
    async reopen() { await service.shutdown(); service = await new ApplicationService({ dataDir }).init(); return service; },
    async backup() { const file = path.join(root, 'backup.zip'); await service.handle('manager.backup', { path: file }); await service.handle('manager.restore.preview', { path: file }); return file; } };
}

test('concurrent Local reads, status and mutation wait for journal recovery before exposing the archive', { timeout: 15000 }, async t => {
  const f = await fixture(t);
  await f.service.handle('settings.save', { values: { mode: 'server' } }); await f.reopen();
  assert.equal(f.service.store, null);
  const paused = gate(), originalApply = f.service.applyRecord.bind(f.service);
  f.service.applyRecord = async (record, meta) => { if (meta?.replay) { paused.arrive(); await paused.blocked; } return originalApply(record, meta); };
  const mounting = f.service.handle('files', { mode: 'local' }); await paused.entered;
  let readSettled = false, statusSettled = false, mutationSettled = false;
  const read = f.service.handle('files', { mode: 'local' }).finally(() => { readSettled = true; });
  const status = f.service.handle('search.status').finally(() => { statusSettled = true; });
  const mutation = f.service.handle('manager.mutate', { operation: 'create', name: 'After recovery' }).finally(() => { mutationSettled = true; });
  await settleTurn(); await settleTurn();
  const premature = { readSettled, statusSettled, mutationSettled };
  paused.release();
  const [mounted, listed, , created] = await Promise.all([mounting, read, status, mutation]);
  assert.deepEqual(premature, { readSettled: false, statusSettled: false, mutationSettled: false });
  assert.equal(mounted.total, 1); assert.equal(listed.total, 1); assert.equal(created.collection.name, 'After recovery');
  assert.equal(f.service.storage.poisoned, null);
  assert.equal(f.service.storage.sequence, 2);
  await f.reopen();
  assert.equal((await f.service.handle('files', { mode: 'local' })).total, 1);
  assert.ok((await f.service.handle('manager.status')).collections.some(c => c.name === 'After recovery'));
});

test('reads and status wait through restore without mounting twice or closing the restored session', { timeout: 15000 }, async t => {
  const f = await fixture(t), backup = await f.backup(), owned = f.service.storage, paused = gate();
  owned.fault = async name => { if (name === 'before-pointer') { paused.arrive(); await paused.blocked; } };
  const restoring = f.service.handle('manager.restore', { path: backup }); await paused.entered;
  let readSettled = false, managerSettled = false, statusSettled = false;
  const read = f.service.handle('files', { mode: 'local' }).finally(() => { readSettled = true; });
  const manager = f.service.handle('manager.status').finally(() => { managerSettled = true; });
  const status = f.service.handle('search.status').finally(() => { statusSettled = true; });
  // New searches are rejected while management owns the archive; Server/UI
  // settings remain usable without waiting for the Local transition.
  await assert.rejects(f.service.handle('search', { mode: 'local', q: 'cobalt' }), /being managed/);
  await f.service.handle('settings.save', { values: { language: 'hu' } });
  await settleTurn(); const premature = { readSettled, managerSettled, statusSettled }; paused.release();
  const [restored, listed, managed] = await Promise.all([restoring, read, manager, status]);
  assert.deepEqual(premature, { readSettled: false, managerSettled: false, statusSettled: false });
  assert.equal(restored.ok, true); assert.equal(listed.total, 1); assert.equal(managed.collections[0].count, 1);
  assert.equal(f.service.storage, owned); assert.equal(owned.closed, false); assert.ok(f.service.store.db);
  assert.equal((await f.service.handle('bootstrap')).settings.language, 'hu');
  await f.reopen(); assert.equal((await f.service.handle('files', { mode: 'local' })).total, 1);
});

test('Local waiters recover the previous durable archive when restore publication fails', { timeout: 15000 }, async t => {
  const f = await fixture(t), backup = await f.backup(), owned = f.service.storage, paused = gate();
  owned.fault = async name => { if (name === 'before-pointer') { paused.arrive(); await paused.blocked; throw new Error('Injected restore publication failure'); } };
  const restoring = f.service.handle('manager.restore', { path: backup });
  const rejected = assert.rejects(restoring, /Injected restore publication failure/);
  await paused.entered;
  const read = f.service.handle('files', { mode: 'local' });
  const status = f.service.handle('manager.status');
  await settleTurn(); paused.release();
  await rejected;
  assert.equal((await read).total, 1); assert.equal((await status).collections[0].count, 1);
  assert.notEqual(f.service.storage, owned); assert.equal(owned.closed, true); assert.ok(f.service.store.db);
  await f.reopen(); assert.equal((await f.service.handle('files', { mode: 'local' })).total, 1);
});

test('shutdown waits for restore and already accepted Local readers before closing their handles', { timeout: 15000 }, async t => {
  const f = await fixture(t), backup = await f.backup(), owned = f.service.storage, paused = gate();
  owned.fault = async name => { if (name === 'before-pointer') { paused.arrive(); await paused.blocked; } };
  const restoring = f.service.handle('manager.restore', { path: backup }); await paused.entered;
  const read = f.service.handle('files', { mode: 'local' }), closing = f.service.shutdown();
  await settleTurn(); paused.release();
  const [restored, listed, closed] = await Promise.all([restoring, read, closing]);
  assert.equal(restored.ok, true); assert.equal(listed.total, 1); assert.equal(closed.ok, true); assert.equal(owned.closed, true);
  await f.reopen(); assert.equal((await f.service.handle('files', { mode: 'local' })).total, 1);
});

test('stale prepared mutations are rejected before durable append, including unchanged imports', async t => {
  const f = await fixture(t);
  const pending = f.service.store.prepareMutation({ operation: 'create', name: 'Stale pending' });
  const row = f.service.store.files().files[0];
  const unchanged = f.service.store.prepareUpsert(f.service.store.thread({ id: row.id }));
  assert.equal(unchanged.unchanged, true);
  await f.service.handle('manager.mutate', { operation: 'create', name: 'Valid newer change' });
  const sequence = f.service.storage.sequence;
  await assert.rejects(f.service.serialized(() => f.service.commitMutation(pending)), /changed before.*saved/);
  await assert.rejects(f.service.serialized(() => f.service.commitMutation(unchanged)), /changed before.*saved/);
  assert.equal(f.service.storage.sequence, sequence); assert.equal(f.service.storage.poisoned, null);
  await f.reopen();
  assert.ok((await f.service.handle('manager.status')).collections.some(c => c.name === 'Valid newer change'));
  assert.ok(!(await f.service.handle('manager.status')).collections.some(c => c.name === 'Stale pending'));
});

test('Local mount reconciliation preserves a Server reading write already queued ahead of it', { timeout: 15000 }, async t => {
  const f = await fixture(t), row = f.service.store.files().files[0], key = localReadingKey(row.id);
  await f.service.handle('reading.save', { key, position: { turnIndex: 0, role: 'user', offset: .3, ref: { mode: 'local', id: row.id } } });
  await f.service.reading.update(v => ({ ...v, positions: { ...v.positions, [key]: { ...v.positions[key], ref: { ...v.positions[key].ref, collection: 'Old display name' } } } }));
  await f.service.handle('settings.save', { values: { mode: 'server' } }); await f.reopen();
  const paused = gate(), queued = gate(), originalUpdate = f.service.reading.update.bind(f.service.reading);
  const serverKey = JSON.stringify({ mode: 'server', serverUrl: 'https://example.test', id: 'server-only' });
  const serverEntry = { turnIndex: 23, role: 'user', offset: .45, ref: { mode: 'server', serverUrl: 'https://example.test', id: 'server-only' } };
  const serverWrite = originalUpdate(async v => { paused.arrive(); await paused.blocked; return { ...v, positions: { ...v.positions, [serverKey]: serverEntry } }; });
  await paused.entered;
  f.service.reading.update = fn => { queued.arrive(); return originalUpdate(fn); };
  const mounting = f.service.handle('files', { mode: 'local' });
  await queued.entered;
  const bootstrap = f.service.handle('bootstrap');
  await settleTurn(); paused.release();
  const [, , boot] = await Promise.all([serverWrite, mounting, bootstrap]);
  assert.deepEqual(boot.reading.positions[serverKey], serverEntry);
  assert.equal(boot.reading.positions[key].ref.collection, 'Original');
  const reading = (await f.service.handle('bootstrap')).reading;
  assert.deepEqual(reading.positions[serverKey], serverEntry);
  assert.equal(reading.positions[key].ref.collection, 'Original');
});


test('a Database Manager status read started before restore retries after the archive changes', { timeout: 15000 }, async t => {
  const f = await fixture(t), backup = await f.backup(), storage = f.service.storage;
  const statusPaused = gate(), restorePaused = gate(), originalStatus = storage.status.bind(storage);
  let firstStatus = true, statusSettled = false;
  storage.status = async () => {
    const value = await originalStatus();
    if (firstStatus) { firstStatus = false; statusPaused.arrive(); await statusPaused.blocked; }
    return value;
  };
  const statusResult = f.service.handle('manager.status').then(value => { statusSettled = true; return { value }; }, error => { statusSettled = true; return { error }; });
  await statusPaused.entered;
  storage.fault = async name => { if (name === 'before-pointer') { restorePaused.arrive(); await restorePaused.blocked; } };
  const restoring = f.service.handle('manager.restore', { path: backup }); await restorePaused.entered;
  statusPaused.release(); await settleTurn(); await settleTurn();
  const settledDuringRestore = statusSettled; restorePaused.release();
  const [status] = await Promise.all([statusResult, restoring]);
  assert.equal(settledDuringRestore, false);
  assert.equal(status.error, undefined);
  assert.equal(status.value.collections[0].count, 1);
  assert.equal(status.value.storage.sequence, f.service.storage.sequence);
  assert.equal(status.value.storage.snapshotSequence, f.service.storage.pointer.sequence);
  assert.equal(f.service.storage.closed, false);
});
