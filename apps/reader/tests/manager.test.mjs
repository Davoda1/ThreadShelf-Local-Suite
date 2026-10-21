import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { ArchiveStore } from '../src/core/archive.mjs';

const document = (collection = 'First', overrides = {}) => ({ collection, provider: 'openai',
  sourceFile: '/export/source.json', conversationKey: 'native-a', title: 'Storage history',
  turns: [{ user: 'Original question', turn_index: 12 }, { ai: 'Original answer', turn_index: 19 }],
  raw: { id: 'native-a', unknown: { array: [1, true, null, 'Ősz'] } }, ...overrides });
const collectionId = (store, name) => store.collections({ includeEmpty: true }).find(row => row.name === name)?.id;
function setup(t, options = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'threadshelf-manager-'));
  const store = new ArchiveStore({ dataDir, ...options }).init();
  t.after(() => { store.close(); rmSync(dataDir, { recursive: true, force: true }); });
  return { store, dataDir };
}

test('empty catalog creation, Unicode renaming, stable IDs and name reuse', t => {
  const { store } = setup(t);
  const first = store.manage({ operation: 'create', name: 'Ősz / Research' }).collection;
  assert.deepEqual(store.collections(), []);
  assert.deepEqual(store.collections({ includeEmpty: true }).map(c => [c.id, c.name, c.count, c.turnCount]), [[first.id, 'Ősz / Research', 0, 0]]);
  const saved = store.upsert(document('ignored', { collectionId: first.id }));
  const raw = store.thread({ id: saved.summary.id }).raw;
  store.manage({ operation: 'rename', collectionId: first.id, name: 'New name' });
  assert.equal(collectionId(store, 'New name'), first.id);
  assert.equal(store.thread({ id: saved.summary.id }).collection, 'New name');
  assert.deepEqual(store.thread({ id: saved.summary.id }).raw, raw);
  assert.equal(store.upsert(document('New name')).status, 'skipped');
  assert.equal(store.upsert(store.thread({ id: saved.summary.id })).status, 'skipped');
  const replacement = store.manage({ operation: 'create', name: 'Ősz / Research' }).collection;
  assert.notEqual(replacement.id, first.id);
  assert.throws(() => store.manage({ operation: 'rename', collectionId: first.id, name: 'Ősz / Research' }), /already exists/);
  assert.throws(() => store.manage({ operation: 'create', name: 'bad\0name' }), /control/);
  assert.throws(() => store.manage({ operation: 'create', name: 'all' }), /reserved/);
  assert.throws(() => store.manage({ operation: 'rename', collectionId: first.id, name: 'all' }), /reserved/);
  assert.throws(() => store.manage({ operation: 'create', name: 'x'.repeat(201) }), /200/);
});

test('move and rename preserve IDs, reimports update destination and permit an intentional original-collection copy', t => {
  const { store } = setup(t);
  const original = store.upsert(document()).summary;
  const result = store.manage({ operation: 'move', ids: [original.id], targetName: 'Second' });
  assert.equal(result.moved, 1);
  assert.deepEqual(result.removedIds, []);
  assert.equal(store.thread({ id: original.id }).collectionId, result.target.id);
  assert.equal(store.upsert(document('Second', { sourceFile: '/copied.json' })).status, 'skipped');
  assert.equal(store.upsert(document('Second', { title: 'Updated source' })).summary.id, original.id);
  assert.equal(store.upsert(document()).status, 'imported');
  assert.equal(store.files({ collectionId: result.target.id }).total, 1);
  assert.equal(store.keywordCandidates({ terms: ['Original'], collection: 'First' }).length, 2);
  assert.equal(store.keywordCandidates({ terms: ['Original'], collection: 'Second' }).length, 2);
});

test('copy makes independent IDs, preserves provenance and explicitly maps optional bookmark copies', t => {
  const { store } = setup(t);
  const original = store.upsert(document()).summary;
  const copy = store.manage({ operation: 'copy', ids: [original.id], targetName: 'Copies', copyBookmarks: true });
  assert.equal(copy.copyBookmarks, true);
  assert.equal(copy.copied, 1);
  assert.notEqual(copy.copies[original.id], original.id);
  assert.deepEqual(store.thread({ id: copy.copies[original.id] }).raw, store.thread({ id: original.id }).raw);
  const repeat = store.manage({ operation: 'copy', ids: [original.id], targetId: copy.target.id });
  assert.equal(repeat.copied, 0);
  assert.equal(repeat.duplicates, 1);
  assert.equal(repeat.copyBookmarks, false);
  assert.equal(store.upsert(document('Copies')).summary.id, copy.copies[original.id]);
});

