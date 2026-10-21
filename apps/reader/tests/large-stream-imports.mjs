/** Opt-in real-size I/O evidence: node --max-old-space-size=512 tests/large-stream-imports.mjs
 * Writes about 0.6 GiB, plus a sparse >4 GiB archive and a compressed >4 GiB member.
 * All generated private fixtures are removed in finally. Not part of quick tests. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { crc32 } from 'node:zlib';
import { ZipWriter } from '@zip.js/zip.js';
import { importPaths } from '../src/core/importers.mjs';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-large-stream-'));
const evidence = { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model, memoryGiB: os.totalmem() / 1024 ** 3, results: [] };
let peakRSS = process.memoryUsage().rss;
const memory = setInterval(() => { peakRSS = Math.max(peakRSS, process.memoryUsage().rss); }, 20);
const conversation = id => ({ id, title: 'Large fixture 🐱', messages: [{ role: 'user', content: 'exact Unicode árvíztűrő 日本語', turn_index: 7 }] });

function end64(count, directorySize, directoryOffset, endOffset) {
  const end = Buffer.alloc(56), locator = Buffer.alloc(20), classic = Buffer.alloc(22);
  end.writeUInt32LE(0x06064b50); end.writeBigUInt64LE(44n, 4); end.writeUInt16LE(45, 12); end.writeUInt16LE(45, 14);
  end.writeBigUInt64LE(BigInt(count), 24); end.writeBigUInt64LE(BigInt(count), 32); end.writeBigUInt64LE(BigInt(directorySize), 40); end.writeBigUInt64LE(BigInt(directoryOffset), 48);
  locator.writeUInt32LE(0x07064b50); locator.writeBigUInt64LE(BigInt(endOffset), 8); locator.writeUInt32LE(1, 16);
  classic.writeUInt32LE(0x06054b50); classic.writeUInt16LE(0xffff, 8); classic.writeUInt16LE(0xffff, 10); classic.writeUInt32LE(0xffffffff, 12); classic.writeUInt32LE(0xffffffff, 16);
  return Buffer.concat([end, locator, classic]);
}
function stored(name, content, offset = 0) {
  const n = Buffer.from(name), checksum = crc32(content), local = Buffer.alloc(30), central = Buffer.alloc(46), extra = Buffer.alloc(12);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(45, 4); local.writeUInt32LE(checksum, 14); local.writeUInt32LE(content.length, 18); local.writeUInt32LE(content.length, 22); local.writeUInt16LE(n.length, 26);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(45, 4); central.writeUInt16LE(45, 6); central.writeUInt32LE(checksum, 16); central.writeUInt32LE(content.length, 20); central.writeUInt32LE(content.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt16LE(extra.length, 30); central.writeUInt32LE(0xffffffff, 42);
  extra.writeUInt16LE(1, 0); extra.writeUInt16LE(8, 2); extra.writeBigUInt64LE(BigInt(offset), 4);
  return { local: Buffer.concat([local, n, content]), central: Buffer.concat([central, n, extra]) };
}
async function check(name, fn) {
  const start = performance.now(), result = await fn();
  const metric = { name, ...result, seconds: +( (performance.now() - start) / 1000).toFixed(3), peakRSSMiB: +(Math.max(peakRSS, process.memoryUsage().rss) / 1024 ** 2).toFixed(1) };
  evidence.results.push(metric); console.log(JSON.stringify(metric));
}
async function imported(filename, verify) { let count = 0; for await (const record of importPaths([filename])) { assert.ok(!record.error, record.error); verify?.(record, count); count++; } return count; }
try {
  const space = await fs.statfs(dir); assert.ok(space.bavail * space.bsize > 800 * 1024 ** 2, 'At least800MiB temporary free space is required.');
  await check('actual JSON export larger than512MiB', async () => {
    const filename = path.join(dir, 'conversations-index.json'), handle = await fs.open(filename, 'w');
    const payload = 'A'.repeat(1024 ** 2) + '\n日本語😀 exact end'; const count = 520;
    try { await handle.write('['); for (let i = 0; i < count; i++) await handle.write((i ? ',' : '') + JSON.stringify({ id: `large-${i}`, messages: [{ role: 'user', content: payload, turn_index: 9 }] })); await handle.write(']'); } finally { await handle.close(); }
    const bytes = (await fs.stat(filename)).size; assert.ok(bytes > 512 * 1024 ** 2);
    const records = await imported(filename, (record, index) => { assert.equal(record.conversationKey, 'converted:large-' + index); assert.equal(record.turns[0].turn_index, 9); assert.equal(record.turns[0].user, payload); assert.equal(record.raw.messages[0].content, payload); });
    assert.equal(records, count); await fs.rm(filename); return { bytes, records };
  });
  await check('actual sparse ZIP64 file with member and directory offsets above4GiB', async () => {
    const filename = path.join(dir, 'offsets-over-4gib.zip'), offset = 4 * 1024 ** 3 + 123, data = Buffer.from(JSON.stringify([conversation('large-offset')]));
    const parts = stored('conversations.json', data, offset), directoryOffset = offset + parts.local.length, endOffset = directoryOffset + parts.central.length;
    const handle = await fs.open(filename, 'w');
    try { await handle.write(parts.local, 0, parts.local.length, offset); await handle.write(parts.central, 0, parts.central.length, directoryOffset); const ending = end64(1, parts.central.length, directoryOffset, endOffset); await handle.write(ending, 0, ending.length, endOffset); } finally { await handle.close(); }
    const bytes = (await fs.stat(filename)).size; assert.ok(bytes > 4 * 1024 ** 3); const records = await imported(filename, r => assert.equal(r.conversationKey, 'converted:large-offset')); assert.equal(records, 1);
    await fs.rm(filename); return { bytes, sparse: true, records };
  });
  await check('ZIP64 directory count above65535', async () => {
    const filename = path.join(dir, 'many-entries.zip'), handle = await fs.open(filename, 'w'), central = []; let offset = 0;
    const count = 65537;
    try {
      for (let i = 0; i < count; i++) { const p = stored(i === count - 1 ? 'conversations.json' : `media/${i}.txt`, i === count - 1 ? Buffer.from(JSON.stringify([conversation('many-entries')])) : Buffer.alloc(0), offset); await handle.write(p.local); offset += p.local.length; central.push(p.central); }
      const directory = Buffer.concat(central); await handle.write(directory); await handle.write(end64(count, directory.length, offset, offset + directory.length));
    } finally { await handle.close(); }
    const records = await imported(filename); assert.equal(records, 1); const bytes = (await fs.stat(filename)).size; await fs.rm(filename); return { bytes, entries: count, records };
  });
  await check('actual ZIP64 member expanded beyond4GiB and cumulative2GiB', async () => {
    const filename = path.join(dir, 'expanded-over-4gib.zip'), handle = await fs.open(filename, 'w'); let compressed = 0;
    const writable = new WritableStream({ async write(chunk) { await handle.write(chunk); compressed += chunk.byteLength; } });
    const writer = new ZipWriter(writable, { zip64: true, useWebWorkers: false, level: 1 });
    const spaces = new Uint8Array(1024 ** 2).fill(32), prefix = Buffer.from('['), suffix = Buffer.from(JSON.stringify(conversation('expanded')) + ']'); let chunk = -1;
    const source = new ReadableStream({ pull(controller) { if (chunk === -1) controller.enqueue(prefix); else if (chunk < 4097) controller.enqueue(spaces); else if (chunk === 4097) controller.enqueue(suffix); else return controller.close(); chunk++; } });
    try { await writer.add('conversations.json', source); await writer.close(); } finally { await handle.close(); }
    const records = await imported(filename, r => assert.equal(r.conversationKey, 'converted:expanded')); assert.equal(records, 1);
    const expandedBytes = 4097 * 1024 ** 2 + prefix.length + suffix.length; assert.ok(expandedBytes > 4 * 1024 ** 3); await fs.rm(filename); return { compressedBytes: compressed, expandedBytes, records };
  });
  evidence.peakRSSMiB = +(peakRSS / 1024 ** 2).toFixed(1);
  const output = process.env.THREADSHELF_LARGE_EVIDENCE;
  if (output) await fs.writeFile(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'PASS', ...evidence }));
} finally { clearInterval(memory); await fs.rm(dir, { force: true, recursive: true }); }
