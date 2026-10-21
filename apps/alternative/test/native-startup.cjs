'use strict';
// Optional native first-paint/theme gate. Uses real main/preload/UI files with a
// temporary QA-only wrapper and isolated preferences; never modifies the app.
// PLAYWRIGHT_PATH and ELECTRON_PATH select tools. ELECTRON_PATH must name the
// matching official Electron runtime, whose command-line entrypoint loads the
// temporary QA wrapper. TSA_APP_PATH may point at packaged resources/app files.
// TSA_TEST_NO_UNIX_SOCKETS=1 stubs the lock only on restricted QA hosts.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const playwrightPath = process.env.PLAYWRIGHT_PATH || 'playwright';
const playwright = require(playwrightPath);
const { PNG } = require(require.resolve('pngjs', { paths: [path.dirname(require.resolve(playwrightPath))] }));
const root = path.resolve(__dirname, '..');
const PRODUCT = 'ThreadShelf Local Alternative';
const colors = { dark: '#141c1d', light: '#f3f1eb' };
const report = { product: PRODUCT, version: '1.0.0',  tests: [], errors: [], status: 'running',
  method: 'Native BrowserWindow constructor color, synchronous preload theme, delayed state hydration, screenshot edge pixels, and reload animation-frame samples.',
  limitations: ['Runs native Linux Electron under an X display; it does not claim native Windows execution.',
    'A temporary QA wrapper forces the simulated OS color scheme and delays only the asynchronous load-state IPC handler. Production application files are unchanged.',
    'Native color is sampled immediately after constructor completion and at first show. The earlier browser-window-created event occurs before Electron applies constructor options. Renderer animation-frame observations start at document creation on reload; no assertion is made about unobservable compositor frames before debugger attachment.'] };
let temporary, electron, page;

