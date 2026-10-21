// The offline HTML has no native OS-region bridge. Use only its browser timezone
// and local civil date, evaluated once by the preview at page startup.
import data from '../src/desktop/holiday/assets/data/holiday-rules.json' with { type: 'json' };
import { TIMEZONE_COUNTRIES } from '../src/desktop/holiday/src/timezone-countries.mjs';
import { evaluateHoliday, localDateParts } from '../src/desktop/holiday/src/holiday-engine.mjs';

export function previewHolidayStatus({
  getTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  now = () => new Date(),
} = {}) {
  try {
    const timeZone = getTimeZone();
    const country = typeof timeZone === 'string' && Object.hasOwn(TIMEZONE_COUNTRIES, timeZone)
      ? TIMEZONE_COUNTRIES[timeZone] : null;
    const result = evaluateHoliday(data, country, localDateParts(now()));
    return Object.freeze({ isHoliday: result.isHoliday === true });
  } catch { return Object.freeze({ isHoliday: false }); }
}
