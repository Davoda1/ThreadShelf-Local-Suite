import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import { ResourceCache, normalizeResourceUrl, isPublicResourceAddress } from '../src/core/resource-cache.mjs';
import { RESOURCE_CACHE_DEFAULTS, validateResourceCacheSettings } from '../src/core/resource-cache-settings.mjs';

const png = await sharp({ create: { width: 3, height: 2, channels: 4, background: '#1a80c0ff' } }).png().toBuffer();
const owner = (key = 'conversation-a') => ({ key, title: `Title ${key}`, source: 'local', sourceId: 'archive' });
const url = 'https://images.example.test/a.png?version=1';
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function transport(routes = {}) {
  const calls = [];
  let active = 0, maximum = 0;
  const request = (address, options, callback) => {
    const req = new EventEmitter(); let destroyed = false, stream;
    req.destroy = error => {
      if (destroyed) return; destroyed = true;
      stream?.destroy(error);
      if (error) queueMicrotask(() => req.emit('error', error));
    };
    req.end = () => {
      active++; maximum = Math.max(maximum, active);
      const abort = () => req.destroy(Object.assign(new Error('Aborted'), { code: 'ABORT_ERR' }));
      options.signal.addEventListener('abort', abort, { once: true });
      if (options.signal.aborted) abort();
      queueMicrotask(async () => {
        try {
          const pinned = await new Promise((resolve, reject) => options.lookup(address.hostname, { all: true }, (error, value) => error ? reject(error) : resolve(value)));
          calls.push({ address: address.href, options, pinned });
          const route = routes[address.href] || routes['*'] || {};
          if (route.wait) await route.wait;
          if (route.error) throw route.error;
          if (destroyed) return;
          const data = route.bytes ?? png;
          stream = Readable.from(route.chunks || [data]);
          stream.statusCode = route.status ?? 200;
          stream.headers = { 'content-type': route.mime ?? 'image/png', ...(route.length === false ? {} : { 'content-length': String(data.length) }), ...route.headers };
          callback(stream);
          await new Promise(resolve => { stream.once('close', resolve); });
        } catch (error) { if (!destroyed) req.emit('error', error); }
        finally { options.signal.removeEventListener('abort', abort); active--; }
      });
    };
    return req;
  };
  return { request, calls, get maximum() { return maximum; } };
}

async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-resource-test-'));
  const net = transport(options.routes);
  const cache = await new ResourceCache({ dataDir: directory, lookup: publicLookup, request: net.request, ...options }).init();
  cache.setEnabled(true);
  t.after(async () => { await cache.close(); await fs.rm(directory, { recursive: true, force: true }); });
  return { cache, directory, net };
}

test('settings remain a strict, default-off separate preference', () => {
  assert.deepEqual(RESOURCE_CACHE_DEFAULTS, { resourceCacheEnabled: false });
  assert.deepEqual(validateResourceCacheSettings({}), RESOURCE_CACHE_DEFAULTS);
  assert.deepEqual(validateResourceCacheSettings({ resourceCacheEnabled: true }), { resourceCacheEnabled: true });
  for (const value of [null, [], { resourceCacheEnabled: 'true' }, { remoteImages: 'always' }]) assert.throws(() => validateResourceCacheSettings(value));
});

test('URL and public-address validation blocks credentials, alternate schemes and local ranges', () => {
  assert.equal(normalizeResourceUrl(`${url}#position`), url);
  for (const bad of ['file:///etc/passwd', 'data:image/png;base64,abc', 'javascript:alert(1)', 'https://user:pass@example.test/a', 'https://example.test/a\nb', '/a', '']) assert.throws(() => normalizeResourceUrl(bad));
  for (const bad of ['0.0.0.0', '10.1.2.3', '127.0.0.1', '169.254.169.254', '172.20.1.1', '192.168.1.1', '100.64.1.1', '192.0.0.8', '192.0.2.1', '198.18.1.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255', '::', '::1', '::ffff:127.0.0.1', '64:ff9b::a00:1', 'fe80::1', 'fc00::1', '2002:a00:1::1', '2001::1', '2001:db8::1', '3fff::1']) assert.equal(isPublicResourceAddress(bad), false, bad);
  for (const good of ['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111', '2001:4860:4860::8888']) assert.equal(isPublicResourceAddress(good), true, good);
});

