import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import childProcess from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ARCHIVES, TOOLCHAIN, ensureNpm, npmEnvironment, treeFingerprint, verifyIntegrity, verifyNpm } from '../../apps/reader/scripts/npm-toolchain.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const helper = fileURLToPath(new URL('../../apps/reader/scripts/npm-toolchain.mjs', import.meta.url));
const fixtureArchives = process.env.TSL_NPM_TEST_ARCHIVES || path.join(repository, '.tooling/npm/downloads');
const fixtures = new Map();
let temporary, cacheRoot, toolchain;

function node(args, options = {}) {
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024, ...options });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

async function changeFile(file, change, check) {
  const original = await fs.readFile(file);
  try { await fs.writeFile(file, change(original)); await check(); }
  finally { await fs.writeFile(file, original); }
}

async function seedCache(directory) {
  await fs.mkdir(path.join(directory, 'downloads'), { recursive: true });
  for (const archive of Object.values(ARCHIVES)) {
    await fs.writeFile(path.join(directory, 'downloads', archive.name), fixtures.get(archive.name));
  }
}

// No fixture download is performed by this suite. CI prepares the managed
// profile first; local runs may point TSL_NPM_TEST_ARCHIVES at verified inputs.
before(async () => {
  for (const archive of Object.values(ARCHIVES)) {
    const file = path.join(fixtureArchives, archive.name);
    const bytes = await fs.readFile(file).catch(error => {
      throw new Error(`Prepare the managed npm profile first, or set TSL_NPM_TEST_ARCHIVES to its downloads directory: ${file}`, { cause: error });
    });
    verifyIntegrity(bytes, archive.integrity);
    fixtures.set(archive.name, bytes);
  }
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'threadshelf-npm-toolchain-'));
  cacheRoot = path.join(temporary, 'private cache');
  await seedCache(cacheRoot);
});
after(async () => { if (temporary) await fs.rm(temporary, { recursive: true, force: true }); });

