/** Metadata-only import/cleanup sizing. No conversation body is decompressed. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { validateContentRef, contentObjects, CONTENT_BLOCK_BYTES } from './content-packs.mjs';

const MIB = 1024 * 1024;
const MAX_BYTES = BigInt(Number.MAX_SAFE_INTEGER);
const DEFAULT_RESERVE = 64 * MIB;
const integer = (value, name) => {
  if (typeof value === 'bigint') {
    if (value < 0n || value > MAX_BYTES) throw new RangeError(`${name} exceeds the supported size range.`);
    return value;
  }
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative safe byte count.`);
  return BigInt(value);
};
const number = (value, name) => Number(integer(value, name));
const plus = (...values) => values.reduce((sum, value) => integer(sum + integer(value, 'Storage size'), 'Combined storage size'), 0n);
const padded = value => (integer(value, 'Storage size') * 110n + 99n) / 100n;
const checkAbort = signal => signal?.throwIfAborted();

/** Logical bytes include every reference. Unique bytes count each stored object
 * file once, so shared content across collections does not inflate disk sizing.
 * Catalog bytes use SQLite's logical page count, including uncheckpointed WAL.
 * This is the conversation archive; separate search indexes and audio caches
 * are outside this inventory.
 */
export async function inspectArchiveFootprint(store, { signal, stat = fs.stat } = {}) {
  if (!store || typeof store.contentReferences !== 'function') throw new TypeError('An open local archive is required.');
  checkAbort(signal);
  const objects = new Map();
  let conversationCount = 0, logicalContentBytes = 0n, uniqueExpandedContentBytes = 0n, uniqueCompressedContentBytes = 0n;
  for (const ref of store.contentReferences()) {
    checkAbort(signal);
    validateContentRef(ref);
    conversationCount++;
    if (!Number.isSafeInteger(conversationCount)) throw new RangeError('The archive has too many conversations.');
    logicalContentBytes = plus(logicalContentBytes, ref.header.bytes);
    for (const group of ref.groups) logicalContentBytes = plus(logicalContentBytes, group.blob.bytes);
    for (const object of contentObjects(ref)) {
      const previous = objects.get(object.file);
      if (previous && (previous.bytes !== object.bytes || previous.packedBytes !== object.packedBytes)) throw new Error('The archive has inconsistent content object sizes.');
      if (!previous) {
        objects.set(object.file, { bytes: object.bytes, packedBytes: object.packedBytes });
        uniqueExpandedContentBytes = plus(uniqueExpandedContentBytes, object.bytes);
        uniqueCompressedContentBytes = plus(uniqueCompressedContentBytes, object.packedBytes);
      }
    }
    // Large inventories remain cancellable without materializing body content.
    if (conversationCount % 250 === 0) await new Promise(resolve => setImmediate(resolve));
  }
  let catalogBytes;
  if (store.db?.prepare) {
    const count = store.db.prepare('PRAGMA page_count').get().page_count;
    const size = store.db.prepare('PRAGMA page_size').get().page_size;
    catalogBytes = integer(integer(count, 'Catalog pages') * integer(size, 'Catalog page size'), 'Catalog size');
  } else {
    if (typeof store.path !== 'string') throw new TypeError('The archive catalog path is unavailable.');
    catalogBytes = integer((await stat(store.path, { bigint: true })).size, 'Catalog size');
  }
  checkAbort(signal);
  return {
    conversationCount, objectCount: objects.size,
    catalogBytes: number(catalogBytes, 'Catalog size'),
    logicalContentBytes: number(logicalContentBytes, 'Logical content size'),
    uniqueExpandedContentBytes: number(uniqueExpandedContentBytes, 'Expanded content size'),
    uniqueCompressedContentBytes: number(uniqueCompressedContentBytes, 'Compressed content size'),
    expandedDatabaseBytes: number(plus(catalogBytes, uniqueExpandedContentBytes), 'Expanded database size'),
    sizeSource: 'catalog-metadata',
  };
}

async function filesystem(directory, { stat, statfs }, signal) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new TypeError('Storage directories must be absolute paths.');
  let existing = path.resolve(directory), metadata;
  for (;;) {
    checkAbort(signal);
    try { metadata = await stat(existing, { bigint: true }); break; }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(existing);
      if (parent === existing) throw error;
      existing = parent;
    }
  }
  checkAbort(signal);
  const capacity = await statfs(existing, { bigint: true });
  const blockSize = integer(capacity.bsize, 'Filesystem block size');
  const availableBlocks = integer(capacity.bavail, 'Filesystem available blocks');
  const freeBytes = integer(blockSize * availableBlocks, 'Filesystem free space');
  // stat.dev identifies the actual filesystem, including separate mount points.
  const device = integer(metadata.dev, 'Filesystem device').toString();
  return { directory: path.resolve(directory), existingDirectory: existing, device, freeBytes };
}

