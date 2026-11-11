import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ApplicationService } from '../src/core/service.mjs';
import { DEFAULTS, validateSettings, validateCoreSettings, validateReaderAppearanceSettings } from '../src/core/state.mjs';
import { CODE_PRESENTATION_DEFAULTS, CODE_PRESENTATION_SETTINGS_FILE, validateCodePresentationSettings } from '../src/core/code-presentation-settings.mjs';
import { dictionaries } from '../src/ui/i18n.js';

test('code display defaults are off; booleans validate strictly without widening legacy files', () => {
  assert.deepEqual(validateCodePresentationSettings({}), { codeWrap: false, codeLineNumbers: false });
  for (const key of Object.keys(CODE_PRESENTATION_DEFAULTS)) {
    for (const value of [null, 0, 1, 'true', 'false', [], {}]) {
      assert.throws(() => validateSettings({ [key]: value }), /Invalid setting/);
      assert.throws(() => validateCodePresentationSettings({ [key]: value }), /Invalid code presentation/);
    }
    assert.deepEqual(validateSettings({ [key]: true }), { [key]: true });
    assert.deepEqual(validateCoreSettings({ [key]: true }), {});
    assert.throws(() => validateReaderAppearanceSettings({ [key]: true }), /Invalid reader appearance/);
  }
  for (const value of [null, [], { unknown: true }]) assert.throws(() => validateCodePresentationSettings(value), /Invalid code presentation/);
  for (const dictionary of Object.values(dictionaries)) for (const key of ['codeWrap', 'codeWrapHelp', 'codeLineNumbers', 'codeLineNumbersHelp']) assert.ok(dictionary[key]?.trim(), key);
});

test('code display saves survive restart with exact archive source and legacy preference bytes unchanged', async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-code-settings-'));
  const services = [];
  t.after(async () => { for (const app of services.reverse()) await app.shutdown(); await fs.rm(dataDir, { recursive: true, force: true }); });
  const old = JSON.stringify({ schemaVersion: 1, data: { ...DEFAULTS, language: 'ja' } }, null, 2) + '\n';
  await fs.writeFile(path.join(dataDir, 'settings.json'), old);
  const open = async () => { const app = await new ApplicationService({ dataDir }).init(); services.push(app); return app; };
  let app = await open();
  let settings = (await app.handle('bootstrap')).settings;
  assert.equal(settings.codeWrap, false); assert.equal(settings.codeLineNumbers, false);
  await assert.rejects(fs.stat(path.join(dataDir, CODE_PRESENTATION_SETTINGS_FILE)), { code: 'ENOENT' });
  const source = '```js\n/* multiline\n  Árvíztűrő 🧪 日本語\n*/\n\n  const value = 3;\n```';
  const result = app.store.upsert({ collection: 'Code display', provider: 'openai', sourceFile: 'synthetic.json', conversationKey: 'source', title: 'Source unchanged', turns: [{ ai: source, turn_index: 0 }], raw: { source } });
  const original = app.store.thread({ id: result.summary.id });
  for (const values of [{codeWrap:true,codeLineNumbers:false},{codeWrap:false,codeLineNumbers:true},{codeWrap:true,codeLineNumbers:true},{codeWrap:false,codeLineNumbers:false}]) {
    settings = await app.handle('settings.save', { values });
    for (const [key,value] of Object.entries(values)) assert.equal(settings[key], value);
    await app.shutdown(); app = await open();
    settings = (await app.handle('bootstrap')).settings;
    for (const [key,value] of Object.entries(values)) assert.equal(settings[key], value);
    assert.deepEqual(app.store.thread({ id: result.summary.id }), original);
    assert.equal(await fs.readFile(path.join(dataDir, 'settings.json'), 'utf8'), old);
  }
  const before = await fs.readFile(path.join(dataDir, CODE_PRESENTATION_SETTINGS_FILE), 'utf8');
  await assert.rejects(app.handle('settings.save', { values: { language: 'en', codeWrap: 'true' } }), /Invalid setting/);
  assert.equal(await fs.readFile(path.join(dataDir, CODE_PRESENTATION_SETTINGS_FILE), 'utf8'), before);
  assert.equal(await fs.readFile(path.join(dataDir, 'settings.json'), 'utf8'), old);
});
