/** Metadata-only normalization for Activity. Original exports are never changed.
 * A normalized stored turn is not claimed to be an original provider message. */
import { sourceTimestamp, conversationCreatedAt, conversationUpdatedAt } from './conversation-date.mjs';
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const roles = new Set(['user', 'assistant', 'system', 'tool', 'developer', 'thinking']);
export const activityTimestamp = sourceTimestamp;
const messageTime = message => {
  for (const key of ['create_time', 'created_at', 'createdAt', 'timestamp', 'create_time_iso', 'createdAtUnixTimestamp']) {
    const time = activityTimestamp(message?.[key]); if (time !== null) return time;
  }
  if (message?.timestamp_ms != null) return activityTimestamp({ $date: message.timestamp_ms });
  return null;
};
export function activityDay(time, zone = 'utc') {
  if (time === null || !Number.isFinite(time)) return null;
  const date = new Date(time);
  return zone === 'utc' ? date.toISOString().slice(0, 10) : [String(date.getFullYear()).padStart(4, '0'), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
const roleOf = value => { const role = String(value || 'unknown').toLowerCase(); return role === 'ai' ? 'assistant' : role === 'function' ? 'tool' : roles.has(role) ? role : 'unknown'; };

export function normalizeActivity(document) {
  const raw = object(document.raw) ? document.raw : null;
  // Only the retained original ChatGPT export supports authoritative all-branch
  // counts. A server-import wrapper contains a normalized thread, not the source.
  if (raw && object(raw.mapping)) return originalActivity(raw, document);
  const messages = (Array.isArray(document.turns) ? document.turns : []).map(turn => {
    const keys = ['user', 'ai', 'thinking', 'assistant', 'system', 'tool', 'function'].filter(key => typeof turn[key] === 'string');
    return { role: roleOf(turn.source_role || (keys.length === 1 ? keys[0] : turn.role)), time: messageTime(turn), model: String(turn.model || 'unknown'), active: true };
  });
  // Server copies retain dated turns but often omit original conversation
  // creation. Use their earliest dated turn as an explicitly marked Activity
  // estimate; source/search dates and the archive document remain untouched.
  let created = conversationCreatedAt(document), createdEstimated = false;
  if (created === null) {
    for (const message of messages) if (message.time !== null && (created === null || message.time < created)) created = message.time;
    createdEstimated = created !== null;
  }
  return { coverage: 'normalized', created, createdEstimated, updated: conversationUpdatedAt(document), messages, branchFallback: false, cycle: false, duplicateMessages: 0, branchPoints: 0 };
}

function originalActivity(raw, document) {
  const nodes = new Map(Object.entries(raw.mapping).filter(([, node]) => object(node)));
  const messages = [], byNode = new Map(), byMessage = new Map();
  let duplicateMessages = 0;
  for (const [nodeId, node] of nodes) {
    const message = node.message; if (!object(message)) continue;
    const id = typeof message.id === 'string' ? message.id : '';
    if (id && byMessage.has(id)) { duplicateMessages++; byNode.set(nodeId, byMessage.get(id)); continue; }
    const role = String(message.author?.role || message.role || (typeof message.author === 'string' ? message.author : 'unknown')).toLowerCase();
    const entry = { role: ['user', 'assistant', 'system', 'tool', 'developer'].includes(role) ? role : 'unknown', time: messageTime(message), model: String(message.metadata?.model_slug || message.model || raw.default_model_slug || 'unknown'), active: false };
    messages.push(entry); byNode.set(nodeId, entry); if (id) byMessage.set(id, entry);
  }
  let current = raw.current_node, branchFallback = false, cycle = false;
  if (typeof current !== 'string' || !nodes.has(current)) {
    branchFallback = true;
    const parents = new Set([...nodes.values()].map(node => node.parent).filter(value => typeof value === 'string'));
    let best;
    for (const [id, node] of nodes) { if (parents.has(id)) continue; const time = messageTime(node.message) ?? -Infinity; if (!best || time > best.time) best = { id, time }; }
    current = best?.id || [...nodes.keys()].at(-1);
  }
  const seen = new Set();
  while (typeof current === 'string' && nodes.has(current)) {
    if (seen.has(current)) { cycle = true; break; }
    seen.add(current); const message = byNode.get(current); if (message) message.active = true; current = nodes.get(current).parent;
  }
  return { coverage: 'original', created: conversationCreatedAt(document), createdEstimated: false, updated: conversationUpdatedAt(document), messages, branchFallback, cycle, duplicateMessages, branchPoints: [...nodes.values()].filter(node => Array.isArray(node.children) && node.children.length > 1).length };
}
