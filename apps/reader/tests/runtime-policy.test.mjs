import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { stableVersion, selectRelease, selectedElectronVersion, assertSelectedNode, fetchReleases } from '../scripts/runtime-policy.mjs';

const releases = [
  { version: 'v29.0.0-nightly20260101', lts: false }, { version: 'v28.0.0-rc.1', lts: false },
  { version: 'v26.1.0', lts: false }, { version: 'v24.9.0', lts: 'Test LTS' },
  { version: 'v26.12.1', lts: false }, { version: 'v22.99.0', lts: 'Older' },
  { version: 'v24.22.0', lts: 'Test LTS' }, { version: 'v26.12.0', lts: false }
];
test('Node channels select numerically newest supported LTS or non-LTS stable Current', () => {
  assert.equal(selectRelease(releases, 'node', 'lts'), 'v24.22.0');
  assert.equal(selectRelease(releases, 'node', 'current'), 'v26.12.1');
  assert.throws(() => selectRelease([{ version: 'v30.0.0-beta.1', lts: false }], 'node', 'current'), /No supported/);
  assert.throws(() => selectRelease([{ version: 'v22.99.0', lts: 'Older' }], 'node', 'lts'), /No supported/);
});
test('Electron latest means the highest exact stable version, excluding draft and prerelease metadata', () => {
  assert.equal(selectRelease([{ version: '44.9.0' }, { version: '45.0.0-beta.9' }, { version: '44.10.0' }, { version: '46.0.0', prerelease: true }, { version: '47.0.0', draft: true }], 'electron', 'stable'), '44.10.0');
});
test('exact versions reject mutable tags, ranges, prereleases and injected paths', () => {
  for (const value of ['latest', 'lts', '^44.9.0', '44.9.0-beta.1', '../44.9.0', '44.9.0\nother', undefined]) assert.throws(() => stableVersion(value), /exact stable version/);
  assert.equal(stableVersion('v44.9.0'), '44.9.0');
  assert.equal(stableVersion('24.22.0', 'v'), 'v24.22.0');
});
test('one selected Electron version overrides the lockfile baseline without mutating it', () => {
  const pkg = { devDependencies: { electron: '44.9.0' } };
  assert.equal(selectedElectronVersion(pkg, { TSLR_ELECTRON_VERSION: '44.10.0' }), '44.10.0');
  assert.equal(selectedElectronVersion(pkg, {}), '44.9.0');
  assert.equal(pkg.devDependencies.electron, '44.9.0');
  assert.doesNotThrow(() => assertSelectedNode({ TSLR_NODE_VERSION: process.version }));
  assert.throws(() => assertSelectedNode({ TSLR_NODE_VERSION: '99.0.0' }), /Selected Node/);
});
test('metadata failure is explicit and never silently reuses a cached latest version', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('network unavailable'); });
  await assert.rejects(fetchReleases('https://releases.electronjs.org/releases.json'), /No cached version is being called latest/);
});
test('invalid HTTP metadata cannot be accepted as a current release', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 503 }));
  await assert.rejects(fetchReleases('https://nodejs.org/dist/index.json'), /HTTP 503/);
});
test('Node bootstrap parser agrees with the JSON resolver for compact or formatted official metadata', { skip: process.platform === 'win32' }, () => {
  for (const channel of ['lts', 'current']) {
    for (const input of [JSON.stringify(releases), JSON.stringify(releases, null, 2)]) {
      const result = spawnSync('awk', ['-v', `channel=${channel}`, '-f', 'scripts/select-node.awk'], { input, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), selectRelease(releases, 'node', channel));
    }
  }
});
test('Bash action conflicts and prereleases are rejected before setup', { skip: process.platform === 'win32' }, () => {
  for (const args of [['--build', '--test'], ['--latest', '--node-version', '24.22.0'], ['--node-version', '26.0.0-rc.1'], ['--electron-version', 'latest']]) {
    const result = spawnSync('bash', ['scripts/run.sh', ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2, result.stdout + result.stderr);
  }
});
test('Bash latest refuses failed online resolution even when a system Node is available', { skip: process.platform !== 'linux' }, async t => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'tslr-toolchain-'));
  t.after(() => fs.rm(fixture, { recursive: true, force: true }));
  await fs.mkdir(path.join(fixture, 'scripts'));
  await fs.mkdir(path.join(fixture, 'bin'));
  for (const name of ['run.sh', 'select-node.awk']) await fs.copyFile(path.join('scripts', name), path.join(fixture, 'scripts', name));
  await fs.writeFile(path.join(fixture, 'bin', 'curl'), '#!/bin/sh\nexit 22\n', { mode: 0o755 });
  const result = spawnSync('bash', ['scripts/run.sh', '--latest', '--resolve-only'], { cwd: fixture, encoding: 'utf8', env: { ...process.env, PATH: `${path.join(fixture, 'bin')}${path.delimiter}${process.env.PATH}` } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No cached version is being called latest/);
});
test('Bash rejects corrupt downloaded runtime bytes before using any installed Node', { skip: process.platform !== 'linux' || !['x64', 'arm64'].includes(process.arch) }, async t => {
  const { engines: { node: pinnedNodeVersion } } = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'tslr-toolchain-checksum-'));
  t.after(() => fs.rm(fixture, { recursive: true, force: true }));
  await fs.mkdir(path.join(fixture, 'scripts'));
  await fs.mkdir(path.join(fixture, 'bin'));
  for (const name of ['run.sh', 'select-node.awk']) await fs.copyFile(path.join('scripts', name), path.join(fixture, 'scripts', name));
  await fs.writeFile(path.join(fixture, 'bin', 'curl'), `#!/bin/sh
for arg do
  case "$arg" in https://*) url="$arg" ;; esac
  output="$arg"
done
case "$url" in
  */index.json) printf '%s' '[{"version":"v24.1.0","lts":"Fixture"}]' > "$output" ;;
  */SHASUMS256.txt) printf '%s  %s\\n' '${'0'.repeat(64)}' 'node-v${pinnedNodeVersion}-linux-${process.arch}.tar.xz' > "$output" ;;
  *) printf '%s' 'corrupt archive bytes' > "$output" ;;
esac
`, { mode: 0o755 });
  const result = spawnSync('bash', ['scripts/run.sh', '--resolve-only'], { cwd: fixture, encoding: 'utf8', env: { ...process.env, PATH: `${path.join(fixture, 'bin')}${path.delimiter}${process.env.PATH}` } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Node archive checksum mismatch/);
  assert.equal((await fs.readdir(path.join(fixture, '.tooling'))).some(name => name.startsWith('node-v')), false);
});


