# ThreadShelf offline holiday rules — 0.0.12.1-dev.0

This component chooses whether the application startup date is a holiday. It performs no network request to any calendar, location, IP-geolocation, or holiday service. It has no manual country or video setting. It does not modify firmware or device behavior.

The runtime consists of `holiday-engine.mjs` (the bundled browser ESM evaluator) and one editable `holiday-rules.json`. The consolidated notice is `HOLIDAY-LICENSES.txt`. The JSON is about 275 KiB, the self-contained rule engine about 1009 KiB. No separate JSON calendar, year-by-year preload, or external npm installation is required at runtime. The committed generated files live only in the GUI tree; this tools directory keeps their maintainable source, dependency lock, and tests.

## Integration contract

```js
import {evaluateHoliday, localDateParts, loadHolidayData} from './holiday-engine.mjs';

// Supply the actual resolved OS country, not an interface-language guess.
// data may alternatively be parsed by the host and passed directly.
const data = await loadHolidayData(new URL('../assets/data/holiday-rules.json', import.meta.url));
const result = evaluateHoliday(data, detectedCountry, localDateParts());
const video = result.isHoliday
  ? 'holiday-multicolour.mp4'
  : currentThemeIsLight ? 'day-5.mp4' : 'early-morning-3.mp4';
```

The example above is for a module in the GUI `src` directory; the video filenames illustrate the contract, and the application owns the actual asset paths. The actual Electron integration uses `src/startup-holiday.mjs`: it reads the same JSON directly from the packaged filesystem and obtains country and local date from `src/startup-region.mjs`. Evaluate at GUI startup. The caller should preserve the startup holiday result while the GUI remains open. A later theme change can still choose between day and early morning when the startup result was not a holiday.

The host may instead call `evaluateHoliday(data, 'HU', {year:2026, month:10, day:23})`. Month is **1–12**. These must be local OS date components, not a UTC ISO date and not a date reinterpreted in another timezone. Internally UTC is only a neutral civil-date representation. This prevents changing the date when a country spans multiple timezones or a test runs on another host. `localDateParts()` explicitly uses local Date getters.

Return value:

```json
{"isHoliday":true,"supportedCountry":true,"country":"HU","date":"2026-03-15","matches":[{"name":"National Day","rule":"03-15","source":"national-public","substitute":false}],"warnings":[]}
```

`source` is either `national-public` or `christian`. The same day may have both sources. These are diagnostic records, not user-facing calendar entries. An invalid/missing country, unsupported country, invalid date, invalid data, or evaluation error produces `isHoliday: false`; the GUI keeps the ordinary theme loop. The two conventional country aliases `UK → GB` and `EL → GR` are accepted. No locale or network fallback is attempted by this component. It does not determine the country; that is the cross-platform host's responsibility.

`loadHolidayData(url)` is an optional fetch of the caller-provided app-local resource. Hosts whose resource protocol cannot use fetch should read/parse the JSON themselves. Treat a parsed data object as immutable; call `clearHolidayCache(data)` if intentionally editing that same object in memory. Replacing it with a newly parsed object naturally gives a fresh cache.

## Coverage and rules

The data is derived reproducibly from **date-holidays 3.37.0**, data version **2026-09-20**, using **date-holidays-parser 3.4.7**. It contains **207 country/territory entries** and **3,286 national public rule entries**. The precise supported code list is in `metadata.supportedCountries`; each country's English name and rules are in `holidays`. Countries absent from this list are unsupported, and no national holiday data has been fabricated for them.

Only the upstream **country-level `public`** rules are retained. States, provinces, regions, and their distinct holidays are removed; shared country rule references are resolved first. Other upstream observance, bank, optional, and school categories are excluded. Dates, active periods, substitutions, multiday durations, and known one-off government dates are preserved. English names are retained to keep the JSON small. A federal holiday classification follows the upstream dataset; it does not assert that every worker or business is legally entitled to a day off.

The common Christian overlay explicitly requested for the background contains Christmas Eve, Christmas Day, the second day of Christmas, Good Friday, Easter Sunday, Easter Monday, Ascension, Pentecost Sunday, and Pentecost Monday. These activate the background even where they are not nationwide public holidays. The overlay is **application policy**, not a claim about national law or a user's religion. Other Christian feasts that are nationally public already appear in national rules. It is not an exhaustive list of saints, denominational feasts, or local celebrations.

The Gregorian/Western profile is the default for supported countries. Explicit profile assignments are:

