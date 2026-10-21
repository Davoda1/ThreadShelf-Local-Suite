import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ZipWriter, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import { ingestExports } from '../src/core/ingest.mjs';
import { decodeJSONBytes } from '../src/core/parsers/json-bytes.mjs';

const source = (id = 'synthetic') => ({ id, title: 'Synthetic conversation', messages: [{ id: `${id}-u`, role: 'user', content: 'Synthetic question', timestamp: '2026-01-01T12:00:00Z' }, { id: `${id}-a`, role: 'assistant', content: 'Synthetic answer', model: 'synthetic-model' }] });
const temp = async t => { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'analytics-ingest-')); t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir; };
const encode32 = (text, littleEndian, bom = true) => {
  const chars = [...text], data = Buffer.alloc((chars.length + (bom ? 1 : 0)) * 4);
  let offset = 0;
  if (bom) { (littleEndian ? data.writeUInt32LE : data.writeUInt32BE).call(data, 0xfeff, offset); offset += 4; }
  for (const char of chars) { (littleEndian ? data.writeUInt32LE : data.writeUInt32BE).call(data, char.codePointAt(0), offset); offset += 4; }
  return data;
};
async function zipFile(filename, members, { zip64 = true } = {}) {
  const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false, zip64 });
  for (const [name, value] of members) await writer.add(name, new Uint8ArrayReader(Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))), { useWebWorkers: false, zip64 });
  await fs.writeFile(filename, await writer.close()); return filename;
}

test('strict JSON bytes decode UTF-8/16/32 BOM and unmarked encodings without replacing text', () => {
  const value = { text: 'Synthetic Árvíz 🌈' }, text = JSON.stringify(value), le = Buffer.from(text, 'utf16le'), be = Buffer.from(le).swap16();
  for (const bytes of [Buffer.from(text), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]), le, be, Buffer.concat([Buffer.from([0xff, 0xfe]), le]), Buffer.concat([Buffer.from([0xfe, 0xff]), be]), encode32(text, true), encode32(text, false), encode32(text, true, false), encode32(text, false, false)]) assert.deepEqual(decodeJSONBytes(bytes), value);
  assert.throws(() => decodeJSONBytes(Buffer.from([0xff, 0xfe, 0, 0, 0])), /UTF-32/);
  assert.throws(() => decodeJSONBytes(Buffer.from([0, 0, 0xfe, 0xff, 0, 0x11, 0, 0])), /UTF-32/);
  assert.throws(() => decodeJSONBytes(Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x7d])));
});

test('direct JSON is read-only, fingerprinted and leaves message dates independent', async t => {
  const dir = await temp(t), filename = path.join(dir, 'export.json'), raw = Buffer.from(JSON.stringify({ ...source(), createdAt: '2025-01-01' }));
  await fs.writeFile(filename, raw); const before = await fs.stat(filename);
  const result = await ingestExports([filename], { sourceId: 'test-source', collectionId: 'mixed' });
  assert.equal(result.conversations.length, 1); assert.equal(result.files[0].status, 'imported'); assert.equal(result.bytes, raw.length);
  assert.equal(result.files[0].sha256, createHash('sha256').update(raw).digest('hex'));
  assert.equal(result.conversations[0].records.find(record => record.category === 'response').timestamp, null);
  assert.deepEqual(result.conversations[0].collectionIds, ['mixed']); assert.deepEqual(await fs.readFile(filename), raw);
  const after = await fs.stat(filename); assert.equal(after.mtimeMs, before.mtimeMs); assert.equal(after.ctimeMs, before.ctimeMs);
});

test('mixed-provider arrays and unsupported neighbors dispatch independently', async t => {
  const dir = await temp(t), filename = path.join(dir, 'mixed.json');
  await fs.writeFile(filename, JSON.stringify([
    { id: 'openai', title: 'Synthetic OpenAI', current_node: 'm', mapping: { m: { id: 'm', parent: null, message: { id: 'm', author: { role: 'user' }, content: { content_type: 'text', parts: ['Synthetic prompt'] } } } } },
    { uuid: 'claude', name: 'Synthetic Claude', chat_messages: [{ uuid: 'u', sender: 'human', text: 'Synthetic prompt' }] },
    { metadataOnly: 'synthetic' }, source('generic'),
  ]));
  const result = await ingestExports([filename]);
  assert.deepEqual(new Set(result.conversations.map(c => c.provider)), new Set(['openai', 'anthropic', 'unknown']));
  assert.equal(result.conversations.length, 3); assert.ok(result.diagnostics.some(d => d.code === 'unsupported-format'));
});

