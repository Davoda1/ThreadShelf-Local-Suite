import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ApplicationService } from '../src/core/service.mjs';
import { JsonState, validateSettings, validateAppearanceSettings, validateReaderAppearanceSettings } from '../src/core/state.mjs';
import { READER_APPEARANCE_DEFAULTS, PROMPT_EXPAND_STYLES } from '../src/core/reader-appearance.mjs';
import * as legacy from './fixtures/compatibility-v3.2.0/core/state.mjs';

const envelope = data => JSON.stringify({ schemaVersion: 1, data }, null, 2) + '\n';
const preferenceFiles = ['settings.json', 'interface.json', 'appearance.json', 'layout.json'];
const legacyValues = {
  'settings.json': { ...legacy.DEFAULTS, language: 'hu', theme: 'dark', compact: false, fontSize: 'large' },
  'interface.json': { searchPanelExpanded: true },
  'appearance.json': { uiPalette: 'harbor-haze', codeTheme: 'xcode' },
  'layout.json': { sourceSwitchWidth: 'local-wider' },
};
async function fixture(t, { seed = true } = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-reader-appearance-'));
  const services = [];
  t.after(async () => {
    for (const service of services.reverse()) await service.shutdown();
    await fs.rm(dataDir, { recursive: true, force: true });
  });
  if (seed) for (const [name, value] of Object.entries(legacyValues)) await fs.writeFile(path.join(dataDir, name), envelope(value));
  const open = async (Service = ApplicationService) => {
    const service = await new Service({ dataDir }).init();
    services.push(service);
    return service;
  };
  return { dataDir, open };
}
const readFiles = (dataDir, names = preferenceFiles) => Promise.all(names.map(name => fs.readFile(path.join(dataDir, name), 'utf8')));

test('reader appearance defaults are additive; both old and current appearance readers retain the exact 3.2 key set', () => {
  assert.deepEqual(validateReaderAppearanceSettings({}), { ...READER_APPEARANCE_DEFAULTS });
  assert.deepEqual(validateReaderAppearanceSettings({ waveVideoBackground: true }), { ...READER_APPEARANCE_DEFAULTS, waveVideoBackground: true });
  assert.deepEqual(validateAppearanceSettings({}), legacy.APPEARANCE_DEFAULTS);
  assert.throws(() => legacy.validateAppearanceSettings({ ...legacy.APPEARANCE_DEFAULTS, waveVideoBackground: true }), /Invalid appearance/);
  assert.throws(() => validateAppearanceSettings({ ...legacy.APPEARANCE_DEFAULTS, waveVideoBackground: true }), /Invalid appearance/);
  for (const promptExpandStyle of PROMPT_EXPAND_STYLES) {
    assert.deepEqual(validateSettings({ waveVideoBackground: true, promptExpandStyle }), { waveVideoBackground: true, promptExpandStyle });
  }
});

test('malformed or unknown reader preferences are rejected without coercion', () => {
  for (const waveVideoBackground of [null, 0, 1, 'true', 'false', [], {}]) assert.throws(() => validateSettings({ waveVideoBackground }), /Invalid setting: waveVideoBackground/);
  for (const promptExpandStyle of [null, true, 5, '', 'outlined', 'legacy', [], {}]) assert.throws(() => validateSettings({ promptExpandStyle }), /Invalid setting: promptExpandStyle/);
  for (const values of [null, [], { theme: 'dark' }, { unknown: true }]) assert.throws(() => validateReaderAppearanceSettings(values), /Invalid reader appearance/);
  assert.throws(() => validateSettings({ waveVideoBackround: true }), /Unknown setting/);
  for (const key of ['waveVideoWelcome', 'holidayVideoWelcome']) {
    for (const value of [null, 0, 1, 'true', 'false', [], {}]) assert.throws(() => validateSettings({[key]:value}), new RegExp(`Invalid setting: ${key}`));
    assert.deepEqual(validateSettings({[key]:true}), {[key]:true});
  }
});

