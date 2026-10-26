# Release verification — 1.0.0

This document records the historical 1.0.0 baseline. For the current Reader and Alternative release, see [1.2.0 scope and validation](REVIEW-1.2.0.md).

This public release uses the latest supplied Reader 3.3.0 Revision 9, Analytics 2.0.0 Revision 4 and Alternative 1.0.0 Revision 4 codebases, with public GUI versions reset to 1.0.0. Internal archive/schema compatibility identifiers are retained where they affect data interoperability.

## Automated checks

| Component | Result |
| --- | --- |
| Reader application tests | 523 tests: 519 passed, no failures, four optional compatibility/model checks skipped |
| Reader package-validator regression tests | 57 passed |
| Reader runtime/layout checks | 23 passed |
| Reader ↔ Analytics integration | Two additional end-to-end archive workflows passed, covering 7z/ZIP6 archives, read-only capture, backup/restore, rename/merge and concurrent writers |
| Analytics application tests | Linux: 316 passed, no skips; includes adjacent Reader capture, source-change detection and concurrent-writer protection. Windows totals and platform skips are recorded by CI |
| Analytics package-validator regression tests | 44 passed |
| Alternative application tests | 21 passed; deterministic renderer rebuild matched |
| Shared offline diagram renderer | 29 browser/security checks passed; locked rebuild matched both application copies |
| Server patch installer safety | 16 passed |
| Server search integration | 12 passed against real LanceDB and Express with 520 synthetic rows |
| Gopher manual | 99 generated HTML pages, zero strict build warnings; local links, assets and fragments checked |

The server checks cover keyword, semantic and boosted search, pagination and filters. They use synthetic vectors to exercise the query path; they do not validate a downloaded embedding model's semantic quality. Patch installation, repeat installation, dry runs and rollback were checked against the exact supported upstream baseline. Rollback restored all 12 recorded baseline fingerprints.

## Native packages

Each application has a Windows x64 portable ZIP, GNU/Linux amd64 portable TAR.GZ and Debian amd64 DEB. Package validation checks archive integrity, application-file parity, runtime inventories, native executable layout, required dependency/license files and Linux entry-point links. The Debian sandbox helper has the intended root ownership and mode.

Windows archives place the native application EXE at their root. Linux entries are native binaries or direct symlinks to native binaries. The GUI distributions do not use shell/CMD launcher scripts.

Build dependencies and runtime inputs are pinned in the source manifests, lockfiles and component packaging policies. Electron runtime archives are verified against their release checksums before packaging. See [BUILD.md](BUILD.md) and the component verification documents for details.

Reader and Alternative share a reproducibly rebuilt Mermaid **11.17.2** bundle with **DOMPurify 3.4.17** and **KaTeX 0.18.2**. The [renderer recipe](../tools/mermaid-bundle/README.md) includes exact dependency locks, generated component notices and bundle manifests. Browser checks cover light/dark diagrams, deterministic repair, offline rendering and regressions for the three dependency advisories addressed by this update. The locked renderer build graph returned zero reported npm advisories during release validation; this is a time-bound advisory result. Application versions and diagram configuration remain unchanged.

The successful **Build desktop packages** workflow retains machine-readable reports for each native platform. The combined release archive also includes a verification receipt. Reports under `maintainer/verification/` and `apps/alternative/docs/verification/` are explicitly labeled historical packaging/capture baselines; their archive hashes do not identify the rebuilt final release.

## Manual and UI checks

The manual was rebuilt with Gopher HTTP 3.0.0. The 26 new manual screenshots use synthetic records and public 1.0.0 product labels. Reader and Analytics screenshots exercise their actual compiled renderer code through controlled preview bridges. Alternative screenshots were captured from the native Electron application. See [screenshot provenance](../manual/SCREENSHOTS.md).

Reader also passed a native packaged Linux smoke test covering the main process, preload, archive worker, synthetic compressed-archive reading, local keyword search and persisted dark appearance, with no renderer errors or network requests. The package bytes were unchanged. The test accommodations (virtual display, test-only sandbox flag and singleton-lock accommodation) are recorded in `verification/reader.json`.

The native validation workflow launches each packaged executable on the executable's target OS in Electron's Node mode and verifies runtime identity. Reader additionally exercises SQLite storage, bundled compression, backup/restore, search and persisted settings. Analytics' Linux GUI check launches both the relocated portable package and extracted DEB, imports synthetic data, persists settings across restart, and checks that installed files remain unchanged; it does not disable the sandbox or bypass the singleton guard.

Windows GUI interaction and system-wide DEB installation were not tested. Alternative's earlier native Linux manual captures used Electron 44.4.5; the final runtime is 44.9.1, and those captures are not represented as a new-runtime GUI test. Screenshots, Node-mode execution and renderer tests do not establish every operating-system integration. Normal installation depends on desktop libraries, the display server and sandbox configuration. The public packages are unsigned.

## Source availability and validation scope

The release provides the suite Source archive, the Native-Sources companion and **all numbered** Runtime-Sources parts beside the binaries. The runtime mirror contains the complete pinned Electron/Chromium Git dependency trees selected for Linux x64 and Windows x64, together with the supplemental sources, build data and exact optimization profiles identified in the manifests. The dependency-condition audit records platform selection and external SDK/build-tool prerequisites.

The mirror's `assemble-runtime-sources.py` verifies inner archive hashes and can assemble an inspectable tree with Electron's original patches applied. These source-preservation checks do not establish a full native runtime rebuild or bit-for-bit reproduction of Electron's binaries. See [BUILD.md](BUILD.md) for commands and [runtime source access](../apps/reader/licenses/ELECTRON-SOURCE-ACCESS.md) for coverage and replacement instructions. Keep the suite source and both complete companions available with the corresponding binary downloads.

## Privacy and distribution review

The source snapshot excludes personal environment/configuration files, application state, conversation archives, history, ordinary installed dependencies, private test logs and build caches. Public defaults and examples use loopback or clearly synthetic values. The supplied owner's contact details, private website references, identifiable internal paths and branding were removed. Identifying metadata in all three bundled videos was removed without re-encoding their visual content. New manual screenshots contain synthetic data. A separate review inspected image/font metadata, SQLite fixtures and compressed historical test fixtures; those fixtures contain synthetic examples or empty databases.

Legitimate upstream author names, license notices, generic test fixture paths and example network syntax in third-party language grammars remain. These are required attribution or non-personal examples. A text scan alone is not a guarantee about all possible identifiers; it was combined with source, media-metadata and screenshot review.

The source tree's structural check is available as `python3 tools/check-public-tree.py`. The combined release archive has an inner `SHA256SUM.txt` for the nine native packages; the release-level `SHA256SUM.txt` covers all downloadable archives, including the Native-Sources companion and every numbered Runtime-Sources part. No old Git history is included in source archives. Follow [GITHUB-SETUP.md](GITHUB-SETUP.md) when importing the first public commit.
