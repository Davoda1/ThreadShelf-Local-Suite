import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { ApplicationService } from '../src/core/service.mjs';
import { localReadingKey } from '../src/core/manager-reading.mjs';

const options = { collection: 'all', year: 'all', zone: 'utc', branch: 'all', metric: 'messages' };
const exists = filename => fs.stat(filename).then(() => true, () => false);
function gate() {
  let arrive, release;
  return { entered: new Promise(resolve => { arrive = resolve; }), blocked: new Promise(resolve => { release = resolve; }), arrive: () => arrive(), release: () => release() };
}
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tslr-activity-service-'));
  const dataDir = path.join(root, 'profile');
  let service = await new ApplicationService({ dataDir }).init();
  t.after(async () => { await service.shutdown().catch(() => {}); await fs.rm(root, { recursive: true, force: true }); });
  return { root, dataDir, get service() { return service; }, async reopen() { await service.shutdown(); service = await new ApplicationService({ dataDir }).init(); return service; } };
}
function originalDocument(id = 'native', title = 'Original branched conversation') {
  const message = (id, role, time, text, model) => ({ id, author: { role }, create_time: time, content: { content_type: 'text', parts: [text] }, metadata: model ? { model_slug: model } : {} });
  return {
    id, title, create_time: 1704067200, update_time: 1704153600, current_node: 'answer',
    mapping: {
      root: { id: 'root', parent: null, children: ['question'], message: null },
      question: { id: 'question', parent: 'root', children: ['answer', 'alternate'], message: message('user-message', 'user', 1704067200, 'A preserved question') },
      answer: { id: 'answer', parent: 'question', children: [], message: message('assistant-message', 'assistant', 1704070800, 'The selected answer', 'gpt-4') },
      alternate: { id: 'alternate', parent: 'question', children: [], message: message('alternative-message', 'assistant', 1704153600, 'An alternative answer', 'gpt-4o') }
    }
  };
}
async function imported(f, { id = 'native', collection = 'Source', title, doc = originalDocument(id, title) } = {}) {
  const filename = path.join(f.root, id + '.json');
  await fs.writeFile(filename, JSON.stringify(doc));
  const result = await f.service.handle('import.paths', { paths: [filename], collection });
  assert.deepEqual(result.errors, []); assert.equal(result.imported + result.updated, 1);
  const listed = await f.service.handle('files', { mode: 'local', collection });
  const row = listed.files.find(row => row.conversationKey === id) || listed.files.find(row => row.title === doc.title);
  assert.ok(row, 'imported conversation is present'); return row;
}
const report = (f, args = {}) => f.service.handle('activity.query', { ...options, ...args });
const mutate = (f, args) => f.service.handle('manager.mutate', args);
const collection = async (f, name) => (await f.service.handle('manager.status')).collections.find(row => row.name === name);
async function savedReading(f, row) {
  const key = localReadingKey(row.id), ref = { mode: 'local', ...row };
  await f.service.handle('reading.save', { key, position: { turnIndex: 1, role: 'assistant', offset: .37, title: row.title, ref }, bookmark: { turnIndex: 1, role: 'assistant', offset: .37, title: row.title, ref } });
  return key;
}
function checkReport(result, { conversations, messages }) {
  assert.equal(result.summary.conversations, conversations);
  assert.equal(result.summary.messages, messages);
  assert.equal(result.rowCount, conversations);
}

// This fixture uses only the existing 2.0 archive/import and reading APIs. The
// unopened profile has no Activity cache: indexing must be additive and leave
// stable IDs, originals, settings and saved reading intact.
test('opening Activity on a 2.0-compatible profile preserves archive identities, originals and reading across restart', async t => {
  const f = await fixture(t), row = await imported(f), key = await savedReading(f, row);
  await f.service.handle('settings.save', { values: { language: 'hu', uiPalette: 'oled', localCollection: 'Source' } });
  await f.reopen();
  assert.equal(await exists(path.join(f.dataDir, 'activity-v1')), false);
  const before = await f.service.handle('bootstrap');
  const original = await f.service.handle('thread', { mode: 'local', id: row.id });
  const all = await report(f); checkReport(all, { conversations: 1, messages: 3 });
  assert.equal(all.coverage.original, 1); assert.equal(all.coverage.normalized, 0);
  assert.equal(all.rows[0].id, row.id);
  assert.equal((await report(f, { branch: 'active' })).summary.messages, 2);
  await f.service.handle('activity.rebuild', options);
  assert.deepEqual(await f.service.handle('thread', { mode: 'local', id: row.id }), original);
  const after = await f.service.handle('bootstrap');
  assert.deepEqual(after.reading, before.reading); assert.deepEqual(after.settings, before.settings);
  await f.reopen(); checkReport(await report(f), { conversations: 1, messages: 3 });
  assert.equal((await f.service.handle('bootstrap')).reading.positions[key].offset, .37);
  assert.equal((await f.service.handle('thread', { mode: 'local', id: row.id })).id, row.id);
});

