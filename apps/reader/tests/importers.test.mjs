import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { importPaths, normalizeDocument } from '../src/core/importers.mjs';
import { ZipWriter, Uint8ArrayWriter, TextReader } from '@zip.js/zip.js';
import { convert as convertMeta } from '../src/core/providers/meta.mjs';
import { convertExport as convertVenice } from '../src/core/providers/venice.mjs';
const collect = async generator => { const out = []; for await (const value of generator) out.push(value); return out; };
const temp = async t => { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-import-')); t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir; };
const write = async (dir, filename, value) => { const name = path.join(dir, filename); await fs.mkdir(path.dirname(name), { recursive: true }); await fs.writeFile(name, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)); return name; };
async function zip(files) { const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false }); for (const [name, content] of Object.entries(files)) await writer.add(name, new TextReader(typeof content === 'string' ? content : JSON.stringify(content))); return Buffer.from(await writer.close()); }
const fixtures = new Map([
  ['openai-polish.json', 'openai'], ['anthropic-polish.json', 'anthropic'], ['anthropic-project-snapshot.json', 'anthropic'],
  ['gemini-polish.json', 'google-ai-studio'], ['gemini-imagen.json', 'google-ai-studio'], ['openrouter-polish.json', 'openrouter'],
  ['lmstudio-polish.json', 'lm-studio'], ['lmstudio-snapshot.json', 'lm-studio'], ['lmstudio-versions-snapshot.json', 'lm-studio'], ['grok-polish.json', 'grok'],
]);
for (const [name, provider] of fixtures) test('ThreadShelf 1.2.3 native fixture: ' + name, async () => {
  const input = JSON.parse(await fs.readFile(new URL('./fixtures/imports/' + name, import.meta.url)));
  const result = normalizeDocument(input, name);
  assert.equal(result.length, 1); assert.equal(result[0].provider, provider);
  assert.ok(result[0].turns.length >= 2); assert.ok(result[0].turns.some(t => t.user)); assert.ok(result[0].turns.some(t => t.ai));
  for (const turn of result[0].turns) assert.ok(Number.isSafeInteger(turn.turn_index));
  assert.ok(result[0].raw); assert.doesNotThrow(() => JSON.stringify(result));
  assert.deepEqual(normalizeDocument(input, '/a/copy/' + name).map(c => c.conversationKey), result.map(c => c.conversationKey));
});

test('ChatGPT preserves active branch, original whitespace, analysis, tool turns, empty source slots and raw alternatives', () => {
  const input = { id: 'synthetic-chat', current_node: 'a', mapping: {
    r: { id: 'r', parent: null, message: null },
    u: { id: 'u', parent: 'r', message: { author: { role: 'user' }, content: { parts: ['  Exact prompt\n'] } } },
    e: { id: 'e', parent: 'u', message: { author: { role: 'assistant' }, content: { parts: [''] } } },
    t: { id: 't', parent: 'e', message: { author: { role: 'assistant' }, channel: 'analysis', content: { parts: ['Reasoning'] } } },
    x: { id: 'x', parent: 't', message: { author: { role: 'tool' }, content: { parts: ['Tool response'] } } },
    a: { id: 'a', parent: 'x', message: { author: { role: 'assistant' }, content: { parts: ['```python\nprint(1)\n```'] } } },
    alt: { id: 'alt', parent: 'u', message: { author: { role: 'assistant' }, content: { parts: ['Alternative retained'] } } },
  } };
  const [conversation] = normalizeDocument(input);
  assert.deepEqual(conversation.turns.map(t => t.turn_index), [1, 3, 4, 5]);
  assert.equal(conversation.turns[0].user, '  Exact prompt\n'); assert.equal(conversation.turns[1].thinking, 'Reasoning');
  assert.equal(conversation.turns[2].source_role, 'tool'); assert.ok(conversation.raw.mapping.alt);
  assert.ok(!conversation.turns.some(t => t.ai === 'Alternative retained'));
});

