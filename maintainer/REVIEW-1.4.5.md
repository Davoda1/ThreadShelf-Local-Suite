# ThreadShelf Local Suite 1.4.5 verification record

## Scope

Reader corrects conversation merging and cleanup within each collection. Reliable-provider identities use provider plus conversation ID. Identical snapshots retain one copy; an exact longer continuation supersedes its shorter prefix, while other snapshots with the same reliable ID resolve to the newest record. Distinct reliable IDs remain separate. VeniceAI retains content-based matching because its export IDs are not stable; its preservation checks and Grok’s cross-ID cleanup rules retain divergent answered branches. Import and server-copy processing perform merging and cleanup together, with progress reporting; existing Local data can be reviewed separately, and an active review can be reopened from settings. Superseded conversation copies are deleted while relevant source metadata and saved reading references follow a retained survivor.

Grok/xAI single unanswered user prompts and eligible superseded unanswered endings receive automatic cleanup. Attachments and substantive assistant, tool or reasoning content remain meaningful. The optional default-off setting explicitly applies to providers other than Grok/xAI; provider identity determines the rule, regardless of the selected model.

Reader and Alternative correct native HTML preview sizing, initial placement, application zoom and clipping while scrolling. HTML fills the code-block interior at a responsive 16:9 ratio, without an additional frame or margin, and uses a transparent loading surface. HTML-specific layout rules leave Code and other render modes unchanged. Both apps add default-off code wrapping and display-only logical line numbers. Numbers appear only in Code view; HTML, SVG, Mermaid and chart render views have no gutter. Clipboard and export retain source text.

All three applications report 1.4.5. Analytics has no functional or dependency changes. Public profiles, archive schemas, network restrictions, optional provider behavior, dependency/runtime pins and original MIT licensing remain unchanged. Copyright remains 2026 davoda1, with third-party notices preserved.

## Release and test safeguards

The Windows native-path ESM normalizer and dedicated native HTML-host report output from the preceding release remain in place. Release assembly requires six successful native application/platform jobs, successful GUI and packaged CPU speech evidence where applicable, tagged-commit publication ledgers and exact asset hashes. Native process diagnostics are not accepted as verification JSON. The narrowly scoped historical 1.4.4 report-recovery exception cannot apply to 1.4.5.

The full release set contains 18 assets: nine native packages, two HTML demonstrations, suite source ZIP/TAR.GZ, manual ZIP, the runtime source-update TAR.GZ, verification report/evidence ZIP and one SHA256SUM.txt covering the other 17 files. Package layout requirements remain a root Windows EXE, a real Linux portable entry point and a regular native Debian /usr/bin entry point, with no GUI launcher scripts.

## Validated documentation and source inputs

The manual rebuild passes Gopher HTTP 3.0.0 strict validation: 97 source nodes, zero warnings, 111 generated HTML pages and 2,709 checked local links/assets with no missing targets or fragments. Reading instructions describe the new code preferences, HTML geometry and collection-scoped cleanup. Historical 1.4.0 screenshots retain their original provenance.

The versioned runtime source supplement was rebuilt from its pinned inputs and recorded with 1.4.5 metadata: 809,779,558 bytes, SHA-256 7a8a34a239691d5b2e736aac4cf232d70e0546820629af9ea59e8857f258bb4c. It still requires all six historical v1.3.0 Runtime-Sources parts and their metadata. Existing ONNX and sharp/libvips source offers keep their original names and scope. Ten runtime source-update regressions, the Reader/Alternative/Analytics package-validator regressions and server-patch checks pass.

## Local validation

- Reader source and speech suite: 940 tests, 936 passed, zero failures and four existing optional/fixture-dependent skips. Production renderer build and ten Linux/Windows entry-path regressions pass.
- Alternative source suite: 225 passed, zero failures or skips. Its self-contained Demo builds successfully. Analytics: 316 passed, zero failures or skips; renderer and calculation worker build successfully.
- Native Linux HTML host checks retain sandboxing and verify separate preview processes, bounded geometry, zoom, clipping, navigation/resource restrictions and teardown. Reader layout checks cover six size/theme cases and 198 scroll checkpoints. Alternative covers initial placement at 125% zoom and 33 scrolling checkpoints.
- Native code-option checks cover all four preference combinations, default-off behavior, logical line numbers, wrapping, clipboard/source preservation, persistence and render-mode gutter exclusion. Paired layout checks cover 32 Reader and 64 Alternative comparisons, including Code, SVG, Mermaid and charts.
- Public archive integration passes both 7z and ZIP6 Reader–Analytics workflows, nine cache/storage checks and five upgrade/rollback checks for each exact public 1.0.0, 1.1.0 and 1.4.3 baseline. The upgrade harness reads the candidate version from its manifest rather than requiring a previous product version.
- All 15 browser feature suites pass without skipped feature checks, including the 380-case cache layout matrix, 80-image queue, image/visibility/ONNX WASM behavior, SVG/JSON source preservation and Grok/ChatGPT/inline-formatting compatibility.
- Sixty release evidence, publisher, run-provenance and speech-gate regressions and six native-path ESM regressions pass. They preserve the Windows native-path ESM and dedicated JSON-output fixes. New release gates reject missing, malformed or failed code-option, geometry and spacing evidence on either native host.
- Changed-source review found no detected credentials, private profile data or machine-specific paths. Public-tree, version/lock consistency and whitespace checks pass. This review does not claim exhaustive secret detection.

Local native UI tests retain the Chromium sandbox. The environment cannot provide the application's Unix-domain single-instance socket, so production-application tests use an explicitly recorded test-only lock accommodation. Hosted publication gates reject accommodated evidence and require ordinary native execution. No local native Windows execution is claimed.

## Cross-platform test fixtures

The first Windows source run rejected a synthetic POSIX-only file URL used as the trusted application entry in the geometry IPC test. Windows file-URL parsing requires a native absolute drive or UNC path; the production trust guard correctly rejected the invalid fixture. Reader contained the same test assumption.

Both host-unit suites now derive their native fixture URL with `pathToFileURL` and repeat the complete geometry IPC assertions with explicit Windows and POSIX parsing on every host. These cases cover owning main-frame identity, bounded updates, rejected untrusted callers and invalid geometry, fixed channel behavior, closed previews and owner teardown. Production trust and sandbox rules are unchanged.

Disk-space preflight fixtures also use native temporary paths and separator-aware containment when classifying the mocked data, temporary and compression filesystems. Their existing low-space, separate-volume, combined-reservation and nearest-existing-ancestor assertions remain in place.

## Validation limits and publication

Local source and renderer checks do not establish native Windows behavior or completed publication. The tag workflow supplies the native Windows/Linux package, GUI, speech and isolation evidence before release assembly. Debian validation uses extracted payloads rather than a system-wide installation. The packages are unsigned. Source validation does not claim a fresh native runtime rebuild or byte-identical reproduction.

CI and publication remain asynchronous. Their actual outcome is recorded by GitHub; pushing a tag or passing local checks alone does not establish a published release.
