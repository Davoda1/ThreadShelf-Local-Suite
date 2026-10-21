import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {evaluateHoliday, normalizeCountry, localDateParts, clearHolidayCache} from '../src/desktop/holiday/src/holiday-engine.mjs';

const data = JSON.parse(await readFile(new URL('../src/desktop/holiday/assets/data/holiday-rules.json', import.meta.url), 'utf8'));
const check = (country, date) => {
  const [year, month, day] = date.split('-').map(Number);
  return evaluateHoliday(data, country, {year, month, day});
};
const match = (country, date, source, pattern) => {
  const result = check(country, date);
  assert.equal(result.isHoliday, true, `${country} ${date}`);
  assert.equal(result.warnings.length, 0, JSON.stringify(result.warnings));
  assert.ok(result.matches.some(m => m.source === source && pattern.test(m.name)), JSON.stringify(result));
};

test('Hungary national dates and ordinary adjacent dates', () => {
  match('HU', '2026-03-15', 'national-public', /National/);
  match('HU', '2026-08-20', 'national-public', /Stephen/);
  match('HU', '2026-10-23', 'national-public', /National|Republic/);
  assert.equal(check('HU', '2026-10-15').isHoliday, false);
  assert.equal(check('HU', '2026-03-14').isHoliday, false);
});

test('Western Easter is computed across years, not a fixed-date table', () => {
  for (const date of ['2024-03-31','2025-04-20','2026-04-05','2027-03-28','2038-04-25'])
    match('HU', date, 'christian', /^Easter Sunday$/);
  match('HU', '2026-04-03', 'christian', /^Good Friday$/);
  match('HU', '2026-04-06', 'christian', /^Easter Monday$/);
  match('HU', '2026-05-14', 'christian', /^Ascension/);
  match('HU', '2026-05-24', 'christian', /^Pentecost Sunday$/);
  match('HU', '2026-05-25', 'christian', /^Pentecost Monday$/);
  assert.equal(check('HU', '2026-04-04').isHoliday, false);
});

test('Orthodox Easter and Julian Christmas use distinct movable rules', () => {
  for (const date of ['2024-05-05','2025-04-20','2026-04-12','2027-05-02'])
    match('GR', date, 'christian', /^Orthodox Easter Sunday$/);
  assert.equal(check('GR','2026-04-05').matches.some(m => m.source === 'christian'), false);
  match('RU', '2026-01-07', 'christian', /^Orthodox Christmas Day$/);
  match('GR', '2026-12-25', 'christian', /^Christmas Day$/);
  match('AM', '2026-01-06', 'christian', /^Armenian Christmas/);
  const future = check('RU', '2101-01-08');
  assert.ok(future.matches.some(m => m.source === 'christian' && m.name === 'Orthodox Christmas Day'));
  assert.ok(future.warnings.includes('outside-islamic-calendar-range-1970-2080'));
});

test('Observed substitute days and year-boundary substitutions', () => {
  match('US', '2026-07-03', 'national-public', /Independence/);
  assert.ok(check('US', '2026-07-03').matches.some(m => m.substitute));
  match('US', '2026-07-04', 'national-public', /Independence/);
  match('US', '2021-12-31', 'national-public', /New Year/);
  match('GB', '2022-12-27', 'national-public', /Christmas|Boxing/);
});

test('Regional-only public rules and general observances do not become national', () => {
  assert.equal(check('DE', '2026-08-08').isHoliday, false); // Augsburg Peace Festival
  assert.equal(check('US', '2026-03-17').isHoliday, false); // not a nationwide US public day
  assert.equal(check('HU', '2026-02-14').isHoliday, false);
  for (const country of Object.values(data.holidays)) {
    assert.equal(country.states, undefined);
    assert.equal(country.regions, undefined);
    assert.ok(Object.values(country.days).every(rule => rule.type === 'public'));
  }
});

test('Requested Christian overlay includes Christmas even when not a national day', () => {
  match('JP', '2026-12-25', 'christian', /^Christmas Day$/);
  assert.equal(check('JP', '2026-12-25').matches.some(m => m.source === 'national-public'), false);
  match('HU', '2026-12-24', 'christian', /^Christmas Eve$/);
  match('HU', '2026-12-26', 'christian', /^Second Day of Christmas$/);
});

test('Input validation fails closed and never invents a country', () => {
  for (const country of [null, undefined, '', 'ZZ', 'Europe/Budapest', 'US.CA', '__proto__']) {
    const result = check(country, '2026-12-25');
    assert.equal(result.isHoliday, false);
    assert.equal(result.supportedCountry, false);
  }
  assert.equal(evaluateHoliday(data, 'HU', {year:2026,month:2,day:30}).isHoliday, false);
  assert.equal(evaluateHoliday(null,'HU',{year:2026,month:12,day:25}).isHoliday,false);
  assert.equal(normalizeCountry(' hu '),'HU');
  assert.equal(normalizeCountry('UK'),'GB');
  assert.equal(normalizeCountry('EL'),'GR');
  const sample = new Date(2026, 9, 15, 23, 59);
  assert.deepEqual(localDateParts(sample), {year:2026,month:10,day:15});
});

test('Evaluation does not mutate the JSON data', () => {
  const before=JSON.stringify(data);
  check('HU','2026-03-15'); check('US','2021-12-31');
  assert.equal(JSON.stringify(data),before);
});
