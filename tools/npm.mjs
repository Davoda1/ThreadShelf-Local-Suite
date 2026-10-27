#!/usr/bin/env node
// Suite entry point for the verified, private npm toolchain.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../apps/reader/scripts/npm-toolchain.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
try {
  const status = await main(process.argv.slice(2), { cacheRoot: path.join(root, '.tooling', 'npm') });
  if (Number.isInteger(status)) process.exitCode = status;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
