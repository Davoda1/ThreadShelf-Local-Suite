// Copyright (c) 2026 davoda1. MIT.
// Copies the validated patched source and uses only isolated synthetic data.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = process.argv[2];
if (!target || process.argv.length !== 3) {
  throw new Error('Usage: node tests/run-native.mjs <patched-ThreadShelf-1.4.1-source-checkout>');
}
const root = await fs.realpath(path.resolve(target));
const preflight = spawnSync(process.execPath, [path.join(here, '..', 'manage.mjs'), 'check', root], { stdio: 'inherit' });
if (preflight.error) throw preflight.error;
if (preflight.status !== 0) process.exit(preflight.status ?? 1);
try {
  await fs.access(path.join(root, 'src/routes/reader-search.ts'));
  await fs.access(path.join(root, '.threadshelf-local-suite-backup-v1/manifest.json'));
} catch {
  throw new Error('Install the verified 1.4.1 patch before running native tests. A clean source check alone is insufficient.');
}
const require = createRequire(path.join(root, 'package.json'));
const tsx = pathToFileURL(require.resolve('tsx')).href;
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-141-native-'));
try {
  await fs.cp(path.join(root, 'src'), path.join(temp, 'src'), { recursive: true });
  await fs.copyFile(path.join(root, 'package.json'), path.join(temp, 'package.json'));
  await fs.symlink(path.join(root, 'node_modules'), path.join(temp, 'node_modules'), 'junction');
  await fs.mkdir(path.join(temp, 'test'));
  const test = path.join(temp, 'test', 'native-search.test.mjs');
  await fs.copyFile(path.join(here, 'native-search.test.mjs'), test);
  const result = spawnSync(process.execPath, ['--import', tsx, '--test', '--test-concurrency=1', test], {
    cwd: temp,
    stdio: 'inherit',
    env: {
      ...process.env,
      TMPDIR: temp,
      TEMP: temp,
      TMP: temp,
      HOST: '127.0.0.1',
      ALLOWED_HOSTS: '',
      THREADSHELF_DATA_DIR: path.join(temp, 'data'),
      LANCEDB_PATH: path.join(temp, 'data', 'lancedb'),
      UPLOADS_DIR: path.join(temp, 'uploads'),
      COLLECTIONS_PATH: path.join(temp, 'collections.json'),
      GENERATION_CONFIG_PATH: path.join(temp, 'generation.json'),
      MASTER_PROMPTS_PATH: path.join(temp, 'master-prompts.json'),
      OBSIDIAN_CONFIG_PATH: path.join(temp, 'obsidian.json'),
      THREADSHELF_DISABLE_DEFAULT_MODEL_PATHS: '1',
      THREADSHELF_TOOLS_PATH: path.join(temp, 'tools'),
      THREADSHELF_MODELS_PATH: path.join(temp, 'models'),
      THREADSHELF_MODEL_CACHE: path.join(temp, 'model-cache'),
      OPENROUTER_API_KEY: '',
      THREADSHELF_API_KEY: '',
      STRATA_BASE_URL: 'http://127.0.0.1:9',
    },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
