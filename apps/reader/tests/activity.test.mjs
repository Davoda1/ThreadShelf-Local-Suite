import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ArchiveStore } from '../src/core/archive.mjs';
import { ActivityService, activityCSV } from '../src/core/activity.mjs';
import { normalizeActivity, activityTimestamp } from '../src/core/activity-normalize.mjs';

const second = date => Date.parse(date) / 1000;
function original(overrides = {}) {
  const msg = (id, role, time, model) => ({ id, author: { role }, create_time: time, content: { parts: [''] }, metadata: { model_slug: model } });
  return { collection: 'Personal', provider: 'openai', title: 'Original archive', sourceFile: 'conversations.json', conversationKey: 'native:one',
    turns: [{ user: 'rendered branch only', createdAt: '2026-01-02T09:00:00Z' }],
    raw: { id: 'one', create_time: second('2026-01-01T12:00:00Z'), current_node: 'b', mapping: {
      root: { message: null, parent: null, children: ['u'] },
      u: { message: msg('u', 'user', second('2026-01-02T09:00:00Z')), parent: 'root', children: ['a', 'b'] },
      a: { message: msg('a', 'assistant', second('2026-01-02T10:00:00Z'), 'model-a'), parent: 'u', children: [] },
      b: { message: msg('b', 'assistant', second('2026-01-03T11:00:00Z'), 'model-b'), parent: 'u', children: [] },
      duplicate: { message: msg('u', 'user', second('2026-01-04T12:00:00Z')), parent: null },
      undated: { message: msg('x', 'tool', null), parent: null },
    } }, ...overrides };
}
async function setup(t, profile = 'zip6') {
  const dataDir = await mkdtemp(join(tmpdir(), 'threadshelf-activity-test-'));
  const store = new ArchiveStore({ dataDir: join(dataDir, 'archive'), compression: 'zip6' }).init();
  const activity = new ActivityService({ store, dataDir, profile });
  t.after(async () => { await activity.close(); store.close(); await rm(dataDir, { recursive: true, force: true }); });
  return { dataDir, store, activity };
}

test('original ChatGPT counts empty messages once, own timestamps and active branch precisely', () => {
  const result = normalizeActivity(original());
  assert.equal(result.coverage, 'original'); assert.equal(result.messages.length, 4);
  assert.equal(result.messages.filter(message => message.active).length, 2);
  assert.equal(result.messages.filter(message => message.time === null).length, 1);
  assert.equal(result.duplicateMessages, 1); assert.equal(result.branchPoints, 1);
  assert.equal(result.created, Date.parse('2026-01-01T12:00:00Z'));
});

test('normalized records count stored turns and mark earliest-turn start estimates', () => {
  const result = normalizeActivity({ importedAt: '2026-01-01', updatedAt: '2026-01-02', raw: { serverUrl: 'http://example.test' }, turns: [{ assistant: 'answer' }, { system: 'policy' }, { function: 'result' }, { ai: 'tool result', source_role: 'tool' }, { text: 'question', role: 'user', createdAt: '2026-01-01' }, { user: 'one', ai: 'two' }] });
  assert.equal(result.coverage, 'normalized'); assert.equal(result.created, Date.parse('2026-01-01')); assert.equal(result.createdEstimated, true); assert.equal(result.updated, null);
  assert.deepEqual(result.messages.map(message => message.role), ['assistant', 'system', 'tool', 'tool', 'user', 'unknown']);
  assert.equal(result.messages.length, 6); assert.equal(result.messages.filter(message => message.time === null).length, 5);
});

test('timestamp validation rejects invalid dates, booleans and import-style junk', () => {
  for (const value of ['2025-02-29', '2026-13-01', 'tomorrow', true, '', null, undefined, Infinity]) assert.equal(activityTimestamp(value), null);
  assert.equal(activityTimestamp('2024-02-29T09:12'), Date.parse('2024-02-29T09:12:00Z'));
  assert.equal(activityTimestamp(1767225600), Date.parse('2026-01-01T00:00:00Z'));
});

test('branch fallback and cycles are reported without infinite traversal', () => {
  const value = original(); value.raw.current_node = 'missing';
  assert.equal(normalizeActivity(value).branchFallback, true);
  value.raw.current_node = 'u'; value.raw.mapping.u.parent = 'b';
  assert.equal(normalizeActivity(value).cycle, true);
});

