import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { testModuleSpecifier } from './esm-module-specifier.mjs';

test('bare Windows drive paths reproduce the browser-harness ESM failure', async () => {
  const supplied = String.raw`D:\a\ThreadShelf-Local-Suite\ThreadShelf-Local-Suite/tools/mermaid-bundle/node_modules/playwright-core/index.mjs`;
  await assert.rejects(import(supplied), error => {
    assert.equal(error.code, 'ERR_UNSUPPORTED_ESM_URL_SCHEME');
    assert.match(error.message, /Received protocol 'd:'/);
    return true;
  });
  assert.equal(testModuleSpecifier(supplied, { windows: true }),
    'file:///D:/a/ThreadShelf-Local-Suite/ThreadShelf-Local-Suite/tools/mermaid-bundle/node_modules/playwright-core/index.mjs');
});

test('absolute drive, mixed-separator, UNC and POSIX paths preserve file identity', () => {
  const cases = [
    { windows: true, value: String.raw`D:\Thread Shelf # 50% árvíz\playwright\index.mjs`,
      expected: 'file:///D:/Thread%20Shelf%20%23%2050%25%20%C3%A1rv%C3%ADz/playwright/index.mjs' },
    { windows: true, value: String.raw`D:\Thread Shelf # 50% árvíz/playwright\index.mjs`,
      expected: 'file:///D:/Thread%20Shelf%20%23%2050%25%20%C3%A1rv%C3%ADz/playwright/index.mjs' },
    { windows: true, value: String.raw`\\server\share\Thread Shelf # 50% árvíz\index.mjs`,
      expected: 'file://server/share/Thread%20Shelf%20%23%2050%25%20%C3%A1rv%C3%ADz/index.mjs' },
    { windows: false, value: '/opt/Thread Shelf # 50% 日本語/index.mjs',
      expected: 'file:///opt/Thread%20Shelf%20%23%2050%25%20%E6%97%A5%E6%9C%AC%E8%AA%9E/index.mjs' },
    { windows: false, value: String.raw`/opt/literal\backslash # 50%/index.mjs`,
      expected: 'file:///opt/literal%5Cbackslash%20%23%2050%25/index.mjs' },
  ];
  for (const { value, windows, expected } of cases) {
    const specifier = testModuleSpecifier(value, { windows });
    assert.equal(specifier, expected);
    assert.equal(new URL(specifier).search, '');
    assert.equal(new URL(specifier).hash, '');
    assert.equal(fileURLToPath(specifier, { windows }),
      (windows ? path.win32 : path.posix).normalize(value));
  }
});

test('existing URLs, package names and relative ESM specifiers are not rewritten', () => {
  for (const windows of [false, true]) {
    for (const value of [
      'playwright', '@scope/browser-driver', 'node:fs',
      './fixtures/driver.mjs', '../fixtures/driver.mjs',
      'file:///D:/Thread%20Shelf%20%23%2050%25%20%C3%A1rv%C3%ADz/index.mjs',
      'file://server/share/index.mjs?fixture=1#driver',
      'data:text/javascript,export default 42',
    ]) assert.equal(testModuleSpecifier(value, { windows }), value);
  }
});

test('native dynamic imports load encoded filenames and the file URL resolves the same module', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'reader-esm-import-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const directory = path.join(temporary, 'Thread Shelf # 50% árvíz 日本語');
  await fs.mkdir(directory);
  const modulePath = path.join(directory, 'driver # 100%.mjs');
  await fs.writeFile(modulePath, 'export const driver = { ready: true };\n');
  const url = pathToFileURL(modulePath).href;
  const fromNativePath = await import(testModuleSpecifier(modulePath));
  const fromFileURL = await import(testModuleSpecifier(url));
  assert.equal(fromNativePath.driver.ready, true);
  assert.equal(fromNativePath, fromFileURL);
});

test('environment-supplied driver imports work before a browser or app is launched', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'reader-esm-startup-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const directory = path.join(temporary, 'Driver # 50% 日本語');
  await fs.mkdir(directory);
  const driver = path.join(directory, 'index.mjs');
  await fs.writeFile(driver, 'export const _electron = { startup: "ready" };\n');
  const helper = new URL('./esm-module-specifier.mjs', import.meta.url).href;
  const source = `import { testModuleSpecifier } from ${JSON.stringify(helper)};\n` +
    'const { _electron } = await import(testModuleSpecifier(process.env.THREADSHELF_PLAYWRIGHT_MODULE));\n' +
    'if (_electron.startup !== "ready") throw new Error("Driver not loaded");\n';
  for (const supplied of [driver, pathToFileURL(driver).href]) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
      encoding: 'utf8', timeout: 10000,
      env: { ...process.env, THREADSHELF_PLAYWRIGHT_MODULE: supplied },
    });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr);
  }
});

test('repository ESM harnesses cannot import the raw browser-driver environment path', async () => {
  const roots = [new URL('./', import.meta.url), new URL('../scripts/', import.meta.url),
    new URL('../../../tools/tests/', import.meta.url)];
  const unsafe = /\bimport\s*\(\s*\(*\s*process\s*\.\s*env\s*\.\s*THREADSHELF_PLAYWRIGHT_MODULE\b/;
  const offenders = [];
  for (const [index, root] of roots.entries()) {
    // Keep the guard limited to first-party harnesses, not dependencies or
    // existing CommonJS require() consumers, whose path contract is different.
    let entries;
    try { entries = await fs.readdir(root, { withFileTypes: true }); }
    catch (error) {
      // Component-only source archives omit the suite-level tools directory.
      if (index === 2 && error.code === 'ENOENT') continue;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue;
      const file = new URL(entry.name, root);
      if (unsafe.test(await fs.readFile(file, 'utf8'))) offenders.push(fileURLToPath(file));
    }
  }
  assert.deepEqual(offenders, [], 'Use testModuleSpecifier() at each ESM import boundary.');
});
