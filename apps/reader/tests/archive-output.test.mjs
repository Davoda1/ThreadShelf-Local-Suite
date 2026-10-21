import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { ZipWriter, ZipReader, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import { createBoundedArchiveSink, writeVerifiedArchive } from '../scripts/archive-output.mjs';

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tslr-zip-output-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { directory, filename: path.join(directory, 'release.zip') };
}

test('finalized ZIP retains data beyond 4 MiB and its complete central directory on disk', async t => {
  const { filename } = await fixture(t);
  const input = randomBytes(4 * 1024 * 1024 + 257);
  const sink = createBoundedArchiveSink();
  assert.throws(() => sink.completeBytes(), /not finished closing/);
  const writer = new ZipWriter(sink.writable, { useWebWorkers: false, level: 0 });
  await writer.add('large.bin', new Uint8ArrayReader(input), { zip64: false });
  await writer.add('tail.txt', new Uint8ArrayReader(Buffer.from('final archive entry')), { zip64: false });
  await writer.close();
  const bytes = sink.completeBytes();
  const result = await writeVerifiedArchive(filename, bytes);
  assert.equal(result.bytes, bytes.length);
  assert.equal(result.repairedAfterRename, false);
  const actual = await fs.readFile(filename);
  assert.deepEqual(actual, bytes);
  const reader = new ZipReader(new Uint8ArrayReader(actual), { useWebWorkers: false });
  try {
    const entries = await reader.getEntries();
    assert.deepEqual(entries.map(entry => entry.filename), ['large.bin', 'tail.txt']);
    assert.deepEqual(Buffer.from(await entries[0].getData(new Uint8ArrayWriter(), { checkSignature: true })), input);
    assert.equal(Buffer.from(await entries[1].getData(new Uint8ArrayWriter(), { checkSignature: true })).toString(), 'final archive entry');
  } finally { await reader.close(); }
});

test('archive sink has a hard size bound and does not retain reused compressor buffers', async () => {
  const sink = createBoundedArchiveSink(4), writer = sink.writable.getWriter();
  const input = Uint8Array.of(1, 2, 3, 4);
  await writer.write(input); input.fill(9);
  await writer.close();
  assert.deepEqual(sink.completeBytes(), Buffer.from([1, 2, 3, 4]));
  const limited = createBoundedArchiveSink(4), tooLarge = limited.writable.getWriter();
  const closed = assert.rejects(tooLarge.closed, /output limit/);
  await assert.rejects(tooLarge.write(Uint8Array.of(1, 2, 3, 4, 5)), /output limit/);
  await closed;
  assert.throws(() => limited.completeBytes(), /not finished/);
});

test('truncated write is rejected before replacing the previous release artifact', async t => {
  const { directory, filename } = await fixture(t);
  await fs.writeFile(filename, 'previous valid artifact');
  const open = fs.open;
  t.mock.method(fs, 'open', async (target, ...args) => {
    const handle = await open(target, ...args);
    return { writeFile: data => handle.writeFile(data.subarray(0, data.length - 1)), sync: () => handle.sync(), close: () => handle.close() };
  });
  await assert.rejects(writeVerifiedArchive(filename, Buffer.from('complete finalized ZIP')), /output integrity failed/);
  assert.equal(await fs.readFile(filename, 'utf8'), 'previous valid artifact');
  assert.deepEqual(await fs.readdir(directory), ['release.zip']);
});

test('managed rename truncation is repaired from the complete buffer and independently verified', async t => {
  const { filename } = await fixture(t), bytes = randomBytes(4 * 1024 * 1024 + 257);
  const rename = fs.rename;
  t.mock.method(fs, 'rename', async (source, destination) => {
    await rename(source, destination);
    await fs.writeFile(destination, bytes.subarray(0, 4 * 1024 * 1024));
  });
  const result = await writeVerifiedArchive(filename, bytes);
  assert.equal(result.repairedAfterRename, true);
  assert.deepEqual(await fs.readFile(filename), bytes);
});

test('failed flush never replaces a previous artifact or leaves an accepted temporary ZIP', async t => {
  const { directory, filename } = await fixture(t);
  await fs.writeFile(filename, 'previous valid artifact');
  const open = fs.open;
  t.mock.method(fs, 'open', async (target, ...args) => {
    const handle = await open(target, ...args);
    return { writeFile: data => handle.writeFile(data), sync: async () => { throw new Error('Injected flush failure'); }, close: () => handle.close() };
  });
  await assert.rejects(writeVerifiedArchive(filename, Buffer.from('complete finalized ZIP')), /Injected flush failure/);
  assert.equal(await fs.readFile(filename, 'utf8'), 'previous valid artifact');
  assert.deepEqual(await fs.readdir(directory), ['release.zip']);
});
