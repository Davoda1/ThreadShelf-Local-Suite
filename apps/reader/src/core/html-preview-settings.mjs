export const HTML_PREVIEW_DEFAULTS = Object.freeze({ htmlPreviewExternalResources: true });
export const HTML_PREVIEW_SETTINGS_FILE = 'html-preview.json';
export function validateHtmlPreviewSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(HTML_PREVIEW_DEFAULTS, key))) throw new Error('Invalid HTML preview settings.');
  const result = { ...HTML_PREVIEW_DEFAULTS, ...value };
  if (typeof result.htmlPreviewExternalResources !== 'boolean') throw new Error('Invalid HTML preview setting.');
  return result;
}
