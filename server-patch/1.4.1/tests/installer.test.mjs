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
const changed = ['src/store.ts', 'src/routes/index.ts'];
const added = 'src/routes/reader-search.ts';
async function fixture(fn) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'suite-patch-test-'));
  const bundle = path.join(tmp, 'patch'), root = path.join(tmp, 'server');
  await fs.mkdir(bundle); await fs.mkdir(root);
  try {
    for (const name of ['manage.mjs', 'supported-source.json']) await fs.copyFile(path.join(origin, name), path.join(bundle, name));
    await fs.cp(path.join(origin, 'payload'), path.join(bundle, 'payload'), { recursive: true });
    const metadata = JSON.parse(await fs.readFile(path.join(bundle, 'supported-source.json')));
    const originals = {};
    for (const relative of Object.keys(metadata.sourceHashes)) {
      let body = `// Synthetic upstream fixture: ${relative}\n`;
      if (relative === 'package.json') body = JSON.stringify({ name: 'threadshelf', version: '1.4.1', type: 'module' }) + '\n';
      if (relative === 'package-lock.json') body = '{}\n';
      if (relative === 'src/routes/index.ts') body = 'const router = {};\nrouter.use(searchRouter);\n';
      originals[relative] = Buffer.from(body);
      const dest = path.join(root, relative); await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, body); metadata.sourceHashes[relative] = sha(body);
    }
    await fs.writeFile(path.join(bundle, 'supported-source.json'), JSON.stringify(metadata));
    await fs.mkdir(path.join(root, '.lancedb'));
    await fs.writeFile(path.join(root, '.lancedb', 'sentinel'), 'synthetic database marker');
    await fs.writeFile(path.join(root, '.env'), 'SYNTHETIC_TEST_VALUE=untouched\n');
    const run = (...args) => spawnSync(process.execPath, [path.join(bundle, 'manage.mjs'), ...args], { encoding: 'utf8' });
    const command = (...args) => run(args[0], root, ...args.slice(1));
    const pass = (...args) => { const r = command(...args); assert.equal(r.status, 0, r.stderr || r.stdout); return r; };
    const fail = (pattern, ...args) => { const r = command(...args); assert.notEqual(r.status, 0); assert.match(r.stderr, pattern); return r; };
    const unchanged = async () => { for (const [relative, bytes] of Object.entries(originals)) assert.deepEqual(await fs.readFile(path.join(root, relative)), bytes); };
    await fn({ tmp, root, bundle, originals, metadata, run, command, pass, fail, unchanged });
    assert.equal(await fs.readFile(path.join(root, '.env'), 'utf8'), 'SYNTHETIC_TEST_VALUE=untouched\n');
    assert.equal(await fs.readFile(path.join(root, '.lancedb', 'sentinel'), 'utf8'), 'synthetic database marker');
  } finally { await fs.rm(tmp, { recursive: true, force: true }); }
}

