# ThreadShelf Local Suite 1.4.3 verification record

## Scope

Reader and Alternative improve archived Grok and ChatGPT rendering. Grok XML markers use bounded parsing and available saved metadata for citations, media, charts, SVG icons and inert fallback panels. ChatGPT citations, file line ranges, entities, source lists and unknown widget records receive source-preserving handling. Markers inside inline and fenced code remain literal. The public edition retains its existing image-request isolation, profile paths, application identities and ONNX privacy initialization.

Archive entries and network responses have explicit decompressed/streaming limits; archive content with trailing compressed data is rejected. All three applications use version 1.4.3. Analytics has no new user-facing features; its runtime/dependencies are refreshed with the suite.

## Toolchain and source access

The development toolchain uses Node.js 26.13.0 LTS and verified managed npm 12.2.2 with the documented dependency fixes. Electron 45.2.3 embeds Node.js 24.22.2 and Chromium 156.0.8078.80. Markdown and HTML parsing use marked 18.1.3 and parse5 8.1.1, and Reader/Analytics bundle 7-Zip 26.06 with corresponding source. ONNX Runtime remains 1.31.1, and the bundled speech payload is unchanged.

The runtime source-update supplement is required alongside the historical v1.3.0 runtime source collection. The old collection alone is not represented as matching the updated runtime. Original upstream notices and reconstruction requirements are preserved. The source-update artifact was built locally and independently accepted by the release assembler: 809,779,558 bytes, SHA-256 `031167e194d6f444f7efbbfa24603f03e797d3c5a064660c2ee87adeeed3c38a`. Its 482 changed-file outputs match separately retrieved current upstream bytes; exact archive and PGO inputs are hash pinned. Ten source-update safety/determinism regressions pass. An end-to-end run of the actual packaged updater processes all 482 deltas, fully extracts the Electron and embedded Node source archives, and installs/verifies all three release profiles. This uses a sparse fixture containing every original changed file and does not claim a fresh full historical source-tree assembly or a native runtime rebuild. A fresh isolated offline run checks and applies all 380 ordered Electron patches across 1,288 original touched paths; 123 initially added paths are independently confirmed absent from the original source archives or Git trees. The retained source evidence records its sparse verification scope. The builder uses deterministic gzip framing to keep the recorded artifact identical across supported Python/zlib versions.

## Local validation

- Reader: 791 tests discovered, 787 passed, zero failures and four existing optional skips. Analytics: 316 tests passed without skips. Alternative: 188 unit/speech tests passed. Reader and Analytics production builds pass.
- The complete browser regression gate passes all 13 suites without skipped feature checks, including the 380-case cache layout matrix, 80-image queue, visibility, ONNX WebAssembly, image sizing, JSON, SVG/Code and the new Grok/ChatGPT suites. The local run used official Chrome Headless Shell 156.0.8078.4 with the pinned Playwright driver.
- Native Electron 45.2.3 checks pass both Reader Grok/ChatGPT matrices and Alternative compatibility layouts at narrow/wide sizes and light/dark themes. They verify inert content, original copied text, permitted image handling, readable charts/icons, and zero unexpected network requests or page errors. The existing native Reader SVG suite passes 27 fixtures, five checks and four layouts.
- The Reader standalone preview passes native offline rendering/copy checks with its new synthetic Grok/ChatGPT example and public 1.4.3 metadata. The Alternative demo builds as a self-contained 1.4.3 file with the new compatibility fixture and embedded styles. Alternative renderer rebuilds reproduce identical bundled JavaScript and CSS.
- Integration checks pass both 7z/ZIP6 Reader–Analytics workflows, nine cache/storage checks, and five upgrade/rollback checks for each exact public 1.0.0 and 1.1.0 baseline, without skipped feature checks. These checks use final 7-Zip 26.06 bytes; the historical baseline checkouts remain unchanged.
- Managed npm/matcher security checks pass 25 tests. Holiday generation/security checks pass 12 tests and retain byte-identical generated holiday data, engine and notices. Reader, Analytics, Alternative, diagram-helper and holiday dependency audits report zero known vulnerabilities at validation time.
- Package validators, 55 server-patch tests, historical runtime-source assembly safeguards and 45 release publication regressions pass. New publication requirements include successful Grok/ChatGPT evidence and the verified source-update companion. Original native GUI, speech and asset-integrity gates remain enforced.
- Alternative Windows branding was checked statically against the current Electron executable: numeric file/product versions are 1.4.3.0 and string metadata agrees. This check does not execute Windows or establish native Windows behavior.
- Independent diff review identified and fixed inherited-property handling in unknown widget labels. The public-specific image network policy, profile recovery and ONNX privacy guards remain intact. Changed-file scanning, metadata syntax, public-tree and whitespace checks pass; scans do not guarantee detection of every possible issue.

## Release limits

Local tests do not establish native Windows behavior or completion of a GitHub release. The tag workflow builds and validates all six application/platform jobs, including the nine packages, packaged GUI and speech checks, HTML previews and exact source/publication inputs. Publication requires successful native gates and a matching GitHub asset name/size/SHA-256 ledger. The release-wide SHA256SUM.txt covers every attached asset except itself.

CI is intentionally asynchronous for this release. Its result and publication status must be read from GitHub; neither is inferred from local checks.
