# Attribution and licensing

Original suite code and documentation: **Copyright (c) 2026 davoda1**, MIT. This statement does not replace any third-party copyright or license.

| Component | Upstream / applicable notices |
| --- | --- |
| ThreadShelf server integration | [ChrystianSchutz/ThreadShelf](https://github.com/ChrystianSchutz/ThreadShelf); baseline and applicable MIT notices in `server-patch/` |
| Electron desktop runtime | [electron/electron](https://github.com/electron/electron); runtime `LICENSE` and `LICENSES.chromium.html` accompany every desktop package |
| Reader dependencies and native codecs | `apps/reader/THIRD-PARTY-NOTICES.md` and `apps/reader/licenses/`; corresponding bundled sources and license text under `vendor/7zip/` |
| Analytics dependencies and native codecs | `apps/analytics/THIRD-PARTY-NOTICES.md` and `apps/analytics/licenses/`; corresponding bundled sources and license text under `vendor/7zip/` |
| Alternative renderer libraries | `apps/alternative/THIRD-PARTY-NOTICES.md`, `licenses/` and `vendor/RENDERER-NOTICES.txt` |
| Gopher HTTP 3.0.0 | Publisher license and source under `manual/`; manual content and publisher assets retain their documented terms |

Dependency lockfiles record the exact npm dependency graph for Reader and Analytics. Alternative bundles the renderer dependencies and the source/attribution required to maintain them. Native runtime archives are obtained from official Electron releases and checked against their SHA-256 values.

Some included components have licenses other than MIT. Preserve all supplied license files and source offers when redistributing the source or desktop packages. Public GitHub links identify the original projects; the suite's license does not grant ownership of their names or trademarks.

The [v1.3.0 release](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/tag/v1.3.0) supplies the suite Source archive, all six Runtime-Sources ZIP parts, both ONNX-Sources ZIP parts and their two metadata/assembler ZIPs. These preserve the exact selected runtime source graph, active ONNX dependencies, supplemental source/build data, profiles, original patches and notices. The original [v1.0.0 Native-Sources companion](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.0.0/ThreadShelf-Local-Suite-1.0.0-Native-Sources.tar.gz) remains the unchanged source offer for sharp/libvips only. Normal compilers, SDKs and build tools are external prerequisites. Preserve matching sources with the binaries; see [runtime source access](apps/reader/licenses/ELECTRON-SOURCE-ACCESS.md), [ONNX source access](apps/reader/licenses/ONNX-SOURCE-ACCESS.md) and the original component notices for exact coverage and verification commands. These source collections do not claim a full runtime rebuild or byte-identical reproducibility.
