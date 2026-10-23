# Reader and Alternative 1.1.0 — source validation

This tree prepares separate public editions of ThreadShelf Local Reader and ThreadShelf Local Alternative. It is based on `master` commit `1be2ceb8cd5fec04fc852861fc0f3173dc0d3155` of `Davoda1/ThreadShelf-Local-Suite`. The separate review delivery was prepared without commits, tags, pushes, release uploads, workflow runs or repository-setting changes. This source-publication step adds the reviewed changes and README banner for GitHub validation; release creation and release assets remain a separate next step. The personal editions are not part of this tree.

| Component | Prepared version | Scope |
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

The earlier private review delivery includes a shared Source ZIP and TAR.GZ, application sources and tests, component build tools and the unchanged Analytics/manual/server-patch files. Those archives exclude Git history, installed build dependencies, profile data, caches, generated test logs and package staging. Each updated application has its own Windows portable ZIP, Linux TAR.GZ, Debian package and self-contained HTML preview. They are review artifacts, not releases of the current GitHub commit.

Native packages retain the root Windows EXE and direct Linux native-binary entry points; no launcher wrappers are added. Node.js 24.19.0 and npm 11.9.0 are the development build pins. Build output names follow the per-component versions in `tools/release-versions.json`.

The existing 1.0.0 Native-Sources and complete numbered Runtime-Sources companions remain applicable because those dependency/runtime versions have not changed. Preserve them with these sources and notices when redistributing the binaries. This delivery does not replace or republish those companions.

## Verification

GitHub source checks cover Linux and Windows unit tests and renderer builds, Reader cache/archive integration, public 1.0.0-to-1.1.0 profile upgrade and downgrade, and Linux browser regressions for both applications. The browser gate includes image loading, 380 cache-control layout cases, the bounded image queue and response visibility. Analytics tests now specify time zones at the New Year boundary and run the copied Reader source with Reader's own dependencies; Analytics production files are unchanged.

The private review delivery's test counts, package checks, privacy review and execution limitations are recorded in its accompanying `ThreadShelf-Local-Suite-1.1.0-Verification.md`. GitHub checks provide the current source-validation results; this step does not publish those review packages or create a release. Historical 1.0.0 verification documents remain labeled as historical evidence and do not identify the new binary hashes. The one delivery-level `SHA256SUM.txt` identifies all downloadable files in this review set.
