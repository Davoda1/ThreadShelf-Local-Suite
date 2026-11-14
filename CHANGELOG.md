# Changelog

## 1.4.7 — 2026-11-14

- Improve archived ChatGPT link previews, badges, inline layouts, local widgets and slider expressions, chart rings and values, saved raster attachments and timestamps. Keep original source copying, code literals, offline renderer assets and the existing image and preview policies.
- Add an optional visual filter for intermediate JSON-only assistant responses in Reader Local/Server and Alternative. Filter only eligible returned search hits; preserve queries, indexing, ranking, totals, dates, sorting, pagination, analytics and archived data. Classify only the current result page and reuse its visibility decisions when toggling.
- Add a Reader conversation-header control beside Close, using aligned neutral SVG buttons and each theme's existing styling. Roll up/down over 240 ms into a 40 px title/provider/date strip. Remember the last position across conversations, Local/Server switches and application restarts; honor the existing motion preference.
- Align all three application versions and public About metadata at 1.4.7. Preserve the 1.4.6 Analytics behavior, public storage formats, profiles, runtime/dependency pins and existing GitHub tests and workflows.

## 1.4.6 — 2026-11-12

- Restore Analytics compatibility with current Reader retained history, deduplication and cleanup publications. Validate coherent committed captures without modifying Reader files; compare logical analytical data so checkpoints, recompression and nonanalytical housekeeping do not create false change alerts.
- Normalize conversations incrementally into owned SQLite captures, use exact disk-based selections and reducers, page native results and evidence, and stream complete exports. Keep the 2 GiB worker heap ceiling and individual-document safety guards; remove the archive-wide object counter and whole-dataset renderer transport.
- Preserve public full-text evidence, Markdown/code copying, excerpt/full-text search, explicit text exports and disconnected-source reindexing. Migrate valid finished public captures without discarding settings, annotations, retained history or recoverable source copies.
- Add detailed persistent failure context and startup errors, repair Retry when an unchanged capture lacks a report, and keep message-model and conversation-model searches independent. Retain the established layout, profile identities and unversioned OS titles.
- Align all three GUIs at 1.4.6 with Node 26.13.1 LTS and Electron 45.3.0 stable. Reader and Alternative retain their 1.4.5 application behavior. Rebuild the complete standard release set and matching verified runtime source supplement.
- Synchronize the embedded manual, 44 current screenshots and editable authoring sources with the official manual website. Preserve manual content version 1.4.5 for this fix release and correct the Gopher builder attribution to `davoda1` while retaining third-party notices.

## 1.4.5 — 2026-11-11

- Correct Reader conversation identity matching within each collection. Reliable providers use provider plus conversation ID: identical snapshots keep one copy, an exact longer continuation supersedes its shorter prefix, and other same-ID snapshots resolve to the newest record. Distinct reliable IDs remain separate. VeniceAI uses content-based matching because its export IDs are not stable; its preservation checks and Grok’s cross-ID cleanup rules retain divergent answered branches.
- Merge and deduplicate while imports and server copies are processed. Improve cleanup throughput and progress reporting, allow an active review to be reopened from settings, and align size summaries within the review.
- Automatically remove qualifying Grok/xAI single unanswered prompts and superseded unanswered endings. Clarify that the optional, default-off unanswered-prompt setting applies to providers other than Grok/xAI. Superseded copies are deleted rather than retained as hidden conversation history.
- Correct HTML preview sizing, initial placement, zoom and clipping during scrolling in Reader and Alternative. Use the full code-block interior with a responsive 16:9 viewport, transparent loading and no additional HTML frame or margin; preserve Code and other render layouts.
- Add default-off **Wrap long code lines** and **Show code line numbers** reading preferences to Reader and Alternative. Numbers are display-only and appear only in Code view; copying and exports preserve source text.
- Align Reader, Analytics and Alternative at 1.4.5 and retain the full release set. Analytics functionality, public privacy controls, profile/archive formats, runtime pins and dependency versions remain unchanged. Preserve the Windows ESM-path and dedicated native-report fixes from the preceding release.

