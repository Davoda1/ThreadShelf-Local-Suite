// Local reading identities are independent of collection display names.
// Server identities are deliberately passed through without normalization here.
import { readingSourceFor } from './reading-identity.mjs';
export const localReadingKey = id => JSON.stringify({ mode: 'local', id });
function identity(key, entry) {
  if(readingSourceFor({...entry,key})?.mode!=='local')return null;
  try {
    const parsed = JSON.parse(key);
    if (parsed?.mode === 'local' && typeof parsed.id === 'string' && parsed.id) return parsed.id;
    if (parsed?.mode === 'server') return null;
  } catch { /* Unidentified old entries are preserved, not guessed. */ }
  const refs=[entry?.ref,entry?.position?.ref].filter(ref=>ref?.mode==='local'&&typeof ref.id==='string'&&ref.id);
  return refs.length&&refs.every(ref=>ref.id===refs[0].id)?refs[0].id:null;
}
export function localIdFor(key, entry) { return identity(key, entry); }
function refFor(row, previous = {}) {
  return { ...previous, mode: 'local', serverUrl: '', id: row.id, collection: row.collection,
    sourceFile: row.sourceFile ?? row.source_file ?? '', conversationKey: row.conversationKey ?? row.conversation_key ?? '' };
}
function newest(a, b) { return Number(a?.updatedAt || 0) >= Number(b?.updatedAt || 0) ? a : b; }
export function reconcileLocalReading(value, { removedIds = [], remap = {}, copies = {}, clearLocal = false, copyBookmarks = false } = {}, lookup = () => null) {
  const removed = new Set(removedIds);
  const positions = {}, bookmarks = [], recent = [];
  const transform = (key, entry) => {
    const id = identity(key, entry);
    if (!id) return { key, entry };
    const nextId = remap[id] || id;
    if (clearLocal || (removed.has(id) && !remap[id])) return null;
    const row = lookup(nextId);
    const next = { ...entry };
    if (row) { next.ref = refFor(row, next.ref); if (Object.hasOwn(next, 'title')) next.title = row.title; }
    else if (next.ref) next.ref = { ...next.ref, id: nextId };
    if (next.position) next.position = { ...next.position, ...(row ? { ref: refFor(row, next.position.ref) } : {}) };
    if (Object.hasOwn(next, 'key')) next.key = localReadingKey(nextId);
    return { key: localReadingKey(nextId), entry: next };
  };
  for (const [key, entry] of Object.entries(value.positions)) {
    const next = transform(key, entry);
    if (next) positions[next.key] = positions[next.key] ? newest(positions[next.key], next.entry) : next.entry;
  }
  const bookmarkKeys = new Map();
  const putBookmark = entry => {
    const key = JSON.stringify([entry.key, entry.turnIndex, entry.role]);
    const index = bookmarkKeys.get(key);
    if (index !== undefined) bookmarks[index] = newest(bookmarks[index], entry);
    else { bookmarkKeys.set(key, bookmarks.length); bookmarks.push(entry); }
  };
  for (const entry of value.bookmarks) {
    const next = transform(entry.key, entry);
    if (next) putBookmark({ ...next.entry, key: next.key });
    const oldId = identity(entry.key, entry);
    const targetIds = oldId && copyBookmarks ? (Array.isArray(copies[oldId]) ? copies[oldId] : copies[oldId] ? [copies[oldId]] : []) : [];
    for (const id of targetIds) {
      const row = lookup(id);
      if (row) putBookmark({ ...entry, key: localReadingKey(id), ref: refFor(row, entry.ref), title: row.title });
    }
  }
  const seenRecent = new Set();
  for (const entry of [...value.recent].sort((a, b) => Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0))) {
    const key = typeof entry === 'string' ? entry : entry.key;
    const next = transform(key, typeof entry === 'string' ? value.positions[key] || {} : entry);
    if (next && !seenRecent.has(next.key)) {
      seenRecent.add(next.key);
      recent.push(typeof entry === 'string' ? next.key : { ...next.entry, key: next.key });
    }
  }
  return { ...value, positions, bookmarks, recent };
}
export function replaceLocalReading(current, restored, lookup) {
  const kept = reconcileLocalReading(current, { clearLocal: true }, lookup);
  const imported = reconcileLocalReading(restored || { positions: {}, bookmarks: [], recent: [] }, {}, lookup);
  for (const [key, entry] of Object.entries(imported.positions)) if (identity(key, entry)) kept.positions[key] = entry;
  kept.bookmarks.push(...imported.bookmarks.filter(entry => identity(entry.key, entry)));
  kept.recent.push(...imported.recent.filter(entry => identity(typeof entry === 'string' ? entry : entry.key, entry)));
  return kept;
}
export function localReadingOnly(value) {
  return {
    positions: Object.fromEntries(Object.entries(value.positions).filter(([key, entry]) => identity(key, entry))),
    bookmarks: value.bookmarks.filter(entry => identity(entry.key, entry)),
    recent: value.recent.filter(entry => identity(typeof entry === 'string' ? entry : entry.key, entry)),
  };
}