describe('managed npm archive and cache boundary', { concurrency: false }, () => {
  test('official archive integrity rejects changed, truncated and mismatched input', () => {
    for (const archive of Object.values(ARCHIVES)) {
      const bytes = fixtures.get(archive.name);
      verifyIntegrity(bytes, archive.integrity);
      const changed = Buffer.from(bytes); changed[Math.floor(changed.length / 2)] ^= 1;
      assert.throws(() => verifyIntegrity(changed, archive.integrity), /integrity mismatch/);
      assert.throws(() => verifyIntegrity(bytes.subarray(0, bytes.length - 1), archive.integrity), /integrity mismatch/);
      assert.throws(() => verifyIntegrity(bytes, 'sha256-not-the-pinned-algorithm'), /Unsupported.*integrity/);
    }
    assert.throws(() => verifyIntegrity(fixtures.get(ARCHIVES.npm.name), ARCHIVES.undici.integrity), /integrity mismatch/);
  });

  test('first preparation works offline from verified archives and is idempotent', async t => {
    t.mock.method(https, 'get', () => { throw new Error('Tests must not download toolchain archives'); });
    toolchain = await ensureNpm({ cacheRoot });
    assert.equal(toolchain.id, TOOLCHAIN.id);
    assert.equal(toolchain.npm, TOOLCHAIN.npm);
    assert.equal(toolchain.undici, TOOLCHAIN.undici);
    assert.equal(toolchain.files, TOOLCHAIN.files);
    assert.equal(toolchain.treeSha256, TOOLCHAIN.treeSha256);
    const before = await fs.stat(toolchain.cli);
    assert.deepEqual(await ensureNpm({ cacheRoot }), toolchain);
    assert.equal((await fs.stat(toolchain.cli)).mtimeMs, before.mtimeMs);
    assert.equal(https.get.mock.callCount(), 0);
  });

  test('archive and extraction paths remain local across native Windows and POSIX tar', async t => {
    // Direct Node spawning does not translate Windows drive/backslash paths
    // for GNU tar from Git Bash. Keep them in native cwd, not tar arguments.
    // Observe the boundary, then use real tar and verify the complete tree.
    const cache = path.join(temporary, process.platform === 'win32' ? 'drive path cache' : 'D: drive path cache');
    await seedCache(cache);
    t.mock.method(https, 'get', () => { throw new Error('Tests must not download toolchain archives'); });
    const originalSpawn = childProcess.spawnSync, archives = [];
    const observedSpawn = t.mock.method(childProcess, 'spawnSync', (command, args, options) => {
      if (command === 'tar' || command === 'tar.exe') {
        assert.deepEqual(args, ['-xzf', args[1], '--strip-components=1'], 'extract into native cwd without passing a Windows -C path');
        assert.equal(path.isAbsolute(args[1]), false, 'tar must receive a relative archive path');
        assert.doesNotMatch(args[1], /[:\\]/, 'tar archive path must contain neither a drive colon nor backslash separators');
        assert.equal(path.dirname(path.dirname(options.cwd)), cache, 'native cwd must be inside the private extraction stage');
        assert.match(path.basename(path.dirname(options.cwd)), /^\.stage-/);
        assert.ok(['npm', 'undici'].includes(path.basename(options.cwd)));
        assert.equal(path.resolve(options.cwd, args[1]), path.join(cache, 'downloads', path.basename(args[1])));
        archives.push(path.basename(args[1]));
      }
      return originalSpawn(command, args, options);
    });
    syncBuiltinESMExports();
    try {
      const prepared = await ensureNpm({ cacheRoot: cache });
      assert.deepEqual(archives, Object.values(ARCHIVES).map(archive => archive.name));
      assert.equal(prepared.treeSha256, TOOLCHAIN.treeSha256);
      assert.equal(prepared.files, TOOLCHAIN.files);
      assert.equal(prepared.undici, TOOLCHAIN.undici);
      assert.equal(https.get.mock.callCount(), 0);
    } finally { observedSpawn.mock.restore(); syncBuiltinESMExports(); }
  });

  test('corrupt cached archive fails before extraction or network access', async t => {
    const cache = path.join(temporary, 'corrupt archive cache');
    await seedCache(cache);
    await fs.writeFile(path.join(cache, 'downloads', ARCHIVES.npm.name), fixtures.get(ARCHIVES.npm.name).subarray(0, 100));
    t.mock.method(https, 'get', () => { throw new Error('Unexpected network fallback'); });
    await assert.rejects(ensureNpm({ cacheRoot: cache }), /archive integrity mismatch/);
    assert.equal(https.get.mock.callCount(), 0);
    await assert.rejects(fs.stat(path.join(cache, TOOLCHAIN.id, 'npm')), { code: 'ENOENT' });
    await assert.rejects(fs.stat(path.join(cache, '.install-lock')), { code: 'ENOENT' });
  });

  test('fingerprint binds filenames as well as bytes', async () => {
    const tree = path.join(temporary, 'fingerprint');
    await fs.mkdir(tree);
    await fs.writeFile(path.join(tree, 'first'), 'same contents');
    const first = await treeFingerprint(tree);
    await fs.rename(path.join(tree, 'first'), path.join(tree, 'second'));
    const renamed = await treeFingerprint(tree);
    assert.equal(first.files, 1);
    assert.equal(renamed.files, 1);
    assert.notEqual(first.sha256, renamed.sha256);
  });

  test('changed cached npm code cannot be reused or silently repaired', async () => {
    const file = path.join(toolchain.root, 'lib/npm.js');
    await changeFile(file, bytes => Buffer.concat([bytes, Buffer.from('\n// altered cached fixture\n')]), async () => {
      await assert.rejects(verifyNpm(toolchain.cli), /file integrity mismatch/);
      await assert.rejects(ensureNpm({ cacheRoot }), /file integrity mismatch/);
    });
  });

  test('wrong internal Undici version is rejected independently of the tree hash', async () => {
    const file = path.join(toolchain.root, 'node_modules/undici/package.json');
    await changeFile(file, bytes => JSON.stringify({ ...JSON.parse(bytes), version: '6.29.0' }), async () => {
      await assert.rejects(verifyNpm(toolchain.cli), /must resolve patched Undici 6\.29\.1/);
    });
  });

  test('missing internal Undici cannot resolve through another installation', async () => {
    const directory = path.join(toolchain.root, 'node_modules/undici');
    const removed = path.join(temporary, 'removed-undici');
    await fs.rename(directory, removed);
    try { await assert.rejects(verifyNpm(toolchain.cli), /ENOENT|Cannot find module|unexpected Undici/); }
    finally { await fs.rename(removed, directory); }
  });

  test('node-gyp cannot substitute its own nested Undici copy', async () => {
    const nested = path.join(toolchain.root, 'node_modules/node-gyp/node_modules/undici');
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(path.join(nested, 'package.json'), JSON.stringify({ name: 'undici', version: TOOLCHAIN.undici }));
    try {
      // A fresh process also avoids CommonJS resolution caches from earlier
      // checks concealing a newly added nested dependency.
      const result = node([helper, '--verify-cli', toolchain.cli]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /resolves an unexpected Undici copy/);
    } finally { await fs.rm(path.dirname(nested), { recursive: true, force: true }); }
  });

  test('managed root and nested directory symlinks are rejected', async () => {
    const alias = path.join(temporary, 'npm-root-alias');
    await fs.symlink(toolchain.root, alias, 'junction');
    try { await assert.rejects(verifyNpm(path.join(alias, 'bin/npm-cli.js')), /root must not be a symlink/); }
    finally { await fs.unlink(alias); }
    const nested = path.join(toolchain.root, 'linked-directory');
    await fs.symlink(path.join(toolchain.root, 'lib'), nested, 'junction');
    try { await assert.rejects(verifyNpm(toolchain.cli), /Symlink in npm toolchain/); }
    finally { await fs.unlink(nested); }
  });
});

