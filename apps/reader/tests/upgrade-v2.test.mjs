import manifest from '../package.json' with {type:'json'};
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ApplicationService } from '../src/core/service.mjs';

test('3.0 opens an actual released-2.0 synthetic profile without reimport or changes to reader data', async t => {
  const fixture = new URL('./fixtures/upgrade-v2.0.0/', import.meta.url);
  const expected = JSON.parse(await fs.readFile(new URL('expected.json', fixture), 'utf8'));
  assert.equal(expected.version, '2.0.0');
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-upgrade-v2-'));
  await fs.cp(new URL('profile/', fixture), dataDir, { recursive: true });
  let service = await new ApplicationService({ dataDir }).init();
  t.after(async () => { await service.shutdown().catch(() => {}); await fs.rm(dataDir, { recursive: true, force: true }); });
  const checkReader = async () => {
    const boot = await service.handle('bootstrap');
    assert.equal(boot.version, manifest.version);
    assert.equal(boot.settings.language, 'hu');
    assert.equal(boot.settings.theme, 'dark');
    assert.equal(boot.settings.fontSize, 'large');
    assert.deepEqual(boot.reading, expected.reading);
    assert.deepEqual(await service.handle('thread', { id: expected.id }), expected.thread);
  };
  await checkReader();
  const options = { year: 'all', zone: 'utc', branch: 'all' };
  const report = await service.handle('activity.query', options);
  assert.equal(report.summary.conversations, 1);
  assert.equal(report.summary.messages, 3);
  assert.equal(report.coverage.original, 1);
  assert.equal((await service.handle('activity.query', { ...options, branch: 'active' })).summary.messages, 2);
  await checkReader();
  await service.shutdown();
  service = await new ApplicationService({ dataDir }).init();
  await checkReader();
  assert.equal((await service.handle('activity.query', options)).storage.decodedConversations, 0);
});
