import test from 'node:test';
import assert from 'node:assert/strict';
import { UI_PALETTES } from '../src/ui/themes.mjs';

// Local expectations transcribed from ThreadShelf Local Reader 3.1.0's
// src/ui/style.css (:root, dark root and .primary) and the final role-label
// rules in src/reader/reader.css. This test does not import the Reader package.
const expectedReaderPalette = {
  light: {
    bg: '#f5f6f8', surface: '#fff', sidebar: '#f0f2f5', hover: '#e8ecf1',
    border: '#dce1e8', text: '#202b3b', muted: '#66758a', faint: '#8390a1',
    accent: '#396a63', 'accent-hover': '#2b574f', 'accent-soft': '#e2eeea',
    'accent-text': '#244e46', danger: '#aa4347', warning: '#9a6c25',
    focus: '#548e83', 'primary-ink': '#fff', 'role-assistant': '#29925f',
  },
  dark: {
    bg: '#171c24', surface: '#1d242e', sidebar: '#19202a', hover: '#29323e',
    border: '#333e4c', text: '#e5eaf0', muted: '#9daabc', faint: '#78879b',
    accent: '#8ac8b7', 'accent-hover': '#adddce', 'accent-soft': '#29433d',
    'accent-text': '#b6e2d4', danger: '#f19a9c', warning: '#e4b96e',
    focus: '#8bcbbb', 'primary-ink': '#173129', 'role-assistant': '#89dcac',
  },
};

for (const id of ['default', 'modern']) {
  test(`${id} explicitly reproduces Reader 3.1.0's complete light and dark semantic palette`, () => {
    const palette = UI_PALETTES.find(theme => theme.id === id);
    assert.ok(palette, `${id} must be offered`);
    assert.deepEqual(palette.tokens, expectedReaderPalette);
    assert.equal(palette.swatch, '#396a63', 'Reader catalog swatch is its light accent');
    assert.equal(palette.swatch, palette.tokens.light.accent);
    for (const mode of ['light', 'dark']) {
      assert.equal(Object.keys(palette.tokens[mode]).length, 17);
      assert.ok(Object.isFrozen(palette.tokens[mode]));
      for (const value of Object.values(palette.tokens[mode])) {
        assert.match(value, /^#[\da-f]{3}(?:[\da-f]{3})?$/i, 'Base colors stay explicit and opaque');
      }
    }
  });
}

test('Modern adds presentation effects without introducing a different base color palette', () => {
  const base = UI_PALETTES.find(theme => theme.id === 'default');
  const modern = UI_PALETTES.find(theme => theme.id === 'modern');
  assert.strictEqual(modern.tokens, base.tokens);
});
