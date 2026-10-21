// Executable discovery/start follows the MIT AI Export Converter GUI workflow.
// Starting an installed service is explicit. Model operations use its HTTP API;
// this module never installs or removes the Ollama application itself.
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export function normalizeOllamaUrl(raw = 'http://127.0.0.1:11434') {
  let url;
  try { url = new URL(raw); } catch { throw new Error('Enter a valid local Ollama HTTP address.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Ollama requires an HTTP or HTTPS address without embedded credentials.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const parts = hostname.split('.').map(Number);
  const ipv4 = parts.length === 4 && parts.every(n => Number.isInteger(n) && n >= 0 && n < 256);
  const private4 = ipv4 && (parts[0] === 127 || parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 169 && parts[1] === 254));
  const localName = hostname === 'localhost' || hostname === '::1' || hostname.endsWith('.local') || (!hostname.includes('.') && !hostname.includes(':'));
  const private6 = /^(fc|fd)[0-9a-f]{2}:|^fe[89ab][0-9a-f]:/i.test(hostname);
  if (!private4 && !localName && !private6) throw new Error('Ollama search is limited to a local computer or private LAN address.');
  url.search = ''; url.hash = ''; url.pathname = url.pathname.replace(/\/+$/, '') + '/';
  return url;
}

export function validateOllamaModelName(value) {
  if (typeof value !== 'string') throw new Error('Enter a valid Ollama model name, for example embeddinggemma.');
  const model = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,159}$/.test(model) || model.includes('..') || model.includes('//') || model.endsWith('/')) throw new Error('Enter a valid Ollama model name, for example embeddinggemma.');
  return model;
}

// Only the model explicitly named in the confirmed UI action is deleted. The
// URL is captured by that action; it never falls back to another server midway.
export async function deleteOllamaModel(searcher, { url, model, signal } = {}) {
  const base = normalizeOllamaUrl(url);
  model = validateOllamaModelName(model);
  signal?.throwIfAborted();
  const tags = await searcher._ollamaTags(base, signal);
  const tag = tags.find(row => (row.name ?? row.model) === model || (row.name ?? row.model) === `${model}:latest`);
  if (!tag) throw new Error(`Model ${model} is no longer installed at this Ollama address. Refresh the model list.`);
  const name = validateOllamaModelName(tag.name ?? tag.model);
  const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000);
  signal?.throwIfAborted();
  searcher._progress({ operation: 'ollama.delete', phase: 'delete', message: `Removing ${name} from the configured Ollama server.` });
  let response, text;
  try {
    response = await searcher.fetch(new URL('api/delete', base), {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: name }), signal: combined, redirect: 'error',
    });
    text = await response.text();
  } catch (error) {
    signal?.throwIfAborted();
    throw new Error(`Ollama model removal could not be confirmed at ${base.origin}: ${error.message}. Refresh models before retrying.`);
  }
  let body;
  try { body = text.trim() ? JSON.parse(text) : null; } catch { body = null; }
  if (!response.ok || body?.error) throw Object.assign(new Error(`Ollama model removal failed (${response.status}): ${body?.error || text.slice(0, 300) || response.statusText}`), { status: response.status });
  // The documented success response is empty HTTP 200, not a JSON object.
  searcher.ollamaVerified.delete(searcher._ollamaKey(base, tag));
  const status = await searcher.ollamaModels({ url: base.href, signal });
  if (status.available && status.details.some(row => row.name === name)) throw new Error(`Ollama reported success but ${name} is still installed. Refresh models before retrying.`);
  return { ...status, deletedModel: name, message: `Removed ${name} from Ollama. Reader search preferences and derived indexes were retained.` };
}

