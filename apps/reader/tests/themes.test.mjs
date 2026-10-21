import manifest from '../package.json' with {type:'json'};
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ApplicationService } from '../src/core/service.mjs';
import { UI_PALETTES, CODE_THEMES, APPEARANCE_DEFAULTS } from '../src/core/themes.mjs';
import { validateAppearanceSettings, validateSettings } from '../src/core/state.mjs';
import { readStartupAppearance } from '../src/desktop/startup-appearance.mjs';

const stateBytes = data => JSON.stringify({ schemaVersion: 1, data }, null, 2) + '\n';
const legacyKeys = new Set(['mode','language','theme','fontSize','highContrast','compact','animations','listMode','pageSize','sort','directoryMode','customDirectory','lastDirectory','serverUrl','serverAddresses','localCollection','serverCollection','searchMode','ollamaUrl','ollamaModel']);
const luminance = hex => {
  const rgb = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

test('theme choices contain complete distinct light/dark color maps and safe defaults', () => {
  assert.deepEqual(UI_PALETTES.map(v => v.id), ['default','ocean','forest','ember','amethyst','oled','modern','modern-oled','platinum','platinum-plus','professional','vellum','prism','nocturne','garnet','smoked-glass','harbor-haze','amber-room','opal-daylight']);
  assert.deepEqual(CODE_THEMES.map(v => v.id), ['default','vscode','github','monokai','nord','dracula','solarized','codex','xcode','ayu']);
  assert.deepEqual(APPEARANCE_DEFAULTS, { uiPalette: 'default', codeTheme: 'default' });
  assert.deepEqual(validateAppearanceSettings({ uiPalette: 'modern' }), { uiPalette: 'modern', codeTheme: 'default' });
  assert.deepEqual(validateAppearanceSettings({ uiPalette: 'modern-oled' }), { uiPalette: 'modern-oled', codeTheme: 'default' });
  assert.deepEqual(UI_PALETTES.find(v => v.id === 'modern').tokens, UI_PALETTES.find(v => v.id === 'default').tokens, 'Modern inherits Default colors');
  assert.deepEqual(UI_PALETTES.find(v => v.id === 'modern-oled').tokens, UI_PALETTES.find(v => v.id === 'oled').tokens, 'Modern OLED inherits OLED colors');
  for (const catalog of [UI_PALETTES, CODE_THEMES]) {
    const keys = Object.keys(catalog[1].tokens.light);
    for (const theme of catalog.slice(1).filter(theme => theme.id !== 'modern')) {
      for (const mode of ['light','dark']) {
        assert.deepEqual(Object.keys(theme.tokens[mode]), keys);
        for (const value of Object.values(theme.tokens[mode])) assert.match(value, /^#[0-9a-f]{6}$/);
      }
      assert.notDeepEqual(theme.tokens.light, theme.tokens.dark);
    }
  }
  assert.throws(() => validateAppearanceSettings({ uiPalette: 'missing' }), /Invalid setting: uiPalette/);
  assert.throws(() => validateAppearanceSettings({ codeTheme: 'url(https://example.com)' }), /Invalid setting: codeTheme/);
  assert.throws(() => validateAppearanceSettings({ theme: 'dark' }), /Invalid appearance/);
  assert.throws(() => validateSettings({ uiPalette: null }), /Invalid setting/);
});

test('Revision 8 preserves all eighteen existing palette entries and every code theme', () => {
  // Hashes were measured from the delivered R7 catalog, not generated from R8.
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(digest(UI_PALETTES.filter(palette => palette.id !== 'platinum-plus')), 'bfb9e339c89ae6508680e10f0560650fa3a467c55d674faa2793a2059132aafa');
  assert.equal(digest(CODE_THEMES), '083d267e50c705ba01ad21c7a52cbf44245e75730da65be6c122fceec442ba0f');
});

test('custom palettes maintain readable primary UI and code token contrast in both color modes', () => {
  const check = (fg, bg, label) => assert.ok(contrast(fg, bg) >= 4.5, `${label}: ${contrast(fg, bg).toFixed(2)}:1`);
  for (const theme of UI_PALETTES.slice(1).filter(theme => theme.id !== 'modern')) for (const mode of ['light','dark']) {
    const v = theme.tokens[mode];
    for (const fg of ['text','muted']) for (const bg of ['surface','bg','sidebar']) check(v[fg], v[bg], `${theme.id}/${mode}/${fg}/${bg}`);
    check(v['primary-ink'], v.accent, `${theme.id}/${mode}/primary`);
    check(v['accent-text'], v['accent-soft'], `${theme.id}/${mode}/selected`);
  }
  for (const theme of CODE_THEMES.slice(1)) for (const mode of ['light','dark']) {
    const v = theme.tokens[mode];
    for (const role of ['foreground','comment','keyword','string','number','title','type','attribute','variable','meta','operator','selector']) check(v[role], v.background, `${theme.id}/${mode}/${role}`);
    check(v.label, v.header, `${theme.id}/${mode}/label`);
    check(v.addition, v['addition-background'], `${theme.id}/${mode}/addition`);
    check(v.deletion, v['deletion-background'], `${theme.id}/${mode}/deletion`);
  }
});

test('Platinum Plus follows Platinum, inherits Professional tokens exactly, and preserves their neutral colors', () => {
  const platinum = UI_PALETTES.findIndex(theme => theme.id === 'platinum');
  const plus = UI_PALETTES[platinum + 1], professional = UI_PALETTES[platinum + 2];
  assert.equal(plus.id, 'platinum-plus');
  assert.equal(plus.name, 'Platinum Plus');
  assert.deepEqual(plus.tokens, professional.tokens);
  assert.ok(Object.isFrozen(plus) && Object.isFrozen(plus.tokens.light) && Object.isFrozen(plus.tokens.dark));
  assert.deepEqual(validateAppearanceSettings({ uiPalette: plus.id }), { uiPalette: plus.id, codeTheme: 'default' });
  assert.equal(professional.id, 'professional');
  assert.equal(professional.name, 'Professional');
  const accentKeys = new Set(['accent', 'accent-hover', 'accent-soft', 'accent-text', 'focus']);
  for (const mode of ['light', 'dark']) for (const [key, value] of Object.entries(UI_PALETTES[platinum].tokens[mode])) {
    if (!accentKeys.has(key)) assert.equal(professional.tokens[mode][key], value, `${mode}/${key} retains Platinum`);
  }
});

for (const palette of ['professional', 'platinum-plus']) test(`${palette} saves and restores at native startup without changing archive data or independent preferences`, async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tslr-professional-'));
  let app = await new ApplicationService({ dataDir }).init();
  t.after(async () => { await app?.shutdown(); await fs.rm(dataDir, { recursive: true, force: true }); });
  await app.handle('settings.save', { values: { uiPalette: 'platinum', codeTheme: 'ayu', theme: 'system', language: 'hu', waveVideoBackground: true, promptExpandStyle: 'header-action', sourceSwitchWidth: 'local-wider', searchPanelExpanded: true } });
  const seeded = await app.store.upsert({ collection: 'Existing Revision 4', provider: 'openai', sourceFile: 'professional.json', conversationKey: 'professional', title: 'Preserved archive', turns: [{ user: 'Exact source — Árvíztűrő 🧪 日本語', turn_index: 0 }] });
  const thread = app.store.thread({ id: seeded.summary.id }), revision = app.store.revision();
  await app.shutdown();
  const unrelated = ['settings.json', 'interface.json', 'layout.json', 'reader-appearance.json'];
  const before = await Promise.all(unrelated.map(name => fs.readFile(path.join(dataDir, name), 'utf8')));
  app = await new ApplicationService({ dataDir }).init();
  assert.equal((await app.handle('bootstrap')).settings.uiPalette, 'platinum');
  await app.handle('settings.save', { values: { uiPalette: palette } });
  await app.shutdown();
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dataDir, 'appearance.json'), 'utf8')), { schemaVersion: 1, data: { uiPalette: palette, codeTheme: 'ayu' } });
  assert.equal((await readStartupAppearance(dataDir)).uiPalette, palette);
  app = await new ApplicationService({ dataDir }).init();
  const boot = await app.handle('bootstrap');
  assert.equal(boot.settings.uiPalette, palette);
  assert.equal(boot.settings.codeTheme, 'ayu');
  assert.equal(boot.settings.theme, 'system');
  assert.equal(boot.settings.language, 'hu');
  assert.equal(boot.settings.waveVideoBackground, true);
  assert.equal(boot.settings.promptExpandStyle, 'header-action');
  assert.equal(boot.settings.sourceSwitchWidth, 'local-wider');
  assert.equal(boot.settings.searchPanelExpanded, true);
  assert.deepEqual(await Promise.all(unrelated.map(name => fs.readFile(path.join(dataDir, name), 'utf8'))), before);
  assert.deepEqual(app.store.thread({ id: seeded.summary.id }), thread);
  assert.equal(app.store.revision(), revision);
  const codeOnly = await app.handle('settings.save', { values: { codeTheme: 'xcode' } });
  assert.equal(codeOnly.uiPalette, palette);
  const paletteOnly = await app.handle('settings.save', { values: { uiPalette: 'platinum' } });
  assert.equal(paletteOnly.codeTheme, 'xcode');
});

