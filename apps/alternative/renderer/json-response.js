/* Display-only JSON formatter from ThreadShelf Local Reader. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TSAJsonResponse = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
// Display-only JSON handling. Never round-trip through JSON.parse/stringify:
// doing so would lose duplicate keys, large integer digits and number spelling.
const MAX_SOURCE_LENGTH = 1024 * 1024;
const MAX_OUTPUT_LENGTH = 4 * 1024 * 1024;
const MAX_DEPTH = 64;
const numberToken = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const whitespace = character => character === ' ' || character === '\t' || character === '\r' || character === '\n';

function jsonEnvelopeOnly(text) {
  // Objects need a quoted member name; arrays need a JSON value. In particular,
  // Markdown links/images/reference labels must not become JSON code blocks.
  if (text[0] === '{') {
    if (!/^\{\s*(?:}|"(?:[^"\\]|\\[\s\S])*"\s*:)/.test(text)) return false;
  } else if (text[0] === '[') {
    if (!/^\[\s*(?:[\[\]{}]|"(?:[^"\\]|\\[\s\S])*"\s*(?:[,\]]|$)|(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*(?:[,\]]|$))/.test(text)) return false;
  } else return false;

  let depth = 0, quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '\\') index++;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '{' || character === '[') depth++;
    else if (character === '}' || character === ']') {
      if (--depth <= 0) return !text.slice(index + 1).trim();
    }
  }
  // A clearly JSON-shaped, truncated response remains readable, but its missing
  // text/values are never guessed. The formatter below will retain it verbatim.
  return depth > 0;
}

function formatTokens(text) {
  let index = 0, outputLength = 0;
  const output = [];
  const fail = () => { throw new Error('JSON response requires a speculative repair'); };
  const emit = value => {
    outputLength += value.length;
    if (outputLength > MAX_OUTPUT_LENGTH) fail();
    output.push(value);
  };
  const skip = () => { while (whitespace(text[index])) index++; };
  const line = depth => emit('\n' + '  '.repeat(depth));
  const string = () => {
    if (text[index] !== '"') fail();
    const pieces = ['"'];
    index++;
    let start = index;
    while (index < text.length) {
      const character = text[index];
      if (character === '"') {
        pieces.push(text.slice(start, ++index));
        return pieces.join('');
      }
      if (character === '\\') {
        const escape = text[++index];
        if (escape === 'u') {
          if (!/^[\da-fA-F]{4}$/.test(text.slice(index + 1, index + 5))) fail();
          index += 5;
        } else if (escape && '"\\/bfnrt'.includes(escape)) index++;
        else fail();
      } else if (character.charCodeAt(0) < 0x20) {
        pieces.push(text.slice(start, index), JSON.stringify(character).slice(1, -1));
        start = ++index;
      } else index++;
    }
    fail();
  };
  const value = depth => {
    if (depth > MAX_DEPTH) fail();
    skip();
    const character = text[index];
    if (character === '"') { emit(string()); return; }
    if (character === '{' || character === '[') {
      const object = character === '{', close = object ? '}' : ']';
      emit(character); index++; skip();
      if (text[index] === close) { emit(close); index++; return; }
      while (index < text.length) {
        line(depth + 1);
        if (object) {
          emit(string()); skip();
          if (text[index++] !== ':') fail();
          emit(': ');
        }
        value(depth + 1); skip();
        if (text[index] === close) { index++; line(depth); emit(close); return; }
        if (text[index++] !== ',') fail();
        skip();
        // Removing a trailing comma after a complete value does not invent or
        // discard a key/value. Other syntax errors fall back to original text.
        if (text[index] === close) { index++; line(depth); emit(close); return; }
        emit(',');
      }
      fail();
    }
    for (const literal of ['true', 'false', 'null']) {
      if (text.startsWith(literal, index)) { emit(literal); index += literal.length; return; }
    }
    numberToken.lastIndex = index;
    const number = numberToken.exec(text);
    if (!number) fail();
    emit(number[0]); index = numberToken.lastIndex;
  };
  value(0); skip();
  if (index !== text.length) fail();
  return output.join('');
}

/** Return JSON code text for a raw AI-only response, or null for normal Markdown.
 * Formatting and conservative repairs affect only the returned display string.
 * Callers keep the original message for copy-message, bookmarks and all storage.
 */
function formatJsonResponse(content, role) {
  if (role === 'reasoning') role = 'thinking';
  if (!['assistant', 'thinking'].includes(role) || typeof content !== 'string' || content.length > MAX_SOURCE_LENGTH) return null;
  const firstLine = content.match(/^[^\S\r\n]*\S[^\r\n]*/m)?.[0] || '';
  if (/^(?: {4}| {0,3}\t)/.test(firstLine)) return null;
  const text = content.trim();
  if (!jsonEnvelopeOnly(text)) return null;
  try { return formatTokens(text); }
  catch { return text; }
}

return Object.freeze({formatJsonResponse});
});