test('persists original raster bytes and reads them after restart while offline and disabled', async t => {
  const { cache, directory, net } = await fixture(t);
  const first = await cache.load({ url, conversation: owner() });
  assert.equal(first.cached, false); assert.equal(first.stored, true);
  assert.deepEqual(Buffer.from(first.dataUrl.split(',')[1], 'base64'), png);
  assert.equal(net.calls.length, 1);
  const files = await fs.readdir(path.join(directory, 'resource-cache-v1', 'objects'));
  assert.equal(files.length, 1); assert.deepEqual(await fs.readFile(path.join(directory, 'resource-cache-v1', 'objects', files[0])), png);
  const restarted = await new ResourceCache({ dataDir: directory, lookup: async () => { throw new Error('Offline'); } }).init();
  t.after(() => restarted.close());
  const hit = await restarted.load({ url, conversation: owner(), enabled: false });
  assert.equal(hit.cached, true); assert.equal(hit.stored, true); assert.equal(hit.dataUrl, first.dataUrl);
  assert.equal((await restarted.status()).totalBytes, png.length);
  assert.equal((await restarted.status()).conversations[0].sourceId, 'archive');
});

test('deduplicates simultaneous URL fetches and content bytes while retaining independent ownership', async t => {
  const { cache, net, directory } = await fixture(t);
  const [a, b] = await Promise.all([cache.load({ url, conversation: owner('a') }), cache.load({ url, conversation: owner('b') })]);
  assert.equal(net.calls.length, 1); assert.equal(a.resourceId, b.resourceId);
  await cache.load({ url: 'https://images.example.test/duplicate.png', conversation: owner('b') });
  let status = await cache.status();
  assert.equal(status.resourceCount, 2); assert.equal(status.totalBytes, png.length); assert.equal(status.conversations.length, 2);
  await cache.clear({ conversationKey: 'a' });
  status = await cache.status(); assert.equal(status.resourceCount, 2); assert.equal(status.conversations.length, 1);
  assert.equal((await cache.load({ url, conversation: owner('b') })).cached, true);
  await cache.clear({ conversationKey: 'b' });
  assert.equal((await cache.status()).resourceCount, 0); assert.deepEqual(await fs.readdir(path.join(directory, 'resource-cache-v1', 'objects')), []);
});

test('disabled misses render without saving and a disable during fetch prevents late persistence', async t => {
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const { cache, directory } = await fixture(t, { routes: { '*': { wait } } });
  const pending = cache.load({ url, conversation: owner() });
  await tick(); cache.setEnabled(false); release();
  const first = await pending;
  assert.equal(first.stored, false); assert.equal((await cache.status()).resourceCount, 0);
  cache.setEnabled(true);
  const second = await cache.load({ url, conversation: owner(), enabled: false });
  assert.equal(second.stored, false);
  assert.deepEqual(await fs.readdir(path.join(directory, 'resource-cache-v1', 'objects')), []);
});

test('cache-disabled requests still reject private networks, unsafe redirects and invalid image bytes', async t => {
  const local = await fixture(t, { lookup: async () => [{ address: '127.0.0.1', family: 4 }] });
  local.cache.setEnabled(false);
  await assert.rejects(local.cache.load({ url, conversation: owner(), enabled: false }), { code: 'NETWORK' });
  assert.equal(local.net.calls.length, 0);
  const redirect = await fixture(t, { routes: { [url]: { status: 302, headers: { location: 'http://127.0.0.1/private' } } } });
  redirect.cache.setEnabled(false);
  await assert.rejects(redirect.cache.load({ url, conversation: owner(), enabled: false }));
  assert.equal(redirect.net.calls.length, 1);
  const invalid = await fixture(t, { routes: { '*': { bytes: Buffer.from('<svg/>'), mime: 'image/svg+xml' } } });
  invalid.cache.setEnabled(false);
  await assert.rejects(invalid.cache.load({ url, conversation: owner(), enabled: false }));
  for (const { cache, directory } of [local, redirect, invalid]) {
    assert.equal((await cache.status()).resourceCount, 0);
    assert.deepEqual(await fs.readdir(path.join(directory, 'resource-cache-v1', 'objects')), []);
  }
});

