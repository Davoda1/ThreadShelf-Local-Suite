import { createHash } from 'node:crypto';

// The npm lock fixes the upstream tarball. These hashes additionally constrain
// the sole local source change and allow read-only runtime verification.
export const TRANSFORMERS_HUB_UPSTREAM_SHA256 = '9382b54d91d52397848928fc3165f6ef474d2a88cc8045a6ed9c6630481aade5';
export const TRANSFORMERS_HUB_PRIVATE_SHA256 = 'c3d2342f54014d2855cf9c022a3e78892b917b76ff7ff1efc77586ed4c80628f';
const digest = source => createHash('sha256').update(source).digest('hex');

export function assertTransformersPrivacy(source) {
  if (digest(source) !== TRANSFORMERS_HUB_PRIVATE_SHA256) {
    throw new Error('Transformers download privacy source is missing or changed. Rebuild the Reader dependencies.');
  }
}

export function applyTransformersPrivacyPatch(source) {
  const hash = digest(source);
  if (hash === TRANSFORMERS_HUB_PRIVATE_SHA256) return source;
  if (hash !== TRANSFORMERS_HUB_UPSTREAM_SHA256) {
    throw new Error('Unexpected Transformers 4.3.2 request-header source; review the privacy patch.');
  }
  const original = "        const IS_CI = !!process.env?.TESTING_REMOTELY;\n" +
    "        const version = env.version;\n" +
    "        headers.set('User-Agent', `transformers.js/${version}; is_ci/${IS_CI};`);";
  const patched = source.replace(original,
    '        // Modified by davoda1 for ThreadShelf: omit library version and CI request metadata.')
    .replace(' * In Node.js environments, adds User-Agent and Authorization headers when applicable.',
      ' * Modified by davoda1 for ThreadShelf: Node.js requests retain Authorization only when applicable.');
  assertTransformersPrivacy(patched);
  return patched;
}
