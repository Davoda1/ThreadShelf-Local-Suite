import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import Data from './node_modules/date-holidays-parser/src/Data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
process.chdir(here);
const guiRoot = path.resolve(here, '../../src/desktop/holiday');
const outputs = {
  engine: path.join(guiRoot, 'src/holiday-engine.mjs'),
  rules: path.join(guiRoot, 'assets/data/holiday-rules.json'),
  licenses: path.join(guiRoot, 'assets/data/HOLIDAY-LICENSES.txt'),
};
await fs.mkdir(path.dirname(outputs.engine), {recursive: true});
await fs.mkdir(path.dirname(outputs.rules), {recursive: true});
const require = createRequire(import.meta.url);
const dataRoot = path.dirname(require.resolve('date-holidays/package.json'));
const upstream = JSON.parse(await fs.readFile(path.join(dataRoot, 'data/holidays.json'), 'utf8'));
const days = rules => Object.fromEntries(Object.entries(rules).map(([rule, name]) => [rule, {name: {en: name}, type: 'public'}]));
const paschal = (base, adjective = '') => ({
  [`${base} -2`]: `${adjective}Good Friday`,
  [base]: `${adjective}Easter Sunday`,
  [`${base} 1`]: `${adjective}Easter Monday`,
  [`${base} 39`]: `${adjective}Ascension Day`,
  [`${base} 49`]: `${adjective}Pentecost Sunday`,
  [`${base} 50`]: `${adjective}Pentecost Monday`
});
const christmas = (prefix = '') => ({
  [`${prefix}12-24`]: `${prefix ? 'Orthodox ' : ''}Christmas Eve`,
  [`${prefix}12-25`]: `${prefix ? 'Orthodox ' : ''}Christmas Day`,
  [`${prefix}12-26`]: `${prefix ? 'Orthodox ' : ''}Second Day of Christmas`
});
const profiles = {
  western: {description: 'Gregorian Christmas; Western computus for Easter',
    days: days({...christmas(), ...paschal('easter')})},
  orthodoxGregorian: {description: 'Gregorian Christmas; Orthodox computus for Easter',
    days: days({...christmas(), ...paschal('orthodox', 'Orthodox ')})},
  orthodoxJulian: {description: 'Julian Christmas converted to Gregorian date; Orthodox computus for Easter',
    days: days({...christmas('julian '), ...paschal('orthodox', 'Orthodox ')})},
  mixed: {description: 'Western and Orthodox Easter; both Gregorian and Julian Christmas',
    days: days({...christmas(), ...christmas('julian '), ...paschal('easter'), ...paschal('orthodox', 'Orthodox ')})},
  armenian: {description: 'Armenian Christmas on 6 January; Western Easter',
    days: days({'01-05': 'Armenian Christmas Eve', '01-06': 'Armenian Christmas and Theophany', ...paschal('easter')})}
};
const profileByCountry = {};
for (const c of ['BG','CY','GR','RO','UA']) profileByCountry[c] = 'orthodoxGregorian';
for (const c of ['EG','ER','ET','GE','KZ','MK','RU']) profileByCountry[c] = 'orthodoxJulian';
for (const c of ['BA','BY','MD','ME','RS']) profileByCountry[c] = 'mixed';
profileByCountry.AM = 'armenian';