test('service query, rebuild and CSV preserve exact custom date filters and leave source reading intact', async t => {
  const f = await fixture(t), row = await imported(f), key = await savedReading(f, row);
  const args = { ...options, year: 'custom', start: '2024-01-02', end: '2024-01-02', bucket: 'daily' };
  const original = await f.service.handle('thread', { mode: 'local', id: row.id }), before = await f.service.handle('bootstrap');
  const selected = await f.service.handle('activity.query', args);
  assert.equal(selected.year, 'custom'); assert.equal(selected.start, args.start); assert.equal(selected.end, args.end);
  assert.equal(selected.summary.messages, 1); assert.equal(selected.summary.started, 0); assert.equal(selected.rows[0].messages, 1);
  assert.deepEqual(selected.timeline, [{ date: '2024-01-02', count: 1 }]);
  const exported = await f.service.handle('activity.csv', args);
  assert.equal(exported.csv, '\uFEFF"date","messages_or_stored_turns","user","assistant","tool","conversations_started"\r\n"2024-01-02","1","0","1","0","0"\r\n');
  assert.match(exported.filename, /^ThreadShelf-Activity-\d{4}-\d{2}-\d{2}\.csv$/);
  const rebuilt = await f.service.handle('activity.rebuild', args);
  assert.deepEqual(rebuilt.daily, selected.daily); assert.deepEqual(rebuilt.rows, selected.rows);
  assert.equal((await f.service.handle('activity.query', { ...args, branch: 'active' })).rowCount, 0);
  for (const operation of ['activity.query', 'activity.rebuild', 'activity.csv']) await assert.rejects(f.service.handle(operation, { ...args, start: '2024-02-30' }), /valid start date/);
  assert.deepEqual(await f.service.handle('thread', { mode: 'local', id: row.id }), original);
  const after = await f.service.handle('bootstrap'); assert.deepEqual(after.settings, before.settings); assert.deepEqual(after.reading, before.reading);
  assert.equal(after.reading.positions[key].offset, .37);
});

test('import, reimport, new messages, rebuild and reopen keep Conversations started accurate', async t => {
  const f = await fixture(t), doc = originalDocument('creation-alias');
  delete doc.create_time; doc.createdAt = '2024-01-01T12:00:00Z';
  const first = await imported(f, { id: doc.id, doc });
  const started = async () => report(f, { metric: 'conversations', zone: 'utc' });
  let current = await started(); assert.equal(current.summary.value, 1); assert.equal(current.summary.started, 1);
  assert.equal(current.daily.find(day => day.date === '2024-01-01').conversations, 1);
  assert.equal((await f.service.handle('activity.rebuild', { ...options, metric: 'conversations' })).summary.value, 1);
  // Same conversation changes creation metadata and adds a retained message.
  doc.createdAt = '2023-12-31T12:00:00Z';
  doc.mapping.answer.children = ['later'];
  doc.mapping.later = { id: 'later', parent: 'answer', children: [], message: { id: 'later-message', author: { role: 'assistant' }, createdAt: '2024-01-03T12:00:00Z', content: { content_type: 'text', parts: ['A later source reply.'] } } };
  doc.current_node = 'later';
  const updated = await imported(f, { id: doc.id, doc }); assert.equal(updated.id, first.id);
  current = await started(); assert.equal(current.summary.value, 1); assert.equal(current.summary.messages, 4);
  assert.equal(current.daily.find(day => day.date === '2023-12-31').conversations, 1);
  assert.equal(current.daily.find(day => day.date === '2024-01-01').conversations, 0);
  await imported(f, { id: 'second-creation', doc: { ...originalDocument('second-creation'), create_time: null, created_at: '2024-01-02' } });
  current = await started(); assert.equal(current.summary.value, 2); assert.equal(current.summary.messages, 7);
  const before = await f.service.handle('thread', { id: first.id });
  await f.reopen(); const reopened = await started();
  assert.equal(reopened.summary.value, 2); assert.equal(reopened.summary.messages, 7);
  assert.deepEqual(await f.service.handle('thread', { id: first.id }), before);
});

