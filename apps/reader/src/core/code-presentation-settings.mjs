// Separate from strict legacy settings so older Readers can still open a profile.
export const CODE_PRESENTATION_DEFAULTS = Object.freeze({ codeWrap: false, codeLineNumbers: false });
export const CODE_PRESENTATION_SETTINGS_FILE = 'code-presentation.json';
export function validateCodePresentationSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(CODE_PRESENTATION_DEFAULTS, key))) throw new Error('Invalid code presentation settings.');
  const result = { ...CODE_PRESENTATION_DEFAULTS, ...value };
  for (const key of Object.keys(CODE_PRESENTATION_DEFAULTS)) if (typeof result[key] !== 'boolean') throw new Error(`Invalid code presentation setting: ${key}`);
  return result;
}
