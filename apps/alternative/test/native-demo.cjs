'use strict';
// Optional desktop demo gate. Uses a matching official Electron runtime and an
// isolated profile. TSA_APP_PATH can point to frozen packaged resources/app.
// The temporary QA wrapper observes outbound calls without changing their behavior.
// TSA_TEST_NO_UNIX_SOCKETS=1 bypasses only the single-instance lock on restricted hosts.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const playwright = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const PRODUCT = 'ThreadShelf Local Alternative';
const START = 'Start here · Your ThreadShelf guide';
const WORKSHOP = 'The diagram workshop · From rough notes to clear plans';
const report = {
  product: PRODUCT, version: '1.1.0',
  target: process.env.TSA_DEMO_TARGET || 'source', tests: [], errors: [], status: 'running',
  method: 'Native welcome entry, rendered internal guide links, Mermaid previews, real native clipboard, and connection dialog with outbound-call observation.',
  limitations: ['Runs native Linux Electron; native Windows execution is not claimed.',
    'A temporary QA wrapper observes main-process fetch and external-browser calls. Application files remain unchanged.',
    'Headless root QA supplies --no-sandbox; distributed launch paths do not include that flag.']
};
let temporary, electron, page;
const rendererRequests = [];
async function check(name, fn) {
  try { const details = await fn(); report.tests.push({ name, status: 'pass', ...details }); console.log('PASS ' + name); }
  catch (error) { report.tests.push({ name, status: 'fail', error: error.message }); throw error; }
}
async function threadTitle(title) {
  await page.waitForFunction(expected => document.getElementById('thread-title')?.textContent === expected && document.getElementById('reader-loading')?.hidden, title);
}
async function guideLink(destination) {
  await page.locator('#thread-content a[href="https://guide.threadshelf.invalid/' + destination + '"]').first().click();
}
async function home() {
  await page.click('#home-button');
  await threadTitle(START);
}

