import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ZipWriter, Uint8ArrayWriter, TextReader } from '@zip.js/zip.js';
import { jsonEvents } from '../src/core/stream-json.mjs';
import { importPaths, normalizeDocument, IMPORT_LIMITS } from '../src/core/importers.mjs';
import { decodeJSONBytes } from '../src/core/providers/meta.mjs';

const collect = async source => { const result = []; for await (const v of source) result.push(v); return result; };
const options = { limits: { streamingThreshold: 0 } };
async function temp(t) { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-stream-test-')); t.after(() => fs.rm(dir, { force: true, recursive: true })); return dir; }
async function file(dir, name, value) { const result = path.join(dir, name); await fs.writeFile(result, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)); return result; }
async function zip(dir, name, value, config = {}) { const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false, zip64: true }); await writer.add('conversations.json', new TextReader(value), config); return file(dir, name, Buffer.from(await writer.close())); }
const native = id => ({ id, title: 'árvíztűrő 🐱 日本語', current_node: 'a', mapping: {
  root: { id: 'root', parent: null, message: null },
  u: { id: 'u', parent: 'root', message: { id: 'user', author: { role: 'user' }, content: { parts: [' exact\\ "\n😀'] } } },
  a: { id: 'a', parent: 'u', message: { author: { role: 'assistant' }, content: { parts: ['Answer'] } } },
} });

test('JSON framing handles every one-byte UTF-8 boundary and unsafe integers', async () => {
  const bytes = Buffer.from('[{"id":9999999999999999999999,"x":"日本語😀\\\\\\\""},{"empty":[],"bool":true,"n":null}]');
  async function* source() { for (const byte of bytes) yield Uint8Array.of(byte); }
  const result = await collect(jsonEvents(source(), { limits: IMPORT_LIMITS }));
  assert.deepEqual(result.filter(e => e.type === 'record').map(e => e.value), decodeJSONBytes(bytes));
});

test('streamed ChatGPT records preserve raw alternatives, source indexes, integer IDs and source names', async t => {
  const dir = await temp(t), text = JSON.stringify([native('replace-id'), native('second')]).replace('"replace-id"', '99999999999999999999999');
  const filename = await file(dir, 'conversations-index.json', text);
  const result = await collect(importPaths([filename], options));
  assert.deepEqual(result, normalizeDocument(decodeJSONBytes(Buffer.from(text)), filename));
  assert.equal(result[0].conversationKey, 'openai:99999999999999999999999');
  assert.deepEqual(result[0].turns.map(t => t.turn_index), [1, 2]);
});

test('streamed conversations wrappers preserve native Grok and converted Meta provider metadata', async t => {
  const dir = await temp(t);
  for (const name of ['grok-polish.json', 'anthropic-polish.json']) {
    const raw = decodeJSONBytes(await fs.readFile(new URL('./fixtures/imports/' + name, import.meta.url)));
    const wrapped = name.startsWith('grok') ? raw : { _meta_ai_archive: { format: 'meta-ai-to-threadshelf' }, conversations: Array.isArray(raw) ? raw : [raw] };
    const filename = await file(dir, name, wrapped);
    assert.deepEqual(await collect(importPaths([filename], options)), normalizeDocument(wrapped, filename));
  }
  const filename = await file(dir, 'after.json', { conversations: [native('after')], exported: 'later metadata' });
  assert.equal((await collect(importPaths([filename], options)))[0].conversationKey, 'openai:after');
});

test('streaming falls back without changing grouped Gemini activity, bare turns, Venice or UTF-16', async t => {
  const dir = await temp(t), values = [
    [{ user: 'prompt' }, { ai: 'reply', turn_index: 9 }],
    [{ header: 'Gemini', title: 'Prompted first', titleUrl: 'https://gemini.google.com/app/same' }, { header: 'Gemini', title: 'Prompted second', titleUrl: 'https://gemini.google.com/app/same' }],
    { format: 'venice-chat-history', owners: [{ ownerId: 'u', conversations: [{ id: 'c', messages: [{ role: 'tool', content: 'raw' }] }] }] },
  ];
  for (const [index, value] of values.entries()) {
    const filename = await file(dir, `context-${index}.json`, value);
    assert.deepEqual(await collect(importPaths([filename], options)), normalizeDocument(value, filename));
  }
  const value = [native('utf16')], filename = await file(dir, 'unicode.json', Buffer.concat([Buffer.from([255, 254]), Buffer.from(JSON.stringify(value), 'utf16le')]));
  assert.deepEqual(await collect(importPaths([filename], options)), normalizeDocument(value, filename));
});

test('invalid JSON never emits a conversation before full validation', async t => {
  const dir = await temp(t);
  for (const tail of [',]', ']broken', ',{"invalid":}', '']) {
    const filename = await file(dir, 'broken.json', '[' + JSON.stringify(native('first')) + tail);
    const result = await collect(importPaths([filename], options)); assert.equal(result.length, 1); assert.ok(result[0].error);
  }
});

test('forced ZIP64 streamed member validates CRC before yielding data', async t => {
  const dir = await temp(t), filename = await zip(dir, 'valid.zip', JSON.stringify([native('first'), native('last')]), { level: 0 });
  const result = await collect(importPaths([filename], options)); assert.equal(result.length, 2); assert.equal(result[1].conversationKey, 'openai:last');
  const bytes = await fs.readFile(filename), at = bytes.indexOf(Buffer.from('Answer')); assert.ok(at > 0); bytes[at] = 66;
  const corrupt = await file(dir, 'bad-crc.zip', bytes), failed = await collect(importPaths([corrupt], options));
  assert.equal(failed.length, 1); assert.match(failed[0].error, /signature|crc/i);
});