describe('managed command shims and environment', { concurrency: false }, () => {
  before(async () => { await npmEnvironment(toolchain); });

  test('owned environment aliases cannot override the guarded profile', async () => {
    const original = process.env;
    process.env = { ...original, Path: 'untrusted-path', PATH: 'other-untrusted-path',
      NPM_EXECPATH: 'ambient-npm', nPm_ExEcPaTh: 'second-ambient-npm',
      tsl_npm_bootstrap: 'ambient-bootstrap', Tsl_Node_Executable: 'ambient-node',
      tsl_npm_cache: 'ambient-cache', UNRELATED_TOOLCHAIN_FIXTURE: 'retained' };
    try {
      const environment = await npmEnvironment(toolchain);
      const expected = { npm_execpath: toolchain.cli, TSL_NPM_BOOTSTRAP: helper,
        TSL_NODE_EXECUTABLE: process.execPath, TSL_NPM_CACHE: cacheRoot };
      for (const [name, value] of Object.entries(expected)) {
        assert.deepEqual(Object.keys(environment).filter(key => key.toLowerCase() === name.toLowerCase()), [name]);
        assert.equal(environment[name], value);
      }
      assert.deepEqual(Object.keys(environment).filter(key => key.toLowerCase() === 'path'), ['PATH']);
      assert.equal(environment.PATH.split(path.delimiter)[0], toolchain.bin);
      assert.equal(environment.UNRELATED_TOOLCHAIN_FIXTURE, 'retained');
    } finally { process.env = original; }
  });

  test('a substituted command directory is rejected', async () => {
    await assert.rejects(npmEnvironment({ ...toolchain, bin: path.join(temporary, 'other commands') }), /Unexpected managed npm command directory/);
  });

  test('command directory symlink is rejected without writing through it', async () => {
    const original = toolchain.bin + '-saved';
    await fs.rename(toolchain.bin, original);
    await fs.symlink(original, toolchain.bin, 'junction');
    try { await assert.rejects(npmEnvironment(toolchain), /command directory must not be a symlink/); }
    finally { await fs.unlink(toolchain.bin); await fs.rename(original, toolchain.bin); }
  });

  test('modified npm and npx shim contents are rejected', async () => {
    for (const name of ['npm', 'npm.cmd', 'npx', 'npx.cmd']) {
      await changeFile(path.join(toolchain.bin, name), () => 'ambient toolchain substitution', async () => {
        await assert.rejects(npmEnvironment(toolchain), /command shim was modified/);
      });
    }
  });

  test('shim symlink is rejected without modifying its external target', async () => {
    const shim = path.join(toolchain.bin, 'npm.cmd');
    const original = await fs.readFile(shim);
    const target = path.join(temporary, 'external shim target');
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, 'sentinel'), 'untouched');
    await fs.unlink(shim);
    await fs.symlink(target, shim, 'junction');
    try {
      await assert.rejects(npmEnvironment(toolchain), /command shim was modified/);
      assert.equal(await fs.readFile(path.join(target, 'sentinel'), 'utf8'), 'untouched');
    } finally { await fs.unlink(shim); await fs.writeFile(shim, original, { mode: 0o755 }); }
  });

  test('POSIX shim losing execute permission cannot fall through to ambient npm', { skip: process.platform === 'win32' }, async () => {
    for (const name of ['npm', 'npx']) {
      const shim = path.join(toolchain.bin, name);
      await fs.chmod(shim, 0o644);
      try { await assert.rejects(npmEnvironment(toolchain), /command shim is not executable/); }
      finally { await fs.chmod(shim, 0o755); }
    }
  });
});

