#!/usr/bin/env node
// Private build toolchain. Upstream npm is unchanged except for the complete
// official dependency security updates. Never use or modify an ambient/global npm.
import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const TOOLCHAIN = Object.freeze({
  id: 'npm-12.2.2-security-20261109', npm: '12.2.2', undici: '6.29.1',
  treeSha256: '504d1c0eaa0621f2e644739ed26e2d7ce73b6bcd32b9a38788d0b58bbd2c740b',
  files: 2101,
});
export const ARCHIVES = Object.freeze({
  npm: Object.freeze({"name":"npm-12.2.2.tgz","package":"npm","version":"12.2.2","url":"https://registry.npmjs.org/npm/-/npm-12.2.2.tgz","integrity":"sha512-KglgbZyacf7jH+FHuNRqVuCzQi8VhI2a7J87Ix43FsPTuZoGWmIXXGdZtBUOA79vwL+IJREqURVzupA7PsQTcA=="}),
  undici: Object.freeze({"name":"undici-6.29.1.tgz","package":"undici","version":"6.29.1","url":"https://registry.npmjs.org/undici/-/undici-6.29.1.tgz","integrity":"sha512-EvRlUt/QqAEvXdQeRMYUfwOQsfzpDztykrG2owGEE/rBOBoYv9uF39ZzsNDh4lTFHhTr2XOZjKkYgueD12ZmGA=="}),
  glob: Object.freeze({"name":"glob-14.0.3.tgz","package":"glob","version":"14.0.3","url":"https://registry.npmjs.org/glob/-/glob-14.0.3.tgz","integrity":"sha512-A1vjIwC3qpdCso45Iw127gnp7sPhqgY8lUQhDrArIs+GbmfaaVPFuoyy7WyLT9EPZCRZ7j7aLdwUhQmHWesEow=="}),
  minimatch: Object.freeze({"name":"minimatch-11.0.2.tgz","package":"minimatch","version":"11.0.2","url":"https://registry.npmjs.org/minimatch/-/minimatch-11.0.2.tgz","integrity":"sha512-pWTgz5CN3tjqyZNSK2tePlSmu9IwM41q8yn8Usdqqwe9TIHh+9dEpLLjF4uApsfPEAZY71qtSiA2B2APEr+1Yw=="}),
  pathScurry: Object.freeze({"name":"path-scurry-3.0.0.tgz","package":"path-scurry","version":"3.0.0","url":"https://registry.npmjs.org/path-scurry/-/path-scurry-3.0.0.tgz","integrity":"sha512-1pTbQqH1wIwMi/eleQ5leFTTCkzFsPcgXNjwOA8YGGW/W4/kHT3dssE7Z6NH+zuqNLOzOB0uaD61yl7cAcVhgg=="}),
  matcher: Object.freeze({"name":"nonrecursive-glob-match-1.1.0.tgz","package":"@isaacs/nonrecursive-glob-match","version":"1.1.0","url":"https://registry.npmjs.org/@isaacs/nonrecursive-glob-match/-/nonrecursive-glob-match-1.1.0.tgz","integrity":"sha512-GPm/Dbvk5RLmhRnxXIa7nTpK0xtl4E0wj0MslsuNiJ1FIROU+2+9lgUC/dgF7Ey4QCWhfEsgxilMRMCdHPfDfw=="}),
});
const self = fileURLToPath(import.meta.url);
const defaultCache = path.resolve(path.dirname(self), '..', '.tooling', 'npm');
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
async function exists(file) { try { await fs.lstat(file); return true; } catch(e) { if(e.code==='ENOENT')return false; throw e; } }

export function verifyIntegrity(bytes, integrity) {
  if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity)) throw new Error('Unsupported toolchain integrity format.');
  const expected = Buffer.from(integrity.slice(7), 'base64');
  const actual = createHash('sha512').update(bytes).digest();
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('npm toolchain archive integrity mismatch.');
}

