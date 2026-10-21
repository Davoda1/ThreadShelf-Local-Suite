import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { conversationCreatedAt, conversationCreatedDate, sourceTimestamp } from '../src/core/conversation-date.mjs';
import { normalizeActivity } from '../src/core/activity-normalize.mjs';
import { normalizeDocument } from '../src/core/importers.mjs';

const expected = Date.parse('2026-01-12T15:45:12.123Z');
test('creation aliases and retained provider wrappers agree across Activity and search metadata', () => {
  const formats = [
    { threadCreatedAt: '2026-01-12T15:45:12.123Z' }, { create_time: expected / 1000 }, { created_at: expected }, { createdAt: '2026-01-12T16:45:12.123+01:00' },
    { create_time_iso: '2026-01-12T15:45:12.123Z' }, { createTime: '2026-01-12T15:45:12.123Z' }, { createdAtUnixTimestamp: String(expected / 1000) },
    { created: '2026-01-12 15:45:12.123' }, { create_time: { $date: { $numberLong: String(expected) } } },
    { create_time: { $date: '2026-01-12T15:45:12.123Z' } }, { createdAt: { $date: expected } },
    { create_time: 'invalid', created_at: '', createdAt: '2026-01-12T15:45:12.123Z' }
  ];
  for (const original of formats) {
    for (const document of [{ ...original, turns: [] }, { raw: original, turns: [] }, { raw: { serverUrl: 'http://localhost', thread: original }, turns: [] }, { raw: { conversation: original }, turns: [] }, { raw: { conversation: { venice_metadata: original } }, turns: [] }]) {
      assert.equal(conversationCreatedAt(document), expected, JSON.stringify(document));
      assert.equal(+conversationCreatedDate(document), expected);
      assert.equal(normalizeActivity(document).created, expected);
    }
    const mapping = { raw: { ...original, mapping: {} }, turns: [] };
    assert.equal(normalizeActivity(mapping).created, expected, 'ChatGPT original coverage uses the same creation source');
  }
});

test('existing native provider fixtures retain original creation dates through real import normalization', async () => {
  for (const [filename, expected] of [
    ['grok-polish.json', 1771000000000],
    ['lmstudio-snapshot.json', 1769354110330],
    ['lmstudio-versions-snapshot.json', 1770508800000],
    ['lmstudio-polish.json', 1700000000000],
    ['anthropic-project-snapshot.json', Date.parse('2026-06-10T08:00:00Z')]
  ]) {
    const input = JSON.parse(await readFile(new URL('./fixtures/imports/' + filename, import.meta.url), 'utf8'));
    const records = normalizeDocument(input, filename); assert.ok(records.length, filename);
    assert.equal(conversationCreatedAt(records[0]), expected, filename);
    assert.equal(normalizeActivity(records[0]).created, expected, filename);
  }
});

test('source creation ignores import, summary and message dates while Activity marks its separate estimate', () => {
  const document = {
    importedAt: '2026-01-12', updatedAt: '2026-01-13', lastTurnAt: '2026-01-14',
    raw: { serverUrl: 'http://localhost', exportedAt: '2026-01-15', summary: { createdAt: '2026-01-16' }, thread: { turns: [{ createdAt: '2026-01-17' }] } },
    turns: [{ user: 'Message has a real date, but does not establish creation.', createdAt: '2026-01-17' }]
  };
  assert.equal(conversationCreatedAt(document), null); assert.equal(conversationCreatedDate(document), null);
  assert.equal(normalizeActivity(document).created, Date.parse('2026-01-17'));
  assert.equal(normalizeActivity(document).createdEstimated, true, 'Activity marks a separate earliest-turn estimate without changing source/search creation');
  for (const bad of ['2025-02-29', '2026-01-12T24:00:00Z', '2026-01-12T01:60:00Z', '2026-01-12T01:00:60Z', true, Infinity, {}, { $date: {} }]) {
    assert.equal(sourceTimestamp(bad), null, JSON.stringify(bad));
  }
  assert.equal(sourceTimestamp({ $date: { $numberLong: '1000' } }), 1000, 'Mongo numeric dates have explicit millisecond units');
  assert.equal(sourceTimestamp(1000), 1000000, 'ordinary numeric source timestamps retain seconds support');
});

test('retained originals take priority over wrappers and cycles remain bounded', () => {
  const record = { createdAt: '2026-04-01', raw: { thread: { createdAt: '2026-03-01', raw: { createdAt: '2026-02-01' } } } };
  assert.equal(conversationCreatedAt(record), Date.parse('2026-02-01T00:00:00Z'));
  const cyclic = { raw: { createdAt: '2026-01-01' } }; cyclic.raw.thread = cyclic;
  assert.equal(conversationCreatedAt(cyclic), Date.parse('2026-01-01T00:00:00Z'));
});

test('original message aliases contribute their own dates and latest branch fallback uses them', () => {
  const result = normalizeActivity({ raw: { createdAt: '2026-01-01', mapping: {
    old: { message: { id: 'one', author: { role: 'user' }, create_time: 'invalid', createdAt: '2026-01-02' }, parent: null },
    recent: { message: { id: 'two', author: { role: 'assistant' }, createdAt: { $date: Date.parse('2026-01-03') } }, parent: null }
  } }, turns: [] });
  assert.equal(result.created, Date.parse('2026-01-01'));
  assert.deepEqual(result.messages.map(row => row.time), [Date.parse('2026-01-02'), Date.parse('2026-01-03')]);
  assert.deepEqual(result.messages.map(row => row.active), [false, true]);
});
