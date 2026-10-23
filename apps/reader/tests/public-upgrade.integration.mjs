// Usage: node tests/public-upgrade.integration.mjs /path/to/public-1.0.0/apps/reader
// Only synthetic data is created. The supplied baseline tree is read-only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ApplicationService } from '../src/core/service.mjs';
import { localReadingKey } from '../src/core/manager-reading.mjs';

const baseline = process.argv[2] && path.resolve(process.argv[2]);
if (!baseline) throw new Error('Pass the public 1.0.0 Reader source directory.');
assert.equal(JSON.parse(await fs.readFile(path.join(baseline, 'package.json'))).version, '1.0.0');
const project = fileURLToPath(new URL('..', import.meta.url));
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'reader-public-upgrade-'));
const legacy = path.join(temporary, 'baseline'), dataDir = path.join(temporary, 'synthetic-profile');
let service;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function treeHashes(directory) {
  const result = {};
  async function visit(folder, prefix = '') {
    for (const entry of (await fs.readdir(folder, { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name))) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(path.join(folder, entry.name), name);
      else result[name] = hash(await fs.readFile(path.join(folder, entry.name)));
    }
  }
  await visit(directory); return result;
}
try {
  // Isolate the old application code while sharing the unchanged installed
  // dependency graph and codec. No link or write is made inside the baseline.
  await fs.mkdir(path.join(legacy, 'src'), { recursive: true });
  await fs.cp(path.join(baseline, 'src/core'), path.join(legacy, 'src/core'), { recursive: true });
  await fs.copyFile(path.join(baseline, 'package.json'), path.join(legacy, 'package.json'));
  await fs.symlink(path.join(project, 'node_modules'), path.join(legacy, 'node_modules'), 'junction');
  await fs.symlink(path.join(baseline, 'vendor'), path.join(legacy, 'vendor'), 'junction');
  const { ApplicationService: BaselineService } = await import(pathToFileURL(path.join(legacy, 'src/core/service.mjs')));
  service = await new BaselineService({ dataDir }).init();
  assert.equal((await service.handle('bootstrap')).version, '1.0.0');
  const source = path.join(temporary, 'synthetic.json');
  await fs.writeFile(source, JSON.stringify({ id: 'upgrade-fixture', title: 'Synthetic public upgrade', messages: [
    { role: 'user', content: 'Preserve this question.' },
    { role: 'assistant', content: 'Preserve this answer and ![synthetic image](https://images.example.test/sample.png).' },
  ] }));
  const imported = await service.handle('import.paths', { paths: [source], collection: 'Synthetic upgrade' });
  assert.equal(imported.imported, 1); assert.deepEqual(imported.errors, []);
  await service.handle('settings.save', { values: { theme: 'dark', language: 'ja', uiPalette: 'platinum-plus', codeTheme: 'ayu', promptExpandStyle: 'outlined-right', pageSize: 25 } });
  const item = (await service.handle('files', { mode: 'local' })).files[0];
  const ref = { mode: 'local', id: item.id }, key = localReadingKey(item.id);
  await service.handle('reading.save', { key, position: { turnIndex: 1, role: 'assistant', offset: 0.375, title: item.title, ref }, bookmark: { turnIndex: 0, role: 'user', title: item.title, ref } });
  const original = await service.handle('thread', ref), before = await service.handle('bootstrap');
  await service.shutdown(); service = null;
  const profileBefore = await treeHashes(dataDir), archiveBefore = await treeHashes(path.join(dataDir, 'local-storage-v2'));

  service = await new ApplicationService({ dataDir }).init();
  let boot = await service.handle('bootstrap');
  assert.equal(boot.version, '1.1.0'); assert.equal(boot.settings.remoteImages, 'auto'); assert.equal(boot.resources.enabled, false);
  for (const [key,value] of Object.entries(before.settings)) assert.deepEqual(boot.settings[key], value, key);
  assert.deepEqual(boot.reading, before.reading); assert.deepEqual(await service.handle('thread', ref), original);
  await service.handle('settings.save', { values: { remoteImages: 'click' } });
  await service.handle('resources.settings', { enabled: true });
  await service.shutdown(); service = null;
  const profileAfter = await treeHashes(dataDir);
  for (const [name,digest] of Object.entries(profileBefore)) assert.equal(profileAfter[name], digest, `Original profile file changed: ${name}`);
  assert.deepEqual(await treeHashes(path.join(dataDir, 'local-storage-v2')), archiveBefore);
  const sidecarNames = ['remote-images-v1.json', 'resource-cache-v1.json'];
  const sidecars = await Promise.all(sidecarNames.map(name => fs.readFile(path.join(dataDir, name))));

  service = await new BaselineService({ dataDir }).init();
  boot = await service.handle('bootstrap'); assert.deepEqual(boot.settings, before.settings); assert.deepEqual(boot.reading, before.reading);
  assert.deepEqual(await service.handle('thread', ref), original);
  await service.shutdown(); service = null;
  for (let i=0;i<sidecarNames.length;i++) assert.deepEqual(await fs.readFile(path.join(dataDir, sidecarNames[i])), sidecars[i]);
  assert.deepEqual(await treeHashes(path.join(dataDir, 'local-storage-v2')), archiveBefore);

  service = await new ApplicationService({ dataDir }).init();
  boot = await service.handle('bootstrap'); assert.equal(boot.settings.remoteImages, 'click'); assert.equal(boot.resources.enabled, true);
  assert.deepEqual(await service.handle('thread', ref), original); assert.deepEqual(boot.reading, before.reading);
  await service.shutdown(); service = null;
  const report = { passed: true, baselineVersion: '1.0.0', candidateVersion: '1.1.0', checks: [
    'Actual public baseline imports synthetic source and saves preferences, bookmark and reading position',
    'Upgrade preserves every original profile file byte, archive byte, source identity, message and reading record',
    'New image settings use independent sidecars',
    'Public 1.0.0 reopens the profile and preserves new image sidecars',
    'Public 1.1.0 reopens again with both old data and new image preferences intact',
  ] };
  if (process.env.READER_PUBLIC_UPGRADE_REPORT) await fs.writeFile(process.env.READER_PUBLIC_UPGRADE_REPORT, JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
} finally { await service?.shutdown(); await fs.rm(temporary, { recursive: true, force: true }); }
