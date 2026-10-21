# Developer and maintainer reference

The suite source archive is an editable repository tree. Extract it and read the root `README.md` before building. Each application lives under `apps/`, the integration under `server-patch/`, and this manual’s source under `manual/`. The generated Gopher website is under `docs/`.

## Build documentation

Follow the root maintainer instructions for the pinned Node.js 24.19.0 LTS/npm 11.9.0 toolchain, dependency installation, native packaging and release checks. All three public 1.0.0 applications use Electron **44.9.1** with Chromium **152.0.7977.167**. The runtime’s embedded Node.js is separate from the development Node.js toolchain. Use the component’s own build guide when working on one application. Keep source code, dependency lockfiles and license notices together.

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

The [v1.0.0 release](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/tag/v1.0.0) provides the suite Source archive, a separate [Native-Sources companion](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.0.0/ThreadShelf-Local-Suite-1.0.0-Native-Sources.tar.gz) and all numbered Runtime-Sources parts beside the desktop packages. Verify each download with the release’s `SHA256SUM.txt` before using the archive contents. The packaged applications already include their runtime; ordinary installation does not require these development sources.

| Download | Contents and purpose |
| --- | --- |
| `ThreadShelf-Local-Suite-1.0.0-Source.tar.gz` | The editable suite repository: application and server-patch code, build/branding tools, retained notices and this manual |
| `ThreadShelf-Local-Suite-1.0.0-Native-Sources.tar.gz` | The covered native dependency sources, patches, build material, original notices and provenance identified by the companion’s manifests |
| **All numbered** `ThreadShelf-Local-Suite-1.0.0-Runtime-Sources-*.tar.gz` parts | The complete pinned Git source trees selected by Electron’s Linux x64 and Windows x64 dependency graph, plus the accompanying runtime package sources and build inputs |
| Application ZIP, TAR.GZ or DEB | The native application and runtime, with packaged source-access instructions and license notices |

The Native-Sources companion covers the identified Reader sharp/libvips dependencies and selected Electron runtime source sets. The companion’s `electron-runtime/` directory includes the complete Electron 44.9.1 source archive and patch/build inputs, the matching Chromium FFmpeg fork and associated Opus/NASM material, Blink renderer/interfaces/tools sources, and the identified Chromium-modified Mozilla subsets. The manifests state the exact versions, source URLs, archive hashes, recovered-snapshot evidence and any provenance limits.

The Runtime-Sources parts provide the complete matching Electron/Chromium Git source graph for the two released platforms, including Node.js, V8, recursive dependencies and Electron’s ordered patches. They also retain runtime JavaScript package sources, source-bearing build packages, Rust standard-library sources with vendored dependencies, and the exact Linux, Windows and V8 release optimization profiles. The manifests identify the revisions, source URLs, hashes, component destinations, supplemental material and separately obtained tool/SDK requirements.

Download **every numbered Runtime-Sources part** and extract all parts into the same parent directory. They merge into `ThreadShelf-Local-Suite-1.0.0-Runtime-Sources/`. From that directory, verify the inner archives with Python 3:

```sh
python assemble-runtime-sources.py
```

To assemble an inspectable source tree with Electron’s patches applied, choose a new, empty destination and run:

```sh
python assemble-runtime-sources.py --destination ../electron-source --apply-patches
```

Assembly requires Git and considerable free disk space. The helper verifies archive hashes, extracts the pinned source trees and applies the original patches in order; it does not download or execute the source. Read the mirror’s `README.md` and `SOURCE-MANIFEST.json` before assembling or building. The source archives do not replace a compiler, platform SDK, normal build utilities or package-manager installation.

Complete source-access and platform build requirements are documented in each application’s **`licenses/ELECTRON-SOURCE-ACCESS.md`**. In the source repository, use the [Reader](https://github.com/Davoda1/ThreadShelf-Local-Suite/blob/v1.0.0/apps/reader/licenses/ELECTRON-SOURCE-ACCESS.md), [Analytics](https://github.com/Davoda1/ThreadShelf-Local-Suite/blob/v1.0.0/apps/analytics/licenses/ELECTRON-SOURCE-ACCESS.md) or [Alternative](https://github.com/Davoda1/ThreadShelf-Local-Suite/blob/v1.0.0/apps/alternative/licenses/ELECTRON-SOURCE-ACCESS.md) copy. The same instructions accompany the packaged application’s license files; Reader’s `licenses/SOURCE-AND-REBUILD.md` adds the Reader-specific sharp/libvips references.

Those guides explain how to obtain the platform build tools, retrieve the pinned sources directly from upstream if preferred, rebuild an individual shared component or the full runtime, and replace compatible components in a separate copy of an extracted application. Preserve the `resources/app` payload, branding inputs and original notices when following a runtime replacement procedure. A full native runtime rebuild or byte-identical reproduction of the upstream binaries is not claimed by the source-preservation checks.

When redistributing the applications, keep the suite Source archive, the Native-Sources companion and **every Runtime-Sources part** available from the same release/download location as the binaries. Keep the exact source-access directions and license files inside each application package. Preserve the original component notices, manifests, patches, provenance and build inputs. Consult the application’s source-access guide for the specific license selections and retained exceptions; the suite’s MIT license does not replace third-party terms.

## Rebuild the manual

Install Python 3.10+ and PHP CLI 8.2+ with ctype. From the suite root:

```sh
python3 manual/build.py
```

On Windows, use `py -3 manual/build.py`. The script validates the authored content with the bundled Gopher HTTP 3.0.0 engine and builds `docs/`. Browsing the generated output requires neither PHP nor Python.

Use `--check-only` to validate content without rebuilding, or `--php` to select a PHP executable outside PATH. Keep manual screenshots in the source image directory; never add private application profiles or raw conversation exports to the public manual inputs.

## Publish the GitHub repository and website

The intended repository is [Davoda1/ThreadShelf-Local-Suite](https://github.com/Davoda1/ThreadShelf-Local-Suite). Commit the extracted source tree, then use the included maintainer guide to configure GitHub Actions, the public release and GitHub Pages. Upload the individual native application packages, the suite Source archive, the Native-Sources companion, every numbered Runtime-Sources part and `SHA256SUM.txt` as release assets. Keep all source downloads and source-access links available alongside the corresponding binaries.

The hosted manual is available at [davoda1.github.io/ThreadShelf-Local-Suite-Manual](https://davoda1.github.io/ThreadShelf-Local-Suite-Manual/). A separate public [manual website repository](https://github.com/Davoda1/ThreadShelf-Local-Suite-Manual) publishes the generated `docs/` files and required notices. Application sources and desktop releases remain in the main suite repository, which can stay private while the manual is public. The built site uses relative navigation and supports the website subdirectory as well as offline browsing. After rebuilding the manual, synchronize the generated files with the website repository as described in the maintainer guide.

## Upstream and licensing

The suite’s original code/documentation is MIT licensed with `Copyright (c) 2026 davoda1`. Upstream components keep their own notices and terms. The original [ThreadShelf repository](https://github.com/ChrystianSchutz/ThreadShelf) supplies the server; Gopher HTTP 3.0.0 supplies this manual’s publisher. Consult the root and component license inventories for bundled rendering libraries, native dependencies, fonts and other assets.

The suite’s GitHub repository is an independent project. Attribution and dependency information establish the suite’s relationship to upstream; it is not a GitHub fork of the server.
