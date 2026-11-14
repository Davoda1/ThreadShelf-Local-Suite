import { isHiddenThoughtsMessage, turnToMessage } from '../reader/messages.js';

const normalizedRole = role => role === 'ai' ? 'assistant' : role;
export const canContainHiddenThoughts = item => !item?.role || ['assistant', 'ai', 'thinking'].includes(item.role);
export const isChatGPTSummary = item => /^(?:openai|chatgpt)$/i.test(String(item?.provider || item?.collection || ''));
export function summarizeVisibleTurns(thread) {
  if (!thread || !Array.isArray(thread.turns)) throw new TypeError('A complete thread is required for view metadata.');
  const hidden = new Set(), visible = new Set();
  let count = 0;
  for (const [index, turn] of (thread.turns || []).entries()) {
    const message = turnToMessage(turn, index), key = `${message.turn_index}:${message.role}`;
    if (isHiddenThoughtsMessage(message)) hidden.add(key);
    else { visible.add(key); count++; }
  }
  return { count, hidden, visible };
}
export function isHiddenViewEntry(item, summary) {
  if (!canContainHiddenThoughts(item)) return false;
  const index = Number(item?.turnIndex ?? item?.turn_index);
  if (summary && Number.isSafeInteger(index) && index >= 0) {
    const role = normalizedRole(item.role);
    if (role) return summary.hidden.has(`${index}:${role}`);
    const prefix = `${index}:`;
    return [...summary.hidden].some(key => key.startsWith(prefix)) && ![...summary.visible].some(key => key.startsWith(prefix));
  }
  return isHiddenThoughtsMessage({role: normalizedRole(item?.role) || 'assistant', content: item?.text || ''});
}
export function visibleSnippet(item, summary) {
  if (isHiddenViewEntry(item, summary)) return '';
  // A failed/offline source may leave only a truncated JSON search excerpt.
  // Do not expose its bookkeeping until the original turn can be classified.
  const text = String(item?.text || '');
  if (!summary && canContainHiddenThoughts(item) && /["']content_type["']\s*:\s*["']thoughts["']/.test(text)) return '';
  return text;
}

// Compact view metadata only: no message bodies, persisted state or index writes.
// A shared bounded queue prevents search pages/bookmarks from flooding a server.
export function createThoughtsViewCache(loadThread, { concurrency = 4, maxEntries = 256 } = {}) {
  const entries = new Map(), pending = new Map(), queue = [];
  let active = 0, epoch = 0;
  function remember(key, thread) {
    const value = summarizeVisibleTurns(thread); entries.delete(key); entries.set(key, value);
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    return value;
  }
  function pump() {
    while (active < concurrency && queue.length) {
      const job = queue.shift();
      if (job.epoch !== epoch) { job.resolve(null); continue; }
      active++;
      Promise.resolve().then(() => loadThread(job.ref)).then(thread => {
        job.resolve(job.epoch === epoch ? remember(job.key, thread) : null);
      }).catch(() => job.resolve(null)).finally(() => {
        if (pending.get(job.key) === job.promise) pending.delete(job.key);
        active--; pump();
      });
    }
  }
  return {
    get: key => entries.get(key), remember,
    clear() { epoch++; entries.clear(); pending.clear(); while (queue.length) queue.shift().resolve(null); },
    resolve(key, ref) {
      if (entries.has(key)) return Promise.resolve(entries.get(key));
      if (pending.has(key)) return pending.get(key);
      let resolve; const promise = new Promise(done => { resolve = done; });
      pending.set(key, promise); queue.push({key, ref, epoch, resolve, promise}); pump(); return promise;
    },
  };
}

// Decisions belong to the returned search rows, not to a library-wide view.
// Both flags are independent of the preference so toggling never reads sources
// or repeats a query. Weak keys let discarded pages release their metadata.
export function createSearchPageVisibility(loadDecisions) {
  const decisions = new WeakMap(), pending = new WeakMap();
  const hasSource = item => item && (Object.hasOwn(item, 'sourceTurnPosition') || item.turnIndex != null || item.turn_index != null);
  const unknown = Object.freeze({classified:false, emptyHidden:false, intermediateHidden:false});
  return {
    async prepare(items, context = {}) {
      const fresh = items.filter(item => hasSource(item) && !decisions.has(item) && !pending.has(item));
      for (let offset = 0; offset < fresh.length; offset += 500) {
        const batch = fresh.slice(offset, offset + 500);
        const task = Promise.resolve().then(() => loadDecisions(batch, context)).then(result => {
          const values = result?.decisions;
          for (let index = 0; index < batch.length; index++) {
            const value = values?.[index];
            decisions.set(batch[index], value?.classified === true ? {
              classified:true, emptyHidden:value.emptyHidden === true, intermediateHidden:value.intermediateHidden === true,
              ...(Number.isSafeInteger(value.turnIndex) && value.turnIndex >= 0 ? {turnIndex:value.turnIndex} : {}),
            } : unknown);
          }
        }, () => { for (const item of batch) decisions.set(item, unknown); }).finally(() => {
          for (const item of batch) pending.delete(item);
        });
        for (const item of batch) pending.set(item, task);
        await task;
      }
      await Promise.all(items.map(item => pending.get(item)).filter(Boolean));
    },
    entry(item, enabled = false) {
      const decision = decisions.get(item);
      if (decision?.classified && (decision.emptyHidden || enabled && decision.intermediateHidden)) return null;
      // Unavailable/ambiguous originals remain visible. An excerpt alone cannot
      // establish whether the complete original message is JSON-only.
      return decision?.classified && decision.turnIndex !== undefined ? {...item,turnIndex:decision.turnIndex} : item;
    },
  };
}

// A cold remote result may be opened before its page decision arrives. Resolve
// its positional namespace against the thread that was just opened, never by
// treating the position as a retained source index.
export function openedSearchTarget(item, thread) {
  if (!item) return undefined;
  if (!Object.hasOwn(item, 'sourceTurnPosition')) return item.turnIndex != null ? {turnIndex:item.turnIndex,role:item.role} : undefined;
  const position = item.sourceTurnPosition;
  if (!Number.isSafeInteger(position) || position < 0 || !thread?.turns?.[position]) return undefined;
  const message = turnToMessage(thread.turns[position], position);
  const role = item.role === 'ai' ? 'assistant' : item.role;
  if (role && role !== message.role) return undefined;
  return {turnIndex:message.turn_index,role:message.role};
}
