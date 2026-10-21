#!/usr/bin/env node
/** Optional development qualification; Python + py7zr are not app dependencies. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { encodeBuffer, decodeBuffer, encodeFile, decodeFile } from '../src/core/codec.mjs';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-interop-'));
const rows = Array.from({ length: 12000 }, (_, i) => JSON.stringify({
  id: i, title: `Thread ${i % 113} – árvíz 日本語`, role: i % 2 ? 'assistant' : 'user',
  text: `Item ${i}: Here is a technical conversation with function f${i % 17}(), mathematics x² and preserved literal\nnewlines. ` + 'A different source record '.repeat(i % 19),
  raw: { provider: i % 3 ? 'ChatGPT' : 'Venice', messageId: `message-${i}` },
}) + '\n');
const input = Buffer.from(rows.join(''));
const report = { platform: process.platform, node: process.version, corpus: 'Synthetic 12000-record varied JSON; ratio is not a prediction for user archives.', inputBytes: input.length, sha256: createHash('sha256').update(input).digest('hex'), formats: [] };
try {
  await fs.writeFile(path.join(directory, 'expected.bin'), input);
  for (const profile of ['7z', 'zip6']) {
    let start = performance.now(); const packed = encodeBuffer(input, profile), encodeMs = performance.now() - start;
    start = performance.now(); if (!decodeBuffer(packed, profile, { maxBytes: input.length }).equals(input)) throw new Error('Codec payload mismatch.');
    const decodeMs = performance.now() - start;
    await fs.writeFile(path.join(directory, profile === '7z' ? 'sample.7z' : 'sample.zip'), packed);
    report.formats.push({ profile, packedBytes: packed.length, ratio: packed.length / input.length, encodeMs, decodeMs });
  }
  let longPath = directory;
  for (let i = 0; i < 5; i++) longPath = path.join(longPath, `long-őű-世界-${'a'.repeat(45)}-${i}`);
  await fs.mkdir(longPath, { recursive: true });
  const source = path.join(longPath, 'source.bin'), packed = path.join(longPath, 'codec.7z'), output = path.join(longPath, 'decoded.bin');
  await fs.writeFile(source, input); await encodeFile(source, packed); await decodeFile(packed, output, { maxBytes: input.length });
  if (!(await fs.readFile(output)).equals(input)) throw new Error('Long Unicode path round trip failed.');
  report.longUnicodePathCharacters = source.length; report.longPathPass = true;
  const python = String.raw`import pathlib,py7zr,zipfile,json,stat,sys
root=pathlib.Path(sys.argv[1]); expected=(root/'expected.bin').read_bytes()
with py7zr.SevenZipFile(root/'sample.7z') as z:
 assert z.getnames()==['payload.bin']; z.extractall(root/'independent-7z')
assert (root/'independent-7z'/'payload.bin').read_bytes()==expected
with zipfile.ZipFile(root/'sample.zip') as z:
 assert z.namelist()==['payload.bin']; assert z.read('payload.bin')==expected
 assert stat.S_ISREG(z.getinfo('payload.bin').external_attr>>16)
print(json.dumps({'7z':{'implementation':'py7zr','version':py7zr.__version__,'exactPayload':True},'zip6':{'implementation':'Python zipfile','exactPayload':True,'regularFileMetadata':True}}))
`;
  report.independentReaders = await new Promise((resolve, reject) => {
    const child = spawn(process.env.PYTHON || 'python', ['-c', python, directory]); let stdout = '', stderr = '';
    child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; }); child.on('error', reject);
    child.on('close', code => code ? reject(new Error(stderr)) : resolve(JSON.parse(stdout)));
  });
} finally { await fs.rm(directory, { recursive: true, force: true }); }
if (process.argv[2]) await fs.writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
