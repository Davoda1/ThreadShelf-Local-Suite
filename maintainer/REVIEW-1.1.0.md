# Reader and Alternative 1.1.0 — release scope and validation

This release contains separate public editions of ThreadShelf Local Reader and ThreadShelf Local Alternative, developed from public baseline `1be2ceb8cd5fec04fc852861fc0f3173dc0d3155`. Personal editions and their configuration are excluded. The suite release number does not change the version of every component.

| Component | Current version | Scope |
| --- | --- | --- |
| Reader | 1.1.0 | Image loading controls, optional independent resource cache, image placeholders, rendering/visibility corrections and title/About cleanup |
| Alternative | 1.1.0 | In-conversation image loading, automatic/click mode, failure placeholders, responsive image sizing and response visibility |
| Analytics | 1.0.0 | Application and version unchanged; test harness fixes only |
| Server patch | Existing | Unchanged |
| Editable and generated manual | Existing | Unchanged |

## Preserved behavior

Existing public application names, profile directories, archive/schema identifiers and saved reading identities are retained. Reader's new image preferences and cache are separate from the existing conversation archive. Alternative retains its existing settings file and defaults missing image preferences to click-to-load. Alternative does not gain Reader's persistent resource cache.

Public loopback server defaults, synthetic examples, media with identifying metadata removed, third-party credits and the existing hardened diagram renderer remain in place. The shared Mermaid 11.17.2, DOMPurify 3.4.17 and KaTeX 0.18.2 bundle is unchanged. Reader's image decoder uses the already locked sharp 0.35.5 package, now declared directly; dependency versions and Electron 44.9.1 remain pinned.

Reader always uses its validated desktop image bridge, even with caching disabled. The cache toggle controls disk persistence. Image loading is still a network operation and exposes the connection to the requested image host. Alternative loads images through Chromium with image-only credential/referrer filtering; it does not implement Reader's private-network, redirect or byte-decoding policy.

## Source and build delivery

The release provides six native packages: Windows portable ZIP, Linux TAR.GZ and Debian package for each updated application. It also includes two self-contained HTML previews, a complete suite Source ZIP and TAR.GZ, a verification report and one `SHA256SUM.txt`. Source archives are taken from the final tagged commit and exclude Git history, installed build dependencies, profile data, caches, generated test logs and package staging. The previews demonstrate production renderers with synthetic data; they do not implement native archive, server or disk-cache operations.

Native packages retain the root Windows EXE and direct Linux native-binary entry points; no launcher wrappers are added. Node.js 24.19.0 and npm 11.9.0 are the development build pins. Build output names follow the per-component versions in `tools/release-versions.json`.

Analytics 1.0.0 and the offline manual remain in the existing v1.0.0 release. The 1.0.0 Native-Sources and complete numbered Runtime-Sources companions also remain applicable because their covered dependency/runtime versions have not changed. The root README and release notes link directly to these unchanged downloads. Preserve them with the current application sources and notices when redistributing binaries.

## Verification

The [Checks workflow](https://github.com/Davoda1/ThreadShelf-Local-Suite/actions/workflows/checks.yml) covers Linux and Windows unit tests and renderer builds, Reader cache/archive integration, public 1.0.0-to-1.1.0 profile upgrade and downgrade, and Linux browser regressions for both applications. The browser gate includes image loading, 380 cache-control layout cases, the bounded image queue and response visibility. Optional model and platform-specific tests retain their explicit skips. Analytics tests specify time zones at the New Year boundary and run the copied Reader source with Reader's own dependencies; its GUI test explicitly enables Chromium's sandbox. Analytics production files are unchanged.

The [package workflow](https://github.com/Davoda1/ThreadShelf-Local-Suite/actions/workflows/build.yml) builds on Windows and Linux, validates archive contents and native runtime identity, and exercises Reader storage. Its Reader and Alternative GUI gates launch the actual extracted Windows ZIP, Linux TAR.GZ and DEB executables with fresh synthetic profiles, check settings across restart, and verify that application files remain unchanged. The DEB check executes extracted payloads; it is not a system-wide installation test. See [build validation](BUILD.md#validate-on-the-target-operating-system) for commands and host requirements.

The [release verification report](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.1.0/ThreadShelf-Local-Suite-1.1.0-Verification.md) records the final commit, workflow runs, package evidence and execution limits. Historical 1.0.0 verification documents do not identify new binary hashes. The release-level `SHA256SUM.txt` identifies the eleven other assets; unchanged v1.0.0 files keep their original checksum manifest.

README screenshots use isolated synthetic renderer previews and contain no private exports or profiles. [Screenshot provenance](../docs/extras/SCREENSHOTS.md) distinguishes these captures from native package validation.
