import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ArchiveStore } from '../src/core/archive.mjs';
import { ActivityService } from '../src/core/activity.mjs';
import { normalizeActivity } from '../src/core/activity-normalize.mjs';
import { conversationCreatedAt } from '../src/core/conversation-date.mjs';
import { SearchTextIndex } from '../src/core/search-text-index.mjs';

const at = value => Date.parse(value);
const query = { year: 'all', zone: 'utc', metric: 'conversations', bucket: 'daily' };
function serverCopy(key, extra = {}) {
  // ThreadShelf 1.3 /api/thread omits original provider creation dates for
  // imported threads. This is the shape kept by the real server-copy path.
  const thread = { sourceFile: 'synthetic.json', conversationKey: key, title: `Fixture ${key}`, createdInThreadShelf: false,
    turns: [{ ai: 'Later reply', createdAt: '2026-10-12T12:00:00Z', model: 'model-b' },
      { user: 'Earliest retained question', createdAt: '2026-10-10T23:30:00Z' },
      { ai: 'Undated reply', createdAt: 'invalid', model: 'model-a' }], ...extra };
  return { ...thread, provider: 'openai', collection: 'Server copies',
    sourceIdentity: { kind: 'threadshelf', serverUrl: 'http://localhost:3000', collection: 'Server copies', sourceFile: thread.sourceFile, conversationKey: key },
    raw: { serverUrl: 'http://localhost:3000', summary: { importedAt: '2026-10-20', lastTurnAt: '2026-10-12' }, thread } };
}
async function setup(t) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reader-normalized-starts-'));
  const store = new ArchiveStore({ dataDir: path.join(dataDir, 'archive'), compression: 'zip6' }).init();
  const activity = new ActivityService({ store, dataDir, profile: 'zip6' });
  t.after(async () => { await activity.close(); store.close(); await fs.rm(dataDir, { recursive: true, force: true }); });
  return { dataDir, store, activity };
}

test('normalized-only server copies use earliest dated turn once; explicit source dates win and unknown dates remain unknown', () => {
  const copy = serverCopy('inferred'), normalized = normalizeActivity(copy);
  assert.equal(normalized.created, at('2026-10-10T23:30:00Z'));
  assert.equal(normalized.createdEstimated, true); assert.equal(normalized.coverage, 'normalized');
  assert.equal(conversationCreatedAt(copy), null, 'Activity estimates never leak into source/search creation');
  const native = normalizeActivity(serverCopy('explicit', { threadCreatedAt: '2026-10-08' }));
  assert.equal(native.created, at('2026-10-08')); assert.equal(native.createdEstimated, false);
  const unknown = normalizeActivity(serverCopy('unknown', { turns: [{ user: 'No dates', createdAt: true }, { ai: 'Still no dates', timestamp: 'tomorrow' }], importedAt: '2026-10-20', lastTurnAt: '2026-10-19' }));
  assert.equal(unknown.created, null); assert.equal(unknown.createdEstimated, false);
  const original = normalizeActivity({ raw: { mapping: { one: { message: { id: '1', author: { role: 'user' }, create_time: '2026-10-10' } } } }, turns: [{ user: 'Dated original message', createdAt: '2026-10-10' }] });
  assert.equal(original.coverage, 'original'); assert.equal(original.created, null); assert.equal(original.createdEstimated, false);
});

test('normalized starts drive calendar, drilldown, range and model filters without changing messages or stored originals', async t => {
  const { store, activity } = await setup(t);
  const estimated = store.upsert(serverCopy('estimated')).summary.id;
  store.upsert(serverCopy('explicit', { threadCreatedAt: '2026-10-08' }));
  store.upsert(serverCopy('unknown', { turns: [{ user: 'Undated conversation' }] }));
  const before = store.thread({ id: estimated }), revision = store.searchRevision();
  const report = await activity.query(query);
  assert.deepEqual(report.coverage, { original: 0, normalized: 3 });
  assert.equal(report.summary.started, 2); assert.equal(report.summary.value, 2); assert.equal(report.summary.estimatedStarts, 1);
  assert.equal(report.summary.undatedConversations, 1); assert.equal(report.summary.messages, 4); assert.equal(report.summary.undated, 3);
  assert.equal(report.daily.find(day => day.date === '2026-10-10').conversations, 1);
  assert.equal(report.daily.find(day => day.date === '2026-10-12').conversations, 0);
  const rows = await activity.query({ ...query, date: '2026-10-10' });
  assert.equal(rows.rowCount, 1); assert.equal(rows.rows[0].id, estimated); assert.equal(rows.rows[0].createdEstimated, true);
  for (const branch of ['all', 'active']) {
    const filtered = await activity.query({ ...query, branch, model: 'model-b' });
    assert.equal(filtered.summary.started, 2); assert.equal(filtered.summary.estimatedStarts, 1);
    assert.equal(filtered.rows.find(row => row.id === estimated).created, at('2026-10-10T23:30:00Z'), 'later model activity cannot shift conversation start');
  }
  const excluded = await activity.query({ ...query, year: 'custom', start: '2026-10-12', end: '2026-10-12' });
  assert.equal(excluded.summary.started, 0); assert.equal(excluded.summary.estimatedStarts, 0); assert.equal(excluded.summary.messages, 2);
  const rebuilt = await activity.rebuild(query);
  assert.deepEqual(rebuilt.daily, report.daily); assert.deepEqual(rebuilt.rows, report.rows);
  assert.equal(store.searchRevision(), revision); assert.deepEqual(store.thread({ id: estimated }), before);
});

