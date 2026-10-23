/* View-only filtering adapted from ThreadShelf Local Reader.
 * Source content, source indexes, copying and export are never rewritten. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TSAVisibility = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const thoughtsKeys = new Set(['content_type', 'source_analysis_msg_id', 'thoughts']);
  const thoughtKeys = new Set(['chunks', 'content', 'finished', 'summary']);
  // Alternative calls its rendered thinking role "reasoning".
  const normalizedRole = role => role === 'ai' ? 'assistant' : ['reasoning', 'analysis'].includes(role) ? 'thinking' : role;

  function isHiddenThoughtsMessage(message) {
    if (!['assistant', 'thinking'].includes(normalizedRole(message?.role))) return false;
    let content = message.content;
    const serialized = typeof content === 'string';
    if (serialized) {
      // Only recognize a complete, bounded export envelope. Code examples,
      // unknown structures and mixed prose remain available to the reader.
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

  function summarizeMessages(messages) {
    if (!Array.isArray(messages)) throw new TypeError('Normalized messages are required.');
    const hidden = new Set(), visible = new Set();
    let count = 0;
    for (const message of messages) {
      const index = message.turnIndex ?? message.turn_index;
      const key = `${index}:${normalizedRole(message.role)}`;
      if (isHiddenThoughtsMessage(message)) hidden.add(key);
      else { visible.add(key); count++; }
    }
    return {count, hidden, visible};
  }

  function isHiddenViewEntry(item, summary) {
    const role = normalizedRole(item?.role);
    if (role && !['assistant', 'thinking'].includes(role)) return false;
    const indexValue = item?.turnIndex ?? item?.turn_index;
    const index = indexValue === null || indexValue === '' ? NaN : Number(indexValue);
    if (summary && Number.isSafeInteger(index) && index >= 0) {
      if (role) {
        const key = `${index}:${role}`;
        if (summary.visible.has(key)) return false;
        if (summary.hidden.has(key)) return true;
      } else {
        const prefix = `${index}:`;
        if ([...summary.visible].some(key => key.startsWith(prefix))) return false;
        if ([...summary.hidden].some(key => key.startsWith(prefix))) return true;
      }
    }
    // Server search hits already contain their source text. Never use only a
    // substring marker to remove a result or assume it represents a full turn.
    return isHiddenThoughtsMessage({role: role || 'assistant', content: item?.text ?? item?.content ?? item?.excerpt ?? ''});
  }

  function visibleExcerpt(item, summary) {
    return isHiddenViewEntry(item, summary) ? '' : String(item?.excerpt ?? item?.text ?? item?.content ?? '');
  }

  return Object.freeze({isHiddenThoughtsMessage, summarizeMessages, isHiddenViewEntry, visibleExcerpt});
});