test('extracted nested directory includes extensionless AI Studio input', async t => {
  const dir = await temp(t); await fs.mkdir(path.join(dir, 'nested'));
  await fs.writeFile(path.join(dir, 'nested', 'conversation'), JSON.stringify({ title: 'Synthetic AI Studio', chunkedPrompt: { chunks: [{ role: 'user', text: 'Synthetic prompt' }, { role: 'model', text: 'Synthetic answer' }] } }));
  await fs.writeFile(path.join(dir, 'binary.png'), Buffer.alloc(8));
  const result = await ingestExports([dir]); assert.equal(result.files.length, 1); assert.equal(result.conversations[0].provider, 'google-ai-studio');
});

test('HTML JSON scripts and jsonData literals are data and never executed', async t => {
  const dir = await temp(t), a = path.join(dir, 'assignment.html'), b = path.join(dir, 'script.html');
  await fs.writeFile(a, `<html><script>const jsonData = ${JSON.stringify([source('a')])}; throw new Error('must not run')</script></html>`);
  await fs.writeFile(b, `<html><script type="application/json">${JSON.stringify(source('b'))}</script><script>globalThis.__analyticsExecuted=true;</script></html>`);
  const result = await ingestExports([a, b]); assert.equal(result.conversations.length, 2); assert.equal(globalThis.__analyticsExecuted, undefined);
  await fs.writeFile(a, '<script>const jsonData = [Function("return 1")()];</script>');
  const rejected = await ingestExports([a]); assert.equal(rejected.conversations.length, 0); assert.equal(rejected.files[0].status, 'error');
});

test('static HTML preserves visible roles and removes inert active content', async t => {
  const dir = await temp(t), filename = path.join(dir, 'static.html');
  await fs.writeFile(filename, '<div class="conversation" data-conversation-id="synthetic"><h2>Title</h2><div class="message user">Synthetic prompt<script>secretScript()</script></div><div class="message assistant">Synthetic <b>answer</b></div></div>');
  const result = await ingestExports([filename]); assert.equal(result.conversations.length, 1);
  assert.ok(result.conversations[0].records.some(record => record.category === 'user' && record.text.includes('Synthetic prompt')));
  assert.ok(result.conversations[0].records.every(record => !record.text.includes('secretScript')));
});

test('ZIP64 imports extensionless documents without extracting any files', async t => {
  const dir = await temp(t), archive = path.join(dir, 'export.zip');
  await zipFile(archive, [['nested/conversation', source()], ['nested/media.png', Buffer.from([1, 2, 3])]]);
  const before = (await fs.readdir(dir)).sort(), result = await ingestExports([archive]);
  assert.equal(result.conversations.length, 1); assert.deepEqual((await fs.readdir(dir)).sort(), before);
  assert.ok(result.conversations[0].sourceFile.includes('!/nested/conversation'));
});

test('ZIP path traversal and profile containers are refused', async t => {
  const dir = await temp(t), traversal = path.join(dir, 'traversal.zip'), profile = path.join(dir, 'profile.zip');
  await zipFile(traversal, [['../outside.json', source()]]);
  await zipFile(profile, [['archive.sqlite', Buffer.from('not read')], ['reading.json', { private: 'not read' }], ['conversation.json', source()]]);
  for (const filename of [traversal, profile]) { const result = await ingestExports([filename]); assert.equal(result.conversations.length, 0); assert.equal(result.files[0].status, 'error'); }
});

test('Reader profiles, descendant exports and explicit settings are excluded', async t => {
  const dir = await temp(t), profile = path.join(dir, 'synthetic-profile'); await fs.mkdir(profile); await fs.mkdir(path.join(profile, 'local-storage-v2'));
  await fs.writeFile(path.join(profile, 'settings.json'), JSON.stringify(source('forbidden'))); await fs.writeFile(path.join(profile, 'conversation.json'), JSON.stringify(source('forbidden')));
  for (const selection of [profile, path.join(profile, 'settings.json'), path.join(profile, 'conversation.json')]) {
    const result = await ingestExports([selection]); assert.equal(result.files.length, 0); assert.equal(result.conversations.length, 0); assert.ok(result.diagnostics.some(d => d.code === 'source-refused'));
  }
  await fs.writeFile(path.join(dir, 'settings.json'), JSON.stringify(source('forbidden')));
  assert.equal((await ingestExports([path.join(dir, 'settings.json')])).files.length, 0);
});

