#!/usr/bin/env node
// Source-only CI gates for public image, cache and archive compatibility changes.
// Copyright (c) 2026 davoda1. MIT; see ../LICENSE.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const mode = process.argv[2];
if (!['integration', 'browser'].includes(mode) || process.argv.length !== 3) {
  console.error('Usage: node tools/check-feature-regressions.mjs integration|browser');
  process.exit(2);
}
const reports = path.join(root, '.verification', 'feature-regressions');
fs.mkdirSync(reports, { recursive: true });
const env = { ...process.env };
// These source/browser checks never launch a packaged or installed application.
for (const name of ['ELECTRON_RUN_AS_NODE', 'ELECTRON_PATH', 'READER_ELECTRON', 'TSA_APP_PATH']) delete env[name];

function run(args) {
  console.log(`\n+ node ${args.join(' ')}`);
  const result = spawnSync(process.execPath, args, {
    cwd: root, env, encoding: 'utf8', timeout: 600_000, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${args.at(-1)} failed (${result.signal || result.status})`);
  return result.stdout.trim();
}

function jsonCheck(script, minimums, args = []) {
  const output = run([script, ...args]);
  // Some long browser matrices log progress before their final JSON summary.
  const report = JSON.parse(output.slice(output.lastIndexOf('\n{') + 1));
  assert.ok(report.passed === true || report.result === 'PASS', `${script} did not report success`);
  for (const [field, minimum] of Object.entries(minimums)) {
    const count = Array.isArray(report[field]) ? report[field].length : report[field];
    assert.ok(Number.isInteger(count) && count >= minimum,
      `${script} must execute at least ${minimum} ${field}; received ${count}`);
  }
}

if (mode === 'integration') {
  env.ANALYTICS_SOURCE = path.join(root, 'apps', 'analytics');
  env.BASELINE_READER_SOURCE = path.join(root, 'apps', 'reader');
  const output = run(['--test', '--test-reporter=tap', 'apps/reader/tests/rich-integration-storage.test.mjs']);
  const totals = Object.fromEntries([...output.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$/gm)]
    .map(([, key, count]) => [key, Number(count)]));
  assert.deepEqual(totals, { tests: 2, pass: 2, fail: 0, cancelled: 0, skipped: 0, todo: 0 },
    'Both 7z and ZIP6 Reader-Analytics workflows must execute and pass without skips');
  jsonCheck('apps/reader/tests/resource-cache-storage.integration.mjs', { checks: 9 });
  const publicBaseline = path.join(root, '.verification', 'public-1.0.0', 'apps', 'reader');
  assert.equal(JSON.parse(fs.readFileSync(path.join(publicBaseline, 'package.json'), 'utf8')).version, '1.0.0',
    'Check out the pinned public Reader 1.0.0 baseline before running integration checks');
  env.READER_PUBLIC_UPGRADE_REPORT = path.join(reports, 'reader-public-upgrade.json');
  jsonCheck('apps/reader/tests/public-upgrade.integration.mjs', { checks: 5 }, [publicBaseline]);
} else {
  const recipe = path.join(root, 'tools', 'mermaid-bundle');
  const playwright = path.join(recipe, 'node_modules', 'playwright-core');
  const expected = JSON.parse(fs.readFileSync(path.join(recipe, 'package.json'), 'utf8')).devDependencies['playwright-core'];
  const installed = JSON.parse(fs.readFileSync(path.join(playwright, 'package.json'), 'utf8')).version;
  assert.equal(installed, expected, 'Browser tests must use the recipe-pinned Playwright version');
  env.THREADSHELF_PLAYWRIGHT_MODULE = pathToFileURL(path.join(playwright, 'index.mjs')).href;
  env.PLAYWRIGHT_PATH = playwright;
  Object.assign(env, {
    THREADSHELF_IMAGE_R2_EVIDENCE: path.join(reports, 'reader-images.json'),
    READER_RESOURCES_UI_REPORT: path.join(reports, 'reader-cache-ui.json'),
    READER_IMAGE_QUEUE_REPORT: path.join(reports, 'reader-image-queue.json'),
    READER_THOUGHTS_INTERFACE_EVIDENCE: path.join(reports, 'reader-visibility.json'),
    SIZING_REPORT: path.join(reports, 'alternative-image-sizing.json'),
  });
  jsonCheck('apps/reader/tests/markdown-images.browser.mjs', { checks: 17, layoutCases: 6 });
  jsonCheck('apps/reader/tests/resources-cache-ui.browser.mjs', { checks: 7, geometryCases: 380 });
  jsonCheck('apps/reader/tests/resource-image-queue.browser.mjs', { checks: 4, imageCount: 80 });
  jsonCheck('apps/reader/tests/thoughts-interface.browser.mjs', { checks: 7 });
  jsonCheck('apps/alternative/test/image-loading.cjs', { checks: 4 });
  jsonCheck('apps/alternative/test/image-sizing.cjs', { checks: 4, layouts: 8 });
}
console.log(`\nPublic ${mode} feature regressions passed without skipped feature checks.`);
