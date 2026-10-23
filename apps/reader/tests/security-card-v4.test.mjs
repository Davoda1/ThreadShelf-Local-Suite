import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRichMarkdown, parseRichSpan } from '../src/reader/rich-parser.js';
import { securityCard, securityMarkdown, visualizeReference } from './fixtures/security-card-v4.mjs';

function descendants(node) { return [node, ...(node.children || []).flatMap(descendants)]; }

test('synthetic severity cards retain labels, value, structured rows, and safe source links', () => {
  const parsed = prepareRichMarkdown(securityCard);
  assert.equal(parsed.records.size, 1);
  const node = [...parsed.records.values()][0], nodes = descendants(node);
  assert.equal(node.tag, 'box');
  assert.equal(node.source, securityCard);
  assert.equal(nodes.filter(n => n.tag === 'row').length, 6);
  assert.equal(nodes.find(n => n.tag === 'Link').attrs.url, 'https://example.org/advisory');
  assert.ok(nodes.some(n => n.kind === 'markdown' && n.text.includes('9.2 / 10')));
  assert.ok(nodes.some(n => n.tag === 'text' && n.attrs.color === 'danger'));
});

test('ordinary security Markdown and unavailable visualization references are preserved unchanged', () => {
  for (const source of [securityMarkdown, visualizeReference]) {
    const parsed = prepareRichMarkdown(source);
    assert.equal(parsed.content, source);
    assert.equal(parsed.records.size, 0);
  }
});

test('severity card inputs cannot add script, events, or unsafe source links', () => {
  for (const source of [
    securityCard.replace('border padding', 'onclick="alert(1)" border padding'),
    securityCard.replace('https://example.org/advisory', 'javascript:alert(1)'),
    '<box>{window.desktop}</box>',
  ]) assert.throws(() => parseRichSpan(source));
});
