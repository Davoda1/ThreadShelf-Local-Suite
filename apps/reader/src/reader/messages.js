function indexValue(value, fallback) {
  if (Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))) return Number(value);
  return fallback;
}

// View-only conversion using the archive's accepted timestamp semantics.
export function timestampMillis(value) {
  if (value === undefined || value === null || value === '') return null;
  let ms;
  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value))) {
    const number = Number(value); ms = Math.trunc(number < 100000000000 ? number * 1000 : number);
  } else ms = Date.parse(value);
  return Number.isFinite(ms) && Math.abs(ms) <= 8640000000000000 ? ms : null;
}

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const thoughtsKeys = new Set(['content_type', 'source_analysis_msg_id', 'thoughts']);
const thoughtKeys = new Set(['chunks', 'content', 'finished', 'summary']);

/**
 * Empty ChatGPT thoughts are export bookkeeping, not a readable response.
 * This is a view-only decision: turns, source indexes, and saved reading data
 * are never changed. Unknown structures remain visible rather than losing text.
 */
export function isHiddenThoughtsMessage(message) {
  if (message?.assets?.length || message?.unavailableAssets) return false;
    if (message?.originalJsonOnly === false) return false;
  if (!['assistant', 'thinking'].includes(message?.role)) return false;
  let content = message.content;
  const serialized = typeof content === 'string';
  if (serialized) {
    // Preserve fenced/indented code and mixed prose. Only parse a complete,
    // bounded JSON envelope, with the source marker used by ChatGPT exports.
    if (content.length > 1024 * 1024 || !content.includes('"content_type"') || !content.includes('"source_analysis_msg_id"')) return false;
    const firstLine = content.match(/^[^\S\r\n]*\S[^\r\n]*/m)?.[0] || '';
    if (/^(?: {4}| {0,3}\t)/.test(firstLine)) return false;
    const text = content.trim();
    if (!text.startsWith('{') || !text.endsWith('}')) return false;
    try { content = JSON.parse(text); } catch { return false; }
  }
  if (!record(content) || content.content_type !== 'thoughts' || !Array.isArray(content.thoughts)) return false;
  if (Object.keys(content).some(key => !thoughtsKeys.has(key))) return false;
  if (serialized && (typeof content.source_analysis_msg_id !== 'string' || !content.source_analysis_msg_id.trim())) return false;
  if (content.source_analysis_msg_id !== undefined && typeof content.source_analysis_msg_id !== 'string') return false;
  return content.thoughts.every(thought => record(thought)
    && Object.keys(thought).every(key => thoughtKeys.has(key))
    && (thought.content == null || typeof thought.content === 'string' && !thought.content.trim())
    && (thought.chunks === undefined || Array.isArray(thought.chunks) && thought.chunks.length === 0)
    && (thought.summary == null || typeof thought.summary === 'string')
    && (thought.finished === undefined || typeof thought.finished === 'boolean'));
}