test('runtime records the verified managed npm profile and rejects failed verification', async t => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'tslr-managed-record-'));
  t.after(() => fs.rm(fixture, { recursive: true, force: true }));
  await fs.mkdir(path.join(fixture, 'scripts'));
  await fs.copyFile(new URL('../scripts/runtime-policy.mjs', import.meta.url), path.join(fixture, 'scripts/runtime-policy.mjs'));
  await fs.writeFile(path.join(fixture, 'scripts/npm-toolchain.mjs'), `export async function ensureNpm(options){
    if(options.cacheRoot!==process.env.TSL_NPM_CACHE)throw Error('Runtime policy selected a different managed cache');
    if(process.env.TSLR_FIXTURE_PROFILE_FAIL)throw Error('Managed npm verification failed');
    return {npm:'12.2.1',undici:'6.29.1',id:'npm-12.2.1-undici-6.29.1',cli:'/must-not-run-a-direct-cli'};
  }`);
  const env = { ...process.env, TSLR_NODE_VERSION: process.version, TSLR_NODE_CHANNEL: 'exact', TSLR_NODE_INDEX_FILE: '', TSL_NPM_CACHE: path.join(fixture, 'managed-cache') };
  const args = ['scripts/runtime-policy.mjs', '--electron-version', '45.1.0'];
  const result = spawnSync(process.execPath, args, { cwd: fixture, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);assert.equal(result.stdout.trim(), '45.1.0');
  const recordPath = path.join(fixture, '.tooling/toolchain.json');
  const record = JSON.parse(await fs.readFile(recordPath, 'utf8'));
  assert.equal(record.npm, '12.2.1');assert.equal(record.npmUndici, '6.29.1');assert.equal(record.npmProfile, 'npm-12.2.1-undici-6.29.1');
  await fs.rm(recordPath);
  const failed = spawnSync(process.execPath, args, { cwd: fixture, env: { ...env, TSLR_FIXTURE_PROFILE_FAIL: '1' }, encoding: 'utf8' });
  assert.notEqual(failed.status, 0);assert.match(failed.stderr, /Managed npm verification failed/);assert.equal(failed.stdout, '');
  await assert.rejects(fs.stat(recordPath), { code: 'ENOENT' });
});

