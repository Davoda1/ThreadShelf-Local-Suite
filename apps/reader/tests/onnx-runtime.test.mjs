import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import '../src/core/onnx-privacy.cjs';
import { resolveTransformersSource } from '../src/core/transformers-runtime.mjs';
import { wasmDirectoryUrl } from '../src/core/search-wasm.mjs';
import { createSyntheticModelBytes, expectedSyntheticHiddenState, SYNTHETIC_DIMENSION } from './fixtures/synthetic-embedding-model.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const run = (source, env = {}) => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, env: { ...process.env, ...env },
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};

async function installedPackage(entry, name) {
  for (let directory = path.dirname(entry); directory !== path.dirname(directory); directory = path.dirname(directory)) {
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
      if (manifest.name === name) return { root: directory, manifest };
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  throw new Error(`Could not locate installed package ${name}`);
}

test('ONNX local asset URLs preserve Windows drive/UNC and POSIX path identities', () => {
  for (const { entry, windows, expected } of [
    { entry: String.raw`D:\Thread Shelf # 50% árvíz\node_modules\onnxruntime-web\dist\ort.node.min.js`, windows: true,
      expected: 'file:///D:/Thread%20Shelf%20%23%2050%25%20%C3%A1rv%C3%ADz/node_modules/onnxruntime-web/dist/' },
    { entry: String.raw`\\server\share\Thread Shelf # 50% árvíz\dist\ort.node.min.js`, windows: true,
      expected: 'file://server/share/Thread%20Shelf%20%23%2050%25%20%C3%A1rv%C3%ADz/dist/' },
    { entry: '/opt/Thread Shelf # 50% árvíz/dist/ort.node.min.js', windows: false,
      expected: 'file:///opt/Thread%20Shelf%20%23%2050%25%20%C3%A1rv%C3%ADz/dist/' },
    { entry: String.raw`/opt/literal\backslash # 50%/dist/ort.node.min.js`, windows: false,
      expected: 'file:///opt/literal%5Cbackslash%20%23%2050%25/dist/' },
  ]) {
    const prefix = wasmDirectoryUrl(entry, { windows });
    assert.equal(prefix, expected);
    const platformPath = windows ? path.win32 : path.posix;
    for (const file of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
      const asset = new URL(file, prefix);
      assert.equal(asset.protocol, 'file:'); assert.equal(asset.search, ''); assert.equal(asset.hash, '');
      assert.equal(fileURLToPath(asset, { windows }), platformPath.join(platformPath.dirname(entry), file));
    }
  }
});

test('Reader and Transformers resolve one exact stable ONNX family with no nested lock copies', async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'));
  const version = manifest.dependencies['onnxruntime-web'];
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.overrides['onnxruntime-web'], '$onnxruntime-web');
  assert.equal(manifest.overrides['onnxruntime-node'], version);
  assert.equal(manifest.overrides['onnxruntime-common'], version);
  const transformerSource = await resolveTransformersSource();
  const consumer = createRequire(transformerSource);
  const installed = {};
  for (const name of ['onnxruntime-node', 'onnxruntime-web', 'onnxruntime-common']) {
    installed[name] = await installedPackage(consumer.resolve(name), name);
    assert.equal(installed[name].manifest.version, version, name);
    assert.equal(installed[name].root, path.join(root, 'node_modules', name));
    assert.equal(require.resolve(name), consumer.resolve(name));
    const locked = Object.entries(lock.packages).filter(([key]) => key.endsWith('/' + name));
    assert.deepEqual(locked.map(([key, value]) => [key, value.version]), [['node_modules/' + name, version]]);
  }
  for (const name of ['onnxruntime-node', 'onnxruntime-web']) {
    const fromRuntime = createRequire(path.join(installed[name].root, 'package.json'));
    assert.equal(fromRuntime.resolve('onnxruntime-common'), consumer.resolve('onnxruntime-common'));
  }
});

test('stable native CPU runtime executes quantized dynamic-batch model using external common Tensors', async () => {
  const ort = await import('onnxruntime-node');
  const common = await import('onnxruntime-common');
  const session = await ort.InferenceSession.create(createSyntheticModelBytes(), {
    executionProviders: ['cpu'], intraOpNumThreads: 1, interOpNumThreads: 1,
  });
  try {
    assert.deepEqual(session.inputNames, ['input_ids', 'attention_mask', 'token_type_ids']);
    assert.deepEqual(session.outputNames, ['last_hidden_state']);
    for (const shape of [[1, 3], [2, 4]]) {
      const count = shape[0] * shape[1];
      const ids = Array.from({ length: count }, (_, i) => 2 + i % 9);
      const attention = ids.map((_, i) => i % 4 === 3 ? 0 : 1);
      const feeds = {
        input_ids: new common.Tensor('int64', BigInt64Array.from(ids, BigInt), shape),
        attention_mask: new common.Tensor('int64', BigInt64Array.from(attention, BigInt), shape),
        token_type_ids: new common.Tensor('int64', new BigInt64Array(count), shape),
      };
      const output = (await session.run(feeds)).last_hidden_state;
      assert.deepEqual(output.dims, [...shape, SYNTHETIC_DIMENSION]);
      assert.deepEqual(Array.from(output.data), expectedSyntheticHiddenState(ids, attention));
    }
  } finally { await session.release(); }
});

