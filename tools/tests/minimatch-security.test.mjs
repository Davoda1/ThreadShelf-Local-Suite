import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as nativeFs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../..', import.meta.url));
for (const app of ['reader', 'analytics']) {
  const appRoot = path.join(root, 'apps', app);
  const appRequire = createRequire(path.join(appRoot, 'package.json'));
  const asarPath = appRequire.resolve('@electron/asar');
  const require = createRequire(asarPath);

  test(`${app}: glob preprocessing limits hostile pattern amplification`, () => {
    // Isolate the regression so a vulnerable dependency cannot exhaust the runner.
    const script = `
      const assert = require('node:assert/strict');
      const consumerRequire = require('node:module').createRequire(require.resolve('@electron/asar'));
      const { Minimatch } = consumerRequire('minimatch');
      const pattern = Array.from({ length: 24 }, () => '**/../segment/child').join('/');
      const matcher = new Minimatch(pattern, { optimizationLevel: 2, braceExpandMax: 32 });
      assert.ok(matcher.set.length > 0 && matcher.set.length <= 32);
      const normal = new Minimatch('**/../a/b/**/../c/d', { optimizationLevel: 2 });
      assert.equal(normal.match('../a/b/../c/d'), true);
      assert.equal(normal.match('x/a/b/y/c/d'), true);
      // Glob's default export embeds its own matcher; an override alone cannot patch it.
      const { Glob } = consumerRequire('glob');
      const walk = new Glob(pattern, {});
      assert.ok(walk.patterns.length > 0 && walk.patterns.length <= 10_000);
    `;
    const result = spawnSync(process.execPath, ['--max-old-space-size=512', '-e', script], {
      cwd: appRoot, encoding: 'utf8', timeout: 10_000, maxBuffer: 128 * 1024,
    });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr);
  });

  test(`${app}: cancelling a glob walk stops further filesystem traversal`, async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'threadshelf-glob-test-'));
    try {
      for (let index = 0; index < 12; index++) {
        await mkdir(path.join(temporary, `directory-${index}`, 'nested'), { recursive: true });
      }
      const controller = new AbortController();
      const reason = new Error('cancel traversal');
      let reads = 0;
      const fs = {
        ...nativeFs,
        readdir(directory, options, callback) {
          reads++;
          return nativeFs.readdir(directory, options, (error, entries) => {
            if (!controller.signal.aborted) controller.abort(reason);
            callback(error, entries);
          });
        },
      };
      const { glob } = require('glob');
      await assert.rejects(glob('**/*', { cwd: temporary, fs, signal: controller.signal }), reason);
      await delay(50);
      assert.equal(reads, 1, 'cancelled traversal must not schedule child directory reads');
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  test(`${app}: patched glob matching preserves Electron archive contents and unpack rules`, async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'threadshelf-asar-test-'));
    try {
      const input = path.join(temporary, 'input');
      const archive = path.join(temporary, 'application.asar');
      const fixtures = new Map([
        ['package.json', '{"name":"archive-fixture"}\n'],
        ['src/app.js', 'export const value = 7;\n'],
        ['src/nested/data.json', '{"ok":true}\n'],
        ['native/module.node', 'synthetic native fixture\n'],
        ['.metadata', 'hidden fixture\n'],
      ]);
      for (const [name, contents] of fixtures) {
        const file = path.join(input, ...name.split('/'));
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, contents);
      }
      const { globSync } = require('glob');
      assert.deepEqual(globSync('**/*.{js,json}', { cwd: input }).sort(),
        ['package.json', path.join('src', 'app.js'), path.join('src', 'nested', 'data.json')]);
      const asar = await import(pathToFileURL(asarPath).href);
      await asar.createPackageWithOptions(input, archive, { unpack: '**/*.node' });
      for (const [name, contents] of fixtures) {
        const relative = path.join(...name.split('/'));
        assert.equal(asar.extractFile(archive, relative).toString(), contents, name);
      }
      assert.equal(asar.statFile(archive, path.join('native', 'module.node')).unpacked, true);
      assert.equal(await readFile(path.join(`${archive}.unpacked`, 'native', 'module.node'), 'utf8'),
        fixtures.get('native/module.node'));
      assert.equal(Boolean(asar.statFile(archive, path.join('src', 'app.js')).unpacked), false);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
}
