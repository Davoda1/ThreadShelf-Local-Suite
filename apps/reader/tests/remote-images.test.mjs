import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ApplicationService } from '../src/core/service.mjs';
import { DEFAULTS, validateSettings, validateCoreSettings, validateReaderAppearanceSettings } from '../src/core/state.mjs';
import { EXTENDED_DEFAULTS, validateExtendedPreferences } from '../src/core/extended-preferences.mjs';
import { REMOTE_IMAGES_FILE, REMOTE_IMAGE_DEFAULTS, REMOTE_IMAGE_MODES, validateRemoteImageSettings } from '../src/core/remote-images.mjs';
import { dictionaries, locales } from '../src/ui/i18n.js';
import { setRendererLocale, tr } from '../src/reader/locale.js';
import * as legacy from './fixtures/compatibility-v3.2.0/core/state.mjs';

const envelope = data => JSON.stringify({ schemaVersion: 1, data }, null, 2) + '\n';
const oldValues = {
  'settings.json': { ...DEFAULTS, mode: 'server', language: 'hu', theme: 'dark' },
  'interface.json': { searchPanelExpanded: true },
  'appearance.json': { uiPalette: 'harbor-haze', codeTheme: 'xcode' },
  'layout.json': { sourceSwitchWidth: 'local-wider' },
  'reader-appearance.json': { waveVideoBackground: true, waveVideoWelcome: true, holidayVideoWelcome: true, promptExpandStyle: 'outlined-right' },
  'extended-preferences-v1.json': { ...EXTENDED_DEFAULTS, analyticsStyledBars: true },
  'reading-v2.json': { positions: {}, bookmarks: [], recent: [] },
};
async function fixture(t) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reader-online-images-')), apps = [];
  t.after(async () => { for (const app of apps.reverse()) await app.shutdown(); await fs.rm(dataDir, { recursive: true, force: true }); });
  for (const [name, data] of Object.entries(oldValues)) await fs.writeFile(path.join(dataDir, name), envelope(data));
  const open = async () => { const app = await new ApplicationService({ dataDir }).init(); apps.push(app); return app; };
  const files = async () => Promise.all(Object.keys(oldValues).map(name => fs.readFile(path.join(dataDir, name), 'utf8')));
  return { dataDir, open, files };
}

test('online images default to auto without rewriting Revision 9 or 3.2 profile files', async t => {
  const { dataDir, open, files } = await fixture(t), before = await files(), app = await open();
  assert.equal((await app.handle('bootstrap')).settings.remoteImages, 'auto');
  assert.equal(app.store, null, 'reading a preference must not mount the local archive in Server mode');
  await app.shutdown();
  assert.deepEqual(await files(), before);
  await assert.rejects(fs.stat(path.join(dataDir, REMOTE_IMAGES_FILE)), { code: 'ENOENT' });
  assert.deepEqual(validateRemoteImageSettings({}), REMOTE_IMAGE_DEFAULTS);
  assert.deepEqual(validateCoreSettings({ remoteImages: 'click' }), {});
  assert.throws(() => validateExtendedPreferences({ ...EXTENDED_DEFAULTS, remoteImages: 'click' }), /Invalid/);
  assert.throws(() => validateReaderAppearanceSettings({ remoteImages: 'click' }), /Invalid/);
  assert.throws(() => legacy.validateSettings({ remoteImages: 'click' }), /Unknown setting/);
});

test('both online image modes persist across restart in a separate sidecar with old profile bytes unchanged', async t => {
  const { dataDir, open, files } = await fixture(t), before = await files();
  let app = await open();
  for (const remoteImages of ['click', 'auto', 'click']) {
    const saved = await app.handle('settings.save', { values: { remoteImages } });
    assert.equal(saved.remoteImages, remoteImages);
    await app.shutdown(); app = await open();
    assert.equal((await app.handle('bootstrap')).settings.remoteImages, remoteImages);
    assert.deepEqual(await files(), before);
    assert.equal(app.store, null);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(dataDir, REMOTE_IMAGES_FILE), 'utf8')), { schemaVersion: 1, data: { remoteImages } });
  }
  const bytes = await files();
  [legacy.validateCoreSettings, legacy.validateInterfaceSettings, legacy.validateAppearanceSettings, legacy.validateLayoutSettings, validateReaderAppearanceSettings, validateExtendedPreferences].forEach((validate, i) => assert.doesNotThrow(() => validate(JSON.parse(bytes[i]).data)));
});

test('invalid online image values reject mixed saves before any file changes and shutdown drains accepted saves', async t => {
  const { dataDir, open, files } = await fixture(t), app = await open();
  await app.handle('settings.save', { values: { remoteImages: 'click' } });
  const before = await files(), saved = await fs.readFile(path.join(dataDir, REMOTE_IMAGES_FILE), 'utf8');
  for (const remoteImages of [null, undefined, true, false, 0, 1, '', 'automatic', 'AUTO', [], {}]) {
    assert.throws(() => validateSettings({ remoteImages }), /Invalid/);
    await assert.rejects(app.handle('settings.save', { values: { theme: 'light', remoteImages } }), /Invalid/);
  }
  assert.deepEqual(await files(), before);
  assert.equal(await fs.readFile(path.join(dataDir, REMOTE_IMAGES_FILE), 'utf8'), saved);
  for (const value of [null, [], { extra: 'auto' }]) assert.throws(() => validateRemoteImageSettings(value), /Invalid/);
  const pending = app.handle('settings.save', { values: { remoteImages: 'auto' } });
  await app.shutdown(); await pending;
  const reopened = await open();
  assert.equal((await reopened.handle('bootstrap')).settings.remoteImages, 'auto');
  assert.deepEqual(await files(), before);
  assert.deepEqual(REMOTE_IMAGE_MODES, ['auto', 'click']);
});

test('all five languages cover online-image settings and click/loading controls', () => {
  for (const language of locales) {
    for (const key of ['onlineImages', 'onlineImagesAuto', 'onlineImagesClick', 'onlineImagesHelp']) assert.ok(dictionaries[language][key]?.trim(), `${language}: ${key}`);
    setRendererLocale(language);
    for (const text of ['Load image', 'Loading image…']) {
      assert.ok(tr(text).trim());
      if (language !== 'en') assert.notEqual(tr(text), text, language);
    }
  }
  setRendererLocale('en');
});