test('Activity follows rename, move, copy and deletion without changing source identity or retaining cleared conversations', async t => {
  const f = await fixture(t), row = await imported(f), source = await collection(f, 'Source');
  checkReport(await report(f), { conversations: 1, messages: 3 });
  await mutate(f, { operation: 'rename', collectionId: source.id, name: 'Renamed' });
  const renamed = await report(f, { collection: 'Renamed' }); checkReport(renamed, { conversations: 1, messages: 3 });
  assert.equal(renamed.rows[0].id, row.id); assert.equal(renamed.rows[0].collection, 'Renamed');
  assert.equal(renamed.storage.decodedConversations, 0, 'renaming reuses indexed message metadata');
  assert.equal(renamed.storage.reusedConversations, 1);
  checkReport(await report(f, { collection: 'Source' }), { conversations: 0, messages: 0 });
  await mutate(f, { operation: 'create', name: 'Destination' });
  const destination = await collection(f, 'Destination');
  await mutate(f, { operation: 'move', ids: [row.id], targetId: destination.id });
  checkReport(await report(f, { collection: 'Renamed' }), { conversations: 0, messages: 0 });
  assert.equal((await report(f, { collection: 'Destination' })).rows[0].id, row.id);
  await mutate(f, { operation: 'copy', ids: [row.id], targetName: 'Copied' });
  const copied = (await report(f, { collection: 'Copied' })).rows[0]; assert.notEqual(copied.id, row.id);
  checkReport(await report(f), { conversations: 2, messages: 6 });
  await mutate(f, { operation: 'deleteConversations', ids: [row.id] });
  const remaining = await report(f); checkReport(remaining, { conversations: 1, messages: 3 }); assert.equal(remaining.rows[0].id, copied.id);
  await mutate(f, { operation: 'clear' });
  checkReport(await report(f), { conversations: 0, messages: 0 });
  await f.reopen(); checkReport(await report(f), { conversations: 0, messages: 0 });
});

test('Activity remains rebuildable when storage compression changes in either direction', async t => {
  const f = await fixture(t), row = await imported(f), original = await f.service.handle('thread', { id: row.id });
  checkReport(await report(f), { conversations: 1, messages: 3 });
  for (const profile of ['zip6', '7z']) {
    const converted = await f.service.handle('storage.convert', { profile }); assert.equal(converted.storage.profile, profile);
    const result = await report(f); checkReport(result, { conversations: 1, messages: 3 });
    assert.equal(result.storage.profile, profile);
    assert.deepEqual(await f.service.handle('thread', { id: row.id }), original);
    await f.reopen(); const reopened = await report(f); checkReport(reopened, { conversations: 1, messages: 3 }); assert.equal(reopened.storage.profile, profile);
  }
});

test('restoring an older backup discards newer Activity data and retains restored IDs and reading', async t => {
  const f = await fixture(t), original = await imported(f), key = await savedReading(f, original);
  const backup = path.join(f.root, 'before-newer-data.zip');
  await f.service.handle('manager.backup', { path: backup });
  checkReport(await report(f), { conversations: 1, messages: 3 });
  await imported(f, { id: 'newer', collection: 'New data', title: 'Conversation after backup' });
  checkReport(await report(f), { conversations: 2, messages: 6 });
  await f.service.handle('manager.restore.preview', { path: backup });
  await f.service.handle('manager.restore', { path: backup });
  const restored = await report(f); checkReport(restored, { conversations: 1, messages: 3 });
  assert.deepEqual(restored.rows.map(row => row.id), [original.id]);
  assert.equal((await f.service.handle('bootstrap')).reading.positions[key].offset, .37);
  await f.reopen(); checkReport(await report(f), { conversations: 1, messages: 3 });
  assert.equal((await report(f, { collection: 'New data' })).rowCount, 0);
});

test('a damaged compressed Activity cache rebuilds from intact source and private temporary data is cleaned on close', async t => {
  const f = await fixture(t), row = await imported(f), original = await f.service.handle('thread', { id: row.id });
  await report(f);
  const temporary = f.service.activity.temporary;
  const cacheRoot = path.join(f.dataDir, 'activity-v1');
  const manifest = JSON.parse(await fs.readFile(path.join(cacheRoot, 'current.json'), 'utf8'));
  await f.reopen(); assert.equal(await exists(temporary), false, 'the private working SQLite copy is removed on close');
  await fs.writeFile(path.join(cacheRoot, manifest.file), 'intentionally damaged derived cache');
  const recovered = await report(f); checkReport(recovered, { conversations: 1, messages: 3 });
  assert.equal(recovered.storage.recovery, 'rebuilt-cache');
  assert.deepEqual(await f.service.handle('thread', { id: row.id }), original);
  await f.reopen(); checkReport(await report(f), { conversations: 1, messages: 3 });
});