test('file and ancestor symlinks cannot become sources', async t => {
  const dir = await temp(t), filename = path.join(dir, 'source.json'); await fs.writeFile(filename, JSON.stringify(source()));
  await fs.symlink(filename, path.join(dir, 'link.json')); await fs.mkdir(path.join(dir, 'real')); await fs.writeFile(path.join(dir, 'real', 'source.json'), JSON.stringify(source())); await fs.symlink(path.join(dir, 'real'), path.join(dir, 'linked'), 'dir');
  for (const filename of [path.join(dir, 'link.json'), path.join(dir, 'linked', 'source.json')]) { const result = await ingestExports([filename]); assert.equal(result.conversations.length, 0); assert.ok(result.diagnostics.length); }
});

test('UTF-8 streaming wrappers retain valid mixed provider records and reject malformed tails', async t => {
  const dir = await temp(t), filename = path.join(dir, 'stream.json');
  await fs.writeFile(filename, JSON.stringify({ metadata: { synthetic: true }, conversations: [source('a'), source('b')] }));
  const result = await ingestExports([filename], { limits: { streamingThreshold: 1 } }); assert.equal(result.conversations.length, 2);
  await fs.appendFile(filename, ' garbage'); const rejected = await ingestExports([filename], { limits: { streamingThreshold: 1 } }); assert.equal(rejected.conversations.length, 0); assert.equal(rejected.files[0].status, 'error');
});

test('changed source files contribute no partially normalized conversations', async t => {
  const dir = await temp(t), filename = path.join(dir, 'changing.json'), data = JSON.stringify([source('a'), source('b')]); await fs.writeFile(filename, data);
  let changed = false;
  const result = await ingestExports([filename], { limits: { streamingThreshold: 1 }, onProgress: event => { if (event.phase === 'validating' && !changed) { changed = true; writeFileSync(filename, data.replace('Synthetic question', 'Different question')); } } });
  assert.equal(result.conversations.length, 0); assert.equal(result.files[0].status, 'error'); assert.match(result.files[0].error, /changed/);
});

test('same-size source edits with unchanged handle timestamps discard parsed records', async t => {
  const dir = await temp(t), filename = path.join(dir, 'coarse-timestamps.json'), data = JSON.stringify([source('a'), source('b')]);
  const changedData = data.replace('Synthetic question', 'Different question');assert.equal(Buffer.byteLength(changedData), Buffer.byteLength(data));
  await fs.writeFile(filename, data);const stableStat = await fs.lstat(filename), open = fs.open, lstat = fs.lstat;let changed = false, handleStats = 0, pathStats = 0;
  // Model filesystems/Windows handles whose timestamps do not reveal this
  // in-place edit. The real bytes still change between validation and parsing.
  fs.lstat = async (file, ...args) => path.resolve(String(file)) === filename ? (pathStats++, stableStat) : lstat(file, ...args);
  fs.open = async (...args) => {
    const handle = await open(...args);if (path.basename(String(args[0])) !== path.basename(filename)) return handle;
    return new Proxy(handle, { get(target, key) {
      if (key === 'stat') return async () => { handleStats++;return stableStat; };
      const value = Reflect.get(target, key);return typeof value === 'function' ? value.bind(target) : value;
    } });
  };
  try {
    const result = await ingestExports([filename], { limits: { streamingThreshold: 1 }, onProgress: event => { if (event.phase === 'parsing' && !changed) { changed = true;writeFileSync(filename, changedData); } } });
    assert(changed);assert(handleStats > 1);assert(pathStats > 1);assert.equal(result.conversations.length, 0);assert.equal(result.files[0].status, 'error');assert.match(result.files[0].error, /changed/);
  } finally { fs.open = open;fs.lstat = lstat; }
});

