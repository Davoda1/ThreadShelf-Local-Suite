import { readFile } from 'node:fs/promises';
import { detectStartupRegion } from './startup-region.mjs';
import { evaluateHoliday } from './holiday-engine.mjs';

/**
 * One offline GUI-startup snapshot, called and cached by Electron main.
 * Optional dependencies are test seams, never renderer or saved settings.
 */
export async function loadStartupHolidayStatus(electronApp, {
  detectRegion = detectStartupRegion,
  readRules = () => readFile(new URL('../assets/data/holiday-rules.json', import.meta.url), 'utf8'),
  evaluate = evaluateHoliday,
} = {}) {
  try {
    const [region, text] = await Promise.all([
      detectRegion({ electronApp }), readRules(),
    ]);
    const [year, month, day] = String(region.localDate || '').split('-').map(Number);
    const result = evaluate(JSON.parse(text), region.country, { year, month, day });
    return Object.freeze({ ...result, ...region });
  } catch {
    return Object.freeze({ isHoliday: false, country: null, localDate: null, timeZone: null,
      source: 'unavailable', matches: [], warnings: ['startup-holiday-unavailable'] });
  }
}
