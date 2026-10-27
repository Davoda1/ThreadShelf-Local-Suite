# ThreadShelf Local Suite 1.3.0 — local candidate review

Status: unreleased candidate, approved for a source commit and GitHub validation on 27 October 2026 after the telemetry review. This document records local and hosted candidate evidence. Final source companion, merged/tagged validation and publication checks remain outstanding. Base: d45446351d04ae51c3532eb55485823dac6a6802.

## Scope

Reader, Analytics and Alternative each identify as 1.3.0. Persisted profile identities, archive/storage formats, adapter versions, public data compatibility, and existing package entry layouts are retained. Electron is 45.1.0 (Chromium 156.0.8078.49, embedded Node 24.22.1). Release builds pin standalone Node 24.22.1 and upstream npm 12.2.1 with a separately recorded, verified Undici 6.29.1 replacement inside an isolated managed npm copy. The suite build helper, CI and Reader/Analytics source run.sh/run.ps1 helpers use that managed profile. See [NPM-TOOLCHAIN.md](NPM-TOOLCHAIN.md).

Updated candidates include Transformers 4.3.2, ZIP.js 2.24.0, marked 18.1.2, parse5 8.0.1, ASAR 4.3.1, esbuild 0.28.2, Playwright 1.64.1, Mermaid 12.2.0, KaTeX 0.19.1, and date-holidays 3.38.0. Mermaid's new style/layout defaults are explicitly configured for existing classic/Dagre presentation. Reader pins ONNX Runtime Web, Node and common to stable 1.31.1 through explicit local overrides. Its Transformers 4.3.2 source adapter loads the unchanged upstream source entry and external stable runtimes; unused prebuilt Transformers distributions are excluded from desktop packages because they embed an older Web runtime. This combination is locally tested, not claimed as an upstream-certified dependency pair.

## Completed local checks

- Reader: 601 passed; 4 existing optional tests skipped.
- Analytics: 316 passed; no skips.
- Alternative: 51 passed; no skips.
- Reader and Analytics renderer builds passed; Transformers, ONNX Runtime Web and Sharp native imports succeeded.
- Reader, Analytics, Mermaid and holiday dependency lock audits: zero known vulnerabilities at review time.
- Holiday data/engine: 38 tests passed.
- Shared Mermaid/KaTeX/sanitization/offline renderer: 29 checks passed in Chromium headless-shell 156.
- Alternative production renderer parity: 10 checks passed in Chromium headless-shell 156.
- Cross-app 7z/ZIP6 archive workflows: 2 passed. Resource cache/archive boundary: 9 checks passed.
- Public Reader 1.0.0 and 1.1.0 source/profile upgrade and reopen checks: 5 each passed, including byte preservation. These exercise historical source with the candidate dependency tree, not historical packaged executables.
- Server patch installer: 16 tests passed.
- Packaging validator regressions: Reader 69 and Analytics 53 passed (122 total), including actual ZIP/TAR/DEB rejection of the upstream default app and stale license metadata. Package-layout checks: 19 passed.
- Workflow syntax: actionlint passed. Existing test steps and permissions were retained; actions use verified full release commit SHAs.

Additional completed checks:

- Complete browser feature matrix passed, including 380 cache geometry cases, 80 queued images, Reader image/visibility controls, Alternative image loading and eight sizing layouts, and JSON rendering in four layouts.
- Visual baseline comparison: five diagram families in both themes preserve SVG viewBox dimensions; a small class-diagram stroke/raster difference remains. Labels are intact without clipping or mid-word wrapping.
- Both standalone HTML previews passed actual file:// browser checks in light/dark themes, show 1.3.0, render diagrams and math, preserve Original/Repaired switching, and produce zero page/console errors or HTTP requests.
- Supported upstream server integration: 12 native route/database tests passed against commit 3430dd04f50218fdea916b104709d24a651017fc, including 520-chunk pagination; uninstall restored source bytes and the final check passed.
- All three actual packaged Linux executables reported application 1.3.0, Electron 45.1.0, embedded Node 24.22.1, Chromium 156.0.8078.49 and x64.
- Packaged Reader: seven storage workflows passed; Sharp performed an exact PNG pixel round-trip; native ONNX CPU inference executed a synthetic Identity model successfully without remote models.
- Packaged Analytics: five service tests passed under its shipped Electron executable and shipped application modules.
- Packaged Alternative: 22 state/server tests passed under its shipped executable and shipped modules.
- Isolated Reader and Analytics source bootstrap/install flows passed and resolved Electron 45.1.0, Node 24.22.1 and embedded Undici 7.30.1. No lifecycle-script allowlist changes were required.
- Archive validation compares every official runtime member, application inputs, native file types, symlinks, notices and DEB sandbox ownership/mode. Final results are included in the local release verification report.

These checks use synthetic data. Headless-shell renderer checks do not certify native desktop GUI startup. Passing local checks alone is not a release sign-off.

## Stable ONNX Runtime verification