test('Venice native export includes child/tool records and distinct thinking; converted compatibility', () => {
  const data = { format: 'venice-chat-history', formatVersion: 1, owners: [{ ownerId: 'synthetic-owner', conversations: [{ id: 'c', title: 'Venice', messages: [
    { id: 'u', role: 'user', content: 'User prompt', createdAtUnixTimestamp: 1780000000 },
    { id: 'a', role: 'assistant', content: 'Answer', reasoningContent: 'Thinking', modelName: 'Synthetic model' },
    { id: 'child', role: 'tool', parentMessageId: 'a', content: { observation: 'Result' } },
  ] }] }] };
  const [native] = normalizeDocument(data);
  assert.equal(native.provider, 'venice'); assert.equal(native.turns.length, 4);
  assert.equal(native.turns[1].thinking, 'Thinking'); assert.equal(native.turns[2].ai, 'Answer');
  assert.equal(native.turns[3].source_role, 'tool'); assert.match(native.turns[3].ai, /observation/);
  const converted = convertVenice(data);
  const [compat] = normalizeDocument(converted.output);
  assert.equal(compat.provider, 'venice'); assert.ok(compat.turns.some(t => t.thinking === 'Thinking')); assert.equal(compat.conversationKey, native.conversationKey); assert.equal(compat.turns.at(-1).source_role, 'tool');
});

test('Meta native transcripts respect fenced speaker labels, unsafe integers, and prior converted format', async t => {
  const dir = await temp(t);
  const raw = '{"fbid":12345678901234567890123,"label_values":[{"label":"Conversation_09-17-2026.txt","value":"You: ```text\\nMeta AI: code, not speaker\\n```\\nMeta AI: Final answer\\n"}]}';
  const filename = await write(dir, 'meta.json', raw);
  const [native] = await collect(importPaths([filename]));
  assert.equal(native.provider, 'meta'); assert.equal(native.turns.length, 2); assert.equal(native.raw.source_account_id, '12345678901234567890123');
  assert.match(native.turns[0].user, /Meta AI: code, not speaker/);
  const [converted] = normalizeDocument(convertMeta(Buffer.from(raw), 'meta.json'));
  assert.equal(converted.provider, 'meta'); assert.equal(converted.turns.length, 2); assert.equal(converted.conversationKey, native.conversationKey);
});

