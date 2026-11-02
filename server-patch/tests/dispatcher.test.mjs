// Copyright (c) 2026 davoda1. MIT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const origin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const backup = '.threadshelf-local-suite-backup-v1';

async function fixture(version, fn) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-dispatch-test-'));
  const bundle = path.join(temp, 'patch bundle');
  const root = path.join(temp, 'server source');
  await fs.mkdir(bundle);
  await fs.mkdir(root);
  try {
    await fs.copyFile(path.join(origin, 'manage.mjs'), path.join(bundle, 'manage.mjs'));
    for (const targetVersion of ['1.3.0', '1.4.1']) {
      const relative = targetVersion;
      await fs.mkdir(path.join(bundle, relative), { recursive: true });
      for (const file of ['manage.mjs', 'supported-source.json'])
        await fs.copyFile(path.join(origin, relative, file), path.join(bundle, relative, file));
      await fs.cp(path.join(origin, relative, 'payload'), path.join(bundle, relative, 'payload'), { recursive: true });
    }
    const metadataFile = path.join(bundle, version, 'supported-source.json');
    const metadata = JSON.parse(await fs.readFile(metadataFile, 'utf8'));
    const originals = new Map();
    for (const relative of Object.keys(metadata.sourceHashes)) {
      let text = `// Synthetic source file ${relative}\n`;
      if (relative === 'package.json') text = JSON.stringify({ name: 'threadshelf', version, type: 'module' }) + '\n';
      if (relative === 'package-lock.json') text = '{}\n';
      if (relative === 'src/routes/index.ts') text = 'const router = {};\nrouter.use(searchRouter);\n';
      const bytes = Buffer.from(text);
      const file = path.join(root, relative);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, bytes);
      originals.set(relative, bytes);
      metadata.sourceHashes[relative] = sha(bytes);
    }
    await fs.writeFile(metadataFile, JSON.stringify(metadata));
    await fs.writeFile(path.join(root, '.env'), 'SYNTHETIC_VALUE=preserve\n');
    await fs.mkdir(path.join(root, '.lancedb'));
    await fs.writeFile(path.join(root, '.lancedb', 'sentinel'), 'synthetic database sentinel');
    const run = (...args) => spawnSync(process.execPath, [path.join(bundle, 'manage.mjs'), ...args], { encoding: 'utf8' });
    const command = (...args) => run(args[0], root, ...args.slice(1));
    const pass = (...args) => {
      const result = command(...args);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      return result;
    };
    const fail = (pattern, ...args) => {
      const result = command(...args);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, pattern);
      return result;
    };
    const unchanged = async () => {
      for (const [relative, bytes] of originals)
        assert.deepEqual(await fs.readFile(path.join(root, relative)), bytes);
    };
    await fn({ temp, root, bundle, metadata, originals, run, command, pass, fail, unchanged });
    assert.equal(await fs.readFile(path.join(root, '.env'), 'utf8'), 'SYNTHETIC_VALUE=preserve\n');
    assert.equal(await fs.readFile(path.join(root, '.lancedb', 'sentinel'), 'utf8'), 'synthetic database sentinel');
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

for (const version of ['1.3.0', '1.4.1']) {
  test(`dispatches ${version} to its real target manager for preflight, install, repeat and rollback`, () => fixture(version, async f => {
    const before = await fs.readdir(f.root);
    const check = f.pass('check');
    assert.ok(check.stdout.includes(`ThreadShelf ${version} matches commit ${f.metadata.upstream.commit}`));
    f.pass('install', '--dry-run');
    await f.unchanged();
    assert.deepEqual(await fs.readdir(f.root), before);

    f.pass('install');
    const installed = await fs.readFile(path.join(f.root, 'src/store.ts'));
    assert.match(installed.toString(), /readerSearchCollectionSnapshot/);
    const manifest = JSON.parse(await fs.readFile(path.join(f.root, backup, 'manifest.json')));
    assert.equal(manifest.patchVersion, version === '1.3.0' ? '1.0.0' : '1.1.0');
    assert.equal(manifest.upstreamCommit, f.metadata.upstream.commit);
    f.pass('install');
    f.pass('check');
    assert.deepEqual(await fs.readFile(path.join(f.root, 'src/store.ts')), installed);
    f.pass('uninstall');
    await f.unchanged();
    await assert.rejects(fs.stat(path.join(f.root, 'src/routes/reader-search.ts')), { code: 'ENOENT' });
    await assert.rejects(fs.stat(path.join(f.root, backup)), { code: 'ENOENT' });
  }));
}