## 1.4.4 — 2026-11-10

- Render bounded safe inline HTML formatting and CSS colors in ordinary user and response text. Preserve code, math, source copying and existing SVG behavior.
- Display VeniceAI numeric citation markers such as `^1^` as theme-aware soft-square badges without inventing missing source destinations.
- Add Code / Render controls for eligible complete HTML5 pages. Native previews run in a temporary sandbox without Node.js or application APIs; closing a preview destroys its state. A separate reading preference controls guarded public HTTPS resources and stops active previews when changed.
- Add Reader duplicate cleanup within collection, provider and actual-model boundaries. Preserve divergent answered histories, substantive reasoning and attachments; retain source history and remap saved reading when duplicates merge. Grok export artifacts receive targeted handling, while optional prompt-only cleanup for other providers starts disabled.
- Add a dedicated manual duplicate review with survivor/reason details and a stale-review guard; run applicable automatic checks after imports, server-copy batches and collection operations.
- Keep public network protections, app identities, profile/archive formats, runtime/dependency pins and existing speech functionality. Align all three apps at 1.4.4 and include Analytics with no functional changes.
- Correct the Alternative notice version and refresh the manual, focused regression tests, source supplement metadata and release gates.
- Normalize native filesystem paths before ESM test-driver imports on Windows and Linux. Add shared path-regression and early real-driver import gates; application runtime behavior is unchanged by this CI correction.

## 1.4.3 — 2026-11-09

- Render archived Grok XML cards, citations, supported charts and media through bounded parsing, SVG icons and original-source inspection. Keep unavailable data explicit and interactive actions inert.
- Expand ChatGPT citations, line-ranged file references, entities, source lists and archived widget fallbacks. Preserve literal markers inside code and exact whole-message copy/export.
- Authorize Grok images only from recognized renderable content using the existing remote-image controls. Preserve the public edition's image-request isolation and profile protections.
- Bound decompressed archive entries and Ollama response bodies, reject trailing data after compressed streams, and retain archive recovery and compatibility checks.
- Update Node.js to 26.13.0 LTS, Electron to 45.2.3, managed npm to 12.2.2, marked to 18.1.3, parse5 to 8.1.1 and bundled 7-Zip to 26.06. Retain existing speech providers, offline speech assets, profiles and archive schemas.
- Supply a verified Electron runtime source-update companion alongside the historical source parts, with exact changed-source integrity and offline reconstruction tools.
- Align Reader, Analytics and Alternative at 1.4.3, including all three native package sets. Analytics has no new user-facing features. Add focused synthetic rendering and security regressions and retain the existing release publication gates.

## 1.4.2 — 2026-11-03

- Add an SVG / Code toggle to eligible conversation code blocks in Reader and Alternative. Blocks start in Code view; Copy retains its original source in both views.
- Accept one complete, valid SVG document in an untagged, `svg` or `xml` block, with whitespace and XML comments permitted around the root. Support raw SVG, strict Base64 and `data:image/svg+xml;base64,` input. Keep HTML containing SVG, extra content, malformed input and other language tags as code.
- Render previews as isolated images with scripts, interactivity and external resources disabled. Preserve existing code, math, Mermaid, image and speech behavior.
- Add focused eligibility, copy, rendering and isolation regression coverage.
- Recheck previously rejected speech-cache files so restored valid pinned recordings regain priority even when file timestamps do not change; retain successful-validation caching and playback integrity checks.
- Include the optional search patch for upstream ThreadShelf 1.4.1, with version-aware installation, exact hit totals and cursor-paged search; retain the existing upstream 1.3.0 target.
- Include raw SVG and Base64 code-block examples in both standalone HTML demos.
- Align Reader, Analytics and Alternative at 1.4.2. Analytics functionality, dependency versions, runtime/toolchain pins, profiles and archive formats remain unchanged. Retain the illustrated 1.4.0 manual and screenshot provenance; document the new controls in the application READMEs.

## 1.4.1 — 2026-11-02