async function filesIn(root, prefix = '') {
  const result = [];
  for (const entry of await fs.readdir(path.join(root, prefix), {withFileTypes:true})) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const stat = await fs.lstat(path.join(root, relative));
    if (stat.isSymbolicLink()) throw new Error(`Symlink in npm toolchain: ${relative}`);
    if (stat.isDirectory()) result.push(...await filesIn(root, relative));
    else if (stat.isFile()) result.push(relative);
    else throw new Error(`Unsupported npm toolchain file: ${relative}`);
  }
  return result;
}

export async function treeFingerprint(root) {
  const files = (await filesIn(root)).sort();
  const hash = createHash('sha256');
  for (const name of files) {
    const bytes = await fs.readFile(path.join(root, name));
    hash.update(`${name}\0${bytes.length}\0${createHash('sha256').update(bytes).digest('hex')}\n`);
  }
  return {files:files.length, sha256:hash.digest('hex')};
}

export async function verifyNpm(cli) {
  if (!path.isAbsolute(cli) || path.basename(cli) !== 'npm-cli.js' || path.basename(path.dirname(cli)) !== 'bin') throw new Error('Expected an absolute managed npm CLI path.');
  const root = path.dirname(path.dirname(cli));
  if ((await fs.lstat(root)).isSymbolicLink()) throw new Error('Managed npm root must not be a symlink.');
  const pkg = await json(path.join(root, 'package.json'));
  if (pkg.name !== 'npm' || pkg.version !== TOOLCHAIN.npm) throw new Error(`Expected managed npm ${TOOLCHAIN.npm}.`);
  const consumer = path.join(root, 'node_modules/node-gyp/package.json');
  const nodeGyp = await json(consumer);
  if (nodeGyp.version !== '13.0.0' || nodeGyp.dependencies?.undici !== '^6.25.0') throw new Error('Unexpected npm Undici consumer contract.');
  const resolved = createRequire(consumer).resolve('undici/package.json');
  if (resolved !== path.join(root, 'node_modules/undici/package.json')) throw new Error('npm resolves an unexpected Undici copy.');
  const undici = await json(resolved);
  if (undici.name !== 'undici' || undici.version !== TOOLCHAIN.undici) throw new Error(`npm must resolve patched Undici ${TOOLCHAIN.undici}; found ${undici.version}.`);
  for (const archive of Object.values(ARCHIVES).filter(item => item.package !== 'npm')) {
    const dependency = await json(path.join(root, 'node_modules', archive.package, 'package.json'));
    if (dependency.name !== archive.package || dependency.version !== archive.version) throw new Error(`Managed npm dependency mismatch: ${archive.package}.`);
  }
  const fingerprint = await treeFingerprint(root);
  if (fingerprint.files !== TOOLCHAIN.files || fingerprint.sha256 !== TOOLCHAIN.treeSha256) throw new Error('Managed npm file integrity mismatch. Remove the private toolchain cache and prepare it again.');
  return {id:TOOLCHAIN.id, npm:pkg.version, undici:undici.version, root, cli,
    bin:path.join(path.dirname(root),'bin'), treeSha256:fingerprint.sha256, files:fingerprint.files,
    consumer:'node-gyp@13.0.0', consumerRange:'^6.25.0', resolvedUndici:'node_modules/undici/package.json',
    modification:'Official npm 12.2.2 with hash-verified upstream Undici, glob, minimatch, path-scurry and matcher security updates.',
    sources:ARCHIVES};
}

async function download(archive, destination) {
  const bytes = await new Promise((resolve, reject) => {
    const request = https.get(archive.url, {headers:{'user-agent':'ThreadShelf-npm-toolchain'}}, response => {
      if(response.statusCode!==200){response.resume();reject(new Error(`Toolchain download failed: HTTP ${response.statusCode}`));return;}
      const chunks=[];let size=0;
      response.on('data',chunk=>{size+=chunk.length;if(size>20*1024*1024){response.destroy(new Error('Toolchain archive exceeds size limit.'));return;}chunks.push(chunk);});
      response.on('error',reject);response.on('end',()=>resolve(Buffer.concat(chunks)));
    });
    request.setTimeout(60000,()=>request.destroy(new Error('Toolchain download timed out.')));
    request.on('error',reject);
  });
  verifyIntegrity(bytes,archive.integrity);
  const temporary=destination+`.part-${process.pid}`;
  await fs.writeFile(temporary,bytes,{flag:'wx'});
  await fs.rename(temporary,destination);
}

