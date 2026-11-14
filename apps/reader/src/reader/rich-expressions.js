/** Bounded syntax for archived local presentation data. No source is executed.
 * Calls, dynamic indexing, host objects and prototypes are outside this grammar.
 * Array.from's one recognized spelling denotes an integer sequence, not a call.
 */
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const fail = message => { throw new SyntaxError(message); };
const checkKey = key => { if (forbidden.has(String(key))) fail('Forbidden property'); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [null, Object.prototype].includes(Object.getPrototypeOf(value));
const precedence = { '===': 1, '!==': 1, '==': 1, '!=': 1, '<=': 2, '>=': 2, '<': 2, '>': 2, '+': 3, '-': 3, '*': 4, '/': 4, '%': 4 };

class ExpressionParser {
  constructor(source, hooks) { this.source = source; this.pos = 0; this.hooks = hooks; }
  touch(depth = 0) { this.hooks.depthCheck(depth); this.hooks.tick(); }
  ws() { while (this.pos < this.source.length && /\s/.test(this.source[this.pos])) { this.pos++; this.touch(); } }
  token(text) { this.ws(); if (!this.source.startsWith(text, this.pos)) return false; this.pos += text.length; this.touch(); return true; }
  expect(text) { if (!this.token(text)) fail(`Expected local expression ${text}`); }
  identifier() {
    this.ws(); const match = this.source.slice(this.pos).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
    if (!match) fail('Expected local identifier');
    this.pos += match[0].length; checkKey(match[0]); this.touch(); return match[0];
  }
  string() {
    const quote = this.source[this.pos++]; let result = '';
    while (this.pos < this.source.length) {
      this.touch(); const c = this.source[this.pos++];
      if (c === quote) return result;
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
      } else { if (c.charCodeAt(0) < 32) fail('Control character in literal'); result += c; }
      if (result.length > this.hooks.limits.string) fail('Literal string limit exceeded');
    }
    fail('Unterminated local string');
  }
  primary(depth) {
    this.touch(depth); this.hooks.tick('values'); this.ws(); const c = this.source[this.pos];
    if (c === '"' || c === "'") return { expression: 'literal', value: this.string() };
    if (c === '(') { this.pos++; const value = this.expression(depth + 1); this.expect(')'); return value; }
    if (c === '+' || c === '-') { this.pos++; return { expression: 'unary', operator: c, value: this.primary(depth + 1) }; }
    if (c === '[') {
      this.pos++; const items = []; this.ws();
      while (!this.token(']')) {
        if (items.length >= this.hooks.limits.array) fail('Literal array limit exceeded');
        items.push(this.expression(depth + 1));
        if (this.token(']')) break; this.expect(',');
      }
      return { expression: 'array', items };
    }
    if (c === '{') {
      this.pos++; const entries = [], keys = new Set(); this.ws();
      while (!this.token('}')) {
        this.ws(); const key = ['"', "'"].includes(this.source[this.pos]) ? this.string() : this.identifier();
        checkKey(key); if (keys.has(key)) fail('Duplicate literal key'); keys.add(key);
        this.expect(':'); entries.push([key, this.expression(depth + 1)]);
        if (entries.length > this.hooks.limits.array) fail('Literal object limit exceeded');
        if (this.token('}')) break; this.expect(',');
      }
      return { expression: 'object', entries };
    }
    const keyword = this.source.slice(this.pos).match(/^(true|false|null)(?![A-Za-z0-9_$])/);
    if (keyword) { this.pos += keyword[0].length; return { expression: 'literal', value: keyword[0] === 'null' ? null : keyword[0] === 'true' }; }
    const number = this.source.slice(this.pos).match(/^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (number) { this.pos += number[0].length; const value = Number(number[0]); if (!Number.isFinite(value)) fail('Non-finite number'); return { expression: 'literal', value }; }
    const name = this.identifier();
    if (name === 'Array' && this.token('.')) {
      if (this.identifier() !== 'from') fail('Unsupported local operation');
      this.expect('('); this.expect('{'); if (this.identifier() !== 'length') fail('Invalid local sequence'); this.expect(':');
      const length = this.expression(depth + 1); this.expect('}'); this.expect(','); this.expect('(');
      const unused = this.identifier(); this.expect(','); const index = this.identifier();
      if (unused === index) fail('Duplicate sequence parameter');
      this.expect(')'); this.expect('=>'); const returned = this.identifier(); if (returned !== index) fail('Unsupported sequence callback'); this.expect(')');
      return { expression: 'range', length };
    }
    const path = [name];
    while (true) {
      if (this.token('.')) path.push(this.identifier());
      else if (this.token('[')) {
        this.ws(); const match = this.source.slice(this.pos).match(/^(?:0|[1-9]\d*)/);
        if (!match || Number(match[0]) >= this.hooks.limits.array) fail('Only bounded static indexes are supported');
        path.push(Number(match[0])); this.pos += match[0].length; this.expect(']');
      } else break;
      if (path.length > this.hooks.limits.depth) fail('Binding nesting limit exceeded');
    }
    return { expression: 'binding', path };
  }
  binary(depth, minimum = 1) {
    let left = this.primary(depth);
    while (true) {
      this.ws(); const op = this.source.slice(this.pos).match(/^(===|!==|==|!=|<=|>=|<|>|\+|-|\*|\/|%)/)?.[0];
      if (!op || precedence[op] < minimum) break;
      this.pos += op.length; this.touch(depth);
      const right = this.binary(depth + 1, precedence[op] + 1);
      left = { expression: 'binary', operator: op, left, right };
    }
    return left;
  }
  expression(depth = 0) {
    this.touch(depth); const test = this.binary(depth);
    if (!this.token('?')) return test;
    const consequent = this.expression(depth + 1); this.expect(':'); const alternate = this.expression(depth + 1);
    return { expression: 'conditional', test, consequent, alternate };
  }
}

export function parseLocalExpression(source, hooks) {
  const text = String(source); if (text.length > hooks.limits.span) fail('Local expression source limit exceeded');
  const parser = new ExpressionParser(text, hooks), expression = parser.expression(); parser.ws();
  if (parser.pos !== text.length) fail('Unsupported local expression syntax');
  return expression;
}

export function resolveLocalExpression(ast, env, hooks, depth = 0) {
  hooks.depthCheck(depth); hooks.tick();
  const resolve = value => resolveLocalExpression(value, env, hooks, depth + 1);
  if (ast.expression === 'literal') return ast.value;
  if (ast.expression === 'binding') {
    let value = env;
    for (const key of ast.path) {
      checkKey(key); hooks.tick();
      if (!(record(value) || (Array.isArray(value) && Number.isInteger(key))) || !Object.hasOwn(value, key)) fail('Binding is not a local own property');
      const descriptor = Object.getOwnPropertyDescriptor(value, key); if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('Accessor is not local data');
      value = descriptor.value;
    }
    return value;
  }
  if (ast.expression === 'array') return ast.items.map(resolve);
  if (ast.expression === 'object') { const result = Object.create(null); for (const [key, value] of ast.entries) { checkKey(key); result[key] = resolve(value); } return result; }
  if (ast.expression === 'range') {
    const length = resolve(ast.length);
    if (!Number.isInteger(length) || length < 0 || length > hooks.limits.array) fail('Local sequence length limit exceeded');
    hooks.tick('values', length); return Array.from({ length }, (_, index) => index);
  }
  if (ast.expression === 'conditional') {
    const test = resolve(ast.test); if (typeof test !== 'boolean') fail('Local conditional requires a boolean');
    return resolve(test ? ast.consequent : ast.alternate);
  }
  if (ast.expression === 'unary') {
    const value = resolve(ast.value); if (typeof value !== 'number' || !Number.isFinite(value)) fail('Arithmetic requires finite numbers');
    return ast.operator === '-' ? -value : value;
  }
  if (ast.expression === 'binary') {
    const a = resolve(ast.left), b = resolve(ast.right), op = ast.operator;
    if (['+', '-', '*', '/', '%'].includes(op)) {
      if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) fail('Arithmetic requires finite numbers');
      const result = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : op === '/' ? a / b : a % b;
      if (!Number.isFinite(result)) fail('Non-finite arithmetic result'); return result;
    }
    if (!['number', 'string', 'boolean'].includes(typeof a) || typeof a !== typeof b) fail('Condition operands must share a primitive type');
    if (op === '===' || op === '==') return a === b;
    if (op === '!==' || op === '!=') return a !== b;
    if (op === '<') return a < b; if (op === '>') return a > b; if (op === '<=') return a <= b; if (op === '>=') return a >= b;
  }
  fail('Unsupported local expression');
}
