#!/usr/bin/env node
// Load the exact configured test driver before expensive package builds.
// Copyright (c) 2026 davoda1. MIT; see ../LICENSE.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { testModuleSpecifier } from '../apps/reader/tests/esm-module-specifier.mjs';

const nativePath = process.env.THREADSHELF_PLAYWRIGHT_MODULE || fileURLToPath(
  new URL('./mermaid-bundle/node_modules/playwright-core/index.mjs', import.meta.url));
const driver = await import(testModuleSpecifier(nativePath));
assert.equal(typeof driver._electron?.launch, 'function', 'Electron test driver did not load');
assert.equal(typeof driver.chromium?.launch, 'function', 'Chromium test driver did not load');
console.log(`Native browser-driver ESM import passed on ${process.platform}.`);
