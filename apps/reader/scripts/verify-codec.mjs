#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../vendor/7zip/', import.meta.url));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'provenance.json'), 'utf8'));
for (const entry of manifest.files) {
  const bytes = await fs.readFile(path.join(root, entry.file));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== entry.bytes || sha256 !== entry.sha256) throw new Error(`Bundled 7-Zip integrity mismatch: ${entry.file}`);
  console.log(`PASS ${entry.file} (${bytes.length} bytes)`);
}
