// Copyright (c) 2026 davoda1. MIT.
// Runs the route/database tests against copied code and isolated synthetic data.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = process.argv[2];
if (!target || process.argv.length !== 3) throw new Error('Usage: node tests/run-native.mjs <patched-ThreadShelf-source-checkout>');
const root = await fs.realpath(path.resolve(target));
const preflight = spawnSync(process.execPath, [path.join(here, '..', 'manage.mjs'), 'check', root], { stdio: 'inherit' });
if (preflight.status !== 0) process.exit(preflight.status ?? 1);
const require = createRequire(path.join(root, 'package.json'));
const tsx = pathToFileURL(require.resolve('tsx')).href;
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'suite-native-search-'));
try {
  await fs.cp(path.join(root, 'src'), path.join(temp, 'src'), { recursive: true });
  await fs.copyFile(path.join(root, 'package.json'), path.join(temp, 'package.json'));
  await fs.symlink(path.join(root, 'node_modules'), path.join(temp, 'node_modules'), 'junction');
  await fs.mkdir(path.join(temp, 'test'));
  const test = path.join(temp, 'test', 'native-search.test.mjs');
  await fs.copyFile(path.join(here, 'native-search.test.mjs'), test);
  const result = spawnSync(process.execPath, ['--import', tsx, '--test', test], {
    cwd: temp, stdio: 'inherit',
    env: { ...process.env, TMPDIR: temp, THREADSHELF_DATA_DIR: path.join(temp, 'data'), UPLOADS_DIR: path.join(temp, 'uploads') },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { await fs.rm(temp, { recursive: true, force: true }); }
