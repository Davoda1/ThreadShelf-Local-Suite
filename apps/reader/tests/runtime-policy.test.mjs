import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
  */SHASUMS256.txt) printf '%s  %s\\n' '${'0'.repeat(64)}' 'node-v24.19.0-linux-${process.arch}.tar.xz' > "$output" ;;
  *) printf '%s' 'corrupt archive bytes' > "$output" ;;
esac
`, { mode: 0o755 });
  const result = spawnSync('bash', ['scripts/run.sh', '--resolve-only'], { cwd: fixture, encoding: 'utf8', env: { ...process.env, PATH: `${path.join(fixture, 'bin')}${path.delimiter}${process.env.PATH}` } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Node archive checksum mismatch/);
  assert.equal((await fs.readdir(path.join(fixture, '.tooling'))).some(name => name.startsWith('node-v')), false);
});