- Fix Windows CPU speech cleanup by waiting for process-tree termination before removing session files, with bounded retries for released file handles. Keep cleanup failures visible to validation.
- Address the minimatch glob-pattern amplification and glob cancellation vulnerabilities in Reader and Analytics build dependencies (GHSA-g3hv-75wg-m249 and GHSA-3g3m-2fjr-6pw4).
- Replace the vulnerable deepmerge implementation in Reader's holiday tooling and bundled holiday engine with a prototype-safe merge adapter (GHSA-gcqx-w48m-w2h4). Retain the existing holiday rules and dates.
- Add regression coverage for hostile patterns, cancelled filesystem traversal, Electron archive packaging and malicious merge keys.
- Align Reader, Analytics and Alternative at 1.4.1. Interfaces, features, speech playback, existing profiles, archive formats and runtime/toolchain pins remain unchanged. Retain the illustrated 1.4.0 manual and screenshot provenance for this security patch.

## 1.4.0 — 2026-11-01

- Add text-to-speech to Reader and Alternative, including bundled Pocket TTS and Kokoro CPU engines, provider connections, voice selection, per-message playback controls, streaming, text inclusion options and audio caching.
- Keep speech models and CPU runtimes inside the desktop packages with pinned checksums, notices and the corresponding source material required by their components. No model download occurs on first use.
- Reuse pinned speech recordings for unchanged full messages across provider, voice and text-inclusion changes. Add a default-on preference for existing API recordings, with source- and content-scoped matching and verified legacy-cache compatibility.
- Preserve missing or corrupt pinned originals while allowing separately stored replacements. Recheck cache eligibility after asynchronous reads and reselect completed playback after cache changes.
- Keep the TTS settings navigation separate from scrollable panels and reset panel scroll when changing tabs or refreshing cache contents.
- Refresh the illustrated manual and screenshots for 1.4.0, and include the updated offline manual in the release.
- Align Reader, Analytics and Alternative at application version 1.4.0. Analytics functionality, existing profiles, archive/schema identifiers and the Electron/Node/npm pins remain unchanged.
- Retain MathJax 4.1.3, file-citation rendering and the current ONNX Runtime 1.31.1 baseline. Existing runtime/native source companions retain their original filenames and versions.

## 1.3.1 — 2026-10-29

- Upgrade Reader and Alternative to pinned MathJax 4.1.3 with local assets, the original TeX font data and a version-checked compatibility layer that preserves established mathematical layout.
- Retain strict renderer isolation, offline math rendering and assistive MathML without enabling remote font loading or worker-based speech features.
- Render exported ChatGPT/Codex file citations as readable file cards, with broad extension labels and consistent document icons. Preserve original message copy/export and existing link restrictions.
- Restore the required native package layout: a real top-level Linux portable binary and a regular native `/usr/bin` executable in each DEB; Windows portable EXEs remain at the archive root.
- Align Reader, Analytics and Alternative at application version 1.3.1. Analytics functionality, application profiles, storage/schema identifiers and the Electron/Node/npm/ONNX pins remain unchanged.
- Put the real Linux portable executable at archive root and install a regular native ELF command in `/usr/bin` for DEB packages, with no symlink or script launcher. Windows portable EXEs remain at archive root.
- Update current binary, preview, source and checksum links. Reuse the unchanged v1.3.0 runtime/ONNX source companions and v1.0.0 native-source/manual assets.
- Record the bounded validation performed for this patch in [the 1.3.1 review](maintainer/REVIEW-1.3.1.md).

## 1.3.0 — 2026-10-28

