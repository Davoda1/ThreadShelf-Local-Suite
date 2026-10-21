# Welcome-page holiday fireworks

## Enable the feature

1. Open **Settings → Appearance**.
2. Turn on **Wave video background**.
3. Turn on **Show video on welcome page**.
4. Turn on **Use holiday fireworks**.
5. Save settings.
6. Close the open conversation to view the welcome page.

All three settings are required. The two welcome-specific switches default to Off, as does the master wave option. On a recognized holiday, the multicolour fireworks loop replaces the normal welcome-page video. Conversations continue to show ordinary light/dark waves. Turning off a prerequisite stops the corresponding welcome playback; the application does not show fireworks behind message blocks.

## When the decision is made

The native app captures the configured operating-system country and local civil date **once when the GUI starts**. The holiday decision stays fixed until the process restarts. Leaving Reader open overnight, changing the operating-system region or changing the system timezone is not a request to reevaluate the day immediately. Close and reopen Reader if you need a new startup decision.

No country or date preference is stored for this feature, and there is no manual holiday/country picker in the interface. It does not use IP location, GPS, an account country or a network calendar service.

## Native country selection

| Platform | Country source | Date source |
| --- | --- | --- |
| Windows | Saved Country or region / Home location through native region APIs | Local timezone/date from the native query |
| GNU/Linux | Original named OS timezone mapped through bundled IANA country data | Current date in that saved OS timezone |
| macOS source builds | Saved native Region/locale country | OS timezone and local Gregorian date |

On Linux, the detector first checks the lexical `/etc/localtime` symlink, then a named `/etc/timezone`, then an optional bounded `timedatectl` query. It has no systemd dependency. `Europe/Budapest` selects Hungary even with an English interface or an English locale. Bare UTC, CET, numeric offsets or equivalent timezone-file bytes do not identify a country. A process-level `TZ` override does not replace the intended OS date policy.

On Windows, the region query is hidden, noninteractive and time-limited. If it is blocked or fails, the feature safely falls back to ordinary waves.

## Offline rule coverage

The bundled rule snapshot covers national public rules for many countries/territories and evaluates movable dates for the current year. It is not a finite list ending after a fixed ten-year span. It retains observed substitutes, durations and known exceptions from the frozen dataset.

The inherited Christian overlay includes Christmas Eve/Day/second day, Good Friday, Easter Sunday/Monday, Ascension and Pentecost Sunday/Monday according to the overlay’s country profiles. Some of these decorative observances can activate fireworks even where they are not official public holidays.

The snapshot cannot predict future government declarations, changed legislation or later moon-sighting decisions. Regional/state, school, optional or bank-only categories are generally excluded unless classified by the bundled data as national public holidays. The fireworks policy is decorative; it is not a legal, employment, school or payroll calendar.

## Why you might still see waves

| Condition | Expected result |
| --- | --- |
| Master wave option off | No wave/fireworks video |
| Welcome video option off | Conversation waves may run; welcome video does not |
| Holiday option off | Ordinary welcome waves |
| Date not recognized as a holiday | Ordinary welcome waves |
| Country unknown or date/rule evaluation fails | Ordinary welcome waves |
| A conversation is open | Ordinary conversation waves, including on holidays |
| Reduced-motion or animation policy suppresses video | No moving video as appropriate |
| App was started before the date/region change | Previous startup decision until restart |

## Preview difference

The standalone HTML Preview cannot read native Windows/macOS Region settings or the original Linux timezone configuration. It uses the browser's IANA timezone and local date once at page startup. Browser timezone canonicalization or unknown country can therefore produce a different holiday decision from the desktop app. Both use embedded rules without a network lookup. A preview result is not proof that native region detection selected the same country.

Related: [Appearance](appearance.md), [Troubleshooting](../Reference/troubleshooting.md).