| Profile | Countries |
|---|---|
| Orthodox Easter; Gregorian Christmas | Bulgaria, Cyprus, Greece, Romania, Ukraine |
| Orthodox Easter; Julian Christmas converted to Gregorian date | Egypt, Eritrea, Ethiopia, Georgia, Kazakhstan, North Macedonia, Russia |
| Both Western and Orthodox Easter; both Christmas dates | Bosnia and Herzegovina, Belarus, Moldova, Montenegro, Serbia |
| Armenian Christmas/Theophany on 6 January; Western Easter | Armenia |

These are broad country defaults for a decorative feature; they cannot identify an individual's church tradition. The full explicit rules for each profile are in the same JSON. Easter is computed, not stored as a table of annual dates. Julian Christmas uses conversion rules, rather than assuming that 7 January stays correct indefinitely.

## Limits of a permanent offline rule file

The computer's calendar supplies local date/time and calendar arithmetic, but it does not provide a universal official holiday-law database. Some official dates depend on announcements, moon sightings, one-off elections, mourning, or annually reassigned working days. Permanent formulas cannot predict those decisions. This snapshot retains the exceptions known to the upstream version; future law changes and exceptional proclamations require a data update in a later software release. Country data also depends on upstream completeness and correctness and is not independently certified for legal or payroll use.

The parser documents the Islamic table range as **1970–2080**, with possible moon-sighting differences, and the Hebrew table range as **1970–2100**. Gregorian/Julian and Easter rules do not depend on a 2026–2035 calendar. The adapter accepts civil years 1600–4099 and returns warnings outside the table ranges so these limitations are visible to diagnostics. Current-year startup use is inside these ranges. Lunar, religious, and astronomical calculations use the upstream parser; no external calendar service is contacted.

A holiday lasting only part of a date still activates that entire date, matching the date-only startup policy. Known multiday events activate each intersected civil date. Neighboring rule years are checked to preserve observed New Year holidays that fall in late December.

## Rebuild and tests

Use Node.js and npm in `apps/reader/scripts/holiday-data`, from a complete suite source checkout/archive:

```sh
npm ci
npm run build
npm test
```

`package-lock.json` pins the source data, parser, bundler, and transitive dependencies. The build writes these three generated files directly, relative to the Reader source root (`apps/reader/`):

| Generated file | Purpose |
|---|---|
| `src/desktop/holiday/src/holiday-engine.mjs` | Self-contained ESM evaluator |
| `src/desktop/holiday/assets/data/holiday-rules.json` | The single shipped holiday-rule JSON |
| `src/desktop/holiday/assets/data/HOLIDAY-LICENSES.txt` | Consolidated data and runtime dependency attribution |

It does not generate duplicate runtime files or JSON in this tools directory. Output paths are anchored to the build script location, so `node /path/to/apps/reader/scripts/holiday-data/build.mjs` works from another working directory too. Tests import/read these exact generated GUI files, not a separate test copy. `npm run check` performs build and tests together. npm and dependencies are build-time tools only. No `node_modules` folder from this tools directory is needed in a delivered application; the prebuilt committed GUI engine and JSON support the normal GUI build without rebuilding holiday data.

Tests cover Hungarian fixed holidays and ordinary days; Western and Orthodox Easter across years; Christmas profiles; Julian/Gregorian date drift; observed substitute days and New Year rollover; regional-only exclusion; Christian days outside public holidays; invalid/unknown country handling; local-date extraction; input immutability; and comparison of all derived national event dates with the full upstream dataset for **all 207 entries in 2025, 2026, and 2027**. The same tests can run with different `TZ` settings to catch host timezone dependence.

## Sources and licensing

- Source data and attribution: <https://github.com/commenthol/date-holidays>
- Rule specification: <https://github.com/commenthol/date-holidays/blob/master/docs/specification.md>
- Parser API, supported calendars, and limitations: <https://github.com/commenthol/date-holidays-parser>
- Derived holiday data license: <https://creativecommons.org/licenses/by-sa/3.0/>

The holiday **data** is CC BY-SA 3.0 according to the upstream LICENSE and data header (the package's SPDX metadata is not used to override that license). The adapted JSON remains under that license, separately from application code. The JSON metadata identifies the source version and modifications. Original source attributions and bundled software license notices are retained in `src/desktop/holiday/assets/data/HOLIDAY-LICENSES.txt`. Parser code is ISC; the parser dependencies carry the licenses included in that same consolidated notice.
