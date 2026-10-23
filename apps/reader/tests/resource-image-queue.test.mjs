import test from 'node:test';
import assert from 'node:assert/strict';
import { createResourceImageQueue } from '../src/ui/resource-image-queue.mjs';

test('more than the bridge request cap completes with only four active loads', async () => {
  const enqueue = createResourceImageQueue();
  let active = 0, maximum = 0;
  const results = await Promise.all(Array.from({ length: 160 }, (_, index) => enqueue(async () => {
    active++; maximum = Math.max(maximum, active);
    assert.ok(active <= 4);
    await new Promise(resolve => setImmediate(resolve));
    active--; return index;
  })));
  assert.equal(maximum, 4); assert.equal(active, 0);
  assert.deepEqual(results, Array.from({ length: 160 }, (_, index) => index));
});

test('cancelled waiting images never dispatch and do not block a later conversation', async () => {
  const enqueue = createResourceImageQueue(1), controller = new AbortController();
  let release, dispatched = 0;
  const first = enqueue(() => new Promise(resolve => { release = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  const waiting = Array.from({ length: 100 }, () => enqueue(() => { dispatched++; }, { signal: controller.signal }));
  const settled = Promise.allSettled(waiting);
  controller.abort();
  const next = enqueue(() => 'next conversation');
  release('first');
  assert.equal(await first, 'first'); assert.equal(await next, 'next conversation');
  assert.equal(dispatched, 0);
  for (const result of await settled) { assert.equal(result.status, 'rejected'); assert.equal(result.reason.name, 'AbortError'); }
});

test('task failures and pre-aborted requests release queue capacity without dispatching stale work', async () => {
  const enqueue = createResourceImageQueue(1), controller = new AbortController();
  controller.abort();
  await assert.rejects(enqueue(() => assert.fail('Stale image dispatched'), { signal: controller.signal }), { name: 'AbortError' });
  await assert.rejects(enqueue(() => { throw new Error('Synthetic failure'); }), /Synthetic failure/);
  await assert.rejects(enqueue(async () => { throw new Error('Synthetic async failure'); }), /Synthetic async failure/);
  assert.equal(await enqueue(() => 'still usable'), 'still usable');
});
