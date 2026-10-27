#!/usr/bin/env node
// Supplemental browser compatibility check. Production Reader inference uses
// Node worker_threads, so this fixture never relaxes the desktop renderer CSP.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createSyntheticModelBytes, expectedSyntheticHiddenState } from './fixtures/synthetic-embedding-model.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const ortRoot = process.env.THREADSHELF_ORT_WEB_ROOT || path.join(root, 'node_modules/onnxruntime-web');
const version = JSON.parse(await fs.readFile(path.join(ortRoot, 'package.json'), 'utf8')).version;
const model = createSyntheticModelBytes();
const ids = [2, 5, 6, 3, 2, 7, 3, 0], attention = [1, 1, 1, 1, 1, 1, 1, 0];
const expected = expectedSyntheticHiddenState(ids, attention);
const csp = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'";
const moduleSource = `import * as ort from '/ort/ort.wasm.min.mjs';
ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths=new URL('/ort/',self.location.href).href;
export async function run(){
 const bytes=new Uint8Array(await (await fetch('/model.onnx')).arrayBuffer());
 const session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
 const feeds={input_ids:new ort.Tensor('int64',BigInt64Array.from(${JSON.stringify(ids)},BigInt),[2,4]),attention_mask:new ort.Tensor('int64',BigInt64Array.from(${JSON.stringify(attention)},BigInt),[2,4]),token_type_ids:new ort.Tensor('int64',new BigInt64Array(8),[2,4])};
 try{
  const outputs=[];for(let i=0;i<2;i++){const result=await session.run(feeds);outputs.push({dims:result.last_hidden_state.dims,data:Array.from(result.last_hidden_state.data)});for(const value of Object.values(result))value.dispose();}
  return {webVersion:ort.env.versions.web,inputs:session.inputNames,outputs,worker:typeof document==='undefined'};
 }finally{for(const value of Object.values(feeds))value.dispose();await session.release();}
}`;
const assets = new Map([
  ['/', ['text/html', '<!doctype html><title>Offline ONNX fixture</title><script type="module" src="/page.mjs"></script>']],
  ['/model.onnx', ['application/octet-stream', model]],
  ['/fixture.mjs', ['application/javascript', moduleSource]],
  ['/page.mjs', ['application/javascript', "import {run} from '/fixture.mjs';window.runFixture=run;"]],
  ['/worker.mjs', ['application/javascript', "import {run} from '/fixture.mjs';self.onmessage=async()=>{try{postMessage({result:await run()});}catch(error){postMessage({error:error.message});}};"]],
]);
const server = http.createServer(async (request, response) => {
  try {
    const name = new URL(request.url, 'http://localhost').pathname;
    response.setHeader('Content-Security-Policy', csp);
    if (assets.has(name)) { const [type, content] = assets.get(name);response.setHeader('Content-Type', type);response.end(content);return; }
    if (!/^\/ort\/ort[\w.-]+\.(?:mjs|wasm)$/.test(name)) { response.writeHead(404);response.end();return; }
    response.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'application/javascript');
    response.end(await fs.readFile(path.join(ortRoot, 'dist', path.basename(name))));
  } catch { response.writeHead(404);response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.READER_CHROMIUM, args: ['--no-sandbox'] });
const checks = [], externalRequests = [], errors = [], consoleErrors = [], requests = [];
try {
  for (const mode of ['main', 'module-worker']) {
    const context = await browser.newContext();
    await context.route(/^https?:/, route => {
      const url = new URL(route.request().url());requests.push(url.pathname);
      if (url.origin !== origin) { externalRequests.push(url.origin);return route.abort(); }return route.continue();
    });
    const page = await context.newPage();page.on('pageerror', error => errors.push(error.message));page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.goto(origin);await page.waitForFunction(() => typeof window.runFixture === 'function');
    const result = mode === 'main' ? await page.evaluate(() => window.runFixture()) : await page.evaluate(() => new Promise((resolve, reject) => {
      const worker = new Worker('/worker.mjs', { type: 'module' });
      worker.onmessage = ({ data }) => { worker.terminate();data.error ? reject(Error(data.error)) : resolve(data.result); };
      worker.onerror = error => { worker.terminate();reject(Error(error.message)); };worker.postMessage('run');
    }));
    assert.equal(result.webVersion, version);assert.equal(result.worker, mode === 'module-worker');
    assert.deepEqual(result.inputs, ['input_ids', 'attention_mask', 'token_type_ids']);
    for (const output of result.outputs) { assert.deepEqual(output.dims, [2, 4, 4]);assert.deepEqual(output.data, expected); }
    checks.push({ mode, passed: true, runs: result.outputs.length, shape: result.outputs[0].dims, expectedQuantizedOutputExact: true });
    await context.close();
  }
  assert.deepEqual(externalRequests, []);assert.deepEqual(errors, []);assert.deepEqual(consoleErrors, []);
  assert.ok(requests.some(name => name.endsWith('.wasm')), 'The local WASM binary was actually loaded');
  const report = { passed: true, version, browser: browser.version(), model: 'Authored 977-byte quantized encoder; no trained model or private data', checks, externalRequests, pageErrors: errors, consoleErrors, localAssets: [...new Set(requests)].sort(), csp, scope: 'Supplemental browser/module-worker WASM compatibility. Production Node worker paths are covered by semantic-runtime and semantic-offline tests; desktop renderer CSP is unchanged.' };
  if (process.env.THREADSHELF_ORT_BROWSER_REPORT) { await fs.mkdir(path.dirname(process.env.THREADSHELF_ORT_BROWSER_REPORT), { recursive: true });await fs.writeFile(process.env.THREADSHELF_ORT_BROWSER_REPORT, JSON.stringify(report, null, 2) + '\n'); }
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close();await new Promise(resolve => server.close(resolve)); }
