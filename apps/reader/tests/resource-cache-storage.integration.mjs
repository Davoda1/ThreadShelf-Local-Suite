// Explicit integration: node tests/resource-cache-storage.integration.mjs
// Kept outside *.test.mjs so the established automatic suite remains unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import sharp from 'sharp';
import { ApplicationService } from '../src/core/service.mjs';
import { localReadingKey } from '../src/core/manager-reading.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-cache-storage-'));
const dataDir = path.join(root, 'Synthetic profile');
const project = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const evidenceFile = path.join(project, '.verification/resource-cache-storage-integration.json');
const image = await sharp({ create: { width: 3, height: 2, channels: 4, background: '#3979b8ff' } }).png().toBuffer();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
let fetches = 0, offline = false, service, requestNumber = 0;
const checks = [];
const record = name => checks.push({ name, passed: true });
const request = (_url, options, callback) => {
  const handle = new EventEmitter();
  handle.end = () => queueMicrotask(() => {
    try {
      assert.equal(offline, false, 'Offline cache hit unexpectedly requested the network.');
      options.lookup('synthetic.example.test', { all: true }, (error, addresses) => {
        assert.equal(error, null); assert.deepEqual(addresses, [{ address: '93.184.216.34', family: 4 }]);
      });
      fetches++;
      const response = Readable.from([image]);
      response.statusCode = 200;
      response.headers = { 'content-type': 'image/png', 'content-length': String(image.length) };
      callback(response);
    } catch (error) { handle.emit('error', error); }
  });
  return handle;
};
const serviceOptions = { dataDir, resourceCacheOptions: {
  lookup: async () => { assert.equal(offline, false); return [{ address: '93.184.216.34', family: 4 }]; }, request,
} };
async function treeHashes(directory) {
  const result = {};
  async function visit(folder, prefix = '') {
    for (const entry of (await fs.readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name, file = path.join(folder, entry.name);
      assert.equal(entry.isSymbolicLink(), false);
      if (entry.isDirectory()) await visit(file, name);
      else if (entry.isFile()) result[name] = hash(await fs.readFile(file));
    }
  }
  await visit(directory); return result;
}
async function importConversation(id) {
  const imageUrl = `https://synthetic.example.test/${id}.png`;
  const filename = path.join(root, `${id}.json`);
  await fs.writeFile(filename, JSON.stringify({ id, title: `Synthetic cache boundary ${id}`, messages: [
    { role: 'user', content: 'Preserve this question and reading position.' },
    { role: 'assistant', content: `A retained answer. ![Synthetic image](${imageUrl})` },
  ] }));
  const result = await service.handle('import.paths', { paths: [filename], collection: 'Synthetic boundary' });
  assert.deepEqual(result.errors, []); assert.equal(result.imported, 1);
  const item = (await service.handle('files', { mode: 'local' })).files.find(value => value.title === `Synthetic cache boundary ${id}`);
  assert.ok(item?.id);
  return { ...item, imageUrl };
}
async function load(item) {
  await service.handle('thread', { mode: 'local', id: item.id });
  const { contextToken } = await service.handle('resources.context', { mode: 'local', id: item.id });
  return service.handle('resources.load', { contextToken, url: item.imageUrl, requestId: `integration_${++requestNumber}` });
}
async function managerClear() {
  const status = await service.handle('manager.status');
  const args = { operation: 'clear', expectedRevision: status.revision };
  await service.handle('manager.preview', args); await service.handle('manager.mutate', args);
}
try {
  service = await new ApplicationService(serviceOptions).init();
  const first = await importConversation('first');
  const ref = { mode: 'local', id: first.id }, key = localReadingKey(first.id);
  await service.handle('reading.save', { key,
    position: { turnIndex: 1, role: 'assistant', offset: 0.375, title: first.title, ref },
    bookmark: { turnIndex: 0, role: 'user', title: first.title, ref },
  });
  const originalThread = await service.handle('thread', ref);
  const originalReading = (await service.handle('bootstrap')).reading;
  const archiveDirectory = path.join(dataDir, 'local-storage-v2');
  const archiveBefore = await treeHashes(archiveDirectory);
  const readingBefore = await fs.readFile(path.join(dataDir, 'reading-v2.json'));
  await service.handle('resources.settings', { enabled: true });
  assert.equal((await load(first)).stored, true);
  let cacheStatus = await service.handle('resources.list');
  assert.equal(cacheStatus.itemCount, 1); assert.equal(cacheStatus.byteSize, image.length);
  assert.deepEqual(await treeHashes(archiveDirectory), archiveBefore);
  assert.deepEqual(await fs.readFile(path.join(dataDir, 'reading-v2.json')), readingBefore);
  record('Enabling and filling real cache preserves every existing archive and reading-state byte');

  await service.handle('resources.settings', { enabled: false });
  await service.handle('resources.clear', { conversationKey: cacheStatus.conversations[0].key });
  assert.equal((await service.handle('resources.status')).itemCount, 0);
  assert.deepEqual(await treeHashes(archiveDirectory), archiveBefore);
  assert.deepEqual(await fs.readFile(path.join(dataDir, 'reading-v2.json')), readingBefore);
  assert.deepEqual(await service.handle('thread', ref), originalThread);
  assert.deepEqual((await service.handle('bootstrap')).reading, originalReading);
  record('Cache preference changes and conversation-cache clearing preserve archive, saved reading and returned content');

  await service.handle('resources.settings', { enabled: true });
  assert.equal((await load(first)).stored, true);
  const cacheDirectory = path.join(dataDir, 'resource-cache-v1');
  const cacheBeforeBackup = await treeHashes(cacheDirectory);
  const cachePreferenceFile = path.join(dataDir, 'resource-cache-v1.json');
  const preferenceBeforeBackup = await fs.readFile(cachePreferenceFile);
  const backup = path.join(root, 'synthetic-archive-backup.zip');
  await service.handle('manager.backup', { path: backup });
  assert.deepEqual(await treeHashes(cacheDirectory), cacheBeforeBackup);
  assert.deepEqual(await fs.readFile(cachePreferenceFile), preferenceBeforeBackup);
  record('Real manager backup leaves nonempty cache and its preference byte-for-byte unchanged');

  const reader = new ZipReader(new Uint8ArrayReader(await fs.readFile(backup)), { useWebWorkers: false });
  const members = await reader.getEntries();
  assert.ok(members.length > 2);
  assert.ok(members.every(entry => !/resource-cache|remote-images|settings\.json|appearance\.json|\.bin$/i.test(entry.filename)));
  const manifestEntry = members.find(entry => entry.filename === 'manifest.json');
  assert.ok(manifestEntry);
  const manifestBytes = await manifestEntry.getData(new Uint8ArrayWriter());
  const manifest = JSON.parse(Buffer.from(manifestBytes).toString('utf8'));
  assert.equal(JSON.stringify(manifest).includes('resource-cache'), false);
  await reader.close();
  record('Backup ZIP members and manifest exclude cache bytes and cache preferences');

  const second = await importConversation('second');
  assert.equal((await load(second)).stored, true);
  await service.handle('resources.settings', { enabled: false });
  const cacheBeforeRestore = await treeHashes(cacheDirectory);
  const preferenceBeforeRestore = await fs.readFile(cachePreferenceFile);
  const statusBeforeRestore = await service.handle('resources.list');
  assert.equal(statusBeforeRestore.itemCount, 2); assert.equal(statusBeforeRestore.conversations.length, 2);
  assert.equal(statusBeforeRestore.byteSize, image.length);
  await service.handle('manager.restore.preview', { path: backup });
  await service.handle('manager.restore', { path: backup });
  assert.deepEqual(await treeHashes(cacheDirectory), cacheBeforeRestore);
  assert.deepEqual(await fs.readFile(cachePreferenceFile), preferenceBeforeRestore);
  assert.deepEqual(await service.handle('resources.list'), statusBeforeRestore);
  assert.deepEqual((await service.handle('files', { mode: 'local' })).files.map(item => item.id), [first.id]);
  assert.deepEqual((await service.handle('thread', ref)).turns, originalThread.turns);
  const restoredReading = (await service.handle('bootstrap')).reading;
  assert.equal(restoredReading.positions[key].offset, 0.375);
  assert.equal(restoredReading.bookmarks.find(bookmark => bookmark.key === key).turnIndex, 0);
  record('Real restore replaces Local contents and reading while preserving newer cache entries and current disabled preference');

  const fetchesBeforeRestart = fetches;
  await service.shutdown(); offline = true;
  service = await new ApplicationService(serviceOptions).init();
  assert.equal((await service.handle('resources.status')).enabled, false);
  const cached = await load(first);
  assert.equal(cached.cached, true); assert.equal(fetches, fetchesBeforeRestart);
  assert.deepEqual(Buffer.from(cached.dataUrl.split(',')[1], 'base64'), image);
  assert.deepEqual(await treeHashes(cacheDirectory), cacheBeforeRestore);
  record('Restored archive reopens offline and reads exact cached image bytes while caching stays disabled');

  const beforeManagerClear = await treeHashes(cacheDirectory);
  const backupHash = hash(await fs.readFile(backup));
  await managerClear();
  assert.equal((await service.handle('files', { mode: 'local' })).total, 0);
  assert.deepEqual(await treeHashes(cacheDirectory), beforeManagerClear);
  assert.deepEqual(await fs.readFile(cachePreferenceFile), preferenceBeforeRestore);
  assert.equal(hash(await fs.readFile(backup)), backupHash);
  assert.equal((await service.handle('resources.status')).itemCount, 2);
  record('Confirmed Database Manager clear removes Local conversations while preserving separately managed image cache, preference and external backup');

  await service.shutdown(); service = await new ApplicationService(serviceOptions).init();
  assert.equal((await service.handle('files', { mode: 'local' })).total, 0);
  assert.equal((await service.handle('resources.status')).itemCount, 2);
  assert.deepEqual(await treeHashes(cacheDirectory), beforeManagerClear);
  record('Separate cache retention after Local manager clear survives a real service restart');

  const emptyArchive = await treeHashes(archiveDirectory);
  const readingAfterManagerClear = await fs.readFile(path.join(dataDir, 'reading-v2.json'));
  await service.handle('resources.clear', { all: true });
  assert.equal((await service.handle('resources.status')).itemCount, 0);
  assert.deepEqual(await treeHashes(archiveDirectory), emptyArchive);
  assert.deepEqual(await fs.readFile(path.join(dataDir, 'reading-v2.json')), readingAfterManagerClear);
  assert.equal(hash(await fs.readFile(backup)), backupHash);
  record('Resources clear-all removes image cache without rewriting remaining archive, reading state or external backup');

  const report = { version: '1.1.0', suite: 'resource-cache-storage.integration', passed: true,
    checks, backupMemberCount: members.length, controlledFetchCount: fetches,
    actualServices: ['ApplicationService', 'ResourceCache', 'CompressedStorage', 'ArchiveStore'],
    network: 'Controlled synthetic transport with validated public DNS; no external network requests',
    content: 'Synthetic conversations and generated raster only', runtime: process.version };
  await fs.mkdir(path.dirname(evidenceFile), { recursive: true });
  await fs.writeFile(evidenceFile, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, checks: checks.length, backupMemberCount: members.length, controlledFetchCount: fetches }));
} finally {
  await service?.shutdown().catch(() => {});
  await fs.rm(root, { recursive: true, force: true });
}