test('refuses unknown upstream versions before invoking a target', () => fixture('1.4.1', async f => {
  await fs.writeFile(path.join(f.root, 'package.json'), '{"name":"threadshelf","version":"1.4.2"}');
  f.fail(/Unsupported server/, 'install');
  assert.deepEqual(await fs.readFile(path.join(f.root, 'src/store.ts')), f.originals.get('src/store.ts'));
  await assert.rejects(fs.stat(path.join(f.root, backup)), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(f.root, '.threadshelf-local-suite-patch.lock')), { code: 'ENOENT' });
}));

test('refuses Enhanced even when its version number matches upstream', () => fixture('1.4.1', async f => {
  await fs.writeFile(path.join(f.root, 'package.json'), '{"name":"threadshelf-enhanced","version":"1.4.1"}');
  f.fail(/Do not apply this patch to ThreadShelf Enhanced/, 'install');
  assert.deepEqual(await fs.readFile(path.join(f.root, 'src/store.ts')), f.originals.get('src/store.ts'));
  await assert.rejects(fs.stat(path.join(f.root, backup)), { code: 'ENOENT' });
}));

test('malformed package metadata fails without writing a backup', () => fixture('1.4.1', async f => {
  await fs.writeFile(path.join(f.root, 'package.json'), '{');
  assert.notEqual(f.command('install').status, 0);
  await assert.rejects(fs.stat(path.join(f.root, backup)), { code: 'ENOENT' });
}));

test('a symlinked package is refused before dispatch', { skip: process.platform === 'win32' }, () => fixture('1.4.1', async f => {
  const outside = path.join(f.temp, 'package-outside.json');
  await fs.rename(path.join(f.root, 'package.json'), outside);
  await fs.symlink(outside, path.join(f.root, 'package.json'));
  f.fail(/ordinary file/, 'install');
  assert.deepEqual(await fs.readFile(outside), f.originals.get('package.json'));
  await assert.rejects(fs.stat(path.join(f.root, backup)), { code: 'ENOENT' });
}));

test('a substituted target directory is refused', () => fixture('1.4.1', async f => {
  const target = path.join(f.bundle, '1.4.1');
  const outside = path.join(f.temp, 'outside-target');
  await fs.rename(target, outside);
  await fs.symlink(outside, target, 'junction');
  f.fail(/ordinary directory/, 'install');
  await f.unchanged();
}));

test('the selected target preserves its integrity failures and exit code', () => fixture('1.4.1', async f => {
  await fs.appendFile(path.join(f.root, 'src/server.ts'), '// synthetic later change\n');
  f.fail(/Unsupported or locally modified source: src\/server\.ts/, 'install');
  await assert.rejects(fs.stat(path.join(f.root, backup)), { code: 'ENOENT' });
}));

test('help and version require no server, and invalid arguments do not run a target', () => fixture('1.4.1', async f => {
  assert.equal(f.run('--help').status, 0);
  assert.equal(f.run('--version').stdout.trim(), '1.1.0');
  assert.notEqual(f.run('install', f.root, '--force').status, 0);
  assert.notEqual(f.run('uninstall', f.root, '--dry-run').status, 0);
  assert.notEqual(f.run('check', f.root, 'extra').status, 0);
  assert.notEqual(f.run('install', f.root, '--dry-run', '', 'unexpected').status, 0);
  assert.notEqual(f.run('install', f.root, '').status, 0);
  await f.unchanged();
}));
