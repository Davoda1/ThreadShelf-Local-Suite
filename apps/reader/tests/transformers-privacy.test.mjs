import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { applyTransformersPrivacyPatch, assertTransformersPrivacy, TRANSFORMERS_HUB_UPSTREAM_SHA256 } from '../src/core/transformers-privacy.mjs';
import { resolveTransformersSource } from '../src/core/transformers-runtime.mjs';

test('download-header patch is exact, repeatable and rejects unreviewed upstream changes', async () => {
  const entry = await resolveTransformersSource();
  const patched = await readFile(new URL('utils/hub.js', entry), 'utf8');
  assertTransformersPrivacy(patched);
  const original = patched.replace(
    '        // Modified by davoda1 for ThreadShelf: omit library version and CI request metadata.',
    "        const IS_CI = !!process.env?.TESTING_REMOTELY;\n        const version = env.version;\n        headers.set('User-Agent', `transformers.js/${version}; is_ci/${IS_CI};`);")
    .replace(' * Modified by davoda1 for ThreadShelf: Node.js requests retain Authorization only when applicable.',
      ' * In Node.js environments, adds User-Agent and Authorization headers when applicable.');
  assert.equal(createHash('sha256').update(original).digest('hex'), TRANSFORMERS_HUB_UPSTREAM_SHA256);
  assert.equal(applyTransformersPrivacyPatch(original), patched);
  assert.equal(applyTransformersPrivacyPatch(patched), patched);
  assert.throws(() => applyTransformersPrivacyPatch(original + '\n'), /Unexpected Transformers/);
  assert.throws(() => assertTransformersPrivacy(original), /privacy source is missing or changed/);
  assert.throws(() => assertTransformersPrivacy(patched + '\n'), /privacy source is missing or changed/);
});

test('actual model source omits version/CI reporting while retaining requested downloads and host-scoped authentication', async () => {
  const entry = await resolveTransformersSource();
  const { getFile, getFetchHeaders } = await import(new URL('utils/hub.js', entry));
  const { env } = await import(new URL('env.js', entry));
  const prior = Object.fromEntries(['TESTING_REMOTELY', 'HF_TOKEN', 'HF_ACCESS_TOKEN'].map(key => [key, process.env[key]]));
  const previousFetch = env.fetch;
  const received = [];
  try {
    process.env.TESTING_REMOTELY = '1';
    process.env.HF_TOKEN = 'threadshelf-fixture-token';
    delete process.env.HF_ACCESS_TOKEN;
    env.fetch = async (url, options) => { received.push({ url, headers: Object.fromEntries(options.headers) }); return new Response('fixture model data'); };
    const remote = 'https://huggingface.co/fixture/model/resolve/main/config.json';
    assert.equal(getFetchHeaders(remote).get('User-Agent'), null);
    assert.equal(getFetchHeaders(remote).get('Authorization'), 'Bearer threadshelf-fixture-token');
    assert.deepEqual([...getFetchHeaders('https://example.invalid/config.json')], []);
    assert.deepEqual([...getFetchHeaders('https://huggingface.co.example.invalid/config.json')], []);
    assert.equal(await (await getFile(remote)).text(), 'fixture model data');
    assert.deepEqual(received, [{ url: remote, headers: { authorization: 'Bearer threadshelf-fixture-token' } }]);
  } finally {
    env.fetch = previousFetch;
    for (const [key, value] of Object.entries(prior)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