ONNX Web, native Node and common all resolve to **1.31.1**, with no nested prerelease package. Seven tests cover actual dependency resolution, quantized native CPU inference, source-adapter validation and both native telemetry suppression variables before desktop/worker initialization. Eight production-worker tests cover native Transformers, automatic portable fallback, explicit WASM, pooling/normalization, batching, empty/Unicode/long inputs and offline failure paths.

Reader’s Windows ZIP and Linux TAR/DEB were rebuilt with the stable dependency family and validated against current source, runtime and retained-license inputs. The actual packaged Linux executable passed native ONNX inference, the real multilingual native/portable model test, storage workflows and Sharp decoding. Native Windows execution subsequently passed in the hosted candidate matrix linked below.

Hosted Windows tests exposed a raw drive path passed to ONNX’s module loader. Portable inference now uses an encoded directory file URL for both module and WASM assets. Windows drive/UNC and POSIX path round trips pass, and real automatic fallback and explicit WASM inference pass from relocated paths containing spaces, `#`, `%` and Unicode with no fetch attempts. The regression failed before the correction. The full Reader suite passed again: 601 passed, four existing optional skips.

The configured public q8 multilingual model was tested before and after the update. All five English/Hungarian test embeddings are exactly unchanged within each backend (maximum component difference 0). Search ranking passes; native-to-portable minimum cosine similarity remains 0.998955. The established long-input tokenization difference between the two backends is preserved and tested separately. Chromium WASM main-thread and module-worker compatibility checks also pass without external requests or UI CSP changes.

ONNX 1.31.1's native binaries include telemetry. Reader sets both `ORT_DISABLE_TELEMETRY=1` and `ORT_RUNNING_UNIT_TESTS=1` in the main process before Electron or workers initialize. The first disables the 1DS uploader; the second also prevents the Windows product-telemetry provider from registering. The latter is an upstream internal suppression switch, used here as an explicitly reviewed compatibility measure for this exact pinned version. A complete scan of all 11,379 regular files in the upstream source archive found its only production effects in telemetry guards; it does not bypass inference or application tests. Re-review this use for every ONNX update. Ordinary OS diagnostic logging remains available to an explicitly enabled local trace session; Reader does not enable such a session or configure a telemetry/crash-upload service. Tests verify both native process variables in nested workers even when the launch values start at 0. A separate C `getenv` probe confirms why worker-local JavaScript changes alone are insufficient. These checks are distinct from JavaScript model-fetch blocking. Source evidence is retained in `maintainer/onnx-source-inputs/1.31.1/telemetry-flag-scan.json`.

The earlier local Linux package, before the later file-URL correction, also passed a calibrated native libc observation with real native and automatic-WASM inference before and after a 120-second idle interval (128.429 seconds total). Both incoming suppression flags were 0 and became 1; the native library read the upstream hard-suppression flag. No network API calls, JavaScript fetch attempts, device-ID files or telemetry databases were observed. Kernel tracing was unavailable, so this is finite-window libc observation, not a kernel trace or a claim about native Windows/desktop GUI execution. Calibration and reproduction sources are retained with the release evidence. Repeat this observation on the exact tagged CI package before publication.

Exact upstream source/npm provenance and retained notices are in `apps/reader/licenses/ONNX-SOURCE-ACCESS.md` and `ONNX-PROVENANCE.json`. The source preparation inventory is `maintainer/onnx-sources-1.3.0.json`; complete ONNX source companions remain part of the existing publication gate.

## Packaging notes

The candidate preserves the public package layouts. Repeated builds defensively remove the specific DEB entry link immediately before recreating and verifying it, because the managed staging filesystem retained an old entry during local rebuilding. The archive audit also found stale dependency notices and a missing negative check for Electron's default demo app. Notices were regenerated from the installed locked tree; packaging now excludes the demo explicitly, and archive validators reject it and unexpected retained license files. Regression tests cover these rejection paths. Reader DEB assembly also copies the filtered file inventory so disappearing managed temporary filenames cannot interrupt the copy. No runtime/profile behavior changes with these packaging fixes. Local final DEBs use supported gzip level 6 compression, as Alternative already did; this is a build environment selection, and archive contents are validated independently of the compression format.

## Security and execution limits

Electron 45.1.0 was released during review. It updates embedded Node to 24.22.1 and supersedes the identified older-Node concern in Electron 45.0.0. Installing a newer standalone Node does not modify Electron's embedded runtime.

The official npm 12.2.1 and 11.21.1 tarballs inspected on 27 October 2026 both bundle Undici 6.29.0. The candidate therefore uses an isolated npm 12.2.1 copy with the complete official Undici 6.29.1 package substituted for that dependency. Both input tarballs have pinned SHA-512 integrity values; the managed profile verifies its full file inventory and node-gyp's actual module resolution before use. This is a documented local toolchain modification, not a new official npm release or a global npm update. The separate application lockfile Undici entries and Electron's embedded Undici remain 7.30.1.

