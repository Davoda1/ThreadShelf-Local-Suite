import { createHash } from 'node:crypto';

// Comparison deliberately operates on source content, never rendered HTML.
// IDs, export timestamps and container formats are not message contents.
export function stableDedupJSON(value) {
  if (Array.isArray(value)) return `[${value.map(stableDedupJSON).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableDedupJSON(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const hash = value => createHash('sha256').update(stableDedupJSON(value)).digest('hex');
const scalar = value => typeof value === 'string' ? value.trim() : '';
const nonempty = value => typeof value === 'string' ? !!value.trim() : value != null && (Array.isArray(value) ? value.length > 0 : typeof value === 'object' ? Object.keys(value).length > 0 : !!value);
export const dedupProvider = value => /^(?:grok|xai|x\.ai)$/i.test(scalar(value)) ? 'grok' : scalar(value).toLowerCase();
const modelName = value => {
  const name = scalar(value).toLowerCase();
  return !name || /^(?:unknown|default|auto|automatic|none|null|undefined|n\/a|unspecified|[0-9]+)$/.test(name) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(name) ? '' : name;
};
const normalizeRole = value => {
  const aliases = { assistant: 'ai', bot: 'ai', human: 'user', function: 'tool', analysis: 'thinking', reasoning: 'thinking' };
  return Object.hasOwn(aliases, value) ? aliases[value] : value;
};
const contentKeys = new Set(['user', 'ai', 'assistant', 'thinking', 'system', 'tool', 'function', 'text', 'content']);
const bookkeeping = new Set(['turn_index', 'part_index', 'source_message_id', 'parent_message_id', 'id', 'uuid', '_id', 'messageId', 'message_id', 'responseId', 'response_id', 'createdAt', 'created_at', 'create_time', 'timestamp', 'timestamp_ms', 'updatedAt', 'updated_at', 'role', 'source_role', 'model', 'modelName', 'model_name', 'modelId', 'model_id', 'model_slug']);
const richKey = /^(?:attachments?|attachment_?id|files?|file_?id|images?|image_?id|image_url|imageUrl|asset_pointer|asset_?id|audio|video|media|citations?|references?|tool_calls|function_call|reasoningContent|reasoning_content|thinkingContent)$/i;

function contentText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(contentText).filter(Boolean).join('\n\n');
  if (!value || typeof value !== 'object') return '';
  for (const key of ['text', 'content', 'parts', 'message']) if (value[key] != null) return contentText(value[key]);
  return '';
}
function substantiveContent(value) {
  if (typeof value === 'string') return !!value.trim();
  if (Array.isArray(value)) return value.some(substantiveContent);
  if (!value || typeof value !== 'object') return !!value;
  const contents = ['text', 'content', 'parts', 'message'].filter(key => Object.hasOwn(value, key));
  if (contents.length) return contents.some(key => substantiveContent(value[key]));
  return Object.keys(value).some(key => !['type', 'content_type'].includes(key)) || !/^(?:text|input_text|output_text)$/.test(value.type || value.content_type || '');
}
function textOnlyContent(value) {
  if (typeof value === 'string') return true;
  if (Array.isArray(value)) return value.every(textOnlyContent);
  if (!value || typeof value !== 'object') return false;
  const kind = value.type || value.content_type;
  if (kind && !/^(?:text|input_text|output_text)$/i.test(kind)) return false;
  const keys = Object.keys(value).filter(key => !['type', 'content_type'].includes(key));
  return keys.length > 0 && keys.every(key => ['text', 'content', 'parts'].includes(key) && textOnlyContent(value[key]));
}
function messageIdentity(value) {
  let role = value.role ?? value.sender ?? value.author?.role;
  let body = value.content ?? value.text ?? value.parts ?? (typeof value.message === 'string' ? value.message : undefined);
  if (!role) for (const key of ['user', 'ai', 'assistant', 'thinking', 'system', 'tool']) if (value[key] !== undefined) { role = key; body = value[key]; break; }
  if (typeof role !== 'string' || body === undefined) return null;
  role = normalizeRole(role.toLowerCase());
  return { role, body, key: hash([role, contentText(body)]) };
}

function rawSignals(raw) {
  const models = new Set(), names = new Set(), rich = new Set(), richValues = new Map(), messageModels = new Map(), aliases = new Map(), occurrences = new Map();
  let hasResponse = false, hasNonText = false;
  const queue = raw && typeof raw === 'object' ? [{ value: raw, anchor: '' }] : [];
  for (let i = 0; i < queue.length; i++) {
    const { value } = queue[i]; let { anchor } = queue[i];
    const message = messageIdentity(value);
    if (message) {
      const ordinal = occurrences.get(message.key) || 0; occurrences.set(message.key, ordinal + 1);
      anchor = `${message.key}:${ordinal}`;
      if (['ai', 'tool', 'thinking', 'system', 'developer'].includes(message.role) && substantiveContent(message.body)) hasResponse = true;
      if (message.role === 'user' && substantiveContent(message.body) && !textOnlyContent(message.body)) hasNonText = true;
      if (substantiveContent(message.body) && !textOnlyContent(message.body)) {
        const signature = hash([anchor, 'structured-content', message.body]);
        rich.add(signature); richValues.set(signature, { key: 'structured-content', value: message.body });
      }
      const named = modelName(value.modelName || value.model_name || value.metadata?.modelName || value.metadata?.model_name);
      const actual = named || modelName(value.model || value.model_slug || value.metadata?.model_slug);
      if (actual) { if (!messageModels.has(message.key)) messageModels.set(message.key, new Set()); messageModels.get(message.key).add(actual); }
    }
    const name = modelName(value.modelName || value.model_name), id = scalar(value.modelId || value.model_id);
    if (name && id) aliases.set(id.toLowerCase(), aliases.has(id.toLowerCase()) && aliases.get(id.toLowerCase()) !== name ? '' : name);
    for (const [key, child] of Object.entries(value)) {
      if (key === 'deduplicationHistory') continue;
      if (/^(?:modelName|model_name)$/.test(key) && modelName(child)) names.add(modelName(child));
      else if (/^(?:model|model_slug|default_model_slug)$/.test(key) && modelName(child)) models.add(modelName(child));
      if ((richKey.test(key) || /^(?:type|content_type)$/i.test(key) && typeof child === 'string' && /(?:file|image|audio|video|attachment|document|asset)/i.test(child)) && nonempty(child)) {
        const signature = hash([anchor, key.toLowerCase(), child]); rich.add(signature); richValues.set(signature, { key, value: child });
      }
      if (child && typeof child === 'object') queue.push({ value: child, anchor });
    }
  }
  return { models, names, rich, richValues, messageModels, aliases, hasResponse, hasNonText };
}

export function describeDeduplication(document, row = {}) {
  const raw = rawSignals(document.raw), models = new Set(), names = new Set(raw.names);
  for (const value of [document.modelName, document.model_name]) if (modelName(value)) names.add(modelName(value));
  for (const value of [document.model, document.model_slug, document.default_model_slug]) if (modelName(value)) models.add(modelName(value));
  const events = [];
  for (const [index, turn] of (document.turns || []).entries()) {
    if (modelName(turn.modelName || turn.model_name)) names.add(modelName(turn.modelName || turn.model_name));
    if (modelName(turn.model || turn.model_slug)) models.add(modelName(turn.model || turn.model_slug));
    const extra = Object.fromEntries(Object.entries(turn).filter(([key, value]) => !bookkeeping.has(key)
      && (contentKeys.has(key) ? typeof value !== 'string' && substantiveContent(value) : nonempty(value))));
    const parts = [];
    for (const [key, role] of [['user', 'user'], ['thinking', 'thinking'], ['ai', 'ai'], ['assistant', 'ai'], ['system', 'system'], ['tool', 'tool'], ['function', 'tool']]) {
      if (typeof turn[key] !== 'string' || !turn[key].trim()) continue;
      const sourceRole = normalizeRole(String(turn.source_role || '').toLowerCase());
      parts.push({ role: role === 'ai' && ['tool', 'system'].includes(sourceRole) ? sourceRole : role, text: turn[key] });
    }
    if (!parts.length && (typeof turn.text === 'string' || typeof turn.content === 'string')) {
      const text = turn.text ?? turn.content;
      if (text.trim()) parts.push({ role: normalizeRole(String(turn.role || turn.source_role || 'unknown').toLowerCase()), text });
    }
    // A non-text attachment or unknown structured part is substantive, too.
    if (!parts.length && Object.keys(extra).length) parts.push({ role: normalizeRole(String(turn.role || turn.source_role || 'unknown').toLowerCase()), text: '' });
    for (const part of parts) events.push({ ...part, extra, turnIndex: turn.turn_index ?? index,
      namedModel: modelName(turn.modelName || turn.model_name), modelHint: modelName(turn.model || turn.model_slug) });
  }
  // An explicitly named model takes precedence over internal export model IDs.
  const actual = names.size ? names : models.size ? models : raw.models;
  const source = document.raw && typeof document.raw === 'object' ? document.raw : {};
  const sourceConversation = source.conversation || source.thread || {};
  const defaultName = modelName(document.modelName || document.model_name || source.modelName || source.model_name || sourceConversation.modelName || sourceConversation.model_name);
  const defaultModel = defaultName || modelName(document.model || document.model_slug || document.default_model_slug || source.model || source.default_model_slug || sourceConversation.model || sourceConversation.default_model_slug);
  for (const event of events) {
    const originalModels = raw.messageModels.get(hash([event.role, event.text]));
    const original = originalModels?.size === 1 ? [...originalModels][0] : '';
    event.model = event.role === 'ai' || event.role === 'thinking'
      ? event.namedModel || original || raw.aliases.get(event.modelHint) || (defaultName && models.size <= 1 ? defaultName : event.modelHint) || defaultModel
      : '';
    delete event.namedModel; delete event.modelHint;
  }
  const modelsByTurn = new Map();
  for (const event of events) if (event.role === 'ai' && event.model) {
    if (!modelsByTurn.has(event.turnIndex)) modelsByTurn.set(event.turnIndex, new Set());
    modelsByTurn.get(event.turnIndex).add(event.model);
  }
  for (const event of events) {
    if (event.role === 'thinking' && !event.model) {
      const companion = modelsByTurn.get(event.turnIndex);
      if (companion?.size === 1) event.model = [...companion][0];
    }
    event.token = hash({ role: event.role, text: event.text, extra: event.extra, model: event.model });
  }
  const effectiveModels = new Set(events.filter(event => event.model).map(event => event.model));
  const model = [...(effectiveModels.size ? effectiveModels : actual)].sort().join(' / ');
  const uncertainModel = events.some(event => ['ai', 'thinking'].includes(event.role) && !event.model);
  // Rich fields already represented in normalized messages are compared at
  // their exact position. Only unmapped original fields need the stricter
  // whole-source guard, so new *represented* reasoning/attachments can extend
  // an otherwise matching conversation normally.
  const represented = rawSignals(document.turns).rich;
  const thoughts = new Set(events.filter(event => event.role === 'thinking').map(event => event.text));
  for (const [signature, item] of raw.richValues) if (represented.has(signature)
    || /^(?:reasoningContent|reasoning_content|thinkingContent)$/i.test(item.key) && typeof item.value === 'string' && thoughts.has(item.value)) raw.rich.delete(signature);
  const provider = dedupProvider(document.provider), title = scalar(document.title);
  const promptOnly = events.length === 1 && events[0].role === 'user' && !!events[0].text.trim() && !Object.keys(events[0].extra).length && raw.rich.size === 0 && !raw.hasResponse && !raw.hasNonText;
  return { ...row, provider, title, model, events, rich: raw.rich, promptOnly, key: model && title && !uncertainModel ? stableDedupJSON([row.collectionId ?? document.collectionId ?? document.collection, provider, title, model]) : null };
}

const richContained = (shorter, longer) => [...shorter.rich].every(item => longer.rich.has(item));
const sameRawRich = (a, b) => richContained(a, b) && richContained(b, a);
function prefixLength(a, b) {
  let index = 0;
  while (index < Math.min(a.events.length, b.events.length) && a.events[index].token === b.events[index].token) index++;
  return index;
}
function superseded(shorter, answered, common) {
  return shorter.provider === 'grok' && common > 0 && common < shorter.events.length && common < answered.events.length
    && shorter.events.slice(0, common).some(event => event.role === 'ai')
    && shorter.events.slice(common).every(event => event.role === 'user' && !Object.keys(event.extra).length)
    && answered.events[common].role === 'user'
    && answered.events.slice(common + 1).some(event => event.role === 'ai')
    && sameRawRich(shorter, answered);
}

/** Returns the safe loser/winner relationship; null means preserve both. */
export function compareDeduplication(a, b) {
  if (!a.key || a.key !== b.key || !a.events.length || !b.events.length) return null;
  const common = prefixLength(a, b);
  if (common === a.events.length && common === b.events.length && sameRawRich(a, b)) {
    const [keep, remove] = [a, b].sort((x, y) => String(x.importedAt || '').localeCompare(String(y.importedAt || '')) || String(x.id).localeCompare(String(y.id)));
    return { remove, keep, reason: 'identical', common };
  }
  // Raw rich payloads cannot always be assigned to one normalized message.
  // If they differ, retain both instead of guessing where an attachment moved.
  if (a.events.length < b.events.length && common === a.events.length && sameRawRich(a, b)) return { remove: a, keep: b, reason: 'shorter', common };
  if (b.events.length < a.events.length && common === b.events.length && sameRawRich(b, a)) return { remove: b, keep: a, reason: 'shorter', common };
  if (superseded(a, b, common)) return { remove: a, keep: b, reason: 'grok-superseded', common };
  if (superseded(b, a, common)) return { remove: b, keep: a, reason: 'grok-superseded', common };
  return null;
}

/** Preserve removed variants in the retained source export, outside its visible turns. */
export function retainDeduplicationSources(winner, losers) {
  const result = { ...winner }, sources = [], seen = new Set();
  const clean = document => Object.fromEntries(Object.entries(document).filter(([key]) => !['deduplicationHistory', 'id', 'collectionId', 'turnCount', 'importedAt', 'updatedAt'].includes(key)));
  const winnerHash = hash(clean(winner));
  const add = document => {
    if (!document || typeof document !== 'object') return;
    const source = clean(document), key = hash(source);
    if (key !== winnerHash && !seen.has(key)) { seen.add(key); sources.push(source); }
    for (const old of document.deduplicationHistory || []) add(old);
  };
  for (const old of winner.deduplicationHistory || []) add(old);
  for (const loser of losers) add(loser);
  if (sources.length) result.deduplicationHistory = sources;
  return result;
}

export function deduplicationTurnMap(removed, kept) {
  const map = {};
  for (const [index, event] of removed.events.entries()) {
    const target = kept.events[index];
    if (target && event.token === target.token) {
      if (event.turnIndex !== target.turnIndex || event.role !== target.role) map[`${event.turnIndex}:${event.role}`] = { turnIndex: target.turnIndex, role: target.role };
    }
    else {
      // Superseded unanswered prompts remain available in source history. A
      // bookmark is retained with its original excerpt and attached to the
      // corresponding final user prompt, rather than silently discarded.
      const fallback = kept.events.slice(index).find(item => item.role === event.role) || [...kept.events].reverse().find(item => item.role === event.role);
      if (fallback) map[`${event.turnIndex}:${event.role}`] = { turnIndex: fallback.turnIndex, role: fallback.role, sourceExcerpt: event.text.slice(0, 500), sourceFingerprint: event.token, superseded: true };
    }
  }
  return map;
}

export function planDeduplication(descriptions, { deletePromptOnly = false } = {}) {
  const rows = [...descriptions].sort((a, b) => b.events.length - a.events.length || String(a.importedAt || '').localeCompare(String(b.importedAt || '')) || String(a.id).localeCompare(String(b.id)));
  const groups = new Map(), links = new Map(), promptRemovals = [];
  for (const item of rows) {
    // Prompt-only artifacts need no known model, title or partner. Delete them
    // directly so a duplicate cannot point at another soon-to-be-deleted row.
    if (item.promptOnly && (item.provider === 'grok' || deletePromptOnly)) {
      promptRemovals.push({ remove: item, keep: null, reason: item.provider === 'grok' ? 'grok-prompt-only' : 'prompt-only' });
      continue;
    }
    if (!item.key) continue;
    if (!groups.has(item.key)) groups.set(item.key, []);
    const kept = groups.get(item.key);
    let removeItem = false;
    for (let index = 0; index < kept.length;) {
      const match = compareDeduplication(item, kept[index]);
      if (!match) { index++; continue; }
      links.set(match.remove.id, match);
      if (match.remove.id === item.id) { removeItem = true; break; }
      kept.splice(index, 1);
    }
    if (!removeItem) kept.push(item);
  }
  const entries = [];
  for (const [id, first] of links) {
    let keep = first.keep;
    const visited = new Set([id]);
    while (links.has(keep.id)) {
      if (visited.has(keep.id)) throw new Error('Deduplication encountered an inconsistent history. No data was changed.');
      visited.add(keep.id); keep = links.get(keep.id).keep;
    }
    entries.push({ remove: first.remove, keep, reason: first.reason });
  }
  return [...entries, ...promptRemovals];
}
