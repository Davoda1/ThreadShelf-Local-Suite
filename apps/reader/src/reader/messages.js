function indexValue(value, fallback) {
  if (Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))) return Number(value);
  return fallback;
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

export function turnToMessage(turn, index) {
  const role = turn.user !== undefined ? 'user' : turn.thinking !== undefined ? 'thinking'
    : ['system', 'tool'].includes(turn.source_role) ? turn.source_role : 'assistant';
  return { message_id: `turn-${index}-${role}`, turn_index: indexValue(turn.turnIndex, indexValue(turn.turn_index, index)),
    role, content: String(turn.user ?? turn.thinking ?? turn.ai ?? turn.content ?? ''), model: turn.model || '', created_at: turn.createdAt || turn.created_at || '' };
}

