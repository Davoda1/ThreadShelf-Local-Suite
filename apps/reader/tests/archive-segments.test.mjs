import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, renameSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ArchiveStore, objectMetadata, referencedObjectFiles, verifyCatalog, transcodeCatalog } from '../src/core/archive.mjs';
import { CONTENT_BLOCK_BYTES } from '../src/core/content-packs.mjs';

function setup(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'threadshelf-v2-segments-'));
  const store = new ArchiveStore({ dataDir: directory, ...options }).init();
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  return store;
}
const document = (key, extra = {}) => ({ provider: 'openai', collection: 'Research', sourceFile: '/native/export.json',
  conversationKey: key, title: `Conversation ${key}`, turns: [{ user: `Question ${key}`, turn_index: 4 }, { ai: `Answer ${key}`, turn_index: 9 }],
  raw: { future: ['未知', null, true, { code: 'opaque' }] }, ...extra });

test('v2 catalog and durable mutation records contain references, never source bodies', t => {
  const store = setup(t), sentinel = 'BODY_ONLY_96d595dd_does_not_belong_in_catalog';
  const original = document('one', { turns: [{ user: sentinel }], raw: { body: sentinel, future: { bits: [1, 'é', null] } } });
  const record = store.prepareUpsert(original);
  assert.ok(record.contentRef); assert.equal(JSON.stringify(record).includes(sentinel), false);
  const result = store.applyMutation(record);
  const fields = store.db.prepare('PRAGMA table_info(conversations)').all().map(row => row.name);
  assert.ok(fields.includes('content_ref')); assert.ok(!fields.includes('document_json'));
  assert.equal(store.db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name LIKE 'passages%'").get().count, 0);
  store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  assert.equal(readFileSync(store.path).includes(Buffer.from(sentinel)), false);
  assert.equal(store.cacheStats().decodedObjects, 0);
  store.files(); store.collections(); store.providers(); store.passageCount();
  assert.equal(store.cacheStats().decodedObjects, 0, 'catalog browsing never opens content');
  assert.deepEqual(store.thread({ id: result.summary.id }).raw, original.raw);
  assert.deepEqual(store.thread({ id: result.summary.id }).turns, original.turns);
});

test('copies, moves and renames share immutable payloads; update forks only changed identity', t => {
  const store = setup(t), first = store.upsert(document('stable')).summary;
  const objects = referencedObjectFiles(store.db).sort(), files = readdirSync(store.contentDir).sort();
  const copied = store.manage({ action: 'copy', ids: [first.id], targetName: 'Copy' });
  const copyId = copied.copies[first.id];
  assert.notEqual(copyId, first.id);
  store.manage({ action: 'rename', collection: 'Research', name: 'Renamed' });
  store.manage({ action: 'move', ids: [first.id], targetName: 'Moved' });
  assert.deepEqual(referencedObjectFiles(store.db).sort(), objects);
  assert.deepEqual(readdirSync(store.contentDir).sort(), files);
  assert.equal(store.thread({ id: first.id }).collection, 'Moved');
  assert.equal(store.thread({ id: copyId }).collection, 'Copy');
  store.upsert(document('stable', { collection: 'Moved', turns: [{ ai: 'Changed source history', turn_index: 15 }] }));
  assert.equal(store.thread({ id: copyId }).turns[0].user, 'Question stable');
  assert.equal(store.thread({ id: first.id }).turns[0].ai, 'Changed source history');
});

test('scattered reads and global streaming scans remain within the decoded block cache budget', t => {
  const budget = 96 * 1024, store = setup(t, { compression: 'zip6', blockBytes: 32 * 1024, cacheBytes: budget });
  const ids = [];
  for (let n = 0; n < 12; n++) ids.push(store.upsert(document(String(n), {
    turns: Array.from({ length: 12 }, (_, i) => ({ user: `Thread ${n} turn ${i} ` + 'Lórum ipsum '.repeat(500), turn_index: i * 3 })),
    raw: { note: `original ${n}` },
  })).summary.id);
  const allBlocks = objectMetadata(store.db).length;
  store.thread({ id: ids[7] });
  assert.ok(store.cacheStats().decodedObjects < allBlocks);
  assert.ok(store.cacheStats().ramBytes <= budget);
  let count = 0; for (const passage of store.iterPassages()) { count++; assert.ok(passage.id); assert.ok(store.cacheStats().ramBytes <= budget); }
  assert.equal(count, 144); assert.ok(store.cacheStats().peakRamBytes <= budget);
  const summary = store.getConversationSummary(ids[5]);
  assert.equal(summary.turnCount, 12);
  const selected = store.getPassage(`${ids[5]}:9:user:0`);
  assert.ok(selected.text.startsWith('Thread 5 turn 3'));
  store.clearCache(); assert.equal(store.cacheStats().ramBytes, 0);
});

test('one oversized message and opaque raw record span bounded objects losslessly', t => {
  const store = setup(t, { compression: 'zip6', cacheBytes: CONTENT_BLOCK_BYTES });
  const huge = '汉字🙂 quoted " \\ end\n'.repeat(900000);
  assert.ok(Buffer.byteLength(huge) > CONTENT_BLOCK_BYTES);
  const input = document('oversized', { turns: [{ ai: huge, turn_index: 12345, source_role: 'assistant' }], raw: { rawText: huge, unknown: null } });
  const saved = store.upsert(input).summary;
  const objects = objectMetadata(store.db);
  assert.ok(objects.length >= 4);
  assert.ok(objects.every(object => object.bytes <= CONTENT_BLOCK_BYTES));
  const actual = store.thread({ id: saved.id });
  assert.equal(actual.turns[0].ai, huge); assert.equal(actual.raw.rawText, huge);
  assert.equal(store.getPassage(`${saved.id}:12345:ai:0`).text, huge);
  assert.ok(store.cacheStats().ramBytes <= CONTENT_BLOCK_BYTES);
});

test('both compression conversions preserve IDs, metadata, sparse turns and logical search revision', async t => {
  const store = setup(t, { compression: 'zip6' });
  const input = document('codec', { turns: [{ thinking: 'First thought', turn_index: 7 }, { ai: 'Part one', turn_index: 7 }, { ai: 'Part two', turn_index: 7 }, { tool: 'tool response', turn_index: 50 }] });
  const id = store.upsert(input).summary.id;
  const before = store.thread({ id }), revision = store.searchRevision(), passages = store.passages();
  for (const profile of ['7z', 'zip6', '7z']) {
    const result = await transcodeCatalog(store.db, store.contentDir, profile);
    assert.equal(result.compression, profile);
    store.clearCache();
    assert.deepEqual(store.thread({ id }), before);
    assert.deepEqual(store.passages(), passages);
    assert.equal(store.searchRevision(), revision);
    assert.ok(objectMetadata(store.db).every(object => object.codec === profile));
    assert.equal((await verifyCatalog(store.db, store.contentDir)).ok, true);
  }
});

test('failed/cancelled conversion leaves catalog references unchanged', async t => {
  const store = setup(t, { compression: 'zip6' });
  store.upsert(document('first')); store.upsert(document('second'));
  const before = [...store.contentReferences()], rev = store.searchRevision(), controller = new AbortController();
  await assert.rejects(() => transcodeCatalog(store.db, store.contentDir, '7z', { signal: controller.signal, onProgress() { controller.abort(); } }), /abort/i);
  assert.deepEqual([...store.contentReferences()], before); assert.equal(store.searchRevision(), rev);
  assert.equal((await verifyCatalog(store.db, store.contentDir)).ok, true);
});

test('corrupt immutable objects fail explicitly while summary-only browsing remains available', async t => {
  const store = setup(t), id = store.upsert(document('integrity')).summary.id;
  const object = objectMetadata(store.db)[0], filename = join(store.contentDir, object.file), bytes = readFileSync(filename);
  bytes[Math.floor(bytes.length / 2)] ^= 0x80; writeFileSync(filename, bytes);
  assert.equal(store.files().total, 1);
  assert.throws(() => store.thread({ id }), /checksum/i);
  await assert.rejects(() => verifyCatalog(store.db, store.contentDir), /checksum/i);
});

test('recovery replays references from the durable content directory and remains idempotent', t => {
  const source = setup(t, { compression: 'zip6' }), target = setup(t, { contentDir: source.contentDir });
  const record = source.prepareUpsert(document('recovery'));
  const result = source.applyMutation(record), replay = target.applyMutation(record);
  assert.deepEqual(replay, result);
  assert.deepEqual(target.applyMutation(record), replay);
  assert.deepEqual(target.thread({ id: result.summary.id }), source.thread({ id: result.summary.id }));
  assert.equal(target.revision(), 1);
});

test('literal list and manager filters retain SQLite ASCII/Unicode/escaping behavior', t => {
  const store = setup(t, { compression: 'zip6' });
  const texts = ['Ősz Cafe', 'ősz cafe', 'Öt Λόγος', 'öt λόγος', '100%_literal\\path', 'ASCII CASE'];
  const ids = texts.map((text, index) => store.upsert(document(`case-${index}`, { title: '', sourceFile: '', turns: [{ user: text }] })).summary.id);
  const matches = store.db.prepare("SELECT ? LIKE ? ESCAPE '\\' AS matched");
  for (const query of ['Ősz', 'ősz', 'Öt', 'öt', 'Λόγος', 'λόγος', 'cAFE', '%_', '\\path', 'ascii case']) {
    const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    const expected = texts.flatMap((text, index) => matches.get(text, pattern).matched ? [ids[index]] : []).sort();
    assert.deepEqual(store.files({ q: query }).files.map(row => row.id).sort(), expected, `list ${query}`);
    assert.deepEqual(store.prepareMutation({ action: 'deleteConversations', allMatching: true, query }).ids.sort(), expected, `manager ${query}`);
  }
});

test('content reads and writes reject a symlinked objects directory', t => {
  const store = setup(t), id = store.upsert(document('symlink')).summary.id;
  const original = store.contentDir, retained = `${original}-retained`;
  renameSync(original, retained);
  try { symlinkSync(retained, original, 'junction'); }
  catch (error) { renameSync(retained, original); if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) { t.skip('Windows account cannot create directory links.'); return; } throw error; }
  store.clearCache();
  assert.throws(() => store.thread({ id }), /regular directory/);
  assert.throws(() => store.upsert(document('different')), /regular directory/);
  assert.ok(readdirSync(retained).length > 0);
});

