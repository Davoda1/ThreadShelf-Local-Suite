// Small, browser-safe appearance snapshot shared by native startup and the UI.
// No paths, addresses, archive contents, or other preferences cross this boundary.
import { UI_PALETTES, UI_PALETTE_IDS, CODE_THEME_IDS, APPEARANCE_DEFAULTS } from './themes.mjs';

export function startupAppearance(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  return {
    theme: ['system', 'light', 'dark'].includes(value.theme) ? value.theme : 'system',
    uiPalette: UI_PALETTE_IDS.includes(value.uiPalette) ? value.uiPalette : APPEARANCE_DEFAULTS.uiPalette,
    codeTheme: CODE_THEME_IDS.includes(value.codeTheme) ? value.codeTheme : APPEARANCE_DEFAULTS.codeTheme,
    language: ['en', 'hu', 'de', 'fr', 'ja'].includes(value.language) ? value.language : 'en',
    highContrast: value.highContrast === true,
    animations: value.animations !== false,
  };
}

export function appearanceMode(value, systemDark) {
  return value.theme === 'system' ? (systemDark ? 'dark' : 'light') : value.theme;
}

export function startupBackground(value, systemDark) {
  const settings = startupAppearance(value), mode = appearanceMode(settings, systemDark);
  return UI_PALETTES.find(palette => palette.id === settings.uiPalette)?.tokens[mode]?.bg
    || (mode === 'dark' ? '#171c24' : '#f5f6f8');
}

export const STARTUP_LABELS = Object.freeze({ en: 'Loading…', hu: 'Betöltés…', de: 'Wird geladen…', fr: 'Chargement…', ja: '読み込み中…' });