test('OLED uses neutral surfaces and readable semantic states in both modes', () => {
  const oled = UI_PALETTES.find(theme => theme.id === 'oled');
  assert.equal(oled.tokens.dark.bg, '#000000');
  assert.equal(oled.tokens.light.bg, '#ffffff');
  assert.deepEqual(validateAppearanceSettings({ uiPalette: 'oled' }), { uiPalette: 'oled', codeTheme: 'default' });
  for (const mode of ['light', 'dark']) {
    const values = oled.tokens[mode];
    for (const [name, color] of Object.entries(values)) {
      if (name === 'danger' || name === 'warning') continue;
      const [r, g, b] = color.slice(1).match(/../g);
      assert.equal(r, g, `${mode}/${name} must be neutral grey`);
      assert.equal(g, b, `${mode}/${name} must be neutral grey`);
    }
    for (const fg of ['text', 'muted', 'faint', 'accent', 'danger', 'warning', 'role-assistant']) {
      for (const bg of ['bg', 'surface', 'sidebar']) {
        assert.ok(contrast(values[fg], values[bg]) >= 4.5, `${mode}/${fg}/${bg} must remain readable`);
      }
    }
  }
});

test('1.1.0 profiles gain independent appearance without modifying legacy settings, reading or archive contents', async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tslr-appearance-upgrade-'));
  let app;
  t.after(async () => { await app?.shutdown(); await fs.rm(dataDir, { recursive: true, force: true }); });
  const oldSettings = { language: 'hu', theme: 'system', serverUrl: 'http://localhost:3000/', searchMode: 'keyword', localCollection: 'Archive' };
  const oldInterface = { searchPanelExpanded: true };
  const oldReading = { positions: { 'local:legacy': { turnIndex: 7, role: 'ai', offset: 0.25 } }, bookmarks: [], recent: [] };
  const legacy = { 'settings.json': stateBytes(oldSettings), 'interface.json': stateBytes(oldInterface), 'reading-v2.json': stateBytes(oldReading) };
  for (const [name, bytes] of Object.entries(legacy)) await fs.writeFile(path.join(dataDir, name), bytes);
  app = await new ApplicationService({ dataDir }).init();
  const imported = app.store.upsert({ provider: 'openai', collection: 'Archive', sourceFile: '/legacy/export.json', conversationKey: 'legacy', title: 'Kept conversation', turns: [{ user: 'exact legacy text', turn_index: 7 }], raw: { untouched: true } });
  const original = app.store.thread({ id: imported.summary.id });
  const bootstrap = await app.handle('bootstrap');
  assert.equal(bootstrap.version, manifest.version);
  assert.equal(bootstrap.settings.uiPalette, 'default');
  assert.equal(bootstrap.settings.codeTheme, 'default');
  assert.equal(bootstrap.settings.searchPanelExpanded, true);
  const saved = await app.handle('settings.save', { values: { uiPalette: 'forest', codeTheme: 'dracula' } });
  assert.equal(saved.theme, 'system');
  assert.equal(saved.language, 'hu');
  for (const [name, bytes] of Object.entries(legacy)) assert.equal(await fs.readFile(path.join(dataDir, name), 'utf8'), bytes, `${name} must be byte-for-byte unchanged`);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dataDir, 'appearance.json'))), { schemaVersion: 1, data: { uiPalette: 'forest', codeTheme: 'dracula' } });
  assert.equal(app.store.revision(), 1);
  await app.shutdown();
  app = await new ApplicationService({ dataDir }).init();
  const reopened = await app.handle('bootstrap');
  assert.equal(reopened.settings.uiPalette, 'forest');
  assert.equal(reopened.settings.codeTheme, 'dracula');
  assert.deepEqual(reopened.reading, oldReading);
  assert.deepEqual(app.store.thread({ id: imported.summary.id }), original);
  // The 1.0.0 settings and 1.1.0 interface readers reject unknown keys.
  assert.ok(Object.keys(JSON.parse(await fs.readFile(path.join(dataDir, 'settings.json'))).data).every(key => legacyKeys.has(key)));
  assert.deepEqual(Object.keys(JSON.parse(await fs.readFile(path.join(dataDir, 'interface.json'))).data), ['searchPanelExpanded']);
});

