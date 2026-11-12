# ThreadShelf Local Suite 1.4.6 implementation review

Release date: 12 November 2026. Public product versions are Reader, Analytics and Alternative **1.4.6**. This record describes local implementation and validation. It does not claim that a future GitHub workflow has passed or a release has been published.

## Scope

Analytics ports the incremental capture and exact disk-analysis design while preserving the public edition's full-text evidence, excerpt/full-text search, Markdown/code copying, opt-in text exports, offline owned-text reindexing and compatible finished captures. The worker heap ceiling stays 2 GiB. Existing profile and Reader archive/schema identities remain; new owned row-capture/body formats have independent identities. Reader source access remains read-only. Source mutation checks, Windows EPERM lease handling and original public fingerprint/cleanup semantics are retained.

Native bootstrap sends bounded descriptors, and requested tables/evidence/charts are paged. Complete exports stream from disk. Session pins protect historical evidence through refresh and retention eviction. Startup/import errors retain useful context; Retry rebuilds a missing report, and model filter searches keep independent state. Existing application geometry and plain OS titles remain.

Reader and Alternative retain their 1.4.5 application features. All three applications use Node 26.13.1 LTS and Electron 45.3.0 stable; managed npm remains 12.2.2 with its existing verified security profile. Parser/test-library minor versions with a clean audit remain pinned rather than introducing unrelated changes.

## Manual and attribution

The embedded manual is synchronized with official Manual commit `907fb9cbc94323d67c51f0463a92ae88758c95d5`. Its content version remains **1.4.5** for this fix release. All 44 current screenshots and editable sources, builder, image map and standalone rebuild tools are included. The Gopher builder/source/generated attribution now reads **davoda1**; existing third-party author/license notices remain intact. The root application license already named davoda1.

Executed manual validation: 106 source nodes, 120 generated HTML pages, 95 assets and 2,917 relative links/fragments passed. Standalone authoring check and complete offline rebuild passed. Thirty-two desktop/mobile file/HTTP browser checks passed with all 44 images and no external requests or page/console errors. The 234 published non-authoring website files match the official website bytes.

## Validation status

The frozen implementation passed these local checks. Existing test assertions and publication/native-security gates are preserved; narrowly scoped new tests cover the changed behavior.

| Check | Executed result |
| --- | --- |
| Analytics, Node 26.13.1 | 439/439 passed; no failures or skips |
| Analytics, Electron 45.3.0 / embedded Node 24.22.2 | 439/439 passed; no failures or skips |
| Reader, Node 26.13.1 | 940 passed, zero failed, four optional released-baseline/export/model cases skipped (944 total) |
| Alternative source suite | 233/233 passed |
| Release assembly/publisher regressions | 68/68 passed |
| Native-check orchestration | 16/16 passed |
| Reader / Analytics / Alternative package regressions | 71 / 54 / 5 passed |
| Streamed archive regressions | 3/3 passed |
| Source-companion regression scripts | 155 tests across ten scripts passed |
| Managed npm security boundary | 19/19 passed |
| Runtime source updater | 11/11 passed (also included in source-companion scripts) |
| Holiday generation/check | 12/12 passed |
| Locked diagram rebuild/check | Passed, with no external imports |
| Real UI export-handler to bounded backend | 14 checks passed |
| Reader/Analytics renderer and Alternative demo builds | Passed |
| Public tree, version/lock agreement and changed-source privacy scan | Passed |

The real-UI contract proof executes the actual form/table handler code against the production bounded service. It covers default JSON/CSV/HTML privacy, explicit complete text, shown historical records that were removed or reused the same ID with changed text, capture/diff context validation, current aggregates, consent-off omission, HTML safety and complete table-only TSV. It is not a native GUI execution claim.

Two synthetic production-service capacity axes passed with both main/worker old-space limits at 2,048 MiB. The raw input contained **5,014,270 object containers** across 153 independently bounded documents, retained 306 complete text records, completed in 10.36 seconds and peaked at 422 MiB process RSS. Its native descriptor was 2,625 bytes; full 40-instance report export and text longer than the evidence preview were verified.

