import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const policy = new URL('../src/core/search-privacy.mjs', import.meta.url).href;

test('search privacy overrides inherited opt-in before native model loading and worker startup', () => {
  const source = `
    import { Worker } from 'node:worker_threads';
    const keys = ['ORT_DISABLE_TELEMETRY', 'ORT_RUNNING_UNIT_TESTS', 'HF_HUB_DISABLE_TELEMETRY', 'DO_NOT_TRACK'];
    const { enforceSearchPrivacy } = await import(${JSON.stringify(policy)});
    for (const key of keys) process.env[key] = '0';
    enforceSearchPrivacy();
    const worker = new Worker(\`const {parentPort,workerData}=require('node:worker_threads');parentPort.postMessage(workerData.map(key=>process.env[key]));\`, {eval:true,workerData:keys,execArgv:[]});
    const values = await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});
    await worker.terminate();
    console.log(JSON.stringify({main:keys.map(key=>process.env[key]),worker:values}));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    encoding:'utf8', env:{...process.env, ORT_DISABLE_TELEMETRY:'0', ORT_RUNNING_UNIT_TESTS:'0', HF_HUB_DISABLE_TELEMETRY:'0', DO_NOT_TRACK:'0'},
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {main:['1','1','1','1'],worker:['1','1','1','1']});
});
