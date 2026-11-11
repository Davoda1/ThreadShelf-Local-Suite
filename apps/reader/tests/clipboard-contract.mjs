// Test-only source and native clipboard contracts. Copyright (c) 2026 davoda1. MIT.
import assert from 'node:assert/strict';

export function nativeClipboardText(text, platform = process.platform) {
  assert.equal(typeof text, 'string', 'Clipboard text must be a string');
  return platform === 'win32' ? text.replace(/\r\n/g, '\n') : text;
}

export function assertCopyPayloadAndClipboard(expected, payload, nativeText, {
  platform = process.platform, label = 'Application Copy',
} = {}) {
  // This assertion is deliberately before native transport normalization: an
  // application changing source newlines must fail even on Windows.
  assert.equal(payload, expected, label + ': exact application payload');
  assert.equal(nativeClipboardText(nativeText, platform), nativeClipboardText(expected, platform),
    label + ': native clipboard content');
}
