# Native component source and rebuild references

This file records how the bundled sharp/libvips components can be traced to
their source and replaced. The desktop application's source is in the suite
source archive. The matching native dependency source materials are supplied
as the separate release asset
[ThreadShelf-Local-Suite-1.0.0-Native-Sources.tar.gz](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.0.0/ThreadShelf-Local-Suite-1.0.0-Native-Sources.tar.gz).
The release `SHA256SUM.txt` verifies this download. Preserve that asset and the
source-access link when redistributing the Reader binaries.

For 1.3.0, verified reuse of this historical companion is limited to the
unchanged sharp/libvips sources described here. Its Electron-specific source
materials cover the old runtime and do not satisfy Electron 45.1.0 source
availability. See `ELECTRON-SOURCE-ACCESS.md` for the matching 45.1.0 source collection.

ONNX Runtime native, Web/WASM and common packages are now 1.31.1. Their
separate [source and provenance record](ONNX-SOURCE-ACCESS.md) identifies the
new release, npm integrity pins, retained notices, Transformers source adapter
and native telemetry control. The historical companion linked above does not
establish source coverage for ONNX Runtime 1.31.1.

The companion archive contains versioned component source archives, patches,
build recipes, checksummed Rust dependency sources, and source provenance for
the Linux, Windows and WebAssembly sharp/libvips packages. The companion manifests map
the shipped component versions to their source files and SHA-256 values.
Original component copyright/license notices also accompany every Reader
package under [native-components](native-components/README.md).

Upstream Windows and WebAssembly builds used some mutable branch or image
references. The companion manifests identify the recovered snapshots and
record the evidence and limits: the WebAssembly snapshot is a bounded
historical inference checked against the upstream build log, component
versions, and applied patches. Native dependencies were not rebuilt during
this preparation, and byte-identical reproduction is not claimed. Compiler
SDK binaries and operating-system dependencies are obtained separately using
the upstream build instructions.

## Exact versions and upstream build recipes

- sharp: **0.35.5**, source at
  https://github.com/lovell/sharp/tree/v0.35.5 and source archive at
  https://github.com/lovell/sharp/archive/refs/tags/v0.35.5.tar.gz.
- Linux libvips packages: **1.3.4**, built with **libvips 8.18.7**.
  Source/build repository:
  https://github.com/lovell/sharp-libvips/tree/v1.3.4.
- libvips **8.18.7** source:
  https://github.com/libvips/libvips/tree/v8.18.7 and
  https://github.com/libvips/libvips/releases/download/v8.18.7/vips-8.18.7.tar.xz.
- The exact library versions for each included native or WASM package are
  preserved in `native/<package>/versions.json`. The upstream READMEs in the
  same directories contain component license tables. The npm package
  versions and license expressions are retained in `package.json` there.
- The preserved upstream `sharp-libvips-build-posix.sh` fetches component
  sources and records patches and compiler/linker options. The matching
  version assignments are in `sharp-libvips-versions.properties`.
- The preserved `sharp-libvips-build-win.sh` uses the libvips Windows build
  project at https://github.com/libvips/build-win64-mxe and the versioned
  **v8.18.7** release. The project's source recipes and release contents are
  the upstream references for the Windows libraries.
- The preserved `sharp-libvips-build-wasm.sh` explains the separate
  https://github.com/kleisauke/wasm-vips build process used by the sharp
  WebAssembly package. Use the versions recorded by the corresponding
  `native/sharp-wasm32/versions.json` and the sharp release build files.

The copied shell scripts are provenance/reference documents, not a
self-contained toolchain: use the matching complete upstream repositories
to obtain their Dockerfiles, patches, and other referenced files. See
`UPSTREAM-SOURCES.json` for the exact downloaded document hashes.

## Replacing or rebuilding a library

Close the application and keep a backup of the extracted distribution.
Runtime dependencies are ordinary files under `resources/app/node_modules`
on Windows, or `app/resources/app/node_modules` in the Linux TAR distribution
(`/opt/threadshelf-local-reader/resources/app/node_modules` for the DEB).
They are not sealed inside an ASAR archive.

For example, the Linux libvips shared library is in
`@img/sharp-libvips-linux-x64/lib/`, Windows sharp libraries are in
`@img/sharp-win32-x64/lib/`, and sharp WASM assets are in
`@img/sharp-wasm32/lib/`. Rebuild from the appropriate upstream version and
replace the corresponding files, retaining the expected ABI and dependent
library names. The source package can also be rebuilt with compatible,
modified dependencies through the documented npm/build/package workflow.
Check the resulting library's own upstream build instructions and licenses.

ThreadShelf Local Reader does not restrict these changes or reverse
engineering for debugging modifications. Replacing runtime components may
change behavior; preserve the original package so it can be restored.
