import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectArchiveFootprint, preflightImportSpace } from '../src/core/import-preflight.mjs';

const MIB = 1024 * 1024;
const block = (digit, bytes = 10, packedBytes = 8) => ({
  sha256: digit.repeat(64), packedSha256: 'f'.repeat(64), codec: '7z', bytes, packedBytes,
  file: `${digit.repeat(64)}.${'f'.repeat(64)}.7z`,
});
const blob = object => ({ bytes: object.bytes, blocks: [object] });
const ref = (header, turns) => ({ format: 'threadshelf-content-v2', version: 1, turnCount: 1,
  header: blob(header), groups: [{ first: 0, count: 1, blob: blob(turns) }] });
const store = refs => ({ dataDir: '/data/profile', path: '/temp/archive.sqlite',
  *contentReferences() { yield* refs; },
  db: { prepare(sql) { return { get: () => sql.includes('page_count') ? { page_count: 10 } : { page_size: 4096 } }; } },
});
const footprint = { catalogBytes: MIB, uniqueExpandedContentBytes: 1000 * MIB,
  logicalContentBytes: 2000 * MIB, uniqueCompressedContentBytes: 100 * MIB, conversationCount: 2, objectCount: 3 };
const mockFS = ({ free = 1000 * MIB, separate = false, tempFree = free } = {}) => ({
  stat: async filename => ({ dev: separate && filename.startsWith('/temp') ? 2n : 1n }),
  statfs: async filename => ({ bsize: 1n, bavail: BigInt(filename.startsWith('/temp') ? tempFree : free) }),
});
const options = { dataDir: '/data/profile', workingDir: '/temp/reader', codecDir: '/temp/reader', footprint, incomingBytes: 0, incomingSize: 'exact', workers: 2 };

test('footprint uses references and logical SQLite pages without decompressing content', async () => {
  const a = block('a', 10, 8), b = block('b', 20, 12), c = block('c', 30, 18);
  const result = await inspectArchiveFootprint(store([ref(a, b), ref(a, c)]));
  assert.equal(result.conversationCount, 2);
  assert.equal(result.objectCount, 3);
  assert.equal(result.logicalContentBytes, 70);
  assert.equal(result.uniqueExpandedContentBytes, 60);
  assert.equal(result.uniqueCompressedContentBytes, 38);
  assert.equal(result.catalogBytes, 40960);
  assert.equal(result.expandedDatabaseBytes, 41020);
});

test('same filesystem combines both reservations and charges the safety reserve once', async () => {
  const result = await preflightImportSpace(options, mockFS());
  assert.equal(result.sameFilesystem, true);
  assert.equal(result.checks.length, 1);
  assert.equal(result.checks[0].requiredBytes, result.budget.workingBytes + result.budget.durableBytes + result.budget.workerScratchBytes + result.budget.reserveBytes);
  // 1 GiB expanded content is not a temporary disk requirement for RAM workers.
  assert.ok(result.checks[0].requiredBytes < 110 * MIB);
});

test('different filesystems each meet their own reserve; free space is never pooled', async () => {
  await assert.rejects(preflightImportSpace(options, mockFS({ separate: true, free: 1000 * MIB, tempFree: 32 * MIB })),
    error => error.code === 'ENOSPC' && /temporary working space/.test(error.message) && error.preflight.checks.length === 2);
  await assert.rejects(preflightImportSpace(options, mockFS({ separate: true, free: 32 * MIB, tempFree: 1000 * MIB })),
    error => error.code === 'ENOSPC' && /local storage/.test(error.message));
});

test('combined reservations fail when individually sufficient allowances share one filesystem', async () => {
  const enoughSeparately = 95 * MIB;
  await assert.rejects(preflightImportSpace(options, mockFS({ free: enoughSeparately })), error => error.code === 'ENOSPC');
});

