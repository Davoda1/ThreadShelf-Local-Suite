# Third-party notices

ThreadShelf Local Alternative 1.4.4 is a separate desktop application by davoda1, distributed under MIT. It is not an upstream ThreadShelf release.

The server protocol is derived from inspection of Chrystian Schutz's ThreadShelf 1.3.0 and the suite's Reader pagination extension. ThreadShelf is MIT licensed; the notice is retained in `licenses/ThreadShelf-MIT.txt`. The server is independently installed and is not included in this application.

Selected rich conversation parsers/renderers are derived from ThreadShelf Local Reader, copyright 2026 davoda1, MIT. The original Reader and Analytics projects were used as read-only references. Their profile/data directories are never opened by this application.

Browser rendering components and their licenses are listed in `vendor/RENDERER-NOTICES.txt` and `vendor/licenses/`. They are bundled for offline use. Build-only PE branding tools retain their licenses under `vendor/build/`. The highlight.js 11.12.0 browser bundle is BSD 3-Clause licensed; the license is retained in `vendor/licenses/highlight.js-LICENSE.txt`. The bundled highlighter source and deterministic rebuild script are under `vendor/highlight-source/`. The unchanged Reader Mermaid repair source and the adapter rebuild script are under `vendor/reader-source/`. These three source/build directories are excluded from portable/deb runtime resources.

The shared Mermaid 12.2.0 bundle uses DOMPurify 3.4.17 and KaTeX 0.19.1. `vendor/licenses/Mermaid-BUNDLE-NOTICES.txt` preserves notices for every incorporated component; the adjacent `Mermaid-BUNDLE-MANIFEST.json` records exact versions and hashes. The reproducible recipe and npm lockfile are in `tools/mermaid-bundle/` at the suite repository root.

The desktop packages include Electron 45.2.3. Electron's original `LICENSE`, `LICENSES.chromium.html`, and other supplied runtime notices are retained at the native runtime level. Electron and Chromium components retain their respective terms. See https://github.com/electron/electron/tree/v45.2.3 and https://www.electronjs.org/.

Windows executable branding produces an unsigned application executable. The package does not claim a publisher signature.

## Electron runtime source access

Suite 1.4.4 uses Electron **45.2.3**, Chromium **156.0.8078.80** and
embedded Node.js **24.22.2**. Original runtime notices remain intact.
Matching runtime source is the historical 1.3.0 original source collection
plus the 1.4.4 runtime source update; both are required. Historical source
verification records remain specific to Electron 45.1.0. See
[Electron source access](licenses/ELECTRON-SOURCE-ACCESS.md) for exact downloads,
offline update instructions and upstream build/replacement guidance.
The unchanged sharp/libvips and ONNX source companions keep their original
versions, notices and verification scope.

## Bundled CPU Text-to-Speech

Pocket TTS and Kokoro model licenses, voice attribution, Python package notices, native runtime licenses and required source offers accompany every native package under `resources/tts-assets/licenses`, `runtime/packages` and `sources`. The source package includes pinned download provenance in `tts/cpu`. All ONNX Runtime components use 1.31.1.

## Text-to-Speech controls

The sliders-horizontal settings icon uses the Lucide 0.468.0 SVG geometry under
the ISC license. Original copyright and license text are retained in
`licenses/Lucide-ISC.txt`. This is an embedded vector asset; the application adds
no Lucide runtime dependency.

## HTML preview validation

The standalone HTML document validator bundles parse5 8.1.1 under MIT and entities 9.0.0 under BSD-2-Clause. Their notices are retained in `licenses/parse5-MIT.txt` and `licenses/entities-BSD-2-Clause.txt`. Source eligibility is shared between the renderer and the isolated preview host; the deterministic rebuild is `scripts/build-html-preview.mjs`.
