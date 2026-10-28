// Explicit cross-platform PowerShell bootstrap integration check; not a Windows
// native build. Run with TSLR_PWSH=/path/to/pwsh node --test this-file.
// Network and npm operations are fixtures; the selected Node executable,
// runtime-policy.mjs and run.ps1 execute normally from a path with spaces.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const pwsh = process.env.TSLR_PWSH || 'pwsh';
const source = process.env.TSLR_BOOTSTRAP_TEST_SOURCE || path.join(root, 'scripts/run.ps1');
const fixtureNpm = '12.2.1';
const fixtureUndici = '6.29.1';
const fixtureProfile = `npm-${fixtureNpm}-undici-${fixtureUndici}`;
const environmentNames = ['Path', 'TSLR_NODE_VERSION', 'TSLR_NODE_CHANNEL', 'TSLR_NODE_INDEX_FILE',
  'TSLR_NODE_SHA256', 'TSLR_ELECTRON_VERSION', 'ELECTRON_OVERRIDE_DIST_PATH', 'NODE_USE_ENV_PROXY',
  'ONNXRUNTIME_NODE_INSTALL', 'ELECTRON_SKIP_BINARY_DOWNLOAD'];

async function fixture(t) {
  // Windows TEMP may use an 8.3 parent alias while Node reports its long name.
  // Keep the intentional special characters, but compare real file identities.
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tslr npm ~ % ')));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const scripts = path.join(directory, 'scripts');
  const nodeDir = path.join(directory, '.tooling', `node-${process.version}-win-x64`);
  const managedRoot = path.join(directory, '.tooling', fixtureProfile);
  const managedBin = path.join(managedRoot, 'bin');
  const npmCLI = path.join(managedRoot, 'package/bin/npm-cli.js');
  const downloads = path.join(directory, '.tooling/downloads');
  await Promise.all([fs.mkdir(scripts, { recursive: true }), fs.mkdir(path.dirname(npmCLI), { recursive: true }), fs.mkdir(downloads, { recursive: true }), fs.mkdir(managedBin, { recursive: true }), fs.mkdir(nodeDir, { recursive: true })]);
  await fs.copyFile(source, path.join(scripts, 'run.ps1'));
  await fs.copyFile(path.join(root, 'scripts/runtime-policy.mjs'), path.join(scripts, 'runtime-policy.mjs'));
  await fs.copyFile(process.execPath, path.join(nodeDir, 'node.exe'));
  await fs.chmod(path.join(nodeDir, 'node.exe'), 0o755);
  const log = path.join(directory, 'calls.jsonl');
  const snapshot = path.join(directory, 'environment.json');
  const append = `require('node:fs').appendFileSync(process.env.TSLR_FIXTURE_LOG, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), node: process.execPath, guarded: process.env.TSLR_FIXTURE_GUARDED === '${fixtureProfile}' }) + '\\n');`;
  await fs.writeFile(npmCLI, `${append}\nif (process.env.TSLR_FIXTURE_GUARDED !== '${fixtureProfile}') throw Error('Managed npm was called without its guard');\nif (process.argv[2] === '--version') console.log('${fixtureNpm}');\nif (process.argv[2] === process.env.TSLR_FIXTURE_FAIL) process.exit(71);\n`);
  // Exercise the real bootstrap and runtime record against the managed helper
  // contract. Root toolchain tests validate registry integrity and nested shims;
  // this fixture makes bypassing that helper fail, without network downloads.
  await fs.writeFile(path.join(scripts, 'npm-toolchain.mjs'), `
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../.tooling/${fixtureProfile}/',import.meta.url));
export async function ensureNpm(){
 fs.appendFileSync(process.env.TSLR_FIXTURE_LOG,JSON.stringify({args:['verify-npm-profile'],node:process.execPath,cwd:process.cwd()})+'\\n');
 if(process.env.TSLR_FIXTURE_FAIL==='profile')throw Error('Managed npm profile verification failed');
 return {root,cli:path.join(root,'package/bin/npm-cli.js'),bin:path.join(root,'bin'),npm:'${fixtureNpm}',undici:'${fixtureUndici}',id:'${fixtureProfile}'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const profile=await ensureNpm(),args=process.argv.slice(2);
  if(args[0]==='--report')console.log(JSON.stringify(profile));
  else if(args[0]==='--print-cli')console.log(profile.cli);
  else if(args[0]==='--'){
   const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>key.toUpperCase()!=='PATH'));
   env.PATH=profile.bin+path.delimiter+(process.env.PATH||process.env.Path||'');env.TSLR_FIXTURE_GUARDED=profile.id;
   const result=spawnSync(process.execPath,[profile.cli,...args.slice(1)],{stdio:'inherit',env});if(result.error)throw result.error;process.exitCode=result.status??1;
  }else throw Error('Unexpected managed npm argument');
 }catch(error){console.error(error.message);process.exitCode=1;}
}
`);
  for (const bundled of ['node_modules/npm/bin/npm-cli.js', '../lib/node_modules/npm/bin/npm-cli.js']) {
    const poison = path.join(nodeDir, bundled);
    await fs.mkdir(path.dirname(poison), { recursive: true });
    await fs.writeFile(poison, `throw Error('Node-bundled npm must not be used');\n`);
  }
  await fs.writeFile(path.join(scripts, 'ensure-electron.mjs'), `import fs from 'node:fs'; fs.appendFileSync(process.env.TSLR_FIXTURE_LOG, JSON.stringify({args:['ensure-electron']})+'\\n');\n`);
  // If a bootstrap calls the ambiguous wrapper, fail instead of allowing a
  // globally selected npm to masquerade as the managed npm in its record.
  await fs.writeFile(path.join(nodeDir, 'npm.cmd'), '#!/bin/sh\nprintf "unexpected npm wrapper\\n" >&2\nexit 91\n', { mode: 0o755 });
  const archive = Buffer.from('cached official-archive fixture; no extraction requested');
  const archiveName = `node-${process.version}-win-x64.zip`;
  await fs.writeFile(path.join(downloads, archiveName), archive);
  const sums = `${createHash('sha256').update(archive).digest('hex')}  ${archiveName}\n`;
  const wrapper = path.join(directory, 'exercise.ps1');
  await fs.writeFile(wrapper, `param([string]$Action)
$ErrorActionPreference = 'Stop'
# This fixture always stages an x64 Node distribution. Configure its Windows
# architecture inside the child process: inherited environment keys can differ
# in case, and Windows child environments treat those aliases as one variable.
[Environment]::SetEnvironmentVariable('OS', 'Windows_NT', 'Process')
[Environment]::SetEnvironmentVariable('PROCESSOR_ARCHITECTURE', 'AMD64', 'Process')
[Environment]::SetEnvironmentVariable('PROCESSOR_ARCHITEW6432', $null, 'Process')
if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64' -or $env:PROCESSOR_ARCHITEW6432) { throw 'Synthetic x64 architecture was not isolated.' }
function Invoke-WebRequest {
  param([string]$Uri, [string]$OutFile, [int]$TimeoutSec, [switch]$UseBasicParsing)
  if ($Uri -notlike 'https://nodejs.org/dist/*/SHASUMS256.txt') { throw ('Unexpected network request: ' + $Uri) }
  [IO.File]::WriteAllText($OutFile, $env:TSLR_FIXTURE_SUMS)
}
$names = @(${environmentNames.map(x => `'${x}'`).join(', ')})
$before = @{}
foreach ($name in $names) { $before[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$flags = @{}
if ($Action) { $flags[$Action] = $true }
try { & (Join-Path $PSScriptRoot 'scripts/run.ps1') -NodeVersion $env:TSLR_FIXTURE_NODE -ElectronVersion '44.9.1' @flags }
finally {
  $after = @{}
  foreach ($name in $names) { $after[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
  [IO.File]::WriteAllText($env:TSLR_FIXTURE_SNAPSHOT, (@{before=$before; after=$after} | ConvertTo-Json -Depth 4))
}
`);
  async function run(action = '', failure = '', parentEnv = process.env) {
    await fs.writeFile(log, '');
    // Seed owned variables: Linux and Windows PowerShell differ in whether an
    // absent variable restored with a null .NET string remains absent or empty.
    // This check covers retention of existing values, not that OS difference.
    const retained = Object.fromEntries(environmentNames.map(name => [name, `preserve-${name}`]));
    retained.Path = process.env.Path || process.env.PATH;
    retained.NODE_USE_ENV_PROXY = '1';
    const overrides = { ...retained,
      TSLR_FIXTURE_LOG: log, TSLR_FIXTURE_SNAPSHOT: snapshot, TSLR_FIXTURE_SUMS: sums, TSLR_FIXTURE_NODE: process.version,
      TSLR_FIXTURE_FAIL: failure, TSLR_NODE_VERSION: 'preserve-before', TSLR_NODE_CHANNEL: 'preserve-channel' };
    // Node's Windows spawn deduplicates environment names case-insensitively.
    // Remove inherited aliases before applying fixture-owned values, so a
    // differently cased parent key cannot win over the synthetic selection.
    const ownedNames = new Set([...Object.keys(overrides), 'OS', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_ARCHITEW6432'].map(name => name.toUpperCase()));
    const env = { ...Object.fromEntries(Object.entries(parentEnv).filter(([name]) => !ownedNames.has(name.toUpperCase()))), ...overrides };
    const result = spawnSync(pwsh, ['-NoLogo', '-NoProfile', '-File', wrapper, ...(action ? [action] : [])], { encoding: 'utf8', env, timeout: 60000 });
    assert.ifError(result.error);
    const state = JSON.parse(await fs.readFile(snapshot, 'utf8'));
    assert.deepEqual(state.after, state.before, 'bootstrap restores existing values of every environment variable it owns');
    const calls = (await fs.readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(x => JSON.parse(x));
    return { ...result, calls };
  }
  return { run, directory, npmCLI, nodeDir };
}

function npmCalls(result) { return result.calls.filter(call => call.args[0] !== 'verify-npm-profile'); }
function verifyManagedCalls(result) {
  assert.equal(result.calls[0]?.args[0], 'verify-npm-profile', 'Verify the managed profile before runtime resolution or npm commands');
  for (const call of npmCalls(result).filter(call => call.node)) assert.equal(call.guarded, true, 'Every npm command uses the managed wrapper guard');
  assert.ok(result.calls.filter(call => call.args[0] === 'verify-npm-profile').length >= npmCalls(result).filter(call => call.node).length + 2, 'Bootstrap and runtime policy both verify the profile');
}

test('PowerShell ResolveOnly isolates inherited environment aliases and records the verified managed npm profile', async t => {
  const f = await fixture(t), result = await f.run('ResolveOnly', '', {
    ...process.env, processor_architecture: 'ARM64', PROCESSOR_ARCHITEW6432: 'ARM64',
    tslr_fixture_node: 'v0.0.0', path: 'invalid synthetic inherited path',
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, new RegExp(`npm ${fixtureNpm.replaceAll('.', '\\.')}`));
  const record = JSON.parse(await fs.readFile(path.join(f.directory, '.tooling/toolchain.json')));
  assert.equal(record.npm, fixtureNpm);assert.equal(record.npmUndici, fixtureUndici);assert.equal(record.npmProfile, fixtureProfile);
  assert.deepEqual(npmCalls(result).map(x => x.args), [['--version']]);
  verifyManagedCalls(result);
  for (const call of result.calls) assert.equal(await fs.realpath(call.node), await fs.realpath(path.join(f.nodeDir, 'node.exe')), 'The selected Node executable was used');
});

test('PowerShell selected npm runs every existing build/test/package/start flow without the global wrapper', async t => {
  const f = await fixture(t);
  for (const [action, last] of [['Build', null], ['Test', ['test']], ['Package', ['run', 'package', '--', '--win32']], ['', ['start']]]) {
    const result = await f.run(action);
    assert.equal(result.status, 0, `${action}: ${result.stdout}${result.stderr}`);
    const expected = [['--version'], ['ci', '--include=optional'], ['ensure-electron'], ['run', 'build']];
    if (last) expected.push(last);
    assert.deepEqual(npmCalls(result).map(x => x.args), expected, action);
    verifyManagedCalls(result);
    for (const call of result.calls.filter(x => x.node)) {
      assert.equal(await fs.realpath(call.node), await fs.realpath(path.join(f.nodeDir, 'node.exe')), 'The selected Node executable was used');
      assert.equal(await fs.realpath(call.cwd), f.directory, 'Commands run in the isolated project directory');
    }
  }
});

test('PowerShell stops on selected npm failure and restores its environment', async t => {
  const f = await fixture(t), result = await f.run('Package', 'ci');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /exit code 71/);
  assert.deepEqual(npmCalls(result).map(x => x.args), [['--version'], ['ci', '--include=optional']]);
  verifyManagedCalls(result);
});


test('PowerShell ResolveOnly rejects an unverified managed profile and restores its environment', async t => {
  const f = await fixture(t), result = await f.run('ResolveOnly', 'profile');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Managed npm profile verification failed/);
  assert.deepEqual(result.calls.map(call => call.args), [['verify-npm-profile']]);
  await assert.rejects(fs.stat(path.join(f.directory, '.tooling/toolchain.json')), { code: 'ENOENT' });
});
