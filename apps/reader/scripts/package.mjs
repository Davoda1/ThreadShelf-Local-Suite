#!/usr/bin/env node
// Packages the existing dist/ build. Run npm run build and npm test first.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { ZipReader, ZipWriter, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import { downloadArtifact, initializeProxy } from '@electron/get';
import { releaseFilename } from './release-filenames.mjs';
import { selectedElectronVersion, assertSelectedNode } from './runtime-policy.mjs';
import { createBoundedArchiveSink, writeVerifiedArchive } from './archive-output.mjs';
import { writeVerifiedRuntimeExecutable, verifyRuntimeExecutable } from './runtime-executable.mjs';
import { walkPackageFiles, verifyNativeSymlinks, assertNoLauncherScripts, LINUX_PORTABLE_LINKS, LINUX_DEB_LINKS } from './package-layout.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(await fsp.readFile(path.join(root, 'package.json')));
assertSelectedNode();
const electronVersion = selectedElectronVersion(pkg);
const stem = `ThreadShelf-Local-Reader-${pkg.version}`;
const flags = new Set(process.argv.slice(2));
const value = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? path.resolve(process.argv[i + 1]) : fallback; };
const out = value('--out', path.join(root, 'release'));
const staging = path.join(root, '.packaging');
const runtimeCache = value('--runtime-cache', process.env.TSLR_RUNTIME_CACHE || path.join(staging, 'runtime-cache'));
const all = flags.has('--all') || !['--source', '--linux', '--win32'].some(x => flags.has(x));
const targets = [...(all || flags.has('--linux') ? ['linux'] : []), ...(all || flags.has('--win32') ? ['win32'] : [])];
const hash = data => createHash('sha256').update(data).digest('hex');
const exists = p => fs.existsSync(p);
const run = (cmd, args, options = {}) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', ...options });
  if (r.error) throw r.error;
  if (r.status) throw new Error(`${cmd} exited ${r.status}`);
};
await fsp.mkdir(out, { recursive: true });
await fsp.mkdir(staging, { recursive: true });
const lock = await fsp.readFile(path.join(root, 'package-lock.json'));
const lockHash = hash(lock);

async function verifyBundledCodec() {
  // The source offer and notices travel with the executables in every release.
  // This is a release gate: do not emit a package that can only use ZIP.
  for (const relative of ['vendor/7zip/linux-x64/7zz', 'vendor/7zip/win32-x64/7za.exe',
    'vendor/7zip/7z2603-src.tar.xz', 'vendor/7zip/License.txt', 'vendor/7zip/copying.txt',
    'vendor/7zip/README.md', 'vendor/7zip/provenance.json']) {
    const full = path.join(root, relative);
    if (!exists(full) || !(await fsp.stat(full)).size) throw new Error(`Bundled 7-Zip release input missing: ${relative}`);
  }
  const linux = path.join(root, 'vendor/7zip/linux-x64/7zz');
  if (process.platform !== 'win32' && !((await fsp.stat(linux)).mode & 0o111)) throw new Error('Bundled Linux 7-Zip must be executable.');
}

