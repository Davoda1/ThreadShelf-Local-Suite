import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ArchiveStore } from '../src/core/archive.mjs';
import { ActivityService, activityCSV } from '../src/core/activity.mjs';
import { activityCustomRange, activityRange } from '../src/core/activity-range.mjs';
import { report as previewReport, csv as previewCSV } from '../scripts/preview-activity.mjs';

const custom = (start, end, extra = {}) => ({ year: 'custom', start, end, zone: 'utc', ...extra });
function document(key, created, events, alternate = null) {
  const mapping = {};
  for (const [index, [time, role = 'user', model = 'test-model']] of events.entries()) {
    const id = `m${index}`;
    mapping[id] = { parent: index ? `m${index - 1}` : null, children: index < events.length - 1 ? [`m${index + 1}`] : [], message: { id, author: { role }, create_time: time, metadata: { model_slug: model }, content: { parts: ['Synthetic only'] } } };
  }
  if (alternate) { mapping.m0.children.push('alternate'); mapping.alternate = { parent: 'm0', children: [], message: { id: 'alternate', author: { role: 'assistant' }, create_time: alternate, metadata: { model_slug: 'alternate-model' }, content: { parts: ['Synthetic branch'] } } }; }
  return { collection: 'Range fixture', provider: 'openai', title: key, sourceFile: key + '.json', conversationKey: key, turns: [{ user: 'Synthetic stored rendering' }], raw: { create_time: created, current_node: `m${events.length - 1}`, mapping } };
}
async function fixture(t, documents) {
  const dataDir = await mkdtemp(join(tmpdir(), 'threadshelf-activity-range-'));
  const store = new ArchiveStore({ dataDir: join(dataDir, 'archive'), compression: 'zip6' }).init();
  const activity = new ActivityService({ store, dataDir, profile: 'zip6' });
  const data = documents.map(value => store.thread({ id: store.upsert(value).summary.id }));
  t.after(async () => { await activity.close(); store.close(); await rm(dataDir, { recursive: true, force: true }); });
  return { activity, store, data };
}
function comparable(report) { const { storage, ...rest } = report; return rest; }
async function matchingReports(f, options) {
  const report = await f.activity.query(options), preview = previewReport(f.data, options);
  assert.deepEqual(comparable(preview), comparable(report), 'Desktop and offline preview must describe the same exact interval');
  assert.equal(previewCSV(preview), activityCSV(report));
  return report;
}

test('custom dates reject missing, noncanonical, impossible and reversed intervals without fallback', () => {
  for (const value of [undefined, null, '', '2024-2-29', '2024-02-30', '2025-02-29', '1900-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00', '0000-01-01', '10000-01-01', '2024-01-01T00:00:00Z', ' 2024-01-01', 20240101]) {
    for (const options of [custom(value, '2024-12-31'), custom('0001-01-01', value)]) {
      assert.throws(() => activityCustomRange(options), { name: 'RangeError', code: 'ACTIVITY_INVALID_RANGE' });
      assert.throws(() => previewReport([], options), { name: 'RangeError', code: 'ACTIVITY_INVALID_RANGE' });
    }
  }
  assert.throws(() => activityRange(custom('2024-03-01', '2024-02-29')), /start date must be on or before/);
  for (const day of ['0001-01-01', '0099-12-31', '2000-02-29', '2024-02-29', '9999-12-31']) assert.deepEqual(activityCustomRange(custom(day, day)), { year: 'custom', start: day, end: day });
});

test('all time, calendar years and rolling year preserve existing interval selection', () => {
  const scope = { years: ['2026', '2024'], earliest: '2024-02-29', latest: '2026-09-29', zone: 'utc', now: Date.parse('2026-09-29T12:00:00Z') };
  assert.deepEqual(activityRange({ year: 'all', start: 'invalid', end: 'invalid' }, scope), { year: 'all', start: '2024-02-29', end: '2026-09-29' });
  assert.deepEqual(activityRange({ year: '2024' }, scope), { year: '2024', start: '2024-01-01', end: '2024-12-31' });
  assert.deepEqual(activityRange({ year: 'rolling' }, scope), { year: 'rolling', start: '2025-09-30', end: '2026-09-29' });
  assert.deepEqual(activityRange({ year: 'missing' }, scope), { year: '2026', start: '2026-01-01', end: '2026-12-31' });
});

