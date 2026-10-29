import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { verifyNativeEntrypoint } from '../scripts/package-layout.mjs';
const source = fileURLToPath(new URL('../scripts/native-entry.c', import.meta.url));
const linuxOnly = {skip: process.platform !== 'linux'};
const cc = (args) => { const result = spawnSync(process.env.CC || 'cc', args, {encoding:'utf8'}); assert.equal(result.status, 0, result.stderr); };
async function fixture(t) { const root = await fs.mkdtemp(path.join(os.tmpdir(),'native entry útvonal-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root; }
test('static native entry point preserves argv, environment and exit status without a shell', linuxOnly, async t => {
  const root=await fixture(t),target=path.join(root,'target'),entry=path.join(root,'entry'),probe=path.join(root,'probe.c');
  await fs.writeFile(probe,'#include <stdio.h>\n#include <stdlib.h>\nint main(int argc,char **argv){printf("%s|%s|%s",argv[1],argv[2],getenv("TS_ENTRY_TEST"));return argc==3?37:99;}\n');
  cc(['-static',probe,'-o',target]);
  cc(['-static',`-DTHREADSHELF_EXECUTABLE="${target}"`,source,'-o',entry]);
  await verifyNativeEntrypoint(entry);
  const result=spawnSync(entry,['with spaces','$(never executed);*'],{env:{...process.env,TS_ENTRY_TEST:'unchanged'},encoding:'utf8'});
  assert.equal(result.status,37);assert.equal(result.stdout,'with spaces|$(never executed);*|unchanged');
});
test('missing installed payload returns the documented native error status', linuxOnly, async t => {
  const root=await fixture(t),entry=path.join(root,'entry');
  cc(['-static',`-DTHREADSHELF_EXECUTABLE="${path.join(root,'missing')}"`,source,'-o',entry]);
  const result=spawnSync(entry,[],{encoding:'utf8'});assert.equal(result.status,127);assert.match(result.stderr,/Cannot start/);
});
test('native entrypoint policy rejects symlinks and script substitutes', linuxOnly, async t => {
  const root=await fixture(t),link=path.join(root,'link'),script=path.join(root,'script');
  await fs.symlink('/bin/true',link);await assert.rejects(verifyNativeEntrypoint(link),/regular file/);
  await fs.writeFile(script,'#!/bin/sh\nexit 0\n',{mode:0o755});await assert.rejects(verifyNativeEntrypoint(script),/native AMD64 ELF/);
});
