# Startup region integration

Copy `startup-region.mjs` and `timezone-countries.mjs` next to the Electron main entry point. Import `detectStartupRegion`, await it once at GUI startup, and retain the result for that GUI session:

```js
import { detectStartupRegion } from './startup-region.mjs';
const startupRegion = await detectStartupRegion({ electronApp: app });
// { country: 'HU', source: 'os-timezone:localtime',
//   timeZone: 'Europe/Budapest', localDate: '2026-10-15' }
```

The holiday evaluator should receive `startupRegion.country` and `startupRegion.localDate`. A null country or date disables the holiday override. On Windows, `timeZone` is the Windows identifier, provided for diagnostics; use the already-derived civil date directly. There are no repeated checks, network requests, global environment changes, configuration writes, or native daemon changes.

Linux reads the original `/etc/localtime` symlink target. Country lookup precedes any timezone canonicalization, preserving names such as Europe/Bratislava. A named `/etc/timezone` is the second choice only if the primary name cannot be recovered. An optional bounded timedatectl query is last; systemd is not required. UTC, CET, offsets and unknown names yield no country. Locale variables and byte comparison of timezone files are never used to infer country. The civil date is formatted in the saved OS timezone, independently of inherited `TZ` overrides.

Windows runs a hidden Windows PowerShell query, with no profile, no interaction, no shell command interpolation, no policy bypass and a 4.5-second timeout. It calls GetUserDefaultGeoName through an in-memory P/Invoke declaration; the older GetUserGeoID/GetGeoInfoW pair covers early Windows 10. The same query reads the OS-local civil date. This is an internal OS query, not an app launcher or a script delivered beside the EXE. A blocked or unavailable OS query falls back to normal theme playback. Electron's Windows getLocaleCountryCode is deliberately excluded: inspected upstream source uses GetLocaleInfoEx for formatting locale, which is a different setting from Home Country.

On macOS, the injected Electron app.getLocaleCountryCode uses CFLocaleCopyCurrent and kCFLocaleCountryCode, matching saved Region. The OS timezone supplies the local date. If needed, a bounded built-in osascript query accesses Foundation's NSLocale and NSTimeZone directly. No Apple Events to other applications or location services are requested.

## Validation

`node --test startup-region.test.mjs`: 15 tests passed. Includes Budapest with en_US locales and TZ override, country-specific alias preservation, non-systemd fallback, unknown country, date boundary/DST behavior, and Windows/macOS response handling. A native Linux probe was also exercised; machine-specific results are omitted. Windows/macOS native query execution remains untested on actual Windows/macOS hosts; their control flow and output contracts were tested with mocks.

## Data and API provenance

The 500-entry timezone map and 249-country validator derive from IANA tzdb version 2026e, obtained 2026-10-15. Exact zone.tab country-specific names are retained. Additional backward aliases are admitted only when their ultimate zone1970.tab target overlaps exactly one country. Generic single-component names and Etc/SystemV aliases are excluded from additional country inference. This intentionally leaves some historical ambiguous aliases unknown. Source data is public domain.

- https://data.iana.org/time-zones/tzdb/zone.tab
- https://data.iana.org/time-zones/tzdb/zone1970.tab
- https://data.iana.org/time-zones/tzdb/backward
- https://data.iana.org/time-zones/tzdb/iso3166.tab
- https://data.iana.org/time-zones/tzdb/version
- https://raw.githubusercontent.com/electron/electron/main/shell/browser/api/electron_api_app.cc (GetLocaleCountryCode)
- https://learn.microsoft.com/en-us/windows/win32/api/winnls/nf-winnls-getuserdefaultgeoname
- https://developer.apple.com/documentation/foundation/nslocale/countrycode
- https://www.freedesktop.org/software/systemd/man/org.freedesktop.timedate1.html

The raw IANA files in this working directory are provenance inputs, not runtime dependencies. Only the two MJS modules are required in the app. The test and this note are included in the source archive.
