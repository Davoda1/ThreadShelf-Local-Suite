#!/usr/bin/env node
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, 'public'), dist, { recursive: true });
const startupResult = await build({
  absWorkingDir: root, entryPoints: ['src/ui/startup.js'], outfile: 'dist/startup.js',
  bundle: true, format: 'iife', target: 'chrome144', minify: true, metafile: true, legalComments: 'none', logLevel: 'silent'
});
const result = await build({
  absWorkingDir: root, entryPoints: ['src/ui/app.js'], outdir: 'dist',
  entryNames: 'app', chunkNames: 'chunks/[name]-[hash]', assetNames: 'assets/[name]-[hash]',
  bundle: true, format: 'esm', splitting: true, target: 'chrome144',
  sourcemap: false, minify: false, metafile: true,
  loader: { '.woff': 'file', '.woff2': 'file', '.ttf': 'file', '.svg': 'file', '.png': 'file' },
  logLevel: 'info', legalComments: 'linked'
});
let html = await readFile(path.join(root, 'index.html'), 'utf8');
html = html.replace(/(?:\.\/|\/)src\/ui\/app\.js/g, './app.js');
html = html.replace(/(?:\.\/|\/)src\/ui\/startup\.js/g, './startup.js');
html = html.replace(/<link\b[^>]*href=["'](?:\.\/|\/)?src\/ui\/style\.css["'][^>]*>/g, '');
if (result.metafile.outputs['dist/app.css'] && !html.includes('href="./app.css"')) {
  html = html.replace('</head>', '  <link rel="stylesheet" href="./app.css">\n</head>');
}
await writeFile(path.join(dist, 'index.html'), html);
await writeFile(path.join(dist, 'build-meta.json'), JSON.stringify({
  version: JSON.parse(await readFile(path.join(root, 'package.json'))).version,
  node: process.version, outputs: [...Object.keys(startupResult.metafile.outputs), ...Object.keys(result.metafile.outputs)]
}, null, 2));
console.log('Desktop renderer built in dist/.');