test('Activity report calendar, graphs, coverage, model/date drilldown and safe CSV', async t => {
  const { store, activity } = await setup(t); store.upsert(original());
  store.upsert({ collection: 'Other', provider: 'custom', title: 'Normalized notes', sourceFile: 'notes.json', conversationKey: 'two', turns: [{ user: 'private text not indexed', createdAt: '2026-01-04T00:00:00Z' }, { ai: 'stored answer', model: 'fallback-model' }] });
  const report = await activity.query({ year: '2026', zone: 'utc' });
  assert.equal((await readFile(activity.databasePath)).includes(Buffer.from('private text not indexed')), false, 'The analytics database never stores message bodies');
  assert.equal(report.daily.length, 365); assert.equal(report.summary.messages, 4); assert.equal(report.summary.started, 2); assert.equal(report.summary.estimatedStarts, 1);
  assert.equal(report.summary.undated, 2); assert.equal(report.summary.undatedConversations, 0);
  assert.equal(report.summary.activeDays, 3); assert.equal(report.summary.longest, 3);
  assert.deepEqual(report.summary.busiest, { date: '2026-01-02', count: 2 });
  assert.deepEqual(report.coverage, { original: 1, normalized: 1 });
  assert.equal(report.roles.user, 2); assert.equal(report.modelCounts['model-a'], 1); assert.equal(report.modelCounts['model-b'], 1);
  assert.equal(report.hours[9], 1); assert.equal(report.weekdays[5], 2);
  assert.equal(report.timeline[0].count, 4); assert.equal(report.rowCount, 2);
  const selected = await activity.query({ collection: 'Personal', year: '2026', zone: 'utc', branch: 'active', model: 'model-b', date: '2026-01-03' });
  assert.equal(selected.summary.messages, 2); assert.equal(selected.summary.undated, 0); assert.equal(selected.rowCount, 1);
  assert.equal(selected.rows[0].messages, 2); assert.equal(selected.rows[0].totalMessages, 2);
  assert.equal((await activity.query({ year: '2026', date: '2026-99-99' })).rowCount, 2);
  assert.equal((await activity.query({ search: 'private text' })).rowCount, 0, 'Activity search is metadata only');
  const csv = activityCSV(report); assert.ok(csv.startsWith('\uFEFF"date"')); assert.ok(csv.endsWith('\r\n'));
  assert.match(activityCSV({ daily: [{ date: '=2+2', messages: 0, user: 0, assistant: 0, tool: 0, conversations: 0 }] }), /"'=2\+2"/);
});

test('unchanged and metadata-only archive edits reuse analytics without source decoding', async t => {
  const { store, activity } = await setup(t); const added = store.upsert(original());
  await activity.query({ zone: 'utc' }); let reads = 0; const read = store.thread.bind(store); store.thread = (...args) => { reads++; return read(...args); };
  await activity.query(); assert.equal(reads, 0);
  store._open().prepare('UPDATE conversations SET title=? WHERE id=?').run('Renamed metadata', added.summary.id);
  store._open().prepare("UPDATE metadata SET value=value+1 WHERE key='revision'").run();
  const renamed = await activity.query(); assert.equal(reads, 0); assert.equal(renamed.rows[0].title, 'Renamed metadata');
  const changed = original(); changed.raw.mapping.a.message.metadata.model_slug = 'new-model'; store.upsert(changed);
  const updated = await activity.query(); assert.equal(reads, 1); assert.equal(updated.modelCounts['new-model'], 1);
});

test('copied conversations reuse identical indexed content, and deletion reconciles rows', async t => {
  const { store, activity } = await setup(t); const added = store.upsert(original()); await activity.query();
  const read = store.thread.bind(store); let reads = 0; store.thread = (...args) => { reads++; return read(...args); };
  const copied = store.manage({ operation: 'copy', ids: [added.summary.id], targetName: 'Copies' });
  const report = await activity.query(); assert.equal(report.rowCount, 2); assert.equal(report.summary.messages, 6); assert.equal(reads, 0);
  store.manage({ operation: 'deleteConversations', ids: [copied.copies[added.summary.id]] });
  assert.equal((await activity.query()).rowCount, 1); assert.equal(reads, 0);
});

test('a restored different archive with the same revision cannot reuse prior analytics', async t => {
  const { dataDir, store, activity } = await setup(t); store.upsert(original()); await activity.query();
  const replacement = new ArchiveStore({ dataDir: join(dataDir, 'replacement'), compression: 'zip6' }).init();
  try {
    replacement.upsert({ collection: 'New', provider: 'custom', title: 'Restored data', sourceFile: 'new.json', conversationKey: 'new', turns: [{ user: 'new', createdAt: '2025-06-03' }] });
    assert.equal(store.revision(), replacement.revision()); activity.store = replacement;
    const report = await activity.query({ year: 'all', zone: 'utc' }); assert.equal(report.summary.messages, 1); assert.equal(report.rows[0].title, 'Restored data'); assert.deepEqual(report.years, ['2025']);
  } finally { await activity.close(); replacement.close(); }
});

test('compressed cache reopens without content reads; corrupt cache safely rebuilds', async t => {
  const { dataDir, store, activity } = await setup(t); store.upsert(original()); await activity.query(); await activity.close();
  const current = JSON.parse(await readFile(join(dataDir, 'activity-v1/current.json'), 'utf8'));
  assert.equal(current.profile, 'zip6'); assert.ok(current.file.endsWith('.zip'));
  let reads = 0; const read = store.thread.bind(store); store.thread = (...args) => { reads++; return read(...args); };
  const reopened = new ActivityService({ store, dataDir, profile: 'zip6' });
  try { assert.equal((await reopened.query()).summary.messages, 3); assert.equal(reads, 0); } finally { await reopened.close(); }
  await writeFile(join(dataDir, 'activity-v1', current.file), 'corrupt');
  const recovered = new ActivityService({ store, dataDir, profile: 'zip6' });
  try { const report = await recovered.query(); assert.equal(reads, 1); assert.equal(report.summary.messages, 3); assert.equal(report.storage.recovery, 'rebuilt-cache'); } finally { await recovered.close(); }
});

