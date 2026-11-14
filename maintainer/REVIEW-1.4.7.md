# ThreadShelf Local Suite 1.4.7 review

Date: 2026-11-14

## Changes

Reader and Alternative improve archived ChatGPT cards, layouts, local widgets,
saved assets and charts. Reader adds a themed, animated conversation header with
aligned SVG controls and a persistent expanded/collapsed position.

The optional JSON response filter changes presentation and omits eligible hits
from the returned search page. It preserves queries, indexing, ranking, stored
data, ordering, raw totals and pagination. Existing empty-response display rules,
including unknown counts, saved bookmarks and safe excerpts, remain separate
from the new preference. Ordinary browsing and preference toggles do not fetch
whole conversations across the library.

All three application versions are 1.4.7. Analytics functionality and persisted
storage identities remain those of 1.4.6. Node 26.13.1, managed npm 12.2.2,
Electron 45.3.0 and application dependency pins are unchanged. Public application
identities, network policies, renderer isolation, Mermaid configuration and
third-party notices are retained.

## Local checks

| Check | Result |
| --- | --- |
| Existing Reader suite | 944 tests: 940 passed, 4 existing skips, 0 failed |
| Existing Alternative Node suite | 233 passed |
| Existing Analytics suite | 445 passed |
| Reader and Analytics renderer builds | Passed |
| Reader standalone Preview and Alternative standalone Demo | Built successfully |
| Existing release assembly checks | 68 passed |
| Existing runtime source-update checks | 11 passed |
| Public archive/cache integration | Passed without skipped feature checks |
| Public profile upgrade checks | 1.0.0, 1.1.0 and 1.4.3 passed |
| Existing Reader rendering browser checks | ChatGPT/Grok, Grok families and thoughts interface passed |
| Existing Alternative browser checks | Compatibility rendering and Reader parity passed |

Native Linux GUI acceptance uses isolated profiles and records application
outcomes only. It covers JSON visibility, restoration of the loaded results,
stable search totals and paging, header geometry and rolling motion, theme
styling, aligned controls, public version information and restart persistence.

The source review checks for accidental credentials, private configuration,
workspace paths and fixture data. Test files and GitHub Actions workflows are
unchanged. Lockfile changes are limited to application version metadata.

## Release verification

The runtime source-update archive was rebuilt with the existing verifier and
unchanged upstream input pins. Its SHA-256 is
`286c13ea2e5b53550702e2bad5342a72481bd63a038be5bc5f3d0537cf61538d`.

This review records local source acceptance. Windows/Linux package execution,
native speech checks and final release asset digests are reported separately by
the existing tag workflow in the generated verification report, evidence ZIP
and SHA256SUM.txt. Local checks do not predeclare GitHub workflow results.
