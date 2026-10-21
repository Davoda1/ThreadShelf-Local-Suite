#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('..', import.meta.url));
const base = path.join(root, 'node_modules', 'electron');
const binary = process.platform === 'win32' ? 'electron.exe' : 'electron';
if (!fs.existsSync(path.join(base, 'dist', binary))) {
  const p = JSON.parse(fs.readFileSync(path.join(base, 'package.json')));
  const installer = p.bin?.['install-electron'] || 'install.js';
  const env = { ...process.env };
  if (env.HTTPS_PROXY || env.HTTP_PROXY || env.https_proxy || env.http_proxy) env.ELECTRON_GET_USE_PROXY ||= '1';
  const result = spawnSync(process.execPath, [path.join(base, installer)], { stdio: 'inherit', cwd: root, env });
  if (result.error) throw result.error;
  if (result.status) process.exit(result.status);
}
if (!fs.existsSync(path.join(base, 'dist', binary))) throw new Error('Electron runtime download did not complete. Check your connection and retry.');