The meaningful-record axis retained **25,000 text records and model names** with 12,500 distinct prompt hashes. Exact summary, first/middle/last model/chart pages, complete 25,001-line TSV and a 151,574,452-byte explicit legacy-compatible JSON export passed. The default response model matrix preserved its complete 50,000 exact cells while delivering the established top-40-model/160-cell plot, with the full population disclosed. The run completed in 77.41 seconds at 445 MiB peak process RSS. Both measured contributor queries used the new family and day/model indexes. Clean close removed disposable sessions and work.

Process RSS includes same-process workers and native allocations. Sampled main-thread heaps (54 and 22 MiB respectively) do not measure worker heaps. These are named synthetic-input measurements, not universal performance or input-size guarantees. No 400-million-object public run is claimed.

The matching runtime source supplement was built twice with identical bytes: **824,382,913 bytes**, SHA-256 `c29e59031d5d86a18cce02d88c529a48f6af078101700109e5adb4dcaced861c`. Its manifest SHA-256 is `f28fc65fb1a7c937bbfd7701783325450efe26ec53e9b0804ed30ee29499b8c5`. Qualification covers 945 source deltas, 12 Gitlink transitions, all three pinned optimization profiles, the V8 GN filename, all 352 current ordered patches and an actual updater extracted from the built artifact. It verifies 1,091 original paths and 115 initial absences using official source identities. This is source/update preservation, not a full historical source reassembly or runtime build.

All three application dependency audits reported zero vulnerabilities at verification time. Existing marked/Playwright minor pins were retained; no unrelated parser or test-tool update was introduced.

## Cross-platform lifecycle corrections before publication

The first GitHub run exposed two concrete problems. Seven new owned-row storage cases and six new disk-parity cases completed their substantive checks but attempted to delete temporary SQLite files before their separately registered close hooks. Linux permits this; Windows returned `EBUSY`. The fixtures now use one ordered teardown that closes all owned readers, writers, databases and leases before removing directories. All semantic assertions remain. A deletion guard reproduced the six original parity failures and verified all 14 corrected removals with zero open handles; the new storage lifecycle regression verifies closure immediately before removal. No production Analytics change, skip, retry or suppressed filesystem error was introduced.

The unchanged speech expiry test also exposed an early timer notification. The shared Reader/Alternative scheduler now rechecks the actual expiry deadline and reschedules an early callback before emitting availability changes. The original assertion remains strict. One additive deterministic regression per app covers a callback one millisecond early, a backwards clock adjustment, rescheduling, exact-deadline emission, expired availability and an empty RAM audio cache. Both complete speech suites pass 114/114 under Node and embedded Electron; Alternative's full CI command passes 233/233.

The table above records the repaired final local runs. Original unsuccessful-run logs were retained privately before their GitHub run records were deleted at the owner's request. Fresh workflow runs use the release title, retain the full native/security/publication gates and start from the corrected unpublished 1.4.6 tag. No CI pass is claimed here.

## Publication

The complete standard release contains nine native GUI packages, Reader Preview and Alternative Demo HTML, suite Source ZIP/TAR.GZ, manual ZIP, the genuine verified runtime source-update TAR.GZ, verification report/evidence ZIP and one SHA256SUM.txt covering the other 17 assets. Historical runtime, ONNX and native-source companions remain available under their original versioned links and checksums.

After local checks and source review, master and tag v1.4.6 are pushed for the exact reviewed commit. The existing six native package jobs and gated publisher build/verify/publish the full release. Per the owner's instruction, no waiting for CI is performed; actual workflow/publication status must be reported separately.

## Limits

This host restricts Unix singleton sockets and Chromium sandbox setup. Public validators retain their strict native/sandbox/singleton gates; local syntax, API/backend tests or separate functional browser accommodations are not native Windows/Linux gate evidence. No Windows native GUI pass or CI success is inferred from local cross-platform package inspection. The final CI-generated verification report requires the existing genuine native-host evidence.

Runtime source preservation verifies pinned source inputs, deltas, optimization profiles and reconstruction recipes. It is distinct from a full runtime compile or byte-identical reproduction of upstream Electron binaries. Physical disk capacity, processing time and individual-record/document limits remain practical constraints.