- Align Reader, Analytics and Alternative application versions at 1.3.0 without changing persisted data/schema identifiers.
- Upgrade Electron to 45.1.0, including its Node 24.22.1 runtime, and pin development Node 24.22.1/npm 12.2.1.
- Use an isolated, integrity-verified npm 12.2.1 toolchain with its bundled Undici replaced by official 6.29.1. Source helpers, suite builds and CI select the same profile without changing global npm; see maintainer/NPM-TOOLCHAIN.md.
- Update Markdown, diagrams, math, ZIP parsing, holiday data, build tools and browser test dependencies; refresh locked transitive dependencies including undici 7.30.1.
- Pin Reader’s ONNX Runtime Web, Node and common packages to stable 1.31.1. Load Transformers 4.3.2 from its supplied source entry so it uses those external packages, and omit its unused prebuilt runtime bundles from desktop packages.
- Load portable ONNX assets through encoded file URLs so Windows drive paths and installation paths containing spaces, `#`, `%` or Unicode work correctly. Native and automatic/explicit WASM paths are regression-tested.
- Disable ONNX native telemetry in the main process before starting inference workers; preserve the existing model, cache layout and explicit model-download flow.
- Refresh CI action commit pins and retain all existing regression and package validation gates.
- Add native Windows Analytics GUI checks for production startup, settings changes, graceful close and persisted restart, retaining sandbox and package-integrity checks.
- Supply matching Electron/ONNX source companions, exact inventories, offline assemblers and source integrity/patch regressions. Retain the verified unchanged sharp/libvips source offer and original provenance limits.
- Refresh release links, source-access notices and the complete version inventory. See maintainer/REVIEW-1.3.0.md and the release verification report for evidence and limits.

## Reader and Alternative 1.2.0

- Useful JSON-only assistant and reasoning responses display as indented, syntax-highlighted JSON. Strings, large numbers and original lexical values remain intact; message copy and export retain the original source, while code-block copy uses the formatted display.
- Empty and internal-only responses stay hidden. User messages, Markdown examples and fenced code keep their existing rendering. Embedded HTML and rich-content markers inside JSON remain literal text.
- Native startup uses canonical file URLs so special characters in installation paths do not break the trusted renderer or IPC checks. Alternative also handles literal backslashes in POSIX paths without weakening Windows separator checks.
- Reader’s PowerShell development helper resolves bundled npm through Node when no standalone npm wrapper is present.
- Public settings, profile/archive identities, image controls and Reader’s separate optional image cache are preserved. Analytics remains 1.0.0; the manual, server patch, runtime and dependency pins are unchanged.
- Source and native package validation cover JSON rendering, hidden responses and exact-source clipboard behavior, alongside existing image, storage and compatibility checks.

## Reader and Alternative 1.1.0

- Reader adds controlled image loading and a separate resource cache, with settings and theme-aware image placeholders.
- Reader filters empty reasoning and unusable JSON-only content from conversation display and navigation, and removes the version from the native window title.
- Reader's About window describes its desktop features and supported data workflows.
- Alternative loads requested images within the conversation, offers automatic or click-to-load behavior, provides failure placeholders, and fits images to the reading area.
- Alternative suppresses unusable JSON-only responses. It does not add Reader's persistent resource cache.
- Existing public profile names and data/schema identifiers are retained. Public defaults, synthetic examples and hardened offline rendering dependencies are preserved.
- Native Windows startup accepts equivalent file-URL percent encoding while retaining exact application-file, sender and main-frame checks.
- Build helpers track component versions separately. Analytics remains 1.0.0; the server patch and manual are unchanged.
- GitHub source checks cover Windows as well as Linux, including explicit image/cache browser and archive integration gates. Analytics test fixtures use explicit time zones and Reader's own dependency tree without changing Analytics application code.
- Release validation launches the extracted Windows ZIP, Linux TAR.GZ and DEB applications with Chromium's sandbox enabled and synthetic profiles, including settings persistence and package-integrity checks.

## 1.0.0 — 2026-10-20

First public ThreadShelf Local Suite release.

- Reader, Analytics and Alternative are released as separate native desktop applications, each version 1.0.0.
- Includes the latest confirmed development functionality, public-safe defaults, synthetic examples, and refreshed project links.
- Supplies a standalone, baseline-checked ThreadShelf 1.3.0 search patcher with backup and rollback support.
- Includes a rebuilt Gopher 3.0.0 user manual, light/dark screenshots, and editable documentation sources.
- Adds pinned build instructions, GitHub configuration guidance, issue templates and artifact build workflows.

Application release versions and internal data-format/schema versions serve different purposes. Internal schema identifiers remain as required by each implementation.
