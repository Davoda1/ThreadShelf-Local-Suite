import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyTransformersPrivacyPatch } from '../src/core/transformers-privacy.mjs';

// Keep the existing source-only runtime and external ONNX dependency graph.
// Never modify the npm lock or use an upstream prebuilt Transformers bundle.
export async function prepareTransformersPrivacy(modules = fileURLToPath(new URL('../node_modules', import.meta.url))) {
  const root = path.join(modules, '@huggingface', 'transformers');
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (manifest.name !== '@huggingface/transformers' || manifest.version !== '4.3.2') {
    throw new Error('The download privacy patch requires the locked Transformers 4.3.2 source package.');
  }
  const file = path.join(root, 'src/utils/hub.js');
  const source = await readFile(file, 'utf8');
  const patched = applyTransformersPrivacyPatch(source);
  if (patched !== source) await writeFile(file, patched, 'utf8');
}
