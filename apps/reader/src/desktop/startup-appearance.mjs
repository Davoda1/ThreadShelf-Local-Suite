import { JsonState, DEFAULTS, APPEARANCE_DEFAULTS, validateCoreSettings, validateAppearanceSettings } from '../core/state.mjs';
import { startupAppearance } from '../core/startup-appearance.mjs';

// Reuse the worker's validation and backup policy without writing preferences or
// mounting any archive. A failed read is still reported by normal bootstrap.
export async function readStartupAppearance(dataDir) {
  const [settings, appearance] = await Promise.all([
    new JsonState(dataDir, 'settings.json', DEFAULTS, value => ({ ...DEFAULTS, ...validateCoreSettings(value) })).init().catch(() => null),
    new JsonState(dataDir, 'appearance.json', APPEARANCE_DEFAULTS, validateAppearanceSettings).init().catch(() => null),
  ]);
  return startupAppearance({ ...(settings?.value || DEFAULTS), ...(appearance?.value || APPEARANCE_DEFAULTS) });
}
