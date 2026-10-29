'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const {Marked} = require('../vendor/marked.umd.js');
const citations = require('../renderer/file-citations.js');
const parser = new Marked({extensions:[citations.createFileCitationExtension({style:'chip',classPrefix:'tsa-file'})]});
const marker = (name='report.pdf') => `:codex-file-citation{path="sandbox:/delivery/${name}" purpose="output"}`;
const render = source => parser.parse(source);

test('Alternative citations use inert soft chips without type badges', () => {
  const html = render(`Before ${marker()} after.`);
  assert.match(html,/class="tsa-file-citation[^\"]*"/);
  assert.match(html,/tsa-file-chip/);
  assert.match(html,/tsa-file-icon/);
  assert.match(html,/tsa-file-name[^>]*>report\.pdf<\/span>/);
  assert.match(html,/aria-disabled="true"/);
  assert.doesNotMatch(html,/<a\b|\bhref=|\bdownload\b|tsa-file-type/);
  assert.doesNotMatch(html,/sandbox:|codex-file-citation|delivery/);
});

test('recognized, unknown and extensionless names receive the same chip style', () => {
  for (const name of ['source.cpp','types.h','script.js','archive.tar.xz','archive.7z','README','notes.unlistedformat']) {
    const html=render(marker(name));
    assert.match(html,/tsa-file-chip/);
    assert.doesNotMatch(html,/tsa-file-type/);
    assert.ok(html.includes(name));
  }
});

test('fenced, inline and indented code retain citation source', () => {
  for(const text of ['`'+marker()+'`','```text\n'+marker()+'\n```','    '+marker()]) {
    const html=render(text);
    assert.doesNotMatch(html,/tsa-file-citation/);
    assert.match(html,/codex-file-citation/);
  }
});

test('link labels and destinations never gain inert-looking nested file chips', () => {
  const label=render(`[${marker()}](https://example.invalid/)`);
  assert.match(label,/<a\b/);
  assert.doesNotMatch(label,/tsa-file-citation/);
  const destination=render(`[report](<${marker()}>)`);
  assert.doesNotMatch(destination,/tsa-file-citation/);
});

test('malformed and duplicate-attribute markers remain literal', () => {
  for(const text of [':codex-file-citation{purpose="output"}',':codex-file-citation{path=""}',':codex-file-citation{path="sandbox:/report.pdf"',':codex-file-citation{path=report.pdf}',':codex-file-citation{path="one.txt" path="two.txt"}']) {
    assert.doesNotMatch(render(text),/tsa-file-citation/);
  }
});

test('quoted attributes may be reordered; adjacent and Unicode filenames work', () => {
  const html=render(':codex-file-citation{purpose="output" path="sandbox:/delivery/árvíz 日本語.txt"} '+marker('second.pdf'));
  assert.equal((html.match(/class="tsa-file-citation\b/g)||[]).length,2);
  assert.match(html,/árvíz 日本語\.txt/);
});

test('filename markup is escaped and cannot create an executable element', () => {
  const html=render(marker('<img src=x onerror=alert(1)>.pdf'));
  assert.doesNotMatch(html,/<img\b|<script\b|<svg\b/);
  if(html.includes('tsa-file-citation')) assert.match(html,/&lt;img/);
});

test('oversized and unterminated markers have a bounded literal fallback', () => {
  const text=':codex-file-citation{path="sandbox:/'+ 'x'.repeat(32768);
  const html=render(text);
  assert.doesNotMatch(html,/tsa-file-citation/);
  assert.ok(html.length < text.length * 2);
});