export async function modelCacheBytes(directory) {
  let total = 0;
  const visit = async target => {
    let entries;
    try { entries = await fs.readdir(target, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const filename = path.join(target, entry.name);
      if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile() && !/\.tmp\.|\.part$/.test(entry.name)) {
        try { const stat = await fs.lstat(filename); if (stat.isFile() && !stat.isSymbolicLink()) total += stat.size; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    }
  };
  try { await visit(directory); return total; } catch { return null; }
}

export async function ollamaIndexStatus(searcher, key, revision) {
  if (!searcher._db) return { known: false, ready: false, stale: false, indexedPassages: 0, indexedChunks: 0, indexedAt: null, bytes: null };
  const info = searcher._db.prepare('SELECT * FROM indexes WHERE model=?').get(key);
  if (!info) return { known: true, ready: false, stale: false, indexedPassages: 0, indexedChunks: 0, indexedAt: null, bytes: 0 };
  let bytes = 0;
  const files = searcher._db.prepare('SELECT DISTINCT file FROM vector_segments WHERE model=? AND generation=?').all(key, info.generation);
  for (const row of files) {
    if (!/^vector-[a-f0-9]{64}\.(7z|zip)$/.test(row.file)) { bytes = null; break; }
    try {
      const stat = await fs.lstat(path.join(searcher.objectsDir, row.file));
      if (!stat.isFile() || stat.isSymbolicLink()) { bytes = null; break; }
      bytes += stat.size;
    } catch { bytes = null; break; }
  }
  return { known: true, ready: info.revision === revision && bytes !== null, stale: info.revision !== revision,
    indexedPassages: info.passages, indexedChunks: info.chunks, indexedAt: info.updated, bytes };
}

export async function enrichOllamaModels(searcher, base, tags, details) {
  const revision = await searcher._revision();
  const byName = new Map(tags.map(tag => [tag.name ?? tag.model, tag]));
  return Promise.all(details.map(async detail => {
    const tag = byName.get(detail.name) || {};
    const sizeBytes = Number.isSafeInteger(tag.size) && tag.size >= 0 ? tag.size : null;
    return { ...detail, sizeBytes, modifiedAt: typeof tag.modified_at === 'string' ? tag.modified_at : null,
      digest: typeof tag.digest === 'string' ? tag.digest : null,
      family: typeof tag.details?.family === 'string' ? tag.details.family : null,
      parameterSize: typeof tag.details?.parameter_size === 'string' ? tag.details.parameter_size : null,
      quantization: typeof tag.details?.quantization_level === 'string' ? tag.details.quantization_level : null,
      index: await ollamaIndexStatus(searcher, searcher._ollamaKey(base, tag), revision) };
  }));
}

export function isLoopbackOllama(url) {
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host === '::1' || /^127\./.test(host);
}
export function createOllamaManager({ io = fs, launch = spawn, platform = process.platform, env = process.env } = {}) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  async function findExecutable() {
    const candidates = platform === 'win32' && env.LOCALAPPDATA
      ? [paths.join(env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe')] : [];
    for (const directory of (env.PATH || env.Path || '').split(platform === 'win32' ? ';' : ':').filter(Boolean)) {
      candidates.push(paths.join(directory.replace(/^"|"$/g, ''), platform === 'win32' ? 'ollama.exe' : 'ollama'));
    }
    for (const filename of [...new Set(candidates)]) {
      try {
        await io.access(filename, platform === 'win32' ? constants.F_OK : constants.X_OK);
        if ((await io.stat(filename)).isFile()) return filename;
      } catch { /* Check the next ordinary install location. */ }
    }
    return null;
  }
  async function start(url, { signal } = {}) {
    signal?.throwIfAborted();
    if (!isLoopbackOllama(url)) throw new Error('Start Ollama on the remote computer. This button only starts an installation on this computer.');
    if (url.protocol !== 'http:' || url.pathname !== '/') throw new Error('Starting Ollama requires its direct local HTTP address, without a proxy path.');
    const executable = await findExecutable();
    if (!executable) throw new Error('Ollama was not found on this computer. Install it from ollama.com, or use text search or the independent built-in semantic model.');
    signal?.throwIfAborted();
    await new Promise((resolve, reject) => {
      const child = launch(executable, ['serve'], {
        detached: true, stdio: 'ignore', windowsHide: true,
        env: { ...env, OLLAMA_HOST: url.host },
      });
      child.once('error', reject);
      child.once('spawn', () => { child.unref(); resolve(); });
    });
    return { executable };
  }
  return { findExecutable, start };
}
