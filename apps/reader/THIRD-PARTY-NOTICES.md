# Third-party notices

ThreadShelf Local Reader's original application code is MIT licensed,
Copyright (c) 2026 davoda1, as stated in `LICENSE`. This does **not** relicense
the dependencies or make the complete desktop distribution MIT-only.
Existing upstream copyrights and license terms continue to apply.

## Principal components

| Component | License and retained attribution |
| --- | --- |
| ThreadShelf adaptations and fixtures | MIT; Copyright (c) 2026 Chrystian Schutz. See `licenses/ThreadShelf-MIT.txt` and `licenses/ThreadShelf-fixtures-LICENSE.txt`. |
| Conversation renderer, export-converter adaptations and the dedicated Fish grammar | Application MIT terms; davoda1. Provider notices are also retained in `src/core/providers/`. |
| Electron 45.1.0 | MIT; Electron contributors, Copyright (c) 2013–2020 GitHub Inc. Original runtime `LICENSE` is retained beside the executable. |
| Chromium and Electron's bundled native components | Multiple licenses; original `LICENSES.chromium.html` is retained beside the executable. |
| Mermaid 12.2.0 | MIT; Copyright (c) 2014–2022 Knut Sveidqvist. See `licenses/Mermaid-LICENSE.txt`. The offline bundle includes DOMPurify 3.4.17 and KaTeX 0.19.1; complete incorporated-component notices and versions are in `licenses/Mermaid-BUNDLE-NOTICES.txt` and `licenses/Mermaid-BUNDLE-MANIFEST.json`. |
| MathJax 4.1.3 and MathJax TeX font 4.1.3 | Apache-2.0; The MathJax Consortium. Unmodified upstream TeX/MathML-to-SVG and assistive MathML components, with local original-font data and application compatibility code. See `licenses/MathJax-Upstream-LICENSE.txt`, `licenses/MathJax-Original-TeX-Font-LICENSE.txt`, `scripts/mathjax-vendor-lock.json`, and `docs/MathJax-4.md`. The retained 3.2.1 source notice is historical and is not executed. |
| highlight.js | BSD-3-Clause; Copyright (c) 2006 Ivan Sagalaev. See `licenses/highlight.js-LICENSE.txt`. |
| Ayu code-palette adaptation | MIT; Copyright (c) Konstantin Pschera <me@kons.ch> (kons.ch). See `licenses/Ayu-MIT.txt` and the palette provenance below. |
| Noto Sans JP Japanese font | SIL Open Font License 1.1; Copyright 2014–2021 Adobe, with Reserved Font Name “Source”. See `licenses/NotoSansJP-OFL.txt` and `licenses/NotoSansJP-provenance.json`. |
| marked | MIT; Copyright (c) 2018+ MarkedJS and 2011–2018 Christopher Jeffrey, with the original Markdown BSD notice for Copyright (c) 2004 John Gruber. See `licenses/marked-LICENSE.md`. |
| Hugging Face Transformers.js and Tokenizers | Apache-2.0; Hugging Face. Their npm license files remain in `resources/app/node_modules/`. |
| ONNX Runtime 1.31.1 (Web, Node and common) | MIT; Copyright (c) Microsoft Corporation. See `licenses/ONNX-Runtime-MIT.txt`, retained upstream `licenses/ONNX-Runtime-ThirdPartyNotices.txt`, and [source provenance](licenses/ONNX-SOURCE-ACCESS.md). |
| sharp and the prebuilt native/WASM packages | Apache-2.0 for sharp; Copyright 2013 Lovell Fuller and others. Native/WASM dependencies include **LGPL-3.0-or-later** and additional licenses; see below. |
| zip.js | BSD-3-Clause; Copyright (c) 2023 Gildas Lormeau. The npm license remains with the package. |
| parse5 | MIT; Copyright (c) 2013–2019 Ivan Nikulin. The npm license remains with the package. |
| ThreadShelf offline holiday rules/evaluator | Rules adapted from date-holidays 3.38.0 under CC BY-SA 3.0; date-holidays-parser 3.4.7 under ISC and the parser dependencies retain their own licenses. See `licenses/HOLIDAY-LICENSES.txt`, `licenses/holiday-provenance.json` and `docs/Holidays.md`. |
| IANA timezone-country map | Public domain IANA 2026e inputs; original comments, provenance and deterministic generator retained under `scripts/timezone-data/`. |

The exact npm package/version/license declarations are recorded in
`licenses/PRODUCTION-DEPENDENCIES-linux-x64.json` and
`licenses/PRODUCTION-DEPENDENCIES-win32-x64.json`. Each built application also
contains the target-specific `resources/app/licenses/DEPENDENCIES.json`.
These declarations are metadata, not a replacement for the actual license
texts. They do not enumerate every library inside Chromium or native DLLs.
Bundling preserves extracted JavaScript legal comments beside the bundles.

The interface palettes and code-theme CSS are newly authored. Their
color references and original adaptations are documented in `docs/Themes.md`;
no additional vendor stylesheet or executable is included. Existing
highlight.js attribution remains unchanged. The custom Codex palette is not
an official OpenAI theme.

