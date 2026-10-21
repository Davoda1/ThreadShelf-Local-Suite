import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { SEMANTIC_MODEL } from '../src/core/search.mjs';

// Opt-in because normal tests must never initiate a model download.
// Set this to <application userData>/search/models AFTER explicit model setup.
const cacheDir = process.env.THREADSHELF_MODEL_CACHE;
async function embeddingsFromWorker(t, forceNativeFailure = false) {
  const moduleUrl = new URL('../src/core/search-worker.mjs', import.meta.url).href;
  const failure = forceNativeFailure ? `const Module = require('node:module'); const original = Module._load; Module._load = function(id, ...args) { if (id === 'onnxruntime-node') throw Object.assign(new Error('Native VC++ binding deliberately unavailable'), {code:'ERR_DLOPEN_FAILED'}); return original.call(this, id, ...args); };` : '';
  const worker = new Worker(`${failure} globalThis.fetch = () => { throw new Error('Network access forbidden in offline test'); }; import(${JSON.stringify(moduleUrl)});`, {
    eval: true, workerData: { cacheDir, model: SEMANTIC_MODEL },
  });
  t.after(() => worker.terminate());
  const texts = ['What can I eat for dinner tonight?', 'Fresh bread and roasted vegetables make a delicious meal.',
    'A USB keyboard sends input reports to the computer.', 'The spacecraft will orbit the planet next month.', 'Mit ehetek ma vacsorára?'];
  const vectors = [];
  // The archive indexes one passage per call. Preserve that production batch
  // shape because dynamic q8 activation quantization can vary with batch padding.
  for (const [index, text] of texts.entries()) {
    const output = await new Promise((resolve, reject) => {
      const listener = message => {
        if (message.id !== index + 1) return;
        worker.off('message', listener); worker.off('error', reject);
        if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
      };
      worker.once('error', reject); worker.on('message', listener);
      worker.postMessage({ id: index + 1, operation: 'embed', texts: [text] });
    });
    vectors.push(output[0]);
  }
  return vectors;
}
test('real multilingual model and automatic portable fallback retrieve meaning with all network requests blocked', {
  skip: !cacheDir, timeout: 120000,
}, async t => {
  const embeddings = await embeddingsFromWorker(t);
  const portable = await embeddingsFromWorker(t, true);
  assert.equal(embeddings.length, 5);
  assert.ok(embeddings.every(row => row.length === 384));
  const similarity = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  for (const output of [embeddings, portable]) {
    for (const query of [output[0], output[4]]) {
      assert.ok(similarity(query, output[1]) > similarity(query, output[2]), 'food must outrank keyboard in English and Hungarian');
      assert.ok(similarity(query, output[1]) > similarity(query, output[3]), 'food must outrank astronomy');
    }
  }
  embeddings.forEach((row, i) => assert.ok(similarity(row, portable[i]) > 0.995, 'native and portable embeddings must be numerically compatible'));
});
