import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SEMANTIC_MODEL } from '../src/core/search.mjs';

// Opt-in because normal tests must never initiate a model download.
// Set this to <application userData>/search/models AFTER explicit model setup.
const cacheDir = process.env.THREADSHELF_MODEL_CACHE;
const appRoot = process.env.THREADSHELF_SEMANTIC_APP_ROOT || fileURLToPath(new URL('..', import.meta.url));
async function embeddingsFromWorker(t, forceNativeFailure = false) {
  const moduleUrl = pathToFileURL(path.join(appRoot, 'src/core/search-worker.mjs')).href;
  const failure = forceNativeFailure ? `const Module = require('node:module'); const original = Module._load; Module._load = function(id, ...args) { if (id === 'onnxruntime-node') throw Object.assign(new Error('Native VC++ binding deliberately unavailable'), {code:'ERR_DLOPEN_FAILED'}); return original.call(this, id, ...args); };` : '';
  const worker = new Worker(`${failure} globalThis.fetch = () => { require('node:worker_threads').parentPort.postMessage({event:'forbidden-network'}); throw new Error('Network access forbidden in offline test'); }; import(${JSON.stringify(moduleUrl)});`, {
    eval: true, workerData: { cacheDir, model: SEMANTIC_MODEL },
  });
  t.after(() => worker.terminate());
  const progress = [];let networkAttempts = 0;
  worker.on('message', message => { if (message.event === 'progress') progress.push(message.progress); if (message.event === 'forbidden-network') networkAttempts++; });
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
  assert.equal(networkAttempts, 0, 'Cached inference does not attempt a model or tokenizer download');
  if (forceNativeFailure) assert.ok(progress.some(event => /portable CPU search engine/.test(event.message)), 'Native-load failure actually selects the production WASM fallback');
  await worker.terminate();
  return vectors;
}
test('real multilingual model and automatic portable fallback retrieve meaning with JavaScript model fetch blocked', {
  skip: !cacheDir, timeout: 240000,
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
  const cosines = embeddings.map((row, i) => similarity(row, portable[i]));
  cosines.forEach(value => assert.ok(value > 0.995, 'native and portable embeddings must be numerically compatible'));
  if (process.env.THREADSHELF_SEMANTIC_VECTORS) await fs.writeFile(process.env.THREADSHELF_SEMANTIC_VECTORS, JSON.stringify({ native: embeddings, portable }) + '\n');
  if (process.env.THREADSHELF_SEMANTIC_REPORT) {
    const versions = Object.fromEntries(await Promise.all(['@huggingface/transformers', 'onnxruntime-node', 'onnxruntime-web', 'onnxruntime-common'].map(async name => [name, JSON.parse(await fs.readFile(path.join(appRoot, 'node_modules', name, 'package.json'), 'utf8')).version])));
    const report = { passed: true, model: SEMANTIC_MODEL, runtime: { node: process.versions.node, electron: process.versions.electron || null, platform: process.platform }, versions, vectors: embeddings.length, dimension: embeddings[0].length, nativeVsPortableCosines: cosines, minimumCosine: Math.min(...cosines), englishAndHungarianFoodRanking: true, automaticWasmFallbackConfirmed: true, javascriptFetchAttempts: 0, nativeNetworkInstrumented: false, scope: 'Actual configured multilingual q8 model through production search workers; synthetic English/Hungarian texts, cached offline inference, no native GUI.' };
    await fs.mkdir(path.dirname(process.env.THREADSHELF_SEMANTIC_REPORT), { recursive: true });
    await fs.writeFile(process.env.THREADSHELF_SEMANTIC_REPORT, JSON.stringify(report, null, 2) + '\n');
  }
});