const geminiHTML = '<html><body><div class="outer-cell" data-conversation-title="Exact title"><div class="header-cell">Gemini</div><div class="content-cell">Submitted prompt:&nbsp;Explain &lt;script&gt; text<br>Sep 17, 2026, 8:28:16 PM CEST<br><p>Answer <strong>bold</strong></p><pre>const value = 1;</pre><script>globalThis.IMPORT_EXECUTED=true</script></div><div class="content-cell mdl-typography--caption"><a href="https://gemini.google.com/app/synthetic123">Source</a></div></div></body></html>';
test('Gemini Takeout HTML is inert, retains source card, title, timestamp, and Markdown', async t => {
  const dir = await temp(t), file = await write(dir, 'My Activity.html', geminiHTML);
  const results = await collect(importPaths([file]));
  assert.equal(results.length, 1, JSON.stringify(results));
  const [conv] = results; assert.equal(conv.provider, 'gemini'); assert.equal(conv.title, 'Exact title');
  assert.equal(conv.turns[0].createdAt, '2026-09-17T18:28:16.000Z');
  assert.match(conv.turns[1].ai, /\*\*bold\*\*/); assert.match(conv.turns[1].ai, /```/);
  assert.doesNotMatch(conv.turns[1].ai, /IMPORT_EXECUTED/); assert.equal(globalThis.IMPORT_EXECUTED, undefined);
  assert.ok(conv.raw.sourceCards?.length);
});

test('recursive folder and ZIP reads extensionless AI Studio; identity stable across containers', async t => {
  const dir = await temp(t), data = { title: 'Nested', chunkedPrompt: { chunks: [{ role: 'user', text: 'Prompt' }, { role: 'model', text: 'Thinking', isThought: true }, { role: 'model', text: 'Answer' }] } };
  const folder = path.join(dir, 'folder'); await write(folder, 'nested/no-extension', data); await write(folder, 'media.png', 'not a JSON');
  const native = await collect(importPaths([folder]));
  const archive = await write(dir, 'archive.zip', await zip({ 'Google-AI-Studio/no-extension': data, 'images/test.png': 'unused' }));
  const archived = await collect(importPaths([archive]));
  assert.equal(native.length, 1); assert.equal(archived.length, 1);
  assert.equal(native[0].conversationKey, archived[0].conversationKey); assert.equal(archived[0].turns[1].thinking, 'Thinking');
});

test('invalid input diagnostics do not abort the remaining import; progress and cancellation', async t => {
  const dir = await temp(t), bad = await write(dir, 'broken.json', '{bad'), good = await write(dir, 'valid.json', { platform: 'openrouter', turns: [{ role: 'user', content: 'Valid' }] });
  const progress = [], values = await collect(importPaths([bad, good], { onProgress: p => progress.push(p) }));
  assert.ok(values[0].error); assert.equal(values[1].provider, 'openrouter'); assert.ok(progress.some(p => p.phase === 'error'));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(collect(importPaths([good], { signal: controller.signal })), { name: 'AbortError' });
});

test('bounded archive expansion rejects oversized members without extracting files', async t => {
  const dir = await temp(t), archive = await write(dir, 'large.zip', await zip({ 'large.json': ' '.repeat(2000) }));
  const results = await collect(importPaths([archive], { limits: { fileBytes: 1000 } }));
  assert.match(results[0].error, /safety limit/); assert.deepEqual((await fs.readdir(dir)).sort(), ['large.zip']);
});

test('ZIP unsafe paths are rejected', async t => {
  const dir = await temp(t);
  const archive = await write(dir, 'bad.zip', await zip({ '../outside.json': '{}' }));
  const results = await collect(importPaths([archive]));
  assert.ok(results[0].error); assert.deepEqual(await fs.readdir(dir), ['bad.zip']);
});

test('unenciphered Venice backup ZIP v4 is reconstructed locally', async t => {
  const dir = await temp(t);
  const archive = await write(dir, 'venice.zip', await zip({
    'manifest.json': { backupVersion: 4, encrypted: false, chunkCount: 1, databaseVersion: 4, ownerId: 'synthetic' },
    'db/chunk-0.json': { formatName: 'dexie', formatVersion: 1, data: { databaseVersion: 4, data: [
      { tableName: 'conversations', inbound: true, rows: [{ id: 'c', ownerId: 'synthetic', title: 'Backup' }] },
      { tableName: 'messages', inbound: true, rows: [{ id: 'u', conversationId: 'c', role: 'user', content: 'Archive question' }, { id: 'a', conversationId: 'c', role: 'assistant', content: 'Archive answer' }] },
    ] } },
  }));
  const results = await collect(importPaths([archive]));
  assert.equal(results.length, 1, JSON.stringify(results)); assert.equal(results[0].provider, 'venice'); assert.equal(results[0].turns[1].ai, 'Archive answer');
});

test('native Gemini activity JSON and normalized ThreadShelf export retain original indexes', () => {
  const [gemini] = normalizeDocument([{ header: 'Gemini', title: 'Prompted Example', titleUrl: 'https://gemini.google.com/app/synthetic', time: '2026-01-01T00:00:00Z', response: 'Reply' }]);
  assert.equal(gemini.provider, 'gemini'); assert.equal(gemini.turns[0].user, 'Example');
  const [normalized] = normalizeDocument({ provider: 'openai', conversationKey: 'stable', title: 'Example', turns: [{ user: '', turn_index: 0 }, { ai: 'Answer', turn_index: 9, extra: 'retained' }] });
  assert.equal(normalized.turns.length, 1); assert.equal(normalized.turns[0].turn_index, 9); assert.equal(normalized.turns[0].extra, 'retained');
});


test('ChatGPT -index HTML parses strict jsonData without script execution or double-converting Markdown', async t => {
  const dir = await temp(t);
  const transformed = '[Reference](https://example.com/)\n```mermaid\nflowchart TD; A-->B\n```';
  const input = [{ id: 'converted-1', current_node: 'a', mapping: { a: { id: 'a', parent: null, message: { author: { role: 'assistant' }, content: { parts: [transformed] } } } } }];
  const filename = await write(dir, 'chat-index.html', '<html><script>const jsonData = '+JSON.stringify(input)+'; globalThis.EXECUTED = true;</script></html>');
  const [conversation] = await collect(importPaths([filename]));
  assert.equal(conversation.turns[0].ai, transformed); assert.equal(globalThis.EXECUTED, undefined);
});

test('combined normalized roles split into separate renderable turns with original shared index', () => {
  const [conversation] = normalizeDocument({ provider: 'grok', title: 'Combined', turns: [{ thinking: 'Thought', ai: 'Answer', turn_index: 7 }] });
  assert.deepEqual(conversation.turns.map(t => [t.turn_index, t.thinking, t.ai]), [[7, 'Thought', undefined], [7, undefined, 'Answer']]);
});


test('ThreadShelf CLI bare normalized turn arrays import and exported stable keys roundtrip', () => {
  const [conversation] = normalizeDocument([{ user: 'Question' }, { thinking: 'Thought', ai: 'Answer' }]);
  assert.equal(conversation.provider, 'threadshelf'); assert.equal(conversation.turns.length, 3);
  const [again] = normalizeDocument(conversation);
  assert.equal(again.conversationKey, conversation.conversationKey);
});

test('previous Meta native retitled names survive direct import', () => {
  const raw = { fbid: 'synthetic', label_values: [{ label: 'Conversation.txt', value: 'You: Ask\nMeta AI: Reply' }] };
  const uid = convertMeta(Buffer.from(JSON.stringify(raw)), 'meta.json').conversations[0].uuid;
  raw.localTitleGenerator = { metaTitles: { [uid]: 'Chosen title' } };
  const [conversation] = normalizeDocument(raw);
  assert.equal(conversation.title, 'Chosen title');
});


test('malformed unrelated ZIP manifest does not prevent valid conversations importing', async t => {
  const dir = await temp(t), archive = await write(dir, 'mixed.zip', await zip({ 'manifest.json': '{broken', 'conversation.json': { platform: 'openrouter', turns: [{ role: 'user', content: 'Retained question' }] } }));
  const results = await collect(importPaths([archive]));
  assert.ok(results.some(r => r.error)); assert.ok(results.some(r => r.provider === 'openrouter'));
});

test('Venice backup multipart containers combine; missing chunks and encrypted payloads are diagnosed', async t => {
  const dir = await temp(t);
  const manifest = { backupVersion: 4, encrypted: false, chunkCount: 2, databaseVersion: 4, ownerId: 'synthetic' };
  const chunk = blocks => ({ formatName: 'dexie', formatVersion: 1, data: { databaseVersion: 4, data: blocks } });
  const first = await write(dir, 'part-1.zip', await zip({ 'manifest.json': manifest, 'db/chunk-0.json': chunk([{ tableName: 'conversations', inbound: true, rows: [{ id: 'c', ownerId: 'synthetic', title: 'Parts' }] }]) }));
  const second = await write(dir, 'part-2.zip', await zip({ 'db/chunk-1.json': chunk([{ tableName: 'messages', inbound: true, rows: [{ id: 'm', conversationId: 'c', role: 'user', content: 'Complete parts' }] }]) }));
  const complete = await collect(importPaths([first, second]));
  assert.equal(complete.length, 1); assert.equal(complete[0].turns[0].user, 'Complete parts');
  const incomplete = await collect(importPaths([first])); assert.match(incomplete[0].error, /missing chunks/i);
  const encrypted = await write(dir, 'encrypted.zip', await zip({ 'manifest.json': { ...manifest, encrypted: true } }));
  const refused = await collect(importPaths([encrypted])); assert.match(refused[0].error, /encrypted backups are not yet supported/i);
});

test('future internal content codes are preserved verbatim and unknown structured content stays inert', () => {
  const marker = '\uE200future_internal_widget\uE202{"key":"unrecognized"}\uE201';
  const input = { id: 'future', current_node: 'node', mapping: { node: { id: 'node', parent: null, message: { author: { role: 'assistant' }, content: { content_type: 'future_new_format', parts: [marker, { type: 'unknown_payload', value: '<script>never execute</script>' }] } } } } };
  const [conversation] = normalizeDocument(input);
  assert.ok(conversation.turns[0].ai.includes(marker)); assert.match(conversation.turns[0].ai, /unknown_payload/);
  assert.deepEqual(conversation.raw, input);
});
