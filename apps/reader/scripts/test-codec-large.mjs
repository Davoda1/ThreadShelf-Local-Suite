#!/usr/bin/env node
/** Opt-in >4 GiB ZIP64 integration check. Needs 4.1 GiB temporary free space. */
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { encodeFile, decodeFile } from '../src/core/codec.mjs';
const size = 4 * 1024 ** 3 + 65;
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-zip64-'));
const report = { size, platform: process.platform, node: process.version, checks: [] };
const hashFile = async file => { const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest('hex'); };
const timed = async (name, fn) => { const start = performance.now(), result = await fn(); report.checks.push({ name, seconds: +((performance.now() - start) / 1000).toFixed(3), result }); console.log(name, result); return result; };
try {
  const source = path.join(directory, 'catalog.sqlite'), packed = path.join(directory, 'snapshot.zip'), output = path.join(directory, 'restored.sqlite');
  const handle = await fs.open(source, 'wx', 0o600);
  try {
    await handle.truncate(size);
    for (const [position, marker] of [[0, 'start-árvíz-世界'], [2 * 1024 ** 3, 'middle'], [size - 32, 'end-4GiB-plus']]) await handle.write(Buffer.from(marker), 0, Buffer.byteLength(marker), position);
  } finally { await handle.close(); }
  const expectedHash = await timed('source SHA256', () => hashFile(source));
  await timed('ZIP6 streaming encode >4GiB', () => encodeFile(source, packed, { profile: 'zip6', maxBytes: size }));
  const python = String.raw`import zipfile,hashlib,json,sys
with zipfile.ZipFile(sys.argv[1]) as z:
 i=z.getinfo('payload.bin'); assert i.file_size==int(sys.argv[2]); assert i.extract_version>=45
 h=hashlib.sha256()
 with z.open(i) as f:
  while True:
   b=f.read(4*1024*1024)
   if not b: break
   h.update(b)
 assert h.hexdigest()==sys.argv[3]
 print(json.dumps({'zip64':True,'expandedBytes':i.file_size,'sha256':h.hexdigest()}))
`;
  await timed('Independent Python ZIP64 metadata, CRC and streamed SHA256', () => new Promise((resolve, reject) => {
    const child = spawn(process.env.PYTHON || 'python', ['-c', python, packed, String(size), expectedHash]);
    let stdout = '', stderr = ''; child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
    child.on('error', reject); child.on('close', code => code ? reject(new Error(stderr)) : resolve(JSON.parse(stdout)));
  }));
  await timed('Streaming decode >4GiB', () => decodeFile(packed, output, { profile: 'zip6', maxBytes: size, expectedBytes: size }));
  const actualHash = await timed('Restored SHA256', () => hashFile(output));
  if (actualHash !== expectedHash) throw new Error('ZIP64 restoration hash mismatch.');
  report.ok = true;
} finally { await fs.rm(directory, { recursive: true, force: true }); }
const reportPath = process.argv[2];
if (reportPath) await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