test('normalized start estimates update incrementally, preserve copy reuse and survive restart', async t => {
  const { dataDir, store, activity } = await setup(t), source = serverCopy('incremental');
  const id = store.upsert(source).summary.id;
  assert.equal((await activity.query(query)).summary.started, 1);
  source.turns.push({ user: 'Previously unavailable earlier message', createdAt: '2026-09-30' });
  store.upsert(source);
  const changed = await activity.query(query);
  assert.equal(changed.summary.started, 1); assert.equal(changed.summary.estimatedStarts, 1);
  assert.equal(changed.daily.find(day => day.date === '2026-09-30').conversations, 1);
  assert.equal(changed.daily.find(day => day.date === '2026-10-10').conversations, 0);
  assert.equal(changed.storage.decodedConversations, 1);
  store.manage({ operation: 'copy', ids: [id], targetName: 'Copied' });
  const copied = await activity.query(query); assert.equal(copied.summary.started, 2); assert.equal(copied.summary.estimatedStarts, 2);
  assert.equal(copied.storage.decodedConversations, 0);
  await activity.close(); const reopened = new ActivityService({ store, dataDir, profile: 'zip6' });
  try { const report = await reopened.query(query); assert.equal(report.summary.started, 2); assert.equal(report.summary.estimatedStarts, 2); assert.equal(report.storage.decodedConversations, 0); }
  finally { await reopened.close(); }
});

test('Revision 2 zero-start cache repairs automatically without archive mutation or manual rebuild', async t => {
  const { dataDir, store, activity } = await setup(t), id = store.upsert(serverCopy('old-cache')).summary.id;
  const before = store.thread({ id }), revision = store.searchRevision();
  await activity.query(query);
  activity.db.exec('UPDATE conversations SET created=NULL; ALTER TABLE conversations DROP COLUMN created_estimated; PRAGMA user_version=2');
  await activity.persist(revision); await activity.close();
  const manifestFile = path.join(dataDir, 'activity-v1/current.json'), manifest = JSON.parse(await fs.readFile(manifestFile));
  manifest.version = 2; await fs.writeFile(manifestFile, JSON.stringify(manifest));
  const repaired = new ActivityService({ store, dataDir, profile: 'zip6' });
  try {
    const report = await repaired.query(query);
    assert.equal(report.summary.started, 1); assert.equal(report.summary.estimatedStarts, 1); assert.equal(report.storage.version, 3);
    assert.equal(report.storage.recovery, 'rebuilt-cache'); assert.equal(report.rows[0].id, id);
    assert.equal(store.searchRevision(), revision); assert.deepEqual(store.thread({ id }), before);
  } finally { await repaired.close(); }
});

test('old text cache refreshes source dates and retained-source precedence from headers only without recompressing blocks', async t => {
  const { dataDir, store } = await setup(t);
  const explicit = store.upsert(serverCopy('explicit-cache', { threadCreatedAt: '2026-10-08' })).summary.id;
  const inferred = store.upsert(serverCopy('estimated-cache')).summary.id;
  const nested = store.upsert({ ...serverCopy('nested-cache', { threadCreatedAt: '2026-10-07' }), threadCreatedAt: undefined, createTime: '2026-10-09' }).summary.id;
  const index = new SearchTextIndex({ store, root: path.join(dataDir, 'search') });
  try {
    await index.ensure();
    const blocks = index.db.prepare('SELECT * FROM blocks ORDER BY conversation,part').all();
    index.db.exec("UPDATE conversations SET created=NULL; DELETE FROM metadata WHERE key='creationVersion'");
    index.db.prepare('UPDATE conversations SET created=? WHERE id=?').run(at('2026-10-09'), nested);
    assert.equal(index.status(store.searchRevision()).needsIndexing, true);
    const originalRead = store.content.readBlob.bind(store.content), reads = [];
    store.content.readBlob = ref => { reads.push(ref); return originalRead(ref); };
    store.iterPassages = () => { throw new Error('Existing compressed search blocks must not be regenerated'); };
    await index.ensure(); assert.equal(reads.length, 3);
    assert.equal(index.created(explicit), at('2026-10-08')); assert.equal(index.created(inferred), null);
    assert.equal(index.created(nested), at('2026-10-07'), 'a stale non-NULL wrapper date yields to retained source creation exactly as a fresh index');
    assert.deepEqual(index.db.prepare('SELECT * FROM blocks ORDER BY conversation,part').all(), blocks);
    assert.equal(index.status(store.searchRevision()).needsIndexing, false);
    await index.ensure(); assert.equal(reads.length, 3, 'date normalization refresh runs only once');
    assert.equal(index.stats.decodedConversations, 0); assert.equal(index.stats.reusedConversations, 3);
  } finally { index.close(); }
});
