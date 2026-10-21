import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyReading } from '../src/core/state.mjs';
import { normalizeReadingSourceScope, readingSourceFor, matchesReadingSource } from '../src/core/reading-identity.mjs';
import { ApplicationService } from '../src/core/service.mjs';

const local = { mode: 'local' };
const serverA = { mode: 'server', serverUrl: 'http://localhost:3000/' };
const serverB = { mode: 'server', serverUrl: 'http://127.0.0.1:3001/' };
const identity = (scope, id = 'same') => JSON.stringify({ ...scope, id, collection: 'Shared', sourceFile: '/same/export.json', conversationKey: id });
const anchor = { turnIndex: 7, role: 'ai', offset: 0.25 };
const empty = () => ({ positions: {}, bookmarks: [], recent: [] });
function add(value, scope, id = 'same') {
  const key = identity(scope, id);
  return applyReading(value, { key, position: { ...anchor, ref: { ...scope, id } }, bookmark: { ...anchor, ref: { ...scope, id } } });
}

test('reading source identity separates Local and canonical server addresses and trusts the persistent key', () => {
  assert.deepEqual(normalizeReadingSourceScope({ mode: 'server', serverUrl: 'HTTP://EXAMPLE.COM:80/reader///' }), { mode: 'server', serverUrl: 'http://example.com/reader/' });
  assert.equal(matchesReadingSource(identity(serverA), { ...serverA, serverUrl: 'http://localhost:3000' }), true);
  assert.equal(matchesReadingSource(identity(serverA), serverB), false);
  assert.equal(matchesReadingSource(identity(serverA), local), false);
  assert.equal(matchesReadingSource(identity(local), local), true);
  assert.equal(matchesReadingSource(identity({ mode: 'server', serverUrl: 'http://example.com/reader/' }), { mode: 'server', serverUrl: 'http://example.com/' }), false);
  assert.deepEqual(readingSourceFor({ key: identity(local), ref: serverA, position: { ref: serverB } }), local);
  assert.deepEqual(readingSourceFor({ key: 'legacy-readable', ref: serverA }), serverA);
  assert.equal(readingSourceFor({ key: 'legacy-ambiguous', ref: serverA, position: { ref: serverB } }), null);
  assert.equal(matchesReadingSource('unidentified-legacy', local), false);
  assert.equal(readingSourceFor(JSON.stringify({ mode: 'server' })), null);
  for (const scope of [null, {}, { mode: 'all' }, { mode: 'server' }, { mode: 'server', serverUrl: 'file:///tmp/a' }, { mode: 'server', serverUrl: 'http://name:secret@example.com/' }, { mode: 'server', serverUrl: 'http://example.com/?x=1' }]) assert.throws(() => normalizeReadingSourceScope(scope), /saved-reading/);
});

test('scoped clear preserves every other source and unidentified legacy entries', () => {
  let value = add(add(add(empty(), local), serverA), serverB);
  value.positions.unknown = { ...anchor };
  value.bookmarks.push({ key: 'unknown', ...anchor });
  value.recent.push({ key: 'unknown', ...anchor });
  value.positions.knownLegacy = { ...anchor, ref: serverA };
  value.bookmarks.push({ key: 'knownLegacy', ...anchor, ref: serverA });
  value.recent.push({ key: 'knownLegacy', ...anchor, ref: serverA });
  const localBefore = structuredClone(value.positions[identity(local)]);
  const serverBBefore = structuredClone(value.positions[identity(serverB)]);
  value = applyReading(value, { key: '', clear: 'all', sourceScope: { ...serverA, serverUrl: 'http://localhost:3000' } });
  assert.deepEqual(value.positions[identity(local)], localBefore);
  assert.deepEqual(value.positions[identity(serverB)], serverBBefore);
  assert.equal(value.positions[identity(serverA)], undefined);
  assert.equal(value.positions.knownLegacy, undefined);
  assert.deepEqual(value.positions.unknown, anchor);
  assert.equal(value.bookmarks.length, 3);
  assert.equal(value.recent.length, 3);
  assert.ok(value.bookmarks.some(entry => entry.key === 'unknown'));
  assert.ok(value.recent.some(entry => entry.key === 'unknown'));
  value = applyReading(value, { key: '', clear: 'bookmarks', sourceScope: local });
  assert.equal(value.bookmarks.some(entry => entry.key === identity(local)), false);
  assert.deepEqual(value.positions[identity(local)], localBefore);
  value = applyReading(value, { key: '', clear: 'positions', sourceScope: serverB });
  assert.equal(value.positions[identity(serverB)], undefined);
  assert.equal(value.recent.some(entry => entry.key === identity(serverB)), false);
  assert.equal(value.bookmarks.some(entry => entry.key === identity(serverB)), true);
});

