#!/usr/bin/env node
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { downloadArtifact, initializeProxy } from '@electron/get';
import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import { selectedElectronVersion, assertSelectedNode } from './runtime-policy.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
assertSelectedNode();
const pkg = JSON.parse(await fsp.readFile(path.join(root, 'package.json'), 'utf8'));
const version = selectedElectronVersion(pkg);
if (!['linux', 'win32'].includes(process.platform)) throw new Error('Automatic runtime setup currently supports GNU/Linux and Windows.');
const binary = process.platform === 'win32' ? 'electron.exe' : 'electron';
const managed = path.join(root, '.tooling', `electron-${version}-${process.platform}-${process.arch}`);
const destination = path.join(managed, 'dist');
const executable = path.join(destination, binary);
const hash = data => createHash('sha256').update(data).digest('hex');
const marker = path.join(managed, 'verified-runtime.json');
let fingerprint;
try { fingerprint = JSON.parse(await fsp.readFile(marker, 'utf8')); } catch { /* first setup */ }
let valid = fingerprint?.version === version && fingerprint?.platform === process.platform && fingerprint?.arch === process.arch;
if (valid) {
  try { valid = fingerprint.executableSha256 === hash(await fsp.readFile(executable)); }
  catch { valid = false; }
}
if (!valid) {
  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy) {
    process.env.ELECTRON_GET_USE_PROXY = '1'; initializeProxy();
  }
  // @electron/get validates the archive against the official release's
  // SHASUMS256.txt, including cache hits; never disable its checksum gate.
  const archive = await downloadArtifact({ version, artifactName: 'electron', platform: process.platform, arch: process.arch,
    cacheRoot: path.join(root, '.tooling', 'electron-downloads') });
  const archiveBytes = await fsp.readFile(archive);
  const temporary = path.join(managed, `extract-${process.pid}`);
  await fsp.rm(temporary, { recursive: true, force: true });
  await fsp.mkdir(temporary, { recursive: true });
  const reader = new ZipReader(new Uint8ArrayReader(archiveBytes), { useWebWorkers: false });
  try {
    for (const entry of await reader.getEntries()) {
      const target = path.resolve(temporary, entry.filename);
      if (!target.startsWith(path.resolve(temporary) + path.sep)) throw new Error('Unsafe Electron archive path.');
      if (entry.directory) { await fsp.mkdir(target, { recursive: true }); continue; }
      const bytes = await entry.getData(new Uint8ArrayWriter(), { checkSignature: true });
      if (bytes.length !== entry.uncompressedSize) throw new Error(`Incomplete Electron archive entry: ${entry.filename}`);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.writeFile(target, bytes, { mode: entry.executable ? 0o755 : 0o644 });
    }
    await fsp.rm(destination, { recursive: true, force: true });
    await fsp.rename(temporary, destination);
  } finally { await reader.close(); await fsp.rm(temporary, { recursive: true, force: true }); }
  fingerprint = { version, platform: process.platform, arch: process.arch, archiveSha256: hash(archiveBytes), executableSha256: hash(await fsp.readFile(executable)) };
  await fsp.writeFile(marker, JSON.stringify(fingerprint, null, 2) + '\n');
}
const actual = spawnSync(executable, ['-p', 'JSON.stringify(process.versions)'], {
  encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 30000
});
if (actual.error) throw actual.error;
if (actual.status !== 0) throw new Error(`Electron runtime validation failed: ${actual.stderr || actual.stdout}`);
const versions = JSON.parse(actual.stdout.trim());
if (versions.electron !== version) throw new Error(`Selected Electron ${version}, but executable reports ${versions.electron}.`);
// Electron's standard npm launcher honors this path during run-script actions.
// Keep the conventional local dist path on that same runtime for test runners
// which launch it directly. A later direct ensure call without a selection
// restores the manifest's exact runtime.
const base = path.join(root, 'node_modules', 'electron');
await fsp.writeFile(path.join(base, 'path.txt'), binary);
const linkedDist = path.join(base, 'dist');
await fsp.rm(linkedDist, { recursive: true, force: true });
if (process.platform === 'win32') await fsp.symlink(destination, linkedDist, 'junction');
else await fsp.symlink(path.relative(base, destination), linkedDist, 'dir');
const selectionFile = path.join(root, '.tooling', 'toolchain.json');
let selection;
try { selection = JSON.parse(await fsp.readFile(selectionFile, 'utf8')); } catch { /* direct exact runtime setup */ }
if (selection?.electron === version && selection?.node === process.version) {
  selection.electronRuntime = { ...fingerprint, node: versions.node, chrome: versions.chrome };
  await fsp.writeFile(selectionFile, JSON.stringify(selection, null, 2) + '\n');
}
console.log(`Verified Electron ${versions.electron}; embedded Node ${versions.node}; Chromium ${versions.chrome}.`);
console.log(`Runtime: ${executable}`);
