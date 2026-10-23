import test from 'node:test';
import assert from 'node:assert/strict';
import { safeMarkdownImageSource } from '../src/reader/markdown-images.js';

test('explicit Markdown image sources retain their exact URL, independently of suffix', () => {
  for (const source of [
    'https://images.example.test/poster.JPG',
    'https://images.example.test/poster.png?width=640&quality=80',
    'https://images.example.test/optimizer?url=%2Fposter.webp&w=400',
    'http://images.example.test/portrait',
    'data:image/png;base64,aGVsbG8=',
  ]) assert.equal(safeMarkdownImageSource(source), source);
});

test('Markdown image policy rejects local, executable, credential-bearing and malformed sources', () => {
  for (const source of [
    'javascript:alert(1)', 'file:///private/data.png', '/private/data.png', '../image.png',
    'blob:https://example.test/local', '//example.test/image.png', 'https:example.test/image.png',
    'https://user:password@example.test/image.png', 'https://example.test/\nimage.png',
    'https://example.test/\timage.png', 'data:text/html;base64,aGVsbG8=',
    'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,<img>', '', null, {},
  ]) assert.equal(safeMarkdownImageSource(source), null, String(source));
});