test('mixed preference writes remain partitioned and invalid themes cannot partially change settings', async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tslr-appearance-save-'));
  const app = await new ApplicationService({ dataDir }).init();
  t.after(async () => { await app.shutdown(); await fs.rm(dataDir, { recursive: true, force: true }); });
  await app.handle('settings.save', { values: { language: 'fr', theme: 'dark', searchPanelExpanded: true, uiPalette: 'ocean', codeTheme: 'vscode' } });
  const names = ['settings.json','interface.json','appearance.json'];
  const before = await Promise.all(names.map(name => fs.readFile(path.join(dataDir, name), 'utf8')));
  const records = before.map(bytes => JSON.parse(bytes).data);
  assert.ok(Object.keys(records[0]).every(key => legacyKeys.has(key)));
  assert.deepEqual(records[1], { searchPanelExpanded: true });
  assert.deepEqual(records[2], { uiPalette: 'ocean', codeTheme: 'vscode' });
  await assert.rejects(app.handle('settings.save', { values: { language: 'en', searchPanelExpanded: false, uiPalette: 'invalid' } }), /Invalid setting: uiPalette/);
  assert.deepEqual(await Promise.all(names.map(name => fs.readFile(path.join(dataDir, name), 'utf8'))), before);
  const writes = [app.handle('settings.save', { values: { uiPalette: 'oled' } }), app.handle('settings.save', { values: { codeTheme: 'codex' } })];
  await app.shutdown();
  await Promise.all(writes);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dataDir, 'appearance.json'))).data, { uiPalette: 'oled', codeTheme: 'codex' });
});


