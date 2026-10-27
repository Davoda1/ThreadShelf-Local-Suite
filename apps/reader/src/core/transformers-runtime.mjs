import { readFile } from 'node:fs/promises';

// The upstream Node bundle embeds an older Web runtime. Its public source
// entry instead imports the exact external ONNX dependencies pinned by Reader.
const supportedVersion = '4.3.2';
export async function resolveTransformersSource() {
  // Node resolves the declared export URL even when unused dist bundles are
  // omitted from desktop packages. Do not execute that prebuilt entry.
  const root = new URL('../', import.meta.resolve('@huggingface/transformers'));
  const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  if (manifest.name !== '@huggingface/transformers' || manifest.version !== supportedVersion) {
    throw new Error(`Unsupported Transformers source package: expected @huggingface/transformers ${supportedVersion}; found ${manifest.name ?? 'unknown'} ${manifest.version ?? 'unknown'}.`);
  }
  return new URL('src/transformers.js', root);
}

export async function loadTransformers() {
  return import((await resolveTransformersSource()).href);
}
