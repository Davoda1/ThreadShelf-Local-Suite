'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ServerClient, ServerError, normalizeBaseUrl } = require('../core/server.cjs');

const summary = (key, extra = {}) => ({ collection: 'archive', sourceFile: '/exports/all.json', conversationKey: key,
  title: `Conversation ${key}`, turnCount: 4, provider: 'chatgpt', lastTurnAt: '2026-10-01T12:00:00Z', ...extra });
const hit = (index, extra = {}) => ({ id: `passage-${index}`, document: `A searchable passage ${index}`,
  metadata: { ...summary(String(index)), role: 'ai', turnIndex: index, createdAt: '2026-10-01T12:00:00Z', ...extra }, distance: 0.1 });
const capabilities = { readerSearch: { version: 1, path: '/api/reader/search', maxPageSize: 50,
  modes: ['keyword', 'semantic'], cursor: true, exactTotal: true } };
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } });
function mockClient(handler, options = {}) {
  const calls = [];
  const client = new ServerClient('http://localhost:3000/prefix', { ...options, fetchImpl: async (input, init) => {
    const url = new URL(input); calls.push({ url, init }); return handler(url, init, calls);
  } });
  return { client, calls };
}
function extensionFixture({ total = 75, expire = false } = {}) {
  const snapshot = 'a'.repeat(48); let starts = 0;
  const mock = mockClient((url) => {
    if (url.pathname.endsWith('/api/reader/capabilities')) return json(capabilities);
    if (url.pathname.endsWith('/api/files')) return json({ files: Array.from({ length: total }, (_, i) => summary(String(i))) });
    if (url.pathname.endsWith('/api/reader/search')) {
      const cursor = url.searchParams.get('cursor');
      if (!cursor) starts++;
      if (cursor && expire) return json({ error: 'Search session expired or was evicted.' }, 410);
      const offset = cursor ? Number(cursor.split('.').at(-1)) : 0;
      const n = Number(url.searchParams.get('n')), end = Math.min(offset + n, total);
      return json({ results: Array.from({ length: end - offset }, (_, i) => hit(offset + i)), total,
        hasMore: end < total, nextCursor: end < total ? `${snapshot}.${end}` : null });
    }
    throw new Error(`Unexpected endpoint ${url.pathname}`);
  });
  return { ...mock, starts: () => starts };
}

test('server URLs retain prefixes and reject credential-bearing or non-HTTP addresses', () => {
  assert.equal(normalizeBaseUrl('http://localhost:3000/prefix'), 'http://localhost:3000/prefix/');
  assert.equal(normalizeBaseUrl('https://example.test/a///'), 'https://example.test/a/');
  for (const url of ['file:///tmp/archive', 'http://user:secret@localhost/', 'localhost:3000', 'http://localhost/?token=secret'])
    assert.throws(() => normalizeBaseUrl(url), e => e.code === 'INVALID_INPUT');
});

test('browse and collections preserve multi-conversation identities and exact pagination', async () => {
  const rows = [summary('a', { title: 'Zeta', turnCount: 9 }), summary('b', { title: 'Alpha', turnCount: 2 }),
    summary('a', { collection: 'other', title: 'Other', turnCount: 5 })];
  const { client, calls } = mockClient(url => url.pathname.endsWith('/api/collections') ? json({ collections: ['archive', 'other', 'empty'] }) : json({ files: rows }));
  const collections = await client.collections();
  assert.deepEqual(collections.collections, [{ name: 'archive', count: 2 }, { name: 'empty', count: 0 }, { name: 'other', count: 1 }]);
  const first = await client.browse({ sort: 'title', limit: 2 });
  assert.deepEqual(first.items.map(row => row.title), ['Alpha', 'Other']);
  assert.equal(first.total, 3); assert.equal(first.totalKnown, true); assert.equal(first.nextOffset, 2);
  const second = await client.browse({ sort: 'title', limit: 2, offset: 2 });
  assert.equal(second.items[0].title, 'Zeta'); assert.equal(second.hasMore, false);
  assert.equal(new Set([...first.items, ...second.items].map(row => row.id)).size, 3);
  const filtered = await client.browse({ collection: 'archive', query: 'alpha' });
  assert.equal(filtered.total, 1); assert.equal(filtered.items[0].conversationKey, 'b');
  assert.equal(calls.filter(call => call.url.pathname.endsWith('/api/files')).length, 1);
  assert.ok(calls.every(call => call.url.pathname.startsWith('/prefix/api/') && call.init.method === 'GET'));
});

