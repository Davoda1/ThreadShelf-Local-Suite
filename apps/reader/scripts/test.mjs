#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const tests = (await readdir(path.join(root, 'tests')))
  .filter(name => name.endsWith('.test.mjs') && !/(?:browser|electron|ui)[.-]test\.mjs$/.test(name))
  .sort().map(name => path.join('tests', name));
if (!tests.length) throw new Error('No unit or integration tests found in tests/*.test.mjs.');
const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...tests], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
