import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ArchiveStore } from '../src/core/archive.mjs';

function fixture(overrides = {}) {
  return {
    provider: 'openai', collection: 'Research', sourceFile: '/exports/conversations.json',
    conversationKey: 'openai:stable-native-id', title: 'Archive storage notes',
    turns: [{ user: 'Can we store a café?', turn_index: 0 }, { ai: 'Use SQLite transactions.', turn_index: 1 }],
    raw: { id: 'stable-native-id', unknown_future_field: { values: [true, null, 42, 'unchanged'] } },
    sourceIdentity: { kind: 'native', provider: 'openai', conversationKey: 'openai:stable-native-id' },
    ...overrides,
  };
}

function setup(t) {
  const dataDir = mkdtempSync(join(tmpdir(), 'thread-local-archive-'));
  const store = new ArchiveStore({ dataDir }).init();
  t.after(() => { store.close(); rmSync(dataDir, { recursive: true, force: true }); });
  return { store, dataDir };
}

test('fresh archive excludes empty collections and persists all files beneath user data', t => {
  const { store, dataDir } = setup(t);
  assert.deepEqual(store.collections(), []);
  assert.deepEqual(store.files(), { files: [], total: 0, page: 1, pageSize: 50 });
  assert.equal(store.revision(), 0);
  assert.throws(() => store.upsert(fixture({ turns: [] })), /empty conversation/);
  assert.deepEqual(store.collections(), []);
  assert.equal(store.revision(), 0);
  assert.ok(readdirSync(dataDir).includes('archive.sqlite'));
  assert.ok(readdirSync(dataDir).every(name => name.startsWith('archive.sqlite')));
});

test('native IDs deduplicate copied files and preserve raw fields across restart', t => {
  const { store, dataDir } = setup(t);
  const original = fixture();
  const first = store.upsert(original);
  assert.equal(first.status, 'imported');
  assert.equal(store.upsert({ ...original, sourceFile: '/other/computer/copy.json' }).status, 'skipped');
  assert.equal(store.upsert(original).summary.id, first.summary.id);
  assert.equal(store.revision(), 1);
  assert.deepEqual(store.thread({ id: first.summary.id }).raw, original.raw);
  // Mutating the caller's input after an import does not mutate storage.
  original.turns[0].user = 'mutated outside store';
  assert.equal(store.thread({ id: first.summary.id }).turns[0].user, 'Can we store a café?');
  store.close();
  const reopened = new ArchiveStore(dataDir).init();
  try {
    assert.equal(reopened.revision(), 1);
    assert.deepEqual(reopened.collections(), [{ name: 'Research', count: 1 }]);
    assert.deepEqual(reopened.thread({ id: first.summary.id }).raw, original.raw);
    assert.equal(reopened.passageCount(), 2);
    assert.equal(reopened.keywordCandidates({ terms: ['cafe'] }).length, 1);
  } finally { reopened.close(); }
});

test('updates replace indexed passages atomically and keep identity', t => {
  const { store } = setup(t);
  const first = store.upsert(fixture());
  const update = fixture({ title: 'Changed title', turns: [{ user: 'Replacement omega content', turn_index: 7 }], raw: { new_field: true } });
  const second = store.upsert(update);
  assert.equal(second.status, 'updated');
  assert.equal(first.summary.id, second.summary.id);
  assert.equal(store.revision(), 2);
  assert.equal(store.files().total, 1);
  assert.equal(store.passageCount(), 1);
  assert.equal(store.keywordCandidates({ terms: ['SQLite'] }).length, 0);
  assert.equal(store.keywordCandidates({ terms: ['omega'] })[0].turnIndex, 7);
  assert.deepEqual(store.thread({ id: first.summary.id }).raw, { new_field: true });
  assert.equal(store.upsert(store.thread({ id: first.summary.id })).status, 'skipped');
});