test('Revision 4 reader settings upgrade in place without rewriting until save, and new options survive restart', async t => {
  const {dataDir, open} = await fixture(t);
  const old = {waveVideoBackground:true,promptExpandStyle:'header-action'};
  const file = path.join(dataDir,'reader-appearance.json');
  const oldBytes = envelope(old);
  await fs.writeFile(file,oldBytes);
  const before = await readFiles(dataDir);
  let app = await open();
  const boot = await app.handle('bootstrap');
  assert.equal(boot.settings.waveVideoBackground,true);
  assert.equal(boot.settings.promptExpandStyle,'header-action');
  assert.equal(boot.settings.waveVideoWelcome,false);
  assert.equal(boot.settings.holidayVideoWelcome,false);
  assert.equal(await fs.readFile(file,'utf8'),oldBytes);
  const seeded = app.store.upsert({collection:'Upgrade',provider:'openai',sourceFile:'r4.json',conversationKey:'r4',title:'Retained conversation',turns:[{user:'Árvíztűrő 🧪 日本語',turn_index:0},{ai:'Retained response',turn_index:1}],raw:{preserved:true}});
  const thread = app.store.thread({id:seeded.summary.id});
  await app.handle('reading.save',{key:'local:'+seeded.summary.id,position:{turnIndex:1,role:'assistant',offset:.25},bookmark:{turnIndex:0,role:'user'}});
  const reading = (await app.handle('bootstrap')).reading;
  await app.shutdown();
  const archive = await treeHashes(path.join(dataDir,'local-storage-v2'));
  app = await open();
  await app.handle('settings.save',{values:{waveVideoWelcome:true,holidayVideoWelcome:true}});
  await app.shutdown();
  assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),{schemaVersion:1,data:{...READER_APPEARANCE_DEFAULTS,...old,waveVideoWelcome:true,holidayVideoWelcome:true}});
  assert.deepEqual(await readFiles(dataDir),before);
  app = await open();
  const after = await app.handle('bootstrap');
  assert.equal(after.settings.waveVideoWelcome,true);
  assert.equal(after.settings.holidayVideoWelcome,true);
  assert.deepEqual(after.reading,reading);
  assert.deepEqual(app.store.thread({id:seeded.summary.id}),thread);
  await app.shutdown();
  assert.deepEqual(await treeHashes(path.join(dataDir,'local-storage-v2')),archive);
});

test('3.2 profile opens with waves off and Outlined right, without rewriting any existing preference file', async t => {
  const { dataDir, open } = await fixture(t);
  const before = await readFiles(dataDir);
  const app = await open(), boot = await app.handle('bootstrap');
  assert.equal(boot.version, '1.1.0');
  assert.equal(boot.settings.waveVideoBackground, false);
  assert.equal(boot.settings.promptExpandStyle, 'outlined-right');
  for (const values of Object.values(legacyValues)) for (const [key, value] of Object.entries(legacy.validateSettings(values))) assert.deepEqual(boot.settings[key], value);
  await app.shutdown();
  assert.deepEqual(await readFiles(dataDir), before);
  await assert.rejects(fs.stat(path.join(dataDir, 'reader-appearance.json')), { code: 'ENOENT' });
});

test('all five choices and the wave toggle survive real save/restart; legacy files and archive content are unchanged', async t => {
  const { dataDir, open } = await fixture(t);
  let app = await open();
  const seeded = app.store.upsert({ collection: 'Reader settings', provider: 'openai', sourceFile: 'unchanged.json', conversationKey: 'unchanged', title: 'Exact data', turns: [{ user: 'Árvíztűrő 🧪 日本語', turn_index: 4 }], raw: { stable: true } });
  const original = app.store.thread({ id: seeded.summary.id });
  const before = await readFiles(dataDir);
  for (const [index, promptExpandStyle] of PROMPT_EXPAND_STYLES.entries()) {
    const waveVideoBackground = index % 2 === 0;
    const saved = await app.handle('settings.save', { values: { waveVideoBackground, promptExpandStyle } });
    assert.equal(saved.promptExpandStyle, promptExpandStyle);
    assert.equal(saved.waveVideoBackground, waveVideoBackground);
    await app.shutdown();
    app = await open();
    const boot = await app.handle('bootstrap');
    assert.equal(boot.settings.promptExpandStyle, promptExpandStyle);
    assert.equal(boot.settings.waveVideoBackground, waveVideoBackground);
    assert.deepEqual(app.store.thread({ id: seeded.summary.id }), original);
    assert.deepEqual(await readFiles(dataDir), before);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(dataDir, 'reader-appearance.json'), 'utf8')), { schemaVersion: 1, data: { ...READER_APPEARANCE_DEFAULTS, waveVideoBackground, promptExpandStyle } });
  }
});

