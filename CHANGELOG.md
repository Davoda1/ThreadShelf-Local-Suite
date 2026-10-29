# Changelog

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
- Reader's About window describes this desktop application without references to separate personal web readers.
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