test('merge coalesces exact provenance/content duplicates and preserves divergent histories', t => {
  const { store } = setup(t);
  const source = store.upsert(document('A')).summary;
  const duplicate = store.upsert(document('B', { sourceFile: '/moved.json' })).summary;
  const variant = store.upsert(document('C', { turns: [{ user: 'Divergent history', turn_index: 44 }] })).summary;
  const otherSource = store.upsert(document('D', { conversationKey: 'native-b' })).summary;
  const args = { operation: 'merge', collectionIds: ['A', 'C', 'D'].map(n => collectionId(store, n)), targetId: collectionId(store, 'B') };
  const preview = store.previewMutation(args);
  assert.equal(preview.count, 3);
  assert.equal(preview.duplicates, 1);
  assert.equal(preview.conflicts, 1);
  const merged = store.manage({ ...args, expectedRevision: preview.revision });
  assert.deepEqual(merged.remap, { [source.id]: duplicate.id });
  assert.deepEqual(merged.removedIds, [source.id]);
  assert.equal(store.files().total, 3);
  assert.deepEqual(store.collections(), [{ name: 'B', count: 3 }]);
  assert.equal(store.thread({ id: variant.id }).collection, 'B');
  assert.equal(store.thread({ id: otherSource.id }).conversationKey, 'native-b');
  assert.equal(store.upsert(document('B')).summary.id, duplicate.id);
  assert.equal(store.upsert(document('B', { turns: [{ user: 'Divergent history', turn_index: 44 }] })).summary.id, variant.id);
  const third = store.upsert(document('B', { turns: [{ ai: 'New unambiguous source version? No.' }] }));
  assert.equal(third.status, 'imported');
  assert.equal(third.conflict, true);
  assert.equal(store.files().total, 4);
  assert.equal(store.thread({ id: duplicate.id }).turns[0].user, 'Original question');
});

test('all-matching selection is frozen, literal-filtered and independent of a display page', t => {
  const { store } = setup(t);
  for (let i = 0; i < 73; i++) store.upsert(document('Large', { conversationKey: String(i), provider: i % 2 ? 'openai' : 'anthropic', title: i < 61 ? 'literal 50%_' : 'different' }));
  store.manage({ operation: 'create', name: 'Destination' });
  const args = { operation: 'move', targetId: collectionId(store, 'Destination'), selection: { allMatching: true, collectionId: collectionId(store, 'Large'), provider: 'openai', query: '50%_' } };
  const preview = store.previewMutation(args);
  assert.equal(preview.count, 30);
  assert.equal(store.manage({ ...args, expectedRevision: preview.revision }).moved, 30);
  assert.equal(store.files({ collection: 'Destination' }).total, 30);
  assert.equal(store.files({ collection: 'Large' }).total, 43);
  assert.throws(() => store.prepareMutation({ operation: 'deleteConversations' }), /Select conversations/);
  assert.throws(() => store.prepareMutation({ operation: 'deleteConversations', ids: ['missing'] }), /no longer present/);
});

test('delete collection can move contents first; clear removes catalog and every FTS result', t => {
  const { store } = setup(t);
  const a = store.upsert(document('A')).summary;
  store.manage({ operation: 'create', name: 'Empty' });
  const moved = store.manage({ operation: 'deleteCollection', collectionId: a.collectionId, targetName: 'Kept' });
  assert.equal(moved.moved, 1);
  assert.equal(store.thread({ id: a.id }).collection, 'Kept');
  assert.equal(collectionId(store, 'A'), undefined);
  const b = store.upsert(document('B')).summary;
  assert.deepEqual(store.manage({ operation: 'deleteCollection', collectionId: b.collectionId }).removedIds, [b.id]);
  const clearRecord = store.prepareMutation({ operation: 'clear' });
  assert.deepEqual(clearRecord.ids, []);
  assert.equal(clearRecord.count, 1);
  assert.equal(store.applyMutation(clearRecord).clearAll, true);
  assert.deepEqual(store.collections({ includeEmpty: true }), []);
  assert.equal(store.passageCount(), 0);
  assert.deepEqual(store.keywordCandidates({ terms: ['Original'] }), []);
  assert.equal(store.db.prepare('PRAGMA foreign_key_check').all().length, 0);
});