test('source adapter works without prebuilt dist and rejects unreviewed or missing versions', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-transformers-source-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const adapter = await fs.readFile(path.join(root, 'src/core/transformers-runtime.mjs'));
  for (const [index, version] of ['4.3.2', '4.3.1', '5.0.0', undefined].entries()) {
    const fixture = path.join(temporary, String(index));
    const upstream = path.join(fixture, 'node_modules/@huggingface/transformers');
    await fs.mkdir(path.join(upstream, 'src'), { recursive: true });
    await fs.writeFile(path.join(fixture, 'adapter.mjs'), adapter);
    await fs.writeFile(path.join(upstream, 'package.json'), JSON.stringify({ name: '@huggingface/transformers', version,
      type: 'module', exports: './dist/transformers.node.mjs' }));
    await fs.writeFile(path.join(upstream, 'src/transformers.js'), 'export const fixtureSourceLoaded = true;');
    const { loadTransformers } = await import(pathToFileURL(path.join(fixture, 'adapter.mjs')));
    if (version === '4.3.2') assert.equal((await loadTransformers()).fixtureSourceLoaded, true);
    else await assert.rejects(loadTransformers(), /Unsupported Transformers source package: expected.*4\.3\.2/);
  }
});

test('desktop entry disables native telemetry before loading Electron or starting workers', () => {
  const main = path.join(root, 'src/desktop/main.cjs');
  const output = run(`
    import { createRequire } from 'node:module';
    const require=createRequire(import.meta.url),Module=require('node:module'),original=Module._load;
    const stopped=new Error('test stops before desktop startup');
    Module._load=function(name,...args){if(name==='electron'){
      const native=process.report.getReport().environmentVariables;
      console.log(JSON.stringify({disable:native.ORT_DISABLE_TELEMETRY,suppress:native.ORT_RUNNING_UNIT_TESTS}));
      throw stopped;
    }return original.call(this,name,...args);};
    try{require(${JSON.stringify(main)});throw new Error('Electron entry was not reached');}catch(error){if(error!==stopped)throw error;}
  `, { ORT_DISABLE_TELEMETRY: '0', ORT_RUNNING_UNIT_TESTS: '0' });
  assert.deepEqual(JSON.parse(output), { disable: '1', suppress: '1' });
});

test('main-thread service initialization disables telemetry in the native environment of nested workers', () => {
  const search = new URL('../src/core/search.mjs', import.meta.url).href;
  const output = run(`
    import { Worker } from 'node:worker_threads';
    await import(${JSON.stringify(search)});
    const nested=${JSON.stringify(`const {parentPort}=require('node:worker_threads');const native=process.report.getReport().environmentVariables;parentPort.postMessage({jsDisable:process.env.ORT_DISABLE_TELEMETRY,jsSuppress:process.env.ORT_RUNNING_UNIT_TESTS,nativeDisable:native.ORT_DISABLE_TELEMETRY,nativeSuppress:native.ORT_RUNNING_UNIT_TESTS});`)};
    const outer=new Worker('const {Worker,parentPort}=require("node:worker_threads");const inner=new Worker('+JSON.stringify(nested)+',{eval:true,execArgv:[]});inner.on("message",value=>parentPort.postMessage(value));inner.on("error",error=>{throw error});',{eval:true,execArgv:[]});
    console.log(JSON.stringify(await new Promise((resolve,reject)=>{outer.once('message',resolve);outer.once('error',reject);})));await outer.terminate();
  `, { ORT_DISABLE_TELEMETRY: '0', ORT_RUNNING_UNIT_TESTS: '0' });
  assert.deepEqual(JSON.parse(output), { jsDisable: '1', jsSuppress: '1', nativeDisable: '1', nativeSuppress: '1' });
});

test('worker-only environment assignment does not substitute for native process initialization', () => {
  const output = run(`
    import { Worker } from 'node:worker_threads';
    const worker=new Worker('const {parentPort}=require("node:worker_threads");process.env.ORT_DISABLE_TELEMETRY="1";process.env.ORT_RUNNING_UNIT_TESTS="1";const native=process.report.getReport().environmentVariables;parentPort.postMessage({jsDisable:process.env.ORT_DISABLE_TELEMETRY,jsSuppress:process.env.ORT_RUNNING_UNIT_TESTS,nativeDisable:native.ORT_DISABLE_TELEMETRY,nativeSuppress:native.ORT_RUNNING_UNIT_TESTS});',{eval:true,execArgv:[]});
    console.log(JSON.stringify(await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);})));await worker.terminate();
  `, { ORT_DISABLE_TELEMETRY: '0', ORT_RUNNING_UNIT_TESTS: '0' });
  assert.deepEqual(JSON.parse(output), { jsDisable: '1', jsSuppress: '1', nativeDisable: '0', nativeSuppress: '0' });
});