(async () => {
  if (process.env.TSA_PACKAGED === '1') throw new Error('Use matching official Electron runtime with TSA_APP_PATH pointing packaged resources/app');
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'alternative-native-demo-'));
  const wrapper = path.join(temporary, 'test-only-main.cjs');
  const main = path.join(process.env.TSA_APP_PATH || root, 'main.cjs');
  await fs.writeFile(wrapper, `'use strict';
const e = require('electron');
const qa = globalThis.__tsaDemoQA = { fetches: [], external: [] };
const fetch = globalThis.fetch;
globalThis.fetch = function(...args) { qa.fetches.push(String(args[0]?.url || args[0])); return Reflect.apply(fetch, this, args); };
const openExternal = e.shell.openExternal.bind(e.shell);
e.shell.openExternal = function(...args) { qa.external.push(String(args[0])); return openExternal(...args); };
${process.env.TSA_TEST_NO_UNIX_SOCKETS === '1' ? 'e.app.requestSingleInstanceLock = () => true;' : ''}
require(${JSON.stringify(main)});
`);
  if (process.env.TSA_TEST_NO_UNIX_SOCKETS === '1') report.limitations.push('This QA host forbids Unix sockets. Only the temporary wrapper bypasses the single-instance lock; delivered files retain it.');
  electron = await playwright._electron.launch({ executablePath: process.env.ELECTRON_PATH,
    args: ['--no-sandbox', wrapper], env: { ...process.env, XDG_CONFIG_HOME: path.join(temporary, 'config'), XDG_CACHE_HOME: path.join(temporary, 'cache') }, timeout: 30000 });
  page = await electron.firstWindow();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('request', request => { if (/^https?:/i.test(request.url())) rendererRequests.push(request.url()); });
  await page.waitForSelector('#app[data-ready="true"]');

  await check('native welcome loads thirteen conversations and the three Claude guides first', async () => {
    const info = await page.evaluate(() => alternative.getInfo());
    assert.equal(info.name, PRODUCT); assert.equal(info.version, '1.1.0'); assert.equal(Object.hasOwn(info, "revision"), false);
    assert.ok(info.profile.startsWith(temporary), 'The native profile must be isolated');
    assert.equal(await page.locator('#welcome-demo').isVisible(), true);
    await page.click('#welcome-demo');
    await threadTitle(START);
    assert.equal(await page.locator('#results-list .result-card').count(), 13);
    assert.equal(await page.locator('#results-count').innerText(), '13 conversations');
    const guides = await page.locator('#results-list .result-card').evaluateAll(cards => cards.slice(0, 3).map(card => ({
      title: card.querySelector('.result-title').textContent,
      provider: card.querySelector('.result-meta > span:nth-child(2)').textContent
    })));
    assert.deepEqual(guides, [
      { title: START, provider: 'Claude' },
      { title: 'Find the thread · Search, read, return', provider: 'Claude' },
      { title: 'Your archive · Server, source, and resources', provider: 'Claude' }
    ]);
    assert.equal(await page.locator('#demo-banner').isVisible(), true);
    return { conversations: 13, guides, initialConversation: START, electron: info.electron, profileIsolated: true };
  });

  await check('native guide links open both showcases with four Mermaid previews and three repairs', async () => {
    await guideLink('chat/showcase-observatory');
    await threadTitle('The paper observatory · A visual research notebook');
    assert.ok(await page.locator('#thread-content table').count() > 0);
    assert.ok(await page.locator('#thread-content mjx-container').count() > 0);
    await home();
    await guideLink('chat/showcase-workshop');
    await threadTitle(WORKSHOP);
    await page.waitForFunction(() => document.querySelectorAll('#thread-content .tsa-mermaid svg').length === 4 && document.querySelectorAll('#thread-content [data-mermaid-state="repaired"]').length === 3);
    assert.equal(await page.locator('#thread-content .tsa-code-block[data-code-language="mermaid"]').count(), 4);
    assert.equal(await page.locator('#thread-content [data-mermaid-state="error"], #thread-content [data-mermaid-state="original-error"]').count(), 0);
    return { showcases: ['showcase-observatory', 'showcase-workshop'], diagrams: 4, repaired: 3 };
  });

  await check('Copy original and Copy repaired put distinct preserved sources on the native clipboard', async () => {
    const block = page.locator('#thread-content .tsa-code-block[data-mermaid-state="repaired"]').first();
    const original = await block.locator('code').first().textContent();
    const repaired = await block.locator('.tsa-repaired-source code').textContent();
    assert.match(original, /^A\[Capture an idea\]/);
    assert.match(repaired, /^flowchart\s/);
    assert.notEqual(original, repaired);
    await electron.evaluate(({ clipboard }) => clipboard.writeText('QA sentinel: no copy action yet'));
    await block.locator('[data-copy-code]').click();
    assert.equal(await electron.evaluate(({ clipboard }) => clipboard.readText()), original);
    await block.locator('[data-copy-repaired]').click();
    assert.equal(await electron.evaluate(({ clipboard }) => clipboard.readText()), repaired);
    assert.equal(await block.locator('code').first().textContent(), original, 'Repair and copying must preserve the saved original');
    return { originalCharacters: original.length, repairedCharacters: repaired.length, distinctSources: true, originalPreserved: true, clipboard: 'native Electron clipboard' };
  });

  await check('guide Connect opens the native server form without network requests and Home returns to the guide', async () => {
    await home();
    await guideLink('action/connect');
    assert.equal(await page.locator('#connect-dialog').isVisible(), true);
    assert.equal(await page.locator('#server-url').isVisible(), true);
    assert.equal(await page.locator('#server-url').inputValue(), 'http://localhost:3000');
    assert.equal(await page.locator('#connect-submit').isEnabled(), true);
    assert.match(await page.locator('#connect-dialog h2').innerText(), /^Connect to ThreadShelf$/);
    assert.equal(await page.locator('#connect-error').isVisible(), false);
    assert.equal(await page.locator('#demo-info-dialog[open]').count(), 0);
    await page.locator('#connect-dialog [data-close="connect-dialog"]').click();
    await guideLink('chat/showcase-observatory');
    await threadTitle('The paper observatory · A visual research notebook');
    await home();
    await page.waitForFunction(() => document.getElementById('reader-scroll').scrollTop === 0);
    assert.equal(await page.locator('#results-list .result-card').count(), 13);
    const outbound = await electron.evaluate(() => ({ ...globalThis.__tsaDemoQA }));
    assert.deepEqual(outbound.fetches, []); assert.deepEqual(outbound.external, []); assert.deepEqual(rendererRequests, []);
    return { dialog: 'native server connection form', returnedTo: START, serverRequests: 0, rendererNetworkRequests: 0, externalBrowserCalls: 0 };
  });
  assert.equal(report.tests.length, 4); assert.deepEqual(report.errors, []);
  report.status = 'pass';
})().catch(error => {
  report.status = 'fail'; report.failure = error.message; console.error(error); process.exitCode = 1;
}).finally(async () => {
  try { if (electron) await electron.close(); }
  catch (error) { report.status = 'fail'; report.errors.push('Native cleanup: ' + error.message); process.exitCode = 1; }
  if (temporary) await fs.rm(temporary, { recursive: true, force: true });
  await fs.writeFile(path.join(root, 'docs/native-demo-verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
});
