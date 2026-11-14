// Page-only presentation metadata. Never runs a search, enumerates a collection,
// reads a Local raw header, or changes the archive/search index.
import { setImmediate as yieldTask } from 'node:timers/promises';
import { classifySearchTurns, searchHitDecision, validIndex, unknown } from './search-visibility-model.mjs';
export { classifySearchTurns, searchHitDecision } from './search-visibility-model.mjs';

const text = (value, max = 8192) => typeof value === 'string' && value.length <= max ? value : '';

export class SearchVisibility {
  constructor({ maxEntries = 128, maxRecords = 100000 } = {}) {
    this.maxEntries = maxEntries; this.maxRecords = maxRecords;
    this.cache = new Map(); this.records = 0;
  }
  clear() { this.cache.clear(); this.records = 0; }
  remember(key, value) {
    if (value.records.length > this.maxRecords) return value;
    const previous = this.cache.get(key);
    if (previous) { this.records -= previous.records.length; this.cache.delete(key); }
    while (this.cache.size && (this.cache.size >= this.maxEntries || this.records + value.records.length > this.maxRecords)) {
      const oldest = this.cache.keys().next().value;
      this.records -= this.cache.get(oldest).records.length; this.cache.delete(oldest);
    }
    this.cache.set(key, value); this.records += value.records.length; return value;
  }
  async resolve(args = {}, { store, client, signal } = {}) {
    if (!Array.isArray(args.hits) || args.hits.length > 500) throw new Error('Search visibility requires at most 500 current-page results.');
    const mode = args.mode || 'local';
    if (!['local', 'server'].includes(mode)) throw new Error('Choose Local or ThreadShelf Server mode.');
    const decisions = args.hits.map(unknown), groups = new Map();
    for (const [index, hit] of args.hits.entries()) {
      if (!hit || typeof hit !== 'object' || Array.isArray(hit)) continue;
      if (!Object.hasOwn(hit, 'sourceTurnPosition') && !validIndex(hit.turnIndex)) continue; // title-only
      if (Object.hasOwn(hit, 'sourceTurnPosition') && !validIndex(hit.sourceTurnPosition)) continue;
      if (mode === 'local' && hit.role === 'user' && validIndex(hit.turnIndex) && !Object.hasOwn(hit, 'sourceTurnPosition')) {
        decisions[index] = { classified: true, turnIndex: hit.turnIndex, emptyHidden: false, intermediateHidden: false }; continue;
      }
      const ref = mode === 'local' ? { id: text(hit.conversationId || hit.id, 1024) }
        : { collection: text(hit.collection || args.collection), sourceFile: text(hit.sourceFile || hit.file || hit.path), conversationKey: text(hit.conversationKey ?? hit.conversation_key ?? '') };
      if (mode === 'local' ? !ref.id : !ref.collection || !ref.sourceFile) continue;
      const key = JSON.stringify(ref);
      if (!groups.has(key)) groups.set(key, { ref, entries: [] });
      groups.get(key).entries.push([index, hit]);
    }
    for (const { ref, entries } of groups.values()) {
      signal?.throwIfAborted();
      try {
        let classified;
        if (mode === 'local') {
          const row = store._open().prepare('SELECT content_hash,content_ref FROM conversations WHERE id=?').get(ref.id);
          if (!row) continue;
          const key = `${ref.id}:${row.content_hash}`;
          classified = this.cache.get(key);
          if (!classified) classified = this.remember(key, classifySearchTurns(store.content.iterateTurns(JSON.parse(row.content_ref))));
        } else {
          // Existing Server API has no turn-only endpoint or immutable version
          // token. Deduplicate this page; do not cache stale remote identities.
          const thread = await client.thread(ref);
          signal?.throwIfAborted();
          classified = classifySearchTurns(thread.turns);
        }
        for (const [index, hit] of entries) decisions[index] = searchHitDecision(hit, classified);
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') throw error;
        // Offline/missing/ambiguous source remains in the normal result page.
      }
      await yieldTask();
      signal?.throwIfAborted();
    }
    return { decisions };
  }
}