async function check(name, fn) {
  try { const details = await fn(); report.tests.push({ name, status: 'pass', ...details }); console.log('PASS ' + name); }
  catch (error) { report.tests.push({ name, status: 'fail', error: error.message }); throw error; }
}
async function targetMain() {
  return path.join(process.env.TSA_APP_PATH || root, 'main.cjs');
}
function wrapperSource(main, osTheme) {
  return `'use strict';
const e=require('electron');
e.nativeTheme.themeSource=${JSON.stringify(osTheme)};
const qa=globalThis.__tsaStartupQA={initialBackground:null,shownBackground:null,initialThemeSource:e.nativeTheme.themeSource,held:true,waiters:[],stateRequests:0,windows:[],bootstrapFrames:[],rejectLoadState:false};
qa.arm=()=>{qa.held=true;};
qa.release=()=>{qa.held=false;for(const resolve of qa.waiters.splice(0))resolve();};
e.app.on('browser-window-created',(_event,win)=>{
  const color=win.getBackgroundColor().toLowerCase();
  qa.windows.push({createdEventBackground:color,createdEventVisible:win.isVisible(),themeSource:e.nativeTheme.themeSource});
  queueMicrotask(()=>{if(qa.initialBackground===null){qa.initialBackground=win.getBackgroundColor().toLowerCase();qa.initialTitle=win.getTitle();}});
  win.once('show',()=>{qa.shownBackground=win.getBackgroundColor().toLowerCase();qa.shownTitle=win.getTitle();});
});
const handle=e.ipcMain.handle.bind(e.ipcMain);
e.ipcMain.handle=(channel,listener)=>handle(channel,channel==='alternative:load-state'?async(...args)=>{
  qa.stateRequests++;if(qa.held)await new Promise(resolve=>qa.waiters.push(resolve));
  if(qa.rejectLoadState)throw new Error('Synthetic load-state rejection for QA');return listener(...args);
}:listener);
const on=e.ipcMain.on.bind(e.ipcMain);
e.ipcMain.on=(channel,listener)=>on(channel,channel==='alternative:startup-theme'?(event,...args)=>{
  qa.bootstrapFrames.push({senderURL:event.sender.getURL(),frameURL:event.senderFrame?.url,mainFrameURL:event.sender.mainFrame.url,sameFrame:event.senderFrame===event.sender.mainFrame});
  return listener(event,...args);
}:listener);
${process.env.TSA_TEST_NO_UNIX_SOCKETS === '1' ? 'e.app.requestSingleInstanceLock=()=>true;' : ''}
require(${JSON.stringify(main)});
`;
}
async function inspect() {
  return page.evaluate(() => {
    const root = document.documentElement, app = document.getElementById('app'), cover = document.getElementById('startup-screen');
    const visible = element => { if (!element) return false; const s = getComputedStyle(element), r = element.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) !== 0 && r.width > 0 && r.height > 0; };
    return { boot: root.dataset.boot, theme: root.dataset.theme, startupTheme: root.dataset.startupTheme,
      preloadTheme: window.alternative?.startupTheme, appVisible: visible(app), appInert: app?.inert,
      ready: app?.dataset.ready || null, coverVisible: visible(cover), coverBackground: cover ? getComputedStyle(cover).backgroundColor : null,
      nativeRequireExposed: typeof window.require !== 'undefined', prefersDark: matchMedia('(prefers-color-scheme:dark)').matches };
  });
}
async function edgePixels(expectedTheme) {
  const png = PNG.sync.read(await page.screenshot());
  const rgb = colors[expectedTheme].slice(1).match(/../g).map(hex => parseInt(hex, 16));
  const points = [[4, 4], [png.width - 5, 4], [4, png.height - 5], [png.width - 5, png.height - 5]];
  const samples = points.map(([x, y]) => ({ x, y, rgba: [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4)] }));
  for (const sample of samples) assert.deepEqual(sample.rgba, [...rgb, 255], 'Visible loader edge must match the resolved startup palette');
  return samples;
}
async function assertCovered(expectedTheme, expectedPhase = 'loading') {
  await page.waitForFunction(() => document.getElementById('app') && document.getElementById('startup-screen') && window.alternative);
  const observation = await inspect();
  assert.equal(observation.boot, expectedPhase); assert.equal(observation.theme, expectedTheme, JSON.stringify(observation));
  assert.equal(observation.startupTheme, expectedTheme); assert.equal(observation.preloadTheme, expectedTheme);
  assert.equal(observation.appVisible, false, 'Uninitialized application must remain invisible');
  assert.equal(observation.appInert, true, 'Uninitialized application must remain inert');
  assert.equal(observation.coverVisible, true); assert.notEqual(observation.ready, 'true');
  assert.equal(observation.nativeRequireExposed, false);
  assert.equal(await page.title(), PRODUCT, 'Loading document title must be the product name only');
  return { observation, pixels: await edgePixels(expectedTheme) };
}
async function releaseAndCheck(expectedTheme) {
  await electron.evaluate(() => globalThis.__tsaStartupQA.release());
  await page.waitForSelector('html[data-boot="ready"] #app[data-ready="true"]', { state: 'visible' });
  const observation = await inspect();
  assert.equal(observation.theme, expectedTheme); assert.equal(observation.appVisible, true);
  assert.equal(observation.appInert, false); assert.equal(observation.coverVisible, false);
  const info = await page.evaluate(() => alternative.getInfo());
  assert.equal(Object.hasOwn(info, "revision"), false); assert.equal(info.name, PRODUCT); assert.ok(info.profile.startsWith(temporary));
  const nativeTitle=await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getTitle());
  assert.equal(nativeTitle, PRODUCT); assert.equal(await page.title(), PRODUCT);
  return { observation, electron: info.electron, profileIsolated: true, nativeTitle, documentTitle: await page.title() };
}
async function installFrameProbe() {
  await page.addInitScript(() => {
    window.__qaStartupFrames = [];
    const sample = () => {
      const app = document.getElementById('app'), cover = document.getElementById('startup-screen');
      if (app || cover) {
        const s = app ? getComputedStyle(app) : null;
        window.__qaStartupFrames.push({ boot: document.documentElement.dataset.boot || null,
          theme: document.documentElement.dataset.theme || null, hasApp: !!app,
          appVisible: !!s && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) !== 0,
          inert: app?.inert ?? null });
      }
      if (window.__qaStartupFrames.length < 240 && document.documentElement.dataset.boot !== 'ready') requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}
async function reloadCovered(expectedTheme) {
  await electron.evaluate(() => globalThis.__tsaStartupQA.arm());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__qaStartupFrames?.filter(frame => frame.hasApp).length >= 3);
  const covered = await assertCovered(expectedTheme);
  const frames = await page.evaluate(() => window.__qaStartupFrames);
  assert.ok(frames.length >= 3);
  for (const frame of frames.filter(item => item.hasApp)) {
    assert.equal(frame.theme, expectedTheme, 'Every observed document paint must use the saved resolved theme');
    assert.equal(frame.boot, 'loading'); assert.equal(frame.appVisible, false); assert.equal(frame.inert, true);
  }
  return { ...covered, observedFrames: frames.length, frames };
}
async function close() {
  if (electron) { await electron.evaluate(() => globalThis.__tsaStartupQA.release()).catch(() => {}); await electron.close(); }
  electron = null; page = null;
}
async function launchCase(name, savedTheme, osTheme, { ready = true } = {}) {
  const home = path.join(temporary, name), config = path.join(home, 'config'), profile = path.join(config, PRODUCT);
  await fs.mkdir(profile, { recursive: true });
  const seedBytes = JSON.stringify({ version: 1, theme: savedTheme, collection: '', serverUrl: 'http://localhost:3000', fontSize: 21,
    pins: [{ title: 'QA preservation marker', collection: 'qa', sourceFile: '/synthetic/qa.json', conversationKey: 'preserve' }], recent: [], positions: { 'qa-preservation-marker': { top: 420 } } });
  await fs.writeFile(path.join(profile, 'alternative-state.json'), seedBytes);
  const wrapper = path.join(home, 'startup-qa-main.cjs');
  await fs.writeFile(wrapper, wrapperSource(await targetMain(), osTheme));
  electron = await playwright._electron.launch({ executablePath: process.env.ELECTRON_PATH, colorScheme: osTheme,
    args: ['--no-sandbox', wrapper], env: { ...process.env, XDG_CONFIG_HOME: config, XDG_CACHE_HOME: path.join(home, 'cache') }, timeout: 30000 });
  page = await electron.firstWindow(); page.on('pageerror', error => report.errors.push({ case: name, message: error.message }));
  await page.waitForFunction(() => !!window.alternative && !!document.getElementById('startup-screen') &&
    typeof window.TSAFlush === 'function' && document.visibilityState === 'visible');
  const native = await electron.evaluate(({ BrowserWindow, nativeTheme }) => ({ ...globalThis.__tsaStartupQA.windows[0],
    initialBackground: globalThis.__tsaStartupQA.initialBackground, shownBackground: globalThis.__tsaStartupQA.shownBackground,
    initialTitle: globalThis.__tsaStartupQA.initialTitle, shownTitle: globalThis.__tsaStartupQA.shownTitle, themeSource: nativeTheme.themeSource,
    stateRequests: globalThis.__tsaStartupQA.stateRequests, windowVisible: BrowserWindow.getAllWindows()[0].isVisible() }));
  const expected = savedTheme === 'system' ? osTheme : savedTheme;
  await check(`${name}: native surface and first visible loader`, async () => {
    assert.equal(native.initialBackground, colors[expected]); assert.equal(native.shownBackground, colors[expected]); assert.equal(native.themeSource, osTheme);
    assert.equal(native.initialTitle, PRODUCT); assert.equal(native.shownTitle, PRODUCT);
    assert.ok(native.stateRequests > 0, 'The delayed real load-state handler must actually be reached');
    assert.equal(native.windowVisible, true, 'The native window must show useful progress during delayed hydration');
    return { savedTheme, simulatedOSTheme: osTheme, expectedTheme: expected, native, ...await assertCovered(expected) };
  });
  if (ready) await check(`${name}: ready transition preserves theme and releases app`, () => releaseAndCheck(expected));
  return { profile, expected, seedBytes };
}

(async () => {
  if (!process.env.ELECTRON_PATH) throw new Error('ELECTRON_PATH is required for the native startup gate.');
  if (process.env.TSA_PACKAGED === '1') throw new Error('Use matching official Electron runtime with TSA_APP_PATH pointing packaged resources/app');
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'alternative-startup-'));
  report.target = process.env.TSA_STARTUP_TARGET || (process.env.TSA_APP_PATH ? 'selected-app-directory' : 'source');
  if (process.env.TSA_TEST_NO_UNIX_SOCKETS === '1') report.limitations.push('This QA host forbids Unix sockets; only the temporary wrapper stubs app.requestSingleInstanceLock. The delivered app retains its real lock.');
  report.limitations.push('Headless root QA supplies --no-sandbox to Electron; delivered launch paths do not include that flag.');
  await launchCase('saved-dark-on-light-os', 'dark', 'light');
  await installFrameProbe();
  await check('saved theme survives real settings changes, atomic persistence, and reload', async () => {
    await page.click('#settings-button');
    const about=await page.locator('#settings-dialog .about-line').innerText();
    assert.match(about,/1\.0\.0\b/); assert.doesNotMatch(about,/Revision/i);
    await page.click('[data-theme="light"]');
    await page.locator('#settings-dialog [data-close="settings-dialog"]').last().click();
    await page.evaluate(() => TSAFlush());
    assert.equal((await page.evaluate(() => alternative.loadState())).theme, 'light');
    await electron.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'dark'; });
    await page.emulateMedia({ colorScheme: 'dark' });
    const before = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBackgroundColor().toLowerCase());
    assert.equal(before, colors.light);
    const reload = await reloadCovered('light');
    assert.equal(reload.observation.prefersDark, true, 'Simulated OS must oppose the saved explicit preference');
    const ready = await releaseAndCheck('light');
    return { backgroundAfterSave: before, ...reload, afterReady: ready.observation };
  });
  await check('slow startup keeps a themed cover and offers a usable retry', async () => {
    await reloadCovered('light');
    await page.waitForFunction(() => document.documentElement.dataset.boot === 'slow', undefined, { timeout: 20000 });
    const covered = await assertCovered('light', 'slow');
    assert.equal(await page.locator('#startup-retry').isVisible(), true);
    assert.match(await page.locator('#startup-detail').innerText(), /longer|retry/i);
    await page.click('#startup-retry');
    await page.waitForFunction(() => document.documentElement.dataset.boot === 'loading');
    await assertCovered('light'); await releaseAndCheck('light');
    return covered;
  });
  await check('startup failure cannot accidentally reveal a partially initialized app', async () => {
    await reloadCovered('light');
    await page.evaluate(() => TSABoot.fail(new Error('Synthetic startup interruption for QA')));
    const failed = await assertCovered('light', 'error');
    await electron.evaluate(() => globalThis.__tsaStartupQA.release());
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal((await inspect()).boot, 'error'); assert.equal((await inspect()).appVisible, false);
    assert.equal(await page.locator('#startup-retry').isVisible(), true);
    await electron.evaluate(() => globalThis.__tsaStartupQA.arm());
    await page.click('#startup-retry'); await page.waitForFunction(() => document.documentElement.dataset.boot === 'loading');
    await assertCovered('light'); await releaseAndCheck('light');
    return { failureInjectedInQA: true, ...failed };
  });
  await close();
  for (const [name, savedTheme, osTheme] of [['saved-light-on-dark-os', 'light', 'dark'], ['system-on-light-os', 'system', 'light'], ['system-on-dark-os', 'system', 'dark']]) {
    await launchCase(name, savedTheme, osTheme); await close();
  }
  const early = await launchCase('early-close-preserves-settings', 'dark', 'light', { ready: false });
  await check('closing the native window during delayed hydration preserves settings byte for byte', async () => {
    assert.equal(await page.evaluate(() => TSAFlush()), false, 'An incomplete load must refuse persistence');
    const ended = electron.waitForEvent('close');
    await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await ended; electron = null; page = null;
    const actual = await fs.readFile(path.join(early.profile, 'alternative-state.json'), 'utf8');
    assert.equal(actual, early.seedBytes);
    return { bytesPreserved: Buffer.byteLength(actual), pinsAndPositionsPreserved: true };
  });
  const rejected = await launchCase('rejected-state-keeps-saved-dark', 'dark', 'light', { ready: false });
  await check('rejected asynchronous settings load keeps the synchronous theme and preserves disk settings', async () => {
    await electron.evaluate(() => { globalThis.__tsaStartupQA.rejectLoadState = true; });
    const ready = await releaseAndCheck('dark');
    assert.equal(ready.observation.prefersDark, false);
    assert.equal(await page.evaluate(() => TSAFlush()), false, 'A failed load must refuse persistence');
    await close();
    const actual = await fs.readFile(path.join(rejected.profile, 'alternative-state.json'), 'utf8');
    assert.equal(actual, rejected.seedBytes);
    return { afterReady: ready.observation, bytesPreserved: Buffer.byteLength(actual) };
  });
  assert.deepEqual(report.errors, []); report.status = 'pass';
})().catch(async error => { report.status = 'fail'; report.failure = error.stack;
    if (electron) report.failureBootstrapFrames = await electron.evaluate(() => globalThis.__tsaStartupQA.bootstrapFrames).catch(() => []);
    if (page) report.failureObservation = await inspect().catch(() => null);
    console.error(error); process.exitCode = 1; })
  .finally(async () => {
    await close().catch(error => { report.cleanupError = error.message; process.exitCode = 1; report.status = 'fail'; });
    if (temporary) await fs.rm(temporary, { recursive: true, force: true });
    await fs.mkdir(path.join(root, 'docs'), { recursive: true });
    await fs.writeFile(path.join(root, 'docs/native-startup-verification.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  });
