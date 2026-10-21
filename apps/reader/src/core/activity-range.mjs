// Calendar-date ranges shared by the desktop Activity report and offline preview.
// Dates are inclusive calendar days in the report's chosen time zone, not UTC
// timestamps. UTC arithmetic here advances calendar dates across DST safely.
import { activityDay } from './activity-normalize.mjs';

const DAY = 86400000;
export function activityDateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return null;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export function activityCustomRange(options = {}) {
  if (String(options.year) !== 'custom') return null;
  const invalid = message => { throw Object.assign(new RangeError(message), { code: 'ACTIVITY_INVALID_RANGE' }); };
  const start = activityDateValue(options.start), end = activityDateValue(options.end);
  if (!start) invalid('Choose a valid start date in YYYY-MM-DD format (years 0001–9999).');
  if (!end) invalid('Choose a valid end date in YYYY-MM-DD format (years 0001–9999).');
  if (start > end) invalid('The start date must be on or before the end date.');
  return { year: 'custom', start, end };
}

export function activityRange(options = {}, { years = [], earliest = null, latest = null, zone = 'local', now = Date.now() } = {}) {
  const custom = activityCustomRange(options);
  if (custom) return custom;
  const fallback = years[0] || activityDay(now, zone).slice(0, 4);
  let year = String(options.year || fallback);
  if (!['all', 'rolling'].includes(year) && !years.includes(year)) year = fallback;
  if (year === 'all') return { year, start: earliest || `${fallback}-01-01`, end: latest || `${fallback}-12-31` };
  if (year === 'rolling') {
    const end = activityDay(now, zone), start = new Date(Date.parse(end + 'T00:00:00Z') - 364 * DAY).toISOString().slice(0, 10);
    return { year, start, end };
  }
  return { year, start: `${year}-01-01`, end: `${year}-12-31` };
}
