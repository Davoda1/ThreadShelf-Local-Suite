import fs from 'node:fs/promises';
import path from 'node:path';

export const LINUX_PORTABLE_LINKS = Object.freeze({
  'threadshelf-local-analytics': 'app/threadshelf-local-analytics',
  'bin/threadshelf-local-analytics': '../app/threadshelf-local-analytics'
});
export const LINUX_DEB_LINKS = Object.freeze({
  'usr/bin/threadshelf-local-analytics': '../../opt/threadshelf-local-analytics/threadshelf-local-analytics'
});

// Archive writers are strict by default. Only a caller's exact allow-list can
// include a symbolic link, and its contents are never followed by this walk.
// Dependency copying alone may opt into the existing file-link dereference.
export async function walkPackageFiles(directory, {
  prefix = '', ignoreEntry = () => false, dereferenceFileLinks = false, symlinks = {}
} = {}) {
  const files = [];
  for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (ignoreEntry(directory, entry.name)) continue;
    const relative = path.posix.join(prefix, entry.name), full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkPackageFiles(full, { prefix: relative, ignoreEntry, dereferenceFileLinks, symlinks }));
    } else if (entry.isFile()) {
      files.push(relative);
    } else if (entry.isSymbolicLink() && Object.hasOwn(symlinks, relative)) {
      if (await fs.readlink(full) !== symlinks[relative]) throw new Error(`Unexpected symbolic link target: ${relative}`);
      files.push(relative);
    } else if (entry.isSymbolicLink() && dereferenceFileLinks && (await fs.stat(full)).isFile()) {
      files.push(relative);
    } else {
      throw new Error(`Unexpected symbolic link or special file: ${relative}`);
    }
  }
  return files;
}

export async function verifyNativeSymlinks(directory, links) {
  const root = await fs.realpath(directory);
  for (const [relative, target] of Object.entries(links)) {
    const link = path.join(directory, relative);
    if (!(await fs.lstat(link)).isSymbolicLink() || await fs.readlink(link) !== target || path.isAbsolute(target)) {
      throw new Error(`Package entry point must be the expected relative symbolic link: ${relative}`);
    }
    const resolved = path.resolve(root, path.dirname(relative), target);
    const within = path.relative(root, resolved);
    if (within === '..' || within.startsWith(`..${path.sep}`) || path.isAbsolute(within)) {
      throw new Error(`Package entry point escapes its package: ${relative}`);
    }
    const st = await fs.lstat(resolved);
    if (!st.isFile() || !(st.mode & 0o111) || await fs.realpath(link) !== resolved) {
      throw new Error(`Package entry point must resolve directly to its native executable: ${relative}`);
    }
    const handle = await fs.open(resolved, 'r');
    try {
      const magic = Buffer.alloc(4);
      const { bytesRead } = await handle.read(magic, 0, 4, 0);
      if (bytesRead !== 4 || !magic.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
        throw new Error(`Package entry point is not an ELF executable: ${relative}`);
      }
    } finally { await handle.close(); }
  }
}

// Inspect the user-facing entry directories, not application source or bundled
// npm utilities. Those contain legitimate scripts, but may never launch the app.
export async function assertNoLauncherScripts(...directories) {
  for (const directory of new Set(directories)) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (/\.(?:sh|bash|zsh|ksh|cmd|bat|ps1|vbs|js|mjs|cjs|py)$/i.test(entry.name)) {
        throw new Error(`Launcher scripts are not allowed in package entry directories: ${entry.name}`);
      }
      const handle = await fs.open(path.join(directory, entry.name), 'r');
      try {
        const magic = Buffer.alloc(2);
        const { bytesRead } = await handle.read(magic, 0, 2, 0);
        if (bytesRead === 2 && magic.toString('ascii') === '#!') {
          throw new Error(`Script entry point is not allowed: ${entry.name}`);
        }
      } finally { await handle.close(); }
    }
  }
}