test('per-owner deletion invalidates its pending save but preserves a simultaneous shared owner', async t => {
  let release; const wait = new Promise(resolve => { release = resolve; });
  const { cache, net } = await fixture(t, { routes: { '*': { wait } } });
  const a = cache.load({ url, conversation: owner('a') });
  const b = cache.load({ url, conversation: owner('b') });
  const rejected = assert.rejects(a, { code: 'ABORT_ERR' });
  await tick(); await cache.clear({ conversationKey: 'a' }); release();
  await rejected; await b;
  assert.equal(net.calls.length, 1);
  assert.deepEqual((await cache.status()).conversations.map(value => value.key), ['b']);
});

test('clear all aborts pending work, removes saved bytes, and allows later requests', async t => {
  let release; const wait = new Promise(resolve => { release = resolve; });
  const routes = { '*': { wait } };
  const { cache, directory } = await fixture(t, { routes });
  const pending = cache.load({ url, conversation: owner() });
  const rejected = assert.rejects(pending);
  await tick(); await cache.clear({ all: true }); release(); await rejected;
  assert.equal((await cache.status()).resourceCount, 0);
  assert.deepEqual(await fs.readdir(path.join(directory, 'resource-cache-v1', 'objects')), []);
  delete routes['*'];
  assert.equal((await cache.load({ url, conversation: owner() })).stored, true);
  await cache.clear({ all: true });
  assert.equal((await cache.status()).totalBytes, 0);
});

test('cancelling one subscriber does not cancel another and close cancels pending requests', async t => {
  let release; const wait = new Promise(resolve => { release = resolve; });
  const { cache } = await fixture(t, { routes: { '*': { wait } } });
  const controller = new AbortController();
  const a = cache.load({ url, conversation: owner('a'), signal: controller.signal });
  const b = cache.load({ url, conversation: owner('b') });
  const rejected = assert.rejects(a, { code: 'ABORT_ERR' });
  await tick(); controller.abort(); release(); await rejected; await b;
  assert.deepEqual((await cache.status()).conversations.map(value => value.key), ['b']);
});

test('bounds concurrency, pending queue, disk capacity and per-image size', async t => {
  let release; const wait = new Promise(resolve => { release = resolve; });
  const { cache, net } = await fixture(t, { routes: { '*': { wait } }, limits: { concurrency: 2, queued: 2, totalBytes: png.length - 1 } });
  const requests = Array.from({ length: 4 }, (_, i) => cache.load({ url: `https://images.example.test/${i}.png`, conversation: owner(String(i)) }));
  await tick();
  await assert.rejects(cache.load({ url: 'https://images.example.test/extra.png', conversation: owner() }), { code: 'BUSY' });
  release(); const results = await Promise.all(requests);
  assert.ok(net.maximum <= 2); assert.ok(results.every(value => !value.stored && value.warning === 'cache-full'));
  assert.equal((await cache.status()).resourceCount, 0);
  const small = await fixture(t, { limits: { imageBytes: 32 } });
  await assert.rejects(small.cache.load({ url, conversation: owner() }), { code: 'IMAGE_SIZE' });
});

test('DNS rejects private and mixed answers; requests pin public addresses and send no private headers', async t => {
  for (const answers of [[{ address: '127.0.0.1', family: 4 }], [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }]]) {
    const { cache, net } = await fixture(t, { lookup: async () => answers });
    await assert.rejects(cache.load({ url, conversation: owner() }), { code: 'NETWORK' }); assert.equal(net.calls.length, 0);
  }
  const { cache, net } = await fixture(t);
  await cache.load({ url, conversation: owner() });
  assert.deepEqual(net.calls[0].pinned, [{ address: '93.184.216.34', family: 4 }]);
  const headers = net.calls[0].options.headers;
  assert.deepEqual(Object.keys(headers).sort(), ['Accept', 'Accept-Encoding', 'User-Agent']);
  assert.equal(net.calls[0].options.agent, false);
});

