import manifest from '../package.json' with {type:'json'};
import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('real archive worker drains IPC work and returns a closing error after shutdown', { timeout: 15000 }, async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tslr-worker-'));
  const worker = new Worker(new URL('../src/desktop/worker.mjs', import.meta.url), { workerData: { dataDir } });
  const pending = new Map();
  let sequence = 0;
  worker.on('message', message => {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error));
    else request.resolve(message.value);
  });
  worker.on('error', error => { for (const request of pending.values()) request.reject(error); pending.clear(); });
  const request = (action, args = {}) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); worker.postMessage({ id, action, args });
  });
  t.after(async () => { await worker.terminate(); await fs.rm(dataDir, { recursive: true, force: true }); });
  // These are deliberately queued before async initialization finishes.
  const bootstrap = request('bootstrap');
  const settings = request('settings.save', { values: { language: 'de' } });
  assert.equal((await bootstrap).version, manifest.version);
  const writing = request('reading.save', { key: 'local:worker-test', position: { turnIndex: 0, role: 'user', offset: 0 } });
  assert.deepEqual(await request('shutdown'), { ok: true });
  await Promise.all([settings, writing]);
  assert.equal(JSON.parse(await fs.readFile(path.join(dataDir, 'settings.json'), 'utf8')).data.language, 'de');
  assert.ok(JSON.parse(await fs.readFile(path.join(dataDir, 'reading-v2.json'), 'utf8')).data.positions['local:worker-test']);
  await assert.rejects(request('files', { mode: 'local' }), /closing/);
});