test('cross-year custom interval includes both day boundaries across totals, distributions, rows and CSV', async t => {
  const f = await fixture(t, [
    document('Spanning conversation', '2023-12-30T12:00:00Z', [['2023-12-30T23:59:59.999Z'], ['2023-12-31T00:00:00Z'], ['2024-01-01T23:59:59.999Z', 'assistant'], ['2024-01-02T00:00:00Z', 'assistant']]),
    document('Started within range', '2023-12-31T12:00:00Z', [['2024-01-01T10:00:00Z', 'assistant']]),
    document('Entirely outside', '2024-01-02T12:00:00Z', [['2024-01-02T13:00:00Z']]),
    document('Undated', null, [[null]])
  ]);
  const revision = f.store.searchRevision(), report = await matchingReports(f, custom('2023-12-31', '2024-01-01', { bucket: 'daily' }));
  assert.equal(report.year, 'custom'); assert.equal(report.start, '2023-12-31'); assert.equal(report.end, '2024-01-01');
  assert.deepEqual(report.daily.map(day => [day.date, day.messages, day.conversations]), [['2023-12-31', 1, 1], ['2024-01-01', 2, 0]]);
  assert.deepEqual(report.timeline, [{ date: '2023-12-31', count: 1 }, { date: '2024-01-01', count: 2 }]);
  assert.equal(report.summary.messages, 3); assert.equal(report.summary.conversations, 2); assert.equal(report.summary.started, 1);
  assert.equal(report.summary.activeDays, 2); assert.equal(report.summary.longest, 2); assert.equal(report.summary.undated, 1);
  assert.deepEqual(report.roles, { assistant: 2, user: 1 }); assert.deepEqual(report.modelCounts, { 'test-model': 2 });
  assert.equal(report.hours[0], 1); assert.equal(report.hours[10], 1); assert.equal(report.hours[23], 1);
  assert.equal(report.weekdays[0], 1); assert.equal(report.weekdays[1], 2);
  assert.deepEqual(report.rows.map(row => row.title).sort(), ['Spanning conversation', 'Started within range']);
  assert.equal(activityCSV(report).split('\r\n').length, 4); assert.doesNotMatch(activityCSV(report), /2023-12-30|2024-01-02/);
  assert.equal(f.store.searchRevision(), revision, 'Read-only ranges must never alter source data');
  assert.equal((await matchingReports(f, { year: 'all', zone: 'utc' })).rowCount, 4, 'All-time retains original undated visibility');
});

test('custom intervals combine correctly with branch, metric, bucket, model and date drilldown', async t => {
  const f = await fixture(t, [document('Branched', '2024-02-29T00:00:00Z', [['2024-02-28T23:59:59.999Z'], ['2024-02-29T00:00:00Z', 'assistant'], ['2024-02-29T23:59:59.999Z', 'assistant'], ['2024-03-01T00:00:00Z', 'assistant']], '2024-02-29T12:00:00Z')]);
  for (const branch of ['all', 'active']) for (const metric of ['messages', 'user', 'assistant', 'conversations']) for (const bucket of ['daily', 'weekly', 'monthly']) {
    const report = await matchingReports(f, custom('2024-02-29', '2024-02-29', { branch, metric, bucket }));
    const count = metric === 'conversations' ? 1 : metric === 'user' ? 0 : branch === 'active' ? 2 : 3;
    assert.equal(report.summary.value, count); assert.equal(report.timeline.reduce((sum, point) => sum + point.count, 0), count);
    assert.equal(report.daily.length, 1); assert.equal(report.rows[0].messages, branch === 'active' ? 2 : 3);
  }
  assert.equal((await matchingReports(f, custom('2024-02-29', '2024-02-29', { branch: 'active', model: 'alternate-model' }))).rowCount, 0);
  assert.equal((await matchingReports(f, custom('2024-02-29', '2024-02-29', { branch: 'all', model: 'alternate-model', date: '2024-02-29' }))).rowCount, 1);
  assert.equal((await matchingReports(f, custom('2024-02-29', '2024-02-29', { date: '2024-03-01' }))).rowCount, 0);
});

test('local calendar boundaries and DST use the selected time zone without truncating the inclusive day', async t => {
  const previous = process.env.TZ; process.env.TZ = 'Europe/Budapest';
  t.after(() => { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; });
  const f = await fixture(t, [document('DST day', '2024-03-30T23:00:00Z', [['2024-03-30T22:59:59.999Z'], ['2024-03-30T23:00:00Z'], ['2024-03-31T21:59:59.999Z', 'assistant'], ['2024-03-31T22:00:00Z', 'assistant']])]);
  const local = await matchingReports(f, custom('2024-03-31', '2024-03-31', { zone: 'local' }));
  assert.equal(local.summary.messages, 2); assert.equal(local.summary.started, 1); assert.deepEqual(local.roles, { assistant: 1, user: 1 });
  assert.equal(local.hours[0], 1); assert.equal(local.hours[23], 1); assert.equal(local.weekdays[0], 2);
  const utc = await matchingReports(f, custom('2024-03-31', '2024-03-31', { zone: 'utc' }));
  assert.equal(utc.summary.messages, 2); assert.equal(utc.summary.started, 0); assert.deepEqual(utc.roles, { assistant: 2 });
});