test('thread uses complete identity and retains raw turns with normalized messages', async () => {
  const turns = [{ user: 'Hello', createdAt: '2026-01-01T00:00:00Z' }, { thinking: 'Reasoning' }, { ai: '**World**', model: 'local-model' }];
  const { client, calls } = mockClient(() => json({ sourceFile: '/exports/all.json', conversationKey: 'selected', title: 'Selected title', turns }));
  const thread = await client.thread(summary('selected'));
  assert.deepEqual(thread.turns, turns); assert.deepEqual(thread.messages.map(m => m.role), ['user', 'thinking', 'assistant']);
  assert.equal(thread.messages[2].content, '**World**'); assert.equal(thread.messages[2].turnIndex, 2);
  assert.equal(calls[0].url.searchParams.get('sourceFile'), '/exports/all.json');
  assert.equal(calls[0].url.searchParams.get('conversationKey'), 'selected');
  assert.equal(calls[0].url.searchParams.get('collection'), 'archive');
});

test('a mismatched thread identity is never opened under the selected title', async () => {
  const { client } = mockClient(() => json({ sourceFile: '/exports/all.json', conversationKey: 'wrong', turns: [] }));
  await assert.rejects(client.thread(summary('selected')), e => e.code === 'INVALID_RESPONSE');
});

test('extension search traverses every page with exact totals and stable passage identities', async () => {
  const { client, calls, starts } = extensionFixture();
  const pages = [];
  for (const offset of [0, 30, 60]) pages.push(await client.search({ q: 'searchable', collection: 'archive', role: 'assistant', limit: 30, offset }));
  assert.deepEqual(pages.map(page => page.items.length), [30, 30, 15]);
  assert.ok(pages.every(page => page.total === 75 && page.totalKnown && page.engine === 'reader-extension'));
  assert.deepEqual(pages.map(page => page.hasMore), [true, true, false]);
  assert.equal(new Set(pages.flatMap(page => page.items.map(row => row.passageId))).size, 75);
  assert.equal(pages[1].items[0].turnIndex, 30); assert.equal(pages[1].items[0].role, 'assistant');
  assert.equal(starts(), 1);
  const requests = calls.filter(call => call.url.pathname.endsWith('/api/reader/search'));
  assert.ok(requests.every(call => call.url.searchParams.get('roles') === 'ai' && call.url.searchParams.get('n') === '30'));
});

test('changing page size and jumping offsets stays in the original extension snapshot', async () => {
  const { client, starts } = extensionFixture({ total: 160 });
  await client.search({ q: 'searchable', limit: 30 });
  const jumped = await client.search({ q: 'searchable', limit: 10, offset: 95 });
  assert.equal(jumped.items[0].turnIndex, 95);
  const revisited = await client.search({ q: 'searchable', limit: 20, offset: 0 });
  assert.equal(revisited.items[19].turnIndex, 19); assert.equal(starts(), 1);
});

test('a short complete snapshot can be repaged without querying a new snapshot', async () => {
  const { client, starts } = extensionFixture({ total: 18 });
  await client.search({ q: 'searchable', limit: 30 });
  const first = await client.search({ q: 'searchable', limit: 10, offset: 0 });
  const last = await client.search({ q: 'searchable', limit: 10, offset: 10 });
  assert.equal(first.items.length, 10); assert.equal(first.hasMore, true);
  assert.equal(last.items.length, 8); assert.equal(last.hasMore, false); assert.equal(starts(), 1);
});

test('expired remote snapshots surface a restart requirement and clear local session state', async () => {
  const { client } = extensionFixture({ expire: true });
  await client.search({ q: 'searchable' });
  await assert.rejects(client.search({ q: 'searchable', offset: 30 }), e => e.code === 'SNAPSHOT_EXPIRED' && e.status === 410);
  assert.equal(client.sessions.size, 0);
  await client.search({ q: 'searchable' });
});

