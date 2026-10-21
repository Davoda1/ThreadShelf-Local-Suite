import test from 'node:test';
import assert from 'node:assert/strict';
import { previewHolidayStatus } from '../scripts/preview-holiday.mjs';

test('preview uses browser timezone country and local civil date with the bundled rules', () => {
  assert.deepEqual(previewHolidayStatus({ getTimeZone: () => 'Europe/Budapest',
    now: () => new Date(2026, 9, 23, 0, 1) }), { isHoliday: true });
  assert.deepEqual(previewHolidayStatus({ getTimeZone: () => 'Europe/Budapest',
    now: () => new Date(2026, 9, 22, 23, 59) }), { isHoliday: false });
});

test('preview fails closed without a usable country, browser clock or timezone API', () => {
  for (const timeZone of ['UTC', 'Etc/UTC', 'CET', 'Europe/Unknown', '__proto__', null]) {
    assert.deepEqual(previewHolidayStatus({ getTimeZone: () => timeZone,
      now: () => new Date(2026, 11, 25) }), { isHoliday: false });
  }
  assert.deepEqual(previewHolidayStatus({ getTimeZone: () => { throw new Error('unavailable'); } }), { isHoliday: false });
  assert.deepEqual(previewHolidayStatus({ getTimeZone: () => 'Europe/Budapest', now: () => new Date(NaN) }), { isHoliday: false });
});
