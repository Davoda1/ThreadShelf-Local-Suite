// Copyright (c) 2026 davoda1. MIT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function files(relative = '') {
  const result = [];
  for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = path.posix.join(relative, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Unexpected patch symlink: ${name}`);
    if (entry.isDirectory()) result.push(...await files(name));
    else {
      assert.ok(entry.isFile(), `Unexpected patch entry: ${name}`);
      result.push(name);
    }
  }
  return result.sort();
}

test('the single checksum manifest covers every patch file with exact bytes', async () => {
  const lines = (await fs.readFile(path.join(root, 'SHA256SUMS.txt'), 'utf8')).trim().split('\n');
  const listed = [];
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9._/-]+)$/.exec(line);
    assert.ok(match, 'Malformed checksum manifest line');
    const [, digest, relative] = match;
    assert.ok(!relative.startsWith('/') && !relative.split('/').some(part => !part || part === '.' || part === '..'));
    assert.equal(sha(await fs.readFile(path.join(root, relative))), digest, relative);
    listed.push(relative);
  }
  assert.equal(new Set(listed).size, listed.length, 'Duplicate checksum entries');
  assert.deepEqual(listed.sort(), (await files()).filter(name => name !== 'SHA256SUMS.txt'));
});

for (const version of ['1.3.0', '1.4.1']) {
  test(`${version} payloads match their installer metadata after relocation`, async () => {
    const directory = path.join(root, version);
    const metadata = JSON.parse(await fs.readFile(path.join(directory, 'supported-source.json'), 'utf8'));
    assert.equal(metadata.upstream.version, version);
    assert.deepEqual(Object.keys(metadata.payloadHashes).sort(), ['payload/reader-search.ts', 'payload/reader-store.ts.inc']);
    for (const [relative, digest] of Object.entries(metadata.payloadHashes))
      assert.equal(sha(await fs.readFile(path.join(directory, relative))), digest, `${version}/${relative}`);
  });
}