test('check and install --dry-run are read-only', () => fixture(async f => {
  const before = await fs.readdir(f.root); f.pass('check'); f.pass('install', '--dry-run');
  await f.unchanged(); assert.deepEqual(await fs.readdir(f.root), before);
}));
test('install, repeat, check and uninstall preserve exact originals and modes', () => fixture(async f => {
  await fs.chmod(path.join(f.root, changed[0]), 0o640);
  f.pass('install');
  const before = await fs.readFile(path.join(f.root, changed[0]));
  assert.match(before.toString(), /readerSearchCollectionSnapshot/);
  assert.match(await fs.readFile(path.join(f.root, changed[1]), 'utf8'), /router.use\(readerSearchRouter\)/);
  f.pass('install'); f.pass('check');
  assert.deepEqual(await fs.readFile(path.join(f.root, changed[0])), before);
  f.pass('uninstall'); await f.unchanged();
  if (process.platform !== 'win32')
    assert.equal((await fs.stat(path.join(f.root, changed[0]))).mode & 0o777, 0o640);
  await assert.rejects(fs.stat(path.join(f.root, added)), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(f.root, backup)), { code: 'ENOENT' });
}));
test('unknown version is refused before source changes', () => fixture(async f => {
  await fs.writeFile(path.join(f.root, 'package.json'), '{"name":"threadshelf","version":"9.0.0"}');
  f.fail(/pinned ThreadShelf 1.4.1/, 'install');
  assert.deepEqual(await fs.readFile(path.join(f.root, changed[0])), f.originals[changed[0]]);
}));
test('edited upstream dependency is refused', () => fixture(async f => {
  await fs.appendFile(path.join(f.root, 'src/embedding.ts'), '// local edit');
  f.fail(/locally modified source/, 'install');
  await assert.rejects(fs.stat(path.join(f.root, backup)), { code: 'ENOENT' });
}));
test('preexisting added file is preserved and refused', () => fixture(async f => {
  await fs.writeFile(path.join(f.root, added), 'synthetic conflicting file');
  f.fail(/already exists/, 'install'); await f.unchanged();
  assert.equal(await fs.readFile(path.join(f.root, added), 'utf8'), 'synthetic conflicting file');
}));
test('edited installed file blocks both install and uninstall', () => fixture(async f => {
  f.pass('install'); await fs.appendFile(path.join(f.root, added), '\n// later local edit');
  const before = await fs.readFile(path.join(f.root, changed[0]));
  f.fail(/Installed source changed/, 'uninstall'); f.fail(/Installed source changed/, 'install');
  assert.deepEqual(await fs.readFile(path.join(f.root, changed[0])), before);
}));
test('corrupted original backup blocks restoration', () => fixture(async f => {
  f.pass('install'); await fs.appendFile(path.join(f.root, backup, 'store.ts'), 'corruption');
  const before = await fs.readFile(path.join(f.root, changed[0]));
  f.fail(/Backup checksum mismatch/, 'uninstall');
  assert.deepEqual(await fs.readFile(path.join(f.root, changed[0])), before);
}));
test('malformed backup metadata blocks restoration', () => fixture(async f => {
  f.pass('install'); const file = path.join(f.root, backup, 'manifest.json');
  const data = JSON.parse(await fs.readFile(file)); data.addedPath = '../outside';
  await fs.writeFile(file, JSON.stringify(data)); f.fail(/Unrecognized backup/, 'uninstall');
}));
test('additional user files in backup are preserved', () => fixture(async f => {
  f.pass('install'); await fs.writeFile(path.join(f.root, backup, 'extra.txt'), 'keep');
  f.fail(/Unexpected files/, 'uninstall');
  assert.equal(await fs.readFile(path.join(f.root, backup, 'extra.txt'), 'utf8'), 'keep');
}));
test('known partial installation can be safely rolled back', () => fixture(async f => {
  f.pass('install'); await fs.writeFile(path.join(f.root, changed[1]), f.originals[changed[1]]);
  await fs.unlink(path.join(f.root, added)); f.fail(/Incomplete patch/, 'check');
  f.pass('uninstall'); await f.unchanged();
}));
test('source-file symlink is refused', { skip: process.platform === 'win32' }, () => fixture(async f => {
  const outside = path.join(f.tmp, 'outside'); await fs.writeFile(outside, f.originals[changed[0]]);
  await fs.unlink(path.join(f.root, changed[0])); await fs.symlink(outside, path.join(f.root, changed[0]));
  f.fail(/ordinary file/, 'install'); assert.deepEqual(await fs.readFile(outside), f.originals[changed[0]]);
}));
test('parent-directory symlink is refused', () => fixture(async f => {
  const outside = path.join(f.tmp, 'outside-routes');
  await fs.rename(path.join(f.root, 'src/routes'), outside);
  await fs.symlink(outside, path.join(f.root, 'src/routes'), 'junction');
  f.fail(/ordinary directory/, 'install');
}));
test('existing lock prevents concurrent mutation', () => fixture(async f => {
  await fs.mkdir(path.join(f.root, '.threadshelf-local-suite-patch.lock'));
  f.fail(/stale lock exists/, 'install'); await f.unchanged();
}));
test('changed payload is refused before changing target', () => fixture(async f => {
  await fs.appendFile(path.join(f.bundle, 'payload/reader-search.ts'), '// modified');
  f.fail(/payload checksum mismatch/, 'install'); await f.unchanged();
}));
test('uninstall without backup does not touch source', () => fixture(async f => {
  f.fail(/No patch backup/, 'uninstall'); await f.unchanged();
}));
test('help, version and invalid commands have explicit exit status', () => fixture(async f => {
  assert.equal(f.run('--help').status, 0); assert.equal(f.run('--version').stdout.trim(), '1.1.0');
  assert.notEqual(f.run('unsupported', f.root).status, 0); await f.unchanged();
}));

test('an Enhanced package name is refused even with a supported numeric version', () => fixture(async f => {
  await fs.writeFile(path.join(f.root, 'package.json'), '{"name":"threadshelf-enhanced","version":"1.4.1"}');
  f.fail(/pinned ThreadShelf 1.4.1/, 'install');
  assert.deepEqual(await fs.readFile(path.join(f.root, changed[0])), f.originals[changed[0]]);
  await assert.rejects(fs.stat(path.join(f.root, backup)), { code: 'ENOENT' });
}));

