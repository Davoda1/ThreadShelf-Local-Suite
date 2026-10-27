// A tiny authored q8 encoder exercises the real worker/runtime contract offline.
// This complements semantic-offline.test.mjs; it does not measure model quality.
import '../src/core/onnx-privacy.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { writeSyntheticEmbeddingModel, SYNTHETIC_TEXTS, expectedSyntheticEmbedding } from './fixtures/synthetic-embedding-model.mjs';

function createWorker(cacheDir, model, { backend, forceNativeFailure = false } = {}) {
  const failure = forceNativeFailure ? `const Module=require('node:module'),load=Module._load;Module._load=function(id,...args){if(id==='onnxruntime-node')throw Object.assign(Error('Synthetic unavailable native binding'),{code:'ERR_DLOPEN_FAILED'});return load.call(this,id,...args);};` : '';
  const moduleUrl = new URL('../src/core/search-worker.mjs', import.meta.url).href;
  const worker = new Worker(`${failure}globalThis.fetch=()=>{require('node:worker_threads').parentPort.postMessage({event:'forbidden-fetch'});throw Error('Synthetic offline test forbids model fetch');};import(${JSON.stringify(moduleUrl)});`, { eval: true, workerData: { cacheDir, model, backend } });
  const progress = [], pending = new Map();let sequence = 0, fetchAttempts = 0;
  worker.on('message', message => {
    if (message.event === 'progress') progress.push(message.progress);
    if (message.event === 'forbidden-fetch') fetchAttempts++;
    const waiting = pending.get(message.id);
    if (waiting) { pending.delete(message.id);message.error ? waiting.reject(Error(message.error.message)) : waiting.resolve(message.result); }
  });
  worker.on('error', error => { for (const waiting of pending.values()) waiting.reject(error);pending.clear(); });
  return { worker, progress, get fetchAttempts() { return fetchAttempts; }, call(operation, texts) { return new Promise((resolve, reject) => { const id = ++sequence;pending.set(id, { resolve, reject });worker.postMessage({ id, operation, texts }); }); } };
}
function closeVector(actual, expected) {
  assert.equal(actual.length, expected.length);
  assert.ok(actual.every(Number.isFinite), 'Embeddings contain only finite numbers');
  for (const [index, value] of actual.entries()) assert.ok(Math.abs(value - expected[index]) < 1e-6, `Embedding ${index}: ${value} versus expected ${expected[index]}`);
  assert.ok(Math.abs(Math.hypot(...actual) - 1) < 1e-6, 'Embeddings remain unit normalized');
}

test('production semantic worker preserves q8 inference, tokenization, masked pooling and fallback contracts', { timeout: 90000 }, async t => {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-q8-fixture-'));
  t.after(() => fs.rm(cacheDir, { recursive: true, force: true }));
  const fixture = await writeSyntheticEmbeddingModel(cacheDir);
  for (const mode of [{ name: 'native Transformers' }, { name: 'automatic WASM fallback', forceNativeFailure: true }, { name: 'explicit WASM', backend: 'wasm' }]) {
    await t.test(mode.name, async () => {
      const runtime = createWorker(cacheDir, fixture.model, mode);
      try {
        assert.deepEqual(await runtime.call('setup'), { dimension: fixture.dimension });
        const expected = SYNTHETIC_TEXTS.map(text => expectedSyntheticEmbedding(text, { preserveFinalSeparator: !!(mode.backend || mode.forceNativeFailure) }));
        for (const [index, text] of SYNTHETIC_TEXTS.entries()) {
          const vectors = await runtime.call('embed', [text]);assert.equal(vectors.length, 1);closeVector(vectors[0], expected[index]);
        }
        const batch = await runtime.call('embed', [...SYNTHETIC_TEXTS]);assert.equal(batch.length, expected.length);
        batch.forEach((vector, index) => closeVector(vector, expected[index]));
        assert.equal(runtime.fetchAttempts, 0, 'Cached setup and inference do not attempt JavaScript model downloads');
        if (mode.forceNativeFailure) assert.ok(runtime.progress.some(item => /Using the portable CPU search engine/.test(item.message)), 'Native-load failure selects the production fallback');
        await assert.rejects(runtime.call('unknown'), /Unknown model worker operation/);
      } finally { await runtime.worker.terminate(); }
    });
  }
  await t.test('missing WASM cache fails locally without a download attempt', async () => {
    const runtime = createWorker(cacheDir, 'synthetic/not-present', { backend: 'wasm' });
    try {
      await assert.rejects(runtime.call('embed', ['hello']), /Cached semantic model file is missing/);
      assert.equal(runtime.fetchAttempts, 0);
    } finally { await runtime.worker.terminate(); }
  });
});
