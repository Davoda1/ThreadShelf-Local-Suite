# ThreadShelf Local Analytics 1.3.0

An offline Electron desktop companion for examining archived AI conversations. It reads ThreadShelf Local Reader storage and supported exported files without writing to the sources. Analytics owns the settings, captures, derived indexes, views and annotations it creates.

This application is part of [ThreadShelf Local Suite](https://github.com/Davoda1/ThreadShelf-Local-Suite). See the suite manual and [Analytics user guide](docs/User-Guide.md) for the complete workflows.

## Install and start

| Package | Start |
| --- | --- |
| `ThreadShelf-Local-Analytics-1.3.0-Windows-x64-Portable.zip` | Extract, then open `ThreadShelf Local Analytics.exe` at the archive root. |
| `ThreadShelf-Local-Analytics-1.3.0-Linux-amd64.tar.gz` | Extract, then open `bin/threadshelf-local-analytics` or the root executable link. Both point directly to the native executable. |
| `threadshelf-local-analytics_1.3.0_amd64.deb` | Run `sudo apt install ./threadshelf-local-analytics_1.3.0_amd64.deb`, then open the desktop application. |

Ordinary use needs no administrator privileges, separately installed Node, archiver, AI model or network connection. Source scripts are development tools.

1. Open Analytics and use **Find Reader archive** to locate the standard Reader profile. Alternatively, add a Reader archive directory or a supported export file/folder.
2. Wait for the initial capture and analysis to finish. A capture is an Analytics-owned copy of the permitted source data.
3. Choose a workspace and apply source, provider, model and date filters. Check coverage and eligibility before interpreting a chart.
4. Open chart evidence to inspect the records behind a measurement. Export CSV, JSON or a self-contained HTML report when needed.

Normal startup uses complete owned captures. Explicit refresh reads a coherent source publication. Unavailable sources keep their previously captured analysis. Analytics does not require a ThreadShelf server connection; Reader and supported exports provide the input for Analytics.

## Features

Activity, Models, Content & code, Structure, Tools and Coverage summarize recorded data. Explorer adds Distributions, Relationships, Sequences, Compare and Observability, with 32 chart families and exact tables, eligibility contracts and evidence drilldowns. Missing metadata stays unavailable.

The interface includes 17 UI themes, 10 independent code themes, five languages, a full-year calendar and chart-local hover choices. The minimum desktop window is 680 × 540; dense content scrolls inside the containing panel. Safe Markdown evidence never loads remote images, and links require an explicit action.

## Privacy and storage

Reader preferences, bookmarks, reading positions/history, Activity cache, semantic indexes and unrelated profile data are excluded from analytics. No telemetry, automatic remote content, update checks or server dependency is present.

Captures contain conversation text on your computer. Default reports exclude evidence text, conversation titles and source paths. Some aggregate categories, such as provider and model names, can still describe your activity. Evidence and labelled exports require explicit inclusion; review reports before sharing.

Capture history is disabled by default. When enabled, choose count and byte limits in Analytics settings. The active capture and protected recovery predecessor are independent of routine history eviction. Removing a source or clearing that source's cache deletes positively owned Analytics data only.

The candidate application version is 1.3.0. Storage and interchange formats have independent versions; see [Version contracts](docs/Version-Contracts.md) and [Storage formats](docs/Storage-Formats.md). Existing supported captures retain their identities and full text. Never run independent legacy and current writers against the same profile concurrently.

## Build from source

The release toolchain is Node **24.22.1**, Electron **45.1.0**, and an isolated managed copy of npm **12.2.1** with its bundled Undici replaced by the complete official **6.29.1** package. The helper verifies pinned archive integrity and the resulting files. This is a local toolchain modification, not an official patched npm release, and does not change global npm. Application dependencies are locked in `package-lock.json`.

Run the following commands from the Analytics application directory in a source checkout/archive. Packaged desktop applications do not include or require the source build helpers.

```sh
./scripts/run.sh --build
./scripts/run.sh --test
```

On Windows, use `scripts/run.ps1 -Build` and `scripts/run.ps1 -Test`, or the matching `run.cmd` wrapper. These scripts obtain the pinned isolated Node runtime by default and use the managed npm profile. With Node 24.22.1 already selected, the direct source commands are `node scripts/npm-toolchain.mjs -- ci`, `node scripts/npm-toolchain.mjs -- run build` and `node scripts/npm-toolchain.mjs -- test`. See [Packaging policy](docs/Packaging-Policy.md) for package creation and system-runtime options.

Tests use synthetic fixtures. Architecture, provider support, counting definitions and security contracts are documented in `docs/`. Third-party source offers and notices are included with the source and binaries.

Copyright (c) 2026 davoda1. Application code is licensed under the [MIT License](LICENSE). Bundled components retain their own licenses; see [third-party notices](THIRD-PARTY-NOTICES.md).