test('empty and single-day ranges remain exact; extreme ranges retain the sparse memory guard', async t => {
  const f = await fixture(t, [document('Two separated days', '2024-01-01T12:00:00Z', [['2024-01-01T12:00:00Z'], ['2024-01-03T12:00:00Z']]), document('Undated only', null, [[null]])]);
  const empty = await matchingReports(f, custom('2024-02-29', '2024-02-29', { bucket: 'daily' }));
  assert.equal(empty.daily.length, 1); assert.equal(empty.daily[0].date, '2024-02-29'); assert.equal(empty.summary.messages, 0); assert.equal(empty.rowCount, 0);
  for (const day of ['0001-01-01', '0099-12-31', '9999-12-31']) { const report = await matchingReports(f, custom(day, day)); assert.equal(report.daily[0].date, day); assert.equal(report.daily.length, 1); }
  const large = await matchingReports(f, custom('0001-01-01', '9999-12-31', { bucket: 'daily' }));
  assert.equal(large.sparse, true); assert.equal(large.daily.length, 2); assert.equal(large.summary.longest, 1); assert.equal(large.rowCount, 1);
  const noData = await fixture(t, []), blank = await matchingReports(noData, custom('2024-02-28', '2024-03-01'));
  assert.equal(blank.daily.length, 3); assert.equal(blank.rowCount, 0); assert.equal(blank.summary.totalConversations, 0);
});

test('invalid custom requests reject before opening or rebuilding an index', async t => {
  const f = await fixture(t, [document('Retained original', '2024-01-01T12:00:00Z', [['2024-01-01T12:00:00Z']])]);
  for (const method of ['query', 'rebuild']) await assert.rejects(f.activity[method](custom('2024-02-30', '2024-03-01')), { code: 'ACTIVITY_INVALID_RANGE' });
  assert.equal(f.activity.db, null);
  const good = custom('2024-01-01', '2024-01-01'); await f.activity.query(good);
  const manifest = f.activity.manifest, revision = f.store.searchRevision();
  await assert.rejects(f.activity.rebuild(custom('2024-03-01', '2024-02-29')), { code: 'ACTIVITY_INVALID_RANGE' });
  assert.equal(f.activity.manifest, manifest); assert.equal(f.store.searchRevision(), revision); assert.equal((await f.activity.query(good)).summary.messages, 1);
});


test('normalized estimated starts have identical provenance in desktop and offline preview across date filters', async t => {
  const base = { collection: 'Normalized copies', provider: 'threadshelf', sourceFile: 'synthetic.json' };
  const f = await fixture(t, [
    { ...base, title: 'Estimated', conversationKey: 'estimated', turns: [{ user: 'Later', createdAt: '2024-03-02' }, { ai: 'Earlier', createdAt: '2024-02-29', model: 'test-model' }] },
    { ...base, title: 'Explicit server creation', conversationKey: 'explicit', threadCreatedAt: '2024-02-28', turns: [{ user: 'Stored later', createdAt: '2024-02-29' }] },
    { ...base, title: 'Undated copy', conversationKey: 'undated', turns: [{ user: 'No timestamp' }] }
  ]);
  const all = await matchingReports(f, {year:'all',zone:'utc',metric:'conversations'});
  assert.equal(all.summary.started, 2); assert.equal(all.summary.estimatedStarts, 1); assert.equal(all.summary.undatedConversations, 1);
  assert.equal(all.rows.find(row=>row.title==='Estimated').createdEstimated,true);
  assert.equal(all.rows.find(row=>row.title==='Explicit server creation').createdEstimated,false);
  for (const metric of ['messages','conversations']) {
    const selected = await matchingReports(f, custom('2024-02-29','2024-02-29',{metric}));
    assert.equal(selected.summary.started, 1); assert.equal(selected.summary.estimatedStarts, 1);
    const later = await matchingReports(f, custom('2024-03-02','2024-03-02',{metric}));
    assert.equal(later.summary.started, 0); assert.equal(later.summary.estimatedStarts, 0);
  }
  const filtered = await matchingReports(f, {year:'all',zone:'utc',metric:'conversations',search:'Explicit'});
  assert.equal(filtered.summary.started,1); assert.equal(filtered.summary.estimatedStarts,0);
});