Independent dependency checks reproduced the original unhandled-error process crash and safe handling after replacement: four regression cases passed across Client and RetryAgent. Seven actual node-gyp consumer checks passed on each version, including redirects, gzip, retries, proxy bypass and custom-CA HTTPS. Undici 6.29.1 satisfies node-gyp's `^6.25.0` requirement and is outside all five affected ranges reported for 6.29.0 at review time. Final local integration verification passed: 19 managed-toolchain security/integrity tests, clean Reader and Analytics installs/builds/source suites, all four Linux/Windows-target dependency preparation paths, 12 Reader runtime-policy tests, four Reader PowerShell and seven Analytics PowerShell fixtures, plus Mermaid and holiday clean builds/tests. Both copies of the bootstrap are identical. Updated CI definitions passed actionlint; corrected-head GitHub and native Windows validation passed as recorded below. The npm bundled-Undici blocker is resolved for the managed build paths. A clean application npm audit is not proof that every runtime or toolchain component is vulnerability-free.

This container blocks the local Unix sockets required by normal Chromium/Electron process-singleton startup and Xvfb. Supported headless-shell renderer checks work, but do not replace native desktop GUI execution. Native Windows execution requires a Windows runner. No production sandbox/IPC checks were weakened to work around the host restriction.

## Initial hosted validation and corrections

The first source candidate, `fd8c1938b1ac77b1de76b0783da5345f72d895f8`, was pushed in
[PR #1](https://github.com/Davoda1/ThreadShelf-Local-Suite/pull/1).
[Checks](https://github.com/Davoda1/ThreadShelf-Local-Suite/actions/runs/40595431212)
passed server integration and exposed an Alternative test that still expected
1.2.0. The [package matrix](https://github.com/Davoda1/ThreadShelf-Local-Suite/actions/runs/40595504316)
passed Reader and Alternative Linux native GUI validation. Analytics Linux
stopped on a test assertion expecting 1.0.0, and Windows preparation stopped
because GNU tar treated an absolute drive-letter archive path as a remote host.

The first correction exposed a second GNU tar boundary issue: direct Node
spawning does not translate a Windows backslash destination for `-C`. The final
correction uses the extraction destination as Node's working directory, passes
a relative archive path with forward slashes and omits `-C`. A new regression
verifies real extraction
and the unchanged full managed npm fingerprint; all 19 toolchain tests pass.
Current GUI/browser harnesses derive their strict version expectations from
the source manifests, retaining rejection of stale packaged versions. Historical
profile and schema fixtures retain their original versions. The complete
eight-suite browser feature matrix passed again after these corrections.
The corrected application head `8096ff80bce87c187c2260151392af006dea71a3`
passed all three [Checks jobs](https://github.com/Davoda1/ThreadShelf-Local-Suite/actions/runs/40599037216)
and all six [desktop package jobs](https://github.com/Davoda1/ThreadShelf-Local-Suite/actions/runs/40599081590).
These results cover the application changes at that head. Final source/notices
and GUI-coverage additions still require candidate and merged/tagged validation.
The original failures remain in the run history.

## Publication gates

The npm toolchain gate has passed local verification. The user authorized the source commit and GitHub upload on 27 October 2026, conditional on the telemetry review. That authorization permits running the hosted validation; it does not make incomplete publication gates pass.

1. Complete the matching Electron 45.1.0 runtime/native source companions, recursive sources and supplemental material, then assembly/patch verification. The historical 44.9.1 mirror does not cover this candidate. Completing the mirror needs a larger preparation workspace plus recursive dependency resolution, retrieval and verification; current free storage is below the historical distribution size alone. See RUNTIME-SOURCE-PREPARATION.md and runtime-sources-1.3.0.json. Publication-check intentionally fails until this is complete.
2. Pass existing packaged GUI gates on ordinary Linux and native Windows runners. The previous green candidate covered Analytics Windows archive/native runtime checks. A focused shared-harness GUI gate now checks production startup, settings IPC, visible language/theme, graceful writer-lease release and persisted restart; native Windows execution of this added gate is pending.
3. Run GitHub Checks and all desktop package matrix jobs for the exact approved candidate, then the merged commit. Investigate failures and rerun transient failures on the same run; retain failure history.
4. Finish privacy/asset review, tagged source snapshots, matching previews, notices, source companions and one release-level SHA256SUM.txt covering every attached asset. Only then switch root README download links to the new release and publish.

## Proposed commit and merge text

Title: Prepare Suite 1.3.0 with Electron 45.1 and stable ONNX

Description: Align Reader, Analytics and Alternative at 1.3.0 with Electron 45.1.0 and Node 24.22.1. Pin all ONNX runtime packages to stable 1.31.1, load Transformers from its supplied source, and disable both native network telemetry and Windows product-telemetry registration before workers initialize. Resolve npm’s bundled-Undici issue through the verified isolated npm 12.2.1/Undici 6.29.1 profile. Refresh dependency locks, notices, documentation and CI while preserving archive/profile compatibility and existing renderer presentation. Local verification includes 968 application passes, 122 packaging regressions, real-model native/WASM parity and toolchain security checks. Hosted platform checks and complete matching source companions remain publication gates.

This text is a draft, not a claim that outstanding release gates have passed.
