#!/usr/bin/env node
// Copyright (c) 2026 davoda1. MIT.
// Dispatch only to separately fingerprinted, bundled upstream source targets.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const VERSION = '1.1.0';
const bundle = path.dirname(fileURLToPath(import.meta.url));
const targets = new Map([
  ['1.3.0', '1.3.0/manage.mjs'],
  ['1.4.1', '1.4.1/manage.mjs'],
]);
const usage = `ThreadShelf search patch bundle ${VERSION}
Usage: node manage.mjs <check|install|uninstall> <ThreadShelf-source-directory>
       node manage.mjs install <ThreadShelf-source-directory> --dry-run

Supported upstream sources: ThreadShelf 1.3.0 and 1.4.1, at the exact
fingerprints in their separate targets. ThreadShelf Enhanced is not a target.
check and install --dry-run are read-only. Stop the server before changing it.
See README.md for supported commits, backup, rollback and restart instructions.`;

async function ordinary(file, directory = false) {
  const stat = await fs.lstat(file);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()))
    throw new Error(`Expected an ordinary ${directory ? 'directory' : 'file'}: ${file}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log(usage);
    return;
  }
  if (args.length === 1 && args[0] === '--version') {
    console.log(VERSION);
    return;
  }
  const [command, target, flag] = args;
  if (args.length < 2 || args.length > 3 ||
      !['check', 'install', 'uninstall'].includes(command) || !target ||
      (args.length === 3 && !(command === 'install' && flag === '--dry-run')))
    throw new Error(usage);

  const root = await fs.realpath(path.resolve(target));
  await ordinary(root, true);
  const packagePath = path.join(root, 'package.json');
  await ordinary(packagePath);
  const pkg = JSON.parse(await fs.readFile(packagePath, 'utf8'));
  const relative = targets.get(pkg.version);
  if (pkg.name !== 'threadshelf' || !relative)
    throw new Error('Unsupported server: only the pinned upstream ThreadShelf 1.3.0 and 1.4.1 source checkouts are supported. Do not apply this patch to ThreadShelf Enhanced. No source files changed.');

  let current = bundle;
  for (const component of relative.split('/').slice(0, -1)) {
    current = path.join(current, component);
    await ordinary(current, true);
  }
  const manager = path.join(bundle, relative);
  await ordinary(manager);
  const result = spawnSync(process.execPath, [manager, command, root, ...(flag ? [flag] : [])], {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Target patcher was interrupted by ${result.signal}. Check the target before restarting the server.`);
  process.exitCode = result.status ?? 1;
}

main().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
