#!/usr/bin/env node
// Real desktop UI + isolated persistent service. Synthetic conversations only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { ApplicationService } from '../src/core/service.mjs';
import { PROMPT_EXPAND_STYLES } from '../src/core/reader-appearance.mjs';
import { UI_PALETTES } from '../src/core/themes.mjs';
import { dictionaries } from '../src/ui/i18n.js';
const { _electron } = await import(process.env.THREADSHELF_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'tslr-reader-appearance-330-'));
const dataDir = path.join(temp, 'profile');
const evidence = process.env.READER_EVIDENCE || path.join(root, 'docs/evidence/v1.0.0/reader-appearance');
await fs.mkdir(evidence, { recursive: true });
const longPrompt = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1}: preserve this exact original prompt, including Árvíztűrő and 日本語. This is a synthetic regression fixture.`).join('\n\n');
const fixture = { collection: 'Regression fixture', provider: 'openai', sourceFile: 'appearance-synthetic.json', conversationKey: 'reader-330', title: 'Reader appearance regression', turns: [{ user: longPrompt, turn_index: 0 }, { thinking: 'This reasoning control must keep the previous behavior.', turn_index: 1 }, { ai: '## Stable response\n\n```javascript\nconst answer = 42;\n```\n\nA response with **formatting**.', turn_index: 2 }] };
const seed = await new ApplicationService({ dataDir }).init();
await seed.handle('settings.save', { values: { theme: 'dark', animations: true, language: 'en', compact: true } });
await seed.store.upsert(fixture);
await seed.store.upsert({ ...fixture, conversationKey: 'short-330', title: 'Short fixture', turns: [{ user: 'Short prompt', turn_index: 0 }, { ai: 'Short response', turn_index: 1 }] });
await seed.handle('shutdown');
const harness = path.join(temp, 'harness');
await fs.mkdir(harness);
await fs.writeFile(path.join(harness, 'package.json'), JSON.stringify({ name: 'reader-appearance-regression', version: '1.0.0', main: 'main.cjs' }));
await fs.writeFile(path.join(harness, 'main.cjs'), `const {app,ipcMain}=require('electron');
${process.env.READER_TEST_SOCKETLESS === '1' ? 'app.requestSingleInstanceLock=()=>true;' : ''}
const register=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(channel,handler)=>register(channel,(event,action,...args)=>{if(global.failSettingsSave&&action==='settings.save')throw new Error('Synthetic settings write failure');return handler(event,action,...args);});
require(${JSON.stringify(path.join(root, 'src/desktop/main.cjs'))});`);
const env = { ...process.env, THREADSHELF_READER_TEST_DATA: dataDir };
delete env.ELECTRON_RUN_AS_NODE;
let app, page;
const errors = [], passed = [], records = [];
async function launch() {
  app = await _electron.launch({ executablePath: process.env.READER_ELECTRON || path.join(root, 'node_modules/electron/dist/electron'), args: ['--no-sandbox', '--disable-gpu', harness], env, timeout: 45000 });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('.conversation-row').first().waitFor();
  await page.locator('.conversation-row').filter({ hasText: fixture.title }).click();
  await page.locator('.message.user.is-long-prompt .prompt-expand-bar').waitFor();
}
async function close() { if (app) await app.close(); app = null; }
async function settings() { await page.locator('[data-action="settings"]').click(); await page.locator('[data-action="settings-tab"][data-tab="appearance"]').click(); await page.locator('#prefPromptExpandStyle').waitFor(); }
async function save() { await page.locator('#settingsForm button[type="submit"]').click(); await page.locator('#settingsForm').waitFor({ state: 'detached' }); await page.locator('.message.user.is-long-prompt').waitFor(); }
async function cancel() { await page.locator('.modal-header [data-action="modal-close"]').click(); }
async function boot() { return page.evaluate(() => window.desktop.invoke('bootstrap')); }
async function noVideo() { await page.waitForFunction(() => !document.querySelector('.threadshelf-wave-video')); }
async function videoReady(theme) {
  await page.waitForFunction(theme => { const v = document.querySelector('.threadshelf-wave-video'); return v?.dataset.waveTheme === theme && v.videoWidth === 1920 && v.videoHeight === 1080 && v.readyState >= 2 && v.currentTime > .12 && !v.paused && !v.error; }, theme, { timeout: 20000 });
  return page.locator('.threadshelf-wave-video').evaluate(v => ({ currentTime: v.currentTime, width: v.videoWidth, height: v.videoHeight, paused: v.paused, muted: v.muted, loop: v.loop, theme: v.dataset.waveTheme, source: v.currentSrc, filter: getComputedStyle(v).filter, opacity: getComputedStyle(v).opacity, frames: v.getVideoPlaybackQuality?.().totalVideoFrames }));
}
async function sourceText() { return page.locator('.message.user').first().evaluate(m => m.sourceText); }
async function geometry() {
  return page.evaluate(() => {
    const message = document.querySelector('.message.user.is-long-prompt'), button = message.querySelector('.prompt-expand-bar'), header = message.querySelector('.message-header');
    const rect = node => node.getBoundingClientRect().toJSON();
    return { style: document.querySelector('#conversationContent').dataset.promptExpandStyle, message: rect(message), button: rect(button), header: rect(header), headerAction: button.parentElement === header, width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, color: getComputedStyle(button).color, border: getComputedStyle(button).borderColor, controls: button.getAttribute('aria-controls'), targetExists: !!document.getElementById(button.getAttribute('aria-controls')) };
  });
}
function bounded(g) {
  assert.ok(g.button.left >= g.message.left && g.button.right <= g.message.right + 1, 'Prompt button fits its message');
  assert.ok(g.button.width > 0 && g.button.height >= 33, 'Prompt button remains usable');
  assert.ok(g.scrollWidth <= g.width && g.scrollHeight <= g.height, 'No global scrolling');
  assert.ok(g.targetExists, 'ARIA target preserved');
  if (g.style === 'header-action') assert.ok(g.headerAction && g.button.top >= g.header.top && g.button.bottom <= g.header.bottom + 1, 'Header action wraps inside header');
  else assert.equal(g.headerAction, false);
}
try {
  await launch();
  const initial = await boot();
  assert.equal(initial.version, '1.0.0');
  assert.equal(initial.settings.waveVideoBackground, false);
  assert.equal(initial.settings.promptExpandStyle, 'outlined-right');
  assert.match(await page.locator('.brand-subtitle').textContent(), /3\.3\.0/);
  await noVideo();
  assert.equal(await sourceText(), longPrompt);
  passed.push('1.0.0 bootstrap/UI version, existing-profile defaults and exact original prompt preserved');

  await settings();
  assert.equal(await page.locator('#prefWaveVideoBackground').getAttribute('role'), 'switch');
  assert.equal(await page.locator('#prefPromptExpandStyle option').count(), 5);
  await page.locator('#prefWaveVideoBackground').check();
  const dark = await videoReady('dark');
  assert.match(dark.source, /quiet-water-v4-1920x1080-24fps\.mp4$/);
  assert.ok(dark.muted && dark.loop && dark.frames > 0);
  await page.selectOption('#prefTheme', 'light');
  const light = await videoReady('light');
  assert.match(light.source, /05-day-loop\.mp4$/);
  await page.locator('#prefAnimations').uncheck(); await noVideo();
  await page.locator('#prefAnimations').check(); await videoReady('light');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await noVideo();
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await videoReady('light');
  await cancel(); await noVideo();
  assert.equal((await boot()).settings.waveVideoBackground, false);
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  records.push({ dark, light });
  passed.push('Both exact 1080p MP4s decode/play; live theme switch, motion preferences and cancel restore safely');

  await settings();
  await page.locator('#prefWaveVideoBackground').check();
  await page.selectOption('#prefPromptExpandStyle', 'compact-left');
  await videoReady('dark');
  await app.evaluate(() => { global.failSettingsSave = true; });
  await page.locator('#settingsForm button[type="submit"]').click();
  await page.locator('.toast.error').waitFor();
  await noVideo();
  assert.equal(await page.locator('#conversationContent').getAttribute('data-prompt-expand-style'), 'outlined-right');
  assert.equal((await boot()).settings.waveVideoBackground, false);
  await app.evaluate(() => { global.failSettingsSave = false; });
  await cancel();
  passed.push('Failed settings save retains dialog, shows error, rolls back draft visuals and preserves committed state');

  for (const style of PROMPT_EXPAND_STYLES) {
    await settings(); await page.selectOption('#prefPromptExpandStyle', style); await save();
    const button = page.locator('.message.user.is-long-prompt .prompt-expand-bar');
    await button.scrollIntoViewIfNeeded();
    assert.equal(await button.getAttribute('aria-expanded'), 'false');
    await button.focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.message.user .prompt-expand-bar').getAttribute('aria-expanded') === 'true');
    assert.equal(await button.locator('.message-expand-label').textContent(), 'Collapse prompt');
    await page.waitForFunction(() => !document.querySelector('.message.user').classList.contains('is-collapse-animating'));
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.querySelector('.message.user .prompt-expand-bar').getAttribute('aria-expanded') === 'false');
    await page.waitForFunction(() => !document.querySelector('.message.user').classList.contains('is-collapse-animating'));
    assert.equal(await button.locator('.message-expand-label').textContent(), 'Show full prompt');
    const g = await geometry(); bounded(g); records.push({ kind: 'prompt-style', ...g });
    assert.equal(await sourceText(), longPrompt);
    await page.screenshot({path:path.join(evidence,`Prompt-${style}.png`)});
  }
  passed.push('All five native buttons expand/collapse via Enter/Space with labels, ARIA, source and geometry intact');

  await settings(); await page.locator('#prefWaveVideoBackground').check(); await page.selectOption('#prefPromptExpandStyle', 'outlined-right'); await save();
  await videoReady('dark');
  await page.screenshot({path:path.join(evidence,'Waves-dark-outlined-right.png')});
  await settings();await page.selectOption('#prefTheme','light');await save();await videoReady('light');
  await page.screenshot({path:path.join(evidence,'Waves-light-outlined-right.png')});
  await settings();await page.selectOption('#prefTheme','dark');await save();await videoReady('dark');
  await page.evaluate(() => { window.testOldWave = document.querySelector('.threadshelf-wave-video'); });
  await page.locator('[data-action="workspace-analytics"]').click(); await noVideo();
  assert.deepEqual(await page.evaluate(() => ({ paused: testOldWave.paused, source: testOldWave.getAttribute('src'), connected: testOldWave.isConnected })), { paused: true, source: null, connected: false });
  await page.locator('[data-action="workspace-reader"]').click(); await videoReady('dark');
  // Dispatch the real browser lifecycle event with controlled visibility, then
  // restore the descriptor. This tests the controller without minimizing the CI host.
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(await page.locator('.threadshelf-wave-video').evaluate(v => v.paused), true);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await videoReady('dark');
  await page.evaluate(() => { document.querySelector('.threadshelf-wave-video').dispatchEvent(new Event('error')); });
  await noVideo();
  assert.equal(await sourceText(), longPrompt);
  await settings(); await page.locator('#prefWaveVideoBackground').uncheck(); await page.locator('#prefWaveVideoBackground').check(); await videoReady('dark'); await save();
  passed.push('Leaving Reader releases media; hidden document pauses; failed media falls back to readable solid background and can recover');

  await settings();
  for (const mode of ['light', 'dark']) {
    await page.selectOption('#prefTheme', mode); await videoReady(mode);
    for (const palette of UI_PALETTES) {
      await page.selectOption('#prefUiPalette', palette.id);
      const g = await geometry(); bounded(g);
      assert.equal(await page.locator('.threadshelf-wave-video').count(), 1);
      assert.equal(await sourceText(), longPrompt);
      records.push({ kind: 'palette', palette: palette.id, mode, color: g.color, border: g.border });
    }
  }
  await page.selectOption('#prefTheme', 'system');
  for (const mode of ['light', 'dark']) { await page.emulateMedia({ colorScheme: mode }); await videoReady(mode); }
  await save();
  for (const mode of ['dark','light']) { await page.emulateMedia({ colorScheme: mode }); await videoReady(mode); }
  await page.emulateMedia({ colorScheme: null });
  await settings();await page.selectOption('#prefTheme','dark');await save();
  passed.push(`${UI_PALETTES.length} palettes in both light/dark modes preserve controls/content and single-video lifecycle; system mode follows OS`);

  for (const language of ['en', 'hu', 'de', 'fr', 'ja']) {
    await settings(); await page.selectOption('#prefLanguage', language); await save();
    await settings();
    assert.equal(await page.locator('#waveBackgroundTitle').textContent(), dictionaries[language].waveVideoBackground);
    assert.equal(await page.locator('#waveBackgroundDescription').textContent(), dictionaries[language].waveVideoBackgroundHelp);
    for (const [width, height] of [[680, 540], [1480, 650], [680, 1100]]) {
      await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size), [width, height]);
      for (const style of PROMPT_EXPAND_STYLES) {
        await page.selectOption('#prefPromptExpandStyle', style);
        const g = await geometry(); bounded(g);
      }
      const modal = await page.locator('.modal').evaluate(m => { const r = m.getBoundingClientRect(); const buttons = [...m.querySelectorAll('.modal-footer button')].map(b => b.getBoundingClientRect().toJSON()); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight, buttons }; });
      assert.ok(modal.left >= 0 && modal.right <= modal.width + 1 && modal.top >= 0 && modal.bottom <= modal.height + 1);
      for (const b of modal.buttons) assert.ok(b.bottom <= modal.bottom && b.left >= modal.left && b.right <= modal.right);
      if (language === 'en' || language === 'ja') { await page.locator('#prefPromptExpandStyle').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(evidence, `Settings-${language}-${width}x${height}.png`) }); }
    }
    await cancel();
  }
  passed.push('All five localized Appearance controls and five button styles fit minimum, wide and tall windows without global scrolling');

  await settings(); await page.selectOption('#prefLanguage', 'en'); await page.selectOption('#prefPromptExpandStyle', 'outlined-right');
  await page.locator('[data-action="settings-tab"][data-tab="reading"]').click(); await page.locator('#prefCompact').uncheck(); await save();
  assert.equal(await page.locator('.prompt-expand-bar:visible').count(), 0);
  assert.equal(await sourceText(), longPrompt);
  await settings(); await page.locator('[data-action="settings-tab"][data-tab="reading"]').click(); await page.locator('#prefCompact').check(); await save();
  await videoReady('dark');
  await close(); await launch();
  const persisted = await boot(); assert.equal(persisted.settings.waveVideoBackground, true); assert.equal(persisted.settings.promptExpandStyle, 'outlined-right'); await videoReady('dark');
  const legacyAppearance = JSON.parse(await fs.readFile(path.join(dataDir, 'appearance.json'), 'utf8'));
  assert.equal(legacyAppearance.data.waveVideoBackground, undefined); assert.equal(legacyAppearance.data.promptExpandStyle, undefined);
  passed.push('Compact disabled still hides controls; preference save/restart works without adding keys to 3.2.0 appearance schema');
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(evidence, 'reader-appearance-results.json'), JSON.stringify({ version: '1.0.0', passed, records, errors }, null, 2));
  console.log(JSON.stringify({ version: '1.0.0', passed, records: records.length, errors }, null, 2));
} catch (error) {
  await page?.screenshot({ path: path.join(evidence, 'Reader-Appearance-Failure.png') }).catch(() => {});
  throw error;
} finally { await close().catch(() => {}); await fs.rm(temp, { recursive: true, force: true }); }
