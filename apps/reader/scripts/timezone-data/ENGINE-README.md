# Reproducible timezone-country data

This directory preserves the exact IANA Time Zone Database **2026e** inputs used by ThreadShelf Local Suite **1.0.0**. The generator uses Node.js built-ins only. Rebuilding and checking require no network, npm packages, system timezone database, locale settings, or systemd installation.

From the Reader source root (`apps/reader/` in the suite):

```sh
node scripts/timezone-data/build.mjs --check
node scripts/timezone-data/build.mjs
```

`--check` verifies every preserved input against the single `provenance.json` manifest, then compares the generated output byte for byte with `src/desktop/holiday/src/timezone-countries.mjs`. It exits unsuccessfully if any input or output differs. Without `--check`, the generator replaces that runtime module. The destination is resolved relative to the generator, so both commands also work when the script is invoked from another working directory. Node.js invokes these source tools directly on Windows, Linux, and macOS; no app launcher is involved.

An alternative destination is useful for review:

```sh
node scripts/timezone-data/build.mjs --output timezone-countries.review.mjs
```

The default output is **500 named timezone mappings** and **249 ISO country codes**. Generation order, line endings, spacing, and comments are deterministic. No build timestamp, machine path, or host setting is embedded in the generated module.

## Mapping policy

The 418 exact `zone.tab` entries retain the country attached to the original selected timezone name. This is deliberately done before canonicalization: `Europe/Bratislava` identifies Slovakia even though the timestamps are equivalent to `Europe/Prague`; `Europe/Copenhagen` identifies Denmark even though the clocks can share the Berlin data.

`zone.tab` is deprecated as a general timezone enumeration interface. The country-specific original names remain useful for this narrowly defined background-selection policy. `zone1970.tab` groups locations with equivalent civil timestamps since 1970 and can list several countries for one timezone; that combined group must not be interpreted as a unique country.

Additional aliases from `backward` are included only when all of the following hold:

- The original alias was not already supplied by `zone.tab`.
- It has a slash-separated name and does not belong to the `Etc/` or `SystemV/` families.
- Following the alias chain reaches a `zone1970.tab` entry with exactly one country.

This admits useful old names such as `Asia/Calcutta`, `Europe/Kiev`, and `US/Eastern` while leaving ambiguous additional aliases unknown. Country-specific original names always take precedence. Single-component abbreviations, UTC, numeric offsets, language tags, and locale-country guesses are never added.

The validator follows the 249 ISO 3166 codes preserved in `iso3166.tab`. Recognition of a country here does not imply holiday-data coverage for that country; the holiday evaluator separately checks the holiday data.

## Provenance and updating

`iana-2026e/` contains the unmodified `zone.tab`, `zone1970.tab`, `backward`, `iso3166.tab`, and `version` files retrieved on **2026-10-15** from:

- https://data.iana.org/time-zones/tzdb/
- Versioned upstream archive: https://data.iana.org/time-zones/releases/tzdata2026e.tar.gz

The preserved input hashes, source URLs, version, expected counts, and derivation policy are recorded together in `provenance.json`. These IANA data files are public domain; their original comments and notices are retained. The runtime file carries the same provenance and public-domain notice.

For a deliberate future update, obtain one consistent upstream release, preserve the release inputs in a new versioned directory, update the single provenance manifest and expected counts, regenerate the module, inspect the mapping changes, and rerun the startup-region tests. Do not replace individual snapshot inputs without updating and reviewing their provenance. No update operation occurs in the shipped GUI.

The runtime app needs only the generated MJS module. This directory belongs in the source archive, alongside development tools, and is not a separate user-facing artifact.
