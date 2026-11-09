import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedResponseText } from '../src/core/bounded-response.mjs';

test('bounded response preserves split Unicode, empty success and exact size boundaries', async () => {
  const bytes = new TextEncoder().encode('A magyar ő és 日本語.');
  const response = new Response(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } }));
  assert.equal(await boundedResponseText(response, bytes.length), 'A magyar ő és 日本語.');
  assert.equal(await boundedResponseText(new Response(null), 10), '');
});

test('oversized advertised response is cancelled before reading data', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'content-length': '5000' } });
  await assert.rejects(boundedResponseText(response, 20, 'Ollama'), /Ollama response exceeds/);
  assert.equal(cancelled, true);
});

test('absent or dishonest lengths cannot bypass the decoded-byte bound and stream is cancelled', async () => {
  for (const headers of [{}, { 'content-length': '1' }]) {
    let cancelled = false, sent = 0;
    const response = new Response(new ReadableStream({
      pull(controller) { sent++; controller.enqueue(new Uint8Array(16)); },
      cancel() { cancelled = true; },
    }), { headers });
    await assert.rejects(boundedResponseText(response, 32), /safety limit/);
    assert.equal(cancelled, true);
    assert.ok(sent < 10, 'must stop the producer instead of draining a hostile body');
  }
});