test('each redirect is validated and pinned, including private DNS and credential redirects', async t => {
  const second = 'https://cdn.example.test/final.png';
  const { cache, net } = await fixture(t, { routes: { [url]: { status: 302, headers: { location: second } } } });
  await cache.load({ url, conversation: owner() }); assert.equal(net.calls.length, 2);
  for (const location of ['http://127.0.0.1/private', 'https://user:secret@example.test/a', 'file:///etc/passwd']) {
    const other = await fixture(t, { routes: { [url]: { status: 302, headers: { location } } } });
    await assert.rejects(other.cache.load({ url, conversation: owner() })); assert.equal(other.net.calls.length, 1);
  }
  const looping = await fixture(t, { routes: { '*': { status: 302, headers: { location: url } } }, limits: { redirects: 2 } });
  await assert.rejects(looping.cache.load({ url, conversation: owner() }), { code: 'REDIRECT' }); assert.equal(looping.net.calls.length, 3);
});

test('rejects SVG, HTML, MIME mismatches, corrupt headers, oversize streams and too many pixels', async t => {
  const huge = await sharp({ create: { width: 100, height: 100, channels: 3, background: 'red' } }).png().toBuffer();
  for (const route of [
    { bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), mime: 'image/svg+xml' },
    { bytes: Buffer.from('<script>alert(1)</script>'), mime: 'image/png' },
    { bytes: png, mime: 'image/jpeg' }, { bytes: png.subarray(0, 25), mime: 'image/png' },
    { bytes: huge, mime: 'image/png' },
  ]) {
    const { cache } = await fixture(t, { routes: { '*': route }, limits: { pixels: 500 } });
    await assert.rejects(cache.load({ url, conversation: owner() })); assert.equal((await cache.status()).resourceCount, 0);
  }
  const { cache } = await fixture(t, { routes: { '*': { chunks: [png, png], length: false } }, limits: { imageBytes: png.length + 1 } });
  await assert.rejects(cache.load({ url, conversation: owner() }), { code: 'IMAGE_SIZE' });
});

test('accepts supported raster types while retaining exact source bytes', async t => {
  for (const [format, mime] of [['jpeg', 'image/jpeg'], ['gif', 'image/gif'], ['webp', 'image/webp'], ['avif', 'image/avif']]) {
    const bytes = await sharp(png)[format]().toBuffer();
    const { cache } = await fixture(t, { routes: { '*': { bytes, mime } } });
    const result = await cache.load({ url, conversation: owner() });
    assert.deepEqual(Buffer.from(result.dataUrl.split(',')[1], 'base64'), bytes);
  }
});

test('damaged saved bytes fail closed; bad index is preserved until explicit clear-all repairs it', async t => {
  const { cache, directory } = await fixture(t);
  await cache.load({ url, conversation: owner() });
  const objects = path.join(directory, 'resource-cache-v1', 'objects');
  const [name] = await fs.readdir(objects);
  await fs.writeFile(path.join(objects, name), 'damaged');
  await assert.rejects(cache.load({ url, conversation: owner() }), { code: 'CORRUPT' });
  await cache.clear({ conversationKey: owner().key });
  assert.equal((await cache.load({ url, conversation: owner() })).stored, true);
  await cache.close();
  const index = path.join(directory, 'resource-cache-v1', 'index.json');
  await fs.writeFile(index, '{broken');
  const restarted = await new ResourceCache({ dataDir: directory, lookup: publicLookup, request: transport().request }).init();
  t.after(() => restarted.close());
  assert.equal((await restarted.status()).notice, 'cache-corrupt');
  assert.equal(await fs.readFile(index, 'utf8'), '{broken');
  await assert.rejects(restarted.load({ url, conversation: owner() }), { code: 'CORRUPT' });
  await restarted.clear({ all: true });
  assert.equal((await restarted.status()).notice, undefined); assert.deepEqual(await fs.readdir(objects), []);
});

