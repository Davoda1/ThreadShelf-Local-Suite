#!/usr/bin/env node
// Copyright (c) 2026 davoda1. MIT.
// Explicit source patching only: this program never reads .env or starts a server.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';

const bundle = path.dirname(fileURLToPath(import.meta.url));
const VERSION = '1.0.0';
const BACKUP = '.threadshelf-local-suite-backup-v1';
const LOCK = '.threadshelf-local-suite-patch.lock';
const CHANGED = ['src/store.ts', 'src/routes/index.ts'];
const ADDED = 'src/routes/reader-search.ts';
const HASH = /^[0-9a-f]{64}$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async file => { try { await fs.lstat(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
const ordinary = async (file, directory = false) => {
  const stat = await fs.lstat(file);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()))
    throw new Error(`Expected an ordinary ${directory ? 'directory' : 'file'}: ${file}`);
  return stat;
};
const safeParents = async (root, relative) => {
  if (path.isAbsolute(relative) || relative.split('/').some(p => !p || p === '.' || p === '..'))
    throw new Error('Invalid relative path in patch metadata.');
  let current = root;
  for (const part of relative.split('/').slice(0, -1)) {
    current = path.join(current, part); await ordinary(current, true);
  }
};
const read = async (root, relative) => {
  await safeParents(root, relative);
  await ordinary(path.join(root, relative));
  return fs.readFile(path.join(root, relative));
};
async function atomicWrite(file, bytes, mode) {
  const temporary = `${file}.suite-${randomBytes(8).toString('hex')}.tmp`;
  try {
    await fs.writeFile(temporary, bytes, { flag: 'wx', mode });
    await fs.chmod(temporary, mode);
    await fs.rename(temporary, file);
  } finally {
    if (await exists(temporary)) await fs.unlink(temporary);
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const usage = `ThreadShelf Local Suite server patch ${VERSION}
Usage: node manage.mjs <check|install|uninstall> <ThreadShelf-source-directory>
       node manage.mjs install <ThreadShelf-source-directory> --dry-run

check       Read-only compatibility/integrity check (also the dry-run).
install     Back up and apply the verified ThreadShelf 1.3.0 source patch.
uninstall   Restore exact original files; recover a partially applied patch.

Stop the target server before install/uninstall. Preserve your existing data
configuration. This tool never reads or modifies .env, databases or settings.
See README.md for the pinned upstream commit, dependencies and restart steps.`;

async function loadBundle() {
  const metadata = JSON.parse(await read(bundle, 'supported-source.json'));
  if (metadata.formatVersion !== 1 || metadata.patchVersion !== VERSION ||
      metadata.upstream?.name !== 'threadshelf' || metadata.upstream?.version !== '1.3.0' ||
      !/^[a-f0-9]{40}$/.test(metadata.upstream?.commit ?? '') ||
      !metadata.sourceHashes || !metadata.payloadHashes)
    throw new Error('Invalid patch compatibility metadata.');
  for (const required of ['package.json', 'package-lock.json', ...CHANGED])
    if (!HASH.test(metadata.sourceHashes[required] ?? '')) throw new Error('Incomplete source fingerprint metadata.');
  for (const [relative, digest] of Object.entries(metadata.sourceHashes)) {
    if (!HASH.test(digest) || (!['package.json', 'package-lock.json'].includes(relative) && !relative.startsWith('src/')) || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..'))
      throw new Error('Invalid source fingerprint metadata.');
  }
  const payload = {};
  for (const relative of ['payload/reader-store.ts.inc', 'payload/reader-search.ts']) {
    payload[relative] = await read(bundle, relative);
    if (!HASH.test(metadata.payloadHashes[relative] ?? '') || hash(payload[relative]) !== metadata.payloadHashes[relative])
      throw new Error(`Patch payload checksum mismatch: ${relative}. No source files changed.`);
  }
  return { metadata, payload };
}
function outputs(originals, payload) {
  const index = originals['src/routes/index.ts'].toString('utf8');
  const anchor = 'router.use(searchRouter);';
  if (index.split(anchor).length !== 2) throw new Error('Ambiguous router insertion point.');
  return {
    'src/store.ts': Buffer.concat([originals['src/store.ts'], payload['payload/reader-store.ts.inc']]),
    'src/routes/index.ts': Buffer.from("import readerSearchRouter from './reader-search.js';\n" + index.replace(anchor, `${anchor}\nrouter.use(readerSearchRouter);`)),
    [ADDED]: payload['payload/reader-search.ts'],
  };
}
async function inspectClean(root, metadata) {
  const pkg = JSON.parse(await read(root, 'package.json'));
  if (pkg.name !== 'threadshelf' || pkg.version !== metadata.upstream.version)
    throw new Error('This patch supports the pinned ThreadShelf 1.3.0 source checkout only. npm/dist-only installations are not source patch targets.');
  const originals = {}, modes = {};
  for (const [relative, digest] of Object.entries(metadata.sourceHashes)) {
    const bytes = await read(root, relative);
    if (hash(bytes) !== digest)
      throw new Error(`Unsupported or locally modified source: ${relative}. No source files changed.`);
    if (CHANGED.includes(relative)) {
      originals[relative] = bytes;
      modes[relative] = (await fs.stat(path.join(root, relative))).mode & 0o777;
    }
  }
  await safeParents(root, ADDED);
  if (await exists(path.join(root, ADDED))) throw new Error(`${ADDED} already exists without this patch's backup. No source files changed.`);
  return { originals, modes };
}
async function inspectBackup(root, metadata, payload) {
  const dir = path.join(root, BACKUP);
  await ordinary(dir, true);
  const allowed = ['manifest.json', ...CHANGED.map(p => path.basename(p))].sort();
  if (!same((await fs.readdir(dir)).sort(), allowed))
    throw new Error('Unexpected files in the patch backup. Preserve them and inspect the backup before continuing.');
  const manifest = JSON.parse(await read(dir, 'manifest.json'));
  if (manifest.formatVersion !== 1 || manifest.patchVersion !== VERSION ||
      manifest.upstreamCommit !== metadata.upstream.commit ||
      !same(manifest.changedPaths, CHANGED) || manifest.addedPath !== ADDED ||
      !manifest.originalHashes || !manifest.installedHashes || !manifest.modes)
    throw new Error('Unrecognized backup manifest. No source files changed.');
  const originals = {};
  for (const relative of CHANGED) {
    const mode = manifest.modes[relative];
    if (!Number.isInteger(mode) || mode < 0 || mode > 0o777) throw new Error('Invalid mode in backup manifest.');
    const bytes = await read(dir, path.basename(relative));
    if (hash(bytes) !== metadata.sourceHashes[relative] || manifest.originalHashes[relative] !== hash(bytes))
      throw new Error(`Backup checksum mismatch: ${relative}. No source files changed.`);
    originals[relative] = bytes;
  }
  const installed = outputs(originals, payload);
  let complete = true;
  for (const [relative, bytes] of Object.entries(installed)) {
    if (manifest.installedHashes[relative] !== hash(bytes)) throw new Error('Backup manifest installed hash mismatch.');
    await safeParents(root, relative);
    if (!(await exists(path.join(root, relative)))) {
      if (relative !== ADDED) throw new Error(`Installed source is missing: ${relative}. Recover manually from the backup.`);
      complete = false; continue;
    }
    const digest = hash(await read(root, relative));
    if (digest === hash(bytes)) continue;
    if (CHANGED.includes(relative) && digest === metadata.sourceHashes[relative]) { complete = false; continue; }
    throw new Error(`Installed source changed since installation: ${relative}. No source files changed; preserve your edits and restore manually.`);
  }
  return { originals, modes: manifest.modes, installed, complete };
}
async function removeBackup(root) {
  const dir = path.join(root, BACKUP);
  for (const name of [...CHANGED.map(p => path.basename(p)), 'manifest.json']) await fs.unlink(path.join(dir, name));
  await fs.rmdir(dir);
}
async function operate(command, root, metadata, payload) {
  if (await exists(path.join(root, BACKUP))) {
    const state = await inspectBackup(root, metadata, payload);
    if (command !== 'uninstall') {
      if (!state.complete) throw new Error('Incomplete patch operation detected. Stop the server and run uninstall to restore the verified original files.');
      for (const [relative, digest] of Object.entries(metadata.sourceHashes)) {
        if (!CHANGED.includes(relative) && hash(await read(root, relative)) !== digest)
          throw new Error(`Upstream source changed after installation: ${relative}. Remove the patch before upgrading ThreadShelf.`);
      }
      console.log('Patch 1.0.0 is already installed; source and backup integrity verified. No files changed.'); return;
    }
    for (const relative of CHANGED) await atomicWrite(path.join(root, relative), state.originals[relative], state.modes[relative]);
    if (await exists(path.join(root, ADDED))) await fs.unlink(path.join(root, ADDED));
    await removeBackup(root);
    console.log('Patch removed. Original source restored byte-for-byte. Rebuild compiled deployments, then restart ThreadShelf.'); return;
  }
  if (command === 'uninstall') throw new Error('No patch backup found. No source files changed.');
  const state = await inspectClean(root, metadata);
  const installed = outputs(state.originals, payload);
  if (command === 'check') {
    console.log(`ThreadShelf 1.3.0 matches commit ${metadata.upstream.commit}. Dry-run passed; no files changed.`); return;
  }
  const dir = path.join(root, BACKUP);
  await fs.mkdir(dir, { mode: 0o700 });
  const manifest = {
    formatVersion: 1, patchVersion: VERSION, upstreamCommit: metadata.upstream.commit,
    changedPaths: CHANGED, addedPath: ADDED, modes: state.modes,
    originalHashes: Object.fromEntries(CHANGED.map(p => [p, hash(state.originals[p])])),
    installedHashes: Object.fromEntries(Object.entries(installed).map(([p, b]) => [p, hash(b)])),
  };
  // All original files are persisted before any source file is changed. If a
  // process is interrupted after this point, uninstall accepts only known old
  // or new hashes, allowing safe recovery without a force-overwrite option.
  try {
    for (const relative of CHANGED) await fs.writeFile(path.join(dir, path.basename(relative)), state.originals[relative], { flag: 'wx', mode: 0o600 });
    await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  } catch (e) {
    throw new Error(`Could not finish the backup; no source files changed. Preserve and inspect ${BACKUP}. ${e.message}`);
  }
  try {
    for (const [relative, bytes] of Object.entries(installed)) await atomicWrite(path.join(root, relative), bytes, state.modes[relative] ?? 0o644);
  } catch (e) {
    // Keep the verified backup for recovery; do not overwrite an unexpected
    // concurrent edit. A later uninstall verifies every old/new state first.
    throw new Error(`Installation was interrupted. Stop the server and run uninstall to recover from ${BACKUP}. ${e.message}`);
  }
  console.log('Installed patch 1.0.0 for ThreadShelf 1.3.0. Restart the source server, or rebuild and restart a compiled deployment.');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { console.log(usage); return; }
  if (args.length === 1 && args[0] === '--version') { console.log(VERSION); return; }
  let [command, target, flag, extra] = args;
  if (!['check', 'install', 'uninstall'].includes(command) || !target || extra ||
      (flag && !(command === 'install' && flag === '--dry-run'))) throw new Error(usage);
  if (flag === '--dry-run') command = 'check';
  const root = await fs.realpath(path.resolve(target)); await ordinary(root, true);
  const { metadata, payload } = await loadBundle();
  if (command === 'check') { await operate(command, root, metadata, payload); return; }
  const lock = path.join(root, LOCK);
  try { await fs.mkdir(lock, { mode: 0o700 }); }
  catch (e) { if (e.code === 'EEXIST') throw new Error(`Another patch operation or its stale lock exists (${LOCK}). See README.md before removing a stale lock.`); throw e; }
  try { await operate(command, root, metadata, payload); }
  finally { await fs.rmdir(lock); }
}
main().catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
