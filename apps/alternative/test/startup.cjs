/* startup lifecycle/first-render browser tests.
 * Serves only the local source tree on ephemeral loopback HTTP. No internet,
 * private exports, real profiles or production server are used.
 * Optional: PLAYWRIGHT_PATH, CHROMIUM_PATH, STARTUP_REPORT, STARTUP_SCREENSHOTS.
 * Native window visibility/background is checked by the separate native gate. */
'use strict';
const VERSION = require('../package.json').version;
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
let playwright; try { playwright = require('playwright'); } catch { playwright = require(process.env.PLAYWRIGHT_PATH || 'playwright'); }
const root = path.resolve(__dirname, '..');
const shots = process.env.STARTUP_SCREENSHOTS;
const report = { product: 'ThreadShelf Local Alternative', version: VERSION,
  success: false, checks: [], cases: [], externalRequests: [], pageErrors: [],
  limits: ['Browser frame samples inspect rendered DOM backgrounds after content exists; native first-visible-window background is covered by the separate native startup gate.'] };
const scenarios = new Map(); let serial = 0;
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function scenario(options = {}) {
  const result = { id: 'case-' + ++serial, gate: gate(), held: true, missingStartup: false, fatalApp: false, requests: [], ...options };
  result.release = () => { result.held = false; result.gate.resolve(); };
  scenarios.set(result.id, result); return result;
}
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = http.createServer(async (request, response) => {
  try {
    const parts = new URL(request.url, 'http://fixture.test').pathname.split('/').filter(Boolean);
    const test = scenarios.get(parts.shift()); if (!test) { response.writeHead(404).end(); return; }
    const relative = parts.join('/'); const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    test.requests.push(relative);
    if (relative === 'renderer/startup.js' && test.missingStartup) { response.writeHead(404).end('Synthetic missing bootstrap'); return; }
    if (relative === 'vendor/marked.umd.js' && test.held) await test.gate.promise;
    if (relative === 'renderer/app.js' && test.fatalApp) {
      response.writeHead(200, { 'content-type': 'text/javascript' }).end('throw new Error("Synthetic startup failure");'); return;
    }
    const contents = await fs.readFile(file);
    response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); response.end(contents);
  } catch { response.writeHead(404).end(); }
});
let origin;
async function check(name, operation) {
  const started = Date.now();
  try { const details = await operation(); report.checks.push({ name, status: 'pass', ms: Date.now() - started, ...(details || {}) }); console.log('PASS ' + name); }
  catch (error) { report.checks.push({ name, status: 'fail', error: error.message }); throw error; }
}
function lightness(color) {
  const match = String(color).match(/rgba?\(([^)]+)\)/); if (!match) return null;
  const channels = match[1].split(',').map(Number); if (channels.length > 3 && channels[3] === 0) return null;
  return (channels[0] + channels[1] + channels[2]) / 765;
}
async function setup(browser, test, options = {}) {
  const context = await browser.newContext({ viewport: options.viewport || { width: 1360, height: 880 }, colorScheme: options.os || 'light', reducedMotion: options.reducedMotion || 'no-preference' });
  await context.addInitScript(config => {
    const state = { version: 1, serverUrl: 'http://127.0.0.1:9', theme: config.saved || 'system', fontSize: 16, lineWidth: 'comfortable', showReasoning: false,
      pins: [], savedSearches: [], recent: [], positions: {}, collection: config.collection || '' };
    localStorage.setItem('threadshelf-local-alternative.demo.v1', JSON.stringify(state));
    window.__startupProbe = { frames: [], ready: [], stateResolved: !config.slowState, connectPending: false, savedState: state, saveCalls: 0, paints: [], errors: [] };
    const probe = window.__startupProbe;
    window.addEventListener('error', event => { probe.errors.push(event.message || 'resource error'); });
    if (config.desktop) {
      let releaseState, rejectConnect;
      const statePromise = config.slowState ? new Promise(resolve => { releaseState = resolve; }) : Promise.resolve(state);
      window.__releaseStartupState = () => { probe.stateResolved = true; releaseState?.(state); };
      window.__rejectStartupConnection = () => rejectConnect?.(new Error('Synthetic offline server'));
      window.alternative = Object.freeze({ startupTheme: config.resolved,
        loadState: () => config.rejectState ? Promise.reject(new Error('Synthetic unreadable state')) : statePromise,
        saveState: async value => { probe.saveCalls++; probe.savedState = value; return value; },
        connect: async () => { probe.connectPending = true; return new Promise((resolve, reject) => { rejectConnect = reject; }); },
        request: async () => { throw new Error('Synthetic offline server'); },
        copy: async () => true, openExternal: async () => true, exportFile: async () => ({ canceled: true }),
        getInfo: async () => ({ name: 'ThreadShelf Local Alternative', version: config.version }),
      });
    }
    try { new PerformanceObserver(list => { probe.paints.push(...list.getEntries().map(entry => ({ name: entry.name, startTime: entry.startTime }))); }).observe({ type: 'paint', buffered: true }); } catch {}
    let lastReady = '';
    const observe = () => {
      const app = document.getElementById('app'), html = document.documentElement;
      const key = (html?.dataset.boot || '') + '/' + (app?.dataset.ready || '');
      if (key !== lastReady && (html?.dataset.boot === 'ready' || app?.dataset.ready === 'true')) {
        probe.ready.push({ time: performance.now(), theme: html.dataset.theme, stateResolved: probe.stateResolved, appInert: !!app?.inert,
          boot: html.dataset.boot, appReady: app?.dataset.ready, selectedTheme: document.querySelector('#theme-choices [aria-pressed="true"]')?.dataset.theme || '' });
      }
      lastReady = key;
    };
    new MutationObserver(observe).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-boot', 'data-ready', 'data-theme', 'inert'] });
    function sample() {
      const html = document.documentElement, body = document.body, loader = document.getElementById('startup-screen');
      if (body && (loader || document.getElementById('app')) && probe.frames.length < 3000) {
        const ls = loader ? getComputedStyle(loader) : null;
        const loaderVisible = !!loader && ls.display !== 'none' && ls.visibility !== 'hidden' && Number(ls.opacity) > 0 && loader.getBoundingClientRect().width > 0;
        probe.frames.push({ time: performance.now(), theme: html.dataset.theme || '', boot: html.dataset.boot || '', root: getComputedStyle(html).backgroundColor,
          body: getComputedStyle(body).backgroundColor, surface: loaderVisible ? ls.backgroundColor : getComputedStyle(body).backgroundColor,
          loader: loaderVisible, appInert: !!document.getElementById('app')?.inert });
      }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }, { ...options, version: VERSION });
  const page = await context.newPage();
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(origin + '/')) report.externalRequests.push(request.url()); });
  page.on('pageerror', error => { const record = { scenario: test.id, message: error.message, expected: test.fatalApp && /Synthetic startup failure/.test(error.message) }; report.pageErrors.push(record); });
  await page.goto(`${origin}/${test.id}/renderer/index.html`, { waitUntil: 'commit' });
  return { page, context };
}
async function visibleLoader(page, theme) {
  await page.waitForSelector('#startup-screen', { state: 'visible' });
  await page.waitForFunction(() => !!document.getElementById('app'));
  const state = await page.evaluate(() => {
    const loader = document.getElementById('startup-screen'), app = document.getElementById('app'), style = getComputedStyle(loader), rect = loader.getBoundingClientRect();
    const corners = [[1, 1], [innerWidth - 2, 1], [1, innerHeight - 2], [innerWidth - 2, innerHeight - 2], [innerWidth / 2, innerHeight / 2]];
    const input = document.getElementById('search-input'); input?.focus();
    return { theme: document.documentElement.dataset.theme, boot: document.documentElement.dataset.boot, appReady: app.dataset.ready || '', inert: app.inert,
      width: innerWidth, height: innerHeight, bounds: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, background: style.backgroundColor,
      opacity: style.opacity, pointerEvents: style.pointerEvents, coveredPoints: corners.map(([x, y]) => !!document.elementFromPoint(x, y)?.closest('#startup-screen')),
      appFocused: document.activeElement === input };
  });
  assert.equal(state.theme, theme); assert.equal(state.inert, true); assert.notEqual(state.appReady, 'true'); assert.equal(state.appFocused, false);
  assert.equal(state.opacity, '1'); assert.notEqual(state.pointerEvents, 'none'); assert.ok(state.coveredPoints.every(Boolean), 'loader covers every viewport sample point');
  assert.deepEqual(state.bounds, { left: 0, top: 0, width: state.width, height: state.height });
  assert.ok(theme === 'dark' ? lightness(state.background) < 0.35 : lightness(state.background) > 0.65, 'loader has opaque theme-matching surface');
  return state;
}
async function waitReady(page, theme) {
  await page.waitForFunction(() => document.documentElement.dataset.boot === 'ready' && document.getElementById('app')?.dataset.ready === 'true', null, { timeout: 10000 });
  await page.waitForFunction(() => !document.getElementById('app').inert && getComputedStyle(document.getElementById('startup-screen')).display === 'none');
  assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
  assert.equal(await page.title(), 'ThreadShelf Local Alternative', 'Document title must contain the product name without version or revision');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function frameEvidence(page, expectedTheme, label) {
  const probe = await page.evaluate(() => __startupProbe);
  assert.ok(probe.frames.length >= 2, label + ': RAF samples captured');
  if (expectedTheme === 'dark') {
    const lightFrames = probe.frames.filter(frame => {
      const color = lightness(frame.surface) ?? lightness(frame.body) ?? lightness(frame.root);
      return color !== null && color > 0.45;
    });
    assert.deepEqual(lightFrames, [], label + ': no light rendered surfaces during dark startup');
  }
  const result = { label, theme: expectedTheme, rafFrames: probe.frames.length, loadingFrames: probe.frames.filter(frame => frame.loader).length,
    firstFrame: probe.frames[0], finalFrame: probe.frames.at(-1), readyEvents: probe.ready, paintEntries: probe.paints };
  report.cases.push(result); return result;
}
async function screenshot(page, name) { if (shots) { await fs.mkdir(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, name + '.png') }); } }
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  try {
    for (const options of [
      { saved: 'dark', os: 'light', resolved: 'dark', viewport: { width: 680, height: 540 } },
      { saved: 'light', os: 'dark', resolved: 'light' },
      { saved: 'system', os: 'dark', resolved: 'dark', viewport: { width: 2560, height: 720 } },
      { saved: 'system', os: 'light', resolved: 'light' },
    ]) await check(`Early browser ${options.saved} preference on ${options.os} OS before heavy scripts`, async () => {
      const test = scenario(); const { page, context } = await setup(browser, test, options);
      try {
        const early = await visibleLoader(page, options.resolved);
        await page.evaluate(() => new Promise(resolve => { let n = 0; function tick() { if (++n >= 8) resolve(); else requestAnimationFrame(tick); } requestAnimationFrame(tick); }));
        assert.ok(test.requests.includes('vendor/marked.umd.js'), 'heavy dependency is waiting behind loader');
        assert.equal(await page.evaluate(() => typeof window.TSAContent), 'undefined', 'full app code has not initialized');
        await screenshot(page, `early-${options.saved}-os-${options.os}-${options.viewport?.width || 1360}`);
        test.release(); await waitReady(page, options.resolved);
        assert.equal(await page.locator(`#theme-choices [data-theme="${options.saved}"]`).getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('.result-card').count(), 13);
        await page.locator('#reading-settings').click(); assert.equal(await page.locator('#settings-dialog').isVisible(), true);
        const about = await page.locator('#settings-dialog .about-line').innerText();
        assert.equal((await page.locator('.about-line strong').textContent()).trim(), VERSION); assert.doesNotMatch(about, /Revision/i);
        await page.locator('#settings-dialog .dialog-footer [data-close]').click();
        const frames = await frameEvidence(page, options.resolved, `browser-${options.saved}-os-${options.os}`);
        return { viewport: early.bounds, background: early.background, sampledFrames: frames.rafFrames };
      } finally { test.release(); await context.close(); }
    });
    await check('Desktop synchronous saved-dark theme covers slow state loading and releases only after controls are ready', async () => {
      const test = scenario(); const { page, context } = await setup(browser, test, { desktop: true, slowState: true, saved: 'dark', resolved: 'dark', os: 'light' });
      try {
        await visibleLoader(page, 'dark'); test.release();
        await page.waitForFunction(() => typeof window.TSAContent === 'object');
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 350)));
        const pending = await visibleLoader(page, 'dark'); assert.equal(pending.boot, 'loading');
        assert.equal(await page.evaluate(() => __startupProbe.ready.length), 0);
        assert.equal(await page.evaluate(() => TSAFlush()), false, 'early-close flush cannot save defaults before preferences load');
        assert.equal(await page.evaluate(() => __startupProbe.saveCalls), 0);
        await screenshot(page, 'slow-desktop-dark');
        await page.evaluate(() => __releaseStartupState()); await waitReady(page, 'dark');
        const events = await page.evaluate(() => __startupProbe.ready); assert.ok(events.length >= 1);
        assert.ok(events.every(event => event.stateResolved && event.theme === 'dark' && event.selectedTheme === 'dark'));
        await page.locator('#reading-settings').click(); assert.equal(await page.locator('#settings-dialog').isVisible(), true);
        await frameEvidence(page, 'dark', 'desktop-delayed-state');
      } finally { test.release(); await context.close(); }
    });
    await check('After startup explicit and System theme changes update root background and browser color scheme', async () => {
      const test = scenario(); const { page, context } = await setup(browser, test, { saved: 'dark', resolved: 'dark', os: 'light' });
      try {
        await visibleLoader(page, 'dark'); test.release(); await waitReady(page, 'dark');
        const observations = [];
        const inspectTheme = async (preference, resolved) => {
          await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, resolved);
          const actual = await page.evaluate(() => { const root = document.documentElement, style = getComputedStyle(root); return { theme: root.dataset.theme, background: style.backgroundColor, colorScheme: style.colorScheme }; });
          assert.equal(actual.background, resolved === 'dark' ? 'rgb(20, 28, 29)' : 'rgb(243, 241, 235)');
          assert.equal(actual.colorScheme, resolved);
          assert.equal(await page.locator(`#theme-choices [data-theme="${preference}"]`).getAttribute('aria-pressed'), 'true');
          observations.push({ preference, ...actual });
        };
        await page.locator('#reading-settings').click();
        for (const preference of ['light', 'dark', 'system']) {
          await page.locator(`#theme-choices [data-theme="${preference}"]`).click();
          await inspectTheme(preference, preference === 'system' ? 'light' : preference);
        }
        await page.emulateMedia({ colorScheme: 'dark' }); await inspectTheme('system', 'dark');
        await page.emulateMedia({ colorScheme: 'light' }); await inspectTheme('system', 'light');
        return { transitions: observations };
      } finally { test.release(); await context.close(); }
    });
    await check('Rejected asynchronous preferences retain known synchronous dark theme on light OS', async () => {
      const test = scenario(); const { page, context } = await setup(browser, test, { desktop: true, rejectState: true, saved: 'dark', resolved: 'dark', os: 'light' });
      try {
        await visibleLoader(page, 'dark'); test.release(); await waitReady(page, 'dark');
        assert.equal(await page.locator('#theme-choices [data-theme="dark"]').getAttribute('aria-pressed'), 'true');
        assert.match(await page.locator('#toast').textContent(), /preferences|settings|default/i);
        await frameEvidence(page, 'dark', 'desktop-rejected-state');
        assert.equal(await page.evaluate(() => TSAFlush()), false);
        await page.locator('#reading-settings').click();
        assert.equal(await page.locator('#settings-warning').isVisible(), true);
        assert.match(await page.locator('#settings-warning').textContent(), /Changes stay in this session.*restore a backup/);
        assert.equal(await page.locator('#settings-save-status').textContent(), 'Changes apply to this session only.');
        await page.locator('#theme-choices [data-theme="light"]').click();
        assert.equal(await page.evaluate(() => TSAFlush()), false, 'unread state is not overwritten by subsequent preference actions or close flush');
        assert.equal(await page.evaluate(() => __startupProbe.saveCalls), 0);
        return { retainedTheme: 'dark', systemTheme: 'light', preferenceWritesAfterFailure: 0 };
      } finally { test.release(); await context.close(); }
    });
    await check('Reduced motion keeps the full loader visible without decorative animation', async () => {
      const test = scenario(); const { page, context } = await setup(browser, test, { saved: 'dark', resolved: 'dark', os: 'dark', reducedMotion: 'reduce' });
      try {
        await visibleLoader(page, 'dark');
        const moving = await page.locator('#startup-screen').evaluate(element => element.getAnimations({ subtree: true }).filter(animation => {
          const timing = animation.effect.getTiming();
          const keys = animation.effect.getKeyframes();
          return timing.iterations === Infinity && keys.some(frame => ['transform', 'translate', 'rotate', 'opacity', 'backgroundPosition'].some(property => property in frame));
        }).length);
        assert.equal(moving, 0); await screenshot(page, 'reduced-motion-dark'); test.release(); await waitReady(page, 'dark');
      } finally { test.release(); await context.close(); }
    });
    await check('Unavailable server reconnect cannot trap an initialized desktop workspace behind the loader', async () => {
      const test = scenario(); const { page, context } = await setup(browser, test, { desktop: true, saved: 'dark', resolved: 'dark', os: 'light', collection: 'alpha' });
      try {
        await visibleLoader(page, 'dark'); test.release(); await waitReady(page, 'dark');
        await page.waitForFunction(() => __startupProbe.connectPending);
        assert.equal(await page.locator('#app').getAttribute('inert'), null);
        await page.evaluate(() => __rejectStartupConnection());
        await page.waitForFunction(() => document.getElementById('results-notice').textContent.includes('Synthetic offline server'));
        assert.equal(await page.locator('#results-notice').isVisible(), true);
        assert.equal(await page.locator('html').getAttribute('data-boot'), 'ready');
        await frameEvidence(page, 'dark', 'desktop-offline-server');
      } finally { test.release(); await context.close(); }
    });
    await check('Fatal app bootstrap stays covered and offers functional retry', async () => {
      const test = scenario({ fatalApp: true }); const { page, context } = await setup(browser, test, { saved: 'dark', resolved: 'dark', os: 'light' });
      try {
        await visibleLoader(page, 'dark'); test.release();
        await page.waitForFunction(() => document.documentElement.dataset.boot === 'error', null, { timeout: 5000 });
        await visibleLoader(page, 'dark'); await page.locator('#startup-retry').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#app').getAttribute('inert'), ''); await screenshot(page, 'fatal-recovery-dark');
        test.fatalApp = false;
        await page.locator('#startup-retry').click(); await waitReady(page, 'dark');
        assert.equal(await page.locator('.result-card').count(), 13);
      } finally { test.release(); await context.close(); }
    });
    await check('Missing early bootstrap retains an opaque fallback with recovery and reload', async () => {
      const test = scenario({ missingStartup: true }); const { page, context } = await setup(browser, test, { saved: 'system', resolved: 'dark', os: 'dark' });
      try {
        await page.waitForSelector('#startup-screen', { state: 'visible' });
        await page.locator('#startup-retry').waitFor({ state: 'visible', timeout: 19000 });
        const fallback = await page.locator('#startup-screen').evaluate(element => ({ background: getComputedStyle(element).backgroundColor, width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
        assert.ok(lightness(fallback.background) < 0.35); assert.deepEqual([fallback.width, fallback.height], [1360, 880]);
        assert.equal(await page.locator('#app').getAttribute('inert'), ''); await screenshot(page, 'missing-bootstrap-recovery-dark');
        test.missingStartup = false; test.release(); await page.locator('#startup-retry').click(); await waitReady(page, 'dark');
        assert.equal(await page.locator('.result-card').count(), 13);
      } finally { test.release(); await context.close(); }
    });
    await check('Startup stays local and all unexpected browser errors are absent', async () => {
      assert.deepEqual(report.externalRequests, []);
      assert.deepEqual(report.pageErrors.filter(error => !error.expected), []);
    });
    report.success = true;
  } catch (error) { report.error = error.stack; throw error; }
  finally {
    for (const value of scenarios.values()) value.release();
    await browser.close(); await new Promise(resolve => server.close(resolve));
    if (process.env.STARTUP_REPORT) { await fs.mkdir(path.dirname(process.env.STARTUP_REPORT), { recursive: true }); await fs.writeFile(process.env.STARTUP_REPORT, JSON.stringify(report, null, 2) + '\n'); }
    console.log(JSON.stringify(report, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
