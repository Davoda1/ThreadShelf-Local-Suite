# ThreadShelf Local Suite 1.3.1 verification record

## Scope

Reader, Analytics and Alternative report application version 1.3.1. Reader and Alternative use pinned MathJax 4.1.3 with bundled assets, the original licensed TeX font data and an application compatibility adapter. They also render exported ChatGPT/Codex file citations as readable file cards. Analytics receives the coordinated version update without a new math dependency.

Application profile names, archive/schema identifiers, the upstream ThreadShelf server 1.3.0 compatibility target, and Electron 45.1.0 / Node 24.22.1 / managed npm 12.2.1 with Undici 6.29.1 / Reader ONNX 1.31.1 remain unchanged. TTS is not part of this release.

## Completed local checks

- Reader file-citation unit tests: 10 passed. Related Markdown image, rich-layout and security-card tests: 10 passed.
- Alternative source tests: 59 passed, including its 8 file-citation cases.
- Reader and Analytics renderer builds passed with the unchanged pinned renderer dependencies.
- Reader and Alternative HTML previews generated successfully; their 3 and 15 inline scripts respectively passed JavaScript syntax checks.
- Existing Reader/Analytics package-validator suites and 19 package-layout tests passed. Three native-entry tests verified argument/environment/exit forwarding, missing-payload handling and rejection of script/symlink substitutes. Two additional flat-TAR validator cases passed.
- A bounded native MathJax test compared eight representative formulas in each reader at 680 px/light and 1100 px/dark against the actual public MathJax 3.2.1 baseline. All 32 comparisons matched SVG geometry, view boxes, glyph paths and accessible text. The new engine identified as 4.1.3 with the original TeX font. Renderer Node access remained absent; inline scripts, eval, workers and remote fetch remained blocked; no external requests or page errors occurred.
- The four MathJax assets in each app match the selected personal references; upstream archive integrity and the unmodified engine/assistive-MathML component bytes were also verified.
- Repository hygiene and whitespace checks passed. All 9 synthetic release-assembly safeguard tests passed; they run again before CI publication.

## Remaining validation and environment limits

The local workspace had insufficient disk capacity for the full nine native packages. Native Linux math checks used Electron with headless Ozone and the test-only root sandbox flag; they compared geometry/glyph data, **not screenshot pixels**. Local X11 could not initialize, so the file-citation GUI acceptance tests did not execute locally. No local Windows native execution or system-wide DEB installation is claimed.

The tagged package workflow performs clean locked installs, existing source tests, builds, archive/runtime validation and native GUI execution on Windows and Ubuntu. Its Linux jobs additionally run the focused MathJax baseline/pixel and file-citation checks. Publication is gated on all six package jobs and their successful evidence, the exact tagged commit, the expected asset inventory, and verified uploaded sizes/digests. It then publishes nine packages, two previews, source archives, verification evidence/report and one checksum manifest.

At source preparation time these CI results are pending. The user requested that execution not wait for CI; the workflow completes publication asynchronously after its gates pass. The independent Checks workflow retains its own status. Historical personal-edition or 1.3.0 evidence is not counted as a new 1.3.1 test execution.

## Assets and shared sources

The 1.3.1 release uses new application packages, Reader/Alternative HTML previews, a suite source ZIP/TAR.GZ and one `SHA256SUM.txt`. Unchanged Electron and ONNX source companions retain their original v1.3.0 filenames, URLs and checksums. The native-source companion and manual remain at v1.0.0. The v1.3.0 version-inventory workbook describes the unchanged runtime/toolchain baseline; the MathJax 4.1.3 replacement is recorded here and in its component provenance.

## Publication repair — 2026-10-30

The original commit `bf8f766956e3be24b006a856798738da3890a0d7` passed all three Checks jobs and all six Windows/Linux package jobs, including the focused rendering gates. Run `40968487775` failed only during publication: an existing draft was found, but its `/releases/tags/v1.3.1` lookup returned HTTP 404. The authenticated release list confirmed the draft and all 16 uploaded assets.

The publisher now resolves the draft by numeric release ID, preserving its identity and upload verification. A separate guarded recovery workflow can reuse the successful original artifacts and unchanged tag. Fifteen assembly/publication tests and four recovery-provenance tests passed; the recovery metadata gate also accepts the actual completed build run. Application code and package bytes are unchanged by this repair. Publication recovery is asynchronous and its success must be read from its own workflow result.
