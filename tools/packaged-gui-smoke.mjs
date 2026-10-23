#!/usr/bin/env node
// Native release GUI checks. Run on the package's target OS; Linux needs Xvfb.
// The shipped executable, main, preload and renderer remain unmodified.
// Copyright (c) 2026 davoda1. MIT; see ../LICENSE.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { _electron } from './mermaid-bundle/node_modules/playwright-core/index.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const [application, runtimeArg, executableArg, reportArg] = process.argv.slice(2);
assert.ok(['reader', 'alternative'].includes(application) && runtimeArg && executableArg && reportArg && process.argv.length === 6,
  'Usage: node tools/packaged-gui-smoke.mjs reader|alternative RUNTIME EXECUTABLE REPORT.json');
assert.ok(['linux', 'win32'].includes(process.platform), 'Run on a supported native package host.');
const runtime = path.resolve(runtimeArg), executable = path.resolve(executableArg), reportPath = path.resolve(reportArg);
const appRoot = path.join(runtime, 'resources', 'app');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'apps', application, 'package.json'), 'utf8'));
const packagedManifest = JSON.parse(await fs.readFile(path.join(appRoot, 'package.json'), 'utf8'));
assert.equal(packagedManifest.version, manifest.version);
assert.equal(packagedManifest.name, manifest.name);
const recipe = JSON.parse(await fs.readFile(path.join(root, 'tools/mermaid-bundle/package.json'), 'utf8'));
const playwright = JSON.parse(await fs.readFile(path.join(root, 'tools/mermaid-bundle/node_modules/playwright-core/package.json'), 'utf8'));
assert.equal(playwright.version, recipe.devDependencies['playwright-core']);

