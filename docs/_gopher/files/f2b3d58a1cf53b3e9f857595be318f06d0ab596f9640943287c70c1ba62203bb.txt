# Developer and maintainer reference

The suite source archive is an editable repository tree. Extract it and read the root `README.md` before building. Each application lives under `apps/`, the integration under `server-patch/`, and this manual’s source under `manual/`. The generated Gopher website is under `docs/`.

## Build documentation

Follow the root maintainer instructions for the pinned Node.js 24.22.1/npm 12.2.1 toolchain, dependency installation, native packaging and release checks. All three public 1.4.0 applications use Electron **45.1.0** with Chromium **156.0.8078.49**. The runtime’s embedded Node.js is separate from the development Node.js toolchain. Use the component’s own build guide when working on one application. Keep source code, dependency lockfiles and license notices together.

The source uses build scripts for development; the delivered Windows/Linux GUI packages launch native executables. A build script is not a portable-app launcher.

| Task | Source reference |
| --- | --- |
| Repository setup, release process and workflow configuration | Root README and `maintainer/` |
| Reader development and packaging | `apps/reader/` build documentation |
| Analytics development and packaging | `apps/analytics/` build documentation |
| Alternative development and packaging | `apps/alternative/docs/BUILD.md` |
| Server baseline, patch and rollback | `server-patch/README.md` |
| Edit/rebuild this website | `manual/README.md` |

## Native dependency sources and runtime rebuilds

The current application source archive contains the editable suite, manual, dependency lockfiles, build tools and retained notices. The desktop packages include their runtime, so normal installation does not require development source downloads.

This release preserves the pinned runtime and existing native dependencies. Their matching source offers remain at the releases where they were introduced:

| Source material | Matching offer and scope |
| --- | --- |
| Application source | The 1.4.0 suite Source archive, including the speech service and its preparation/build instructions |
| Electron 45.1.0 / Chromium 156.0.8078.49 | All six numbered `ThreadShelf-Local-Suite-1.3.0-Runtime-Sources-01.zip` through `-06.zip`, plus the Runtime-Sources-Metadata ZIP, in the [v1.3.0 release](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/tag/v1.3.0) |
| Reader ONNX Runtime 1.31.1 | The source/provenance companion identified by Reader's `licenses/ONNX-SOURCE-ACCESS.md`, associated with v1.3.0 |
| Unchanged Reader sharp/libvips dependencies | The [v1.0.0 Native-Sources companion](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.0.0/ThreadShelf-Local-Suite-1.0.0-Native-Sources.tar.gz), reused only for its verified unchanged sharp/libvips scope |
| Speech engines, model assets and their runtime dependencies | The TTS preparation instructions, pinned asset inventory and third-party notices in each speech-enabled application's source/package |

Verify downloaded source parts with the checksum manifest from the release that supplies them. The old Electron 44.9.1 collection does **not** establish source coverage for Electron 45.1.0; similarly, the historical native companion does not establish ONNX Runtime 1.31.1 source coverage.

For the current Electron collection, retain **all six numbered ZIPs** together. Extract only the metadata ZIP, which creates `source-publication/`. The assembler reads the numbered ZIPs directly; do not extract their repeated `PART-MANIFEST.json` files over one another. With Python 3.10+:

```sh
python source-publication/assemble-runtime-sources.py --manifest source-publication/final-runtime/SOURCE-MANIFEST.json --parts-dir /path/to/source-parts
```

To assemble a new inspectable source tree with the retained Electron patches, add `--destination /path/to/new-source-tree --apply-patches`. Git, symlink support and enough space for expanded sources are required. The assembler verifies and extracts retained data; it does not download sources, run upstream hooks or compile the runtime.

Read each application's **`licenses/ELECTRON-SOURCE-ACCESS.md`** for exact source revisions and platform build requirements. Reader additionally includes **`licenses/SOURCE-AND-REBUILD.md`** and **`licenses/ONNX-SOURCE-ACCESS.md`**. These guides distinguish source preservation from rebuilding and explain compatible replacement procedures. Keep source inventories, provenance, original notices and build inputs together. A source collection does not replace platform compilers, SDKs or ordinary build utilities, and does not claim byte-identical reproduction of upstream binaries.

Reader and Alternative source builds must prepare and verify the required CPU speech assets before packaging. A source-only checkout is not an installed speech runtime. Follow the component build guide and retain engine/model licenses; do not omit required assets to produce a package that advertises unavailable built-in voices.

When redistributing desktop binaries, preserve the application source, all required matching source companions or their documented accessible offers, and the source-access instructions and licenses inside each package. The suite's MIT license does not replace third-party terms.

## Rebuild the manual

Install Python 3.10+ and PHP CLI 8.2+ with ctype. From the suite root:

```sh
python3 manual/build.py
```

On Windows, use `py -3 manual/build.py`. The script validates the authored content with the bundled Gopher HTTP 3.0.0 engine and builds `docs/`. Browsing the generated output requires neither PHP nor Python.

Use `--check-only` to validate content without rebuilding, or `--php` to select a PHP executable outside PATH. Keep manual screenshots in the source image directory; never add private application profiles or raw conversation exports to the public manual inputs.

## Publish the GitHub repository and website

The intended repository is [Davoda1/ThreadShelf-Local-Suite](https://github.com/Davoda1/ThreadShelf-Local-Suite). Commit the extracted source tree, then use the included maintainer guide to configure GitHub Actions, the public release and GitHub Pages. Upload the current native application packages, suite Source archive, manual and preview assets and consolidated `SHA256SUM.txt`. Preserve the matching dependency-source offers and access links described above alongside the corresponding binaries; do not relabel historical runtime sources as a new dependency version.

The hosted manual is available at [davoda1.github.io/ThreadShelf-Local-Suite-Manual](https://davoda1.github.io/ThreadShelf-Local-Suite-Manual/). A separate public [manual website repository](https://github.com/Davoda1/ThreadShelf-Local-Suite-Manual) publishes the generated `docs/` files and required notices. Application sources and desktop releases remain in the public main suite repository. The built site uses relative navigation and supports the website subdirectory as well as offline browsing. After rebuilding the manual, synchronize the generated files with the website repository as described in the maintainer guide.

## Upstream and licensing

The suite’s original code/documentation is MIT licensed with `Copyright (c) 2026 davoda1`. Upstream components keep their own notices and terms. The original [ThreadShelf repository](https://github.com/ChrystianSchutz/ThreadShelf) supplies the server; Gopher HTTP 3.0.0 supplies this manual’s publisher. Consult the root and component license inventories for bundled rendering libraries, native dependencies, fonts and other assets.

The suite’s GitHub repository is an independent project. Attribution and dependency information establish the suite’s relationship to upstream; it is not a GitHub fork of the server.
