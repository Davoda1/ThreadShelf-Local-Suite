// Optional view preference lives outside legacy strict settings files.
export const READING_DISPLAY_DEFAULTS = Object.freeze({ hideIntermediateJson: false, threadHeaderCollapsed: false });
export const READING_DISPLAY_SETTINGS_FILE = 'reading-display.json';
export function validateReadingDisplaySettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(READING_DISPLAY_DEFAULTS, key))) throw new Error('Invalid reading display settings.');
  const result = { ...READING_DISPLAY_DEFAULTS, ...value };
  if (typeof result.hideIntermediateJson !== 'boolean' || typeof result.threadHeaderCollapsed !== 'boolean') throw new Error('Invalid reading display setting.');
  return result;
}
