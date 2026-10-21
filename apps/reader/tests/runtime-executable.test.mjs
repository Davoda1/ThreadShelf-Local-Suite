import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeVerifiedRuntimeExecutable, verifyRuntimeExecutable } from '../scripts/runtime-executable.mjs';

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tslr-runtime-executable-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'electron');
  const destination = path.join(directory, 'threadshelf-local-reader');
  // Cross a 4 MiB boundary and retain a distinct tail: the real managed-copy
  // failure silently ended on a 4 MiB boundary despite a successful rename.
  const bytes = Buffer.alloc(4 * 1024 * 1024 + 257, 0x36);
  bytes.write('ELF runtime fixture', 0);
  bytes.write('complete executable tail', bytes.length - 24);
  await fs.writeFile(source, bytes, { mode: 0o755 });
  return { source, destination, bytes };
}

test('runtime branding writes and verifies complete bytes over a truncated destination', async t => {
  const { source, destination, bytes } = await fixture(t);
  await fs.writeFile(destination, bytes.subarray(0, 1024));
  const expected = await writeVerifiedRuntimeExecutable(source, destination);
  assert.equal(expected.bytes, bytes.length);
  assert.deepEqual(await fs.readFile(destination), bytes);
  assert.deepEqual(await fs.readFile(source), bytes, 'source remains available until caller accepts the write');
  if (process.platform !== 'win32') assert.equal((await fs.stat(destination)).mode & 0o777, 0o755);
  await verifyRuntimeExecutable(destination, expected);
  const changed = Buffer.from(bytes);
  changed[changed.length - 1] ^= 1;
  await fs.writeFile(destination, changed);
  await assert.rejects(verifyRuntimeExecutable(destination, expected), /integrity failed/);
});

test('runtime branding rejects a silently truncated write and retains its good source', async t => {
  const { source, destination, bytes } = await fixture(t);
  const open = fs.open;
  t.mock.method(fs, 'open', async (filename, ...args) => {
    const handle = await open(filename, ...args);
    if (filename !== destination) return handle;
    return {
      writeFile: data => handle.writeFile(data.subarray(0, 4 * 1024 * 1024)),
      sync: () => handle.sync(),
      close: () => handle.close()
    };
  });
  await assert.rejects(writeVerifiedRuntimeExecutable(source, destination), /integrity failed/);
  assert.deepEqual(await fs.readFile(source), bytes);
});

test('runtime branding propagates a flush failure without accepting or removing its source', async t => {
  const { source, destination, bytes } = await fixture(t);
  const open = fs.open;
  t.mock.method(fs, 'open', async (filename, ...args) => {
    const handle = await open(filename, ...args);
    if (filename !== destination) return handle;
    return {
      writeFile: data => handle.writeFile(data),
      sync: async () => { throw new Error('Injected fsync failure'); },
      close: () => handle.close()
    };
  });
  await assert.rejects(writeVerifiedRuntimeExecutable(source, destination), /Injected fsync failure/);
  assert.deepEqual(await fs.readFile(source), bytes);
});
