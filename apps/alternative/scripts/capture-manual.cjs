'use strict';
// Capture the real desktop renderer using only its bundled synthetic demo.
// Requires Playwright, a matching Electron executable, and an X display on Linux.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const playwright = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.MANUAL_SCREENSHOTS || path.join(root, '.verification', 'screenshots'));

(async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'alternative-manual-'));
  let electron;
  const report = { product: 'ThreadShelf Local Alternative', version: '1.3.0', data: 'Bundled synthetic demo only', screenshots: [], errors: [], requests: [] };
  try {
    await fs.mkdir(output, { recursive: true });
    const wrapper = path.join(temporary, 'capture-main.cjs');
    const appRoot = process.env.TSA_APP_PATH || root;
    await fs.writeFile(wrapper, "const e=require('electron');\n" +
      (process.env.TSA_TEST_NO_UNIX_SOCKETS === '1' ? 'e.app.requestSingleInstanceLock=()=>true;\n' : '') +
      'require(' + JSON.stringify(path.join(appRoot, 'main.cjs')) + ');\n');
    electron = await playwright._electron.launch({
      executablePath: process.env.ELECTRON_PATH,
      args: [...(process.env.TSA_TEST_NO_SANDBOX === '1' ? ['--no-sandbox'] : []), wrapper],
      env: { ...process.env, XDG_CONFIG_HOME: path.join(temporary, 'config'), XDG_CACHE_HOME: path.join(temporary, 'cache') },
      timeout: 30000
    });
    const page = await electron.firstWindow();
    page.setDefaultTimeout(15000);
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('request', r => { if (/^https?:/i.test(r.url())) report.requests.push(r.url()); });
    await page.waitForSelector('#app[data-ready="true"]');
    await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 960));
    const info = await page.evaluate(() => alternative.getInfo());
    assert.equal(info.version, '1.3.0');
    assert.equal(Object.hasOwn(info, 'revision'), false);
    const screenshot = async name => {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(output, name + '.png') });
      report.screenshots.push(name + '.png');
    };
    const theme = async value => {
      await page.click('#settings-button');
      await page.click('#theme-choices [data-theme="' + value + '"]');
      await page.locator('#settings-dialog .dialog-footer [data-close]').click();
      await page.waitForFunction(v => document.documentElement.dataset.theme === v, value);
    };
    await page.click('#welcome-demo');
    await page.waitForFunction(() => document.querySelectorAll('.result-card').length === 13);
    await theme('light');
    await page.locator('.result-card').filter({ hasText: 'The paper observatory' }).first().click();
    await page.waitForSelector('#thread-content .rich-image-placeholder');
    await page.locator('#reader-scroll').evaluate(e => e.scrollTop = 0);
    await screenshot('alternative-light');
    await theme('dark');
    await screenshot('alternative-dark');
    await page.click('#settings-button');
    assert.match(await page.locator('#settings-dialog .about-line').innerText(), /1\.2\.0\b/);
    await screenshot('alternative-settings');
    await page.locator('#settings-dialog .dialog-footer [data-close]').click();
    await theme('light');
    await page.locator('#search-input').fill('twenty-minute');
    await page.locator('#search-input').press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('.result-card').length === 2);
    await page.locator('.result-card').filter({ hasText: 'A weekly ritual for unfinished ideas' }).first().click();
    await page.waitForSelector('#thread-content .tsa-message');
    await screenshot('alternative-search');
    await page.click('#connection-button');
    await page.waitForSelector('#connect-dialog[open]');
    await screenshot('alternative-connect');
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.requests, []);
    report.runtime = { electron: info.electron, platform: info.platform };
    report.testAccommodations = { noSandbox: process.env.TSA_TEST_NO_SANDBOX === '1', singleInstanceBypass: process.env.TSA_TEST_NO_UNIX_SOCKETS === '1' };
    await fs.writeFile(path.join(output, 'alternative-capture.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (electron) await electron.close();
    await fs.rm(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
