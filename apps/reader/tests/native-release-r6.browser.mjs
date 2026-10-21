#!/usr/bin/env node
// Launch an unmodified Linux TAR/DEB payload from an atomic disposable extraction.
// Usage: environment from actual-server-r6.browser.mjs node this-file.mjs ARCHIVE
// A real ThreadShelf server can be started separately in the same network namespace.
// Set READER_EXPECT_VERSION for later releases; the historical default is 3.2.0.
// Python3 and dpkg-deb (for DEB only) are required. Original archive is read-only.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const archive=path.resolve(process.argv[2]||'');assert.ok(process.argv[2]);
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'ThreadShelf R6 native QA '));
const stage=path.join(temp,'extracting'),ready=path.join(temp,'ready');await fs.mkdir(stage);
const root=fileURLToPath(new URL('..',import.meta.url));
const execute=(command,args,options={})=>new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:'inherit',...options});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`${command} exited ${code}`)));});
const hash=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
try{
 const archiveHash=await hash(archive);
 if(archive.endsWith('.deb'))await execute('python3',['-c',`import sys,tarfile,subprocess,os
process=subprocess.Popen(['dpkg-deb','--fsys-tarfile',sys.argv[1]],stdout=subprocess.PIPE)
with tarfile.open(fileobj=process.stdout,mode='r|') as archive:
 for item in archive:
  archive.extract(item,sys.argv[2],filter='data')
  if item.isfile():os.chmod(os.path.join(sys.argv[2],item.name),item.mode)
assert process.wait()==0
`,archive,stage]);
 else{assert.ok(archive.endsWith('.tar.gz'));await execute('python3',['-c','import sys,tarfile\nwith tarfile.open(sys.argv[1]) as archive:archive.extractall(sys.argv[2],filter="data")',archive,stage]);}
 const relative=archive.endsWith('.deb')?'usr/bin/threadshelf-local-reader':path.join((await fs.readdir(stage))[0],'threadshelf-local-reader');
 const stagedEntry=path.join(stage,relative);assert.ok((await fs.lstat(stagedEntry)).isSymbolicLink());
 const stagedExecutable=await fs.realpath(stagedEntry),nativeHash=await hash(stagedExecutable);
 assert.equal((await fs.readFile(stagedExecutable)).subarray(0,4).toString('hex'),'7f454c46');assert.ok((await fs.stat(stagedExecutable)).mode&0o111);
 if(process.env.READER_EXPECT_NATIVE_SHA256)assert.equal(nativeHash,process.env.READER_EXPECT_NATIVE_SHA256,'Official native runtime hash');
 const descriptor=await fs.open(stagedExecutable,'r');try{await descriptor.sync();}finally{await descriptor.close();}
 await fs.rename(stage,ready);
 const entry=path.join(ready,relative),executable=await fs.realpath(entry),appRoot=path.join(path.dirname(executable),'resources/app');
 assert.equal(await hash(executable),nativeHash);assert.equal(JSON.parse(await fs.readFile(path.join(appRoot,'package.json'),'utf8')).version,process.env.READER_EXPECT_VERSION||'3.2.0');
 console.log(JSON.stringify({nativeExtraction:'verified',archive:path.basename(archive),archiveSHA256:archiveHash,nativeSHA256:nativeHash,symlink:await fs.readlink(entry),atomicTemporaryDirectory:true}));
 await execute(process.execPath,[path.join(root,'tests/actual-server-r6.browser.mjs')],{env:{...process.env,READER_R6_PACKAGED:'1',READER_APP_ROOT:appRoot,READER_ELECTRON:entry,READER_R6_NATIVE_SHA256:nativeHash}});
 assert.equal(await hash(executable),nativeHash);assert.equal(await hash(archive),archiveHash);
 if(process.env.READER_R6_REPORT){
  const reportFile=path.resolve(process.env.READER_R6_REPORT),report=JSON.parse(await fs.readFile(reportFile,'utf8'));
  report.packageValidation={filename:path.basename(archive),archiveSHA256:archiveHash,nativeSHA256:nativeHash,nativeSymlinkTarget:await fs.readlink(entry),nativeMode:(await fs.stat(executable)).mode&0o7777,atomicTemporaryExtraction:true,relocatedPathContainsSpaces:entry.includes(' '),executableAndArchiveBytesUnmodified:true,checksumCheckedBeforeEveryLaunch:true};
  await fs.writeFile(reportFile+'.tmp',JSON.stringify(report,null,2)+'\n');await fs.rename(reportFile+'.tmp',reportFile);
 }
}finally{await fs.rm(temp,{recursive:true,force:true});}
