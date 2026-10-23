// Separate optional preferences preserve older readers' strict settings schema.
export const RESOURCE_CACHE_DEFAULTS = Object.freeze({ resourceCacheEnabled: false });
export const RESOURCE_CACHE_PREFERENCES_FILE = 'resource-cache-v1.json';
export function validateResourceCacheSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => key !== 'resourceCacheEnabled')
      || (Object.hasOwn(value, 'resourceCacheEnabled') && typeof value.resourceCacheEnabled !== 'boolean')) {
    throw new Error('Invalid resource cache settings.');
  }
  return { ...RESOURCE_CACHE_DEFAULTS, ...value };
}
