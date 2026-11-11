import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCopyPayloadAndClipboard, nativeClipboardText } from './clipboard-contract.mjs';

const source = '\n\tconst text = "Árvíztűrő 🧪 日本語";  \n\n';

test('Copy requires exact source at the application boundary on every host', () => {
  for (const platform of ['linux', 'win32']) {
    const nativeText = platform === 'win32' ? source.replace(/\n/g, '\r\n') : source;
    assert.doesNotThrow(() => assertCopyPayloadAndClipboard(source, source, nativeText, { platform }));
    for (const altered of [source.replace(/\n/g, '\r\n'), source.trim(), source.replace('\t', '  '),
      '1 ' + source, source.replace('日本語', 'changed'), source + '\n', source.slice(0, -1)]) {
      assert.notEqual(altered, source);
      assert.throws(() => assertCopyPayloadAndClipboard(source, altered, nativeText, { platform }),
        /exact application payload/);
    }
  }
});

test('Windows native clipboard permits only CRLF transport differences after exact payload validation', () => {
  const mixed = 'alpha\r\nbeta\ngamma\rdelta\n\n';
  const nativeText = 'alpha\r\nbeta\r\ngamma\rdelta\r\n\r\n';
  assert.doesNotThrow(() => assertCopyPayloadAndClipboard(mixed, mixed, nativeText, { platform: 'win32' }));
  for (const altered of [nativeText.trim(), nativeText.replace('beta', 'different'), nativeText.replace('\rdelta', 'delta'),
    nativeText + '\r\n', '1 ' + nativeText]) {
    assert.throws(() => assertCopyPayloadAndClipboard(mixed, mixed, altered, { platform: 'win32' }),
      /native clipboard content/);
  }
});

test('non-Windows clipboard remains byte-exact and Windows normalization preserves lone carriage returns', () => {
  assert.equal(nativeClipboardText('a\r\nb\rc', 'win32'), 'a\nb\rc');
  for (const platform of ['linux', 'darwin']) {
    assert.equal(nativeClipboardText(source, platform), source);
    assert.throws(() => assertCopyPayloadAndClipboard(source, source, source.replace(/\n/g, '\r\n'), { platform }),
      /native clipboard content/);
  }
});
