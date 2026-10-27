#!/usr/bin/env node
// Copyright (c) 2026 davoda1. MIT.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('.', import.meta.url));
const suite = path.resolve(root, '../..');
const checking = process.argv.includes('--check');
assert.equal(process.version, 'v24.22.1', 'Use the pinned Node.js build version.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const versions = { mermaid: '12.2.0', dompurify: '3.4.17', katex: '0.19.1', esbuild: '0.28.2' };
for (const [name, version] of Object.entries(versions)) {
  assert.equal(JSON.parse(await readFile(path.join(root, 'node_modules', name, 'package.json'))).version, version);
}
const result = await build({
  absWorkingDir: root,
  stdin: { contents: "import mermaid from 'mermaid'; globalThis.mermaid = mermaid;", resolveDir: root, sourcefile: 'entry.mjs' },
  bundle: true, format: 'iife', platform: 'browser', target: 'chrome144',
  minify: true, keepNames: true, sourcemap: false, write: false,
  legalComments: 'eof', metafile: true, logLevel: 'silent',
  banner: { js: '/* ThreadShelf offline diagram renderer. Mermaid 12.2.0; DOMPurify 3.4.17; KaTeX 0.19.1. See accompanying Mermaid-BUNDLE-NOTICES.txt. */' },
});
assert.equal(result.outputFiles.length, 1);
const bundle = result.outputFiles[0].contents;
assert.ok(Object.values(result.metafile.outputs).every(output => output.imports.length === 0), 'The bundle must have no external imports.');
const packageRoots = new Set();
for (const name of Object.keys(result.metafile.inputs)) {
  const parts = name.split('/');
  const index = parts.lastIndexOf('node_modules');
  if (index < 0) continue;
  packageRoots.add(parts.slice(0, index + (parts[index + 1].startsWith('@') ? 3 : 2)).join('/'));
}
const packages = [];
const notices = ['ThreadShelf offline Mermaid renderer — third-party notices', '',
  'These original notices apply to components incorporated into mermaid.min.js.',
  'DOMPurify is used under the Apache-2.0 option of the upstream dual license.',
  'Bundle recipe and exact dependency lock: tools/mermaid-bundle/ in the suite source.', ''];
for (const relative of [...packageRoots].sort()) {
  const directory = path.join(root, relative);
  const info = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  const files = (await readdir(directory)).filter(name => /^(?:licen[sc]e|copying|notice|copyright)(?:[._-]|$)/i.test(name)
    && !/\.(?:[cm]?js|ts|json)$/i.test(name)).sort();
  const texts = await Promise.all(files.map(async name => [name, await readFile(path.join(directory, name))]));
  if (!texts.length && info.name === 'fastdom' && info.version === '1.0.12') {
    const readme = await readFile(path.join(directory, 'README.md'), 'utf8');
    const section = readme.slice(readme.indexOf('## License\n'));
    assert.ok(section.includes('Copyright (c) 2016 Wilson Page') && section.includes('THE SOFTWARE IS PROVIDED'));
    texts.push(['README.md#License', Buffer.from(section)]);
  }
  assert.ok(texts.length, `Missing original license for ${info.name}@${info.version}`);
  const licenseFiles = [];
  for (const [name, bytes] of texts) {
    licenseFiles.push({ name, sha256: hash(bytes), bytes: bytes.length });
    notices.push(`=== ${info.name}@${info.version} / ${name} ===`, '', bytes.toString('utf8').trimEnd(), '');
  }
  packages.push({ name: info.name, version: info.version, license: info.license,
    ...(info.name === 'khroma' && !info.license ? { licenseFromText: 'MIT' } : {}), licenseFiles });
}
for (const name of ['mermaid', 'dompurify', 'katex']) {
  const found = packages.filter(item => item.name === name);
  assert.equal(found.length, 1, `Exactly one ${name} implementation must be bundled.`);
  assert.equal(found[0].version, versions[name]);
}
const manifest = {
  formatVersion: 1,
  description: 'Exact dependencies incorporated into the shared offline diagram renderer.',
  toolchain: { node: '24.22.1', npm: '12.2.1', esbuild: versions.esbuild },
  versions,
  bundle: { file: 'mermaid.min.js', bytes: bundle.length, sha256: hash(bundle), externalImports: 0 },
  packageLockSha256: hash(await readFile(path.join(root, 'package-lock.json'))),
  buildRecipeSha256: hash(await readFile(fileURLToPath(import.meta.url))),
  packages,
};
const outputs = [
  ['apps/reader/public/mermaid.min.js', bundle],
  ['apps/alternative/vendor/mermaid.min.js', bundle],
  ...['apps/reader/licenses', 'apps/alternative/vendor/licenses'].flatMap(directory => [
    [directory + '/Mermaid-BUNDLE-NOTICES.txt', Buffer.from(notices.join('\n') + '\n')],
    [directory + '/Mermaid-BUNDLE-MANIFEST.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n')],
  ]),
];
for (const [name, bytes] of outputs) {
  const destination = path.join(suite, name);
  if (checking) assert.deepEqual(Buffer.from(await readFile(destination)), Buffer.from(bytes), `Rebuild differs: ${name}`);
  else await writeFile(destination, bytes);
}
console.log(JSON.stringify({ result: 'PASS', mode: checking ? 'check' : 'build', versions, bundle: manifest.bundle, bundledPackages: packages.length, outputs: outputs.map(([name]) => name) }, null, 2));
