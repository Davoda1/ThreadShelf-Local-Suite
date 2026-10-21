#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { releaseFilename } from './release-filenames.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const version = JSON.parse(await fsp.readFile(path.join(root, 'package.json'))).version;
const stem = `ThreadShelf-Local-Reader-${version}`;
const out = path.resolve(process.argv[2] || path.join(root, 'release'));
const names = [
  `${stem}-Windows-x64-Portable.zip`, `${stem}-Linux-amd64.tar.gz`,
  `threadshelf-local-reader_${version}_amd64.deb`
].map(releaseFilename);
const hashes = [];
for (const name of names) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(path.join(out, name))) hash.update(chunk);
  hashes.push(`${hash.digest('hex')}  ${name}`);
}
const checksumName = releaseFilename(`${stem}-CHECKSUMS.txt`);
await fsp.writeFile(path.join(out, checksumName), hashes.join('\n') + '\n');
console.log(`${checksumName} covers all ${names.length} other deliverables.`);