test('mixed saves stay partitioned, validate before any writes, and drain queued reader settings at shutdown', async t => {
  const { dataDir, open } = await fixture(t);
  const app = await open();
  await app.handle('settings.save', { values: { language: 'ja', searchPanelExpanded: false, uiPalette: 'modern-oled', codeTheme: 'ayu', sourceSwitchWidth: 'equal', waveVideoBackground: true, promptExpandStyle: 'centered-pill' } });
  const validators = [legacy.validateCoreSettings, legacy.validateInterfaceSettings, legacy.validateAppearanceSettings, legacy.validateLayoutSettings];
  const names = [...preferenceFiles, 'reader-appearance.json'];
  const before = await readFiles(dataDir, names);
  for (let index = 0; index < preferenceFiles.length; index++) assert.doesNotThrow(() => validators[index](JSON.parse(before[index]).data));
  for (const values of [{ language: 'en', waveVideoBackground: 'true' }, { codeTheme: 'default', promptExpandStyle: 'missing' }]) await assert.rejects(app.handle('settings.save', { values }), /Invalid setting/);
  assert.deepEqual(await readFiles(dataDir, names), before);
  const writes = [app.handle('settings.save', { values: { waveVideoBackground: false } }), app.handle('settings.save', { values: { promptExpandStyle: 'divider-footer' } })];
  await app.shutdown();
  await Promise.all(writes);
  const boot = await (await open()).handle('bootstrap');
  assert.equal(boot.settings.waveVideoBackground, false);
  assert.equal(boot.settings.promptExpandStyle, 'divider-footer');
  assert.equal(boot.settings.uiPalette, 'modern-oled');
  assert.equal(boot.settings.language, 'ja');
});

test('actual frozen 3.2 validators read/save legacy files after 3.3 saves and leave reader preferences intact', async t => {
  const { dataDir, open } = await fixture(t);
  let app = await open();
  await app.handle('settings.save', { values: { waveVideoBackground: true, promptExpandStyle: 'header-action' } });
  await app.shutdown();
  const extensionBefore = await readFiles(dataDir, ['reader-appearance.json', 'reader-appearance.json.bak']);
  const old = await new legacy.JsonState(dataDir, 'appearance.json', legacy.APPEARANCE_DEFAULTS, legacy.validateAppearanceSettings).init();
  await old.update(value => ({ ...value, uiPalette: 'forest', codeTheme: 'nord' }));
  const oldCore = await new legacy.JsonState(dataDir, 'settings.json', legacy.DEFAULTS, value => ({ ...legacy.DEFAULTS, ...legacy.validateCoreSettings(value) })).init();
  await oldCore.update(value => ({ ...value, language: 'de', theme: 'light' }));
  assert.deepEqual(await readFiles(dataDir, ['reader-appearance.json', 'reader-appearance.json.bak']), extensionBefore);
  app = await open();
  const boot = await app.handle('bootstrap');
  assert.equal(boot.settings.uiPalette, 'forest');
  assert.equal(boot.settings.codeTheme, 'nord');
  assert.equal(boot.settings.language, 'de');
  assert.equal(boot.settings.theme, 'light');
  assert.equal(boot.settings.waveVideoBackground, true);
  assert.equal(boot.settings.promptExpandStyle, 'header-action');
});

test('invalid saved reader preferences recover only from a validated backup and preserve corrupt originals', async t => {
  const { dataDir } = await fixture(t);
  const file = path.join(dataDir, 'reader-appearance.json');
  const invalid = envelope({ waveVideoBackground: 'true', promptExpandStyle: 'outlined-right' });
  const valid = envelope({ waveVideoBackground: true, promptExpandStyle: 'compact-left' });
  await fs.writeFile(file, invalid);
  await fs.writeFile(file + '.bak', valid);
  const recovered = await new JsonState(dataDir, 'reader-appearance.json', READER_APPEARANCE_DEFAULTS, validateReaderAppearanceSettings).init();
  assert.deepEqual(recovered.snapshot(), { ...READER_APPEARANCE_DEFAULTS, waveVideoBackground: true, promptExpandStyle: 'compact-left' });
  assert.match(recovered.notice, /Recovered/);
  assert.equal(await fs.readFile(file, 'utf8'), invalid);
  await fs.writeFile(file + '.bak', invalid);
  await assert.rejects(new JsonState(dataDir, 'reader-appearance.json', READER_APPEARANCE_DEFAULTS, validateReaderAppearanceSettings).init(), /Saved files were preserved/);
  assert.equal(await fs.readFile(file, 'utf8'), invalid);
  const future = JSON.stringify({ schemaVersion: 2, data: {} });
  await fs.writeFile(file, future);
  await fs.writeFile(file + '.bak', valid);
  await assert.rejects(new JsonState(dataDir, 'reader-appearance.json', READER_APPEARANCE_DEFAULTS, validateReaderAppearanceSettings).init(), /Unsupported saved state version/);
  assert.equal(await fs.readFile(file, 'utf8'), future);
});

async function treeHashes(root) {
  const result = {};
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) for (const [name, value] of Object.entries(await treeHashes(file))) result[entry.name + '/' + name] = value;
    else result[entry.name] = createHash('sha256').update(await fs.readFile(file)).digest('hex');
  }
  return result;
}

