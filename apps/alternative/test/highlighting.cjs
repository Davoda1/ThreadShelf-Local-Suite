/* Browser regression gate for code syntax highlighting.
 * Run with optional PLAYWRIGHT_PATH / CHROMIUM_PATH; HIGHLIGHT_REPORT writes JSON.
 * Uses only fictional code and the existing fictional offline demo. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(process.env.PLAYWRIGHT_PATH || 'playwright'); }
const root = path.resolve(__dirname, '..');
const shots = process.env.HIGHLIGHT_SCREENSHOTS;
if (shots) fs.mkdirSync(shots, { recursive: true });
const fixtures = [
  { name: 'JavaScript', aliases: ['javascript', 'js'], source: '// A synthetic example\nconst answer = 42;\nfunction greet(name) {\n  return "hello " + name;\n}\nconsole.log(greet("reader"));' },
  { name: 'Python', aliases: ['python', 'py'], source: '# A synthetic example\ndef greeting(name):\n    answer = 42\n    return "hello " + name\nprint(greeting("reader"))' },
  { name: 'Bash', aliases: ['bash', 'sh'], source: '# A synthetic example\nanswer=42\nif [ "$answer" -gt 10 ]; then\n  printf "%s\\n" "hello reader"\nfi' },
  { name: 'JSON', aliases: ['json'], source: '{\n  "name": "reader",\n  "answer": 42,\n  "enabled": true,\n  "missing": null\n}' },
  { name: 'HTML', aliases: ['html', 'xml'], source: '<!-- A synthetic example -->\n<section class="reader" data-count="42">\n  <h2>Hello &amp; welcome</h2>\n</section>' },
  { name: 'CSS', aliases: ['css'], source: '/* A synthetic example */\n.reader {\n  color: #17635f;\n  font-size: 16px;\n  display: block;\n}' },
];
const cases = fixtures.flatMap(fixture => fixture.aliases.map(language => ({ ...fixture, language })));
const report = { product: 'ThreadShelf Local Alternative', version: '1.0.0',  success: false, checks: [], languages: [], palettes: [], networkRequests: [], pageErrors: [] };
const check = async (name, run) => { const details = await run(); report.checks.push({ name, status: 'pass', ...(details || {}) }); console.log('PASS ' + name); };
function watch(page) {
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('request', request => { if (/^(https?|wss?):/.test(request.url())) report.networkRequests.push(request.url()); });
}
async function fixturePage(context) {
  const page = await context.newPage(); watch(page);
  await page.setContent('<!doctype html><html data-theme="light"><head></head><body><main id="content"></main></body></html>');
  // Use the exact production dependency order, including the offline highlighter.
  const html = fs.readFileSync(path.join(root, 'renderer/index.html'), 'utf8');
  const sources = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1]).filter(source => !['demo-data.js', 'app.js'].includes(source));
  for (const source of sources) await page.addScriptTag({ path: path.resolve(root, 'renderer', source) });
  const styles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(match => match[1]);
  for (const source of styles) await page.addStyleTag({ path: path.resolve(root, 'renderer', source) });
  await page.addStyleTag({ content: 'html,body{height:auto;overflow:auto}#content{max-width:920px;margin:24px auto;padding:12px}' });
  return page;
}
async function mount(page, items, query = '') {
  return page.evaluate(async ({ items, query }) => {
    window.syntaxCleanup?.();
    const fence = String.fromCharCode(96).repeat(3);
    const thread = { turns: items.map(item => ({ ai: fence + item.language + '\n' + item.source + '\n' + fence })) };
    const content = document.getElementById('content'); content.innerHTML = TSAContent.renderThread(thread, { query }).html;
    window.syntaxCopies = []; window.syntaxCleanup = TSAContent.bind(content, { copy: value => syntaxCopies.push(value) });
    await syntaxCleanup.ready;
    return [...content.querySelectorAll('.tsa-code-block')].map(block => ({ text: block.querySelector('code')?.textContent, language: block.dataset.codeLanguage }));
  }, { items, query });
}
async function inspect(page) {
  return page.locator('.tsa-code-block').evaluateAll(blocks => blocks.map(block => {
    const code = block.querySelector('code');
    const spans = [...code.querySelectorAll('span[class]')];
    return { language: block.dataset.codeLanguage, text: code.textContent, tokens: spans.length,
      colors: [...new Set(spans.map(span => getComputedStyle(span).color))],
      classes: [...new Set(spans.map(span => span.className))],
      background: getComputedStyle(block).backgroundColor, foreground: getComputedStyle(code).color,
      keyword: spans.find(span => span.textContent === 'const') ? getComputedStyle(spans.find(span => span.textContent === 'const')).color : null,
      comment: spans.find(span => span.textContent.startsWith('// A synthetic')) ? getComputedStyle(spans.find(span => span.textContent.startsWith('// A synthetic'))).color : null,
    };
  }));
}
(async () => {
  const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
    await context.setOffline(true);
    const page = await fixturePage(context);
    await check('Six language grammars and aliases emit colored syntax spans without altering code', async () => {
      const mounted = await mount(page, cases); assert.equal(mounted.length, cases.length);
      const observed = await inspect(page);
      for (let index = 0; index < cases.length; index++) {
        const actual = observed[index], expected = cases[index];
        assert.equal(actual.text, expected.source, expected.language + ': exact text');
        assert.ok(actual.tokens >= 3, expected.language + ': real syntax tokens');
        assert.ok(actual.colors.length >= 2, expected.language + ': multiple computed token colors');
        report.languages.push({ language: expected.language, tokenSpans: actual.tokens, computedColors: actual.colors });
      }
      for (const fixture of fixtures) {
        const matches = observed.filter(actual => fixture.aliases.includes(actual.language));
        for (const match of matches.slice(1)) { assert.deepEqual(match.colors, matches[0].colors, fixture.name + ': alias palette'); assert.deepEqual(match.classes, matches[0].classes, fixture.name + ': alias grammar'); }
      }
      return { grammars: fixtures.length, labelsAndAliases: cases.length };
    });
    await check('VS Code Light and Dark palettes switch existing spans with exact source preserved', async () => {
      // Values are the documented VS Code Light+/Dark+ syntax defaults.
      const expected = {
        light: { background: 'rgb(255, 255, 255)', keyword: 'rgb(0, 0, 255)', comment: 'rgb(0, 128, 0)' },
        dark: { background: 'rgb(30, 30, 30)', keyword: 'rgb(86, 156, 214)', comment: 'rgb(106, 153, 85)' },
      };
      for (const theme of ['light', 'dark', 'light']) {
        await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
        const observations = await inspect(page), js = observations[0];
        assert.equal(js.background, expected[theme].background, theme + ': code surface');
        assert.equal(js.keyword, expected[theme].keyword, theme + ': keyword');
        assert.equal(js.comment, expected[theme].comment, theme + ': comment');
        observations.forEach((actual, index) => assert.equal(actual.text, cases[index].source));
        report.palettes.push({ theme, background: js.background, keyword: js.keyword, comment: js.comment });
        if (shots) await page.locator('.tsa-code-block').first().screenshot({ path: path.join(shots, 'javascript-' + theme + '.png') });
      }
    });
    await check('Copy code returns exact original text for every highlighted language and alias', async () => {
      for (let index = 0; index < cases.length; index++) await page.locator('[data-copy-code]').nth(index).click();
      assert.deepEqual(await page.evaluate(() => syntaxCopies), cases.map(item => item.source));
      return { copiedBlocks: cases.length };
    });
    await check('Hostile code remains inert escaped content with exact copy and no network activity', async () => {
      const source = '</code><script>window.HIGHLIGHT_PWNED=1</script>\n<img src="https://example.invalid/private" onerror="window.HIGHLIGHT_PWNED=2">\n<svg onload="window.HIGHLIGHT_PWNED=3"></svg> & literal';
      const mounted = await mount(page, [{ language: 'html', source }]); assert.equal(mounted[0].text, source);
      const state = await page.evaluate(() => ({ active: document.querySelectorAll('#content script,#content img,#content iframe,#content svg,[onerror],[onload]').length, pwned: window.HIGHLIGHT_PWNED || 0 }));
      assert.equal(state.active, 0); assert.equal(state.pwned, 0);
      await page.locator('[data-copy-code]').click(); assert.deepEqual(await page.evaluate(() => syntaxCopies), [source]);
    });
    await check('Unknown and plain fences retain exact readable text without automatic guessing', async () => {
      const source = '  const answer = 42;\n\t<literal>& no grammar\n\nárvíztűrő tükörfúrógép';
      const inputs = ['unregistered-syntax-name', 'text', 'plaintext', ''].map(language => ({ language, source }));
      await mount(page, inputs);
      const observed = await inspect(page);
      observed.forEach(actual => { assert.equal(actual.text, source); assert.equal(actual.tokens, 0); });
      for (let i = 0; i < inputs.length; i++) await page.locator('[data-copy-code]').nth(i).click();
      assert.deepEqual(await page.evaluate(() => syntaxCopies), inputs.map(item => item.source));
      return { fences: inputs.length };
    });
    await check('Large code blocks use a bounded exact-text fallback', async () => {
      const source = ('const answer = 42; // bounded synthetic source\n').repeat(10000).trimEnd();
      const start = Date.now(); await mount(page, [{ language: 'js', source }]);
      const [actual] = await inspect(page);
      assert.equal(actual.text, source); assert.equal(actual.tokens, 0, 'large block avoids tokenization');
      await page.locator('[data-copy-code]').click(); assert.deepEqual(await page.evaluate(() => syntaxCopies), [source]);
      return { characters: source.length, elapsedMs: Date.now() - start, exactCopy: true };
    });
    await check('Search marks preserve syntax token spans and exact copied code', async () => {
      await mount(page, [cases[0]], 'const answer');
      const before = await inspect(page); assert.ok(before[0].tokens > 0);
      assert.equal((await page.locator('code .tsa-query-hit').allTextContents()).join(''), 'const answer', 'search phrase crosses adjacent syntax spans');
      assert.equal(await page.locator('code').textContent(), cases[0].source);
      await page.locator('[data-copy-code]').click(); assert.deepEqual(await page.evaluate(() => syntaxCopies), [cases[0].source]);
    });
    const app = await context.newPage(); watch(app);
    await app.goto(pathToFileURL(path.join(root, 'renderer/index.html')).href);
    await app.waitForFunction(() => document.querySelectorAll('.result-card').length === 13);
    await app.locator('.result-card').filter({ has: app.locator('.result-title', { hasText: 'A readable home for tables, code, and equations' }) }).click();
    await app.waitForFunction(() => document.getElementById('thread-title').textContent === 'A readable home for tables, code, and equations' && !!document.querySelector('#thread-content code span[class]'));
    await check('Actual app System appearance follows OS changes and updates syntax colors', async () => {
      await app.locator('#reading-settings').click(); await app.locator('#theme-choices [data-theme="system"]').click();
      await app.locator('#settings-dialog .dialog-footer [data-close]').click();
      const token = app.locator('#thread-content .tsa-code-block[data-code-language="python"] code span').filter({ hasText: /^def$/ }).first();
      for (const scheme of ['dark', 'light']) {
        await app.emulateMedia({ colorScheme: scheme });
        await app.waitForFunction(value => document.documentElement.dataset.theme === value, scheme);
        assert.equal(await token.evaluate(element => getComputedStyle(element).color), scheme === 'dark' ? 'rgb(86, 156, 214)' : 'rgb(0, 0, 255)');
        assert.equal(await app.locator('#theme-choices [data-theme="system"]').getAttribute('aria-pressed'), 'true');
        if (shots) { await token.scrollIntoViewIfNeeded(); await app.screenshot({ path: path.join(shots, 'app-system-' + scheme + '.png') }); }
      }
    });
    await check('Actual app find spans adjacent syntax tokens and removal preserves highlighting', async () => {
      const code = app.locator('#thread-content .tsa-code-block[data-code-language="python"] code');
      const before = await code.evaluate(element => ({ text: element.textContent, spans: element.querySelectorAll('span[class]').length, html: element.innerHTML }));
      await app.locator('#find-thread').click(); await app.locator('#find-input').fill('return max');
      await app.waitForFunction(() => document.querySelectorAll('#thread-content code .in-thread-match').length > 0, null, { timeout: 3000 });
      assert.equal(await code.textContent(), before.text);
      const marked = await code.locator('.in-thread-match').allTextContents();
      assert.equal(marked.join(''), 'return max', 'phrase crossing keyword/function spans is one logical match');
      assert.equal(await app.locator('#find-count').textContent(), '1 / 1');
      await app.locator('#find-close').click();
      const after = await code.evaluate(element => ({ text: element.textContent, spans: element.querySelectorAll('span[class]').length, html: element.innerHTML }));
      assert.equal(after.text, before.text); assert.equal(after.spans, before.spans); assert.equal(after.html, before.html);
      return { query: 'return max', logicalMatches: 1, syntaxSpansPreserved: after.spans };
    });
    await check('Offline highlighting makes no external requests or uncaught browser errors', async () => {
      assert.deepEqual(report.networkRequests, []); assert.deepEqual(report.pageErrors, []);
    });
    report.success = true;
    await context.close();
  } catch (error) { report.error = error.stack; throw error; }
  finally {
    await browser.close();
    if (process.env.HIGHLIGHT_REPORT) { fs.mkdirSync(path.dirname(process.env.HIGHLIGHT_REPORT), { recursive: true }); fs.writeFileSync(process.env.HIGHLIGHT_REPORT, JSON.stringify(report, null, 2) + '\n'); }
    console.log(JSON.stringify(report, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
