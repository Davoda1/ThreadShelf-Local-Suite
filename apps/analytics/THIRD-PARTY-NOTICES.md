# Third-party notices

ThreadShelf Local Analytics application code is MIT licensed, Copyright (c) 2026 davoda1. This does not relicense dependencies; their original licenses and copyrights continue to apply.

| Component | License and retained attribution |
| --- | --- |
| Selected Reader 3.1.0 parsers, themes, highlighting, storage descriptions, and packaging utilities | MIT; davoda1. Analytics is an independent application and never initializes Reader storage. |
| ThreadShelf-derived algorithms and synthetic fixtures | MIT; Copyright (c) 2026 Chrystian Schutz. Retained in `licenses/ThreadShelf-MIT.txt` and `licenses/ThreadShelf-fixtures-LICENSE.txt`. |
| AI Export Converter parser adaptations | MIT; davoda1. Original notice remains in `src/core/parsers/AI-Export-Converter-LICENSE.txt`. |
| Electron 44.9.1 | MIT; Electron contributors, Copyright (c) 2013–2020 GitHub Inc. Official runtime `LICENSE` remains beside the executable. |
| Chromium and bundled runtime components | Multiple licenses. Official runtime `LICENSES.chromium.html` remains beside the executable. |
| highlight.js 11.12.0 | BSD-3-Clause; Copyright (c) 2006 Ivan Sagalaev. `licenses/highlight.js-LICENSE.txt`. |
| marked 16.4.2 | MIT; Copyright (c) 2018+ MarkedJS and 2011–2018 Christopher Jeffrey. Includes original Markdown notice, Copyright (c) 2004 John Gruber. `licenses/marked-LICENSE.md`. |
| zip.js 2.8.11 | BSD-3-Clause; Copyright (c) 2023 Gildas Lormeau. Original license retained in npm package and `licenses/npm/`. |
| parse5 8.0.0 and entities | MIT/BSD-2-Clause respectively; original npm package notices retained. |
| Ayu code palette adaptation | MIT; Copyright (c) Konstantin Pschera (kons.ch). `licenses/Ayu-MIT.txt`. |
| Xcode Classic palette adaptation | Xcode style (c) Angel Garcia; highlight.js BSD-3-Clause. Paired dark palette and application adaptations are original work. |
| Noto Sans JP | SIL Open Font License 1.1; Copyright 2014–2021 Adobe, Reserved Font Name “Source”. `licenses/NotoSansJP-OFL.txt`; conversion and hashes in `licenses/NotoSansJP-provenance.json`. |
| 7-Zip 26.03 codecs | GNU LGPL and BSD portions, with unRAR restrictions as described in `vendor/7zip/License.txt`. Unmodified upstream binary inputs, corresponding source archive, license and provenance are bundled. |

Exact target dependency declarations are generated as `resources/app/licenses/DEPENDENCIES.json`; original production package licenses remain inside `resources/app/node_modules`. This manifest does not enumerate every library inside Chromium, which is covered by the runtime notices.

The independent Analytics branding, icon and new UI are original application work. No third-party images are included. Theme names and model/provider names retain their proper identity; they imply no endorsement.

The Japanese WOFF2 font was converted without glyph changes or subsetting from the official Google Fonts repository and is bundled for offline Japanese support. The font license remains independent of the application MIT license. Color-palette adaptations add no editor runtime dependency; the custom Codex palette is not an official OpenAI theme.

The source build tools use esbuild (MIT), resedit (MIT), @electron/get (MIT), and @electron/asar (MIT), with locked versions in `package-lock.json`. Their package license files are retained in `licenses/npm/` when installed. No AI inference/search runtime, model download, telemetry or external service is required by Analytics.

7-Zip corresponding source is provided directly as `vendor/7zip/7z2603-src.tar.xz`, with `License.txt`, `copying.txt`, `README.md`, and `provenance.json`. The source is unmodified; Linux's upstream static executable 7zzs is renamed 7zz. Application use invokes the bundled codec only on Analytics-owned copies/workspace output, never Reader mutation commands.

Upstream project: [ThreadShelf](https://github.com/ChrystianSchutz/ThreadShelf). Reader adaptations are maintained in [ThreadShelf Local Suite](https://github.com/Davoda1/ThreadShelf-Local-Suite/tree/master/apps/reader). This independent Analytics codebase is not a fork or an official upstream release.

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