test('prepared records replay with exact IDs/results after restart and reject stale previews', t => {
  const first = setup(t);
  const second = setup(t, { contentDir: first.store.contentDir });
  const records = [];
  for (const input of [document('A'), document('B')]) {
    const record = first.store.prepareUpsert(input);
    records.push(record);
    const imported = first.store.applyMutation(record);
    assert.deepEqual(second.store.applyMutation(JSON.parse(JSON.stringify(record))), imported);
    assert.deepEqual(second.store.thread({ id: imported.summary.id }), first.store.thread({ id: imported.summary.id }));
  }
  const args = { operation: 'merge', collectionIds: [collectionId(first.store, 'A')], targetId: collectionId(first.store, 'B') };
  const preview = first.store.previewMutation(args);
  const merge = first.store.prepareMutation({ ...args, expectedRevision: preview.revision });
  const result = first.store.applyMutation(merge);
  assert.deepEqual(second.store.applyMutation(merge), result);
  records.push(merge);
  first.store.close(); first.store.init();
  for (const record of records) assert.doesNotThrow(() => first.store.applyMutation(record));
  assert.equal(first.store.files().total, 1);
  assert.deepEqual(first.store.collections({ includeEmpty: true }), second.store.collections({ includeEmpty: true }));
  assert.throws(() => first.store.prepareMutation({ operation: 'clear', expectedRevision: preview.revision }), /changed after the preview/);
  const pending = first.store.prepareUpsert(document('Late'));
  first.store.manage({ operation: 'create', name: 'Unrelated mutation' });
  assert.throws(() => first.store.applyMutation(pending), /changed before/);
});

test('manager writes, new catalog entries and applied operation are one transaction', t => {
  const { store } = setup(t);
  const a = store.upsert(document('A')).summary;
  const b = store.upsert(document('B', { conversationKey: 'other' })).summary;
  const record = store.prepareMutation({ operation: 'move', ids: [a.id, b.id], targetName: 'Must roll back' });
  const revision = store.revision();
  store.db.exec(`CREATE TEMP TRIGGER fail_move BEFORE UPDATE ON conversations WHEN new.id='${b.id}' BEGIN SELECT RAISE(ABORT,'synthetic move failure'); END`);
  assert.throws(() => store.applyMutation(record), /synthetic move failure/);
  assert.equal(store.revision(), revision);
  assert.equal(store.thread({ id: a.id }).collection, 'A');
  assert.equal(store.thread({ id: b.id }).collection, 'B');
  assert.equal(collectionId(store, 'Must roll back'), undefined);
  assert.equal(store.keywordCandidates({ terms: ['Original'], collection: 'A' }).length, 2);
  assert.equal(store.db.prepare('SELECT 1 FROM applied_operations WHERE op_id=?').get(record.opId), undefined);
  store.db.exec('DROP TRIGGER fail_move');
  assert.equal(store.applyMutation(record).moved, 2);
});