const holidays = {};
let ruleCount = 0;
for (const code of Object.keys(upstream.holidays).sort()) {
  const original = upstream.holidays[code];
  // Resolve country _days and shared-name references BEFORE removing all state
  // and region objects. No regional holiday is promoted into national scope.
  const rules = new Data(upstream, code).getRules();
  const publicRules = {};
  for (const [rule, options] of Object.entries(rules)) {
    if (options.type !== 'public') continue;
    const english = options.name?.en || Object.values(options.name || {})[0] || rule;
    publicRules[rule] = {...options, name: {en: english}};
    // English-only names; all fields affecting rule dates are retained.
    if (publicRules[rule].note && typeof publicRules[rule].note === 'object')
      publicRules[rule].note = publicRules[rule].note.en || Object.values(publicRules[rule].note)[0];
    ruleCount++;
  }
  holidays[code] = {names: {en: original.names?.en || Object.values(original.names || {})[0] || code},
    langs: ['en'], zones: ['Etc/UTC'], dayoff: original.dayoff || 'sunday',
    christianProfile: profileByCountry[code] || 'western', days: publicRules};
}
const data = {schemaVersion: 1,
  metadata: {suiteVersion: '0.0.12.1-dev.0', source: 'date-holidays', sourceVersion: '3.37.0',
    sourceDataVersion: upstream.version, parserVersion: '3.4.7',
    sourceUrl: 'https://github.com/commenthol/date-holidays',
    ruleSpecificationUrl: 'https://github.com/commenthol/date-holidays/blob/master/docs/specification.md',
    license: 'CC-BY-SA-3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    attribution: 'date-holidays contributors / commenthol; original source attributions in HOLIDAY-LICENSES.txt',
    modifications: 'Country-level public rules only; references flattened; names reduced to English; app Christian overlay added; states and regions excluded.',
    countryCount: Object.keys(holidays).length, nationalRuleCount: ruleCount,
    supportedCountries: Object.keys(holidays),
    coverage: 'Country/territory entries supplied by the pinned upstream dataset, not every ISO territory. No national data invented for unsupported countries.',
    limitations: ['Frozen offline rules cannot anticipate government proclamations or future law changes.',
      'Islamic dates may differ from local moon-sighting announcements; parser table covers 1970–2080.',
      'Hebrew parser table covers 1970–2100.',
      'Christian profiles are application background policy, not a statement that these are public holidays or a person’s religion.',
      'National data retains known one-off dates and exceptions, but is not a complete historical or future legal calendar.',
      'Christian coverage is common Christmas and Easter-cycle feasts, not every denominational saint or local religious feast.']},
  defaultChristianProfile: 'western', christianProfiles: profiles,
  holidays, names: {substitutes: {name: {en: 'substitute day'}}}};
await fs.writeFile(outputs.rules, JSON.stringify(data) + '\n');
const result = await build({entryPoints: ['holiday-engine-source.mjs'], outfile: outputs.engine,
  bundle: true, platform: 'browser', format: 'esm', target: ['es2020'], minify: true,
  legalComments: 'none', metafile: true,
  banner: {js: '/*! ThreadShelf offline holiday engine. See ../assets/data/HOLIDAY-LICENSES.txt for bundled dependency licenses. */'}});
const packageNames = new Set(['date-holidays']);
for (const file of Object.keys(result.metafile.inputs)) {
  const match = file.replaceAll('\\', '/').match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  if (match) packageNames.add(match[1]);
}
const licenseParts = [
  'THREADSHELF OFFLINE HOLIDAY ENGINE — THIRD-PARTY NOTICES',
  'The derived holiday-rules.json is licensed CC BY-SA 3.0. It is an adaptation of date-holidays 3.37.0 data (2026-09-20): national public rules retained, regional data omitted, names reduced to English, Christian application policy added. The JSON stays separately licensed from application and adapter code.',
  'Data license: https://creativecommons.org/licenses/by-sa/3.0/\nOriginal project: https://github.com/commenthol/date-holidays\nAll original data attributions follow in the date-holidays LICENSE section.'
];
for (const name of [...packageNames].sort()) {
  const dir = path.join(here, 'node_modules', name);
  const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
  licenseParts.push(`\n${'='.repeat(72)}\n${name} ${pkg.version}\nLicense identifier: ${pkg.license || 'see below'}\nRepository: ${typeof pkg.repository === 'object' ? pkg.repository.url : pkg.repository || pkg.homepage || ''}`);
  const licenseFiles = (await fs.readdir(dir)).filter(x => /^(LICENSE|LICENCE|COPYING|NOTICE)(\.|$)/i.test(x));
  if (!licenseFiles.length) throw new Error(`No license notice found for ${name}`);
  for (const file of licenseFiles) licenseParts.push(await fs.readFile(path.join(dir, file), 'utf8'));
}
await fs.writeFile(outputs.licenses, licenseParts.join('\n\n') + '\n');
const sizes = {};
for (const file of Object.values(outputs)) sizes[path.relative(guiRoot, file).replaceAll('\\', '/')] = (await fs.stat(file)).size;
console.log(JSON.stringify({countries: Object.keys(holidays).length, nationalRules: ruleCount, sizes}, null, 2));
