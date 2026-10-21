/* Adapted from ThreadShelf Local Reader. Copyright (c) 2026 davoda1. MIT; see vendor/licenses/Reader-MIT.txt. */
window.TSARich=Object.create(null);

/* rich-parser.js */
(function(){'use strict';
const marked=window.marked;
/** Reader-owned, bounded, data-only adapters for the evidenced export vocabulary.
 * This is deliberately not JSX, HTML, Svelte, or a JavaScript interpreter.
 * All representations are transient; nothing here writes back to a message.
 */

const RICH_LIMITS = Object.freeze({
  message: 2 * 1024 * 1024, span: 256 * 1024, depth: 24, nodes: 4096,
  values: 20000, string: 32768, iterations: 512, array: 512,
  output: 1024 * 1024, fragments: 256, operations: 1000000, milliseconds: 300,
});
const TAGS = new Set(['box', 'row', 'text', 'title', 'caption', 'divider', 'icon', 'grid', 'grid-item', 'Entity', 'AsyncImage', 'AsyncImageGroup', 'Chart', 'Cite', 'Link', 'svg']);
const INLINE = new Set(['Entity', 'Cite', 'Link', 'icon']);
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
const ENUMS = Object.freeze({
  align: ['start', 'center', 'end', 'stretch'], justify: ['start', 'center', 'end', 'between'],
  direction: ['row', 'column'], wrap: ['wrap', 'nowrap'], radius: ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', 'full'],
  weight: ['normal', 'medium', 'semibold', 'bold'], textAlign: ['start', 'left', 'center', 'right', 'end'],
  color: ['default', 'secondary', 'tertiary', 'subtle', 'success', 'info', 'warning', 'danger', 'error'],
});
const PROPS = Object.freeze({
  box: ['gap', 'width', 'height', 'size', 'minWidth', 'align', 'flex', 'border', 'radius', 'padding', 'justify', 'background', 'clip', 'direction'],
  row: ['align', 'gap', 'justify', 'wrap'], text: ['color', 'size', 'weight', 'tabularNums', 'textAlign'],
  title: ['size', 'color', 'tabularNums'], caption: ['textAlign'], divider: ['color'], grid: ['columns', 'gap'],
  'grid-item': [], icon: ['name', 'color', 'size', 'inline'], Entity: ['category', 'value', 'disambig'],
  Link: ['url', 'title'], Cite: ['ref', 'refs'], Chart: ['content'],
  AsyncImage: ['query', 'aspectRatio', 'width', 'maxWidth'], AsyncImageGroup: ['query', 'aspectRatio', 'layout'],
});
const own = (value, key) => value !== null && typeof value === 'object' && Object.hasOwn(value, key);
const plainRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [null, Object.prototype].includes(Object.getPrototypeOf(value));
const fail = (message) => { throw new SyntaxError(message); };
function budget() {
  return { started: Date.now(), operations: 0, nodes: 0, values: 0, iterations: 0, output: 0, fragments: 0, codeCache: new WeakMap() };
}
function tick(b, kind, amount = 1) {
  b.operations += amount;
  if (kind) b[kind] += amount;
  if (b.operations > RICH_LIMITS.operations || (kind && b[kind] > RICH_LIMITS[kind])) fail('Rich content budget exceeded');
  if ((b.operations & 255) === 0 && Date.now() - b.started > RICH_LIMITS.milliseconds) fail('Rich content time budget exceeded');
}
function depthCheck(depth) { if (depth > RICH_LIMITS.depth) fail('Rich content nesting limit exceeded'); }
function keyCheck(key) { if (FORBIDDEN.has(key)) fail('Forbidden property'); }

class LiteralParser {
  constructor(source, b) { this.source = source; this.pos = 0; this.b = b; }
  ws() { while (/\s/.test(this.source[this.pos] || '') && this.pos < this.source.length) { this.pos++; tick(this.b); } }
  string() {
    const quote = this.source[this.pos++]; let result = '';
    while (this.pos < this.source.length) {
      tick(this.b);
      const c = this.source[this.pos++];
      if (c === quote) { if (result.length > RICH_LIMITS.string) fail('Literal string limit exceeded'); return result; }
      if (c === '\\') {
        const e = this.source[this.pos++];
        if (e === 'u') {
          const hex = this.source.slice(this.pos, this.pos + 4);
          if (!/^[a-fA-F0-9]{4}$/.test(hex)) fail('Invalid Unicode escape');
          result += String.fromCharCode(parseInt(hex, 16)); this.pos += 4;
        } else {
          const escapes = { '"': '"', "'": "'", '\\': '\\', '/': '/', n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
          if (!Object.hasOwn(escapes, e)) fail('Invalid literal escape');
          result += escapes[e];
        }
      } else {
        if (c.charCodeAt(0) < 32) fail('Control character in literal');
        result += c;
      }
      if (result.length > RICH_LIMITS.string) fail('Literal string limit exceeded');
    }
    fail('Unterminated literal string');
  }
  value(depth = 0) {
    depthCheck(depth); tick(this.b, 'values'); this.ws();
    const c = this.source[this.pos];
    if (c === '"' || c === "'") return this.string();
    if (c === '[') {
      this.pos++; const result = []; this.ws();
      while (this.source[this.pos] !== ']') {
        if (result.length >= RICH_LIMITS.array) fail('Literal array limit exceeded');
        result.push(this.value(depth + 1)); this.ws();
        if (this.source[this.pos] === ']') break;
        if (this.source[this.pos++] !== ',') fail('Expected array comma');
        this.ws();
      }
      this.pos++; return result;
    }
    if (c === '{') {
      this.pos++; const result = Object.create(null); this.ws();
      while (this.source[this.pos] !== '}') {
        let key;
        if (this.source[this.pos] === '"' || this.source[this.pos] === "'") key = this.string();
        else {
          const match = this.source.slice(this.pos).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
          if (!match) fail('Expected literal object key');
          key = match[0]; this.pos += key.length;
        }
        keyCheck(key); if (Object.hasOwn(result, key)) fail('Duplicate literal key');
        this.ws(); if (this.source[this.pos++] !== ':') fail('Expected object colon');
        result[key] = this.value(depth + 1); this.ws();
        if (this.source[this.pos] === '}') break;
        if (this.source[this.pos++] !== ',') fail('Expected object comma');
        this.ws();
      }
      this.pos++; return result;
    }
    const keyword = this.source.slice(this.pos).match(/^(true|false|null)(?![A-Za-z0-9_$])/);
    if (keyword) { this.pos += keyword[0].length; return keyword[0] === 'null' ? null : keyword[0] === 'true'; }
    const number = this.source.slice(this.pos).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (number) { this.pos += number[0].length; const n = Number(number[0]); if (!Number.isFinite(n)) fail('Non-finite number'); return n; }
    fail('Expected literal data');
  }
}
function parseLiteral(source, sharedBudget) {
  const s = String(source); if (s.length > RICH_LIMITS.span) fail('Literal input limit exceeded');
  const parser = new LiteralParser(s, sharedBudget || budget());
  const result = parser.value(); parser.ws(); if (parser.pos !== s.length) fail('Expressions are not literal data');
  return result;
}
function binding(source) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(source)) fail('Unsupported binding');
  const path = source.split('.'); path.forEach(keyCheck); return { expression: 'binding', path };
}
function expression(source, b) {
  const s = source.trim();
  if (/^(?:[\[{'"-]|\d|true\b|false\b|null\b)/.test(s)) return { expression: 'literal', value: parseLiteral(s, b) };
  return binding(s);
}
function resolve(expr, env) {
  if (expr.expression === 'literal') return expr.value;
  let value = env;
  for (const key of expr.path) {
    keyCheck(key); if (!plainRecord(value) || !own(value, key)) fail('Binding is not a local own property');
    value = value[key];
  }
  return value;
}
function condition(source, b) {
  const match = source.match(/^(.+?)\s*(===|!==|==|!=|<=|>=|<|>)\s*(.+)$/);
  if (!match) fail('Unsupported condition');
  return { left: expression(match[1], b), operator: match[2], right: expression(match[3], b) };
}
function compare(c, env) {
  const a = resolve(c.left, env), b = resolve(c.right, env);
  if (!['number', 'string', 'boolean'].includes(typeof a) || typeof a !== typeof b) fail('Condition operands must share a primitive type');
  switch (c.operator) {
    case '==': case '===': return a === b;
    case '!=': case '!==': return a !== b;
    case '<': return a < b; case '>': return a > b; case '<=': return a <= b; case '>=': return a >= b;
    default: return false;
  }
}
function safeRichUrl(value) {
  if (typeof value !== 'string' || value.length > 4096 || !/^(?:https?:\/\/|mailto:)/i.test(value) || /[\\\s\u0000-\u001f\u007f]/.test(value)) return null;
  try { const u = new URL(value); return ['https:', 'http:', 'mailto:'].includes(u.protocol) ? value : null; } catch { return null; }
}
function dimensions(value) {
  if (typeof value !== 'string') return false;
  const m = value.match(/^(\d+(?:\.\d+)?)(px|%)$/);
  return !!m && Number(m[1]) <= (m[2] === '%' ? 100 : 2048);
}
function validateAttributes(tag, attrs) {
  for (const [key, value] of Object.entries(attrs)) {
    if (!PROPS[tag].includes(key)) fail(`Unsupported ${tag} property`);
    if (['border', 'clip', 'tabularNums', 'inline'].includes(key)) { if (typeof value !== 'boolean') fail('Expected boolean'); }
    else if (['gap', 'padding'].includes(key)) { if (!Number.isInteger(value) || value < 0 || value > 16) fail('Invalid spacing'); }
    else if (key === 'columns') { if (!Number.isInteger(value) || value < 1 || value > 12) fail('Invalid grid columns'); }
    else if (key === 'flex') { if (!/^(?:\d+(?:\.\d+)?)$/.test(String(value)) || Number(value) > 1024) fail('Invalid flex'); }
    else if (['width', 'height', 'minWidth', 'maxWidth'].includes(key) || (key === 'size' && tag === 'box')) { if (!dimensions(value)) fail('Invalid dimension'); }
    else if (key === 'size') { if (!['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'].includes(value)) fail('Invalid text size'); }
    else if (key === 'background') { if (typeof value !== 'string' || !(/^(?:#[0-9a-fA-F]{6}|surface-secondary|surface-tertiary|info|success|warning|danger|error)$/.test(value))) fail('Invalid background'); }
    else if (ENUMS[key]) { if (!ENUMS[key].includes(value)) fail('Invalid enum'); }
    else if (key === 'content') { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Chart content must be an object'); }
    else if (key === 'refs') { if (!Array.isArray(value) || !value.length || value.length > 64 || value.some(v => typeof v !== 'string' || !v.length || v.length > 256 || /\s/.test(v))) fail('Invalid references'); }
    else if (key === 'ref') { if (typeof value !== 'string' || !value.length || value.length > 256 || /\s/.test(value)) fail('Invalid reference'); }
    else if (key === 'query') { if (tag === 'AsyncImageGroup') { if (!Array.isArray(value) || value.length > 32 || value.some(v => typeof v !== 'string' || v.length > 4096)) fail('Invalid image queries'); } else if (typeof value !== 'string' || value.length > 4096) fail('Invalid image query'); }
    else if (key === 'url') { if (!safeRichUrl(value)) fail('Unsafe link URL'); }
    else if (key === 'aspectRatio') { if (typeof value !== 'string' || !/^[1-9]\d?:[1-9]\d?$/.test(value)) fail('Invalid aspect ratio'); }
    else if (key === 'layout') { if (value !== 'carousel') fail('Unsupported image layout'); }
    else if (typeof value !== 'string' || value.length > 4096) fail('Invalid text property');
  }
  if (tag === 'Entity' && typeof attrs.value !== 'string') fail('Entity has no label');
  if (tag === 'Link' && !safeRichUrl(attrs.url)) fail('Link has no safe URL');
  if (tag === 'Chart' && !attrs.content) fail('Chart has no content');
  if (tag === 'Cite' && ((!attrs.ref && !attrs.refs) || (attrs.ref && attrs.refs))) fail('Citation requires exactly one reference field');
  return attrs;
}
function richTagAt(source, position) {
  const m = source.slice(position, position + 40).match(/^<([A-Za-z][A-Za-z0-9-]*)(?=[\s/>])/);
  return m && TAGS.has(m[1]) ? m[1] : null;
}
function escaped(source, index) {
  let n = 0; for (let p = index - 1; p >= 0 && source[p] === '\\'; p--) n++;
  return n % 2 === 1;
}

// A small, static illustration vocabulary, independent of HTML/JSX. These are
// the geometry and paint fields used by the saved area/doughnut illustrations.
// No CSS, URLs, references, animation, events, text markup or foreign content.
const SVG_PAINT = ['fill', 'stroke', 'strokeWidth', 'stroke-width', 'strokeLinecap', 'stroke-linecap', 'strokeLinejoin', 'stroke-linejoin', 'opacity', 'fillOpacity', 'fill-opacity', 'strokeOpacity', 'stroke-opacity'];
const SVG_PROPS = Object.freeze({
  svg: ['viewBox', 'width', 'height', 'preserveAspectRatio'],
  path: ['d', ...SVG_PAINT],
  circle: ['cx', 'cy', 'r', ...SVG_PAINT],
});
const SVG_NUMBER = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
function svgNumbers(value, limit = 2048) {
  const parts = value.match(new RegExp(SVG_NUMBER, 'g')) || [];
  if (parts.length > limit || parts.some(n => !Number.isFinite(Number(n)) || Math.abs(Number(n)) > 100000)) fail('SVG numeric limit exceeded');
  return parts.map(Number);
}
function validateSvgPath(value) {
  const tokens = [], lexer = new RegExp(`[MmZzLlHhVvCcSsQqTtAa]|${SVG_NUMBER}`, 'g');
  let end = 0;
  for (const match of value.matchAll(lexer)) {
    if (!/^[\s,]*$/.test(value.slice(end, match.index))) fail('Invalid SVG path token');
    tokens.push(match[0]); end = match.index + match[0].length;
  }
  if (!/^[\s,]*$/.test(value.slice(end)) || !/^[Mm]$/.test(tokens[0] || '')) fail('Invalid SVG path');
  svgNumbers(value);
  const sizes = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  let pos = 0, commands = 0;
  while (pos < tokens.length) {
    const command = tokens[pos++].toUpperCase(), size = sizes[command];
    if (size === undefined || ++commands > 512) fail('Invalid SVG path command');
    const start = pos; while (pos < tokens.length && !/^[A-Za-z]$/.test(tokens[pos])) pos++;
    const count = pos - start;
    if (size === 0 ? count !== 0 : count === 0 || count % size !== 0) fail('Invalid SVG path geometry');
    if (command === 'A') for (let i = start; i < pos; i += 7) {
      if (Number(tokens[i]) < 0 || Number(tokens[i + 1]) < 0 || !['0', '1'].includes(tokens[i + 3]) || !['0', '1'].includes(tokens[i + 4])) fail('Invalid SVG arc');
    }
  }
}
function validateSvgAttributes(tag, attrs) {
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value !== 'string' || value.length > 8192) fail('Invalid SVG value');
    if (key === 'width' || key === 'height') { if (!dimensions(value)) fail('Invalid SVG dimension'); }
    else if (key === 'viewBox') {
      if (!new RegExp(`^\\s*${SVG_NUMBER}(?:[ ,]+${SVG_NUMBER}){3}\\s*$`).test(value)) fail('Invalid SVG viewBox');
      const values = svgNumbers(value, 4); if (values[2] <= 0 || values[3] <= 0) fail('Empty SVG viewBox');
    } else if (key === 'preserveAspectRatio') { if (!/^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?: (?:meet|slice))?)$/.test(value)) fail('Invalid SVG aspect ratio'); }
    else if (key === 'd') validateSvgPath(value);
    else if (key === 'fill' || key === 'stroke') { if (!/^(?:none|currentColor|#[a-fA-F0-9]{3}|#[a-fA-F0-9]{6})$/.test(value)) fail('Invalid SVG paint'); }
    else if (key === 'strokeLinecap' || key === 'stroke-linecap') { if (!['butt', 'round', 'square'].includes(value)) fail('Invalid SVG cap'); }
    else if (key === 'strokeLinejoin' || key === 'stroke-linejoin') { if (!['miter', 'round', 'bevel'].includes(value)) fail('Invalid SVG join'); }
    else {
      if (!new RegExp(`^${SVG_NUMBER}$`).test(value)) fail('Invalid SVG number');
      const n = svgNumbers(value, 1)[0];
      if (/opacity/i.test(key) && (n < 0 || n > 1)) fail('Invalid SVG opacity');
      if (['r', 'strokeWidth', 'stroke-width'].includes(key) && (n < 0 || n > 2048)) fail('Invalid SVG size');
    }
  }
  if (tag === 'svg' && !attrs.viewBox) fail('SVG requires a viewBox');
  if (tag === 'path' && !attrs.d) fail('SVG path requires geometry');
  if (tag === 'circle' && !['cx', 'cy', 'r'].every(k => Object.hasOwn(attrs, k))) fail('SVG circle requires geometry');
}

function protectedMathEnd(source, at) {
  if (escaped(source, at)) return at;
  let opening = '', closing = '';
  for (const [a, z] of [['\\(', '\\)'], ['\\[', '\\]'], ['$$', '$$']]) {
    if (source.startsWith(a, at)) { opening = a; closing = z; break; }
  }
  if (opening) {
    let p = source.indexOf(closing, at + opening.length);
    while (p >= 0 && escaped(source, p)) p = source.indexOf(closing, p + closing.length);
    return p >= 0 ? p + closing.length : at;
  }
  if ((at === 0 || source[at - 1] === '\n') && /^ *\[ *\r?\n/.test(source.slice(at, at + 512))) {
    const contentStart = source.indexOf('\n', at) + 1;
    const closing = /(?:^|\n)[ \t]*\][ \t]*(?=\r?\n|$)/g;
    closing.lastIndex = contentStart;
    const match = closing.exec(source);
    if (match && match.index - at <= RICH_LIMITS.span) {
      const tex = source.slice(contentStart, match.index);
      if (/\\[a-zA-Z]|[_^](?:\{|[a-zA-Z0-9])|(?:^|\s)=(?:\s|$)/.test(tex)) return match.index + match[0].length;
    }
  }
  if (source.startsWith('\\begin{', at)) {
    const m = source.slice(at).match(/^\\begin\{(equation\*?|align\*?|aligned|gather\*?|gathered|multline\*?|split|cases|[pbBvV]?matrix)\}/);
    if (m) { const close = `\\end{${m[1]}}`, p = source.indexOf(close, at + m[0].length); if (p >= 0) return p + close.length; }
  }
  if (source[at] === '$' && source[at + 1] !== '$') {
    let end = source.indexOf('$', at + 1);
    while (end >= 0 && escaped(source, end)) end = source.indexOf('$', end + 1);
    if (end >= 0 && source[end + 1] !== '$') {
      const tex = source.slice(at + 1, end);
      if (tex && !/\n|^\s|\s$/.test(tex) && (/\\[a-zA-Z]|[_^](?:\{|[a-zA-Z0-9])|(?:^|\s)=(?:\s|$)/.test(tex) || /^[A-Za-z]$/.test(tex))) return end + 1;
    }
  }
  return at;
}

/** Markdown's lexer is authoritative for code, escapes, links and raw HTML.
 * Root raw-HTML blocks beginning with known rich tags are passed to the bounded
 * grammar; unrelated HTML is protected instead of interpreted or repaired.
 */
function lexicalPreflight(source) {
  if (source.length > RICH_LIMITS.message) return false;
  let tags = 0, delimiters = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '<' && ++tags > RICH_LIMITS.nodes) return false;
    if (['{', '}', '[', ']', '`'].includes(source[i]) && ++delimiters > RICH_LIMITS.values) return false;
  }
  return true;
}
function markdownProtectedRanges(source) {
  if (!lexicalPreflight(source)) fail('Rich lexical budget exceeded');
  const started = Date.now(); let visited = 0;
  const ranges = [];
  // Build the exact closing-tag index once. Repeated unclosed HTML tags must
  // never trigger repeated scans over the entire remaining message.
  const closings = new Map();
  for (const match of source.matchAll(/<\/([A-Za-z][A-Za-z0-9-]*)>/g)) {
    const list = closings.get(match[1]) || []; list.push(match.index); closings.set(match[1], list);
  }
  const closingAt = (name, from) => {
    const list = closings.get(name); if (!list) return -1;
    let low = 0, high = list.length;
    while (low < high) { const mid = (low + high) >>> 1; if (list[mid] < from) low = mid + 1; else high = mid; }
    return list[low] ?? -1;
  };
  const add = (start, end, kind = 'protected') => { if (end > start) ranges.push([start, end, kind]); };
  function walk(tokens, base, region) {
    let cursor = 0;
    for (const token of tokens) {
      if (++visited > RICH_LIMITS.values || Date.now() - started > RICH_LIMITS.milliseconds) fail('Rich Markdown budget exceeded');
      const raw = token.raw || ''; if (!raw) continue;
      const at = region.indexOf(raw, cursor); if (at < 0) continue;
      const start = base + at, end = start + raw.length; cursor = at + raw.length;
      if (['code', 'codespan', 'escape', 'link', 'image'].includes(token.type)) { add(start, end, token.type === 'code' && token.codeBlockStyle === 'indented' ? 'indented' : 'protected'); continue; }
      if (token.type === 'html') {
        const root = raw.match(/^\s*<\/?([A-Za-z][A-Za-z0-9-]*)/);
        if (!root || !TAGS.has(root[1])) {
          let last = end;
          if (root && !/^\s*<\//.test(raw) && !/\/\s*>\s*$/.test(raw)) {
            const close = closingAt(root[1], end);
            if (close >= 0 && close - start <= RICH_LIMITS.span) last = close + root[1].length + 3;
          }
          add(start, last);
        }
        continue;
      }
      if (token.tokens) walk(token.tokens, start, raw);
      if (token.items) walk(token.items, start, raw);
      if (token.type === 'table') {
        // The cell lexer retains its own source; seek within this table only.
        const cells = [...(token.header || []), ...(token.rows || []).flat()]; let pos = 0;
        for (const cell of cells) { const p = raw.indexOf(cell.text, pos); if (p >= 0) { walk(cell.tokens || [], start + p, cell.text); pos = p + cell.text.length; } }
      }
    }
  }
  walk(marked.lexer(source, { gfm: true }), 0, source);
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) { const previous = merged.at(-1); if (previous && range[0] <= previous[1] && previous[2] === range[2]) previous[1] = Math.max(previous[1], range[1]); else merged.push(range); }
  return merged;
}

class ComponentParser {
  constructor(source, pos, b, ranges = []) { this.source = source; this.pos = pos; this.start = pos; this.b = b; this.ranges = ranges; }
  check(depth) { depthCheck(depth); tick(this.b); if (this.pos - this.start > RICH_LIMITS.span) fail('Rich span limit exceeded'); }
  ws() { while (this.pos < this.source.length && /\s/.test(this.source[this.pos])) { this.pos++; this.check(0); } }
  brace() {
    if (this.source[this.pos++] !== '{') fail('Expected brace');
    const start = this.pos; let depth = 1, quote = '';
    while (this.pos < this.source.length) {
      this.check(depth);
      const c = this.source[this.pos++];
      if (quote) { if (c === '\\') this.pos++; else if (c === quote) quote = ''; continue; }
      if (c === '"' || c === "'") quote = c;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return this.source.slice(start, this.pos - 1);
    }
    fail('Unterminated brace');
  }
  staticSvg(depth, root = true, count = { nodes: 0 }) {
    this.check(depth); tick(this.b, 'nodes');
    if (++count.nodes > 256) fail('SVG element limit exceeded');
    const start = this.pos, match = this.source.slice(start).match(/^<(svg|path|circle)(?=[\s/>])/);
    if (!match || (root ? match[1] !== 'svg' : match[1] === 'svg')) fail('Unsupported SVG element');
    const tag = match[1], attrs = Object.create(null); this.pos += match[0].length;
    let selfClosing = false;
    while (true) {
      const previous = this.pos; this.ws();
      if (this.source.startsWith('/>', this.pos)) { this.pos += 2; selfClosing = true; break; }
      if (this.source[this.pos] === '>') { this.pos++; break; }
      if (this.pos === previous) fail('Expected SVG attribute whitespace');
      const keyMatch = this.source.slice(this.pos).match(/^[A-Za-z][A-Za-z0-9-]*/);
      const key = keyMatch?.[0];
      if (!key || !SVG_PROPS[tag].includes(key) || Object.hasOwn(attrs, key)) fail('Unsupported SVG attribute');
      // Camel-case export spellings and standard SVG spellings name the same
      // attribute; accepting both on one shape would make rendering ambiguous.
      const canonical = key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
      if (Object.keys(attrs).some(k => k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`) === canonical)) fail('Duplicate SVG attribute');
      this.pos += key.length; this.ws(); if (this.source[this.pos++] !== '=') fail('Expected SVG attribute value');
      this.ws(); if (!['"', "'"].includes(this.source[this.pos])) fail('SVG values must be quoted literals');
      const lp = new LiteralParser(this.source.slice(this.pos, this.pos + RICH_LIMITS.span), this.b);
      attrs[key] = lp.string(); this.pos += lp.pos; tick(this.b, 'output', attrs[key].length);
    }
    validateSvgAttributes(tag, attrs);
    const children = [];
    if (!selfClosing) {
      while (true) {
        this.ws();
        if (this.source.startsWith(`</${tag}>`, this.pos)) { this.pos += tag.length + 3; break; }
        if (tag !== 'svg' || this.pos >= this.source.length) fail('Unsupported SVG content');
        children.push(this.staticSvg(depth + 1, false, count));
      }
    }
    return { kind: 'static-svg', tag, attrs, children, svgNodes: root ? count.nodes : 1, source: this.source.slice(start, this.pos), inline: false };
  }
  element(depth = 0) {
    if (richTagAt(this.source, this.pos) === 'svg') return this.staticSvg(depth);
    this.check(depth); tick(this.b, 'nodes');
    const start = this.pos, tag = richTagAt(this.source, this.pos); if (!tag) fail('Unsupported component');
    this.pos += tag.length + 1; const attrs = Object.create(null);
    while (true) {
      const previous = this.pos; this.ws();
      if (this.source.startsWith('/>', this.pos)) { this.pos += 2; return { kind: 'element', tag, attrs, children: [], source: this.source.slice(start, this.pos) }; }
      if (this.source[this.pos] === '>') { this.pos++; break; }
      if (this.pos === previous) fail('Expected attribute whitespace');
      const m = this.source.slice(this.pos).match(/^[A-Za-z][A-Za-z0-9]*/); if (!m) fail('Expected attribute name');
      const key = m[0]; keyCheck(key); this.pos += key.length;
      if (!PROPS[tag].includes(key) || Object.hasOwn(attrs, key)) fail('Unsupported or duplicate attribute');
      const afterKey = this.pos; this.ws();
      if (this.source[this.pos] !== '=') {
        if (!['border', 'clip', 'tabularNums', 'inline'].includes(key)) fail('Unsupported presence attribute');
        this.pos = afterKey; attrs[key] = { expression: 'literal', value: true }; continue;
      }
      this.pos++; this.ws();
      const c = this.source[this.pos];
      if (c === '"' || c === "'") {
        const lp = new LiteralParser(this.source.slice(this.pos, this.pos + RICH_LIMITS.span), this.b);
        attrs[key] = { expression: 'literal', value: lp.string() }; this.pos += lp.pos;
      } else if (c === '{') attrs[key] = expression(this.brace(), this.b);
      else {
        const bare = this.source.slice(this.pos).match(/^[A-Za-z-]+/);
        // Only this bare enum is evidenced. Quoted enums use the schema above.
        if (tag !== 'row' || key !== 'align' || !bare || !['start', 'center'].includes(bare[0])) fail('Unsupported bare attribute');
        attrs[key] = { expression: 'literal', value: bare[0] }; this.pos += bare[0].length;
      }
    }
    const children = this.children(depth, `</${tag}>`);
    if (!this.source.startsWith(`</${tag}>`, this.pos)) fail('Mismatched component closing tag');
    this.pos += tag.length + 3;
    return { kind: 'element', tag, attrs, children, source: this.source.slice(start, this.pos) };
  }
  protectedEnd() {
    const at = this.pos;
    const mathEnd = protectedMathEnd(this.source, at); if (mathEnd > at) return mathEnd;
    const r = this.ranges.find(([a, b, kind]) => kind !== 'indented' && a <= at && at < b); if (r) return r[1];
    if (this.source[at] === '`') {
      const token = marked.Lexer.lexInline(this.source.slice(at))[0];
      if (token?.type === 'codespan') return at + token.raw.length;
    }
    if ((at === 0 || this.source[at - 1] === '\n') && /^ {0,3}(?:`{3,}|~{3,})/.test(this.source.slice(at))) {
      const token = marked.lexer(this.source.slice(at))[0]; if (token?.type === 'code') return at + token.raw.length;
    }
    return at;
  }
  children(depth, closing) {
    this.check(depth); const children = []; let text = '';
    const flush = () => { if (text) { children.push({ kind: 'markdown', text }); tick(this.b, 'nodes'); text = ''; } };
    while (this.pos < this.source.length && !this.source.startsWith(closing, this.pos)) {
      this.check(depth); const end = this.protectedEnd();
      if (end > this.pos) { text += this.source.slice(this.pos, end); this.pos = end; continue; }
      if (!escaped(this.source, this.pos) && richTagAt(this.source, this.pos)) { flush(); children.push(this.element(depth + 1)); continue; }
      if (this.source.startsWith('</', this.pos) && /^<\/[A-Za-z]/.test(this.source.slice(this.pos))) fail('Mismatched nested closing tag');
      if (this.source[this.pos] === '{' && !escaped(this.source, this.pos)) {
        flush(); const directiveStart = this.pos; const value = this.brace();
        if (value.startsWith('#each ')) {
          const m = value.slice(6).match(/^([\s\S]+)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*,\s*([A-Za-z_][A-Za-z0-9_]*))?\s*$/);
          if (!m) fail('Unsupported each directive'); keyCheck(m[2]); if (m[3]) keyCheck(m[3]);
          if (m[2] === m[3]) fail('Duplicate loop binding');
          const iterable = expression(m[1], this.b), body = this.children(depth + 1, '{/each}');
          if (!this.source.startsWith('{/each}', this.pos)) fail('Unterminated each directive'); this.pos += 7;
          children.push({ kind: 'each', iterable, item: m[2], index: m[3], children: body, source: this.source.slice(directiveStart, this.pos) });
        } else if (value.startsWith('#if ')) {
          const test = condition(value.slice(4).trim(), this.b), body = this.children(depth + 1, '{/if}');
          if (!this.source.startsWith('{/if}', this.pos)) fail('Unterminated if directive'); this.pos += 5;
          children.push({ kind: 'if', test, children: body, source: this.source.slice(directiveStart, this.pos) });
        } else if (value.startsWith('#') || value.startsWith('/') || value.startsWith(':')) fail('Unsupported template directive');
        else children.push({ kind: 'bound', expr: expression(value, this.b), source: this.source.slice(directiveStart, this.pos) });
        tick(this.b, 'nodes'); continue;
      }
      text += this.source[this.pos++];
    }
    flush(); return children;
  }
}
function protectChildCode(nodes, b) {
  if (b.codeCache.has(nodes)) return b.codeCache.get(nodes);
  // Source indentation is structural at the component-body level. Identify
  // genuine Markdown code after removing that common indent, before expanding
  // a directive or binding; DOM fallback is too late to recover an each source.
  const slots = []; let skeleton = '';
  nodes.forEach((node, index) => {
    tick(b);
    if (node.kind === 'markdown') skeleton += node.text;
    else { slots.push({ at: skeleton.length, index, node }); skeleton += 'RICHCHILD'; }
  });
  if (!slots.length) { b.codeCache.set(nodes, nodes); return nodes; }
  const lines = skeleton.split('\n');
  const amounts = lines.filter(line => line.trim()).map(line => line.match(/^ */)[0].length);
  const indent = amounts.length ? Math.min(...amounts) : 0;
  let originalStart = 0, nextSlot = 0, dedented = '';
  for (const line of lines) {
    const strip = Math.min(indent, line.match(/^ */)[0].length);
    while (nextSlot < slots.length && slots[nextSlot].at <= originalStart + line.length) {
      slots[nextSlot].dedentedAt = dedented.length + slots[nextSlot].at - originalStart - strip;
      nextSlot++;
    }
    dedented += line.slice(strip) + '\n'; originalStart += line.length + 1;
  }
  const ranges = markdownProtectedRanges(dedented), protectedIndices = new Set(); let rangeIndex = 0;
  for (const slot of slots) {
    while (rangeIndex < ranges.length && ranges[rangeIndex][1] <= slot.dedentedAt) rangeIndex++;
    if (ranges[rangeIndex] && ranges[rangeIndex][0] <= slot.dedentedAt) protectedIndices.add(slot.index);
  }
  const result = nodes.map((node, index) => protectedIndices.has(index) ? { kind: 'markdown', text: node.source || '' } : node);
  b.codeCache.set(nodes, result); return result;
}
function evaluate(nodes, env, b, depth = 0) {
  depthCheck(depth); const out = [];
  for (const node of nodes) {
    tick(b, 'nodes');
    if (node.kind === 'markdown') { tick(b, 'output', node.text.length); out.push(node); }
    else if (node.kind === 'static-svg') { tick(b, 'nodes', node.svgNodes); tick(b, 'output', node.source.length); out.push(node); }
    else if (node.kind === 'bound') {
      const value = resolve(node.expr, env);
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) fail('Text binding is not primitive');
      const text = value === null ? '' : String(value); tick(b, 'output', text.length); out.push({ kind: 'literal', text });
    } else if (node.kind === 'each') {
      const array = resolve(node.iterable, env); if (!Array.isArray(array) || array.length > RICH_LIMITS.array) fail('Each requires a bounded literal array');
      const body = protectChildCode(node.children, b);
      array.forEach((item, index) => {
        tick(b, 'iterations');
        const local = Object.assign(Object.create(null), env); local[node.item] = item; if (node.index) local[node.index] = index;
        out.push(...evaluate(body, local, b, depth + 1));
      });
    } else if (node.kind === 'if') { if (compare(node.test, env)) out.push(...evaluate(protectChildCode(node.children, b), env, b, depth + 1)); }
    else if (node.kind === 'element') {
      const attrs = Object.create(null);
      for (const [key, expr] of Object.entries(node.attrs)) {
        attrs[key] = resolve(expr, env);
        // Count expanded attributes too: a loop must not multiply a large chart
        // literal hundreds of times without consuming the shared output budget.
        tick(b, 'output', JSON.stringify(attrs[key]).length);
      }
      validateAttributes(node.tag, attrs);
      if (['Entity', 'Link', 'Cite', 'Chart', 'AsyncImage', 'AsyncImageGroup', 'icon', 'divider'].includes(node.tag) && node.children.some(child => child.kind !== 'markdown' || child.text.trim())) fail('Terminal component has unsupported children');
      out.push({ kind: 'component', tag: node.tag, attrs, children: evaluate(protectChildCode(node.children, b), env, b, depth + 1), source: node.source, inline: INLINE.has(node.tag) });
    }
  }
  return out;
}
function parseRichSpan(source) {
  const text = String(source), b = budget(); if (text.length > RICH_LIMITS.span) fail('Rich span limit exceeded');
  const parser = new ComponentParser(text, 0, b, markdownProtectedRanges(text));
  const ast = parser.element(); if (parser.pos !== text.length) fail('Trailing content after rich span');
  return evaluate([ast], Object.create(null), b)[0];
}
function legacyNode(payload, raw, b) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const keys = Object.keys(payload); if (keys.length !== 1) return null;
  const family = keys[0], data = payload[family];
  if (family === 'chart' || family === 'charts_widget_v2') {
    if (!data || typeof data !== 'object' || Array.isArray(data) || !own(data, 'content')) return null;
    if (Object.keys(data).some(k => !['content', 'language'].includes(k)) || (data.language !== undefined && data.language !== 'recharts-json')) return null;
    return { kind: 'component', tag: 'Chart', attrs: { content: data.content }, family, children: [], source: raw, inline: false };
  }
  if (family === 'citation' || family === 'refs') {
    const attrs = Array.isArray(data) ? { refs: data } : typeof data === 'string' ? { ref: data } : data;
    if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return null;
    validateAttributes('Cite', attrs); return { kind: 'component', tag: 'Cite', attrs, children: [], source: raw, inline: true };
  }
  if (family === 'suggest_automation' && data && Object.keys(data).length === 1 && typeof data.label === 'string') {
    return { kind: 'passive', family, text: data.label, source: raw, inline: false };
  }
  if (family === 'map_widget' && data && Object.keys(data).length === 1 && Array.isArray(data.points) && data.points.length <= 128) {
    if (data.points.some(p => !p || typeof p !== 'object' || Object.keys(p).some(k => !['ref', 'name', 'category'].includes(k)) || typeof p.name !== 'string' || (p.category !== undefined && typeof p.category !== 'string'))) return null;
    return { kind: 'passive', family, points: data.points, source: raw, inline: false };
  }
  return null;
}
function failedSpanEnd(source, start, tag) {
  // Recovery never interprets attributes. It only recognizes an exact balanced
  // lexical boundary, including quoted > and nested same-name components.
  let pos = start, depth = 0, quote = '', braces = 0, closing = false, current = '';
  while (pos < source.length && pos - start <= RICH_LIMITS.span) {
    if (source[pos] !== '<') { pos++; continue; }
    const head = source.slice(pos).match(/^<(\/?)([A-Za-z][A-Za-z0-9-]*)(?=[\s/>])/);
    if (!head) { pos++; continue; }
    closing = !!head[1]; current = head[2]; pos += head[0].length; quote = ''; braces = 0;
    let previous = '', complete = false;
    while (pos < source.length && pos - start <= RICH_LIMITS.span) {
      const c = source[pos++];
      if (quote) { if (c === '\\') pos++; else if (c === quote) quote = ''; continue; }
      if (c === '"' || c === "'") quote = c;
      else if (c === '{') braces++;
      else if (c === '}') braces = Math.max(0, braces - 1);
      else if (c === '>' && braces === 0) { complete = true; break; }
      previous = c;
    }
    if (!complete) return source.length;
    if (current === tag) {
      if (closing) depth--; else if (previous !== '/') depth++;
      if (depth <= 0) return pos;
    }
  }
  // An unclosed component has no reliable nested/sibling boundary. Preserve its
  // complete remainder, instead of making a valid-looking widget out of a child.
  return source.length;
}
function opaqueMarker() {
  if (!globalThis.crypto?.getRandomValues) fail('Secure placeholder randomness unavailable');
  const bytes = new Uint32Array(4); globalThis.crypto.getRandomValues(bytes);
  return `TSRICH${Array.from(bytes, b => b.toString(16).padStart(8, '0')).join('')}END`;
}
/** Call before math protection so literal attribute values are never rewritten.
 * The bounded grammar excludes mathematics outside attributes. Placeholders contain 128 random
 * bits and are checked for absence from source; records never come from text. */
function prepareRichMarkdown(content) {
  const source = String(content ?? ''), records = new Map(), b = budget();
  if (!lexicalPreflight(source)) return { content: source, records, stats: b, literalOnly: true };
  let ranges; try { ranges = markdownProtectedRanges(source); } catch { return { content: source, records, stats: b, literalOnly: true }; }
  let output = '', last = 0, pos = 0, rangeIndex = 0;
  while (pos < source.length && records.size < RICH_LIMITS.fragments) {
    const mathEnd = protectedMathEnd(source, pos); if (mathEnd > pos) { pos = mathEnd; continue; }
    while (rangeIndex < ranges.length && ranges[rangeIndex][1] <= pos) rangeIndex++;
    if (ranges[rangeIndex] && ranges[rangeIndex][0] <= pos) { pos = ranges[rangeIndex][1]; continue; }
    if (Date.now() - b.started > RICH_LIMITS.milliseconds) break;
    const tag = !escaped(source, pos) && richTagAt(source, pos);
    let node = null, end = pos;
    if (tag) {
      const parser = new ComponentParser(source, pos, b, ranges);
      try { const ast = parser.element(); end = parser.pos; node = evaluate([ast], Object.create(null), b)[0]; }
      catch {
        // A failed coherent component remains exact, inert source; later siblings
        // are still considered. Never partially interpret its nested children.
        if (end > pos) { pos = end; continue; }
        end = failedSpanEnd(source, pos, tag);
        pos = Math.max(pos + 1, end); continue;
      }
    } else if (source.startsWith('genui', pos)) {
      const stop = source.indexOf('', pos + 7);
      if (stop >= 0 && stop - pos <= RICH_LIMITS.span) {
        end = stop + 1; const raw = source.slice(pos, end);
        try { node = legacyNode(parseLiteral(source.slice(pos + 7, stop), b), raw, b); if (node) tick(b, 'output', raw.length); } catch { /* preserve the original marker */ }
        if (!node) { pos = end; continue; }
      }
    }
    if (node) {
      let marker; try { marker = opaqueMarker(); while (source.includes(marker) || records.has(marker)) marker = opaqueMarker(); } catch { break; }
      b.fragments++; records.set(marker, node); output += source.slice(last, pos) + (node.inline ? marker : `\n\n${marker}\n\n`);
      last = end; pos = end;
    } else pos++;
  }
  return { content: output + source.slice(last), records, stats: b };
}

window.TSARich.Parser=Object.freeze({RICH_LIMITS,parseLiteral,safeRichUrl,markdownProtectedRanges,parseRichSpan,prepareRichMarkdown});
})();


/* rich-chart-interactions.js */
(function(){'use strict';

/** Trusted, transient chart inspection. No exported code or callbacks execute.
 * The serialized geometry is produced by rich-charts after bounded validation.
 * Root delegation survives the Reader's normal render-to-HTML pipeline.
 */
const roots = new WeakMap(), charts = new WeakMap(), activeByDocument = new WeakMap(), handled = new WeakSet();
let tooltipSequence = 0;
const finite = value => typeof value === 'number' && Number.isFinite(value);
function chartState(figure) {
  if (charts.has(figure)) return charts.get(figure);
  let items;
  try {
    const data = figure.dataset.chartInteraction;
    if (!data || data.length > 8_000_000) return null;
    items = JSON.parse(data);
    if (!Array.isArray(items) || !items.length || items.length > 1000 || items.some(item => !finite(item.x) || !finite(item.y) || typeof item.heading !== 'string' || !Array.isArray(item.rows) || item.rows.length > 10 || item.rows.some(row => typeof row.label !== 'string' || typeof row.value !== 'string' || !Number.isInteger(row.color) || row.color < 0 || row.color > 7))) return null;
  } catch { return null; }
  const state = {figure, items, svg: figure.querySelector('svg'), viewport: figure.querySelector('.rich-chart-viewport'), suppressed: -1, index: 0};
  state.nodes = items.map((_, i) => figure.querySelector(`.rich-chart-hit[data-chart-item="${i}"]`) || figure.querySelector(`[data-chart-item="${i}"]`));
  if (!state.svg || !state.viewport || state.nodes.some(node => !node)) return null;
  charts.set(figure, state); return state;
}
function screenPoint(state, item) {
  const m = state.svg.getScreenCTM?.();
  return m ? {x: m.a * item.x + m.c * item.y + m.e, y: m.b * item.x + m.d * item.y + m.f} : null;
}
function visiblePoint(state, point) {
  const doc = state.figure.ownerDocument, win = doc.defaultView;
  if (!state.figure.isConnected || !state.figure.getClientRects().length || !point) return false;
  if (point.x < 0 || point.y < 0 || point.x > win.innerWidth || point.y > win.innerHeight) return false;
  for (let node = state.viewport; node && node !== doc.body; node = node.parentElement) {
    const css = win.getComputedStyle(node);
    if (css.display === 'none' || css.visibility === 'hidden') return false;
    const box = node.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/.test(css.overflowX) && (point.x < box.left - 1 || point.x > box.right + 1)) return false;
    if (/(auto|scroll|hidden|clip)/.test(css.overflowY) && (point.y < box.top - 1 || point.y > box.bottom + 1)) return false;
  }
  return true;
}
function visibleAnchor(state, item, index) {
  let point = screenPoint(state, item);
  if (state.figure.dataset.chartType === 'scatter') return visiblePoint(state, point) ? point : null;
  const doc = state.figure.ownerDocument, win = doc.defaultView;
  if (!state.figure.isConnected || !state.figure.getClientRects().length || !point) return null;
  const target = state.nodes[index].getBoundingClientRect();
  const inPlot = state.viewport.contains(state.nodes[index]);
  if (!inPlot) point = {x: (target.left + target.right) / 2, y: (target.top + target.bottom) / 2};
  let left = Math.max(0, target.left), right = Math.min(win.innerWidth, target.right), top = Math.max(0, target.top), bottom = Math.min(win.innerHeight, target.bottom);
  for (let node = inPlot ? state.viewport : state.nodes[index].parentElement; node && node !== doc.body; node = node.parentElement) {
    const css = win.getComputedStyle(node), box = node.getBoundingClientRect();
    if (css.display === 'none' || css.visibility === 'hidden') return null;
    if (/(auto|scroll|hidden|clip)/.test(css.overflowX)) { left = Math.max(left, box.left); right = Math.min(right, box.right); }
    if (/(auto|scroll|hidden|clip)/.test(css.overflowY)) { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
  }
  if (right <= left || bottom <= top) return null;
  // Shared categories retain their true X/crosshair position even when only a
  // strip of the category target is visible. Bars anchor in the visible part.
  if (item.guide && (point.x < left || point.x > right)) return null;
  return {x: Math.max(left, Math.min(point.x, right)), y: Math.max(top, Math.min(point.y, bottom))};
}
function clearHighlight(state) {
  state.figure.classList.remove('has-chart-active');
  state.figure.querySelectorAll('.is-active').forEach(node => node.classList.remove('is-active'));
  const guide = state.figure.querySelector('.rich-chart-crosshair');
  if (guide) guide.setAttribute('visibility', 'hidden');
  state.figure.querySelectorAll('[aria-describedby]').forEach(node => { if (node.getAttribute('aria-describedby')?.startsWith('threadshelf-chart-tooltip-')) node.removeAttribute('aria-describedby'); });
}
function dismissChartInteractions(root) {
  const doc = root?.ownerDocument || root;
  const active = activeByDocument.get(doc);
  if (active && (root === doc || root === active.state.figure || root.contains?.(active.state.figure))) active.hide();
}
function show(state, index, origin) {
  if (!state.items[index] || state.suppressed === index) return;
  const doc = state.figure.ownerDocument, win = doc.defaultView, previous = activeByDocument.get(doc);
  if (previous?.state === state && previous.index === index) { previous.origin = origin; return; }
  previous?.hide();
  const item = state.items[index], point = visibleAnchor(state, item, index);
  if (!point) return;
  const panel = doc.createElement('div'); panel.className = 'rich-chart-tooltip'; panel.id = `threadshelf-chart-tooltip-${++tooltipSequence}`; panel.setAttribute('role', 'tooltip');
  const heading = doc.createElement('div'); heading.className = 'rich-chart-tooltip-heading'; heading.textContent = item.heading; panel.append(heading);
  for (const row of item.rows) {
    const line = doc.createElement('div'); line.className = 'rich-chart-tooltip-row';
    const swatch = doc.createElement('span'); swatch.className = `rich-chart-swatch rich-chart-color-${row.color}`; swatch.setAttribute('aria-hidden', 'true');
    const label = doc.createElement('span'); label.className = 'rich-chart-tooltip-label'; label.textContent = row.label;
    const value = doc.createElement('strong'); value.className = 'rich-chart-tooltip-value'; value.textContent = row.value;
    line.append(swatch, label, value); panel.append(line);
  }
  // The portal is outside overflow containers. Carry the active Reader theme,
  // including its independent high-contrast override, across that boundary.
  const css = win.getComputedStyle(state.figure);
  for (const name of ['--text-primary', '--text-secondary', '--bg-primary', '--bg-secondary', '--border-color', '--text-accent', '--accent-color', '--accent', '--danger', '--warning', '--muted', '--text', '--surface', '--border']) {
    const value = css.getPropertyValue(name); if (value) panel.style.setProperty(name, value);
  }
  panel.style.fontFamily = css.fontFamily; panel.style.fontSize = css.fontSize;
  if (state.figure.closest('.reader-high-contrast')) panel.classList.add('rich-chart-tooltip-high-contrast');
  doc.body.append(panel);
  state.figure.classList.add('has-chart-active');
  state.figure.querySelectorAll(`[data-chart-active="${index}"],.rich-chart-legend [data-chart-item="${index}"]`).forEach(node => node.classList.add('is-active'));
  const guide = state.figure.querySelector('.rich-chart-crosshair');
  if (guide && item.guide) { guide.setAttribute('x1', String(item.x)); guide.setAttribute('x2', String(item.x)); guide.setAttribute('visibility', 'visible'); }
  state.nodes[index].setAttribute('aria-describedby', panel.id);
  if (doc.activeElement === state.viewport || (state.figure.contains(doc.activeElement) && doc.activeElement?.dataset.chartItem === String(index))) doc.activeElement.setAttribute('aria-describedby', panel.id);
  state.index = index;
  let frame = 0, closed = false;
  const active = {state, index, origin, hide};
  const listeners = [];
  function listen(target, name, fn, options) { target.addEventListener(name, fn, options); listeners.push(() => target.removeEventListener(name, fn, options)); }
  function hide() {
    if (closed) return; closed = true;
    if (frame) win.cancelAnimationFrame(frame);
    listeners.forEach(remove => remove()); removal?.disconnect(); ancestors?.disconnect(); resize?.disconnect();
    panel.remove(); clearHighlight(state);
    if (activeByDocument.get(doc) === active) activeByDocument.delete(doc);
  }
  function position() {
    frame = 0;
    const anchor = visibleAnchor(state, item, index);
    if (!anchor) { hide(); return; }
    const reader = state.figure.closest('.reader-view')?.getBoundingClientRect();
    const vv = win.visualViewport;
    const bounds = {left: Math.max(8, reader?.left + 8 || 8, (vv?.offsetLeft || 0) + 8), top: Math.max(8, reader?.top + 8 || 8, (vv?.offsetTop || 0) + 8), right: Math.min(win.innerWidth - 8, reader?.right - 8 || Infinity, (vv?.offsetLeft || 0) + (vv?.width || win.innerWidth) - 8), bottom: Math.min(win.innerHeight - 8, reader?.bottom - 8 || Infinity, (vv?.offsetTop || 0) + (vv?.height || win.innerHeight) - 8)};
    // Measure the portal's screen-to-CSS scale: CSS zoom on any ancestor and
    // normal Chromium page/display scaling need not share SVG user units.
    panel.style.left = '0px'; panel.style.top = '0px';
    const origin = panel.getBoundingClientRect();
    panel.style.left = '100px'; panel.style.top = '100px';
    const probe = panel.getBoundingClientRect();
    const sx = (probe.left - origin.left) / 100 || 1, sy = (probe.top - origin.top) / 100 || 1;
    panel.style.maxWidth = `${Math.max(40, bounds.right - bounds.left) / sx}px`;
    panel.style.maxHeight = `${Math.max(40, bounds.bottom - bounds.top) / sy}px`;
    panel.classList.remove('rich-chart-tooltip-compact');
    if (panel.scrollHeight * sy > bounds.bottom - bounds.top) panel.classList.add('rich-chart-tooltip-compact');
    const box = panel.getBoundingClientRect();
    let x = anchor.x + 16, y = anchor.y - 12;
    if (x + box.width > bounds.right) x = anchor.x - box.width - 16;
    x = Math.max(bounds.left, Math.min(x, bounds.right - box.width));
    y = Math.max(bounds.top, Math.min(y, bounds.bottom - box.height));
    panel.style.left = `${(x - origin.left) / sx}px`; panel.style.top = `${(y - origin.top) / sy}px`;
  }
  function schedule() { if (!frame && !closed) frame = win.requestAnimationFrame(position); }
  function escape(event) { if (event.key === 'Escape') { state.suppressed = index; hide(); event.preventDefault(); } }
  const removal = win.MutationObserver ? new win.MutationObserver(schedule) : null;
  removal?.observe(doc.body, {childList: true, subtree: true});
  const ancestors = win.MutationObserver ? new win.MutationObserver(hide) : null;
  for (let node = state.figure.parentElement; node; node = node.parentElement) ancestors?.observe(node, {attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']});
  const resize = win.ResizeObserver ? new win.ResizeObserver(schedule) : null;
  resize?.observe(state.figure); resize?.observe(state.viewport);
  listen(doc, 'scroll', schedule, true); listen(win, 'resize', schedule); listen(doc, 'keydown', escape, true);
  listen(doc, 'pointerdown', event => { if (!state.figure.contains(event.target)) hide(); }, true);
  if (win.visualViewport) { listen(win.visualViewport, 'resize', schedule); listen(win.visualViewport, 'scroll', schedule); }
  activeByDocument.set(doc, active); position();
}
function pointerIndex(state, event) {
  if (state.figure.dataset.chartType === 'scatter' && state.svg.contains(event.target)) {
    // CSS-pixel hit radius remains stable under SVG resize/zoom. Equal-distance
    // overlaps choose source series order then source point order; arrows reach all.
    const m = state.svg.getScreenCTM?.(); if (!m) return -1;
    const doc = state.figure.ownerDocument, win = doc.defaultView;
    const bounds = {left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight};
    for (let node = state.viewport; node && node !== doc.body; node = node.parentElement) {
      const css = win.getComputedStyle(node), box = node.getBoundingClientRect();
      if (css.display === 'none' || css.visibility === 'hidden') return -1;
      if (/(auto|scroll|hidden|clip)/.test(css.overflowX)) { bounds.left = Math.max(bounds.left, box.left); bounds.right = Math.min(bounds.right, box.right); }
      if (/(auto|scroll|hidden|clip)/.test(css.overflowY)) { bounds.top = Math.max(bounds.top, box.top); bounds.bottom = Math.min(bounds.bottom, box.bottom); }
    }
    let best = -1, distance = 18 * 18;
    state.items.forEach((item, i) => {
      const x = m.a * item.x + m.c * item.y + m.e, y = m.b * item.x + m.d * item.y + m.f;
      if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return;
      const dx = x - event.clientX, dy = y - event.clientY, d = dx * dx + dy * dy;
      if (d < distance - 1e-7 || (best === -1 && d <= distance)) { best = i; distance = d; }
    });
    return best;
  }
  const target = event.target.closest?.('[data-chart-item]');
  return target?.closest('.rich-chart') === state.figure ? Number(target.dataset.chartItem) : -1;
}
/** Returns an idempotent disposer; each mounted root owns only five delegates. */
function mountChartInteractions(root) {
  if (roots.has(root)) return roots.get(root);
  function eventState(event) {
    const figure = event.target.closest?.('.rich-chart[data-chart-interaction]');
    return figure && (figure === root || root.contains(figure)) ? chartState(figure) : null;
  }
  function pointer(event) {
    if (handled.has(event)) return; const state = eventState(event); if (!state) return; handled.add(event);
    const index = pointerIndex(state, event);
    if (index < 0) { state.suppressed = -1; dismissChartInteractions(state.figure); return; }
    if (index !== state.suppressed) state.suppressed = -1;
    show(state, index, 'pointer');
  }
  function out(event) {
    const state = eventState(event); if (!state || state.figure.contains(event.relatedTarget)) return;
    state.suppressed = -1;
    const active = activeByDocument.get(state.figure.ownerDocument);
    if (active?.state === state && active.origin !== 'focus') active.hide();
  }
  function focus(event) {
    if (handled.has(event)) return; const state = eventState(event); if (!state) return; handled.add(event);
    const node = event.target.closest('[data-chart-item]');
    if (event.target !== state.viewport && !node) { dismissChartInteractions(state.figure); return; }
    const index = node ? Number(node.dataset.chartItem) : state.index;
    if (index !== state.suppressed) state.suppressed = -1;
    show(state, index, 'focus');
  }
  function blur(event) {
    const state = eventState(event); if (!state || state.figure.contains(event.relatedTarget)) return;
    state.suppressed = -1; dismissChartInteractions(state.figure);
  }
  function key(event) {
    if (handled.has(event)) return; const state = eventState(event); if (!state || (!event.target.closest('[data-chart-item]') && event.target !== state.viewport)) return;
    let index = Number(event.target.closest('[data-chart-item]')?.dataset.chartItem ?? state.index);
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') index = Math.min(state.items.length - 1, index + 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') index = Math.max(0, index - 1);
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = state.items.length - 1;
    else return;
    handled.add(event); event.preventDefault(); state.suppressed = -1;
    state.nodes[index].focus({preventScroll: true});
    state.nodes[index].scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'instant'});
    show(state, index, 'focus');
  }
  const events = [['pointermove', pointer], ['pointerout', out], ['focusin', focus], ['focusout', blur], ['keydown', key]];
  events.forEach(([name, fn]) => root.addEventListener(name, fn));
  let disposed = false;
  const dispose = () => { if (disposed) return; disposed = true; dismissChartInteractions(root); events.forEach(([name, fn]) => root.removeEventListener(name, fn)); roots.delete(root); };
  roots.set(root, dispose); return dispose;
}

window.TSARich.Interactions=Object.freeze({dismissChartInteractions,mountChartInteractions});
})();


/* rich-charts.js */
(function(){'use strict';
const {mountChartInteractions}=window.TSARich.Interactions;
/** Safe, render-only chart adapters. See docs/rich-chart-support.md.
 * All input is literal data. No exported DOM, CSS, callbacks, or resources run.
 */
const CHART_LIMITS = Object.freeze({ rows: 200, series: 8, points: 1000, depth: 12, nodes: 12000, text: 200000, string: 4096, magnitude: 1e15 });
const OWN_SCHEMA = 'threadshelf-chart';
const BAD_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const TYPES = new Set(['bar', 'line', 'area', 'pie', 'doughnut', 'scatter']);
const SVG_NS = 'http://www.w3.org/2000/svg';
const LABELS = Object.freeze({ richChart: 'Chart', richChartData: 'Exact values', richChartCategory: 'Category', richChartSeries: 'Series', richChartValue: 'Value', richChartUnavailable: 'Chart shown as saved data', richChartSource: 'Saved chart data', richChartLimit: 'Chart exceeds display limits', richChartX: 'X', richChartY: 'Y' });
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const fail = (reason) => { throw new Error(reason); };
const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
function keys(value, allowed) { if (!plain(value)) fail('schema'); for (const k of Object.keys(value)) if (!allowed.includes(k)) fail('unsupported'); }
function text(value, optional = true) { if (value === undefined && optional) return undefined; if (typeof value !== 'string' || value.length > CHART_LIMITS.string) fail('data'); return value; }
function num(value) { if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > CHART_LIMITS.magnitude) fail('data'); return value; }
function list(value, max, min = 1) { if (!Array.isArray(value) || value.length < min || value.length > max) fail('limit'); return value; }
// Inspect descriptors before reading properties: even a non-literal object passed
// by a future caller cannot trigger a getter while validating or falling back.
function snapshot(input) {
  let nodes = 0, chars = 0;
  const seen = new Set();
  function copy(v, depth) {
    if (++nodes > CHART_LIMITS.nodes || depth > CHART_LIMITS.depth) fail('limit');
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') { if (!Number.isFinite(v)) fail('data'); return v; }
    if (typeof v === 'string') { chars += v.length; if (v.length > CHART_LIMITS.string || chars > CHART_LIMITS.text) fail('limit'); return v; }
    if (typeof v !== 'object' || (!Array.isArray(v) && !plain(v)) || seen.has(v)) fail('schema');
    seen.add(v);
    const result = Array.isArray(v) ? [] : Object.create(null);
    const desc = Object.getOwnPropertyDescriptors(v);
    if (Object.getOwnPropertySymbols(desc).length) fail('schema');
    const names = Object.keys(desc);
    if (names.length > CHART_LIMITS.points + 1) fail('limit');
    for (const k of names) {
      if (Array.isArray(v) && k === 'length') continue;
      if (BAD_KEYS.has(k) || k.length > 128 || !own(desc[k], 'value')) fail('schema');
      if (Array.isArray(v) && !/^(0|[1-9][0-9]*)$/.test(k)) fail('schema');
      chars += k.length;
      if (chars > CHART_LIMITS.text) fail('limit');
      result[k] = copy(desc[k].value, depth + 1);
    }
    if (Array.isArray(v) && (result.length !== v.length || Object.keys(result).length !== v.length)) fail('data');
    seen.delete(v);
    return result;
  }
  return copy(input, 0);
}
function seriesInfo(s, allowed) {
  keys(s, allowed);
  const out = {};
  for (const k of ['label', 'valueSuffix', 'unit']) if (own(s, k)) out[k] = text(s[k], false);
  if (own(s, 'valueFormat')) { if (!['raw', 'integer'].includes(s.valueFormat)) fail('unsupported'); out.valueFormat = s.valueFormat; }
  if (out.valueSuffix && out.unit) fail('unsupported');
  return out;
}
function axis(a) {
  if (a === undefined) return {};
  keys(a, ['min', 'max', 'label', 'unit']);
  const out = {};
  for (const k of ['min', 'max']) if (own(a, k)) out[k] = num(a[k]);
  for (const k of ['label', 'unit']) if (own(a, k)) out[k] = text(a[k], false);
  if (out.min !== undefined && out.max !== undefined && out.min >= out.max) fail('data');
  return out;
}
function exported(input, family) {
  if (!['Chart', 'chart', 'charts_widget_v2'].includes(family)) fail('unsupported');
  // The native Chart component and both GenUI envelopes preserve the same
  // literal data contract. Do not reject supported charts because a converter
  // retained the component rather than a charts_widget_v2 wrapper.
  if (!['bar', 'line', 'pie', 'scatter'].includes(input.chartType)) fail('unsupported');
  const pie = input.chartType === 'pie', scatter = input.chartType === 'scatter';
  // In this evidenced bar contract vertically arranged categories mean
  // horizontally extending bars; other layout values remain unsupported.
  const allowed = ['chartType', 'meta', 'series', 'data', 'valueSuffix', ...(pie ? ['nameKey', 'valueKey'] : ['xKey', 'yAxisMin', 'yAxisMax'])];
  if (input.chartType === 'bar') allowed.push('layout');
  keys(input, allowed);
  if (own(input, 'layout') && input.layout !== 'vertical') fail('unsupported');
  const out = {schema: OWN_SCHEMA, version: 1, type: input.chartType, series: [], yAxis: {}, xAxis: {}};
  if (!scatter) out.categories = [];
  if (input.meta !== undefined) { keys(input.meta, ['title', 'description', 'footer']); for (const k of ['title', 'description', 'footer']) if (own(input.meta, k)) out[k] = text(input.meta[k], false); }
  const inheritedSuffix = own(input, 'valueSuffix') ? text(input.valueSuffix, false) : undefined;
  const categoryKey = text(pie ? input.nameKey : input.xKey, false);
  if (!categoryKey || BAD_KEYS.has(categoryKey)) fail('data');
  if (scatter) out.xAxis.label = categoryKey;
  else out.categoryLabel = categoryKey;
  const allSeries = list(input.series, pie ? 1 : CHART_LIMITS.series);
  out.series = allSeries.map(s => {
    const normalized = {...seriesInfo(s, ['dataKey', 'label', 'valueFormat', 'valueSuffix', 'unit']), dataKey: text(s.dataKey, false), ...(scatter ? {points: []} : {values: []})};
    // An explicit empty suffix/unit is deliberate and must not be overwritten.
    if (inheritedSuffix !== undefined && !own(normalized, 'valueSuffix') && !own(normalized, 'unit')) normalized.valueSuffix = inheritedSuffix;
    return normalized;
  });
  const seenKeys = new Set();
  for (const s of out.series) { if (!s.dataKey || BAD_KEYS.has(s.dataKey) || s.dataKey === categoryKey || seenKeys.has(s.dataKey)) fail('data'); seenKeys.add(s.dataKey); }
  if (pie && (text(input.valueKey, false) !== out.series[0].dataKey)) fail('unsupported');
  const rows = list(input.data, CHART_LIMITS.rows);
  if (rows.length * out.series.length > CHART_LIMITS.points) fail('limit');
  for (const row of rows) {
    // Unrecognized columns may encode errors/stacking. Preserve them in fallback.
    keys(row, [categoryKey, ...seenKeys]);
    if (scatter) {
      const x = num(row[categoryKey]);
      for (const s of out.series) s.points.push({x, y: num(row[s.dataKey])});
    } else {
      out.categories.push(text(row[categoryKey], false));
      for (const s of out.series) s.values.push(num(row[s.dataKey]));
    }
  }
  if (own(input, 'yAxisMin')) out.yAxis.min = num(input.yAxisMin);
  if (own(input, 'yAxisMax')) out.yAxis.max = num(input.yAxisMax);
  out.orientation = own(input, 'layout') ? 'horizontal' : 'vertical';
  // The same native pie contract uses a ring across its supported wrappers.
  // This is local presentation, not an inferred radius or changed chartType.
  if (pie) out.circularPresentation = 'ring';
  return out;
}
function readerOwned(input) {
  keys(input, ['schema', 'version', 'type', 'orientation', 'title', 'description', 'footer', 'categoryLabel', 'categories', 'series', 'xAxis', 'yAxis']);
  if (input.schema !== OWN_SCHEMA || input.version !== 1 || !TYPES.has(input.type)) fail('unsupported');
  const out = {schema: OWN_SCHEMA, version: 1, type: input.type, xAxis: axis(input.xAxis), yAxis: axis(input.yAxis)};
  for (const k of ['title', 'description', 'footer', 'categoryLabel']) if (own(input, k)) out[k] = text(input[k], false);
  if (input.orientation !== undefined && (input.type !== 'bar' || !['vertical', 'horizontal'].includes(input.orientation))) fail('unsupported');
  out.orientation = input.orientation || 'vertical';
  if (input.type === 'scatter') {
    if (input.categories !== undefined || input.categoryLabel !== undefined) fail('unsupported');
    out.series = list(input.series, CHART_LIMITS.series).map(s => ({...seriesInfo(s, ['label', 'points', 'valueSuffix', 'unit', 'valueFormat']), points: list(s.points, CHART_LIMITS.points).map(p => { keys(p, ['x', 'y', 'label']); return {x: num(p.x), y: num(p.y), ...(own(p, 'label') ? {label: text(p.label, false)} : {})}; })}));
    if (out.series.reduce((n, s) => n + s.points.length, 0) > CHART_LIMITS.points) fail('limit');
  } else {
    out.categories = list(input.categories, CHART_LIMITS.rows).map(v => text(v, false));
    out.series = list(input.series, ['pie', 'doughnut'].includes(input.type) ? 1 : CHART_LIMITS.series).map(s => ({...seriesInfo(s, ['label', 'values', 'valueSuffix', 'unit', 'valueFormat']), values: list(s.values, CHART_LIMITS.rows).map(num)}));
    if (out.series.some(s => s.values.length !== out.categories.length)) fail('data');
    if (out.series.length * out.categories.length > CHART_LIMITS.points) fail('limit');
    if (Object.keys(out.xAxis).some(k => k === 'min' || k === 'max')) fail('unsupported');
    if (['pie', 'doughnut'].includes(out.type) && (Object.keys(out.xAxis).length || Object.keys(out.yAxis).length)) fail('unsupported');
  }
  return out;
}
function chartDomain(values, requested = {}, zero = false) {
  let min = Math.min(...values), max = Math.max(...values);
  if (zero) { min = Math.min(0, min); max = Math.max(0, max); }
  if (requested.min !== undefined) { if (requested.min > min) fail('bounds'); min = requested.min; }
  if (requested.max !== undefined) { if (requested.max < max) fail('bounds'); max = requested.max; }
  if (min === max) { if (requested.min !== undefined && requested.max !== undefined) fail('bounds'); if (requested.max === undefined) max = min + (Math.abs(min) || 1); else min = max - (Math.abs(max) || 1); }
  if (!(max > min) || !Number.isFinite(max - min)) fail('bounds');
  return {min, max};
}
function validateDomains(c) {
  const suffixes = c.series.map(s => exactChartValue(0, s, c.yAxis).slice(1));
  // A common axis must not borrow one series' suffix when units differ.
  // Keep the original axis and series metadata intact for exact-value lookup.
  c.numericAxisSuffix = suffixes.every(s => s === suffixes[0]) ? suffixes[0] : '';
  if (['pie', 'doughnut'].includes(c.type)) {
    if (c.series[0].values.some(v => v < 0) || !c.series[0].values.some(v => v > 0)) fail('data');
    return;
  }
  const values = c.series.flatMap(s => c.type === 'scatter' ? s.points.map(p => p.y) : s.values);
  c.yDomain = chartDomain(values, c.yAxis, ['bar', 'area'].includes(c.type));
  if (c.type === 'scatter') c.xDomain = chartDomain(c.series.flatMap(s => s.points.map(p => p.x)), c.xAxis);
}
/** Never mutates input. Unknown schemas return a passive data snapshot. */
function normalizeChart(input, {family = 'Chart'} = {}) {
  let saved;
  try {
    saved = snapshot(input);
    const chart = saved.schema === OWN_SCHEMA ? readerOwned(saved) : exported(saved, family);
    validateDomains(chart);
    return {ok: true, chart};
  } catch (error) {
    return {ok: false, reason: error.message, payload: saved, title: typeof saved?.meta?.title === 'string' ? saved.meta.title : typeof saved?.title === 'string' ? saved.title : undefined};
  }
}
function exactChartValue(value, series = {}, axis = {}) {
  const numeric = Object.is(value, -0) ? '-0' : String(value);
  // Only an explicitly supplied axis unit may fill an absent series unit.
  // Preserve an explicit empty suffix/unit as well as the original series.
  const unit = own(series, 'unit') ? series.unit : axis.unit;
  const suffix = own(series, 'valueSuffix') ? series.valueSuffix : (unit ? ' ' + unit : '');
  return numeric + suffix;
}
function tr(t, key) { const value = typeof t === 'function' ? t(LABELS[key] || key) : undefined; return typeof value === 'string' && value ? value : (LABELS[key] || key); }
function el(doc, tag, cls, value) { const n = doc.createElement(tag); if (cls) n.className = cls; if (value !== undefined) n.textContent = value; return n; }
function svgEl(doc, tag, attrs, value) { const n = doc.createElementNS(SVG_NS, tag); for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, String(v)); if (value !== undefined) n.textContent = value; return n; }
function short(value, max = 28) { const a = Array.from(value); return a.length > max ? a.slice(0, max - 1).join('') + '…' : value; }
const coord = n => Math.round(n * 1000) / 1000;
function label(doc, svg, x, y, value, anchor = 'middle', cls = '') {
  const node = svgEl(doc, 'text', {x: coord(x), y: coord(y), 'text-anchor': anchor, class: 'rich-chart-label ' + cls, 'aria-label': value}, short(value));
  svg.append(node); return node;
}
function pointShape(doc, svg, tag, attrs, description, seriesIndex) {
  const node = svgEl(doc, tag, {...attrs, class: `rich-chart-mark rich-chart-color-${seriesIndex % 8}`, role: 'img', tabindex: '-1', 'aria-label': description});
  svg.append(node); return node;
}
function ticks(domain) { return Array.from({length: 5}, (_, i) => domain.min + (domain.max - domain.min) * (i / 4)); }
function tickText(n, a) { const display = Object.is(n, -0) ? '0' : String(Number(n.toPrecision(6))); return display + (own(a, 'valueSuffix') ? a.valueSuffix : a.unit ? ' ' + a.unit : ''); }
function seriesName(s, index, t) { return s.label ?? s.dataKey ?? `${tr(t, 'richChartSeries')} ${index + 1}`; }
function table(doc, c, t) {
  const details = el(doc, 'details', 'rich-chart-data');
  details.append(el(doc, 'summary', '', tr(t, 'richChartData')));
  const holder = el(doc, 'div', 'rich-chart-table-scroll'); holder.tabIndex = 0;
  holder.setAttribute('role', 'region'); holder.setAttribute('aria-label', tr(t, 'richChartData'));
  const tableNode = el(doc, 'table');
  tableNode.append(el(doc, 'caption', '', c.title || tr(t, 'richChartData')));
  const thead = el(doc, 'thead'), head = el(doc, 'tr');
  const headers = c.type === 'scatter' ? [tr(t, 'richChartSeries'), c.xAxis.label || tr(t, 'richChartX'), c.yAxis.label || tr(t, 'richChartY'), tr(t, 'richChartCategory')] : [c.categoryLabel || c.xAxis.label || tr(t, 'richChartCategory'), ...c.series.map((s, i) => seriesName(s, i, t))];
  for (const value of headers) { const th = el(doc, 'th', '', value); th.scope = 'col'; head.append(th); }
  thead.append(head); tableNode.append(thead); const body = el(doc, 'tbody');
  const rows = c.type === 'scatter' ? c.series.flatMap((s, i) => s.points.map(p => [seriesName(s, i, t), exactChartValue(p.x, {unit: c.xAxis.unit}), exactChartValue(p.y, s, c.yAxis), p.label || ''])) : c.categories.map((name, i) => [name, ...c.series.map(s => exactChartValue(s.values[i], s, c.yAxis))]);
  for (const row of rows) { const r = el(doc, 'tr'); row.forEach((v, i) => { const cell = el(doc, i === 0 ? 'th' : 'td', '', v); if (i === 0) cell.scope = 'row'; r.append(cell); }); body.append(r); }
  tableNode.append(body); holder.append(tableNode); details.append(holder); return details;
}
function chartSvg(doc, c, t, width, height) {
  const svg = svgEl(doc, 'svg', {viewBox: `0 0 ${width} ${height}`, width, height, role: 'group', 'aria-label': c.title || tr(t, 'richChart')});
  svg.append(svgEl(doc, 'desc', {}, tr(t, 'Use arrow keys to inspect values; Escape dismisses. Exact values are available below.')));
  return svg;
}
function row(c, s, si, value, t) { return {label: seriesName(s, si, t), value: exactChartValue(value, s, c.yAxis), color: si % 8}; }
function registerItem(items, node, marks, item) {
  const i = items.length;
  node?.setAttribute('data-chart-item', String(i));
  node?.setAttribute('tabindex', '-1');
  node?.setAttribute('role', 'img');
  node?.setAttribute('aria-label', [item.heading, ...item.rows.map(r => `${r.label}: ${r.value}`)].join(' — '));
  for (const mark of marks) { mark.setAttribute('data-chart-active', String(i)); mark.setAttribute('data-chart-item', String(i)); }
  items.push(item);
  return i;
}
function cartesian(doc, c, t) {
  const horizontal = c.type === 'bar' && c.orientation === 'horizontal';
  const count = c.categories?.length || 0;
  const width = horizontal ? 680 : Math.max(640, Math.min(12000, count * Math.max(112, c.series.length * 38)));
  const height = horizontal ? Math.max(320, 92 + count * Math.max(40, c.series.length * 23)) : 370;
  const valueWidth = horizontal ? Math.min(220, Math.max(90, ...c.series.flatMap(s => s.values.map(v => exactChartValue(v, s, c.yAxis).length * 7 + 22)))) : 42;
  const left = horizontal ? 220 : 88, right = valueWidth, top = 32, bottom = horizontal ? 56 : 90;
  const pw = width - left - right, ph = height - top - bottom;
  const svg = chartSvg(doc, c, t, width, height), items = [];
  const d = c.yDomain, scale = v => (v - d.min) / (d.max - d.min);
  const y = v => top + ph * (1 - scale(v)), xValue = v => left + pw * scale(v);
  for (const value of ticks(d)) {
    const pos = horizontal ? xValue(value) : y(value);
    svg.append(svgEl(doc, 'line', horizontal ? {x1: coord(pos), x2: coord(pos), y1: top, y2: top + ph, class: 'rich-chart-grid'} : {x1: left, x2: left + pw, y1: coord(pos), y2: coord(pos), class: 'rich-chart-grid'}));
    label(doc, svg, horizontal ? pos : left - 10, horizontal ? top + ph + 22 : pos + 4, tickText(value, {valueSuffix: c.numericAxisSuffix ?? exactChartValue(0, {}, c.yAxis).slice(1)}), horizontal ? 'middle' : 'end');
  }
  if (d.min <= 0 && d.max >= 0) svg.append(svgEl(doc, 'line', horizontal ? {x1: coord(xValue(0)), x2: coord(xValue(0)), y1: top, y2: top + ph, class: 'rich-chart-baseline'} : {x1: left, x2: left + pw, y1: coord(y(0)), y2: coord(y(0)), class: 'rich-chart-baseline'}));
  const slot = (horizontal ? ph : pw) / Math.max(1, count);
  const guide = svgEl(doc, 'line', {class: 'rich-chart-crosshair', y1: top, y2: top + ph, 'aria-hidden': 'true', visibility: 'hidden'});
  svg.append(guide);
  if (c.type === 'scatter') {
    const xd = c.xDomain, xp = v => left + pw * ((v - xd.min) / (xd.max - xd.min));
    for (const v of ticks(xd)) label(doc, svg, xp(v), top + ph + 22, tickText(v, c.xAxis));
    c.series.forEach((s, si) => s.points.forEach((p, pi) => {
      const x = coord(xp(p.x)), py = coord(y(p.y));
      const heading = p.label || seriesName(s, si, t);
      const rows = [{label: c.xAxis.label || tr(t, 'richChartX'), value: exactChartValue(p.x, {unit: c.xAxis.unit}), color: si % 8}, {label: `${seriesName(s, si, t)} · ${c.yAxis.label || tr(t, 'richChartY')}`, value: exactChartValue(p.y, s, c.yAxis), color: si % 8}];
      const mark = pointShape(doc, svg, 'circle', {cx: x, cy: py, r: 5, 'data-series-index': si, 'data-point-index': pi}, `${heading} — ${rows.map(r => `${r.label}: ${r.value}`).join('; ')}`, si);
      registerItem(items, mark, [mark], {heading, rows, x, y: py, guide: true});
    }));
  } else {
    c.categories.forEach((category, i) => label(doc, svg, horizontal ? left - 12 : left + slot * (i + 0.5), horizontal ? top + slot * (i + 0.5) + 4 : top + ph + 46, category, horizontal ? 'end' : 'middle'));
    const categoryMarks = c.categories.map(() => []), hits = [];
    c.series.forEach((s, si) => {
      const points = s.values.map((value, i) => [left + slot * (i + 0.5), y(value)]);
      if (c.type === 'line' || c.type === 'area') {
        if (c.type === 'area') svg.append(svgEl(doc, 'path', {d: `M ${coord(points[0][0])} ${coord(y(0))} L ${points.map(p => p.map(coord).join(' ')).join(' L ')} L ${coord(points.at(-1)[0])} ${coord(y(0))} Z`, class: `rich-chart-area rich-chart-color-${si}`}));
        svg.append(svgEl(doc, 'polyline', {points: points.map(p => p.map(coord).join(',')).join(' '), class: `rich-chart-line rich-chart-color-${si}`}));
      }
      s.values.forEach((value, i) => {
        const description = `${c.categories[i]} — ${seriesName(s, si, t)}: ${exactChartValue(value, s, c.yAxis)}`;
        if (c.type === 'bar') {
          const band = slot * .72 / c.series.length, start = (horizontal ? top : left) + slot * (i + .14) + si * band;
          const a = horizontal ? xValue(0) : y(0), b = horizontal ? xValue(value) : y(value);
          const attrs = horizontal ? {x: coord(Math.min(a, b)), y: coord(start), width: coord(Math.abs(b - a)), height: coord(band * .9)} : {x: coord(start), y: coord(Math.min(a, b)), width: coord(band * .9), height: coord(Math.abs(b - a))};
          const mark = pointShape(doc, svg, 'rect', {...attrs, 'data-category-index': i, 'data-series-index': si}, description, si);
          // The transparent hit target alone grows at zero; the source-value bar keeps its true zero geometry.
          const hit = svgEl(doc, 'rect', {...attrs, x: attrs.x - (horizontal ? Math.max(0, (12 - attrs.width) / 2) : 0), y: attrs.y - (horizontal ? 0 : Math.max(0, (12 - attrs.height) / 2)), width: horizontal ? Math.max(12, attrs.width) : attrs.width, height: horizontal ? attrs.height : Math.max(12, attrs.height), class: 'rich-chart-hit'});
          registerItem(items, hit, [mark], {heading: c.categories[i], rows: [row(c, s, si, value, t)], x: coord(horizontal ? (a + b) / 2 : start + band * .45), y: coord(horizontal ? start + band * .45 : (a + b) / 2)});
          mark.setAttribute('data-chart-item', hit.getAttribute('data-chart-item')); hits.push(hit);
          if (count * c.series.length <= 24) label(doc, svg, horizontal ? left + pw + 12 : start + band * .45, horizontal ? start + band * .65 : b + (value < 0 ? 18 : -7), exactChartValue(value, s, c.yAxis), horizontal ? 'start' : 'middle', 'rich-chart-value');
        } else categoryMarks[i].push(pointShape(doc, svg, 'circle', {cx: coord(points[i][0]), cy: coord(points[i][1]), r: 4, 'data-category-index': i, 'data-series-index': si}, description, si));
      });
    });
    if (c.type === 'line' || c.type === 'area') c.categories.forEach((category, i) => {
      const hit = svgEl(doc, 'rect', {x: coord(left + slot * i), y: top - 6, width: coord(slot), height: ph + 12, class: 'rich-chart-hit'});
      registerItem(items, hit, categoryMarks[i], {heading: category, rows: c.series.map((s, si) => row(c, s, si, s.values[i], t)), x: coord(left + slot * (i + .5)), y: coord(top + ph / 2), guide: true}); hits.push(hit);
    });
    svg.append(...hits);
  }
  if (c.yAxis.label) label(doc, svg, horizontal ? left + pw / 2 : left, horizontal ? height - 6 : 17, c.yAxis.label, horizontal ? 'middle' : 'start');
  if (c.xAxis.label || c.categoryLabel) label(doc, svg, horizontal ? left - 12 : left + pw / 2, horizontal ? 17 : height - 14, c.xAxis.label || c.categoryLabel, horizontal ? 'end' : 'middle');
  return {svg, items};
}
function circular(doc, c, t) {
  const svg = chartSvg(doc, c, t, 640, 300), items = [];
  const s = c.series[0], total = s.values.reduce((a, b) => a + b, 0), cx = 320, cy = 150, r = 120, inner = c.type === 'doughnut' || c.circularPresentation === 'ring' ? 68 : 0;
  let angle = -Math.PI / 2;
  s.values.forEach((value, i) => {
    const part = total > 0 ? value / total : 0, end = angle + Math.PI * 2 * part, middle = angle + Math.PI * part;
    const point = (a, radius) => [coord(cx + Math.cos(a) * radius), coord(cy + Math.sin(a) * radius)].join(' ');
    const rows = [{...row(c, s, 0, value, t), color: i % 8}];
    if (total > 0) rows.push({label: tr(t, 'Share of total (calculated)'), value: `${Number((part * 100).toPrecision(6))}%`, color: i % 8});
    let mark;
    if (value > 0) {
      let path = `M ${point(angle, r)} A ${r} ${r} 0 0 1 ${point(middle, r)} A ${r} ${r} 0 0 1 ${point(end, r)}`;
      path += inner ? ` L ${point(end, inner)} A ${inner} ${inner} 0 0 0 ${point(middle, inner)} A ${inner} ${inner} 0 0 0 ${point(angle, inner)} Z` : ` L ${cx} ${cy} Z`;
      mark = pointShape(doc, svg, 'path', {d: path, 'data-category-index': i}, `${c.categories[i]} — ${rows.map(r => `${r.label}: ${r.value}`).join('; ')}`, i);
    }
    registerItem(items, mark, mark ? [mark] : [], {heading: c.categories[i], rows, x: coord(cx + Math.cos(middle) * (inner + r) / 2), y: coord(cy + Math.sin(middle) * (inner + r) / 2)});
    angle = end;
  });
  return {svg, items};
}
function legend(doc, c, t) {
  const out = el(doc, 'ul', 'rich-chart-legend');
  const circular = ['pie', 'doughnut'].includes(c.type);
  const entries = circular ? c.categories.map((name, i) => `${name}: ${exactChartValue(c.series[0].values[i], c.series[0])}`) : c.series.map((s, i) => seriesName(s, i, t));
  entries.forEach((value, i) => { const item = el(doc, 'li'); const swatch = el(doc, 'span', `rich-chart-swatch rich-chart-color-${i % 8}`); swatch.setAttribute('aria-hidden', 'true'); item.append(swatch, doc.createTextNode(value)); if (circular) { item.dataset.chartItem = String(i); item.tabIndex = -1; item.setAttribute('aria-label', value); } out.append(item); });
  return out;
}
function renderChart(input, {document: doc = globalThis.document, t, family = 'Chart'} = {}) {
  if (!doc?.createElementNS) throw new TypeError('A DOM document is required');
  const result = normalizeChart(input, {family});
  const figure = el(doc, 'figure', 'rich-chart');
  if (!result.ok) {
    figure.classList.add('rich-chart-fallback');
    figure.append(el(doc, 'figcaption', '', result.title || tr(t, 'richChartUnavailable')));
    if (result.title) figure.append(el(doc, 'p', 'rich-chart-description', tr(t, 'richChartUnavailable')));
    const details = el(doc, 'details'); details.append(el(doc, 'summary', '', tr(t, 'richChartSource')));
    details.append(el(doc, 'pre', 'rich-chart-source', result.payload === undefined ? tr(t, result.reason === 'limit' ? 'richChartLimit' : 'richChartUnavailable') : JSON.stringify(result.payload, null, 2)));
    figure.append(details); return figure;
  }
  const c = result.chart;
  figure.dataset.chartType = c.type;
  if (c.circularPresentation) figure.dataset.chartPresentation = c.circularPresentation;
  if (c.title) figure.append(el(doc, 'figcaption', '', c.title));
  if (c.description) figure.append(el(doc, 'p', 'rich-chart-description', c.description));
  const viewport = el(doc, 'div', 'rich-chart-viewport'); viewport.tabIndex = 0; viewport.setAttribute('role', 'region'); viewport.setAttribute('aria-label', c.title || tr(t, 'richChart'));
  viewport.setAttribute('aria-description', tr(t, 'Use arrow keys to inspect values; Escape dismisses. Exact values are available below.'));
  const drawing = ['pie', 'doughnut'].includes(c.type) ? circular(doc, c, t) : cartesian(doc, c, t);
  // Trusted transient geometry and display strings survive the normal HTML serialization route.
  // They never replace the saved message or create archive/analytics records.
  figure.dataset.chartInteraction = JSON.stringify(drawing.items);
  viewport.append(drawing.svg);
  figure.append(viewport, legend(doc, c, t), table(doc, c, t));
  if (c.footer) figure.append(el(doc, 'p', 'rich-chart-footer', c.footer));
  mountChartInteractions(figure);
  return figure;
}

window.TSARich.Charts=Object.freeze({CHART_LIMITS,chartDomain,normalizeChart,exactChartValue,renderChart});
})();


/* rich-context.js */
(function(){'use strict';

// Transient, message-scoped citation bindings. Never changes archived turns/raw.
// Only the observed grouped_webpages.items[].refs tuple contract is recognized.
const plain = value => value !== null && typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const own = (value, key) => {
  if (!plain(value) || ['__proto__', 'prototype', 'constructor'].includes(key)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
};
const bounded = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
const empty = Object.freeze({ references: Object.freeze(Object.create(null)) });
function safeUrl(value) {
  if (!bounded(value, 4096) || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? value : null;
  } catch { return null; }
}
function referencesFor(message) {
  const records = own(own(message, 'metadata'), 'content_references');
  if (!Array.isArray(records) || records.length > 1024) return empty;
  const references = Object.create(null), conflicts = new Set();
  let budget = 4096;
  for (const record of records) {
    if (own(record, 'type') !== 'grouped_webpages') continue;
    const items = own(record, 'items');
    if (!Array.isArray(items) || items.length > 256) continue;
    for (const item of items) {
      if (--budget < 0) return empty;
      const url = safeUrl(own(item, 'url')), refs = own(item, 'refs');
      if (!url || !Array.isArray(refs) || refs.length > 256) continue;
      const titleValue = own(item, 'title');
      const title = bounded(titleValue, 2048) ? titleValue : url;
      for (const ref of refs) {
        if (--budget < 0) return empty;
        const turn = own(ref, 'turn_index'), index = own(ref, 'ref_index'), type = own(ref, 'ref_type');
        if (!Number.isSafeInteger(turn) || turn < 0 || !Number.isSafeInteger(index) || index < 0 || !['search', 'view'].includes(type)) continue;
        const id = `turn${turn}${type}${index}`;
        if (conflicts.has(id)) continue;
        if (references[id] && references[id].url !== url) { delete references[id]; conflicts.add(id); continue; }
        references[id] = Object.freeze({url, title});
      }
    }
  }
  return Object.keys(references).length ? Object.freeze({references: Object.freeze(references)}) : empty;
}
function createRichContextResolver(thread) {
  const mapping = own(own(thread, 'raw'), 'mapping');
  if (!plain(mapping)) return () => empty;
  const ids = Object.keys(mapping);
  if (ids.length > 20000) return () => empty;
  const messages = new Map(), duplicates = new Set(), cache = new WeakMap();
  for (const id of ids) {
    const message = own(own(mapping, id), 'message'), messageId = own(message, 'id');
    if (!bounded(messageId, 256)) continue;
    if (messages.has(messageId)) duplicates.add(messageId);
    else messages.set(messageId, message);
  }
  return turn => {
    const messageId = own(turn, 'source_message_id'), nodeId = own(turn, 'source_node_id');
    if (!bounded(messageId, 256)) return empty;
    let message;
    if (bounded(nodeId, 256)) {
      message = own(own(mapping, nodeId), 'message');
      if (own(message, 'id') !== messageId) return empty;
    } else {
      if (duplicates.has(messageId)) return empty;
      message = messages.get(messageId);
    }
    if (!plain(message)) return empty;
    if (!cache.has(message)) cache.set(message, referencesFor(message));
    return cache.get(message);
  };
}

window.TSARich.Context=Object.freeze({createRichContextResolver});
})();


/* rich-renderer.js */
(function(){'use strict';
const {renderChart}=window.TSARich.Charts; const {safeRichUrl,markdownProtectedRanges}=window.TSARich.Parser;

const SVG = 'http://www.w3.org/2000/svg';
// App-owned, simple line icons. Exported names never become markup or URLs.
const ICONS = Object.freeze({
  'arrow-right': ['M4 12h16', 'm13 5 7 7-7 7'],
  'arrow-down-up': ['M7 3v18', 'm3 17 4 4 4-4', 'M17 21V3', 'm13 7 4-4 4 4'],
  'check-circle': ['M22 11v1a10 10 0 1 1-5.9-9.1', 'm8 11 3 3L22 3'],
  'alert-circle': ['M12 8v5', 'M12 16h.01', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'],
  download: ['M12 3v12', 'm7 10 5 5 5-5', 'M4 17v4h16v-4'],
  'file-text': ['M14 2H5v20h14V7z', 'M14 2v6h5', 'M8 12h8', 'M8 16h8'],
  'file-code': ['M14 2H5v20h14V7z', 'M14 2v6h5', 'm10 12-3 3 3 3', 'm14 12 3 3-3 3'],
  server: ['M3 3h18v7H3z', 'M3 14h18v7H3z', 'M6 6h.01', 'M6 17h.01'],
  database: ['M20 6a8 3 0 1 1-16 0 8 3 0 1 1 16 0', 'M4 6v12c0 4 16 4 16 0V6', 'M4 12c0 4 16 4 16 0'],
  sparkles: ['m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z', 'M20 2v4', 'M18 4h4'],
  archive: ['M3 3h18v5H3z', 'M5 8v13h14V8', 'M9 12h6'],
  'badge-check': ['m12 2 3 2 3.5.5.5 3.5 3 4-3 4-.5 3.5-3.5.5-3 2-3-2-3.5-.5L5 16l-3-4 3-4 .5-3.5L9 4z', 'm8 12 3 3 5-6'],
  'file-search': ['M14 2H4v20h12', 'M14 2v6h6v4', 'M20 8l-6-6', 'M20 16a4 4 0 1 1-8 0 4 4 0 1 1 8 0', 'm19 19 3 3'],
  'layout-dashboard': ['M3 3h7v10H3z', 'M14 3h7v6h-7z', 'M3 17h7v4H3z', 'M14 13h7v8h-7z'],
  'panels-top-left': ['M3 3h18v18H3z', 'M3 8h18', 'M9 8v13', 'M6 5.5h.01', 'M9 5.5h.01'],
  type: ['M4 6V3h16v3', 'M12 3v18', 'M8 21h8'],
});
function el(document, tag, className, text) {
  const e = document.createElement(tag); if (className) e.className = className;
  if (text !== undefined) e.textContent = text; return e;
}
function dedent(source) {
  const lines = source.replace(/^\n/, '').split('\n');
  const amounts = lines.filter(line => line.trim()).map(line => line.match(/^ */)[0].length);
  const indent = amounts.length ? Math.min(...amounts) : 0;
  return lines.map(line => line.slice(Math.min(indent, line.match(/^ */)[0].length))).join('\n');
}
function randomMarker() {
  const words = new Uint32Array(4); globalThis.crypto.getRandomValues(words);
  return `TSRICHCHILD${Array.from(words, x => x.toString(16).padStart(8, '0')).join('')}END`;
}
function iconNode(name, options) {
  const { document } = options;
  if (!Object.hasOwn(ICONS, name)) return el(document, 'span', 'rich-icon-fallback', '◇');
  const svg = document.createElementNS(SVG, 'svg'); svg.setAttribute('viewBox', '0 0 24 24');
  svg.classList.add('rich-icon'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  for (const d of ICONS[name]) {
    const path = document.createElementNS(SVG, 'path'); path.setAttribute('d', d);
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.6');
    path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round'); svg.append(path);
  }
  return svg;
}
function applyProperties(element, tag, a) {
  if (a.border) element.classList.add('rich-border');
  if (a.clip) element.classList.add('rich-clip');
  if (a.tabularNums) element.classList.add('rich-tabular');
  if (a.inline) element.classList.add('rich-inline');
  if (a.gap !== undefined) element.style.gap = `${a.gap * .25}rem`;
  if (a.padding !== undefined) element.style.padding = `${a.padding * .25}rem`;
  for (const key of ['width', 'height', 'minWidth', 'maxWidth']) if (a[key] !== undefined) element.style[key] = key === 'minWidth' ? `min(${a[key]}, 100%)` : a[key];
  if (tag === 'box' && a.size) { element.style.width = a.size; element.style.height = a.size; }
  if (a.flex !== undefined) { element.style.flex = `${Number(a.flex)} 1 0px`; element.classList.add('rich-flex-item'); }
  if (a.radius) element.classList.add(`rich-radius-${a.radius}`);
  if (a.direction) element.classList.add(`rich-direction-${a.direction}`);
  if (a.align) element.classList.add(`rich-align-${a.align}`);
  if (a.justify) element.classList.add(`rich-justify-${a.justify}`);
  if (a.textAlign) element.style.textAlign = a.textAlign;
  if (a.wrap) element.style.flexWrap = a.wrap;
  if (a.weight) element.classList.add(`rich-weight-${a.weight}`);
  if (a.color) element.classList.add(`rich-color-${a.color}`);
  if (a.size && tag !== 'box') element.classList.add(`rich-size-${a.size}`);
  if (a.background) {
    if (a.background[0] === '#') { element.style.backgroundColor = a.background; element.classList.add('rich-explicit-color'); }
    else element.classList.add(`rich-${a.background}`);
  }
  if (a.columns) element.style.setProperty('--rich-columns', String(a.columns));
}
function staticSvgNode(node, options) {
  const { document, t } = options;
  const element = document.createElementNS(SVG, node.tag);
  const names = { strokeWidth: 'stroke-width', strokeLinecap: 'stroke-linecap', strokeLinejoin: 'stroke-linejoin', fillOpacity: 'fill-opacity', strokeOpacity: 'stroke-opacity' };
  for (const [key, value] of Object.entries(node.attrs)) element.setAttribute(names[key] || key, value);
  if (node.tag === 'svg') {
    element.classList.add('rich-static-svg'); element.setAttribute('role', 'img');
    element.setAttribute('aria-label', t('Archived illustration')); element.setAttribute('focusable', 'false');
  }
  for (const child of node.children) element.append(staticSvgNode(child, options));
  return element;
}
function markProgressFill(element, node) {
  // Recognize the bounded, empty percentage-fill pattern from saved layouts.
  // Card surfaces are otherwise left untouched, including explicit swatches.
  const a = node.attrs, meaningful = node.children.filter(c => c.kind !== 'markdown' || c.text.trim());
  // A saved allocation bar uses positive flex weights instead of percentages.
  // Keep its children out of the responsive card minimum-width rule, which
  // otherwise enlarges a small segment and changes the represented ratio.
  if (node.tag === 'box' && a.direction === 'row' && /^\d+(?:\.\d+)?px$/.test(a.height || '') && parseFloat(a.height) > 0 && parseFloat(a.height) <= 32 && a.clip && a.radius === 'full' && /^surface-(?:secondary|tertiary)$/.test(a.background || '') && !a.gap && !a.padding && meaningful.length === 2 && meaningful.every(child => child.tag === 'box' && Number(child.attrs?.flex) > 0 && child.attrs.background && Object.keys(child.attrs).every(key => ['flex', 'background'].includes(key)) && !child.children.some(c => c.kind !== 'markdown' || c.text.trim()))) {
    const segments = [...element.querySelectorAll(':scope > .rich-box')];
    if (segments.length === meaningful.length) {
      element.classList.add('rich-allocation-track');
      segments.forEach((segment, i) => {
        segment.classList.add('rich-allocation-segment');
        const paint = meaningful[i].attrs.background;
        if (paint[0] === '#') segment.style.setProperty('--rich-allocation-paint', paint);
      });
    }
    return;
  }
  if (node.tag !== 'box' || a.width !== '100%' || !/^\d+(?:\.\d+)?px$/.test(a.height || '') || parseFloat(a.height) > 32 || !a.clip || a.radius !== 'full' || !/^surface-(?:secondary|tertiary)$/.test(a.background || '') || meaningful.length !== 1) return;
  const child = meaningful[0], fill = child.attrs;
  if (child.tag !== 'box' || !/^\d+(?:\.\d+)?%$/.test(fill?.width || '') || ![a.height, '100%'].includes(fill.height) || child.children.some(c => c.kind !== 'markdown' || c.text.trim())) return;
  const fillElement = element.querySelector(':scope > .rich-box'); if (!fillElement) return;
  element.classList.add('rich-progress-track'); fillElement.classList.add('rich-progress-fill');
  if (/^surface-(?:secondary|tertiary)$/.test(fill.background || '')) fillElement.classList.add('rich-progress-neutral-fill');
}
function referenceNode(attrs, options) {
  const { document, context, t } = options;
  const span = el(document, 'span', 'rich-citation'); const ids = attrs.refs || [attrs.ref];
  const references = context.references, missingIds = [];
  ids.forEach(id => {
    const record = references instanceof Map ? references.get(id)
      : references && Object.hasOwn(references, id) ? references[id] : null;
    const url = record && safeRichUrl(record.url);
    if (url) {
      // A short host label keeps references from taking over the paragraph.
      // The complete archived title and identity remain available to assistive
      // technology and in the tooltip. No remote favicon request is made.
      const host = new URL(url).hostname.replace(/^www\./, '');
      const a = el(document, 'a', 'rich-citation-link', host || record.title || id); a.href = url;
      a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.title = `${record.title || url}\n${id}`; a.setAttribute('aria-label', `${record.title || url} (${id})`); span.append(a);
    } else missingIds.push(id);
  });
  if (missingIds.length) {
    // List-only search results have no reference binding. Never guess a source
    // from an entry's order/title. Preserve all exact IDs without displaying
    // a long, implementation-specific identifier in the reading paragraph.
    const label = t('Source unavailable');
    const missing = el(document, 'span', 'rich-citation-unresolved', label + (missingIds.length > 1 ? ` +${missingIds.length - 1}` : ''));
    missing.title = `${label}: ${missingIds.join(', ')}`; missing.setAttribute('aria-label', missing.title); span.append(missing);
  }
  return span;
}
function imagePlaceholderDesign(attrs, ancestors = []) {
  // Source-sized thumbnails stay compact even if a row wraps on a narrow
  // screen. An explicit full-width slot remains a landscape at every size.
  // A cap takes precedence over width="100%"; no query text is classified.
  const compact = value => value?.endsWith('px') && parseFloat(value) <= 320;
  if (compact(attrs.width) || compact(attrs.maxWidth)) return 'corner-aperture';
  if (attrs.width === '100%') return 'soft-horizon';
  return ancestors.some(node => node.tag === 'row' || node.attrs?.direction === 'row') ? 'corner-aperture' : 'soft-horizon';
}
function placeholderSvg(document, className, viewBox, parts) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.classList.add(className); svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  for (const [tag, attrs] of parts) {
    const part = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attrs)) part.setAttribute(key, value);
    svg.append(part);
  }
  return svg;
}
function unavailableImageNode(tag, attrs, options) {
  const { document, t } = options;
  const area = el(document, 'div', 'rich-image-unavailable');
  const label = t('Image unavailable offline');
  const queries = tag === 'AsyncImageGroup' ? attrs.query || [] : attrs.query ? [attrs.query] : [];
  const description = queries.join(' · ');
  const width = attrs.width || attrs.maxWidth;
  // The export stores a query, not the selected image or its URL. Keep its
  // declared slot beside the accompanying prose, including full-width images;
  // never execute the query or substitute an unrelated photograph.
  if (tag === 'AsyncImage') {
    const design = imagePlaceholderDesign(attrs, options.imageAncestors);
    const wide = design === 'soft-horizon';
    area.classList.add('rich-image-placeholder', `rich-image-${design}`);
    area.dataset.placeholderDesign = design;
    if (width) area.style.width = `min(${width}, 100%)`;
    if (attrs.maxWidth) area.style.maxWidth = `min(${attrs.maxWidth}, 100%)`;
    if (attrs.aspectRatio) area.style.aspectRatio = attrs.aspectRatio.replace(':', ' / ');
    // Without both dimensions, retain in-flow content for intrinsic sizing.
    // Absolutely positioned artwork alone would collapse a ratio-only row.
    if (!attrs.aspectRatio || !width) area.classList.add('rich-image-natural');
    area.setAttribute('role', 'img'); area.setAttribute('aria-label', [label, description].filter(Boolean).join(': '));
    area.title = [label, description].filter(Boolean).join(': ');
    if (wide) {
      // Terrain stretches with the archived slot; its glyph, sun and caption
      // keep their intended pixel size. These app-owned paths contain no URLs.
      const terrain = placeholderSvg(document, 'rich-image-horizon', '0 0 100 100', [
        ['path', { class: 'rich-image-horizon-back', d: 'M0 80 Q24 45 48 81 T100 70 V100H0Z' }],
        ['path', { class: 'rich-image-horizon-front', d: 'M0 94 Q28 69 53 91 T100 86 V100H0Z' }],
      ]);
      terrain.setAttribute('preserveAspectRatio', 'none'); area.append(terrain);
      area.append(placeholderSvg(document, 'rich-image-horizon-sun', '0 0 24 24', [['circle', { cx: '12', cy: '12', r: '12' }]]));
      area.append(placeholderSvg(document, 'rich-image-placeholder-icon', '0 0 32 32', [
        ['rect', { x: '3.5', y: '4.5', width: '25', height: '23', rx: '3' }],
        ['circle', { cx: '11', cy: '12', r: '2' }],
        ['path', { d: 'm4 23 7-7 5 5 5-7 7 8' }],
      ]));
    } else {
      area.append(placeholderSvg(document, 'rich-image-placeholder-icon', '0 0 50 41', [
        ['path', { class: 'rich-image-aperture-corners', d: 'M11 2H3v8M39 2h8v8M3 31v8h8M47 31v8h-8' }],
        ['path', { d: 'm11 30 10-13 8 10 5-6 6 9' }],
        ['circle', { cx: '35', cy: '12', r: '3' }],
      ]));
    }
  }
  area.append(el(document, 'span', 'rich-offline-label', tag === 'AsyncImage' ? t('Image unavailable') : label));
  if (description) area.append(el(document, 'span', 'rich-image-description', description));
  return area;
}
function replaceMarkers(root, records, options) {
  const { document } = options;
  const walker = document.createTreeWalker(root, 4); const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const textNode of texts) {
    const codeContext = Boolean(textNode.parentElement?.closest('pre,code'));
    const text = textNode.nodeValue || '';
    const found = [];
    for (const [marker, record] of records) { let at = text.indexOf(marker); while (at >= 0) { found.push({ at, marker, record }); at = text.indexOf(marker, at + marker.length); } }
    if (!found.length) continue;
    found.sort((a, b) => a.at - b.at); const fragment = document.createDocumentFragment(); let last = 0;
    for (const item of found) {
      fragment.append(document.createTextNode(text.slice(last, item.at)));
      let node;
      try { node = codeContext ? document.createTextNode(item.record.source ?? item.record.text ?? '') : renderRichNode(item.record, options); }
      catch { node = el(document, item.record.inline ? 'span' : 'pre', 'rich-original-source', item.record.source || ''); }
      fragment.append(node); last = item.at + item.marker.length;
    }
    fragment.append(document.createTextNode(text.slice(last)));
    const parent = textNode.parentElement;
    if (parent?.tagName === 'P' && parent.childNodes.length === 1 && found.length === 1 && !found[0].record.inline && text.trim() === found[0].marker) parent.replaceWith(fragment);
    else textNode.replaceWith(fragment);
    if (codeContext) {
      const code = parent?.closest('code');
      if (code) code.dataset.originalCode = code.textContent || '';
    }
  }
}
function renderChildren(element, children, options) {
  const { document, renderMarkdown } = options;
  let source = ''; const records = new Map();
  const allText = children.filter(c => c.kind === 'markdown' || c.kind === 'literal').map(c => c.text).join('');
  for (const child of children) {
    if (child.kind === 'markdown') source += child.text;
    else {
      let marker = randomMarker(); while (allText.includes(marker) || records.has(marker)) marker = randomMarker();
      records.set(marker, child); source += marker;
    }
  }
  // Dedent the original component body before adding Markdown block boundaries.
  // Otherwise a block placeholder at column zero changes the common indent,
  // making later structural prose/icons appear to be indented Markdown code.
  source = dedent(source);
  const protectedRanges = markdownProtectedRanges(source);
  let separated = '', last = 0, protectedIndex = 0;
  for (const match of source.matchAll(/TSRICHCHILD[a-f0-9]{32}END/g)) {
    const child = records.get(match[0]);
    while (protectedIndex < protectedRanges.length && protectedRanges[protectedIndex][1] <= match.index) protectedIndex++;
    const insideCode = protectedRanges[protectedIndex] && protectedRanges[protectedIndex][0] <= match.index;
    if (child && !child.inline && child.kind !== 'literal' && !insideCode) {
      separated += source.slice(last, match.index) + `\n\n${match[0]}\n\n`;
      last = match.index + match[0].length;
    }
  }
  source = separated + source.slice(last);
  const template = document.createElement('template'); template.innerHTML = renderMarkdown(source);
  replaceMarkers(template.content, records, options);
  // Layout containers may hold inline Markdown paragraphs as flex/grid items;
  // unwrap only a sole paragraph for text-like elements, preserving GFM blocks.
  if (['text', 'title', 'caption'].includes(element.dataset.richTag) && template.content.childElementCount === 1 && template.content.firstElementChild?.tagName === 'P') {
    template.content.firstElementChild.replaceWith(...template.content.firstElementChild.childNodes);
  }
  element.append(template.content);
}
function renderRichNode(node, options) {
  const { document, t } = options;
  if (node.kind === 'literal') return document.createTextNode(node.text);
  if (node.kind === 'static-svg') return staticSvgNode(node, options);
  if (node.kind === 'passive') {
    const figure = el(document, 'aside', 'rich-passive');
    if (node.family === 'suggest_automation') {
      figure.append(el(document, 'span', 'rich-passive-label', `${t('Archived suggestion')}: `), document.createTextNode(node.text));
    } else {
      figure.append(el(document, 'div', 'rich-passive-label', t('Archived map locations')));
      const list = el(document, 'ul'); for (const point of node.points) list.append(el(document, 'li', '', point.category ? `${point.name} — ${point.category}` : point.name)); figure.append(list);
    }
    return figure;
  }
  const { tag, attrs: a } = node;
  if (tag === 'Chart') return renderChart(a.content, { document, t, family: node.family || 'Chart' });
  if (tag === 'Entity') {
    const entity = el(document, 'span', 'rich-entity', a.value);
    entity.title = [a.category, a.disambig].filter(Boolean).join(' — '); return entity;
  }
  if (tag === 'Link') {
    const link = el(document, 'a', 'rich-link', a.title || a.url); link.href = a.url;
    link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
  }
  if (tag === 'Cite') return referenceNode(a, options);
  if (tag === 'AsyncImage' || tag === 'AsyncImageGroup') {
    return unavailableImageNode(tag, a, options);
  }
  if (tag === 'icon') {
    const span = el(document, 'span', 'rich-icon-wrap'); span.setAttribute('aria-hidden', 'true');
    applyProperties(span, tag, a); span.append(iconNode(a.name || '', options)); return span;
  }
  const htmlTag = tag === 'divider' ? 'hr' : 'div';
  const element = el(document, htmlTag, `rich-component rich-${tag}`); element.dataset.richTag = tag;
  if (tag === 'title') { element.setAttribute('role', 'heading'); element.setAttribute('aria-level', '4'); }
  applyProperties(element, tag, a);
  if (tag !== 'divider') renderChildren(element, node.children, { ...options, imageAncestors: [...(options.imageAncestors || []), node] });
  markProgressFill(element, node);
  return element;
}
/** All exported HTML was already sanitized. Only app-created DOM is inserted;
 * opaque marker lookup is restricted to records generated for this message. */
function renderRichHtml(html, records, { renderMarkdown, document = globalThis.document, t = k => k, context = {} } = {}) {
  if (!records?.size) return html;
  const template = document.createElement('template'); template.innerHTML = html;
  const options = { document, renderMarkdown, t, context };
  replaceMarkers(template.content, records, options);
  return template.innerHTML;
}

window.TSARich.Renderer=Object.freeze({renderRichNode,renderRichHtml});
})();


/* math.js */
(function(){'use strict';
const tr=k=>k;
const pendingMath = new Map();

const DISPLAY_ENVIRONMENTS = Object.freeze([
  'equation',
  'equation*',
  'align',
  'align*',
  'aligned',
  'gather',
  'gather*',
  'gathered',
  'multline',
  'multline*',
  'split',
  'cases',
  'matrix',
  'pmatrix',
  'bmatrix',
  'Bmatrix',
  'vmatrix',
  'Vmatrix'
]);

function createMathId() {
  const randomPart = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `chatgpt-math-${randomPart}`;
}

function isEscaped(text, index) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function isLineStart(text, index) {
  return index === 0 || text[index - 1] === '\n';
}

function getLineEnd(text, index) {
  const newline = text.indexOf('\n', index);
  return newline === -1 ? text.length : newline;
}

function findFenceEnd(text, start, marker, markerLength) {
  let cursor = getLineEnd(text, start);
  if (cursor < text.length) cursor += 1;

  const closingPattern = new RegExp(`^ {0,3}${marker === '`' ? '`' : '~'}{${markerLength},}\\s*$`);

  while (cursor < text.length) {
    const lineEnd = getLineEnd(text, cursor);
    const line = text.slice(cursor, lineEnd).replace(/\r$/, '');
    if (closingPattern.test(line)) {
      return lineEnd < text.length ? lineEnd + 1 : lineEnd;
    }
    cursor = lineEnd < text.length ? lineEnd + 1 : lineEnd;
  }

  return text.length;
}

function findInlineCodeEnd(text, start, markerLength) {
  const marker = '`'.repeat(markerLength);
  const end = text.indexOf(marker, start + markerLength);
  return end === -1 ? text.length : end + markerLength;
}

function findHtmlCodeEnd(text, start, tagName) {
  const closingTag = `</${tagName}>`;
  const end = text.toLowerCase().indexOf(closingTag, start);
  return end === -1 ? text.length : end + closingTag.length;
}

function looksLikeTex(expression) {
  const value = String(expression).trim();
  if (!value) return false;

  return /\\[a-zA-Z]+/.test(value)
    || /[_^](?:\{|[a-zA-Z0-9])/.test(value)
    || /\\begin\s*\{[^}]+\}/.test(value)
    || /(?:^|\s)(?:=|\\approx|\\leq|\\geq|\\times|\\cdot)(?:\s|$)/.test(value);
}

function registerMath(raw, tex, displayMode) {
  const id = createMathId();
  // Plain opaque text survives both inline and block Markdown parsing. The
  // trusted element is created only after archived HTML has been escaped.
  const marker = `TSMATH${id.replace(/[^A-Za-z0-9]/g, '')}END`;
  pendingMath.set(id, {
    raw,
    tex: String(tex).trim(),
    displayMode,
    marker
  });

  return displayMode ? `\n\n${marker}\n\n` : marker;
}

function findClosingDelimiter(text, fromIndex, delimiter) {
  let cursor = fromIndex;
  while (cursor < text.length) {
    const found = text.indexOf(delimiter, cursor);
    if (found === -1) return -1;
    if (!isEscaped(text, found)) return found;
    cursor = found + delimiter.length;
  }
  return -1;
}

function matchDelimitedMath(text, index, opening, closing, displayMode) {
  if (!text.startsWith(opening, index) || isEscaped(text, index)) return null;

  const contentStart = index + opening.length;
  const closeIndex = findClosingDelimiter(text, contentStart, closing);
  if (closeIndex === -1) return null;

  const end = closeIndex + closing.length;
  const raw = text.slice(index, end);
  const tex = text.slice(contentStart, closeIndex);

  if (!tex.trim()) return null;

  return {
    end,
    replacement: registerMath(raw, tex, displayMode)
  };
}

function matchDollarDisplayMath(text, index) {
  if (!text.startsWith('$$', index) || isEscaped(text, index)) return null;

  const contentStart = index + 2;
  let closeIndex = contentStart;

  while (closeIndex < text.length) {
    closeIndex = text.indexOf('$$', closeIndex);
    if (closeIndex === -1) return null;
    if (!isEscaped(text, closeIndex)) break;
    closeIndex += 2;
  }

  const tex = text.slice(contentStart, closeIndex);
  if (!tex.trim()) return null;

  const end = closeIndex + 2;
  return {
    end,
    replacement: registerMath(text.slice(index, end), tex, true)
  };
}

// Support common single-dollar inline math without mistaking currency for TeX.
function matchDollarInlineMath(text, index) {
  if (text[index] !== '$' || text[index + 1] === '$' || isEscaped(text, index)) return null;
  const end = findClosingDelimiter(text, index + 1, '$');
  if (end < 0 || text[end + 1] === '$') return null;
  const tex = text.slice(index + 1, end);
  if (!tex || /\n/.test(tex) || /^\s|\s$/.test(tex) || (!looksLikeTex(tex) && !/^[A-Za-z]$/.test(tex))) return null;
  return { end: end + 1, replacement: registerMath(text.slice(index, end + 1), tex, false) };
}

function matchTexEnvironment(text, index) {
  if (!text.startsWith('\\begin{', index) || isEscaped(text, index)) return null;

  const nameEnd = text.indexOf('}', index + 7);
  if (nameEnd === -1) return null;

  const environment = text.slice(index + 7, nameEnd);
  if (!DISPLAY_ENVIRONMENTS.includes(environment)) return null;

  const closing = `\\end{${environment}}`;
  const closeIndex = text.indexOf(closing, nameEnd + 1);
  if (closeIndex === -1) return null;

  const end = closeIndex + closing.length;
  const raw = text.slice(index, end);

  return {
    end,
    replacement: registerMath(raw, raw, true)
  };
}

function matchPlainBracketDisplayMath(text, index) {
  if (!isLineStart(text, index)) return null;

  const openingLineEnd = getLineEnd(text, index);
  const openingLine = text.slice(index, openingLineEnd).replace(/\r$/, '');
  if (!/^\s*\[\s*$/.test(openingLine)) return null;

  let cursor = openingLineEnd < text.length ? openingLineEnd + 1 : openingLineEnd;

  while (cursor < text.length) {
    const lineEnd = getLineEnd(text, cursor);
    const line = text.slice(cursor, lineEnd).replace(/\r$/, '');

    if (/^\s*\]\s*$/.test(line)) {
      const contentStart = openingLineEnd < text.length ? openingLineEnd + 1 : openingLineEnd;
      const tex = text.slice(contentStart, cursor).replace(/\n$/, '');
      if (!looksLikeTex(tex)) return null;

      const end = lineEnd;
      return {
        end,
        replacement: registerMath(text.slice(index, end), tex, true)
      };
    }

    cursor = lineEnd < text.length ? lineEnd + 1 : lineEnd;
  }

  return null;
}

function matchCodeFence(text, index) {
  if (!isLineStart(text, index)) return null;

  const lineEnd = getLineEnd(text, index);
  const line = text.slice(index, lineEnd).replace(/\r$/, '');
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
  if (!match) return null;

  const marker = match[1][0];
  return {
    end: findFenceEnd(text, index, marker, match[1].length)
  };
}

function clearPendingMath() {
  pendingMath.clear();
}

function discardMathRecords(ids = []) {
  ids.forEach((id) => pendingMath.delete(id));
}

function protectMathInMarkdown(content = '') {
  const text = String(content);
  let output = '';
  let index = 0;
  const ids = [];

  while (index < text.length) {
    const fence = matchCodeFence(text, index);
    if (fence) {
      output += text.slice(index, fence.end);
      index = fence.end;
      continue;
    }

    if (text[index] === '`') {
      let markerLength = 1;
      while (text[index + markerLength] === '`') markerLength += 1;
      const end = findInlineCodeEnd(text, index, markerLength);
      output += text.slice(index, end);
      index = end;
      continue;
    }

    if (text[index] === '<') {
      const tagMatch = text.slice(index).match(/^<(pre|code)(?:\s|>)/i);
      if (tagMatch) {
        const end = findHtmlCodeEnd(text, index, tagMatch[1].toLowerCase());
        output += text.slice(index, end);
        index = end;
        continue;
      }
    }

    const beforeCount = pendingMath.size;
    const match = matchPlainBracketDisplayMath(text, index)
      || matchDelimitedMath(text, index, '\\[', '\\]', true)
      || matchDollarDisplayMath(text, index)
      || matchDelimitedMath(text, index, '\\(', '\\)', false)
      || matchDollarInlineMath(text, index)
      || matchTexEnvironment(text, index);

    if (match) {
      output += match.replacement;
      index = match.end;
      if (pendingMath.size > beforeCount) {
        const latestId = Array.from(pendingMath.keys()).at(-1);
        if (latestId) ids.push(latestId);
      }
      continue;
    }

    output += text[index];
    index += 1;
  }

  return { content: output, ids };
}

function restoreMathPlaceholders(html, ids) {
  if (!ids.length) return html;
  const records = new Map();
  for (const id of ids) {
    const record = pendingMath.get(id);
    if (record) records.set(record.marker, { id, ...record });
  }
  const template = document.createElement('template');
  template.innerHTML = html;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const markerPattern = /TSMATH[A-Za-z0-9]+END/g;
  for (const node of nodes) {
    if (node.parentElement?.closest('code, pre')) continue;
    const value = node.textContent || '';
    markerPattern.lastIndex = 0;
    let last = 0;
    let changed = false;
    const fragment = document.createDocumentFragment();
    for (const match of value.matchAll(markerPattern)) {
      const record = records.get(match[0]);
      if (!record) continue;
      changed = true;
      fragment.append(document.createTextNode(value.slice(last, match.index)));
      const placeholder = document.createElement(record.displayMode ? 'div' : 'span');
      placeholder.className = `chatgpt-math-placeholder chatgpt-math-${record.displayMode ? 'display' : 'inline'}`;
      placeholder.dataset.chatgptMathId = record.id;
      placeholder.textContent = record.raw;
      fragment.append(placeholder);
      last = match.index + match[0].length;
    }
    if (changed) {
      fragment.append(document.createTextNode(value.slice(last)));
      node.replaceWith(fragment);
    }
  }
  return template.innerHTML;
}

function showMathSource(placeholder, record, error) {
  placeholder.classList.add('chatgpt-math-source');
  placeholder.textContent = record?.raw || placeholder.textContent;
  if (error) {
    placeholder.title = `${tr('Equation rendering failed')}: ${error.message || error}`;
  }
}

async function getMathJax() {
  const mathJax = window.MathJax;
  if (!mathJax) {
    throw new Error('The local MathJax bundle is not available.');
  }

  if (mathJax.startup?.promise) {
    await mathJax.startup.promise;
  }

  if (typeof mathJax.tex2svgPromise !== 'function' && typeof mathJax.tex2svg !== 'function') {
    throw new Error('The local MathJax TeX-to-SVG renderer did not initialize.');
  }

  return mathJax;
}

async function renderMathPlaceholders(container) {
  const placeholders = Array.from(container.querySelectorAll('[data-chatgpt-math-id]'));
  if (placeholders.length === 0) return;

  let mathJax;
  try {
    mathJax = await getMathJax();
    mathJax.texReset?.();
  } catch (error) {
    console.warn('Equation rendering is unavailable; preserving the original source.', error);
    placeholders.forEach((placeholder) => {
      const id = placeholder.dataset.chatgptMathId;
      const record = pendingMath.get(id);
      showMathSource(placeholder, record, error);
      pendingMath.delete(id);
    });
    return;
  }

  for (const placeholder of placeholders) {
    const id = placeholder.dataset.chatgptMathId;
    const record = pendingMath.get(id);
    if (!record) continue;

    try {
      const rendered = typeof mathJax.tex2svgPromise === 'function'
        ? await mathJax.tex2svgPromise(record.tex, { display: record.displayMode })
        : mathJax.tex2svg(record.tex, { display: record.displayMode });

      // With startup.typeset=false, conversion alone does not install MathJax's
      // document stylesheet. It includes the accessible MathML clipping rules;
      // without it both the SVG and its assistive MathML appear visibly.
      mathJax.startup?.document?.updateDocument?.();
      for (const element of rendered.querySelectorAll('a,script,foreignObject')) { if (element.localName==='a') element.replaceWith(...element.childNodes); else element.remove(); }
      for (const element of rendered.querySelectorAll('*')) for (const attribute of [...element.attributes]) { if (/^on/i.test(attribute.name) || (/^(?:href|xlink:href)$/i.test(attribute.name) && !attribute.value.startsWith('#'))) element.removeAttribute(attribute.name); }
      placeholder.replaceChildren(rendered);
      placeholder.classList.remove('chatgpt-math-placeholder');
      placeholder.removeAttribute('data-chatgpt-math-id');
    } catch (error) {
      console.warn('Equation rendering failed; preserving the original source.', error);
      showMathSource(placeholder, record, error);
    } finally {
      pendingMath.delete(id);
    }
  }
}

window.TSARich.Math=Object.freeze({clearPendingMath,discardMathRecords,protectMathInMarkdown,restoreMathPlaceholders,renderMathPlaceholders});
})();

/* Local Reader deterministic Mermaid repairs, MIT. No archived source is changed. */
(function(){
'use strict';
function firstMeaningfulLine(source) {
  for (const rawLine of String(source || '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%')) continue;
    return line;
  }
  return '';
}

function diagramType(source) {
  const line = firstMeaningfulLine(source);
  if (!line) return 'other';
  const keyword = line.split(/\s+/, 1)[0].toLowerCase();
  if (keyword === 'sequencediagram') return 'sequence';
  if (keyword === 'flowchart' || keyword === 'graph') return 'flowchart';
  if (keyword === 'xychart-beta') return 'xychart';
  if (keyword === 'bar') return 'legacy-bar';
  return 'other';
}

function sequenceArrowPrefix(prefix) {
  return /(?:--?|==?)(?:>>|>|x|\)|o)/.test(prefix);
}

function looksLikeSequenceFragment(source) {
  return String(source || '').split(/\r?\n/).some((line) => {
    const colon = line.indexOf(':');
    return colon > 0 && sequenceArrowPrefix(line.slice(0, colon));
  });
}

function looksLikeFlowchartFragment(source) {
  const meaningful = String(source || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('%%'));

  if (!meaningful.length) return false;
  if (meaningful.some((line) => /(?:-->|---|-.->|==>)/.test(line))) return true;
  return meaningful.every((line) => /^[A-Za-z_][A-Za-z0-9_.-]*\s*(?:\[|\{|\(|>)/.test(line));
}

function withInferredHeader(source, type) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  if (type === 'sequence') return `sequenceDiagram${newline}${source}`;
  if (type === 'flowchart') return `flowchart TD${newline}${source}`;
  return source;
}

function repairSequenceDiagram(source, { normalizeQuotedText = false } = {}) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  let changed = false;

  const lines = source.split(/\r?\n/).map((line) => {
    let repaired = line;

    if (normalizeQuotedText) {
      repaired = repaired.replace(
        /^(\s*(?:participant|actor)\s+\S+\s+as\s+)"([^"]*)"\s*$/i,
        (match, prefix, alias) => {
          changed = true;
          return `${prefix}${alias}`;
        },
      );
    }

    const colon = repaired.indexOf(':');
    if (colon < 0) return repaired;

    const prefix = repaired.slice(0, colon);
    if (!sequenceArrowPrefix(prefix)) return repaired;

    let message = repaired.slice(colon + 1);
    if (message.includes(';')) {
      message = message.replace(/#59;|;/g, (token) => (token === ';' ? '#59;' : token));
      changed = true;
    }

    if (normalizeQuotedText) {
      const leading = message.match(/^\s*/)?.[0] || '';
      const body = message.slice(leading.length);
      if (body.length >= 2 && body.startsWith('"') && body.endsWith('"')) {
        message = `${leading}${body.slice(1, -1)}`;
        changed = true;
      }
    }

    return `${repaired.slice(0, colon + 1)}${message}`;
  });

  return changed ? lines.join(newline) : source;
}

function quoteSquareBracketLabels(source, { quoteAll = false } = {}) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  let changed = false;

  const lines = source.split(/\r?\n/).map((line) => line.replace(
    /(\b[A-Za-z_][A-Za-z0-9_.-]*\s*)\[([^\]\r\n]*)\]/g,
    (match, nodePrefix, rawLabel) => {
      const label = rawLabel.trim();
      if (!label || /^"[\s\S]*"$/.test(label)) return match;

      // Quoting a square-bracket node label preserves the visible label while
      // shielding punctuation that Mermaid may otherwise interpret as syntax.
      if (!quoteAll && !/[();<>]/.test(label)) return match;

      changed = true;
      const safeLabel = label.replace(/"/g, '&quot;');
      return `${nodePrefix}["${safeLabel}"]`;
    },
  ));

  return changed ? lines.join(newline) : source;
}

function repairLegacyBarChart(source) {
  const lines = String(source || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines[0]?.toLowerCase() !== 'bar') return null;

  let title = '';
  const labels = [];
  const values = [];
  for (const line of lines.slice(1)) {
    const titleMatch = line.match(/^title\s+(.+)$/i);
    if (titleMatch) {
      title = titleMatch[1].trim();
      continue;
    }

    const valueMatch = line.match(/^(.+?)\s+(-?(?:\d+(?:\.\d+)?|\.\d+))$/);
    if (!valueMatch) return null;
    labels.push(valueMatch[1].trim());
    values.push(Number(valueMatch[2]));
  }

  if (!labels.length || values.some((value) => !Number.isFinite(value))) return null;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  if (min === max) return null;

  const quote = (value) => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  const output = ['xychart-beta'];
  if (title) output.push(`  title ${quote(title)}`);
  output.push(`  x-axis [${labels.map(quote).join(', ')}]`);
  output.push(`  y-axis ${min} --> ${max}`);
  output.push(`  bar [${values.join(', ')}]`);
  return output.join('\n');
}

function uniqueChangedCandidates(original, candidates) {
  const seen = new Set([original]);
  const result = [];
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    result.push(candidate);
  }
  return result;
}

function buildMermaidRepairCandidates(source = '') {
  const original = String(source || '');
  if (!original.trim()) return [];

  let type = diagramType(original);
  let base = original;
  const candidates = [];

  if (type === 'other' && looksLikeSequenceFragment(original)) {
    type = 'sequence';
    base = withInferredHeader(original, 'sequence');
    candidates.push(base);
  } else if (type === 'other' && looksLikeFlowchartFragment(original)) {
    type = 'flowchart';
    base = withInferredHeader(original, 'flowchart');
    candidates.push(base);
  }

  if (type === 'sequence') {
    const minimal = repairSequenceDiagram(base);
    candidates.push(minimal);
    candidates.push(repairSequenceDiagram(minimal, { normalizeQuotedText: true }));
  } else if (type === 'flowchart') {
    const minimal = quoteSquareBracketLabels(base);
    candidates.push(minimal);
    candidates.push(quoteSquareBracketLabels(minimal, { quoteAll: true }));
  } else if (type === 'legacy-bar') {
    candidates.push(repairLegacyBarChart(original));
  }

  return uniqueChangedCandidates(original, candidates);
}

function buildMermaidRepairCandidate(source = '') {
  return buildMermaidRepairCandidates(source)[0] || null;
}

window.TSARich.Repair=Object.freeze({buildMermaidRepairCandidates,buildMermaidRepairCandidate});
})();