test('size, JSON depth and cancellation limits are enforced', async t => {
  const dir = await temp(t), filename = path.join(dir, 'export.json'); await fs.writeFile(filename, JSON.stringify(source()));
  const result = await ingestExports([filename], { limits: { fileBytes: 4, streamingThreshold: 4096 } }); assert.equal(result.conversations.length, 0); assert.equal(result.files[0].status, 'error');
  await fs.writeFile(filename, JSON.stringify({ a: { b: { c: {} } } })); const depth = await ingestExports([filename], { limits: { jsonDepth: 1 } }); assert.equal(depth.files[0].status, 'error');
  const controller = new AbortController(); controller.abort(); await assert.rejects(ingestExports([filename], { signal: controller.signal }), { name: 'AbortError' });
});

test('complete Venice v4 multipart Dexie sets join once and incomplete sets fail', async t => {
  const dir = await temp(t), part0 = path.join(dir, 'part0.zip'), part1 = path.join(dir, 'part1.zip');
  const manifest = { backupVersion: 4, encrypted: false, chunkCount: 2, databaseVersion: 3, ownerId: 'synthetic-account', createdAt: '2026-01-01T00:00:00Z' };
  const chunk = (tableName, rows) => ({ formatName: 'dexie', formatVersion: 1, data: { databaseVersion: 3, data: [{ tableName, inbound: true, rows }] } });
  await zipFile(part0, [['manifest.json', manifest], ['db/chunk-0.json', chunk('conversations', [{ id: 'venice-synthetic', title: 'Synthetic Venice', ownerId: 'synthetic-account' }])]]);
  await zipFile(part1, [['db/chunk-1.json', chunk('messages', [{ id: 'message-synthetic', conversationId: 'venice-synthetic', role: 'user', content: 'Synthetic Venice prompt', createdAtUnixTimestamp: 1767225600 }])]]);
  const complete = await ingestExports([part0, part1]); assert.equal(complete.conversations.length, 1); assert.equal(complete.conversations[0].provider, 'venice'); assert.equal(complete.conversations[0].format, 'venice-v4-dexie');
  const incomplete = await ingestExports([part0]); assert.equal(incomplete.conversations.length, 0); assert.ok(incomplete.diagnostics.some(d => d.code === 'venice-backup-error'));
});

test('source duplicates across independent files reconcile without text-similarity deletion', async t => {
  const dir = await temp(t), a = path.join(dir, 'a.json'), b = path.join(dir, 'b.json');
  await fs.writeFile(a, JSON.stringify(source('shared'))); await fs.writeFile(b, JSON.stringify(source('shared')));
  const result = await ingestExports([a, b]); assert.equal(result.conversations.length, 1); assert.equal(result.conversations[0].duplicateRepresentations, 1);
  await fs.writeFile(b, JSON.stringify(source('different-id'))); const retained = await ingestExports([a, b]); assert.equal(retained.conversations.length, 2);
});

test('raw Meta labeled transcripts retain source speaker boundaries and unknown model', async t => {
  const dir = await temp(t), filename = path.join(dir, 'meta.json');
  await fs.writeFile(filename, JSON.stringify({ fbid: 'synthetic-account', label_values: [{ label: 'chat_01-01-2026.txt', value: 'You: Synthetic question\nMeta AI: Synthetic answer\n' }] }));
  const result = await ingestExports([filename]); assert.equal(result.conversations.length, 1); const conversation = result.conversations[0]; assert.equal(conversation.provider, 'meta');
  assert.ok(conversation.records.some(r => r.category === 'response' && r.model === 'unknown')); assert.ok(conversation.records.every(r => r.timestamp === null));
});

test('Gemini Takeout cards preserve explicit event dates, invisible model remains unknown', async t => {
  const dir = await temp(t), filename = path.join(dir, 'takeout.html');
  await fs.writeFile(filename, '<html><div class="outer-cell"><div class="header-cell">Gemini</div><div class="content-cell">Submitted prompt: Synthetic prompt<br>2026-01-01T12:00:00Z<br><p>Synthetic answer</p></div><div class="content-cell mdl-typography--caption"><a href="https://gemini.google.com/app/synthetic">Conversation</a></div></div></html>');
  const result = await ingestExports([filename]); assert.equal(result.conversations.length, 1); const conversation = result.conversations[0]; assert.equal(conversation.provider, 'gemini'); assert.equal(conversation.format, 'gemini-activity-html');
  assert.equal(conversation.records.length, 2); assert.ok(conversation.records.every(r => r.timestamp === Date.parse('2026-01-01T12:00:00Z'))); assert.ok(conversation.records.every(r => r.model === 'unknown'));
});
