# Attribution and licensing

Original suite code and documentation: **Copyright (c) 2026 davoda1**, MIT. This statement does not replace any third-party copyright or license.

| Component | Upstream / applicable notices |
| --- | --- |
| ThreadShelf server integration | [ChrystianSchutz/ThreadShelf](https://github.com/ChrystianSchutz/ThreadShelf); baseline and applicable MIT notices in `server-patch/` |
| Electron desktop runtime | [electron/electron](https://github.com/electron/electron); runtime `LICENSE` and `LICENSES.chromium.html` accompany every desktop package |
| Reader dependencies and native codecs | `apps/reader/THIRD-PARTY-NOTICES.md` and `apps/reader/licenses/`; corresponding bundled sources and license text under `vendor/7zip/` |
| Analytics dependencies and native codecs | `apps/analytics/THIRD-PARTY-NOTICES.md` and `apps/analytics/licenses/`; corresponding bundled sources and license text under `vendor/7zip/` |
| Alternative renderer libraries | `apps/alternative/THIRD-PARTY-NOTICES.md`, `licenses/` and `vendor/RENDERER-NOTICES.txt` |
| MathJax 4.1.3 (Reader and Alternative) | Apache-2.0; pinned upstream engine and assistive MathML, licensed original TeX font data, application compatibility adapter and reproduction instructions in each app’s MathJax notices and provenance |
| Gopher HTTP 3.0.0 | Publisher license and source under `manual/`; manual content and publisher assets retain their documented terms |

Dependency lockfiles record the exact npm dependency graph for Reader and Analytics. Alternative bundles the renderer dependencies and the source/attribution required to maintain them. Native runtime archives are obtained from official Electron releases and checked against their SHA-256 values.

Some included components have licenses other than MIT. Preserve all supplied license files and source offers when redistributing the source or desktop packages. Public GitHub links identify the original projects; the suite's license does not grant ownership of their names or trademarks.

The [v1.4.5 release](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/tag/v1.4.5) supplies the current suite source archives and the **Electron 45.2.3 runtime source update**. Matching runtime source requires that supplement together with the six original Runtime-Sources ZIP parts and their metadata/assembler from [v1.3.0](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/tag/v1.3.0). The historical ZIPs alone cover Electron 45.1.0. Both ONNX-Sources ZIP parts and their metadata remain unchanged at v1.3.0; the [v1.0.0 Native-Sources companion](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.0.0/ThreadShelf-Local-Suite-1.0.0-Native-Sources.tar.gz) remains the source offer for unchanged sharp/libvips only. Exact sources, original notices, patches and release profiles are retained. Normal compilers, SDKs and build tools are external prerequisites. Preserve matching sources with the binaries; see [runtime source access](apps/reader/licenses/ELECTRON-SOURCE-ACCESS.md) and [ONNX source access](apps/reader/licenses/ONNX-SOURCE-ACCESS.md) for exact downloads, offline assembly and rebuild instructions. Source verification does not claim a full runtime rebuild or bit-identical binary reproduction.

## Bundled speech engines

Reader and Alternative include Pocket TTS and Kokoro CPU speech assets. Pocket's engine is MIT-licensed; its model and preset voice attribution are retained with their applicable CC-BY-4.0/CC0 notices. Kokoro's model and voice pack use Apache-2.0, with MIT-licensed ONNX bindings and runtime. eSpeak NG and phonemizer retain their GPL-3.0 notices and corresponding source archives in the packaged `resources/tts-assets/sources/` directory. The bundled Python runtime, wheel dependencies and Windows redistributable support files retain their original notices. See [CPU speech notices](apps/reader/tts/cpu/support/common/licenses/CPU-THIRD-PARTY-NOTICES.txt), the pinned asset manifest and per-component source instructions. These notices supplement the existing Electron, ONNX and sharp/libvips source companions.