async function copy(relative, destination) {
  const src = path.join(root, relative);
  if (exists(src)) await fsp.cp(src, path.join(destination, relative), { recursive: true, dereference: true });
}
function isManagedWorkFile(directory, name) {
  if (name === '.rsync-tmp') return true;
  if (!name.startsWith('.')) return false;
  let candidate = name.slice(1), match;
  // A managed copy of a managed copy may carry more than one temporary suffix.
  while ((match = /^(.+)\.[A-Za-z0-9]{6}$/.exec(candidate))) {
    candidate = match[1];
    if (exists(path.join(directory, candidate)) || ['electron', 'electron.exe'].includes(candidate)) return true;
  }
  return false;
}
async function walk(dir, prefix = '', ignoreWorkFiles = false, allowFileLinks = false, symlinks = {}) {
  return walkPackageFiles(dir, {
    prefix,
    ignoreEntry: ignoreWorkFiles ? isManagedWorkFile : undefined,
    dereferenceFileLinks: allowFileLinks,
    symlinks
  });
}
async function zipDirectory(source, destination, prefix, excluded = [], ignoreWorkFiles = false) {
  const output = createBoundedArchiveSink();
  const writer = new ZipWriter(output.writable, { level: 6, useWebWorkers: false });
  const expectedEntries = new Map();
  try {
    for (const relative of (await walk(source, '', ignoreWorkFiles)).filter(name => !excluded.includes(name))) {
      const full = path.join(source, relative);
      const st = await fsp.stat(full);
      const name = prefix ? `${prefix}/${relative}` : relative;
      await writer.add(name, Readable.toWeb(fs.createReadStream(full)), {
        lastModDate: st.mtime, executable: Boolean(st.mode & 0o111), unixMode: st.mode, zip64: false
      });
      expectedEntries.set(name, st.size);
    }
  } finally { await writer.close(); }
  const bytes = output.completeBytes();
  const reader = new ZipReader(new Uint8ArrayReader(bytes), { useWebWorkers: false });
  try {
    const entries = await reader.getEntries();
    if (entries.length !== expectedEntries.size || entries.some(entry => expectedEntries.get(entry.filename) !== entry.uncompressedSize)) {
      throw new Error('Finalized release ZIP has an incomplete central directory or entry.');
    }
  } finally { await reader.close(); }
  const verified = await writeVerifiedArchive(destination, bytes);
  console.log(`Verified complete ZIP output: ${path.basename(destination)} (${expectedEntries.size} entries, ${verified.bytes} bytes${verified.repairedAfterRename ? ', repaired managed rename' : ''}).`);
}
async function tarDirectory(source, destination, prefix, excluded = [], ignoreWorkFiles = false, symlinks = {}) {
  // Archive the explicit file snapshot. Omitting directory records avoids
  // false directory-mtime races on managed/overlay filesystems; file changes
  // remain hard errors from tar. Extractors create parent directories.
  const manifest = path.join(staging, `.tar-files-${prefix}`);
  await fsp.writeFile(manifest, (await walk(source, '', ignoreWorkFiles, false, symlinks)).filter(name => !excluded.includes(name)).map(name => `${prefix}/${name}\0`).join(''));
  try { run('tar', ['--null', '--no-recursion', '-czf', destination, '-C', path.dirname(source), '--files-from', manifest]); }
  finally { await fsp.rm(manifest, { force: true }); }
}
async function extractZip(archive, destination) {
  const reader = new ZipReader(new Uint8ArrayReader(await fsp.readFile(archive)), { useWebWorkers: false });
  try {
    for (const entry of await reader.getEntries()) {
      const target = path.resolve(destination, entry.filename);
      if (!target.startsWith(path.resolve(destination) + path.sep)) throw new Error('Unsafe runtime archive path.');
      if (entry.directory) { await fsp.mkdir(target, { recursive: true }); continue; }
      await fsp.mkdir(path.dirname(target), { recursive: true });
      // Explicitly await complete bytes before writing. In particular, a
      // native executable must never be read while a stream adapter is still
      // flushing a large extracted ZIP entry.
      const bytes = await entry.getData(new Uint8ArrayWriter(), { checkSignature: true });
      if (bytes.length !== entry.uncompressedSize) throw new Error(`Incomplete Electron archive entry: ${entry.filename}`);
      await fsp.writeFile(target, bytes);
      if ((await fsp.stat(target)).size !== entry.uncompressedSize) throw new Error(`Incomplete runtime write: ${entry.filename}`);
      await fsp.chmod(target, entry.executable ? 0o755 : 0o644);
    }
  } finally { await reader.close(); }
}
async function removeManagedWorkFiles(directory) {
  for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory() && isManagedWorkFile(directory, entry.name)) await fsp.rm(target, { recursive: true, force: true });
    else if (entry.isDirectory()) await removeManagedWorkFiles(target);
    else if (isManagedWorkFile(directory, entry.name)) await fsp.rm(target, { force: true });
  }
}
async function verifyCopiedTree(source, destination, excluded = [], allowFileLinks = false) {
  const files = (await walk(source, '', true, allowFileLinks)).filter(name => !excluded.includes(name));
  const intended = new Set(files);
  let bytes = 0, repaired = 0;
  for (const relative of files) {
    const input = path.join(source, relative), output = path.join(destination, relative);
    const data = await fsp.readFile(input), expectedHash = hash(data);
    bytes += data.length;
    const valid = async () => {
      try { const actual = await fsp.readFile(output); return actual.length === data.length && hash(actual) === expectedHash; }
      catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    };
    if (!await valid()) {
      // Explicit complete-buffer writes avoid partial native copy operations
      // observed for large executable files on managed build filesystems.
      await fsp.mkdir(path.dirname(output), { recursive: true });
      const mode = (await fsp.stat(input)).mode & 0o777;
      const handle = await fsp.open(output, 'w', mode);
      try { await handle.writeFile(data); await handle.sync(); }
      finally { await handle.close(); }
      await fsp.chmod(output, mode);
      if (!await valid()) throw new Error(`Copied file integrity failed: ${relative}`);
      repaired++;
    }
  }
  await removeManagedWorkFiles(destination);
  const extras = (await walk(destination, '', true)).filter(name => !intended.has(name));
  if (extras.length) throw new Error(`Unexpected copied files: ${extras.join(', ')}`);
  console.log(`Verified ${files.length} copied runtime files by size and SHA256 (${repaired} complete-buffer writes).`);
  return { files: files.length, bytes };
}
async function getRuntime(platform) {
  const name = `electron-v${electronVersion}-${platform}-x64.zip`;
  const cached = path.join(runtimeCache, name);
  if (exists(cached)) {
    const sums = await fsp.readFile(path.join(runtimeCache, 'SHASUMS256.txt'), 'utf8');
    const line = sums.split(/\r?\n/).find(x => x.trim().split(/\s+/)[1]?.replace(/^\*/, '') === name);
    if (!line || hash(await fsp.readFile(cached)) !== line.split(/\s+/)[0]) throw new Error(`Cached Electron SHA256 mismatch: ${name}`);
    return cached;
  }
  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) { process.env.ELECTRON_GET_USE_PROXY = '1'; initializeProxy(); }
  return downloadArtifact({ version: electronVersion, artifactName: 'electron', platform, arch: 'x64', cacheRoot: runtimeCache });
}
async function prepareDependencies(platform) {
  const location = path.join(staging, `deps-${platform}-x64`);
  const marker = path.join(location, '.lock-hash');
  const valid = exists(marker) && (await fsp.readFile(marker, 'utf8')) === lockHash;
  if (!valid) {
    await fsp.rm(location, { recursive: true, force: true });
    await fsp.mkdir(location, { recursive: true });
    await copy('package.json', location); await copy('package-lock.json', location);
    // CPU ONNX runtimes are already present in the npm package. CUDA is optional
    // and is deliberately not downloaded into this portable desktop release.
    const npmCLI = process.env.npm_execpath || path.join(path.dirname(process.execPath), process.platform === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : '../lib/node_modules/npm/bin/npm-cli.js');
    if (exists(npmCLI)) run(process.execPath, [npmCLI, 'ci', '--omit=dev', '--include=optional', '--ignore-scripts', `--os=${platform}`, '--cpu=x64', '--no-audit', '--no-fund'], { cwd: location });
    else run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--omit=dev', '--include=optional', '--ignore-scripts', `--os=${platform}`, '--cpu=x64', '--no-audit', '--no-fund'], { cwd: location, shell: process.platform === 'win32' });
    const onnxRoot = path.join(location, 'node_modules/onnxruntime-node/bin/napi-v6');
    for (const os of await fsp.readdir(onnxRoot)) {
      if (os !== platform) await fsp.rm(path.join(onnxRoot, os), { recursive: true, force: true });
      else for (const arch of await fsp.readdir(path.join(onnxRoot, os))) if (arch !== 'x64') await fsp.rm(path.join(onnxRoot, os, arch), { recursive: true, force: true });
    }
    const sharpNative = path.join(location, `node_modules/@img/sharp-${platform}-x64/package.json`);
    if (!exists(sharpNative)) throw new Error(`Target sharp native package missing: ${sharpNative}`);
    await fsp.writeFile(marker, lockHash);
  }
  return path.join(location, 'node_modules');
}
async function dependencyReport(modules) {
  const found = [];
  const visit = async directory => {
    for (const e of await fsp.readdir(directory, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const p = path.join(directory, e.name);
      if (e.name.startsWith('@')) { await visit(p); continue; }
      if (exists(path.join(p, 'package.json'))) {
        const m = JSON.parse(await fsp.readFile(path.join(p, 'package.json')));
        found.push({ name: m.name, version: m.version, license: m.license || null, repository: m.repository || null });
      }
      if (exists(path.join(p, 'node_modules'))) await visit(path.join(p, 'node_modules'));
    }
  };
  await visit(modules);
  return found.sort((a, b) => a.name.localeCompare(b.name));
}
async function patchWindowsIcon(exe) {
  const { NtExecutable, NtExecutableResource, Resource, Data } = await import('resedit');
  const executable = NtExecutable.from(await fsp.readFile(exe));
  const resources = NtExecutableResource.from(executable);
  const icon = Data.IconFile.from(await fsp.readFile(path.join(root, 'build/icon.ico')));
  Resource.IconGroupEntry.replaceIconsForResource(resources.entries, 1, 1033, icon.icons.map(x => x.data));
  const info = Resource.VersionInfo.fromEntries(resources.entries)[0] || Resource.VersionInfo.createEmpty();
  info.setFileVersion(...pkg.version.split('.').map(Number), 0, 1033);
  info.setProductVersion(...pkg.version.split('.').map(Number), 0, 1033);
  info.setStringValues({ lang: 1033, codepage: 1200 }, { CompanyName: 'davoda1', FileDescription: pkg.productName, ProductName: pkg.productName, ProductVersion: pkg.version, FileVersion: pkg.version, OriginalFilename: 'ThreadShelf Local Reader.exe', InternalName: pkg.name, LegalCopyright: 'Application: Copyright (c) 2026 davoda1. Electron: Electron contributors; Copyright (c) 2013-2020 GitHub Inc. See LICENSE and THIRD-PARTY-NOTICES.md.' });
  info.outputToResourceEntries(resources.entries);
  resources.outputResource(executable);
  await fsp.writeFile(exe, Buffer.from(executable.generate()));
}
async function binary(platform) {
  const archive = await getRuntime(platform);
  const modules = await prepareDependencies(platform);
  if (flags.has('--prepare')) { console.log(`Prepared ${platform} runtime and locked dependencies.`); return; }
  await verifyBundledCodec();
  if (!exists(path.join(root, 'dist/index.html'))) throw new Error('Run npm run build first.');
  const name = `${stem}-${platform === 'win32' ? 'Windows-x64-Portable' : 'Linux-amd64'}`;
  const folder = path.join(staging, name);
  await fsp.rm(folder, { recursive: true, force: true }); await fsp.mkdir(folder, { recursive: true });
  // Windows launches its EXE directly from the extraction root. Linux exposes
  // relative root and bin/ symlinks directly to the native executable.
  const runtime = platform === 'win32' ? folder : path.join(folder, 'app');
  await fsp.mkdir(runtime, { recursive: true });
  await extractZip(archive, runtime);
  await fsp.rm(path.join(runtime, 'resources/default_app.asar'), { force: true });
  const app = path.join(runtime, 'resources/app'); await fsp.mkdir(app, { recursive: true });
  for (const p of ['package.json', 'src/core', 'src/desktop', 'dist', 'build', 'vendor', 'README.md', 'ARCHITECTURE.md', 'docs/Toolchain.md', 'docs/Code-Highlighting.md', 'docs/Activity.md', 'docs/Search.md', 'docs/Themes.md', 'docs/Holidays.md', 'docs/Storage.md', 'docs/Images-and-Cache.md', 'docs/DATABASE-MANAGER.md', 'docs/Packaging-Policy.md', 'docs/Rich-Rendering.md', 'docs/rich-parser-support.md', 'docs/rich-chart-support.md', 'server-support', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'licenses']) await copy(p, app);
  await fsp.cp(modules, path.join(app, 'node_modules'), { recursive: true, dereference: true });
  // Verify the complete native dependency tree before accepting the binary
  // staging, including dereferenced npm .bin links.
  await verifyCopiedTree(modules, path.join(app, 'node_modules'), [], true);
  await fsp.writeFile(path.join(app, 'licenses/DEPENDENCIES.json'), JSON.stringify(await dependencyReport(modules), null, 2));
  // The runtime keeps Electron's own LICENSE beside its executable. Give the
  // application license a distinct root name and resolve the portable README
  // to that file; the embedded app README keeps its ordinary LICENSE link.
  await fsp.copyFile(path.join(root, 'LICENSE'), path.join(folder, 'APPLICATION-LICENSE'));
  const portableReadme = (await fsp.readFile(path.join(root, 'README.md'), 'utf8'))
    .replaceAll('[LICENSE](LICENSE)', '[application LICENSE](APPLICATION-LICENSE)');
  await fsp.writeFile(path.join(folder, 'README.md'), portableReadme);
  for (const p of ['ARCHITECTURE.md', 'docs/Toolchain.md', 'docs/Code-Highlighting.md', 'docs/Activity.md', 'docs/Search.md', 'docs/Themes.md', 'docs/Holidays.md', 'docs/Storage.md', 'docs/Images-and-Cache.md', 'docs/DATABASE-MANAGER.md', 'docs/Packaging-Policy.md', 'docs/Rich-Rendering.md', 'docs/rich-parser-support.md', 'docs/rich-chart-support.md', 'server-support', 'THIRD-PARTY-NOTICES.md', 'licenses']) await copy(p, folder);
  if (platform === 'win32') {
    const exe = path.join(runtime, 'ThreadShelf Local Reader.exe');
    await fsp.rename(path.join(runtime, 'electron.exe'), exe);
    await fsp.rm(path.join(runtime, 'electron.exe'), { force: true });
    await patchWindowsIcon(exe);
    if (exists(path.join(runtime, 'electron.exe'))) throw new Error('Redundant original Electron executable remains.');
    if ((await fsp.readdir(folder)).some(name => name.toLowerCase().endsWith('.cmd') || name === 'app')) throw new Error('Windows portable layout must not include an app folder or CMD launcher.');
    await assertNoLauncherScripts(folder);
    await fsp.rm(path.join(runtime, 'electron.exe'), { force: true });
    await zipDirectory(folder, path.join(out, releaseFilename(`${name}.zip`)), '', ['electron.exe'], true);
  } else {
    const executable = path.join(runtime, 'threadshelf-local-reader');
    const executableFingerprint = await writeVerifiedRuntimeExecutable(path.join(runtime, 'electron'), executable);
    await fsp.rm(path.join(runtime, 'electron'), { force: true });
    if (exists(path.join(runtime, 'electron'))) throw new Error('Redundant original Electron executable remains.');
    for (const [relative, target] of Object.entries(LINUX_PORTABLE_LINKS)) {
      await fsp.mkdir(path.dirname(path.join(folder, relative)), { recursive: true });
      await fsp.symlink(target, path.join(folder, relative));
    }
    await fsp.rm(path.join(runtime, 'electron'), { force: true });
    await assertNoLauncherScripts(folder, path.join(folder, 'bin'), runtime);
    await verifyNativeSymlinks(folder, LINUX_PORTABLE_LINKS);
    await verifyRuntimeExecutable(executable, executableFingerprint);
    await tarDirectory(folder, path.join(out, releaseFilename(`${name}.tar.gz`)), name, ['app/electron'], true, LINUX_PORTABLE_LINKS);
    await verifyNativeSymlinks(folder, LINUX_PORTABLE_LINKS);
    await verifyRuntimeExecutable(executable, executableFingerprint);
    await deb(runtime);
  }
  await fsp.rm(path.join(runtime, platform === 'win32' ? 'electron.exe' : 'electron'), { force: true });
  console.log(`Packaged ${name}`);
}
async function deb(runtime) {
  if (process.platform !== 'linux') throw new Error('The DEB package requires a Linux build host with dpkg-deb.');
  const dir = path.join(staging, 'deb'); await fsp.rm(dir, { recursive: true, force: true });
  for (const d of ['DEBIAN', 'opt', 'usr/bin', 'usr/share/applications', 'usr/share/icons/hicolor/256x256/apps']) await fsp.mkdir(path.join(dir, d), { recursive: true });
  await fsp.rm(path.join(runtime, 'electron'), { force: true });
  const installedApp = path.join(dir, 'opt/threadshelf-local-reader');
  await fsp.cp(runtime, installedApp, { recursive: true, filter: source => !['electron', 'threadshelf-local-reader'].includes(path.relative(runtime, source)) });
  // Some managed filesystems can retain the source name after a rename.
  // Remove it again at the final package boundary, before the size snapshot.
  await fsp.rm(path.join(dir, 'opt/threadshelf-local-reader/electron'), { force: true });
  await fsp.rm(path.join(runtime, 'electron'), { force: true });
  const executable = path.join(installedApp, 'threadshelf-local-reader');
  const executableFingerprint = await writeVerifiedRuntimeExecutable(path.join(runtime, 'threadshelf-local-reader'), executable);
  const verifiedCopy = await verifyCopiedTree(runtime, installedApp, ['electron']);
  const size = Math.ceil(verifiedCopy.bytes / 1024);
  await fsp.writeFile(path.join(dir, 'DEBIAN/control'), `Package: threadshelf-local-reader\nVersion: ${pkg.version}\nSection: utils\nPriority: optional\nArchitecture: amd64\nMaintainer: davoda1 <noreply@example.invalid>\nInstalled-Size: ${size}\nDepends: libc6 (>= 2.31), libstdc++6, libgcc-s1, libnss3, libnspr4, libgtk-3-0 | libgtk-3-0t64, libatk1.0-0 | libatk1.0-0t64, libatk-bridge2.0-0 | libatk-bridge2.0-0t64, libcups2 | libcups2t64, libdrm2, libxkbcommon0, libxcomposite1, libxdamage1, libxfixes3, libxrandr2, libgbm1, libasound2 | libasound2t64, libatspi2.0-0 | libatspi2.0-0t64, libx11-6, libxcb1, libxext6\nHomepage: ${pkg.homepage}\nDescription: Standalone AI export archive and ThreadShelf desktop reader\n Import, organize, search and read AI conversations locally, or connect\n independently to a ThreadShelf server. Includes its own Electron runtime.\n`);
  await fsp.symlink(LINUX_DEB_LINKS['usr/bin/threadshelf-local-reader'], path.join(dir, 'usr/bin/threadshelf-local-reader'));
  await fsp.writeFile(path.join(dir, 'usr/share/applications/threadshelf-local-reader.desktop'), '[Desktop Entry]\nType=Application\nName=ThreadShelf Local Reader\nComment=Read and search AI conversations\nExec=threadshelf-local-reader\nIcon=threadshelf-local-reader\nTerminal=false\nCategories=Utility;Office;\nStartupWMClass=threadshelf-local-reader\n');
  await fsp.copyFile(path.join(root, 'build/icons/256x256.png'), path.join(dir, 'usr/share/icons/hicolor/256x256/apps/threadshelf-local-reader.png'));
  await fsp.rm(path.join(installedApp, 'electron'), { force: true });
  if (exists(path.join(installedApp, 'electron'))) throw new Error('Redundant original Electron executable in DEB staging.');
  await removeManagedWorkFiles(dir);
  await assertNoLauncherScripts(path.join(dir, 'usr/bin'), installedApp);
  await verifyNativeSymlinks(dir, LINUX_DEB_LINKS);
  // Set the sandbox mode in the same native build shell and validate its
  // archived header before accepting the package. Paths are positional arguments.
  run('bash', [path.join(root, 'scripts/build-deb.sh'), dir, path.join(out, releaseFilename(`threadshelf-local-reader_${pkg.version}_amd64.deb`))]);
  await verifyRuntimeExecutable(executable, executableFingerprint);
}
async function source() {
  await verifyBundledCodec();
  const name = `${stem}-Source`, folder = path.join(staging, name);
  await fsp.rm(folder, { recursive: true, force: true }); await fsp.mkdir(folder, { recursive: true });
  // Explicit allow-list excludes all exports, user state, caches and binaries.
  for (const p of ['package.json', 'package-lock.json', 'index.html', 'src', 'public', 'build', 'vendor', 'scripts', 'tests', 'docs', 'server-support', 'README.md', 'ARCHITECTURE.md', 'CHANGELOG.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'licenses']) await copy(p, folder);
  await removeManagedWorkFiles(folder);
  await zipDirectory(folder, path.join(out, releaseFilename(`${name}.zip`)), name, [], true);
  await tarDirectory(folder, path.join(out, releaseFilename(`${name}.tar.gz`)), name, [], true);
  console.log(`Packaged ${name}`);
}
for (const platform of targets) await binary(platform);
if (!flags.has('--prepare') && (all || flags.has('--source'))) await source();
// Preview, verification and checksums are finalized after release validation.
