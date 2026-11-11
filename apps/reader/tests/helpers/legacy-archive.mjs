// Test-only fixture writer for legacy archives. Production imports deliberately
// cannot create these duplicate rows any more. Use a durable mutation record so
// service tests can journal it through commitMutation and reopen the profile.
import { createHash, randomUUID } from 'node:crypto';
import { stableDedupJSON } from '../../src/core/deduplication.mjs';

export function prepareLegacyUpsert(store, input, { id = `local:${randomUUID()}`, at, contentRef: preparedContentRef } = {}) {
  const document = JSON.parse(JSON.stringify(input));
  for (const key of ['id', 'collectionId', 'turnCount', 'importedAt', 'updatedAt']) delete document[key];
  document.collection = String(input.collection || 'Imported');
  document.provider = String(input.provider).trim().toLowerCase();
  document.sourceFile = String(input.sourceFile || '');
  document.conversationKey = String(input.conversationKey || '');
  document.title = String(input.title || 'Untitled conversation');
  const record = store._record('upsert');
  if (at) record.at = at;
  let collection = store._collection(document.collection, false, true);
  if (!collection) collection = { id: `collection:${randomUUID()}`, name: document.collection, create: true };
  const source = document.sourceIdentity;
  let sourceIdentity;
  if (source && typeof source === 'object' && (source.serverUrl || ['threadshelf', 'server'].includes(source.kind))) {
    const url = new URL(source.serverUrl || source.url); url.username = ''; url.password = ''; url.hash = ''; url.search = '';
    sourceIdentity = stableDedupJSON({ kind: 'threadshelf', serverUrl: url.href.replace(/\/$/, ''),
      serverCollection: String(source.collection || ''), sourceFile: String(source.sourceFile ?? document.sourceFile),
      conversationKey: String(source.conversationKey ?? document.conversationKey) });
  } else sourceIdentity = stableDedupJSON({ kind: 'native', provider: document.provider,
    key: document.conversationKey || createHash('sha256').update(stableDedupJSON({ turns: document.turns, raw: document.raw ?? null })).digest('hex') });
  const contentRef = preparedContentRef || store.content.writeDocument(document);
  const passageCount = document.turns.reduce((count, turn) => count + ['user', 'ai', 'thinking', 'assistant', 'system', 'tool', 'function']
    .filter(role => typeof turn[role] === 'string' && turn[role].trim()).length, 0);
  return { ...record, id, previousId: null, collection, sourceIdentity,
    contentHash: store._contentHash(document), contentRef, conflict: false, unchanged: false,
    document: { provider: document.provider, sourceFile: document.sourceFile, conversationKey: document.conversationKey,
      title: document.title, turnCount: document.turns.length, lastTurnAt: document.lastTurnAt,
      sortTime: 0, passageCount } };
}

export function seedLegacy(store, document, options) {
  const result = store.applyMutation(prepareLegacyUpsert(store, document, options));
  store._open().prepare('UPDATE conversations SET cleanup_version=0 WHERE id=?').run(result.summary.id);
  return result;
}
