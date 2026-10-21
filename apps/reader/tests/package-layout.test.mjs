import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  walkPackageFiles, verifyNativeSymlinks, assertNoLauncherScripts,
  LINUX_PORTABLE_LINKS, LINUX_DEB_LINKS
} from '../scripts/package-layout.mjs';

const linuxOnly = { skip: process.platform !== 'linux' };
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-package-layout-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
async function native(root, relative) {
  const full = path.join(root, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0, 0, 0]), { mode: 0o755 });
  return full;
}
async function links(root, contract) {
  for (const [relative, target] of Object.entries(contract)) {
    await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await fs.symlink(target, path.join(root, relative));
  }
}

test('portable root and bin entries are direct relative symlinks and remain valid after moving the full package', linuxOnly, async t => {
  const base = await fixture(t), root = path.join(base, 'original');
  await native(root, 'app/threadshelf-local-reader');
  await links(root, LINUX_PORTABLE_LINKS);
  await verifyNativeSymlinks(root, LINUX_PORTABLE_LINKS);
  assert.deepEqual(await walkPackageFiles(root, { symlinks: LINUX_PORTABLE_LINKS }), ['app/threadshelf-local-reader', 'bin/threadshelf-local-reader', 'threadshelf-local-reader']);
  const moved = path.join(base, 'moved package with spaces');
  await fs.rename(root, moved);
  await verifyNativeSymlinks(moved, LINUX_PORTABLE_LINKS);
  assert.equal(await fs.readlink(path.join(moved, 'threadshelf-local-reader')), 'app/threadshelf-local-reader');
  assert.equal(await fs.readlink(path.join(moved, 'bin/threadshelf-local-reader')), '../app/threadshelf-local-reader');
  assert.equal(await fs.realpath(path.join(moved, 'bin/threadshelf-local-reader')), path.join(moved, 'app/threadshelf-local-reader'));
  await assertNoLauncherScripts(moved, path.join(moved, 'bin'), path.join(moved, 'app'));
});

test('DEB command resolves to the native /opt payload without a shell wrapper', linuxOnly, async t => {
  const root = await fixture(t);
  await native(root, 'opt/threadshelf-local-reader/threadshelf-local-reader');
  await links(root, LINUX_DEB_LINKS);
  await verifyNativeSymlinks(root, LINUX_DEB_LINKS);
  await assertNoLauncherScripts(path.join(root, 'usr/bin'), path.join(root, 'opt/threadshelf-local-reader'));
});

test('archive walks reject symlinks by default and reject unlisted or retargeted links', linuxOnly, async t => {
  const root = await fixture(t);
  await native(root, 'app/threadshelf-local-reader');
  await links(root, LINUX_PORTABLE_LINKS);
  await assert.rejects(walkPackageFiles(root), /Unexpected symbolic link/);
  await assert.rejects(walkPackageFiles(root, { symlinks: { ...LINUX_PORTABLE_LINKS, 'threadshelf-local-reader': 'app/wrong' } }), /Unexpected symbolic link target/);
  await fs.symlink('app/threadshelf-local-reader', path.join(root, 'extra'));
  await assert.rejects(walkPackageFiles(root, { symlinks: LINUX_PORTABLE_LINKS }), /Unexpected symbolic link/);
});

test('portable bin entry is mandatory, cannot chain through the root entry, and cannot contain a launcher', linuxOnly, async t => {
  const root = await fixture(t), entry = path.join(root, 'bin/threadshelf-local-reader');
  await native(root, 'app/threadshelf-local-reader');
  await links(root, LINUX_PORTABLE_LINKS);
  await fs.rm(entry);
  await assert.rejects(verifyNativeSymlinks(root, LINUX_PORTABLE_LINKS), { code: 'ENOENT' });
  await fs.symlink('../threadshelf-local-reader', entry);
  await assert.rejects(verifyNativeSymlinks(root, LINUX_PORTABLE_LINKS), /expected relative symbolic link/);
  await fs.rm(entry);
  await fs.writeFile(entry, '#!/bin/sh\nexec ../app/threadshelf-local-reader "$@"\n', { mode: 0o755 });
  await assert.rejects(verifyNativeSymlinks(root, LINUX_PORTABLE_LINKS), /expected relative symbolic link/);
  await assert.rejects(assertNoLauncherScripts(path.join(root, 'bin')), /Script entry point/);
});