test('stock search is explicitly bounded, uses one top-50 request, and never invents exhaustive totals', async () => {
  const { client, calls } = mockClient(url => {
    if (url.pathname.endsWith('/api/reader/capabilities')) return new Response('Cannot GET /api/reader/capabilities', { status: 404 });
    if (url.pathname.endsWith('/api/files')) return json({ files: [] });
    return json({ results: Array.from({ length: 50 }, (_, i) => hit(i)) });
  });
  const first = await client.search({ q: 'searchable', mode: 'semantic' });
  const second = await client.search({ q: 'searchable', mode: 'semantic', offset: 30 });
  assert.equal(first.totalKnown, false); assert.equal(first.exhaustive, false); assert.match(first.notice, /not the complete/);
  assert.equal(first.items.length, 30); assert.equal(second.items.length, 20); assert.equal(second.hasMore, false);
  const searches = calls.filter(call => call.url.pathname.endsWith('/api/search'));
  assert.equal(searches.length, 1); assert.equal(searches[0].url.searchParams.get('n'), '50');
});

test('authentication and capability errors are not disguised as absent extensions', async () => {
  for (const response of [json({ error: 'Forbidden host' }, 403), json({ readerSearch: { version: 2 } })]) {
    const { client, calls } = mockClient(() => response);
    await assert.rejects(client.search({ q: 'searchable' }), e => ['ACCESS_DENIED', 'INCOMPATIBLE_EXTENSION'].includes(e.code));
    assert.equal(calls.length, 1);
  }
});

test('stats preserves counts and units and checks the selected scope', async () => {
  const data = { collection: 'archive', totals: { collections: 1, files: 2, chunks: 100, conversations: 3, turns: 40 },
    roles: { user: 40, thinking: 10, ai: 50 }, activity: [{ month: '2026-10', count: 100 }], providers: [], topModels: [], longestThreads: [summary('a')] };
  const { client } = mockClient(() => json(data));
  const stats = await client.stats({ collection: 'archive' });
  assert.deepEqual(stats.totals, data.totals); assert.equal(stats.units.activity, 'passages');
  await assert.rejects(client.stats('other'), e => e.code === 'INVALID_RESPONSE');
});

test('invalid input fails before network access', async () => {
  const { client, calls } = mockClient(() => { throw new Error('Unexpected fetch'); });
  for (const args of [{ q: '' }, { q: 'x'.repeat(4001) }, { q: 'x', role: 'admin' }, { q: 'x', limit: 51 }, { q: 'x', offset: -1 }, { q: 'x', mode: 'unknown' }])
    await assert.rejects(client.search(args), e => e.code === 'INVALID_INPUT');
  await assert.rejects(client.thread({ collection: 'archive', id: 'cannot-identify-by-id' }), e => e.code === 'INVALID_INPUT');
  await assert.rejects(client._get('api/generation'), e => e.code === 'INVALID_INPUT');
  assert.equal(calls.length, 0);
});

test('redirects are blocked and fetch credentials are omitted', async () => {
  const { client, calls } = mockClient(() => new Response(null, { status: 302, headers: { location: 'https://foreign.example/' } }));
  await assert.rejects(client.health(), e => e.code === 'REDIRECT_BLOCKED');
  assert.equal(calls.length, 1); assert.equal(calls[0].init.redirect, 'manual'); assert.equal(calls[0].init.credentials, 'omit');
});

test('timeouts and cancellation produce distinct structured errors', async () => {
  const never = (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
  const timed = mockClient(never, { timeoutMs: 15 });
  await assert.rejects(timed.client.health(), e => e.code === 'TIMEOUT' && e.retryable);
  const cancelled = mockClient(never), task = cancelled.client.health();
  cancelled.client.cancel();
  await assert.rejects(task, e => e.code === 'CANCELLED');
  assert.equal(cancelled.client.requests.size, 0);
  assert.deepEqual(new ServerError('No access', { code: 'ACCESS_DENIED', status: 403 }).toJSON(),
    { message: 'No access', code: 'ACCESS_DENIED', status: 403, retryable: false });
});

test('oversized declared and streamed responses are rejected', async () => {
  for (const declared of [true, false]) {
    const { client } = mockClient(() => json({ ok: true, content: 'x'.repeat(1024) }, 200, declared ? { 'content-length': '2000' } : {}), { maxResponseBytes: 100 });
    await assert.rejects(client.health(), e => e.code === 'RESPONSE_TOO_LARGE');
  }
});

test('HTTP status survives invalid JSON so missing optional routes can be recognized', async () => {
  const { client } = mockClient(() => new Response('<html>Service unavailable</html>', { status: 503 }));
  await assert.rejects(client.health(), e => e.code === 'INVALID_RESPONSE' && e.status === 503);
});