test('changed server Host/Origin protection is refused before installation', () => fixture(async f => {
  await fs.appendFile(path.join(f.root, 'src/routes/local-origin.ts'), '// synthetic local edit');
  f.fail(/locally modified source: src\/routes\/local-origin\.ts/, 'install');
  for (const relative of changed)
    assert.deepEqual(await fs.readFile(path.join(f.root, relative)), f.originals[relative]);
  await assert.rejects(fs.stat(path.join(f.root, backup)), { code: 'ENOENT' });
}));

test('omitting a required helper fingerprint is refused', () => fixture(async f => {
  delete f.metadata.sourceHashes['src/routes/local-origin.ts'];
  await fs.writeFile(path.join(f.bundle, 'supported-source.json'), JSON.stringify(f.metadata));
  f.fail(/Incomplete source fingerprint/, 'install');
  await f.unchanged();
}));

test('a different advertised upstream commit is refused', () => fixture(async f => {
  f.metadata.upstream.commit = 'a'.repeat(40);
  await fs.writeFile(path.join(f.bundle, 'supported-source.json'), JSON.stringify(f.metadata));
  f.fail(/Invalid patch compatibility metadata/, 'install');
  await f.unchanged();
}));

test('path traversal in source metadata cannot reach an unrelated file', () => fixture(async f => {
  f.metadata.sourceHashes['src/../.env'] = sha('SYNTHETIC_TEST_VALUE=untouched\n');
  await fs.writeFile(path.join(f.bundle, 'supported-source.json'), JSON.stringify(f.metadata));
  f.fail(/Invalid source fingerprint metadata/, 'install');
  await f.unchanged();
}));

test('unexpected payload entries cannot expand the installation', () => fixture(async f => {
  f.metadata.payloadHashes['payload/unexpected.ts'] = sha('synthetic');
  await fs.writeFile(path.join(f.bundle, 'supported-source.json'), JSON.stringify(f.metadata));
  f.fail(/Invalid patch compatibility metadata/, 'install');
  await f.unchanged();
}));

test('a symlinked package file is refused', { skip: process.platform === 'win32' }, () => fixture(async f => {
  const outside = path.join(f.tmp, 'outside-package.json');
  await fs.writeFile(outside, f.originals['package.json']);
  await fs.unlink(path.join(f.root, 'package.json'));
  await fs.symlink(outside, path.join(f.root, 'package.json'));
  f.fail(/ordinary file/, 'install');
  assert.deepEqual(await fs.readFile(outside), f.originals['package.json']);
}));

test('symlinked payload directories are refused without touching the server', () => fixture(async f => {
  const outside = path.join(f.tmp, 'outside-payload');
  await fs.rename(path.join(f.bundle, 'payload'), outside);
  await fs.symlink(outside, path.join(f.bundle, 'payload'), 'junction');
  f.fail(/ordinary directory/, 'install');
  await f.unchanged();
}));

test('symlinked backup originals cannot be restored or deleted', { skip: process.platform === 'win32' }, () => fixture(async f => {
  f.pass('install');
  const original = path.join(f.root, backup, 'store.ts');
  const outside = path.join(f.tmp, 'outside-backup.ts');
  await fs.rename(original, outside);
  await fs.symlink(outside, original);
  const installed = await fs.readFile(path.join(f.root, changed[0]));
  f.fail(/ordinary file/, 'uninstall');
  assert.deepEqual(await fs.readFile(path.join(f.root, changed[0])), installed);
  assert.deepEqual(await fs.readFile(outside), f.originals[changed[0]]);
}));

test('a changed untouched helper is reported while rollback preserves that later edit', () => fixture(async f => {
  f.pass('install');
  const relative = 'src/services/search.ts';
  const laterEdit = Buffer.concat([f.originals[relative], Buffer.from('// later local edit\n')]);
  await fs.writeFile(path.join(f.root, relative), laterEdit);
  f.fail(/Upstream source changed after installation/, 'check');
  f.fail(/Upstream source changed after installation/, 'install');
  f.pass('uninstall');
  for (const file of changed)
    assert.deepEqual(await fs.readFile(path.join(f.root, file)), f.originals[file]);
  assert.deepEqual(await fs.readFile(path.join(f.root, relative)), laterEdit);
}));

test('dry-run flags cannot accidentally request uninstall or extra arguments', () => fixture(async f => {
  f.fail(/Usage:/, 'uninstall', '--dry-run');
  assert.notEqual(f.run('install', f.root, '--dry-run', 'unexpected').status, 0);
  assert.notEqual(f.run('install', f.root, '--dry-run', '', 'unexpected').status, 0);
  assert.notEqual(f.run('install', f.root, '').status, 0);
  await f.unchanged();
}));