// The released source is deliberately external, not copied into the new product.
// Run with THREADSHELF_LEGACY_SOURCE=/path/to/3.2.0-Source to exercise both complete services.
test('released 3.2 service -> 3.3 service -> released 3.2 service -> 3.3 preserves settings, saved reading and every durable archive byte', { skip: !process.env.THREADSHELF_LEGACY_SOURCE }, async t => {
  const currentRoot = fileURLToPath(new URL('..', import.meta.url));
  const oldRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-released-3.2-'));
  t.after(() => fs.rm(oldRoot, { recursive: true, force: true }));
  await fs.cp(path.join(process.env.THREADSHELF_LEGACY_SOURCE, 'src'), path.join(oldRoot, 'src'), { recursive: true });
  await fs.copyFile(path.join(process.env.THREADSHELF_LEGACY_SOURCE, 'package.json'), path.join(oldRoot, 'package.json'));
  await fs.symlink(path.join(currentRoot, 'node_modules'), path.join(oldRoot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  await fs.symlink(path.join(currentRoot, 'vendor'), path.join(oldRoot, 'vendor'), process.platform === 'win32' ? 'junction' : 'dir');
  const { ApplicationService: LegacyService } = await import(pathToFileURL(path.join(oldRoot, 'src/core/service.mjs')).href);
  const { dataDir, open } = await fixture(t);
  let app = await open(LegacyService);
  const seeded = app.store.upsert({ collection: 'Compatibility', provider: 'openai', sourceFile: 'v3.2.json', conversationKey: 'roundtrip', title: 'Round trip', turns: [{ user: 'Unchanged — Árvíztűrő 🧪 日本語', turn_index: 0 }, { ai: 'Answer', turn_index: 1 }], raw: { preserved: true } });
  const original = app.store.thread({ id: seeded.summary.id });
  await app.handle('reading.save', { key: 'local:' + seeded.summary.id, position: { turnIndex: 1, role: 'assistant', offset: .25 }, bookmark: { turnIndex: 0, role: 'user' } });
  const reading = (await app.handle('bootstrap')).reading;
  await app.shutdown();
  const preferencesBefore = await readFiles(dataDir), archiveBefore = await treeHashes(path.join(dataDir, 'local-storage-v2'));
  app = await open();
  const boot = await app.handle('bootstrap');
  assert.equal(boot.settings.waveVideoBackground, false);
  assert.equal(boot.settings.promptExpandStyle, 'outlined-right');
  assert.deepEqual(boot.reading, reading);
  assert.deepEqual(app.store.thread({ id: seeded.summary.id }), original);
  await app.handle('settings.save', { values: { waveVideoBackground: true, promptExpandStyle: 'divider-footer' } });
  await app.shutdown();
  assert.deepEqual(await readFiles(dataDir), preferencesBefore);
  assert.deepEqual(await treeHashes(path.join(dataDir, 'local-storage-v2')), archiveBefore);
  const extension = await readFiles(dataDir, ['reader-appearance.json', 'reader-appearance.json.bak']);
  app = await open(LegacyService);
  const legacyBoot = await app.handle('bootstrap');
  assert.equal(legacyBoot.version, '3.2.0');
  assert.equal(legacyBoot.notice, '');
  assert.equal(legacyBoot.settings.waveVideoBackground, undefined);
  assert.equal(legacyBoot.settings.promptExpandStyle, undefined);
  assert.deepEqual(legacyBoot.reading, reading);
  assert.deepEqual(app.store.thread({ id: seeded.summary.id }), original);
  await app.handle('settings.save', { values: { language: 'fr', theme: 'light', uiPalette: 'garnet', codeTheme: 'ayu' } });
  await app.shutdown();
  assert.deepEqual(await readFiles(dataDir, ['reader-appearance.json', 'reader-appearance.json.bak']), extension);
  assert.deepEqual(await treeHashes(path.join(dataDir, 'local-storage-v2')), archiveBefore);
  app = await open();
  const upgraded = await app.handle('bootstrap');
  assert.equal(upgraded.settings.waveVideoBackground, true);
  assert.equal(upgraded.settings.promptExpandStyle, 'divider-footer');
  assert.equal(upgraded.settings.language, 'fr');
  assert.equal(upgraded.settings.theme, 'light');
  assert.equal(upgraded.settings.uiPalette, 'garnet');
  assert.equal(upgraded.settings.codeTheme, 'ayu');
  assert.deepEqual(upgraded.reading, reading);
  assert.deepEqual(app.store.thread({ id: seeded.summary.id }), original);
  await app.shutdown();
  assert.deepEqual(await treeHashes(path.join(dataDir, 'local-storage-v2')), archiveBefore);
});