test('conversion cancels and drains Activity before closing the SQLite handles it uses', { timeout: 20000 }, async t => {
  const f = await fixture(t); await imported(f); await report(f);
  const activity = f.service.activity, query = activity.query.bind(activity), paused = gate();
  let signal, querySettled = false;
  activity.query = async (args, controls) => { signal = controls.signal; paused.arrive(); await paused.blocked; signal.throwIfAborted(); return query(args, controls); };
  const querying = report(f).then(value => ({ value }), error => ({ error })).finally(() => { querySettled = true; });
  await paused.entered;
  const owner = f.service.store, converting = f.service.handle('storage.convert', { profile: 'zip6' });
  await nextTurn(); await nextTurn();
  assert.equal(signal.aborted, true); assert.equal(querySettled, false);
  assert.equal(f.service.store, owner); assert.ok(owner.db, 'conversion must wait before closing the archive');
  await assert.rejects(report(f), /operation|managed|running/i);
  paused.release();
  const [queryResult] = await Promise.all([querying, converting]); assert.equal(queryResult.error?.name, 'AbortError');
  checkReport(await report(f), { conversations: 1, messages: 3 });
});

test('CSV uses the current Local filters and does not include unrelated collections', async t => {
  const f = await fixture(t); await imported(f, { id: 'one', collection: 'Keep', title: 'Keep fixture' }); await imported(f, { id: 'two', collection: 'Exclude', title: 'Excluded fixture' });
  const result = await f.service.handle('activity.csv', { ...options, collection: 'Keep' });
  assert.equal(typeof result.csv, 'string'); assert.match(result.filename, /^ThreadShelf-Activity-.*\.csv$/);
  assert.equal(result.csv[0], '\ufeff');
  const lines = result.csv.slice(1).trim().split('\r\n');
  assert.match(lines[0], /date.*messages.*user.*assistant/);
  const counted = lines.slice(1).reduce((sum, line) => sum + Number(line.split(',')[1].replaceAll('"', '')), 0);
  assert.equal(counted, 3, 'only the selected collection contributes to the exported daily counts');
});

function insightsValue(scope) {
  return { collection: scope, totals: { collections: 1, files: 2, chunks: 8, conversations: 2, turns: 5 }, roles: { user: 3, thinking: 1, ai: 4 }, activity: [{ month: '2024-01', count: 8 }], topModels: [{ model: 'gpt-4', count: 8 }], providers: [{ provider: 'openai', conversations: 2, turns: 5 }], longestThreads: [{ collection: scope === 'all' ? 'Work' : scope, sourceFile: '/unchanged/original.json', conversationKey: 'thread-one', title: 'Longest fixture', provider: 'openai', turnCount: 4, lastTurnAt: '2024-01-02T00:00:00.000Z' }], firstActivity: '2024-01-01T00:00:00.000Z', lastActivity: '2024-01-02T00:00:00.000Z' };
}
async function backend(t) {
  const hits = [], slow = gate();
  const server = http.createServer((req, res) => {
    hits.push(req.method + ' ' + req.url); res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/api/insights') { res.statusCode = 500; res.end(JSON.stringify({ error: 'Analytics must not request full conversations or file listings' })); return; }
    const scope = url.searchParams.get('collection');
    if (scope === 'Slow') { slow.arrive(); void slow.blocked.then(() => { if (!res.destroyed) res.end(JSON.stringify(insightsValue(scope))); }); }
    else res.end(JSON.stringify(insightsValue(scope)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { slow.release(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return { hits, slow, serverUrl: `http://127.0.0.1:${server.address().port}/` };
}

test('Server Insights calls only the summary endpoint and never mounts Local storage during Server-only use', async t => {
  const f = await fixture(t), remote = await backend(t);
  await imported(f); await f.service.handle('settings.save', { values: { mode: 'server' } }); await f.reopen();
  assert.equal(f.service.store, null); assert.equal(f.service.storage, null);
  const result = await f.service.handle('server.insights', { serverUrl: remote.serverUrl, collection: 'Work' });
  assert.deepEqual(result, insightsValue('Work'));
  assert.deepEqual(remote.hits, ['GET /api/insights?collection=Work']);
  assert.equal(f.service.store, null); assert.equal(f.service.storage, null);
  assert.equal(await exists(path.join(f.dataDir, 'activity-v1')), false);
});

test('explicit Insights cancellation rejects stale scope and the next summary request remains usable', { timeout: 15000 }, async t => {
  const f = await fixture(t), remote = await backend(t);
  const stale = f.service.handle('server.insights', { serverUrl: remote.serverUrl, collection: 'Slow' }).then(value => ({ value }), error => ({ error }));
  await remote.slow.entered;
  assert.deepEqual(await f.service.handle('server.insights.cancel'), { ok: true });
  const current = await f.service.handle('server.insights', { serverUrl: remote.serverUrl, collection: 'Current' });
  assert.equal((await stale).error?.name, 'AbortError'); assert.equal(current.collection, 'Current');
  remote.slow.release(); await nextTurn();
  assert.deepEqual(remote.hits, ['GET /api/insights?collection=Slow', 'GET /api/insights?collection=Current']);
});