test('failure during catalog publication rolls back conversation content references and revision together', t => {
  const { store } = setup(t);
  const first = store.upsert(fixture());
  const before = store.thread({ id: first.summary.id });
  store.db.exec("CREATE TEMP TRIGGER reject_test_passage BEFORE INSERT ON conversations WHEN new.title='Should roll back' BEGIN SELECT RAISE(ABORT,'synthetic disk-write failure'); END");
  assert.throws(() => store.upsert(fixture({ title: 'Should roll back', turns: [{ user: 'part written first' }, { ai: 'ABORT_TRANSACTION' }] })), /synthetic disk-write failure/);
  assert.deepEqual(store.thread({ id: first.summary.id }), before);
  assert.equal(store.revision(), 1);
  assert.equal(store.passageCount(), 2);
  assert.equal(store.keywordCandidates({ terms: ['SQLite'] }).length, 1);
  assert.equal(store.keywordCandidates({ terms: ['first'] }).length, 0);
  store.db.exec('DROP TRIGGER reject_test_passage');
  assert.equal(store.upsert(fixture({ title: 'Successful retry' })).status, 'updated');
  assert.equal(store.revision(), 2);
});

test('providers, local collection namespaces, and server provenance do not collide', t => {
  const { store } = setup(t);
  const entries = [
    fixture(),
    fixture({ provider: 'anthropic' }),
    fixture({ collection: 'Separate import' }),
    fixture({ sourceIdentity: { kind: 'threadshelf', serverUrl: 'http://localhost:3000/', collection: 'A', sourceFile: 'full/path.json', conversationKey: 'same' } }),
    fixture({ sourceIdentity: { kind: 'threadshelf', serverUrl: 'http://127.0.0.1:3001/', collection: 'A', sourceFile: 'full/path.json', conversationKey: 'same' } }),
    fixture({ sourceIdentity: { kind: 'threadshelf', serverUrl: 'http://localhost:3000/', collection: 'B', sourceFile: 'full/path.json', conversationKey: 'same' } }),
    fixture({ sourceIdentity: { kind: 'threadshelf', serverUrl: 'http://localhost:3000/', collection: 'A', sourceFile: 'other/path.json', conversationKey: 'same' } }),
  ];
  const ids = entries.map(entry => store.upsert(entry).summary.id);
  assert.equal(new Set(ids).size, entries.length);
  assert.equal(store.files().total, 7);
  assert.equal(store.files({ provider: 'anthropic' }).total, 1);
  assert.equal(store.files({ collection: 'Separate import' }).total, 1);
  const canonical = structuredClone(entries[3]);
  canonical.sourceIdentity.serverUrl = 'http://localhost:3000';
  assert.equal(store.upsert(canonical).summary.id, ids[3]);
  const copy = structuredClone(entries[3]);
  copy.collection = 'Second snapshot';
  assert.notEqual(store.upsert(copy).summary.id, ids[3]);
  assert.deepEqual(store.thread({ id: ids[4] }).sourceIdentity, entries[4].sourceIdentity);
});

test('empty text and multiple role parts retain exact original turn indexes', t => {
  const { store } = setup(t);
  const turns = [
    { user: '', turn_index: 0 },
    { thinking: 'Plan this', turn_index: 4, part_index: 0, model: 'model-a' },
    { ai: 'First answer', turn_index: 4, part_index: 1 },
    { ai: 'Second answer part', turn_index: 4, part_index: 2 },
    { user: '  ', turn_index: 8 },
    { user: 'Later question', turn_index: 12 },
  ];
  const { summary: result } = store.upsert(fixture({ turns }));
  assert.deepEqual(store.thread({ id: result.id }).turns, turns);
  const passages = store.passages();
  assert.deepEqual(passages.map(x => [x.turnIndex, x.role]), [[4, 'thinking'], [4, 'ai'], [4, 'ai'], [12, 'user']]);
  assert.equal(new Set(passages.map(x => x.id)).size, 4);
  assert.deepEqual([...store.iteratePassages({ role: 'thinking' })], [passages[0]]);
  assert.equal(result.turnCount, 6);
});

