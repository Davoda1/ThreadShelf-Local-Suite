// ThreadShelf Local Suite 1.0.0. Offline civil-date holiday evaluation.
// This adapter is original project code. Bundled dependencies retain their licenses.
import Holidays from 'date-holidays-parser';

const cache = new WeakMap();
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function normalizeCountry(country) {
  if (typeof country !== 'string') return null;
  const code = country.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? ({UK: 'GB', EL: 'GR'}[code] || code) : null;
}

export function localDateParts(date = new Date()) {
  return {year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate()};
}

function civilDay(parts) {
  if (!parts || !['year', 'month', 'day'].every(k => Number.isInteger(parts[k]))) return null;
  const {year, month, day} = parts;
  // The parser's supported calendars have narrower documented ranges; Gregorian
  // and Easter rules remain useful outside those ranges, with returned warnings.
  if (year < 1600 || year > 4099 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const start = Date.UTC(year, month - 1, day);
  const check = new Date(start);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) return null;
  return {year, month, day, start, end: start + 86400000,
    iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`};
}

function yearly(data, country, year) {
  let memo = cache.get(data);
  if (!memo) { memo = new Map(); cache.set(data, memo); }
  const key = `${country}:${year}`;
  if (memo.has(key)) return memo.get(key);
  const countryData = data.holidays[country];
  // UTC here is a neutral representation of a civil date, NOT the user's clock.
  // The caller already obtained the local date from the OS. Do not reinterpret
  // it in a country's first timezone or the browser's UTC date.
  const opts = {timezone: 'Etc/UTC', languages: ['en'], types: ['public']};
  const national = new Holidays(data, country, opts);
  const profile = data.christianProfiles[countryData.christianProfile || data.defaultChristianProfile];
  if (!profile) throw new Error('Holiday data has no Christian profile');
  const christianData = {holidays: {XX: {names: {en: 'Christian observances'},
    langs: ['en'], zones: ['Etc/UTC'], dayoff: 'sunday', days: profile.days}}, names: {}};
  const christian = new Holidays(christianData, 'XX', opts);
  const events = [];
  // Include neighboring years for observed New Year days and multiday holidays
  // spanning December/January. The parser already handles most overlaps, and
  // the final deduplication keeps this explicit guard inexpensive and harmless.
  for (const y of [year - 1, year, year + 1]) {
    for (const [engine, source] of [[national, 'national-public'], [christian, 'christian']]) {
      for (const event of engine.getHolidays(y, 'en')) {
        if (event.type !== 'public') continue;
        events.push({name: event.name, rule: event.rule, source,
          substitute: Boolean(event.substitute), start: +event.start, end: +event.end});
      }
    }
  }
  memo.set(key, events);
  // The GUI calls this once at startup. Bound the cache for test tools/reusers.
  if (memo.size > 12) memo.delete(memo.keys().next().value);
  return events;
}

/**
 * Evaluate a local Gregorian date against the bundled offline rules.
 * data is the parsed holiday-rules.json object; treat it as immutable.
 * Unknown country, invalid data/date or evaluation failure fail closed.
 */
export function evaluateHoliday(data, countryCode, dateParts = localDateParts()) {
  const country = normalizeCountry(countryCode);
  const day = civilDay(dateParts);
  const result = {isHoliday: false, supportedCountry: false, country,
    date: day?.iso || null, matches: [], warnings: []};
  if (!day) { result.warnings.push('invalid-local-date'); return result; }
  if (!data || data.schemaVersion !== 1 || !data.holidays || !data.christianProfiles) {
    result.warnings.push('invalid-holiday-data'); return result;
  }
  if (!country || !own(data.holidays, country)) {
    result.warnings.push('unsupported-country'); return result;
  }
  result.supportedCountry = true;
  if (day.year < 1970 || day.year > 2080) result.warnings.push('outside-islamic-calendar-range-1970-2080');
  if (day.year < 1970 || day.year > 2100) result.warnings.push('outside-hebrew-calendar-range-1970-2100');
  try {
    const seen = new Set();
    for (const event of yearly(data, country, day.year)) {
      // Date-level policy: any portion of a public holiday on this local day
      // activates the special loop. No clock-time or midnight timer is needed.
      if (!(event.start < day.end && event.end > day.start)) continue;
      const id = `${event.source}|${event.name}|${event.rule}|${event.start}`;
      if (seen.has(id)) continue;
      seen.add(id);
      result.matches.push({name: event.name, rule: event.rule,
        source: event.source, substitute: event.substitute});
    }
    result.isHoliday = result.matches.length > 0;
  } catch (error) {
    result.matches = [];
    result.warnings.push(`holiday-evaluation-failed: ${String(error?.message || error)}`);
  }
  return result;
}

/** Loads only the application-local JSON URL supplied by the caller. */
export async function loadHolidayData(url) {
  const response = await fetch(url, {cache: 'force-cache'});
  if (!response.ok) throw new Error(`Holiday data unavailable (${response.status})`);
  const data = await response.json();
  if (data?.schemaVersion !== 1 || !data.holidays || !data.christianProfiles)
    throw new Error('Invalid holiday-rules.json');
  return data;
}

/** Call after intentionally editing/replacing an already-parsed data object. */
export function clearHolidayCache(data) { if (data && typeof data === 'object') cache.delete(data); }
