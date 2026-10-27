import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ApplicationService } from '../src/core/service.mjs';
import { validateSettings, validateCoreSettings, validateReaderAppearanceSettings } from '../src/core/state.mjs';
import { EXTENDED_DEFAULTS, EXTENDED_PREFERENCES_FILE, LOCAL_SEARCH_PERIODS, validateExtendedPreferences, mergeExtendedPreferences } from '../src/core/extended-preferences.mjs';
import * as legacy from './fixtures/compatibility-v3.2.0/core/state.mjs';

const { version: applicationVersion } = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
const envelope = data => JSON.stringify({ schemaVersion: 1, data }, null, 2) + '\n';
const oldValues = {
  'settings.json': { ...legacy.DEFAULTS, mode: 'server', searchMode: 'exact', language: 'hu', theme: 'dark' },
  'interface.json': { searchPanelExpanded: true },
  'appearance.json': { uiPalette: 'harbor-haze', codeTheme: 'xcode' },
  'layout.json': { sourceSwitchWidth: 'local-wider' },
  'reader-appearance.json': { waveVideoBackground: true, promptExpandStyle: 'outlined-right' },
};
async function fixture(t) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reader-extended-preferences-')), services = [];
  t.after(async () => { for (const app of services.reverse()) await app.shutdown(); await fs.rm(dataDir, { recursive: true, force: true }); });
  for (const [name, values] of Object.entries(oldValues)) await fs.writeFile(path.join(dataDir, name), envelope(values));
  const open = async () => { const app = await new ApplicationService({ dataDir }).init(); services.push(app); return app; };
  const files = async () => Promise.all(Object.keys(oldValues).map(name => fs.readFile(path.join(dataDir, name), 'utf8')));
  return { dataDir, open, files };
}

test('new analytics/search preferences default without rewriting any 3.2 or original 3.3 preference file', async t => {
  const { dataDir, open, files } = await fixture(t), before = await files(), app = await open();
  const boot = await app.handle('bootstrap');
  assert.equal(boot.version, applicationVersion);
  assert.equal(boot.settings.analyticsStyledBars, false);
  assert.deepEqual(boot.settings.searchPreferences, {
    local: { mode: 'exact', provider: '', role: '', period: 'all' },
    server: { mode: 'keyword', provider: '', role: '' },
  });
  await app.shutdown();
  assert.deepEqual(await files(), before);
  await assert.rejects(fs.stat(path.join(dataDir, EXTENDED_PREFERENCES_FILE)), { code: 'ENOENT' });
});

test('all eight local periods and separate source filters survive save/restart without starting a search', async t => {
  const { dataDir, open, files } = await fixture(t), before = await files();
  let app = await open();
  await app.handle('settings.save', { values: { analyticsStyledBars: true, searchPreferences: {
    local: { mode: 'hybrid', provider: 'anthropic', role: 'thinking', period: 'all' },
    server: { mode: 'semantic', provider: 'openai', role: 'ai' },
  } } });
  for (const period of LOCAL_SEARCH_PERIODS) {
    await app.handle('settings.save', { values: { searchPreferences: { local: { period } } } });
    await app.shutdown(); app = await open();
    const boot = await app.handle('bootstrap');
    assert.equal(boot.settings.analyticsStyledBars, true);
    assert.deepEqual(boot.settings.searchPreferences.local, { mode: 'hybrid', provider: 'anthropic', role: 'thinking', period });
    assert.deepEqual(boot.settings.searchPreferences.server, { mode: 'semantic', provider: 'openai', role: 'ai' });
    assert.deepEqual(await files(), before);
  }
  const saved = JSON.parse(await fs.readFile(path.join(dataDir, EXTENDED_PREFERENCES_FILE), 'utf8'));
  assert.equal(saved.schemaVersion, 1);
  assert.deepEqual(saved.data, validateExtendedPreferences(saved.data));
  assert.equal(app.store, null, 'saving search options in Server mode must not mount/decompress the Local archive');
});

test('new sidecar saves validate before writes and legacy preference validators accept all old files', async t => {
  const { dataDir, open, files } = await fixture(t), app = await open();
  await app.handle('settings.save', { values: { theme: 'light', analyticsStyledBars: true, searchPreferences: { local: { provider: 'openrouter', role: 'user' } } } });
  const oldFiles = await files(), sidecar = await fs.readFile(path.join(dataDir, EXTENDED_PREFERENCES_FILE), 'utf8');
  const validators = [legacy.validateCoreSettings, legacy.validateInterfaceSettings, legacy.validateAppearanceSettings, legacy.validateLayoutSettings, validateReaderAppearanceSettings];
  oldFiles.forEach((bytes, index) => assert.doesNotThrow(() => validators[index](JSON.parse(bytes).data)));
  assert.equal(JSON.parse(oldFiles[0]).data.theme, 'light');
  assert.ok(oldFiles.every(bytes => !bytes.includes('analyticsStyledBars') && !bytes.includes('searchPreferences')));
  for (const value of [null, 'true', 1, {}]) await assert.rejects(app.handle('settings.save', { values: { theme: 'dark', analyticsStyledBars: value } }), /Invalid/);
  for (const searchPreferences of [null, [], { unknown: {} }, { local: { role: 'assistant' } }, { local: { period: 'yesterday' } }, { server: { period: 'week' } }, { server: { mode: 'fuzzy' } }, { local: { mode: 'remote' } }, { local: { provider: 'bad\0name' } }, { local: { extra: true } }]) {
    await assert.rejects(app.handle('settings.save', { values: { theme: 'dark', searchPreferences } }), /Invalid/);
  }
  assert.deepEqual(await files(), oldFiles);
  assert.equal(await fs.readFile(path.join(dataDir, EXTENDED_PREFERENCES_FILE), 'utf8'), sidecar);
  assert.deepEqual(validateCoreSettings({ analyticsStyledBars: true, searchPreferences: { local: { period: 'week' } } }), {});
  assert.throws(() => legacy.validateSettings({ analyticsStyledBars: true }), /Unknown setting/);
});

test('sidecar partial updates retain the other source and reject unsupported schema without deleting data', async t => {
  assert.deepEqual(mergeExtendedPreferences(EXTENDED_DEFAULTS, { searchPreferences: { local: { period: 'week' } } }).searchPreferences.server, EXTENDED_DEFAULTS.searchPreferences.server);
  assert.deepEqual(validateSettings({ searchPreferences: { server: { mode: 'titles' } } }), { searchPreferences: { server: { mode: 'titles' } } });
  assert.throws(() => validateExtendedPreferences({ unexpected: true }), /Invalid/);
  const { dataDir, open } = await fixture(t), filename = path.join(dataDir, EXTENDED_PREFERENCES_FILE), bytes = JSON.stringify({ schemaVersion: 99, data: {} });
  await fs.writeFile(filename, bytes);
  await assert.rejects(open(), /Unsupported saved state version/);
  assert.equal(await fs.readFile(filename, 'utf8'), bytes);
});