test('rejects linked cache directories and linked/hardlinked objects without touching targets', async t => {
  const { cache, directory } = await fixture(t);
  await cache.load({ url, conversation: owner() });
  const objects = path.join(directory, 'resource-cache-v1', 'objects');
  const [name] = await fs.readdir(objects);
  const external = path.join(directory, 'outside.txt'); await fs.writeFile(external, 'untouched');
  await fs.unlink(path.join(objects, name)); await fs.symlink(external, path.join(objects, name));
  await assert.rejects(cache.load({ url, conversation: owner() }), { code: 'PATH' });
  await cache.clear({ all: true }); assert.equal(await fs.readFile(external, 'utf8'), 'untouched');
  await fs.link(external, path.join(objects, name));
  await assert.rejects(cache.readRegular(path.join(objects, name), 100), { code: 'PATH' });
  await cache.clear({ all: true }); assert.equal(await fs.readFile(external, 'utf8'), 'untouched');
  await cache.close(); await fs.rm(objects, { recursive: true }); await fs.symlink(directory, objects);
  await assert.rejects(new ResourceCache({ dataDir: directory }).init(), { code: 'PATH' });
  assert.equal(await fs.readFile(external, 'utf8'), 'untouched');
});

test('cache operations leave unrelated archive and legacy preference bytes unchanged', async t => {
  const { cache, directory } = await fixture(t);
  const archive = path.join(directory, 'conversations.json'); const settings = path.join(directory, 'settings.json');
  const original = Buffer.from('{"schemaVersion":1,"data":{"untouched":true}}\n');
  await fs.writeFile(archive, original); await fs.writeFile(settings, original);
  await cache.load({ url, conversation: owner() }); await cache.clear({ all: true });
  assert.deepEqual(await fs.readFile(archive), original); assert.deepEqual(await fs.readFile(settings), original);
});

test('recovers crash orphan objects and temporary files without deleting retained bytes or unrelated files', async t => {
  const { cache, directory } = await fixture(t);
  await cache.load({ url, conversation: owner() }); await cache.close();
  const root = path.join(directory, 'resource-cache-v1'), objects = path.join(root, 'objects');
  const [retained] = await fs.readdir(objects);
  const orphan = `${'a'.repeat(64)}.bin`, temp = `${'b'.repeat(64)}.bin.${'c'.repeat(24)}.tmp`;
  await fs.writeFile(path.join(objects, orphan), png); await fs.writeFile(path.join(objects, temp), png);
  await fs.writeFile(path.join(root, `index.json.${'d'.repeat(24)}.tmp`), 'incomplete');
  await fs.writeFile(path.join(objects, 'unrelated-note.txt'), 'preserved');
  const restarted = await new ResourceCache({ dataDir: directory }).init(); t.after(() => restarted.close());
  assert.deepEqual((await fs.readdir(objects)).sort(), [retained, 'unrelated-note.txt'].sort());
  assert.equal((await restarted.load({ url, conversation: owner(), enabled: false })).cached, true);
});