describe('nested npm invocation', { concurrency: false }, () => {
  let project, poisonedEnv;
  before(async () => {
    project = path.join(temporary, 'nested project');
    const poison = path.join(temporary, 'ambient npm');
    await fs.mkdir(project); await fs.mkdir(poison);
    await fs.writeFile(path.join(poison, 'npm'), '#!/bin/sh\necho GLOBAL_NPM_WAS_USED >&2\nexit 91\n', { mode: 0o755 });
    await fs.writeFile(path.join(poison, 'npm.cmd'), '@echo GLOBAL_NPM_WAS_USED 1>&2\r\n@exit /b 91\r\n');
    poisonedEnv = { ...process.env, TSL_NPM_CACHE: cacheRoot, PATH: poison + path.delimiter + (process.env.Path || process.env.PATH || '') };
    for (const key of Object.keys(poisonedEnv)) if (key.toLowerCase() === 'path' && key !== 'PATH') delete poisonedEnv[key];
    await fs.writeFile(path.join(project, 'package.json'), JSON.stringify({ name: 'nested-toolchain-fixture', version: '1.0.0', private: true,
      scripts: { nested: 'npm run probe', probe: 'node probe.cjs', tampered: 'node tamper.cjs && npm --version' } }));
    await fs.writeFile(path.join(project, 'probe.cjs'), `const assert=require('node:assert/strict'),{createRequire}=require('node:module'),path=require('node:path');
const expected=${JSON.stringify(toolchain.cli)};
assert.equal(process.env.npm_execpath,expected);
const consumer=path.join(path.dirname(path.dirname(expected)),'node_modules/node-gyp/package.json');
const resolved=createRequire(consumer).resolve('undici/package.json');
assert.equal(require(resolved).version,${JSON.stringify(TOOLCHAIN.undici)});
console.log('MANAGED_NESTED_PROFILE_OK');\n`);
    await fs.writeFile(path.join(project, 'tamper.cjs'), `require('node:fs').appendFileSync(${JSON.stringify(path.join(toolchain.root, 'lib/npm.js'))},'\\n// lifecycle tampering fixture\\n');\n`);
  });

  test('nested npm uses the managed profile despite a poisoned ambient PATH', async () => {
    const environment = await npmEnvironment(toolchain);
    assert.equal(environment.npm_execpath, toolchain.cli);
    assert.equal(environment.TSL_NPM_CACHE, cacheRoot);
    const result = node([helper, '--', 'run', 'nested'], { cwd: project, env: poisonedEnv });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /MANAGED_NESTED_PROFILE_OK/);
    assert.doesNotMatch(result.stdout + result.stderr, /GLOBAL_NPM_WAS_USED/);
  });

  test('nested wrapper repeats integrity verification after lifecycle mutation', async () => {
    const file = path.join(toolchain.root, 'lib/npm.js');
    const original = await fs.readFile(file);
    try {
      const result = node([helper, '--', 'run', 'tampered'], { cwd: project, env: poisonedEnv });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr + result.stdout, /file integrity mismatch/);
      assert.doesNotMatch(result.stdout + result.stderr, /GLOBAL_NPM_WAS_USED/);
    } finally { await fs.writeFile(file, original); }
  });
});