test('listing filters and paging use summaries without full source documents', t => {
  const { store } = setup(t);
  for (let index = 0; index < 12; index++) {
    store.upsert(fixture({ conversationKey: String(index), title: `Title ${String(index).padStart(2, '0')}`, lastTurnAt: 1700000000 + index,
      provider: index % 2 ? 'anthropic' : 'openai', collection: index < 6 ? 'First' : 'Second',
      turns: [{ user: index === 3 ? 'literal 50%_ underscore' : 'normal query', turn_index: 20 + index }],
    }));
  }
  const list = store.files({ sort: 'title', pageSize: 5, page: 2 });
  assert.equal(list.total, 12);
  assert.equal(list.files.length, 5);
  assert.equal(list.files[0].title, 'Title 05');
  assert.equal(list.files[0].raw, undefined);
  assert.equal(list.files[0].turns, undefined);
  assert.equal(store.files({ page: 100, pageSize: 5 }).page, 3);
  assert.equal(store.files({ sort: 'updated' }).files[0].title, 'Title 11');
  assert.equal(store.files({ collection: 'First', provider: 'anthropic' }).total, 3);
  assert.equal(store.files({ q: '50%_' }).total, 1);
  assert.equal(store.files({ q: "' OR 1=1 --" }).total, 0);
  assert.equal(store.keywordCandidates({ terms: ['normal'], collection: 'First', provider: 'anthropic' }).length, 2);
  assert.equal(store.keywordCandidates({ terms: ['Title 07'] }).length, 1);
  assert.deepEqual(store.keywordCandidates({ terms: [] }), []);
  assert.doesNotThrow(() => store.keywordCandidates({ terms: ['" OR * NEAR(foo)'] }));
});

test('invalid updates do not change stored data', t => {
  const { store } = setup(t);
  const result = store.upsert(fixture());
  const cyclic = fixture(); cyclic.raw.self = cyclic;
  assert.throws(() => store.upsert(cyclic), /circular/i);
  assert.throws(() => store.upsert(fixture({ turns: [{ ai: 'bad index', turn_index: -1 }] })), /turn_index/);
  assert.equal(store.revision(), 1);
  assert.equal(store.thread({ id: result.summary.id }).title, 'Archive storage notes');
  assert.throws(() => store.thread({ id: 'missing' }), /no longer present/);
  assert.throws(() => store.thread({}), /ID is required/);
});

test('search roles distinguish imported tools and systems while assistant aliases resolve', t => {
  const { store } = setup(t);
  store.upsert(fixture({ turns: [
    { ai: 'cobalt tool output', source_role: 'tool', turn_index: 1 },
    { ai: 'cobalt function output', source_role: 'function', turn_index: 2 },
    { ai: 'cobalt system instructions', source_role: 'system', turn_index: 3 },
    { ai: 'cobalt assistant answer', source_role: 'assistant', turn_index: 4 },
  ] }));
  assert.deepEqual(store.passages().map(p => p.role), ['tool', 'tool', 'system', 'ai']);
  assert.equal(store.keywordCandidates({ terms: ['cobalt'], role: 'tool' }).length, 2);
  assert.equal(store.keywordCandidates({ terms: ['cobalt'], role: 'assistant' })[0].turnIndex, 4);
  assert.equal(store.passages({ role: 'assistant' })[0].turnIndex, 4);
});

test('application database has expected SQLite header and safe close/reopen behavior', t => {
  const { store } = setup(t);
  store.upsert(fixture());
  store.close();
  assert.equal(readFileSync(store.path).subarray(0, 16).toString(), 'SQLite format 3\0');
  assert.doesNotThrow(() => store.close());
  assert.throws(() => store.collections(), /not open/);
  store.init();
  assert.equal(store.files().total, 1);
});
