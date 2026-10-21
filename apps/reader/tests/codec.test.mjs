import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { encodeBuffer, decodeBuffer, encodeFile, decodeFile, normalizeProfile, getCodecExecutable, MAX_CODEC_BYTES } from '../src/core/codec.mjs';

const fixtures = [Buffer.alloc(0), Buffer.from('Árvíztűrő tükörfúrógép 日本語 中文 emoji 👩🏽‍💻\0\n'.repeat(50)), randomBytes(128 * 1024)];
async function temporary(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-codec-test-őű-'));
  try { return await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
for (const profile of ['7z', 'zip6']) {
  test(`${profile}: empty, Unicode and incompressible payloads round trip with exact container`, () => {
    for (const source of fixtures) {
      const packed = encodeBuffer(source, profile);
      assert.equal(packed.subarray(0, 2).toString('ascii'), profile === '7z' ? '7z' : 'PK');
      assert.deepEqual(decodeBuffer(packed, profile, { maxBytes: source.length, expectedBytes: source.length }), source);
    }
  });
  test(`${profile}: mismatched descriptors and expanded size limits reject`, () => {
    const packed = encodeBuffer(fixtures[1], profile);
    assert.throws(() => decodeBuffer(packed, profile, { maxBytes: 1 }), { code: 'CODEC_LIMIT' });
    assert.throws(() => decodeBuffer(packed, profile, { expectedBytes: 2 }), /does not match/);
    assert.throws(() => decodeBuffer(packed, profile === '7z' ? 'zip6' : '7z'), /container does not match/);
    const corrupted = Buffer.from(packed); corrupted[Math.floor(corrupted.length / 2)] ^= 0xff;
    assert.throws(() => decodeBuffer(corrupted, profile), /Storage|storage/);
    assert.throws(() => decodeBuffer(packed.subarray(0, packed.length - 10), profile), /Storage|storage/);
  });
  test(`${profile}: streaming files preserve Unicode paths and destination exclusivity`, async () => temporary(async dir => {
    const source = path.join(dir, '源 őű.bin'), packed = path.join(dir, 'archive.data'), output = path.join(dir, 'decoded.bin');
    await fs.writeFile(source, fixtures[2]);
    const encoded = await encodeFile(source, packed, { profile });
    assert.equal(encoded.profile, profile); assert.equal(encoded.expandedBytes, fixtures[2].length);
    await decodeFile(packed, output, { profile, maxBytes: fixtures[2].length, expectedBytes: fixtures[2].length });
    assert.deepEqual(await fs.readFile(output), fixtures[2]);
    await assert.rejects(encodeFile(source, packed, { profile }), { code: 'EEXIST' });
    await assert.rejects(decodeFile(packed, output, { profile, maxBytes: fixtures[2].length }), { code: 'EEXIST' });
    assert.deepEqual((await fs.readdir(dir)).sort(), ['archive.data', 'decoded.bin', '源 őű.bin'].sort());
  }));
}
test('compression profiles canonicalize ZIP alias; invalid profiles and size ceilings reject', () => {
  assert.equal(normalizeProfile('zip'), 'zip6'); assert.equal(normalizeProfile('zip6'), 'zip6');
  assert.throws(() => encodeBuffer(Buffer.alloc(1), 'gzip'), { code: 'CODEC_PROFILE' });
  assert.throws(() => encodeBuffer(Buffer.alloc(2), '7z', { maxBytes: 1 }), { code: 'CODEC_LIMIT' });
  assert.throws(() => decodeBuffer(Buffer.alloc(0), '7z', { maxBytes: MAX_CODEC_BYTES + 1 }), { code: 'CODEC_LIMIT' });
});
test('7z to ZIP6 to 7z conversion preserves every byte', () => {
  const source = Buffer.concat(fixtures), high = encodeBuffer(source, '7z');
  const fast = encodeBuffer(decodeBuffer(high, '7z'), 'zip6');
  assert.deepEqual(decodeBuffer(encodeBuffer(decodeBuffer(fast, 'zip6'), '7z'), '7z'), source);
});
test('untrusted member names and oversized dictionaries are rejected before content extraction', async () => temporary(async dir => {
  for (const [name, dictionary] of [['../escape.bin', '16m'], ['payload.bin', '128m']]) {
    const packed = path.join(dir, `${dictionary}.7z`);
    const result = spawnSync(getCodecExecutable(), ['a', '-t7z', packed, `-si${name}`, '-m0=LZMA2', `-md=${dictionary}`, '-mmt=1', '-mhc=off'], { input: Buffer.from('unsafe archive test'), maxBuffer: 32768 });
    assert.equal(result.status, 0);
    assert.throws(() => decodeBuffer(requireBuffer(packed), '7z'), /member name|parameters/);
  }
}));
function requireBuffer(file) { return readFileSync(file); }
test('ZIP members identify regular files for independent extractors', () => {
  const packed = encodeBuffer(fixtures[1], 'zip6');
  const offset = packed.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.ok(offset > 0);
  assert.equal(packed[offset + 5], 3);
  assert.equal((packed.readUInt32LE(offset + 38) >>> 16) & 0xf000, 0x8000);
});
test('ZIP size fields equal to header magic do not confuse metadata normalization', () => {
  const source = Buffer.alloc(0x02014b50);
  const packed = encodeBuffer(source, 'zip6');
  assert.deepEqual(decodeBuffer(packed, 'zip6', { maxBytes: source.length }), source);
});
test('7z compressed headers rejected before native header decompression', () => {
  const packed = encodeBuffer(fixtures[1], '7z');
  packed[32 + Number(packed.readBigUInt64LE(12))] = 0x17;
  assert.throws(() => decodeBuffer(packed, '7z'), /Compressed 7z storage headers/);
});
test('multiple members rejected instead of concatenating unrelated data', async () => temporary(async dir => {
  await fs.writeFile(path.join(dir, 'payload.bin'), 'first'); await fs.writeFile(path.join(dir, 'extra.bin'), 'second');
  const packed = path.join(dir, 'two.7z');
  const result = spawnSync(getCodecExecutable(), ['a', '-t7z', packed, 'payload.bin', 'extra.bin', '-m0=LZMA2', '-md=16m', '-mhc=off'], { cwd: dir });
  assert.equal(result.status, 0);
  assert.throws(() => decodeBuffer(requireBuffer(packed), '7z'), /exactly one member/);
}));
test('pre-cancelled and live-cancelled file compression leave no destination or staging files', async () => temporary(async dir => {
  const source = path.join(dir, 'large.bin'), target = path.join(dir, 'large.7z');
  await fs.writeFile(source, randomBytes(16 * 1024 ** 2));
  const controller = new AbortController(); controller.abort();
  assert.throws(() => encodeBuffer(fixtures[1], '7z', { signal: controller.signal }), { name: 'AbortError' });
  await assert.rejects(encodeFile(source, target, { signal: controller.signal }), { name: 'AbortError' });
  const running = new AbortController();
  const work = encodeFile(source, target, { signal: running.signal });
  setTimeout(() => running.abort(), 20);
  await assert.rejects(work, { name: 'AbortError' });
  assert.deepEqual(await fs.readdir(dir), ['large.bin']);
}));
test('file decoding requires explicit size budget and removes failed output', async () => temporary(async dir => {
  const packed = path.join(dir, 'input.7z'), output = path.join(dir, 'output');
  await fs.writeFile(packed, encodeBuffer(fixtures[1], '7z'));
  await assert.rejects(decodeFile(packed, output), { code: 'CODEC_LIMIT' });
  await assert.rejects(decodeFile(packed, output, { maxBytes: 1 }), { code: 'CODEC_LIMIT' });
  assert.deepEqual(await fs.readdir(dir), ['input.7z']);
}));
