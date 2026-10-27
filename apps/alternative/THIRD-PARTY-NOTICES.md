# Third-party notices

ThreadShelf Local Alternative 1.3.0 is a separate desktop application by davoda1, distributed under MIT. It is not an upstream ThreadShelf release.

The server protocol is derived from inspection of Chrystian Schutz's ThreadShelf 1.3.0 and the suite's Reader pagination extension. ThreadShelf is MIT licensed; the notice is retained in `licenses/ThreadShelf-MIT.txt`. The server is independently installed and is not included in this application.

Selected rich conversation parsers/renderers are derived from ThreadShelf Local Reader, copyright 2026 davoda1, MIT. The original Reader and Analytics projects were used as read-only references. Their profile/data directories are never opened by this application.

Browser rendering components and their licenses are listed in `vendor/RENDERER-NOTICES.txt` and `vendor/licenses/`. They are bundled for offline use. Build-only PE branding tools retain their licenses under `vendor/build/`. The highlight.js 11.12.0 browser bundle is BSD 3-Clause licensed; the license is retained in `vendor/licenses/highlight.js-LICENSE.txt`. The bundled highlighter source and deterministic rebuild script are under `vendor/highlight-source/`. The unchanged Reader Mermaid repair source and the adapter rebuild script are under `vendor/reader-source/`. These three source/build directories are excluded from portable/deb runtime resources.

The shared Mermaid 12.2.0 bundle uses DOMPurify 3.4.17 and KaTeX 0.19.1. `vendor/licenses/Mermaid-BUNDLE-NOTICES.txt` preserves notices for every incorporated component; the adjacent `Mermaid-BUNDLE-MANIFEST.json` records exact versions and hashes. The reproducible recipe and npm lockfile are in `tools/mermaid-bundle/` at the suite repository root.

The desktop packages include Electron 45.1.0. Electron's original `LICENSE`, `LICENSES.chromium.html`, and other supplied runtime notices are retained at the native runtime level. Electron and Chromium components retain their respective terms. See https://github.com/electron/electron/tree/v45.1.0 and https://www.electronjs.org/.

Windows executable branding produces an unsigned application executable. The package does not claim a publisher signature.

## Electron runtime source access

The 1.3.0 candidate uses Electron **45.1.0**, Chromium **156.0.8078.49** and
embedded Node.js **24.22.1**. Original runtime notices remain intact.
[Runtime source access and rebuilding](licenses/ELECTRON-SOURCE-ACCESS.md)
records the exact upstream revisions and source preparation status.

The complete matching runtime source companion is still pending; publication
of the new binaries is blocked until it is assembled, verified and supplied
beside them. The historical v1.0.0 runtime mirror covers Electron 44.9.1 and
must not be represented as matching source for 45.1.0. The unchanged Reader
sharp/libvips source materials retain their separate versioned provenance.

Original license grants continue to apply. Chromium's Blink
`platform/wtf/text/base64.cc` retains its original LGPL version 2 grant without
an “or later” option; the new source was checked and its hash retained. The
old per-file license-selection index cannot be reused as evidence for the new
Chromium source. Preserve original notices and complete corresponding sources.
