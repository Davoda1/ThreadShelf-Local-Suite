import { appearanceMode, startupAppearance } from '../core/startup-appearance.mjs';
import { SOURCE_SWITCH_WIDTHS } from '../core/themes.mjs';

export function applyAppearance(value) {
  const settings = startupAppearance(value), root = document.documentElement;
  root.dataset.theme = appearanceMode(settings, matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.uiPalette = settings.uiPalette;
  root.dataset.codeTheme = settings.codeTheme;
  root.dataset.contrast = settings.highContrast ? 'high' : 'normal';
  root.dataset.animations = String(settings.animations);
  root.dataset.analyticsStyledBars = String(value?.analyticsStyledBars === true);
  root.dataset.sourceSwitchWidth = SOURCE_SWITCH_WIDTHS.includes(value?.sourceSwitchWidth) ? value.sourceSwitchWidth : 'equal';
  root.lang = settings.language;
}
