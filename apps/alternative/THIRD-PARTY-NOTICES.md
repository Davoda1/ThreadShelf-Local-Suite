# Third-party notices

ThreadShelf Local Alternative 1.2.0 is a separate desktop application by davoda1, distributed under MIT. It is not an upstream ThreadShelf release.

The server protocol is derived from inspection of Chrystian Schutz's ThreadShelf 1.3.0 and the suite's Reader pagination extension. ThreadShelf is MIT licensed; the notice is retained in `licenses/ThreadShelf-MIT.txt`. The server is independently installed and is not included in this application.

Selected rich conversation parsers/renderers are derived from ThreadShelf Local Reader, copyright 2026 davoda1, MIT. The original Reader and Analytics projects were used as read-only references. Their profile/data directories are never opened by this application.

Browser rendering components and their licenses are listed in `vendor/RENDERER-NOTICES.txt` and `vendor/licenses/`. They are bundled for offline use. Build-only PE branding tools retain their licenses under `vendor/build/`. The highlight.js 11.12.0 browser bundle is BSD 3-Clause licensed; the license is retained in `vendor/licenses/highlight.js-LICENSE.txt`. The bundled highlighter source and deterministic rebuild script are under `vendor/highlight-source/`. The unchanged Reader Mermaid repair source and the adapter rebuild script are under `vendor/reader-source/`. These three source/build directories are excluded from portable/deb runtime resources.

The shared Mermaid 11.17.2 bundle uses DOMPurify 3.4.17 and KaTeX 0.18.2. `vendor/licenses/Mermaid-BUNDLE-NOTICES.txt` preserves notices for every incorporated component; the adjacent `Mermaid-BUNDLE-MANIFEST.json` records exact versions and hashes. The reproducible recipe and npm lockfile are in `tools/mermaid-bundle/` at the suite repository root.

The desktop packages include Electron 44.9.1. Electron's original `LICENSE`, `LICENSES.chromium.html`, and other supplied runtime notices are retained at the native runtime level. Electron and Chromium components retain their respective terms. See https://github.com/electron/electron/tree/v44.9.1 and https://www.electronjs.org/.

Windows executable branding produces an unsigned application executable. The package does not claim a publisher signature.

## Electron runtime source access

All three suite applications use Electron **44.9.1** / Chromium
**152.0.7977.167**. The release
[native-source companion](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.0.0/ThreadShelf-Local-Suite-1.0.0-Native-Sources.tar.gz)
mirrors the matching FFmpeg fork, Blink renderer/interfaces/tools, selected
Chromium-modified Mozilla sources, and the identified Electron patches and build
inputs. [Runtime source access and rebuild instructions](licenses/ELECTRON-SOURCE-ACCESS.md)
provide exact complete upstream source retrieval, relinking/replacement directions,
license selections and availability-maintenance instructions.

Original runtime notices remain intact. LGPLv3 is selected only where the
original grant permits that later version; Blink
`platform/wtf/text/base64.cc` retains the original LGPL version 2 grant. The
companion includes that exact source and records the reviewed per-file selections.
The separate **numbered Runtime-Sources parts**, available from the
[v1.0.0 release](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/tag/v1.0.0),
mirror the complete pinned Electron/Chromium Git dependency trees selected for
Linux x64 and Windows x64, plus the supplemental source and release build data
recorded in the manifests. Normal compiler, SDK and build-tool prerequisites
remain separate. Preserve the suite Source archive, Native-Sources companion
and **every** Runtime-Sources part with the matching binary downloads; the
runtime source-access document explains verification, assembly and rebuilding.
