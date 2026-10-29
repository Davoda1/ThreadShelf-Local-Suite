/* Display-only citation parser for exported Codex file references.
 * Alternative always uses soft chips; its bundle intentionally omits the type map.
 * No URL navigation, filesystem access, decompression or network requests.
 */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.TSAFileCitations=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
const MARKER = ':codex-file-citation{';
const MAX_FILE_CITATION_LENGTH = 16384;
const MAX_PATH_LENGTH = 8192;
const MAX_ATTRIBUTES = 32;
const BAD_DISPLAY_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
const escapeHtml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Parses only a complete, bounded marker at the start of an inline source slice. */
function parseFileCitation(source) {
  if (typeof source !== 'string' || !source.startsWith(MARKER)) return null;
  let position = MARKER.length;
  const limit = Math.min(source.length, MAX_FILE_CITATION_LENGTH);
  const attributes = Object.create(null);
  let count = 0;
  while (position < limit) {
    while (position < limit && /[ \t]/.test(source[position])) position++;
    if (source[position] === '}') {
      const path = attributes.path;
      if (typeof path !== 'string' || !path || path.length > MAX_PATH_LENGTH || BAD_DISPLAY_CHARACTERS.test(path)) return null;
      // Path strings are labels only. Never construct a URL, href or filesystem request.
      const filenamePart = path.split(/[\\/]/).at(-1);
      if (!filenamePart || filenamePart === '.' || filenamePart === '..') return null;
      let filename = filenamePart;
      try { filename = decodeURIComponent(filenamePart); } catch { /* Preserve malformed percent spelling. */ }
      if (!filename || BAD_DISPLAY_CHARACTERS.test(filename)) return null;
      return { raw: source.slice(0, position + 1), filename };
    }
    if (++count > MAX_ATTRIBUTES) return null;
    const start = position;
    while (position < limit && /[A-Za-z0-9_-]/.test(source[position])) position++;
    const key = source.slice(start, position);
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) || Object.hasOwn(attributes, key)) return null;
    while (position < limit && /[ \t]/.test(source[position])) position++;
    if (source[position++] !== '=') return null;
    while (position < limit && /[ \t]/.test(source[position])) position++;
    const quote = source[position++];
    if (quote !== '"' && quote !== "'") return null;
    let value = '', closed = false;
    while (position < limit) {
      const character = source[position++];
      if (character === quote) { closed = true; break; }
      if (character === '\\' && (source[position] === quote || source[position] === '\\')) value += source[position++];
      else value += character;
      if (BAD_DISPLAY_CHARACTERS.test(character)) return null;
    }
    if (!closed) return null;
    attributes[key] = value;
    if (position < limit && source[position] !== '}' && !/[ \t]/.test(source[position])) return null;
  }
  return null;
}

/** A Marked inline extension; code and link destinations are handled by Marked first. */
function createFileCitationExtension({classPrefix = 'tsa-file', title = 'File reference only. This link does not open a file.'} = {}) {
  const prefix = /^[a-z][a-z0-9-]*$/.test(classPrefix) ? classPrefix : 'tsa-file';
  const displayStyle = 'chip';
  return {
    name: 'codexFileCitation',
    level: 'inline',
    start(source) { return source.indexOf(MARKER); },
    tokenizer(source) {
      // A reference inside an active link must not become a misleading clickable dummy.
      if (this.lexer?.state?.inLink || this.lexer?.state?.inRawBlock) return undefined;
      const parsed = parseFileCitation(source);
      return parsed ? { type: 'codexFileCitation', ...parsed } : undefined;
    },
    renderer(token) {
      return `<span class="${prefix}-citation ${prefix}-${displayStyle}" role="link" aria-disabled="true" title="${escapeHtml(title)}"><span class="${prefix}-icon" aria-hidden="true"></span><span class="${prefix}-name">${escapeHtml(token.filename)}</span></span>`;
    },
  };
}

return Object.freeze({createFileCitationExtension,parseFileCitation,MAX_FILE_CITATION_LENGTH});
});