test('different valid encodings of identical logical content coexist without replacing committed objects', t => {
  const store = setup(t, { compression: 'zip6' });
  store.upsert(document('encoding-identity'));
  const first = objectMetadata(store.db)[0], bytes = readFileSync(join(store.contentDir, first.file));
  const alternate = Buffer.from(bytes);
  // DOS timestamp metadata is deliberately changed without touching payload,
  // compression method, member identity, CRC, offsets or file attributes.
  assert.equal(alternate.readUInt32LE(0), 0x04034b50);
  alternate.writeUInt16LE(alternate.readUInt16LE(10) ^ 0x0020, 10);
  const central = alternate.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.ok(central > 0);
  alternate.writeUInt16LE(alternate.readUInt16LE(central + 12) ^ 0x0020, central + 12);
  const packedSha256 = createHash('sha256').update(alternate).digest('hex');
  const second = { ...first, packedSha256, file: `${first.sha256}.${packedSha256}.zip` };
  assert.notEqual(second.file, first.file);
  writeFileSync(join(store.contentDir, second.file), alternate);
  assert.deepEqual(store.content.readBlock(second), store.content.readBlock(first));
  assert.deepEqual(readFileSync(join(store.contentDir, first.file)), bytes);
  assert.throws(() => store.content.readBlock({ ...second, file: first.file }), /filename/);
  const reference = store.content.writeBlock(store.content.readBlock(first));
  assert.equal(reference.file, first.file, 'identical complete hashes still deduplicate');
});
