import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureNpm } from './npm-toolchain.mjs';

export const NODE_RELEASES = 'https://nodejs.org/dist/index.json';
export const ELECTRON_RELEASES = 'https://releases.electronjs.org/releases.json';
export function stableVersion(value, prefix = '') {
  const match = /^(?:v)?([1-9]\d*\.\d+\.\d+)$/.exec(String(value));
  if (!match) throw new Error(`Expected an exact stable version, received: ${value}`);
  return prefix + match[1];
}
const compare = (a, b) => {
  const left = stableVersion(a.version).split('.').map(Number), right = stableVersion(b.version).split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return right[i] - left[i];
  return 0;
};
export function selectRelease(releases, product, channel = 'lts') {
  if (!Array.isArray(releases)) throw new Error(`${product} release metadata is not an array.`);
  const candidates = releases.filter(row => row && /^v?[1-9]\d*\.\d+\.\d+$/.test(row.version)
    && row.prerelease !== true && row.draft !== true
    && (product !== 'node' || (Number(stableVersion(row.version).split('.')[0]) >= 24
      && (channel === 'current' ? row.lts === false : typeof row.lts === 'string' && row.lts.length > 0))));
  candidates.sort(compare);
  if (!candidates.length) throw new Error(`No supported stable ${product} ${channel} release was found.`);
  return stableVersion(candidates[0].version, product === 'node' ? 'v' : '');
}
export async function fetchReleases(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(45000), headers: { accept: 'application/json', 'cache-control': 'no-cache' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    throw new Error(`Cannot check current releases at ${url}: ${error.message}. No cached version is being called latest. Retry online, or select exact versions explicitly.`, { cause: error });
  }
}
export function selectedElectronVersion(pkg, env = process.env) {
  return stableVersion(env.TSLR_ELECTRON_VERSION || pkg.devDependencies.electron);
}
export function assertSelectedNode(env = process.env) {
  if (env.TSLR_NODE_VERSION && stableVersion(env.TSLR_NODE_VERSION) !== process.versions.node) {
    throw new Error(`Selected Node ${env.TSLR_NODE_VERSION}, but running ${process.version}. Run with the selected toolchain on PATH.`);
  }
}
export async function recordToolchain(root, details) {
  const file = path.join(root, '.tooling', 'toolchain.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(details, null, 2) + '\n');
  return file;
}

async function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  assertSelectedNode();
  if (process.env.TSLR_NODE_INDEX_FILE) {
    const releases = JSON.parse(await fs.readFile(process.env.TSLR_NODE_INDEX_FILE, 'utf8'));
    const selected = selectRelease(releases, 'node', process.env.TSLR_NODE_CHANNEL);
    if (selected !== process.version) throw new Error(`Node bootstrap selected ${process.version}; official metadata requires ${selected}.`);
  }
  const args = process.argv.slice(2), explicit = args.indexOf('--electron-version');
  const electron = explicit >= 0 ? stableVersion(args[explicit + 1]) : selectRelease(await fetchReleases(ELECTRON_RELEASES), 'electron', 'stable');
  const channel = process.env.TSLR_NODE_CHANNEL || 'exact';
  const npm = await ensureNpm({ cacheRoot: process.env.TSL_NPM_CACHE });
  await recordToolchain(root, {
    schema: 1, selectedAt: new Date().toISOString(), node: process.version, nodeChannel: channel,
    nodeArchiveSha256: process.env.TSLR_NODE_SHA256 || null,
    electron, electronChannel: explicit >= 0 ? 'exact' : 'stable', npm: npm.npm,
    npmUndici: npm.undici, npmProfile: npm.id,
    nodeSource: channel === 'exact' ? `https://nodejs.org/dist/${process.version}/` : NODE_RELEASES,
    electronSource: explicit >= 0 ? `https://releases.electronjs.org/release/v${electron}` : ELECTRON_RELEASES,
    platform: process.platform, arch: process.arch
  });
  // Only this version goes to stdout: the bootstrap captures it without eval.
  process.stdout.write(electron + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
