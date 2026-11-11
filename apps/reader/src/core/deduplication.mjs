import { createHash } from 'node:crypto';
import { canonicalProvider, reliableConversationIdentity } from './conversation-identity.mjs';

// Comparison deliberately operates on source content, never rendered HTML.
// Reliable provider IDs establish identity; source content resolves versions.
export function stableDedupJSON(value) {
  if (Array.isArray(value)) return `[${value.map(stableDedupJSON).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableDedupJSON(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const hash = value => createHash('sha256').update(stableDedupJSON(value)).digest('hex');
const scalar = value => typeof value === 'string' ? value.trim() : '';
const nonempty = value => typeof value === 'string' ? !!value.trim() : value != null && (Array.isArray(value) ? value.length > 0 : typeof value === 'object' ? Object.keys(value).length > 0 : !!value);
export const dedupProvider = canonicalProvider;
const modelName = value => {
  const name = scalar(value).toLowerCase();
  return !name || /^(?:unknown|default|auto|automatic|none|null|undefined|n\/a|unspecified|[0-9]+)$/.test(name) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(name) ? '' : name;
};
const normalizeRole = value => {
  const aliases = { assistant: 'ai', bot: 'ai', human: 'user', function: 'tool', analysis: 'thinking', reasoning: 'thinking' };
  return Object.hasOwn(aliases, value) ? aliases[value] : value;
};
const contentKeys = new Set(['user', 'ai', 'assistant', 'thinking', 'system', 'tool', 'function', 'text', 'content']);
const bookkeeping = new Set(['turn_index', 'part_index', 'source_message_id', 'source_node_id', 'parent_message_id', 'parentMessageId', 'id', 'uuid', '_id', 'messageId', 'message_id', 'responseId', 'response_id', 'createdAt', 'created_at', 'createdAtUnixTimestamp', 'create_time', 'timestamp', 'timestamp_ms', 'updatedAt', 'updated_at', 'role', 'source_role', 'sender', 'index', 'model', 'modelName', 'model_name', 'modelId', 'model_id', 'model_slug']);
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
        rich.add(signature); richValues.set(signature, { key: 'structured-content', value: message.body, anchor });
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
        const signature = hash([anchor, key.toLowerCase(), child]); rich.add(signature); richValues.set(signature, { key, value: child, anchor });
      }
      if (child && typeof child === 'object') queue.push({ value: child, anchor });
    }
  }
  return { models, names, rich, richValues, messageModels, aliases, hasResponse, hasNonText };
}

// Grok server copies retain each original response in turn.raw. That is source
// provenance, not an extra response, but only when its contents prove that it is
// the same user text. Unknown metadata and actual rich/response data stay safe.
const grokSourceFields = new Set([...bookkeeping, 'conversation_id', 'conversationId', 'parent_response_id',
  'parentResponseId', 'request_id', 'requestId', 'modify_time', 'source', 'channel']);
const messageBodyFields = new Set(['user', 'ai', 'assistant', 'thinking', 'system', 'tool', 'function', 'content', 'text', 'parts', 'message']);
const grokContentField = /^(?:agent_thinking_traces|thinking|reasoning|analysis|thinking_trace|reasoning_trace|tool_results?|tool_outputs?|tool_?calls?|function_?calls?|asset_ids?|root_asset_id|media_types|file_attachments?|image_attachments?|generated_images?|generated_videos?|audio|video)$/i;
const plainObject = value => value && typeof value === 'object' && !Array.isArray(value);
const scalarMetadata = value => value == null || ['string', 'number', 'boolean'].includes(typeof value);
function sourceScalar(value, depth = 0) {
  return scalarMetadata(value) || depth < 3 && plainObject(value)
    && Object.entries(value).every(([key, child]) => ['$date', '$numberLong', '$oid'].includes(key) && sourceScalar(child, depth + 1));
}
function grokDiagnosticMetadata(value) {
  if (!nonempty(value)) return true;
  if (!plainObject(value)) return false;
  return Object.entries(value).every(([key, child]) => {
    if (!nonempty(child)) return true;
    if (key === 'request_metadata') return plainObject(child) && Object.entries(child).every(([name, item]) =>
      ['model', 'resolved_model', 'source', 'effort'].includes(name) && scalarMetadata(item));
    if (key === 'stream_errors') return Array.isArray(child) && child.every(error => plainObject(error)
      && Object.entries(error).every(([name, item]) => ['message', 'severity', 'code'].includes(name) ? scalarMetadata(item)
        : name === 'usageLimitReached' && plainObject(item) && !Object.keys(item).length));
    return false;
  });
}
function sourceMessage(value) {
  let role = value.role ?? value.sender ?? value.author?.role ?? value.source_role;
  let body = value.content ?? value.text ?? value.parts ?? value.message;
  if (body === undefined) for (const key of ['user', 'ai', 'assistant', 'thinking', 'system', 'tool', 'function']) {
    if (value[key] !== undefined && (!role || normalizeRole(String(role).toLowerCase()) === normalizeRole(key))) { role ||= key; body = value[key]; break; }
  }
  return typeof role === 'string' ? { role: normalizeRole(role.toLowerCase()), body } : null;
}
function grokEmptyText(value) {
  if (value == null) return true;
  if (typeof value === 'string') return !value.trim();
  if (Array.isArray(value)) return value.every(grokEmptyText);
  if (!plainObject(value)) return false;
  return Object.entries(value).every(([key, child]) => ['type', 'content_type'].includes(key)
    ? ['text', 'input_text', 'output_text'].includes(child)
    : ['text', 'content', 'parts', 'message'].includes(key) && grokEmptyText(child));
}
function sourceReferences(value) {
  return Array.isArray(value) && value.every(item => scalarMetadata(item) || plainObject(item)
    && Object.entries(item).every(([key, child]) => ['id', '_id', 'response_id', 'responseId'].includes(key) && scalarMetadata(child)));
}
function grokEmptyOrPromptMessage(value, prompt, depth = 0) {
  if (depth > 24 || !plainObject(value)) return false;
  const message = sourceMessage(value);
  if (!message || !['user', 'ai', 'tool', 'thinking', 'system', 'developer'].includes(message.role)) return false;
  if (!grokEmptyText(message.body) && (message.role !== 'user' || !textOnlyContent(message.body) || contentText(message.body) !== prompt)) return false;
  for (const [key, child] of Object.entries(value)) {
    if (!nonempty(child)) continue;
    if (messageBodyFields.has(key)) {
      if (!grokEmptyText(child) && (message.role !== 'user' || !textOnlyContent(child) || contentText(child) !== prompt
        || ['ai', 'assistant', 'thinking', 'system', 'tool', 'function'].includes(key))) return false;
    } else if (key === 'metadata') { if (!grokDiagnosticMetadata(child)) return false; }
    else if (key === 'raw') { if (!grokDuplicateUserSource(child, prompt, depth + 1)) return false; }
    else if (key === 'children' || key === 'path') { if (!sourceReferences(child)) return false; }
    else if (key === 'author') {
      if (!plainObject(child) || Object.entries(child).some(([name, item]) => !['role', 'name', 'id'].includes(name) || !scalarMetadata(item))) return false;
    } else if (!grokSourceFields.has(key) || !sourceScalar(child)) return false;
  }
  return true;
}
function grokDuplicateUserSource(value, prompt, depth = 0) {
  if (typeof value === 'string') return value === prompt;
  if (!plainObject(value) || depth > 24) return false;
  if (plainObject(value.response) && Object.keys(value).every(key => key === 'response' || key === 'share_link' && scalarMetadata(value[key]))) value = value.response;
  const message = sourceMessage(value);
  return message?.role === 'user' && textOnlyContent(message.body) && contentText(message.body) === prompt
    && grokEmptyOrPromptMessage(value, prompt, depth + 1);
}
function grokPromptExtras(extra, prompt) {
  return Object.entries(extra).every(([key, value]) => key === 'raw' ? grokDuplicateUserSource(value, prompt)
    : key === 'metadata' && grokDiagnosticMetadata(value));
}
function grokSourceHasSubstance(roots, prompt) {
  const pending = roots.filter(value => value && typeof value === 'object'), seen = new WeakSet(), userIds = new Set();
  while (pending.length) {
    const value = pending.pop();
    if (seen.has(value)) continue;
    seen.add(value);
    const message = !Array.isArray(value) && sourceMessage(value);
    if (message) {
      if (!grokEmptyOrPromptMessage(value, prompt)) return true;
      if (message.role === 'user' && substantiveContent(message.body)) {
        const id = value.source_message_id ?? value.response_id ?? value.responseId ?? value._id ?? value.id ?? value.message_id ?? value.messageId;
        if (id != null && String(id)) userIds.add(String(id));
        if (userIds.size > 1) return true;
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'deduplicationHistory') continue;
      if ((richKey.test(key) || grokContentField.test(key)) && nonempty(child)) return true;
      if (child && typeof child === 'object') pending.push(child);
    }
  }
  return false;
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
    event.contentToken = hash({ role: event.role, text: event.text, extra: event.extra });
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
  // Associate raw-only rich data with its readable message. Transport wrappers
  // can repeat a message, so use its unique normalized position rather than the
  // raw traversal ordinal. Repeated/unknown messages remain conservatively
  // unassigned instead of guessing which attachment belongs to which turn.
  const positions = new Map(), richByEvent = new Map(), unmappedRich = new Set();
  for (const [index, event] of events.entries()) {
    const key = hash([event.role, event.text]);
    if (!positions.has(key)) positions.set(key, []);
    positions.get(key).push(index);
  }
  for (const signature of raw.rich) {
    const item = raw.richValues.get(signature), matches = positions.get(item.anchor.slice(0, 64));
    const value = hash([item.key.toLowerCase(), item.value]);
    if (matches?.length === 1) {
      const index = matches[0];
      if (!richByEvent.has(index)) richByEvent.set(index, new Set());
      richByEvent.get(index).add(value);
    } else unmappedRich.add(value);
  }
  const provider = dedupProvider(document.provider), title = scalar(document.title);
  const loneUser = events.length === 1 && events[0].role === 'user' && !!events[0].text.trim();
  const promptOnly = loneUser && raw.rich.size === 0 && !raw.hasResponse && !raw.hasNonText
    && (provider === 'grok' ? grokPromptExtras(events[0].extra, events[0].text)
      && !grokSourceHasSubstance([document.raw, document.turns], events[0].text) : !Object.keys(events[0].extra).length);
  const collectionKey = row.collectionId ?? document.collectionId ?? document.collection ?? '';
  return { ...row, provider, title, model, events, rich: raw.rich, richByEvent, unmappedRich, promptOnly, collectionKey,
    identity: reliableConversationIdentity(document),
    updatedAt: row.updatedAt || row.importedAt || document.updatedAt || document.importedAt || '',
    key: model && title && !uncertainModel ? stableDedupJSON([collectionKey, provider, title, model]) : null };
}

const richContained = (shorter, longer) => [...shorter.rich].every(item => longer.rich.has(item));
const sameRawRich = (a, b) => richContained(a, b) && richContained(b, a);
const setContained = (a, b) => [...a].every(value => b.has(value));
const sameSet = (a, b) => a.size === b.size && setContained(a, b);
const emptySet = new Set();
function reliableRichPrefix(shorter, longer) {
  if (!shorter.richByEvent || !longer.richByEvent) return sameRawRich(shorter, longer);
  // The shared portion includes its rich data. Additional media/reasoning on
  // later messages is a valid extension and must not cause history truncation.
  for (let index = 0; index < shorter.events.length; index++) {
    if (!sameSet(shorter.richByEvent.get(index) || emptySet, longer.richByEvent.get(index) || emptySet)) return false;
  }
  // Unassignable source fields may make the fuller snapshot richer. Accept that
  // extension only when it retains all such data from the shorter snapshot.
  const a = shorter.unmappedRich || emptySet, b = longer.unmappedRich || emptySet;
  return shorter.events.length < longer.events.length ? setContained(a, b) : sameSet(a, b);
}
function prefixLength(a, b, contentOnly = false) {
  let index = 0;
  const token = event => contentOnly ? event.contentToken || event.token : event.token;
  while (index < Math.min(a.events.length, b.events.length) && token(a.events[index]) === token(b.events[index])) index++;
  return index;
}
const newestFirst = (a, b) => String(b.updatedAt || b.importedAt || '').localeCompare(String(a.updatedAt || a.importedAt || ''))
  || String(b.importedAt || '').localeCompare(String(a.importedAt || '')) || String(a.id).localeCompare(String(b.id));
const sameIdentity = (a, b) => !!a.identity && a.identity === b.identity;
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
  if (a.provider !== b.provider || a.collectionKey !== b.collectionKey) return null;
  if (sameIdentity(a, b)) {
    const common = prefixLength(a, b, true);
    if (a.events.length < b.events.length && common === a.events.length && reliableRichPrefix(a, b)) return { remove: a, keep: b, reason: 'shorter', common };
    if (b.events.length < a.events.length && common === b.events.length && reliableRichPrefix(b, a)) return { remove: b, keep: a, reason: 'shorter', common };
    const [keep, remove] = [a, b].sort(newestFirst);
    return { remove, keep, reason: common === a.events.length && common === b.events.length && sameRawRich(a, b) ? 'identical' : 'same-id', common };
  }
  // Only Venice's unreliable IDs and the established Grok export-artifact
  // rules use cross-ID content matching. Other providers retain distinct IDs.
  if (!['venice', 'grok'].includes(a.provider)) return null;
  if (!a.key || a.key !== b.key || !a.events.length || !b.events.length) return null;
  const common = prefixLength(a, b);
  if (a.provider === 'grok' && !a.events.slice(0, common).some(event => event.role === 'ai')) return null;
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

const sourceWrapperKeys = ['raw', 'thread', 'conversation'];
const sourceObject = value => value && typeof value === 'object' && !Array.isArray(value);
function conversationShape(value) {
  return sourceObject(value) && (['turns', 'messages', 'chat_messages', 'responses'].some(key => Array.isArray(value[key]))
    || sourceObject(value.mapping));
}
function conversationSource(value) {
  return conversationShape(value) || sourceObject(value)
    && ['thread', 'conversation'].some(key => conversationShape(value[key]));
}
function sourceChildren(value) {
  return sourceWrapperKeys.filter(key => conversationSource(value[key]));
}

/** Only application conversation/source wrappers carry internal archive history.
 * Message text, structured message bodies, attachments and arbitrary dictionaries
 * may legitimately contain the same property name and are never traversed. */
export function hasDeduplicationHistory(document) {
  if (!sourceObject(document)) return false;
  const pending = [document], seen = new WeakSet();
  while (pending.length) {
    const value = pending.pop();
    if (seen.has(value)) continue;
    seen.add(value);
    if (Object.hasOwn(value, 'deduplicationHistory')) return true;
    for (const key of sourceChildren(value)) pending.push(value[key]);
  }
  return false;
}

/** Keep the surviving source without hidden copies, including a previous
 * normalized export nested by reimport or a server's raw.thread envelope. */
export function stripDeduplicationHistory(document) {
  if (!sourceObject(document)) return document;
  const visited = new WeakMap();
  const strip = value => {
    if (visited.has(value)) return visited.get(value);
    let result = value;
    if (Object.hasOwn(value, 'deduplicationHistory')) {
      result = { ...value }; delete result.deduplicationHistory;
    }
    visited.set(value, result);
    for (const key of sourceChildren(value)) {
      const child = strip(value[key]);
      if (child === value[key]) continue;
      if (result === value) result = { ...value };
      result[key] = child; visited.set(value, result);
    }
    return result;
  };
  return strip(document);
}
// Compatibility for existing archive callers; loser contents are not retained.
export function retainDeduplicationSources(winner, _losers) { return stripDeduplicationHistory(winner); }

export function deduplicationTurnMap(removed, kept) {
  const map = {}, token = event => sameIdentity(removed, kept) ? event.contentToken || event.token : event.token;
  for (const [index, event] of removed.events.entries()) {
    const target = kept.events[index];
    if (target && token(event) === token(target)) {
      if (event.turnIndex !== target.turnIndex || event.role !== target.role) map[`${event.turnIndex}:${event.role}`] = { turnIndex: target.turnIndex, role: target.role };
    }
    else {
      // A bookmark retains only its bounded original excerpt and attaches to the
      // corresponding final user prompt, rather than silently discarded.
      const fallback = kept.events.slice(index).find(item => item.role === event.role) || [...kept.events].reverse().find(item => item.role === event.role);
      if (fallback) map[`${event.turnIndex}:${event.role}`] = { turnIndex: fallback.turnIndex, role: fallback.role, sourceExcerpt: event.text.slice(0, 500), sourceFingerprint: event.token, superseded: true };
    }
  }
  return map;
}

export function planDeduplication(descriptions, { deletePromptOnly = false } = {}) {
  const rows = [...descriptions].sort((a, b) => b.events.length - a.events.length || String(a.importedAt || '').localeCompare(String(b.importedAt || '')) || String(a.id).localeCompare(String(b.id)));
  const groups = new Map(), identityGroups = new Map(), links = new Map(), promptRemovals = [], contentRows = [];
  for (const item of rows) {
    // Prompt-only artifacts need no known model, title or partner. Delete them
    // directly so a duplicate cannot point at another soon-to-be-deleted row.
    if (item.promptOnly && (item.provider === 'grok' || deletePromptOnly)) {
      promptRemovals.push({ remove: item, keep: null, reason: item.provider === 'grok' ? 'grok-prompt-only' : 'prompt-only' });
      continue;
    }
    if (item.identity) {
      const key = stableDedupJSON([item.collectionKey, item.identity]);
      if (!identityGroups.has(key)) identityGroups.set(key, []);
      identityGroups.get(key).push(item);
    } else contentRows.push(item);
  }
  for (const group of identityGroups.values()) {
    // Start with the newest snapshot. An older exact extension may supply more
    // history, but an older divergent branch must not displace the latest one.
    const newest = [...group].sort(newestFirst)[0];
    const extensions = group.filter(item => item.events.length >= newest.events.length
      && prefixLength(newest, item, true) === newest.events.length && reliableRichPrefix(newest, item));
    const keep = extensions.sort((a, b) => b.events.length - a.events.length || newestFirst(a, b))[0] || newest;
    for (const item of group) if (item.id !== keep.id) {
      const match = compareDeduplication(item, keep);
      links.set(item.id, { ...match, remove: item, keep });
    }
    contentRows.push(keep);
  }
  for (const item of contentRows) {
    if (!['venice', 'grok'].includes(item.provider)) continue;
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