async function removeTree(directory) {
  // Explicit unlinks also work on managed staging filesystems.
  if(!await exists(directory))return;
  for(const item of await fs.readdir(directory,{withFileTypes:true})){
    const file=path.join(directory,item.name);
    if(item.isDirectory()&&!item.isSymbolicLink())await removeTree(file);else await fs.unlink(file);
  }
  await fs.rmdir(directory);
}

async function extract(archive, directory) {
  await fs.mkdir(directory,{recursive:true});
  // These exact official archives contain only regular files/directories.
  // Their pinned SHA-512 is checked immediately before invoking system tar.
  // Native Node spawning does not translate drive/backslash paths for GNU
  // tar from Git Bash. Both paths share this cache: keep the native directory
  // in cwd and give GNU/BSD tar only a slash-separated relative archive path.
  const relativeArchive=path.relative(directory,archive).split(path.sep).join('/');
  const result=spawnSync(process.platform==='win32'?'tar.exe':'tar',['-xzf',relativeArchive,'--strip-components=1'],{cwd:directory,encoding:'utf8'});
  if(result.error)throw new Error(`Cannot extract the npm toolchain. Install system tar and retry: ${result.error.message}`);
  if(result.status!==0)throw new Error(`Toolchain extraction failed: ${result.stderr}`);
}