## Code-palette provenance

**Xcode Classic** adapts the light color direction of the Xcode style bundled
with highlight.js 11.12.0 (`node_modules/highlight.js/styles/xcode.css`). The
specific upstream attribution is retained here: **XCode style (c) Angel
Garcia <angelgarcia.mail@gmail.com>**. The highlight.js BSD-3-Clause terms are
preserved in `licenses/highlight.js-LICENSE.txt`. The paired dark adaptation,
Reader token mapping and contrast adjustments are original application work.
This is an Xcode-inspired Reader palette, not an Apple theme asset or an
official Apple product. Upstream project: <https://github.com/highlightjs/highlight.js>.

**Ayu** adapts colors from the Ayu project's own palette,
<https://github.com/ayu-theme/ayu-colors>, with Reader-specific token mapping,
light-color contrast adjustments and paired light/dark surfaces. The exact
upstream MIT license is retained in `licenses/Ayu-MIT.txt`; the license source is
<https://github.com/ayu-theme/ayu-colors/blob/master/license>. The retrieved
license URL, byte count and SHA-256 are recorded in
`licenses/UPSTREAM-SOURCES.json`. The adaptation does not add an Ayu runtime
dependency or import an editor stylesheet. The standalone offline preview
embeds this license and the existing rendering notices without fetching
external resources.

## Japanese font

Noto Sans JP is bundled as a local WOFF2 font so Japanese interface text can
render offline on systems without a Japanese font. The font source is the
official Google Fonts repository,
<https://github.com/google/fonts/tree/main/ofl/notosansjp>. The original
variable TrueType font was converted to WOFF2 without subsetting or changing
the glyphs, character map or weight range (100–900). The retained license is
the exact upstream `OFL.txt`; the font remains under SIL OFL 1.1, independently
of the application's MIT license. Source and shipped-font hashes, conversion
details and character coverage are recorded in
`licenses/NotoSansJP-provenance.json`.

The font is a Japanese-only fallback for the interface, Reader text and code
surfaces. Existing Latin font choices and the order of explicit Reader
monospace fonts are preserved; the bundled Japanese fallback also supports
localized code controls and Japanese source text. The desktop includes the
local font asset; the standalone offline preview embeds the same font and
the font license, with no external font request.

## sharp, libvips, and LGPL components

The production graph includes `@img/sharp-libvips-linux-x64` and
`@img/sharp-libvips-linuxmusl-x64` under LGPL-3.0-or-later,
`@img/sharp-win32-x64` under Apache-2.0 AND LGPL-3.0-or-later, and
`@img/sharp-wasm32` under Apache-2.0 AND LGPL-3.0-or-later AND MIT.
Only the packages installed for a target are in that target's manifest.

Upstream native-package READMEs, their library-by-library license tables,
package metadata, and available `versions.json` files are preserved under
`licenses/native/`. These tables additionally identify MPL-1.1, MIT, BSD,
zlib, IJG, fontconfig, FreeType, libpng, and other component terms. They state
that LGPLv3 use is through the “any later version” clause of LGPLv2 or
LGPLv2.1. Full LGPLv3 and GPLv3 texts are supplied in
`licenses/GNU-LGPL-3.0.txt` and `licenses/GNU-GPL-3.0.txt`, along with the
libvips upstream license in `licenses/libvips-LICENSE.txt`.

Source versions, the downloadable native-source companion archive, retained
build recipes, and replacement/rebuild notes are in
`licenses/SOURCE-AND-REBUILD.md`. Original component copyright/license texts
and provenance indexes are retained under `licenses/native-components/`.
Native
modules and WASM assets are shipped as regular, unpacked files. The
application imposes no restriction on modifying or replacing these
components, or on reverse engineering to debug those modifications.

## Optional semantic model and services

No model weights are included in the release archives. The optional built-in
semantic setup downloads `Xenova/paraphrase-multilingual-MiniLM-L12-v2` when
requested by the user. The retrieved model card identifies
`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` as the base model.
The original model card explicitly declares **Apache-2.0**; the retrieved
Xenova conversion card contains no separate license declaration. Both exact
cards are preserved as `licenses/MiniLM-Original-Model-Card.md` and
`licenses/MiniLM-Xenova-Model-Card.md`. This notice records that provenance
without assigning a new license to the conversion. Apache-2.0's full text is
in `licenses/Apache-2.0.txt`.

Ollama and any model selected through it are separately installed/downloaded
and are not redistributed in these application packages. Their own licenses
apply.

## Provenance

`licenses/UPSTREAM-SOURCES.json` records official source URLs, retrieval
dates, byte counts, and SHA-256 hashes for the additional preserved upstream
documents. The npm lockfile records exact packages and registry integrity
hashes. Existing npm license files remain with the relevant packages; the
standalone additions above address packages/assets whose npm or bundled
form omitted an explicit license or attribution file.

These notices describe the included materials and retained sources. They
are not a claim that all transitive native components use MIT, nor a
comprehensive legal audit of Chromium or a substitute for upstream terms.

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