test('archive walks never traverse a symlink to a directory', linuxOnly, async t => {
  const root = await fixture(t);
  await native(root, 'app/threadshelf-local-reader');
  await fs.symlink('app', path.join(root, 'other'));
  await assert.rejects(walkPackageFiles(root), /Unexpected symbolic link/);
  assert.deepEqual(await walkPackageFiles(root, { symlinks: { other: 'app' } }), ['app/threadshelf-local-reader', 'other']);
});

test('dependency-copy file-link dereferencing stays explicit and does not allow directory links', linuxOnly, async t => {
  const root = await fixture(t);
  await native(root, 'tool');
  await fs.symlink('tool', path.join(root, 'npm-tool'));
  assert.deepEqual(await walkPackageFiles(root, { dereferenceFileLinks: true }), ['npm-tool', 'tool']);
  await fs.mkdir(path.join(root, 'nested'));
  await fs.symlink('nested', path.join(root, 'linked-directory'));
  await assert.rejects(walkPackageFiles(root, { dereferenceFileLinks: true }), /Unexpected symbolic link/);
});

test('entry checks reject regular wrappers, dangling links and non-executable payloads', linuxOnly, async t => {
  const root = await fixture(t), entry = path.join(root, 'threadshelf-local-reader');
  const executable = await native(root, 'app/threadshelf-local-reader');
  await fs.writeFile(entry, '#!/bin/sh\nexec ./app/threadshelf-local-reader "$@"\n', { mode: 0o755 });
  await assert.rejects(verifyNativeSymlinks(root, LINUX_PORTABLE_LINKS), /expected relative symbolic link/);
  await fs.rm(entry);
  await links(root, LINUX_PORTABLE_LINKS);
  await fs.chmod(executable, 0o644);
  await assert.rejects(verifyNativeSymlinks(root, LINUX_PORTABLE_LINKS), /native executable/);
  await fs.rm(executable);
  await assert.rejects(verifyNativeSymlinks(root, LINUX_PORTABLE_LINKS), { code: 'ENOENT' });
});

test('entry checks reject script payloads, absolute links and links escaping the package', linuxOnly, async t => {
  const base = await fixture(t), root = path.join(base, 'package');
  const executable = await native(root, 'app/threadshelf-local-reader');
  await links(root, LINUX_PORTABLE_LINKS);
  await fs.writeFile(executable, '#!/bin/sh\necho not-native\n');
  await assert.rejects(verifyNativeSymlinks(root, LINUX_PORTABLE_LINKS), /not an ELF/);
  const entry = path.join(root, 'threadshelf-local-reader');
  await fs.rm(entry);
  await fs.symlink(executable, entry);
  await assert.rejects(verifyNativeSymlinks(root, { 'threadshelf-local-reader': executable }), /relative symbolic link/);
  await fs.rm(entry);
  await native(base, 'outside');
  await fs.symlink('../outside', entry);
  await assert.rejects(verifyNativeSymlinks(root, { 'threadshelf-local-reader': '../outside' }), /escapes its package/);
});

test('entry checks require a regular native target, not another symlink', linuxOnly, async t => {
  const root = await fixture(t);
  await native(root, 'app/real-executable');
  await fs.symlink('real-executable', path.join(root, 'app/threadshelf-local-reader'));
  await links(root, LINUX_PORTABLE_LINKS);
  await assert.rejects(verifyNativeSymlinks(root, LINUX_PORTABLE_LINKS), /native executable/);
});

test('entry-directory guards reject script extensions and extensionless shebang launchers', async t => {
  const root = await fixture(t);
  await native(root, 'threadshelf-local-reader');
  await fs.writeFile(path.join(root, 'README.md'), '# ThreadShelf\n');
  await assertNoLauncherScripts(root);
  for (const name of ['start.sh', 'launch.cmd', 'run.bat', 'start.ps1', 'launch.py', 'start.js']) {
    await fs.writeFile(path.join(root, name), 'launcher');
    await assert.rejects(assertNoLauncherScripts(root), /Launcher scripts/);
    await fs.rm(path.join(root, name));
  }
  await fs.writeFile(path.join(root, 'start'), '#!/bin/sh\nexec ./threadshelf-local-reader\n');
  await assert.rejects(assertNoLauncherScripts(root), /Script entry point/);
});