// This classification uses original source only. Parsed JSON is discarded;
// source strings (including duplicate keys and large integers) are never replaced.
const aiRole = role => ['assistant', 'ai', 'thinking', 'reasoning', 'analysis'].includes(role);
function nonempty(value) { return value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0); }
function hasOtherOutput(value) {
  if (!record(value)) return false;
  return ['attachments', 'attachment', 'images', 'image', 'audio', 'video', 'files', 'assets', 'tool_calls', 'outputs'].some(key => nonempty(value[key]));
}
function sourceText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.every(part => typeof part === 'string') ? value.join('\n\n') : null;
  if (!record(value) || hasOtherOutput(value)) return null;
  if (Array.isArray(value.parts)) {
    if (value.content_type && value.content_type !== 'text') return null;
    if (Object.keys(value).some(key => !['parts', 'content_type'].includes(key))) return null;
    return sourceText(value.parts);
  }
  if ((value.type === 'text' || value.content_type === 'text') && typeof value.text === 'string'
    && Object.keys(value).every(key => ['type', 'content_type', 'text'].includes(key))) return value.text;
  return null;
}
function validJsonObjectSource(source) {
  if (typeof source !== 'string' || source.length > 1024 * 1024) return false;
  const firstLine = source.match(/^[^\S\r\n]*\S[^\r\n]*/m)?.[0] || '';
  if (/^(?: {4}| {0,3}\t)/.test(firstLine)) return false;
  const text = source.trim();
  if (!(text.startsWith('{') && text.endsWith('}') || text.startsWith('[') && text.endsWith(']'))) return false;
  try { const value = JSON.parse(text); return value !== null && typeof value === 'object'; } catch { return false; }
}
export function originalJsonOnly(entry, displayedContent) {
  if (!record(entry) || hasOtherOutput(entry) || hasOtherOutput(entry.metadata)) return false;
  const sourceRole = entry.raw?.message?.author?.role ?? entry.raw?.author?.role ?? entry.source_role ?? entry.author?.role ?? entry.role;
  if (sourceRole && !aiRole(sourceRole)) return false;
  if (['user', 'thinking', 'ai'].filter(key => entry[key] !== undefined && entry[key] !== null).length > 1) return false;
  const raw = record(entry.raw?.message) ? entry.raw.message : record(entry.raw) && Object.hasOwn(entry.raw, 'content') ? entry.raw : entry;
  if (hasOtherOutput(raw) || hasOtherOutput(raw.metadata) || Object.hasOwn(raw, 'parts') && Object.hasOwn(raw, 'content')) return false;
  const content = raw === entry ? entry.content ?? entry.parts ?? entry.ai ?? entry.thinking ?? displayedContent : raw.content;
  const original = sourceText(content);
  if (original !== null) return validJsonObjectSource(original);
  // ChatGPT serializes a complete thoughts envelope as JSON. Only its known
  // data fields qualify; unknown structured output stays visible.
  if (record(content) && content.content_type === 'thoughts' && Array.isArray(content.thoughts)
    && Object.keys(content).every(key => thoughtsKeys.has(key))
    && content.thoughts.every(item => record(item) && Object.keys(item).every(key => thoughtKeys.has(key))
      && (item.content == null || typeof item.content === 'string')
      && (item.summary == null || typeof item.summary === 'string')
      && (item.finished === undefined || typeof item.finished === 'boolean')
      && (item.chunks === undefined || Array.isArray(item.chunks) && item.chunks.every(chunk => typeof chunk === 'string')))) {
    return validJsonObjectSource(displayedContent);
  }
  return false;
}
export function intermediateJsonMessages(messages, enabled = false) {
  const hidden = new Set();
  if (!enabled) return hidden;
  // The adapter supplies selected-branch order. Never sort by timestamps or
  // inspect siblings. Tool/system turns do not terminate an AI response sequence.
  let laterAI = false;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === 'user') { laterAI = false; continue; }
    if (!aiRole(message.role)) continue;
    if (laterAI && (typeof message.originalJsonOnly === 'boolean' ? message.originalJsonOnly : originalJsonOnly(message, message.content))) hidden.add(message);
    laterAI = true;
  }
  return hidden;
}
export function visibleMessages(messages, enabled = false) {
  const hidden = intermediateJsonMessages(messages, enabled);
  return messages.filter(message => !isHiddenThoughtsMessage(message) && !hidden.has(message));
}

export function turnToMessage(turn, index) {
  const role = turn.user !== undefined ? 'user' : turn.thinking !== undefined ? 'thinking'
    : ['system', 'tool'].includes(turn.source_role) ? turn.source_role : 'assistant';
  return { message_id: `turn-${index}-${role}`, turn_index: indexValue(turn.turnIndex, indexValue(turn.turn_index, index)),
    ...(Array.isArray(turn.assets) ? {assets: turn.assets} : {}),
    role, originalJsonOnly: originalJsonOnly(turn, String(turn.user ?? turn.thinking ?? turn.ai ?? turn.content ?? '')), content: String(turn.user ?? turn.thinking ?? turn.ai ?? turn.content ?? ''), model: turn.model || '', created_at: turn.createdAt ?? turn.created_at ?? '' };
}