test('preference change before atomic index publication prevents a pending save', async t => {
  const { cache, directory } = await fixture(t);
  let release, reached; const waiting = new Promise(resolve => { reached = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const original = cache.atomic.bind(cache);
  cache.atomic = async (file, bytes, mayCommit) => {
    if (file === cache.indexFile) { reached(); await gate; }
    return original(file, bytes, mayCommit);
  };
  const pending = cache.load({ url, conversation: owner() });
  await waiting; cache.setEnabled(false); cache.setEnabled(true); release();
  const result = await pending;
  assert.equal(result.stored, false); assert.equal((await cache.status()).resourceCount, 0);
  assert.deepEqual(await fs.readdir(path.join(directory, 'resource-cache-v1', 'objects')), []);
});

test('metadata entry limits remain bounded independently of stored byte deduplication', async t => {
  const { cache } = await fixture(t, { limits: { resources: 1, conversations: 1, references: 1 } });
  assert.equal((await cache.load({ url, conversation: owner('a') })).stored, true);
  const extraUrl = await cache.load({ url: 'https://images.example.test/b.png', conversation: owner('a') });
  assert.equal(extraUrl.stored, false); assert.equal(extraUrl.warning, 'cache-full');
  const extraOwner = await cache.load({ url, conversation: owner('b') });
  assert.equal(extraOwner.warning, 'cache-full');
  assert.deepEqual((await cache.status()).conversations.map(value => value.key), ['a']);
  assert.equal(cache.ownerEpochs.size, 0);
  await assert.rejects(cache.load({ url, conversation: null }), { code: 'OWNER' });
  assert.equal(cache.loadCount, 0);
});

test('DNS and request deadlines terminate stalled work, and shutdown waits for cancellation', async t => {
  const keepAlive = setTimeout(() => {}, 1000); t.after(() => clearTimeout(keepAlive));
  const stalledDns = await fixture(t, { lookup: async () => new Promise(() => {}), limits: { timeoutMs: 25 } });
  await assert.rejects(stalledDns.cache.load({ url, conversation: owner() }), { code: 'ABORT_ERR' });
  let release; const wait = new Promise(resolve => { release = resolve; });
  const stalledHttp = await fixture(t, { routes: { '*': { wait } }, limits: { timeoutMs: 25 } });
  await assert.rejects(stalledHttp.cache.load({ url, conversation: owner() })); release();
  let shutdownRelease; const shutdownWait = new Promise(resolve => { shutdownRelease = resolve; });
  const shutdown = await fixture(t, { routes: { '*': { wait: shutdownWait } } });
  const pending = shutdown.cache.load({ url, conversation: owner() }); const rejected = assert.rejects(pending);
  await tick(); await shutdown.cache.close(); await rejected; shutdownRelease();
  assert.equal(shutdown.cache.inflight.size, 0);
});

test('explicit clear-all repairs a linked index by unlinking only the cache link', async t => {
  const { cache, directory } = await fixture(t); await cache.close();
  const external = path.join(directory, 'outside-index.json'), index = path.join(directory, 'resource-cache-v1', 'index.json');
  await fs.writeFile(external, '{"untouched":true}'); await fs.symlink(external, index);
  const restarted = await new ResourceCache({ dataDir: directory }).init(); t.after(() => restarted.close());
  assert.equal((await restarted.status()).notice, 'cache-corrupt');
  await restarted.clear({ all: true });
  assert.equal(await fs.readFile(external, 'utf8'), '{"untouched":true}');
  assert.equal((await fs.lstat(index)).isSymbolicLink(), false); assert.equal((await restarted.status()).notice, undefined);
});

test('network failures contain no source URL and allow a later retry', async t => {
  const routes = { '*': { error: new Error(`Private diagnostic from ${url}`) } };
  const { cache } = await fixture(t, { routes });
  await assert.rejects(cache.load({ url, conversation: owner() }), error => error.code === 'NETWORK' && !error.message.includes('example.test'));
  assert.equal((await cache.status()).resourceCount, 0);
  delete routes['*'];
  assert.equal((await cache.load({ url, conversation: owner() })).stored, true);
});

test('APNG animation frames share the aggregate pixel limit even when decoder exposes one page', async t => {
  const chunk = (type, data) => {
    const payload = Buffer.concat([Buffer.from(type), data]), header = Buffer.alloc(4), checksum = Buffer.alloc(4);
    header.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(payload));
    return Buffer.concat([header, payload, checksum]);
  };
  let ihdr, idat;
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8), data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') ihdr = data;
    if (type === 'IDAT') idat = idat ? Buffer.concat([idat, data]) : data;
    offset += length + 12;
  }
  const actl = Buffer.alloc(8); actl.writeUInt32BE(2);
  const control = sequence => { const value = Buffer.alloc(26); value.writeUInt32BE(sequence); value.writeUInt32BE(3, 4); value.writeUInt32BE(2, 8); value.writeUInt16BE(1, 20); value.writeUInt16BE(10, 22); return value; };
  const sequence = Buffer.alloc(4); sequence.writeUInt32BE(2);
  const apng = Buffer.concat([png.subarray(0, 8), chunk('IHDR', ihdr), chunk('acTL', actl), chunk('fcTL', control(0)), chunk('IDAT', idat), chunk('fcTL', control(1)), chunk('fdAT', Buffer.concat([sequence, idat])), chunk('IEND', Buffer.alloc(0))]);
  const small = await fixture(t, { routes: { '*': { bytes: apng } }, limits: { pixels: 10 } });
  await assert.rejects(small.cache.load({ url, conversation: owner() }), { code: 'IMAGE_INVALID' });
  const enough = await fixture(t, { routes: { '*': { bytes: apng } }, limits: { pixels: 12 } });
  assert.deepEqual(Buffer.from((await enough.cache.load({ url, conversation: owner() })).dataUrl.split(',')[1], 'base64'), apng);
});