let temporary, currentApp, freshCiDefault;
const report = {
  application, version: manifest.version, platform: process.platform,
  electron: manifest.devDependencies.electron, passed: false, nativeGUIExecuted: false,
  packageFilesUnchanged: false, chromiumSandboxEnabled: false,
  syntheticOnly: true, checks: [], errors: [], observedRendererRequests: [],
  harness: { alternateMain: false, copiedExecutable: false, singletonOverride: false,
    sandboxDisabled: false, nativeFilePickerSelectionOnly: application === 'reader' },
  limitations: ['Renderer network observation begins after attaching the initial window; it is not a complete host network trace.'],
};
const check = name => { report.checks.push(name); console.log('PASS ' + name); };
async function digest(file) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}
async function fingerprint(directory) {
  const entries = [];
  async function visit(folder) {
    for (const name of (await fs.readdir(folder)).sort()) {
      const file = path.join(folder, name), relative = path.relative(directory, file).split(path.sep).join('/');
      const stat = await fs.lstat(file);
      if (stat.isSymbolicLink()) entries.push([relative, 'link', await fs.readlink(file)]);
      else if (stat.isDirectory()) { entries.push([relative, 'directory', stat.mode & 0o7777]); await visit(file); }
      else { assert.ok(stat.isFile(), 'Unexpected special package file'); entries.push([relative, 'file', stat.mode & 0o7777, stat.size, await digest(file)]); }
    }
  }
  await visit(directory);
  return { entries: entries.length, sha256: createHash('sha256').update(JSON.stringify(entries)).digest('hex') };
}
const canonical = async file => { const value = await fs.realpath(file); return process.platform === 'win32' ? value.toLowerCase() : value; };
const inside = (base, file) => { const relative = path.relative(base, file); return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); };
function safe(value) {
  let text = String(value);
  for (const directory of [temporary, runtime, root, os.homedir()].filter(Boolean).sort((a, b) => b.length - a.length)) {
    for (const form of [directory, directory.replaceAll('\\', '/'), JSON.stringify(directory).slice(1, -1)]) text = text.split(form).join('<isolated-path>');
  }
  return text;
}
async function close() {
  if (!currentApp) return;
  const app = currentApp, closed = app.waitForEvent('close', { timeout: 30000 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close()).catch(error => {
    if (!/closed|destroyed|Target/i.test(error.message)) throw error;
  });
  await closed;
  currentApp = null;
}
async function launch() {
  const env = { ...process.env, APPDATA: path.join(temporary, 'appdata'), LOCALAPPDATA: path.join(temporary, 'local-appdata'),
    XDG_CONFIG_HOME: path.join(temporary, 'config'), XDG_CACHE_HOME: path.join(temporary, 'cache'),
    THREADSHELF_READER_TEST_DATA: path.join(temporary, 'reader-profile') };
  for (const name of ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'THREADSHELF_READER_SMOKE']) delete env[name];
  currentApp = await _electron.launch({ executablePath: executable, args: ['--disable-gpu'],
    chromiumSandbox: true, env, cwd: temporary, timeout: 45000 });
  const page = await currentApp.firstWindow({ timeout: 45000 });
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.errors.push(safe(error.message)));
  page.on('request', request => { if (/^https?:/i.test(request.url())) report.observedRendererRequests.push(request.url()); });
  await page.waitForFunction(app => app === 'reader'
    ? !!window.desktop?.invoke && !!document.querySelector('.shell')
    : !!window.alternative?.getInfo && document.querySelector('#app')?.dataset.ready === 'true', application);
  const identity = await currentApp.evaluate(({ app, BrowserWindow }) => ({
    exe: process.execPath, appRoot: app.getAppPath(), resources: process.resourcesPath,
    profile: app.getPath('userData'), electron: process.versions.electron, version: app.getVersion(),
    platform: process.platform, arch: process.arch, packaged: app.isPackaged,
    argv: process.argv, preferences: BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
  }));
  assert.equal(await canonical(identity.exe), await canonical(executable));
  assert.equal(await canonical(identity.appRoot), await canonical(appRoot));
  assert.equal(await canonical(identity.resources), await canonical(path.join(runtime, 'resources')));
  assert.equal(identity.electron, manifest.devDependencies.electron);
  assert.equal(identity.version, manifest.version);
  assert.equal(identity.platform, process.platform); assert.equal(identity.arch, 'x64'); assert.equal(identity.packaged, true);
  if (inside(temporary, identity.profile)) report.profileIsolation = 'temporary synthetic profile';
  else {
    assert.ok(freshCiDefault && await canonical(identity.profile) === await canonical(freshCiDefault),
      'Native profile must remain inside the fresh synthetic workspace or the preflighted fresh CI profile');
    report.profileIsolation = 'fresh CI default profile';
  }
  assert.equal(identity.preferences.contextIsolation, true); assert.equal(identity.preferences.nodeIntegration, false);
  assert.equal(identity.preferences.sandbox, true); assert.equal(identity.preferences.webSecurity, true);
  assert.ok(!identity.argv.some(arg => /^--(?:no-sandbox|disable-setuid-sandbox|disable-web-security)(?:=|$)/.test(arg)));
  assert.ok(identity.argv.slice(1).every(arg => arg.startsWith('--')), 'No alternate app entry or preload shim is permitted');
  assert.equal(await page.evaluate(() => typeof require), 'undefined');
  report.nativeGUIExecuted = true;
  report.chromiumSandboxEnabled = true;
  if (application === 'alternative') {
    // Observe the existing synchronous preload handshake without changing its
    // return value, handler, security guard or any application state. This makes
    // native file-URL/frame mismatches diagnosable from sanitized CI evidence.
    await currentApp.evaluate(({ app, BrowserWindow, ipcMain }) => {
      const path = process.mainModule.require('node:path');
      const fs = process.mainModule.require('node:fs');
      const { pathToFileURL, fileURLToPath } = process.mainModule.require('node:url');
      const expected = pathToFileURL(path.join(app.getAppPath(), 'renderer', 'index.html')).href;
      const records = [];
      function compare(actual) {
        const result = { exact: actual === expected, caseInsensitive: actual.toLowerCase() === expected.toLowerCase() };
        try {
          const url = new URL(actual), wanted = new URL(expected);
          result.protocol = url.protocol; result.hostMatches = url.host === wanted.host;
          result.queryMatches = url.search === wanted.search; result.fragmentMatches = url.hash === wanted.hash;
          result.pathTail = url.pathname.split('/').slice(-4).join('/');
          result.expectedPathTail = wanted.pathname.split('/').slice(-4).join('/');
          const decoded = fileURLToPath(url), intended = fileURLToPath(wanted);
          result.decodedPathExact = decoded === intended;
          result.decodedPathCaseInsensitive = decoded.toLowerCase() === intended.toLowerCase();
          result.realPathExact = fs.realpathSync(decoded) === fs.realpathSync(intended);
          result.realPathCaseInsensitive = fs.realpathSync(decoded).toLowerCase() === fs.realpathSync(intended).toLowerCase();
        } catch (error) { result.parseOrResolutionError = error.code || error.name; }
        return result;
      }
      const observer = event => {
        const web = BrowserWindow.getAllWindows()[0].webContents, frame = event.senderFrame, main = web.mainFrame;
        records.push({ senderMatches: event.sender === web, frameObjectMatches: frame === main,
          frameProcessMatches: frame?.processId === main.processId, frameRoutingMatches: frame?.routingId === main.routingId,
          frameUrl: compare(frame?.url || ''), contentsUrl: compare(web.getURL()) });
      };
      globalThis.__releaseHandshakeObservation = { records, observer };
      ipcMain.on('alternative:startup-theme', observer);
    });
    try {
      await page.reload();
      await page.waitForFunction(() => document.querySelector('#app')?.dataset.ready === 'true');
    } finally {
      report.nativeHandshakeDiagnostic = await currentApp.evaluate(({ ipcMain }) => {
        const observed = globalThis.__releaseHandshakeObservation;
        ipcMain.removeListener('alternative:startup-theme', observed.observer);
        delete globalThis.__releaseHandshakeObservation;
        return observed.records;
      });
    }
  }
  return page;
}
async function minimumWindow(page) {
  await currentApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(680, 540));
  await page.waitForFunction(() => innerWidth === 680 && innerHeight === 540);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const layout = await page.evaluate(() => ({ x: document.documentElement.scrollWidth > innerWidth + 1,
    y: document.documentElement.scrollHeight > innerHeight + 1 }));
  assert.deepEqual(layout, { x: false, y: false });
  check('680 by 540 native content area has no global horizontal or vertical overflow');
  await currentApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1320, 880));
}
async function reader() {
  let page = await launch();
  const boot = await page.evaluate(() => window.desktop.invoke('bootstrap'));
  assert.equal(boot.version, manifest.version); assert.equal(boot.resources.enabled, false);
  assert.equal((await page.evaluate(() => window.desktop.invoke('files', { mode: 'local' }))).total, 0);
  check('Shipped native Reader starts with an empty isolated profile and sandboxed preload');
  await page.locator('[data-action="settings"]').click();
  await page.locator('#prefTheme').selectOption('light');
  await page.locator('#prefRemoteImages').selectOption('click');
  await page.locator('#prefAnimations').uncheck();
  await page.locator('#settingsForm button[type="submit"]').click();
  await page.locator('#settingsForm').waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  const source = path.join(temporary, 'synthetic readonly conversation.json');
  await fs.writeFile(source, JSON.stringify({ id: 'native-release-synthetic', title: 'Synthetic native release check', messages: [
    { role: 'user', content: 'Preserve quartz, a synthetic search keyword.' },
    { role: 'assistant', content: 'An **offline** table and image policy check.\n\n| Test | State |\n| --- | --- |\n| Native | Ready |\n\n![Blocked local image](http://127.0.0.1:9/synthetic-only.png)' },
  ] }), { mode: 0o444 });
  const sourceHash = await digest(source);
  await currentApp.evaluate(({ dialog }, file) => {
    globalThis.__releaseOriginalPicker = dialog.showOpenDialog;
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, source);
  const picked = await page.evaluate(() => window.desktop.invoke('import.pick', { kind: 'files' }));
  await currentApp.evaluate(({ dialog }) => { dialog.showOpenDialog = globalThis.__releaseOriginalPicker; delete globalThis.__releaseOriginalPicker; });
  assert.deepEqual(picked.paths, [source]);
  const imported = await page.evaluate(file => window.desktop.invoke('import.paths', { paths: [file], collection: 'Synthetic release validation' }), source);
  assert.equal(imported.imported, 1); assert.deepEqual(imported.errors, []); assert.equal(await digest(source), sourceHash);
  await page.reload(); await page.locator('.conversation-row').first().click();
  await page.locator('#readerHost table').waitFor();
  assert.match(await page.locator('#readerHost').innerText(), /quartz/);
  const results = await page.evaluate(() => window.desktop.invoke('search', { mode: 'local', q: 'quartz', searchMode: 'keyword' }));
  assert.ok(results.total > 0);
  check('Native picker, real archive worker, readonly synthetic import, rich table and keyword search work');
  await page.locator('.reader-image-load').click();
  await page.locator('[data-image-state="failed"]').waitFor();
  assert.deepEqual(report.observedRendererRequests, []);
  check('Click-to-load reaches the native image bridge and private-loopback rejection shows a failure placeholder without direct HTTP fallback');
  await page.locator('[data-action="settings"]').click();
  await page.locator('#prefTheme').selectOption('dark');
  await page.locator('#settingsForm button[type="submit"]').click();
  await page.locator('#settingsForm').waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  const enabled = await page.evaluate(() => window.desktop.invoke('resources.settings', { enabled: true }));
  assert.equal(enabled.enabled, true); assert.equal(enabled.itemCount, 0);
  await minimumWindow(page);
  await close();
  page = await launch();
  const reopened = await page.evaluate(() => window.desktop.invoke('bootstrap'));
  assert.equal(reopened.settings.theme, 'dark'); assert.equal(reopened.settings.remoteImages, 'click');
  assert.equal(reopened.resources.enabled, true);
  assert.equal((await page.evaluate(() => window.desktop.invoke('files', { mode: 'local' }))).total, 1);
  assert.equal(await digest(source), sourceHash);
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.evaluate(() => window.desktop.invoke('resources.clear', { all: true }));
  assert.equal((await page.evaluate(() => window.desktop.invoke('files', { mode: 'local' }))).total, 1);
  check('Light/dark UI, image preference and independent cache enablement persist through graceful restart; cache clearing preserves the archive');
  await close();
}
async function alternative() {
  let page = await launch();
  const info = await page.evaluate(() => window.alternative.getInfo());
  assert.equal(info.version, manifest.version); assert.equal(info.settingsWarning, null);
  assert.equal((await page.evaluate(() => window.alternative.loadState())).imageMode, 'click');
  await page.locator('#welcome-demo').click();
  await page.waitForFunction(() => document.querySelector('#thread-title')?.textContent === 'Start here · Your ThreadShelf guide' && document.querySelector('#reader-loading')?.hidden);
  assert.equal(await page.locator('#results-list .result-card').count(), 13);
  check('Shipped native Alternative starts with an isolated profile and opens its thirteen synthetic demo conversations');
  await page.locator('#thread-content a[href="https://guide.threadshelf.invalid/chat/showcase-workshop"]').first().click();
  await page.waitForFunction(() => document.querySelectorAll('#thread-content .tsa-mermaid svg').length === 4 && document.querySelectorAll('#thread-content [data-mermaid-state="repaired"]').length === 3);
  assert.equal(await page.locator('#thread-content [data-mermaid-state="error"], #thread-content [data-mermaid-state="original-error"]').count(), 0);
  const block = page.locator('#thread-content .tsa-code-block[data-mermaid-state="repaired"]').first();
  const original = await block.locator('code').first().textContent(), repaired = await block.locator('.tsa-repaired-source code').textContent();
  await block.locator('[data-copy-code]').click();
  assert.equal(await currentApp.evaluate(({ clipboard }) => clipboard.readText()), original);
  await block.locator('[data-copy-repaired]').click();
  assert.equal(await currentApp.evaluate(({ clipboard }) => clipboard.readText()), repaired);
  assert.notEqual(original, repaired);
  check('Four native Mermaid previews render, three malformed diagrams repair, and both sources reach the native clipboard');
  await page.locator('#reading-settings').click();
  await page.locator('[data-theme="light"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.locator('[data-theme="dark"]').click();
  await page.locator('#image-mode').selectOption('auto');
  await page.locator('#line-width').selectOption('compact');
  await page.locator('#settings-dialog [data-close="settings-dialog"]').last().click();
  assert.notEqual(await page.evaluate(() => window.TSAFlush()), false);
  const saved = await page.evaluate(() => window.alternative.loadState());
  assert.equal(saved.theme, 'dark'); assert.equal(saved.imageMode, 'auto'); assert.equal(saved.lineWidth, 'compact');
  await minimumWindow(page);
  await close();
  page = await launch();
  const state = await page.evaluate(() => window.alternative.loadState());
  assert.equal(state.theme, 'dark'); assert.equal(state.imageMode, 'auto'); assert.equal(state.lineWidth, 'compact');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  check('Light/dark UI and image/reading preferences persist across a graceful native restart');
  await close();
}

try {
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-release-gui-'));
  for (const directory of ['appdata', 'local-appdata', 'config', 'cache', 'reader-profile']) await fs.mkdir(path.join(temporary, directory));
  if (application === 'alternative' && process.platform === 'win32') {
    // Some Windows known-folder implementations ignore APPDATA overrides.
    // Refuse an existing default profile before any native launch. A fresh
    // default is permitted only on the disposable GitHub Actions runner.
    assert.ok(process.env.APPDATA && path.isAbsolute(process.env.APPDATA), 'Windows APPDATA is required for safe profile preflight');
    const fallback = path.join(process.env.APPDATA, 'ThreadShelf Local Alternative');
    assert.equal(await fs.lstat(fallback).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; }), false,
      'Refusing to launch Alternative while a default profile already exists');
    if (process.env.GITHUB_ACTIONS === 'true' && inside(os.homedir(), fallback)) freshCiDefault = fallback;
  }
  const before = await fingerprint(runtime);
  if (application === 'reader') await reader(); else await alternative();
  assert.deepEqual(report.errors, []); assert.deepEqual(report.observedRendererRequests, []);
  assert.deepEqual(await fingerprint(runtime), before, 'All shipped package bytes, modes and symlinks must remain unchanged');
  report.packageFingerprint = before;
  report.packageFilesUnchanged = true;
  check('All shipped runtime/app files, permissions and links remain unchanged after native GUI execution');
  report.passed = true;
} catch (error) {
  report.error = safe(error.message); process.exitCode = 1; console.error(report.error);
} finally {
  if (currentApp) await close().catch(async () => { currentApp.process().kill(); await currentApp.close().catch(() => {}); currentApp = null; });
  if (temporary) await fs.rm(temporary, { recursive: true, force: true, maxRetries: 6, retryDelay: 500 });
  if (freshCiDefault) await fs.rm(freshCiDefault, { recursive: true, force: true, maxRetries: 6, retryDelay: 500 });
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}
