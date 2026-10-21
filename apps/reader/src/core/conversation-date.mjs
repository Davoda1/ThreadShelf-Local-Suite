/** Source dates shared by rebuildable Activity and search metadata. Never pass
 * archive catalog rows here: their created_at is the import time, not creation. */
const object = value => value && typeof value === 'object' && !Array.isArray(value);

export function sourceTimestamp(value) {
  let milliseconds = false;
  // Grok exports use MongoDB extended JSON. Numeric $date is explicitly ms,
  // including epochs small enough that the normal seconds heuristic is wrong.
  if (object(value) && Object.hasOwn(value, '$date')) {
    value = value.$date; milliseconds = true;
    if (object(value) && Object.hasOwn(value, '$numberLong')) value = value.$numberLong;
  }
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  let result;
  if (typeof value === 'number' || typeof value === 'string' && /^[+-]?\d+(\.\d+)?$/.test(value.trim())) {
    result = Number(value); if (!milliseconds && Math.abs(result) < 1e11) result *= 1000;
  } else if (typeof value === 'string') {
    const text = value.trim();
    const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(text);
    if (!match || Number(match[2] || 0) > 23 || Number(match[3] || 0) > 59 || Number(match[4] || 0) > 59) return null;
    const date = new Date(match[1] + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== match[1]) return null;
    result = Date.parse(text.length === 10 ? text + 'T00:00:00Z' : /(?:Z|[+-]\d{2}:?\d{2})$/.test(text) ? text : text.replace(' ', 'T') + 'Z');
  } else return null;
  return Number.isFinite(result) && result >= -62135596800000 && result <= 253402300799999 ? Math.trunc(result) : null;
}

const creationKeys = ['create_time', 'created_at', 'createdAt', 'threadCreatedAt', 'createTime', 'create_time_iso', 'createdAtUnixTimestamp', 'created', 'creation_time', 'creationTime', 'createdTime', 'dateCreated', 'date_created', 'date'];
const updateKeys = ['update_time', 'updated_at', 'updatedAt', 'update_time_iso', 'modified_at', 'modifiedAt'];

function sourceDate(document, keys) {
  const seen = new Set();
  function visit(record, depth = 0) {
    if (!object(record) || depth > 8 || seen.has(record)) return null;
    seen.add(record);
    // These are retained source/provenance wrappers, not an unrestricted tree
    // search: message dates, import summaries and exportedAt are not creation.
    for (const key of ['raw', 'thread', 'conversation', 'venice_metadata']) {
      const found = visit(record[key], depth + 1); if (found !== null) return found;
    }
    for (const key of keys) {
      // The archive overlays updatedAt onto a returned document. It is an
      // import/update time, so only nested original sources may provide it.
      if (depth === 0 && key === 'updatedAt') continue;
      const found = sourceTimestamp(record[key]); if (found !== null) return found;
    }
    return null;
  }
  return visit(document);
}

/** Unix milliseconds, or null when the original conversation has no valid date.
 * Invalid aliases do not shadow a valid alternative. Never infer from messages. */
export const conversationCreatedAt = document => sourceDate(document, creationKeys);
export const conversationUpdatedAt = document => sourceDate(document, updateKeys);
export function conversationCreatedDate(document) {
  const time = conversationCreatedAt(document); return time === null ? null : new Date(time);
}
