import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { RELEASE_REVISION, releaseArtifactNames, releaseFilename } from '../scripts/release-filenames.mjs';

const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url)));

test('current delivery has exactly eight artifacts bearing the application version', () => {
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.ok(Number.isSafeInteger(RELEASE_REVISION) && RELEASE_REVISION >= 0);
  const revision = RELEASE_REVISION;
  assert.deepEqual(releaseArtifactNames(pkg.version), [
    `ThreadShelf-Local-Analytics-${pkg.version}-Windows-x64-Portable${revision ? `-${revision}` : ""}.zip`,
    `ThreadShelf-Local-Analytics-${pkg.version}-Linux-amd64${revision ? `-${revision}` : ""}.tar.gz`,
    `threadshelf-local-analytics_${pkg.version}_amd64${revision ? `-${revision}` : ""}.deb`,
    `ThreadShelf-Local-Analytics-${pkg.version}-Source${revision ? `-${revision}` : ""}.zip`,
    `ThreadShelf-Local-Analytics-${pkg.version}-Source${revision ? `-${revision}` : ""}.tar.gz`,
    `ThreadShelf-Local-Analytics-${pkg.version}-Preview${revision ? `-${revision}` : ""}.html`,
    `ThreadShelf-Local-Analytics-${pkg.version}-Verification${revision ? `-${revision}` : ""}.md`,
    `ThreadShelf-Local-Analytics-${pkg.version}-CHECKSUMS${revision ? `-${revision}` : ""}.txt`
  ]);
});

test('download revisions preserve composite extensions and can address historical unsuffixed files', () => {
  assert.equal(releaseFilename('example.tar.gz'), `example${RELEASE_REVISION ? `-${RELEASE_REVISION}` : ""}.tar.gz`);
  assert.equal(releaseFilename('example'), `example${RELEASE_REVISION ? `-${RELEASE_REVISION}` : ""}`);
  assert.equal(releaseFilename('example.zip'), `example${RELEASE_REVISION ? `-${RELEASE_REVISION}` : ""}.zip`);
  assert.equal(releaseFilename('example.tar.gz', 0), 'example.tar.gz');
  assert.equal(releaseFilename('example.zip', 0), 'example.zip');
  assert.equal(releaseFilename('example.md', null), 'example.md');
  assert.throws(() => releaseFilename('example.zip', -1), /Release revision/);
});

test('checksum tool names only seven current artifacts and leaves historical files untouched', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'analytics-release-names-'));
  try {
    const names = releaseArtifactNames(pkg.version);
    const checksumName = names.pop();
    await Promise.all(names.map(name => fs.writeFile(path.join(directory, name), name)));
    const historical = [
      path.join(directory, 'ThreadShelf-Local-Analytics-1.0.0-CHECKSUMS-3.txt'),
      ...Array.from({ length: RELEASE_REVISION - 1 }, (_, i) => path.join(directory, `ThreadShelf-Local-Analytics-1.0.0-CHECKSUMS-${i + 1}.txt`))
    ];
    await Promise.all(historical.map(file => fs.writeFile(file, 'retained historical manifest')));
    await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../scripts/checksums.mjs', import.meta.url)), directory]);
    const lines = (await fs.readFile(path.join(directory, checksumName), 'utf8')).trim().split('\n');
    assert.equal(lines.length, 7);
    assert.deepEqual(lines.map(line => line.slice(66)), names);
    for (const file of historical) assert.equal(await fs.readFile(file, 'utf8'), 'retained historical manifest');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