function makeLegacyDatabase(path, doc) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA application_id=1414745170; PRAGMA user_version=1;
    CREATE TABLE metadata (key TEXT PRIMARY KEY,value INTEGER NOT NULL);
    INSERT INTO metadata VALUES ('revision',17);
    CREATE TABLE conversations (id TEXT PRIMARY KEY,identity_json TEXT UNIQUE NOT NULL,collection TEXT NOT NULL,provider TEXT NOT NULL,source_file TEXT NOT NULL,conversation_key TEXT NOT NULL,title TEXT NOT NULL,turn_count INTEGER NOT NULL CHECK(turn_count>0),last_turn_at TEXT,sort_time INTEGER NOT NULL,content_hash TEXT NOT NULL,document_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE passages(rowid INTEGER PRIMARY KEY,id TEXT UNIQUE NOT NULL,conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,collection TEXT NOT NULL,title TEXT NOT NULL,provider TEXT NOT NULL,role TEXT NOT NULL,turn_index INTEGER NOT NULL,text TEXT NOT NULL);
    CREATE VIRTUAL TABLE passages_fts USING fts5(text,title,content='passages',content_rowid='rowid',tokenize='unicode61 remove_diacritics 2');
    CREATE TRIGGER passages_insert AFTER INSERT ON passages BEGIN INSERT INTO passages_fts(rowid,text,title) VALUES(new.rowid,new.text,new.title); END;
    CREATE TRIGGER passages_delete AFTER DELETE ON passages BEGIN INSERT INTO passages_fts(passages_fts,rowid,text,title) VALUES('delete',old.rowid,old.text,old.title); END;
    CREATE TRIGGER passages_update AFTER UPDATE ON passages BEGIN INSERT INTO passages_fts(passages_fts,rowid,text,title) VALUES('delete',old.rowid,old.text,old.title); INSERT INTO passages_fts(rowid,text,title) VALUES(new.rowid,new.text,new.title); END;`);
  const identity = JSON.stringify({ collection: doc.collection, key: doc.conversationKey, kind: 'native', provider: doc.provider });
  const id = 'local:' + createHash('sha256').update(identity).digest('hex');
  db.prepare('INSERT INTO conversations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,identity,doc.collection,doc.provider,doc.sourceFile,doc.conversationKey,doc.title,doc.turns.length,null,0,'legacy-hash',JSON.stringify(doc),'2026-01-01','2026-01-02');
  for (const [index,turn] of doc.turns.entries()) db.prepare('INSERT INTO passages(id,conversation_id,collection,title,provider,role,turn_index,text) VALUES (?,?,?,?,?,?,?,?)').run(`${id}:${turn.turn_index}:${index ? 'ai' : 'user'}:0`,id,doc.collection,doc.title,doc.provider,index ? 'ai' : 'user',turn.turn_index,turn.user ?? turn.ai);
  db.close();
  return id;
}

test('v1 catalog is rejected without silently migrating its data', t => {
  const dataDir = mkdtempSync(join(tmpdir(), 'threadshelf-v1-boundary-'));
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  const doc = document('Legacy');
  const oldId = makeLegacyDatabase(join(dataDir,'archive.sqlite'),doc);
  assert.throws(() => new ArchiveStore(dataDir).init(), /legacy|1.x|unsupported|2.0|incompatible/i);
  const db = new DatabaseSync(join(dataDir,'archive.sqlite'));
  try { assert.equal(db.prepare('SELECT id FROM conversations').get().id,oldId); assert.equal(db.prepare('PRAGMA user_version').get().user_version,1); }
  finally { db.close(); }
});


test('derived index revision distinguishes independent archives and persists on reopen', t => {
  const first = setup(t), second = setup(t);
  assert.equal(first.store.revision(), second.store.revision());
  assert.notEqual(first.store.searchRevision(), second.store.searchRevision());
  first.store.upsert(document()); second.store.upsert(document());
  assert.equal(first.store.revision(), second.store.revision());
  assert.notEqual(first.store.searchRevision(), second.store.searchRevision());
  const identity = first.store.searchRevision();
  first.store.close(); first.store.init();
  assert.equal(first.store.searchRevision(), identity);
  // Early schema-2 working databases acquire one marker without losing content.
  first.store.db.prepare("DELETE FROM metadata WHERE key='archiveIdentity'").run();
  first.store.close(); first.store.init();
  assert.notEqual(first.store.searchRevision(), identity);
  assert.equal(first.store.files().total, 1);
  assert.equal(first.store.revision(), 1);
});


test('prepared exact imports expose a no-write summary preserving stored provenance paths', t => {
  const { store } = setup(t);
  const saved = store.upsert(document()).summary;
  const count = store.db.prepare('SELECT count(*) AS count FROM applied_operations').get().count;
  const prepared = store.prepareUpsert(document('First', { sourceFile: '/different/copy.json', collectionId: saved.collectionId }));
  assert.equal(prepared.unchanged, true);
  assert.deepEqual(prepared.summary, saved);
  assert.equal(prepared.summary.sourceFile, '/export/source.json');
  assert.equal(store.db.prepare('SELECT count(*) AS count FROM applied_operations').get().count, count);
  assert.equal(store.prepareUpsert(document('First', { title: 'Changed content' })).unchanged, false);
  const normalized = store.prepareUpsert(store.thread({ id: saved.id }));
  assert.equal(normalized.unchanged, true);
  assert.equal(Object.hasOwn(normalized, 'document'), false);
  assert.equal(Object.hasOwn(store.content.readDocument(JSON.parse(store.db.prepare('SELECT content_ref FROM conversations WHERE id=?').get(saved.id).content_ref)), 'collectionId'), false);
});


test('clear removes old operation summaries and remains idempotent after replay', t => {
  const { store } = setup(t);
  const saved = store.upsert(document('Private collection', { title: 'Private deleted title', sourceFile: '/private/deleted-file.json' }));
  store.upsert(document('Private collection', { title: 'Private deleted title', sourceFile: '/private/deleted-file.json' }));
  assert.match(store.db.prepare('SELECT group_concat(result_json) AS all_results FROM applied_operations').get().all_results, /Private deleted title/);
  const clear = store.prepareMutation({ operation: 'clear' });
  const result = store.applyMutation(clear);
  assert.equal(result.clearAll, true);
  const rows = store.db.prepare('SELECT op_id,result_json FROM applied_operations').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].op_id, clear.opId);
  assert.doesNotMatch(rows[0].result_json, /Private deleted title|deleted-file|Private collection/);
  assert.deepEqual(store.applyMutation(clear), result);
  assert.throws(() => store.thread({ id: saved.summary.id }), /no longer present/);
});