test('upstream content-encoding advisory crashes original npm child but patched profile rejects safely', async () => {
  const original = path.join(temporary, 'original npm');
  await fs.mkdir(original);
  const unpack = spawnSync(process.platform === 'win32' ? 'tar.exe' : 'tar',
    ['-xzf', path.join(cacheRoot, 'downloads', ARCHIVES.npm.name), '--strip-components=1', '-C', original], { encoding: 'utf8' });
  assert.equal(unpack.error, undefined);
  assert.equal(unpack.status, 0, unpack.stderr);
  const child = path.join(temporary, 'encoding-child.cjs');
  // Adapted from nodejs/undici v6.29.1 test/fetch/encoding.js. Each child sees
  // one tiny response on its own ephemeral loopback TCP port; no remote host.
  await fs.writeFile(child, `const assert=require('node:assert/strict'),{createServer}=require('node:net'),{once}=require('node:events');
const {fetch,Agent,RetryAgent}=require(process.argv[2]);
const timeout=setTimeout(()=>process.exit(2),5000);
const server=createServer(socket=>{socket.on('error',()=>{});socket.once('data',()=>socket.end('HTTP/1.1 200 OK\\r\\nContent-Encoding: gzip, gzip, gzip, gzip, gzip, gzip\\r\\nContent-Length: 1\\r\\nConnection: close\\r\\n\\r\\n'));});
(async()=>{server.listen(0,'127.0.0.1');await once(server,'listening');const dispatcher=new RetryAgent(new Agent(),{maxRetries:3});
await assert.rejects(fetch('http://127.0.0.1:'+server.address().port,{dispatcher}),error=>{assert.match(error.cause?.message||'',/content-encoding/);console.log('CAUGHT_FETCH_REJECTION');return true;});
await new Promise(resolve=>setTimeout(resolve,100));await dispatcher.close();await new Promise(resolve=>server.close(resolve));clearTimeout(timeout);console.log('SURVIVED_EARLY_CLOSE');
})().catch(error=>{console.error(error);process.exit(3);});\n`);
  for (const [root, vulnerable] of [[original, true], [toolchain.root, false]]) {
    const result = node(['--max-old-space-size=128', child, path.join(root, 'node_modules/undici')]);
    assert.match(result.stdout, /CAUGHT_FETCH_REJECTION/);
    if (vulnerable) {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Unhandled 'error' event/);
      assert.match(result.stderr, /UND_ERR_RES_CONTENT_LENGTH_MISMATCH/);
      assert.doesNotMatch(result.stdout, /SURVIVED_EARLY_CLOSE/);
    } else {
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /SURVIVED_EARLY_CLOSE/);
    }
  }
});
