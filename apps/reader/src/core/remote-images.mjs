// Separate from the strict preference files read by public 1.0.0.
// Adding this optional sidecar does not migrate or rewrite existing profiles.
export const REMOTE_IMAGES_FILE = 'remote-images-v1.json';
export const REMOTE_IMAGE_MODES = Object.freeze(['auto', 'click']);
export const REMOTE_IMAGE_DEFAULTS = Object.freeze({ remoteImages: 'auto' });

export function validateRemoteImageSettings(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)
    || Object.keys(values).some(key => !Object.hasOwn(REMOTE_IMAGE_DEFAULTS, key))) throw new Error('Invalid online image settings.');
  if (Object.hasOwn(values, 'remoteImages') && !REMOTE_IMAGE_MODES.includes(values.remoteImages)) throw new Error('Invalid setting: remoteImages');
  return { ...REMOTE_IMAGE_DEFAULTS, ...values };
}