test('revision 5 palettes and code schemes survive independent saves and a real service restart', async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tslr-appearance-r5-'));
  let app = await new ApplicationService({ dataDir }).init();
  t.after(async () => { await app?.shutdown(); await fs.rm(dataDir, { recursive: true, force: true }); });
  const palettes = ['platinum', 'vellum', 'prism', 'nocturne', 'garnet'];
  const codes = ['xcode', 'ayu'];
  const seeded = await app.store.upsert({ collection: 'Preserved', provider: 'openai', sourceFile: 'r5.json', conversationKey: 'r5', title: 'Revision 5 data invariant', turns: [{ user: 'Exact Unicode — Árvíztűrő 🧪', turn_index: 0 }] });
  const before = app.store.thread({ id: seeded.summary.id });
  for (const uiPalette of palettes) for (const codeTheme of codes) {
    const saved = await app.handle('settings.save', { values: { uiPalette, codeTheme, theme: 'system' } });
    assert.equal(saved.uiPalette, uiPalette);
    assert.equal(saved.codeTheme, codeTheme);
    await app.shutdown();
    app = await new ApplicationService({ dataDir }).init();
    const boot = await app.handle('bootstrap');
    assert.equal(boot.version, manifest.version);
    assert.equal(boot.settings.uiPalette, uiPalette);
    assert.equal(boot.settings.codeTheme, codeTheme);
    assert.equal(boot.settings.theme, 'system');
    assert.deepEqual(app.store.thread({ id: seeded.summary.id }), before);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(dataDir, 'appearance.json'))).data, { uiPalette, codeTheme });
  }
});

test('3.1.0 glass palettes persist independently across restarts without changing archive or unrelated preferences', async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tslr-glassy-persistence-'));
  let app = await new ApplicationService({ dataDir }).init();
  t.after(async () => { await app?.shutdown(); await fs.rm(dataDir, { recursive: true, force: true }); });
  await app.handle('settings.save', { values: { language: 'ja', theme: 'system', searchPanelExpanded: true, codeTheme: 'ayu' } });
  const seeded = await app.store.upsert({ collection: 'Preserved glass fixture', provider: 'openai', sourceFile: 'glassy.json', conversationKey: 'glassy', title: 'Unchanged content', turns: [{ user: 'Exact Unicode — Árvíztűrő 🧪 日本語', turn_index: 0 }] });
  const originalThread = app.store.thread({ id: seeded.summary.id }), revision = app.store.revision();
  const unrelated = ['settings.json', 'interface.json'];
  const before = await Promise.all(unrelated.map(name => fs.readFile(path.join(dataDir, name), 'utf8')));
  for (const uiPalette of ['smoked-glass', 'harbor-haze', 'amber-room', 'opal-daylight']) {
    const saved = await app.handle('settings.save', { values: { uiPalette } });
    assert.equal(saved.codeTheme, 'ayu', 'UI changes retain the selected code theme');
    assert.equal(saved.theme, 'system');
    await app.shutdown();
    app = await new ApplicationService({ dataDir }).init();
    const boot = await app.handle('bootstrap');
    assert.equal(boot.version, manifest.version);
    assert.equal(boot.settings.uiPalette, uiPalette);
    assert.equal(boot.settings.codeTheme, 'ayu');
    assert.equal(boot.settings.language, 'ja');
    assert.equal(boot.settings.theme, 'system');
    assert.equal(boot.settings.searchPanelExpanded, true);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(dataDir, 'appearance.json'))).data, { uiPalette, codeTheme: 'ayu' });
    assert.deepEqual(await Promise.all(unrelated.map(name => fs.readFile(path.join(dataDir, name), 'utf8'))), before);
    assert.deepEqual(app.store.thread({ id: seeded.summary.id }), originalThread);
    assert.equal(app.store.revision(), revision);
    const codeOnly = await app.handle('settings.save', { values: { codeTheme: 'xcode' } });
    assert.equal(codeOnly.uiPalette, uiPalette, 'Code changes retain the selected UI theme');
    await app.handle('settings.save', { values: { codeTheme: 'ayu' } });
  }
});