export async function ensureNpm({cacheRoot=defaultCache}={}) {
  const cache=path.resolve(cacheRoot),home=path.join(cache,TOOLCHAIN.id),root=path.join(home,'npm'),cli=path.join(root,'bin/npm-cli.js');
  if(await exists(root))return verifyNpm(cli);
  await fs.mkdir(cache,{recursive:true});
  const lock=path.join(cache,'.install-lock');let acquired=false;
  for(let i=0;i<300;i++){
    try{await fs.mkdir(lock);acquired=true;break;}catch(e){if(e.code!=='EEXIST')throw e;}
    if(await exists(root))return verifyNpm(cli);
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  if(!acquired)throw new Error('Another npm toolchain preparation holds the cache lock.');
  let stage;
  try{
    if(await exists(root))return verifyNpm(cli);
    const downloads=path.join(cache,'downloads');await fs.mkdir(downloads,{recursive:true});
    for(const archive of Object.values(ARCHIVES)){
      const file=path.join(downloads,archive.name);
      if(!await exists(file)){console.error(`Preparing ${TOOLCHAIN.id}: downloading ${archive.name}`);await download(archive,file);}
      verifyIntegrity(await fs.readFile(file),archive.integrity);
    }
    stage=await fs.mkdtemp(path.join(cache,'.stage-'));
    const staged=path.join(stage,'npm');
    await extract(path.join(downloads,ARCHIVES.npm.name),staged);
    for (const [key,archive] of Object.entries(ARCHIVES)) {
      if (key === 'npm') continue;
      const replacement=path.join(stage,key),destination=path.join(staged,'node_modules',archive.package);
      await extract(path.join(downloads,archive.name),replacement);
      await removeTree(destination);
      await fs.mkdir(path.dirname(destination),{recursive:true});
      await fs.rename(replacement,destination);
    }
    await verifyNpm(path.join(staged,'bin/npm-cli.js'));
    await fs.mkdir(home,{recursive:true});
    await fs.rename(staged,root);
    const report=await verifyNpm(cli);
    await fs.writeFile(path.join(home,'toolchain.json'),JSON.stringify(report,null,2)+'\n');
    return report;
  } finally {
    if(stage)await removeTree(stage);
    await fs.rmdir(lock);
  }
}

export async function npmEnvironment(toolchain) {
  if(toolchain.bin!==path.join(path.dirname(toolchain.root),'bin'))throw new Error('Unexpected managed npm command directory.');
  if(await exists(toolchain.bin)&&(await fs.lstat(toolchain.bin)).isSymbolicLink())throw new Error('Managed npm command directory must not be a symlink.');
  await fs.mkdir(toolchain.bin,{recursive:true});
  async function shim(name,content){
    const file=path.join(toolchain.bin,name);
    if(await exists(file)){
      const stat=await fs.lstat(file);
      if(!stat.isFile()||stat.isSymbolicLink()||await fs.readFile(file,'utf8')!==content)throw new Error(`Managed npm command shim was modified: ${name}`);
      if(process.platform!=='win32'&&!name.endsWith('.cmd')&&!(stat.mode&0o111))throw new Error(`Managed npm command shim is not executable: ${name}`);
      return;
    }
    const temporary=path.join(toolchain.bin,`${name}.${randomUUID()}.tmp`);
    await fs.writeFile(temporary,content,{flag:'wx',mode:0o755});
    await fs.chmod(temporary,0o755);
    await fs.rename(temporary,file);
  }
  for(const name of ['npm','npx']){
    const option=name==='npx'?'--npx --':'--';
    await shim(name,`#!/bin/sh\nexec "$TSL_NODE_EXECUTABLE" "$TSL_NPM_BOOTSTRAP" ${option} "$@"\n`);
    await shim(name+'.cmd',`@echo off\r\nsetlocal DisableDelayedExpansion\r\n"%TSL_NODE_EXECUTABLE%" "%TSL_NPM_BOOTSTRAP%" ${option} %*\r\n`);
  }
  const env={...process.env};
  // Node deduplicates Windows environment names case-insensitively.
  const owned=new Set(['path','npm_execpath','tsl_npm_bootstrap','tsl_node_executable','tsl_npm_cache']);
  for(const key of Object.keys(env))if(owned.has(key.toLowerCase()))delete env[key];
  return {...env,PATH:[toolchain.bin,path.dirname(process.execPath),process.env.Path||process.env.PATH||''].join(path.delimiter),
    npm_execpath:toolchain.cli,TSL_NPM_BOOTSTRAP:self,TSL_NODE_EXECUTABLE:process.execPath,
    TSL_NPM_CACHE:path.dirname(path.dirname(toolchain.root))};
}

export async function runNpm(args,options={}) {
  const settings={...options,cacheRoot:options.cacheRoot??process.env.TSL_NPM_CACHE??defaultCache};
  const toolchain=await ensureNpm(settings),env=await npmEnvironment(toolchain);
  const cli=options.npx?path.join(toolchain.root,'bin/npx-cli.js'):toolchain.cli;
  const result=spawnSync(process.execPath,[cli,...args],{stdio:'inherit',env});
  if(result.error)throw result.error;
  if(result.signal)throw new Error(`Managed npm terminated by ${result.signal}.`);
  return result.status??1;
}

export async function main(args=process.argv.slice(2),options={}) {
  const settings={...options,cacheRoot:options.cacheRoot??process.env.TSL_NPM_CACHE??defaultCache};
  if(args[0]==='--verify-cli'){
    if(args.length!==2)throw new Error('Usage: --verify-cli ABSOLUTE_NPM_CLI');
    console.log(JSON.stringify(await verifyNpm(args[1]),null,2));return 0;
  }
  if(args[0]==='--print-cli'||args[0]==='--report'){
    if(args.length!==1)throw new Error('Do not combine toolchain inspection with npm arguments.');
    const report=await ensureNpm(settings);console.log(args[0]==='--print-cli'?report.cli:JSON.stringify(report,null,2));return 0;
  }
  if(args[0]==='--npx'){settings.npx=true;args=args.slice(1);}
  if(args[0]==='--')args=args.slice(1);
  return runNpm(args,settings);
}
if(process.argv[1]&&path.resolve(process.argv[1])===self)main().then(code=>{process.exitCode=code;}).catch(error=>{console.error(error.message);process.exitCode=1;});
