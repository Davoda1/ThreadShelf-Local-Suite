import test from 'node:test';
import assert from 'node:assert/strict';
import {orderedPrefetch} from '../src/core/import-pipeline.mjs';

test('server reads overlap within a bound and commits observe original order',async()=>{
 let active=0,peak=0;const seen=[];
 for await(const result of orderedPrefetch([0,1,2,3,4,5],async value=>{
   active++;peak=Math.max(peak,active);
   await new Promise(resolve=>setTimeout(resolve,(6-value)*2));active--;return value;
 },{concurrency:3}))seen.push(result.value);
 assert.deepEqual(seen,[0,1,2,3,4,5]);assert.equal(peak,3);assert.equal(active,0);
});
test('one failed server read remains an explicit result and later records continue',async()=>{
 const seen=[];
 for await(const result of orderedPrefetch([0,1,2],async value=>{if(value===1)throw new Error('unavailable');return value;}))seen.push(result);
 assert.equal(seen[0].value,0);assert.match(seen[1].error.message,/unavailable/);assert.equal(seen[2].value,2);
});
test('cancellation starts no further reads and observes outstanding failures',async()=>{
 const controller=new AbortController();let started=0;
 const operation=(async()=>{
  for await(const result of orderedPrefetch([0,1,2,3,4],async value=>{
   started++;await new Promise(resolve=>setTimeout(resolve,5));
   if(value===1)throw new Error('pending read');return value;
  },{concurrency:2,signal:controller.signal})){controller.abort();}
 })();
 await assert.rejects(operation,{name:'AbortError'});assert.ok(started<=3);
});