test('recent retention is 200 independently for Local and each server and never evicts unidentified rows', () => {
  let value = empty();
  value.recent.push({ key: 'unidentified-old-row', ...anchor });
  for (const scope of [serverA, local, serverB]) for (let i = 0; i < 205; i++) value = applyReading(value, { key: identity(scope, String(i)), position: { ...anchor } });
  assert.equal(value.recent.length, 601);
  for (const scope of [local, serverA, serverB]) {
    const recent = value.recent.filter(entry => matchesReadingSource(entry, scope));
    assert.equal(recent.length, 200);
    assert.equal(recent[0].key, identity(scope, '204'));
    assert.equal(recent.at(-1).key, identity(scope, '5'));
  }
  const remoteBefore = structuredClone(value.recent.filter(entry => !matchesReadingSource(entry, local)));
  value = applyReading(value, { key: identity(local, 'fresh'), position: { ...anchor } });
  assert.deepEqual(value.recent.filter(entry => !matchesReadingSource(entry, local)), remoteBefore);
  assert.equal(Object.keys(value.positions).length, 616, 'recent pruning does not delete saved positions');
});

test('scoped single-record operations reject cross-source keys and preserve key authority', () => {
  let value = add(add(empty(), local), serverA);
  const before = structuredClone(value);
  assert.throws(() => applyReading(value, { key: identity(serverA), clear: 'position', sourceScope: local }), /does not match/);
  assert.throws(() => applyReading(value, { key: identity(serverA), removeBookmark: anchor, sourceScope: local }), /does not match/);
  assert.throws(() => applyReading(value, { key: identity(serverA), position: { ...anchor, ref: local }, sourceScope: local }), /does not match/);
  assert.deepEqual(value, before);
  value = applyReading(value, { key: identity(local), removeBookmark: anchor, sourceScope: local });
  assert.deepEqual(value.bookmarks.map(entry => entry.key), [identity(serverA)]);
  value = applyReading(value, { key: identity(local), clear: 'position', sourceScope: local });
  assert.equal(value.positions[identity(local)], undefined);
  assert.deepEqual(value.positions[identity(serverA)], before.positions[identity(serverA)]);
});

test('source-scoped deletion survives restart without a reading schema change', async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tslr-reading-source-'));
  let service = await new ApplicationService({ dataDir }).init();
  t.after(async () => { await service.shutdown(); await fs.rm(dataDir, { recursive: true, force: true }); });
  for (const scope of [local, serverA, serverB]) await service.handle('reading.save', { key: identity(scope), position: anchor, bookmark: anchor, sourceScope: scope });
  const before = (await service.handle('bootstrap')).reading;
  await service.handle('reading.save', { key: identity(local), removeBookmark: anchor, sourceScope: local });
  await service.handle('reading.save', { key: '', clear: 'all', sourceScope: serverA });
  await service.shutdown();
  const saved = JSON.parse(await fs.readFile(path.join(dataDir, 'reading-v2.json'), 'utf8'));
  assert.equal(saved.schemaVersion, 1);
  assert.deepEqual(Object.keys(saved.data).sort(), ['bookmarks', 'positions', 'recent']);
  service = await new ApplicationService({ dataDir }).init();
  const reopened = (await service.handle('bootstrap')).reading;
  assert.deepEqual(reopened.positions[identity(local)], before.positions[identity(local)]);
  assert.deepEqual(reopened.positions[identity(serverB)], before.positions[identity(serverB)]);
  assert.equal(reopened.positions[identity(serverA)], undefined);
  assert.deepEqual(reopened.bookmarks, before.bookmarks.filter(entry => entry.key === identity(serverB)));
  assert.deepEqual(reopened.recent, before.recent.filter(entry => entry.key !== identity(serverA)));
});

test('unscoped clear remains compatible while malformed requested scopes fail without changing state', () => {
  const value = add(add(empty(), local), serverA);
  const before = structuredClone(value);
  assert.throws(() => applyReading(value, { key: '', clear: 'all', sourceScope: { mode: 'server' } }), /address/);
  assert.throws(() => applyReading(value, { key: '', clear: 'everything', sourceScope: local }), /operation/);
  assert.deepEqual(value, before);
  assert.deepEqual(applyReading(value, { key: '', clear: 'all' }), empty());
});
