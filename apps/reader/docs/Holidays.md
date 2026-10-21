# Welcome-page holiday video

ThreadShelf Local Reader 1.0.0 can substitute the multicolour fireworks
loop for the normal welcome-page wave loop on a recognized holiday. This requires
all three user preferences: **Wave video background**, video on the welcome page,
and holiday fireworks. Their defaults remain off. An open conversation always
uses the ordinary light/dark wave loop; fireworks never appear behind reading.
Video also obeys the existing application animations, reduced-motion and
visibility controls. Disabling either prerequisite stops welcome video playback.

## Startup country and date

The country detector and offline rule engine are included with this release. Electron main captures the configured OS country and local civil
date once at GUI startup. The result stays fixed until the GUI process restarts.
Only the boolean holiday decision is sent to the renderer. No country or date is
saved in the user's settings, and no network, IP-location or GPS service is used.

The self-contained HTML preview cannot read native Windows/macOS Region settings
or the original Linux timezone configuration. It uses the browser's IANA timezone
and local civil date once at page startup with the same embedded rule JSON and
engine. This browser fallback may differ from native country selection, including
when the browser canonicalizes a country-specific timezone alias. Unknown browser
country uses ordinary waves. No rules or location data are fetched over a network.

| Platform | Configured country | Civil date |
| --- | --- | --- |
| Windows | Saved Country or region / Home location via GetUserDefaultGeoName, with GetUserGeoID/GetGeoInfoW fallback | Windows local timezone/date from the same native query |
| Linux | Original named OS timezone mapped through the bundled IANA country data | Current time in that saved OS timezone |
| macOS | Saved Region through the native locale country API | OS timezone and local Gregorian date |

Linux checks the lexical `/etc/localtime` symlink name first, then a named
`/etc/timezone`, then an optional bounded `timedatectl` query. It has no systemd
dependency. Country-specific identifiers are retained before aliases are resolved;
`Europe/Budapest` selects Hungary regardless of an English UI or `LANG=en_US`.
An inherited process `TZ` does not override the OS civil date. UTC, CET, offsets,
locale language, and equivalent timezone-file bytes do not imply a country.

Windows uses a hidden, noninteractive, time-limited PowerShell native API query
with no execution-policy bypass. A blocked or failed query, unknown country,
invalid date, missing rule data or evaluation error leaves ordinary waves active.

## Offline rules and limits

The bundled JSON contains date-holidays **3.37.0** rules from **2026-09-20**,
evaluated by date-holidays-parser **3.4.7**: 207 country/territory entries and 3,286
national public rules. Regional, state, school, optional and bank-only categories
are excluded unless classified as national public holidays by the upstream data.
Observed substitutes, durations, active periods and known one-off exceptions are
preserved. Country detector ISO validation means upstream IC/XK data entries are
not automatically selected.

The existing Christian overlay is retained: Christmas Eve/Day/second day,
Good Friday, Easter Sunday/Monday, Ascension and Pentecost Sunday/Monday. Western,
Orthodox, Julian, mixed and Armenian profiles follow the inherited country rules.
These observances can activate decoration even where they are not public holidays.
Movable dates are evaluated for the current year; this is not a preloaded finite
2026–2035 calendar. Neighboring rule years cover year-boundary substitute days.

The frozen offline dataset cannot predict new government declarations, later law
changes or moon-sighting decisions. Islamic parser tables cover 1970–2080, Hebrew
tables cover 1970–2100, while Gregorian/Julian/Easter rules are computed. This is
decorative background policy, not a legal or payroll calendar.

## Source, media and licenses

Runtime modules/data are under `src/desktop/holiday/`; source-only rebuild tools
are under `scripts/holiday-data/` and `scripts/timezone-data/`. The pinned source
workflow and original ThreadShelf documentation are retained there. Timezone data can be
verified offline with `node scripts/timezone-data/build.mjs --check`.

`public/waves/01-multicolour-loop.mp4` contains the inherited ThreadShelf video stream, with private container metadata removed. The existing
day and early-morning loops remain unchanged. Runtime/data/media hashes and
public source provenance are in `licenses/holiday-provenance.json`.

The adapted rule JSON is separately licensed **CC BY-SA 3.0**; the parser is ISC
and bundled dependencies retain their notices in `licenses/HOLIDAY-LICENSES.txt`
and the runtime data folder. IANA timezone data is public domain. Retained source
metadata identifies upstream contributions and the application adaptations.