test('Bash ResolveOnly verifies the managed profile before recording or invoking npm', { skip: process.platform !== 'linux' || !['x64', 'arm64'].includes(process.arch) }, async t => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'tslr-managed-resolve-'));
  t.after(() => fs.rm(fixture, { recursive: true, force: true }));
  const scripts = path.join(fixture, 'scripts'), bin = path.join(fixture, 'bin');
  const nodeBin = path.join(fixture, '.tooling', `node-${process.version}-linux-${process.arch}`, 'bin');
  const downloads = path.join(fixture, '.tooling/downloads');
  await Promise.all([scripts, bin, nodeBin, downloads].map(p => fs.mkdir(p, { recursive: true })));
  for (const name of ['run.sh', 'runtime-policy.mjs']) await fs.copyFile(new URL('../scripts/' + name, import.meta.url), path.join(scripts, name));
  await fs.symlink(process.execPath, path.join(nodeBin, 'node'));
  await fs.writeFile(path.join(nodeBin, 'npm'), '#!/bin/sh\nexit 91\n', { mode: 0o755 });
  const archive = Buffer.from('verified fixture archive; selected Node already extracted');
  const archiveName = `node-${process.version}-linux-${process.arch}.tar.xz`;
  await fs.writeFile(path.join(downloads, archiveName), archive);
  const sums = `${createHash('sha256').update(archive).digest('hex')}  ${archiveName}\n`;
  await fs.writeFile(path.join(bin, 'curl'), `#!/bin/sh
for arg do output="$arg"; done
printf '%s' '${sums}' > "$output"
`, { mode: 0o755 });
  await fs.writeFile(path.join(scripts, 'npm-toolchain.mjs'), `import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
export async function ensureNpm(){
 fs.appendFileSync(process.env.TSLR_FIXTURE_LOG,'verify\\n');
 if(process.env.TSLR_FIXTURE_PROFILE_FAIL)throw Error('Managed npm verification failed');
 return {npm:'12.2.1',undici:'6.29.1',id:'npm-12.2.1-undici-6.29.1'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const profile=await ensureNpm();if(process.argv[2]==='--report')console.log(JSON.stringify(profile));
 else if(process.argv.slice(2).join(' ')==='-- --version'){fs.appendFileSync(process.env.TSLR_FIXTURE_LOG,'version\\n');console.log(profile.npm);}
 else throw Error('Unexpected npm command in ResolveOnly');}catch(error){console.error(error.message);process.exitCode=1;}
}`);
  const log = path.join(fixture, 'calls.log');
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, TSLR_FIXTURE_LOG: log };
  const args = ['scripts/run.sh', '--resolve-only', '--node-version', process.version, '--electron-version', '45.1.0'];
  const result = spawnSync('bash', args, { cwd: fixture, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);assert.match(result.stdout, /npm 12\.2\.1/);
  assert.equal(await fs.readFile(log, 'utf8'), 'verify\nverify\nverify\nversion\n');
  const recordPath = path.join(fixture, '.tooling/toolchain.json');
  assert.equal(JSON.parse(await fs.readFile(recordPath, 'utf8')).npmProfile, 'npm-12.2.1-undici-6.29.1');
  await fs.rm(recordPath);await fs.writeFile(log, '');
  const failed = spawnSync('bash', args, { cwd: fixture, env: { ...env, TSLR_FIXTURE_PROFILE_FAIL: '1' }, encoding: 'utf8' });
  assert.notEqual(failed.status, 0);assert.match(failed.stderr, /Managed npm verification failed/);
  assert.equal(await fs.readFile(log, 'utf8'), 'verify\n');
  await assert.rejects(fs.stat(recordPath), { code: 'ENOENT' });
});