test('version 1 derived metadata is automatically repaired, even with an unchanged archive revision', async t => {
  const { dataDir, store, activity } = await setup(t);
  const source = original(); delete source.raw.create_time; source.raw.createdAt = '2026-01-01T12:00:00Z';
  const added = store.upsert(source), unchanged = store.thread({ id: added.summary.id }), revision = store.searchRevision();
  await activity.query({ metric: 'conversations', zone: 'utc' });
  // Reproduce a valid old compressed cache with its old normalization outcome.
  activity.db.exec('UPDATE conversations SET created=NULL; PRAGMA user_version=1');
  await activity.persist(revision); await activity.close();
  const manifestFile = join(dataDir, 'activity-v1/current.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8')); manifest.version = 1;
  await writeFile(manifestFile, JSON.stringify(manifest));
  let reads = 0; const read = store.thread.bind(store); store.thread = (...args) => { reads++; return read(...args); };
  const migrated = new ActivityService({ store, dataDir, profile: 'zip6' });
  try {
    const repaired = await migrated.query({ metric: 'conversations', zone: 'utc' });
    assert.equal(repaired.summary.value, 1); assert.equal(repaired.summary.started, 1); assert.equal(repaired.summary.undatedConversations, 0);
    assert.equal(repaired.daily.find(day => day.date === '2026-01-01').conversations, 1);
    assert.equal(reads, 1); assert.equal(repaired.version, 1); assert.equal(repaired.storage.version, 3);
    await migrated.query(); assert.equal(reads, 1, 'the repaired cache reuses source metadata');
  } finally { await migrated.close(); }
  assert.equal(store.searchRevision(), revision); assert.deepEqual(read({ id: added.summary.id }), unchanged);
  const reopened = new ActivityService({ store, dataDir, profile: 'zip6' });
  try { assert.equal((await reopened.query({ metric: 'conversations' })).summary.value, 1); assert.equal(reads, 1); }
  finally { await reopened.close(); }
});

test('profile changes recode derived database and discard removes its retained metadata', async t => {
  const { dataDir, store, activity } = await setup(t); store.upsert(original()); await activity.query();
  await activity.setProfile('7z');
  const manifest = JSON.parse(await readFile(join(dataDir, 'activity-v1/current.json'), 'utf8'));
  assert.equal(manifest.profile, '7z'); assert.ok(manifest.file.endsWith('.7z'));
  assert.equal((await readdir(join(dataDir, 'activity-v1'))).filter(file => file.endsWith('.zip')).length, 0);
  await activity.discard(); assert.equal((await readdir(dataDir)).includes('activity-v1'), false); assert.equal(store.files().total, 1);
});

test('pre-aborted analytics leaves original data unchanged', async t => {
  const { store, activity } = await setup(t); store.upsert(original()); const revision = store.searchRevision();
  const controller = new AbortController(); controller.abort();
  await assert.rejects(activity.query({}, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(store.searchRevision(), revision); assert.equal(store.files().total, 1);
  assert.equal((await activity.query()).summary.messages, 3);
});

test('startup reclaims only marked stale working directories after interruption', async t => {
  const { dataDir, store, activity } = await setup(t); store.upsert(original());
  const cache = join(dataDir, 'activity-v1'), stale = `working-${randomUUID()}`;
  await mkdir(join(cache, stale), { recursive: true }); await writeFile(join(cache, stale, 'activity.sqlite'), 'interrupted temporary metadata');
  await mkdir(join(cache, 'preserve-unrecognized')); await writeFile(join(cache, 'preserve-unrecognized', 'notes.txt'), 'unrelated');
  await activity.query(); const names = await readdir(cache); assert.equal(names.includes(stale), false); assert.equal(names.includes('preserve-unrecognized'), true);
  assert.equal(names.filter(name => name.startsWith('working-')).length, 1);
  await activity.close(); assert.equal((await readdir(cache)).filter(name => name.startsWith('working-')).length, 0);
});

test('cancellation during one large conversation rolls back its index and allows retry', async t => {
  const { store, activity } = await setup(t); store.upsert(original()); await activity.query();
  store.upsert({ collection: 'Large', provider: 'custom', title: 'Large synthetic thread', sourceFile: 'large.json', conversationKey: 'large', turns: Array.from({ length: 4096 }, (_, index) => ({ user: `synthetic ${index}`, createdAt: '2026-03-01T01:00:00Z' })) });
  const controller = new AbortController(); activity.onProgress = progress => { if (progress.phase === 'activity-index') setImmediate(() => controller.abort()); };
  await assert.rejects(activity.query({}, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(activity.db.prepare('SELECT count(*) AS n FROM conversations').get().n, 1);
  assert.equal(store.files().total, 2);
  activity.onProgress = () => {}; assert.equal((await activity.query()).summary.messages, 4099);
});