test('streaming record, nesting, aggregate and unsupported-adapter limits remain explicit', async t => {
  const dir = await temp(t), filename = await file(dir, 'bounded.json', [native('bounded')]);
  const bounded = await collect(importPaths([filename], { limits: { streamingThreshold: 0, recordBytes: 50 } })); assert.match(bounded[0].error, /per-record safety limit/);
  const nested = await file(dir, 'nested.json', '[{"messages":[],"a":' + '['.repeat(30) + '0' + ']'.repeat(30) + '}]');
  assert.match((await collect(importPaths([nested], { limits: { streamingThreshold: 0, jsonDepth: 10 } })))[0].error, /complexity/);
  const archive = await zip(dir, 'aggregate.zip', JSON.stringify([native('bounded')]));
  assert.match((await collect(importPaths([archive], { limits: { expandedBytes: 10 } })))[0].error, /expanded-data safety/);
  const activity = await file(dir, 'activity.json', [{ header: 'Gemini', title: 'Prompted ' + 'x'.repeat(50) }, { header: 'Gemini', title: 'Prompted ' + 'y'.repeat(50) }]);
  assert.match((await collect(importPaths([activity], { limits: { streamingThreshold: 0, fileBytes: 120 } })))[0].error, /whole-document processing/);
});

test('cancellation interrupts validation and yielding without deadlocking ZIP backpressure', async t => {
  const dir = await temp(t), filename = await zip(dir, 'cancel.zip', JSON.stringify(Array.from({ length: 200 }, (_, i) => native(i))));
  const controller = new AbortController();
  await assert.rejects(collect(importPaths([filename], { ...options, signal: controller.signal, onProgress(p) { if (p.phase === 'validating' && p.current === 100) controller.abort(); } })), { name: 'AbortError' });
  const second = new AbortController(); let count = 0;
  await assert.rejects(async () => { for await (const record of importPaths([filename], { ...options, signal: second.signal })) { assert.ok(!record.error); if (++count === 3) second.abort(); } }, { name: 'AbortError' });
  assert.equal(count, 3);
  const generator = importPaths([filename], options); assert.ok(!(await generator.next()).value.error); await generator.return();
});

test('ZIP canonical duplicate names, directory limits and record counts are rejected', async t => {
  const dir = await temp(t), writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
  await writer.add('folder/conversations.json', new TextReader('[]')); await writer.add('folder\\conversations.json', new TextReader('[]'));
  const filename = await file(dir, 'aliases.zip', Buffer.from(await writer.close()));
  assert.match((await collect(importPaths([filename], options)))[0].error, /duplicate entry/);
  const records = await file(dir, 'count.json', [native(1), native(2)]);
  assert.match((await collect(importPaths([records], { limits: { streamingThreshold: 0, records: 1 } })))[0].error, /too many conversation/);
});


test('input changed during validation is diagnosed before any records are yielded', async t => {
  const dir = await temp(t), filename = await file(dir, 'changing.json', Array.from({ length: 200 }, (_, i) => native(i)));
  let changed = false;
  const records = await collect(importPaths([filename], { ...options, onProgress(event) {
    if (!changed && event.phase === 'validating' && event.current === 100) { changed = true; writeFileSync(filename, '[]'); }
  } }));
  assert.ok(changed); assert.equal(records.length, 1); assert.match(records[0].error, /changed during import|truncated during import/);
});


test('Venice forced-ZIP64 file backup retains native IDs and messages', async t => {
  const dir = await temp(t), writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false, zip64: true });
  const contents = {
    'manifest.json': { backupVersion: 4, encrypted: false, chunkCount: 1, databaseVersion: 4, ownerId: 'zip64-owner' },
    'db/chunk-0.json': { formatName: 'dexie', formatVersion: 1, data: { databaseVersion: 4, data: [
      { tableName: 'conversations', inbound: true, rows: [{ id: 'zip64-c', ownerId: 'zip64-owner', title: 'ZIP64 backup' }] },
      { tableName: 'messages', inbound: true, rows: [{ id: 'zip64-u', conversationId: 'zip64-c', role: 'user', content: 'Native ZIP64 question 日本語' }, { id: 'zip64-a', conversationId: 'zip64-c', role: 'assistant', content: 'Native ZIP64 answer' }] },
    ] } },
  };
  for (const [name, value] of Object.entries(contents)) await writer.add(name, new TextReader(JSON.stringify(value)), { zip64: true });
  const filename = await file(dir, 'venice-forced-zip64.zip', Buffer.from(await writer.close()));
  const records = await collect(importPaths([filename]));
  assert.equal(records.length, 1, JSON.stringify(records));
  assert.equal(records[0].provider, 'venice'); assert.equal(records[0].conversationKey, 'venice:zip64-owner:zip64-c');
  assert.deepEqual(records[0].turns.map(turn => turn.source_message_id), ['zip64-u', 'zip64-a']);
  assert.equal(records[0].turns[0].user, 'Native ZIP64 question 日本語');
  assert.equal(records[0].turns[1].ai, 'Native ZIP64 answer');
});
