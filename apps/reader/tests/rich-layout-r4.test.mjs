import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRichSpan, prepareRichMarkdown } from '../src/reader/rich-parser.js';
const fragments = source => [...prepareRichMarkdown(source).records.values()];
const svg = '<svg viewBox="0 0 120 80" width="100%" height="80px" preserveAspectRatio="xMidYMid meet"><path d="M10 70 L40 20 L70 45 L100 10" stroke="#3b82f6" strokeWidth="3" strokeLinejoin="round" fill="none"/><circle cx="40" cy="20" r="4" fill="#3b82f6"/></svg>';

test('semantic progress paint and text use finite enums; arbitrary CSS remains unsupported', () => {
  for (const background of ['info', 'success', 'warning', 'danger', 'error']) {
    const node = parseRichSpan(`<box width="100%" height="14px" background="surface-tertiary" radius="full" clip><box width="71%" height="14px" background="${background}" radius="full"/></box>`);
    assert.equal(node.children[0].attrs.background, background);
    assert.equal(parseRichSpan(`<text color="${background}">Label</text>`).attrs.color, background);
  }
  for (const paint of ['url(https://example.org/a)', 'var(--unsafe)', 'expression(alert(1))', 'info; color:red']) {
    assert.throws(() => parseRichSpan(`<box background="${paint}"/>`), SyntaxError);
  }
});

test('static SVG path/circle illustration survives nested rich layout and retains source', () => {
  const source = `<box border padding={3}>**Synthetic illustration**\n${svg}\n<text>Four data points</text></box>`;
  const node = parseRichSpan(source), vector = node.children.find(n => n.kind === 'static-svg');
  assert.equal(vector.source, svg); assert.equal(vector.children.length, 2);
  assert.equal(vector.children[0].attrs.strokeWidth, '3');
  assert.equal(fragments(source).length, 1);
  assert.equal(parseRichSpan('<svg viewBox="0 0 100 100"><path d="M50 10 A40 40 0 1 1 50 90" stroke="#abc" stroke-width="12" fill="none"/></svg>').children[0].attrs['stroke-width'], '12');
});

test('SVG remains inert inside code, mathematics, comments, links and unrelated HTML', () => {
  for (const source of ['```xml\n'+svg+'\n```', '`'+svg+'`', '    '+svg+'\n', '\\'+svg, '\\('+svg+'\\)', '<!-- '+svg+' -->', '<div>'+svg+'</div>', '[example '+svg+'](https://example.org/)']) {
    assert.equal(fragments(source).length, 0, source);
  }
  const nested = parseRichSpan('<box>Code:\n\n    '+svg+'\n</box>');
  assert.equal(nested.children.some(n => n.kind === 'static-svg'), false);
});

test('active, resource-bearing, malformed and oversized SVG remains exact local fallback', () => {
  const bad = [
    '<svg viewBox="0 0 10 10" onload="alert(1)"/>',
    '<svg viewBox="0 0 10 10" style="color:red"/>',
    '<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>',
    '<svg viewBox="0 0 10 10"><foreignObject><box>bad</box></foreignObject></svg>',
    '<svg viewBox="0 0 10 10"><image href="https://example.org/a"/></svg>',
    '<svg viewBox="0 0 10 10"><use href="#saved"/></svg>',
    '<svg viewBox="0 0 10 10"><animate attributeName="fill"/></svg>',
    '<svg viewBox="0 0 10 10"><path d="M0 0L1 1" fill="url(#paint)"/></svg>',
    '<svg viewBox="0 0 10 10"><path d="M0 0L1 1" href="javascript:alert(1)"/></svg>',
    '<svg viewBox="0 0 10 10"><path d={window.value}/></svg>',
    '<svg viewBox="0 0 10 10"><path d="M0 0L1 1" strokeWidth="2" stroke-width="3"/></svg>',
    '<svg viewBox="0 0 0 10"/>',
    '<svg viewBox="0 0 1e999 10"/>',
    '<svg viewBox="0 0 10 10"><path d="M0 0 L1"/></svg>',
    '<svg viewBox="0 0 10 10"><path d="M0 0 A1 1 0 3 1 3 3"/></svg>',
    '<svg viewBox="0 0 10 10"><circle cx="0" cy="0" r="-1"/></svg>',
    '<svg viewBox="0 0 10 10"><circle cx="0" cy="0" r="1" opacity="2"/></svg>',
    '<svg viewBox="0 0 10 10">'+ '<circle cx="0" cy="0" r="1"/>'.repeat(256)+'</svg>',
  ];
  for (const source of bad) {
    assert.throws(() => parseRichSpan(source), SyntaxError, source.slice(0, 180));
    assert.equal(prepareRichMarkdown(source).content, source);
    assert.deepEqual(fragments(source+'\n\n<box>After</box>').map(n => n.source), ['<box>After</box>']);
  }
});

test('SVG expansion accounts for all shape nodes in repeated templates', () => {
  const shapes = '<circle cx="0" cy="0" r="1"/>'.repeat(128);
  const source = `<box>{#each ${JSON.stringify(Array(40).fill(1))} as n}<svg viewBox="0 0 10 10">${shapes}</svg>{/each}</box>`;
  assert.throws(() => parseRichSpan(source), /budget/);
});