/** Check the extra space needed by the operation; existing files already occupy
 * space and must not be charged a second time. incomingBytes is an allowance for
 * new expanded normalized content, NOT compressed ZIP/export file size. A null
 * allowance explicitly means the remote size is unknown, requiring incremental
 * checks as records arrive. It never claims an unknown import is fully budgeted.
 *
 * Worker decoding is in RAM by default. Reserve bounded compressed scratch for
 * workers, two catalog copies for checkpoint/verification, and a padded durable
 * catalog snapshot. Full body expansion is charged only when explicitly enabled.
 */
export async function preflightImportSpace({
  store, dataDir = store?.dataDir, workingDir = os.tmpdir(), codecDir = os.tmpdir(), incomingBytes = null,
  incomingSize = incomingBytes === null ? 'unknown' : 'estimate', workers = 4,
  expandDatabaseToDisk = false, rewriteExisting = false, reserveBytes = DEFAULT_RESERVE,
  additionalCatalogBytes = 0, signal, footprint,
} = {}, { stat = fs.stat, statfs = fs.statfs } = {}) {
  checkAbort(signal);
  if (!Number.isSafeInteger(workers) || workers < 1 || workers > 64) throw new RangeError('Use between 1 and 64 storage workers.');
  if (!['unknown', 'estimate', 'exact'].includes(incomingSize)) throw new TypeError('Incoming size must be unknown, estimate, or exact.');
  if ((incomingBytes === null) !== (incomingSize === 'unknown')) throw new TypeError('An unknown incoming size must not include a byte allowance.');
  const incoming = incomingBytes === null ? 0n : integer(incomingBytes, 'Incoming size');
  const reserve = integer(reserveBytes, 'Free-space reserve');
  const archive = footprint ?? await inspectArchiveFootprint(store, { signal, stat });
  const extraCatalog = integer(additionalCatalogBytes, 'Additional catalog size');
  const catalog = plus(integer(archive.catalogBytes, 'Catalog size'), extraCatalog);
  const expanded = integer(archive.uniqueExpandedContentBytes, 'Expanded content size');
  const compressed = integer(archive.uniqueCompressedContentBytes, 'Compressed content size');
  // A worker's codec scratch is a compressed block plus container allowance;
  // its expanded body remains bounded in memory, not a second disk database.
  const workerScratch = BigInt(workers) * BigInt(CONTENT_BLOCK_BYTES + MIB);
  const workingRequired = plus(catalog * 2n, expandDatabaseToDisk ? expanded : 0n);
  const durableRequired = plus(padded(catalog), padded(incoming), rewriteExisting ? padded(compressed) : 0n);
  const fsAPI = { stat, statfs };
  const [persistent, working, codec] = await Promise.all([
    filesystem(dataDir, fsAPI, signal), filesystem(workingDir, fsAPI, signal), filesystem(codecDir, fsAPI, signal),
  ]);
  checkAbort(signal);
  const volumes = new Map();
  for (const [volume, location, bytes] of [
    [persistent, 'local storage', durableRequired], [working, 'temporary working space', workingRequired],
    [codec, 'compression working space', workerScratch],
  ]) {
    let entry = volumes.get(volume.device);
    if (!entry) {
      entry = { locations: [], directories: [], freeBytes: volume.freeBytes, requiredBytes: reserve };
      volumes.set(volume.device, entry);
    }
    entry.locations.push(location);
    if (!entry.directories.includes(volume.directory)) entry.directories.push(volume.directory);
    if (volume.freeBytes < entry.freeBytes) entry.freeBytes = volume.freeBytes;
    entry.requiredBytes = plus(entry.requiredBytes, bytes);
  }
  const requirements = [...volumes.values()].map(({ locations, ...entry }) => ({ ...entry, location: locations.join(' and ') }));
  const sameFilesystem = volumes.size === 1;
  const result = {
    ...archive, additionalCatalogBytes: number(extraCatalog, 'Additional catalog size'), incomingBytes, incomingSize, incomingBudgetKnown: incomingSize !== 'unknown',
    budgetIsEstimate: true, workers, sameFilesystem, expandDatabaseToDisk,
    checks: requirements.map(check => ({ ...check, freeBytes: number(check.freeBytes, 'Filesystem free space'), requiredBytes: number(check.requiredBytes, 'Required space') })),
    budget: { workerScratchBytes: number(workerScratch, 'Worker scratch size'),
      workingBytes: number(workingRequired, 'Working space'), durableBytes: number(durableRequired, 'Durable space'), reserveBytes: number(reserve, 'Reserve') },
  };
  for (const check of result.checks) {
    if (check.freeBytes < check.requiredBytes) {
      const needed = Math.ceil(check.requiredBytes / MIB), available = Math.floor(check.freeBytes / MIB);
      throw Object.assign(new Error(`Not enough disk space for ${check.location}. Need at least ${needed} MiB; ${available} MiB is available. Free space on ${check.directories.join(' or ')} and retry.`),
        { code: 'ENOSPC', preflight: result, requiredBytes: check.requiredBytes, availableBytes: check.freeBytes });
    }
  }
  return result;
}