test('unknown remote size remains explicitly unknown and distinct from a known zero', async () => {
  const result = await preflightImportSpace({ ...options, incomingBytes: null, incomingSize: 'unknown' }, mockFS());
  assert.equal(result.incomingBudgetKnown, false);
  assert.equal(result.incomingBytes, null);
  assert.equal(result.incomingSize, 'unknown');
  assert.equal(result.budgetIsEstimate, true);
  const exact = await preflightImportSpace(options, mockFS());
  assert.equal(exact.incomingBudgetKnown, true);
  assert.equal(exact.incomingBytes, 0);
});

test('incoming allowance and requested expansion are included before work starts', async () => {
  await assert.rejects(preflightImportSpace({ ...options, incomingBytes: 1000 * MIB, incomingSize: 'estimate' }, mockFS()), error => error.code === 'ENOSPC');
  await assert.rejects(preflightImportSpace({ ...options, expandDatabaseToDisk: true }, mockFS()), error => error.code === 'ENOSPC');
  const result = await preflightImportSpace({ ...options, rewriteExisting: true }, mockFS());
  assert.ok(result.budget.durableBytes >= 110 * MIB);
});

test('space cannot be silently approved when filesystem inspection fails', async () => {
  await assert.rejects(preflightImportSpace(options, { ...mockFS(), statfs: async () => { throw Object.assign(new Error('Filesystem unavailable'), { code: 'EACCES' }); } }), /Filesystem unavailable/);
});

test('missing target directory checks the nearest existing ancestor', async () => {
  const checked = [], fsAPI = mockFS();
  fsAPI.stat = async filename => {
    checked.push(filename);
    if (filename === '/data/profile') throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return { dev: 1n };
  };
  await preflightImportSpace(options, fsAPI);
  assert.ok(checked.includes('/data'));
});

test('custom storage temp root and system codec temp space are checked separately', async () => {
  const fsAPI = {
    stat: async filename => ({ dev: filename.startsWith('/codec') ? 3n : filename.startsWith('/temp') ? 2n : 1n }),
    statfs: async filename => ({ bsize: 1n, bavail: BigInt(filename.startsWith('/codec') ? 40 * MIB : 1000 * MIB) }),
  };
  await assert.rejects(preflightImportSpace({ ...options, codecDir: '/codec/system' }, fsAPI),
    error => error.code === 'ENOSPC' && /compression working space/.test(error.message) && error.preflight.checks.length === 3);
});

test('an active search catalog can be budgeted alongside the conversation catalog', async () => {
  const small = await preflightImportSpace(options, mockFS());
  const extra = await preflightImportSpace({ ...options, additionalCatalogBytes: 5 * MIB }, mockFS());
  assert.equal(extra.additionalCatalogBytes, 5 * MIB);
  assert.equal(extra.budget.workingBytes - small.budget.workingBytes, 10 * MIB);
  assert.equal(extra.budget.durableBytes - small.budget.durableBytes, Math.ceil(5 * MIB * 1.1));
});

test('negative, overflowing, and inconsistent size inputs are rejected', async () => {
  for (const incomingBytes of [-1, Number.MAX_SAFE_INTEGER + 1, Infinity]) {
    await assert.rejects(preflightImportSpace({ ...options, incomingBytes }, mockFS()), RangeError);
  }
  await assert.rejects(preflightImportSpace({ ...options, incomingBytes: null, incomingSize: 'exact' }, mockFS()), TypeError);
  await assert.rejects(preflightImportSpace({ ...options, footprint: { ...footprint, catalogBytes: Number.MAX_SAFE_INTEGER } }, mockFS()), RangeError);
});

test('aborted inspections do not read filesystem or archive data', async () => {
  const controller = new AbortController(); controller.abort();
  const never = async () => { assert.fail('Filesystem should not be queried'); };
  await assert.rejects(preflightImportSpace({ ...options, signal: controller.signal }, { stat: never, statfs: never }), { name: 'AbortError' });
});
