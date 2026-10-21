import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadStartupHolidayStatus } from '../src/desktop/holiday/src/startup-holiday.mjs';

const rules = await readFile(new URL('../src/desktop/holiday/assets/data/holiday-rules.json', import.meta.url), 'utf8');
const region = { country: 'HU', localDate: '2026-10-23', timeZone: 'Europe/Budapest', source: 'test-os' };

test('startup loader uses OS country and civil date with exact bundled rules', async () => {
  const app = {};
  let calls = 0;
  const result = await loadStartupHolidayStatus(app, {
    detectRegion: async options => { calls++; assert.equal(options.electronApp, app); return region; },
    readRules: async () => rules,
  });
  assert.equal(calls, 1);
  assert.equal(result.isHoliday, true);
  assert.equal(result.country, 'HU');
  assert.equal(result.localDate, '2026-10-23');
  assert.ok(Object.isFrozen(result));
});

test('ordinary day, unknown country and invalid date keep normal waves', async () => {
  for (const value of [
    { ...region, localDate: '2026-10-22' },
    { ...region, country: null },
    { ...region, country: 'ZZ' },
    { ...region, localDate: null },
    { ...region, localDate: '2026-02-30' },
  ]) {
    const result = await loadStartupHolidayStatus({}, { detectRegion: async () => value, readRules: async () => rules });
    assert.equal(result.isHoliday, false, JSON.stringify(value));
  }
});

test('missing/corrupt rule data or native detection failures fail closed', async () => {
  const failed = async () => { throw new Error('unavailable'); };
  for (const dependencies of [
    { detectRegion: failed, readRules: async () => rules },
    { detectRegion: async () => region, readRules: failed },
    { detectRegion: async () => region, readRules: async () => 'invalid json' },
    { detectRegion: async () => region, readRules: async () => rules, evaluate: () => { throw new Error('evaluation unavailable'); } },
  ]) {
    const result = await loadStartupHolidayStatus({}, dependencies);
    assert.equal(result.isHoliday, false);
  }
});

test('production loader resolves bundled rules relative to its module, independent of working directory', async () => {
  const result = await loadStartupHolidayStatus({}, { detectRegion: async () => region });
  assert.equal(result.isHoliday, true);
  assert.equal(result.supportedCountry, true);
});
