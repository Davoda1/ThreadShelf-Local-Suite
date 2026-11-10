# Electron runtime source access and rebuilding

ThreadShelf Local Suite **1.4.4** uses **Electron 45.2.3**, **Chromium
156.0.8078.80**, and embedded **Node.js 24.22.2**. Electron's embedded Node is
independent of the external Node.js 26.13.0 LTS build toolchain.
Original Electron/Chromium notices remain beside each runtime executable.
The suite license does not replace any bundled component's original terms.

## Matching source downloads

The complete source set consists of the original **1.3.0** source collection
**plus** the matching **1.4.4** update supplement:

- [Electron 45.2.3 source update](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.4.4/ThreadShelf-Local-Suite-1.4.4-Runtime-Source-Update.tar.gz).
- Original source ZIPs: [part 01](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.3.0/ThreadShelf-Local-Suite-1.3.0-Runtime-Sources-01.zip), [part 02](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.3.0/ThreadShelf-Local-Suite-1.3.0-Runtime-Sources-02.zip), [part 03](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.3.0/ThreadShelf-Local-Suite-1.3.0-Runtime-Sources-03.zip), [part 04](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.3.0/ThreadShelf-Local-Suite-1.3.0-Runtime-Sources-04.zip), [part 05](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.3.0/ThreadShelf-Local-Suite-1.3.0-Runtime-Sources-05.zip), [part 06](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.3.0/ThreadShelf-Local-Suite-1.3.0-Runtime-Sources-06.zip).
- [Original metadata and offline assembler](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.3.0/ThreadShelf-Local-Suite-1.3.0-Runtime-Sources-Metadata.zip).
- Verify the historical files with the [1.3.0 checksum](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.3.0/SHA256SUM.txt) and the supplement with the [1.4.4 checksum](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.4.4/SHA256SUM.txt).

The historical ZIPs alone describe Electron 45.1.0. The supplement preserves
all matching changed source files, full new Electron/Node archives and exact
new release optimization profiles. The original source mirrors and this
supplement together retain the complete Linux x64/Windows x64 source set;
neither is a standalone compiler/SDK distribution.

## Offline assembly and source verification

Keep all six numbered ZIPs together. Extract only their metadata ZIP, then
assemble the original source tree **without `--apply-patches`**:

```sh
python source-publication/assemble-runtime-sources.py --manifest source-publication/final-runtime/SOURCE-MANIFEST.json --parts-dir /path/to/parts --destination /path/to/new-source-tree
```

Extract the update supplement separately, then run:

```sh
python runtime-source-update/update-runtime-sources.py --destination /path/to/new-source-tree --apply-patches
```

Python 3.10+, Git, symlink support and sufficient disk space are required.
Use a new tree: original-file hashes reject conflicting modifications. The
updater verifies its source inputs, installs the exact updated originals,
then checks/applies Electron's current ordered patches. It does not run hooks,
install toolchains or compile the runtime. The supplementary manifest and
verification records are also in `maintainer/runtime-source-update/` in the
suite source. Historical source evidence retains its original 45.1.0 scope.

## Exact upstream inputs

| Material | Pinned source |
| --- | --- |
| Electron 45.2.3 | [`d0a18d02058b21ff292e25d5f53f00bd120f2f61`](https://github.com/electron/electron/tree/d0a18d02058b21ff292e25d5f53f00bd120f2f61) |
| Chromium 156.0.8078.80 | [`fb096c0011f9d50f0a264a9376420cdea9c421e3`](https://chromium.googlesource.com/chromium/src/+/fb096c0011f9d50f0a264a9376420cdea9c421e3/) |
| Embedded Node.js 24.22.2 | [`f7f273a9bb6445f6f7fb6349105e7532972045fb`](https://github.com/nodejs/node/tree/f7f273a9bb6445f6f7fb6349105e7532972045fb) |
| Chromium FFmpeg fork, unchanged | [`9db86ce5b5b454dfc96c435f9f0723012980c37f`](https://chromium.googlesource.com/chromium/third_party/ffmpeg/+/9db86ce5b5b454dfc96c435f9f0723012980c37f/) |
| Dependency pins | [Electron DEPS](https://github.com/electron/electron/blob/v45.2.3/DEPS), [Chromium DEPS](https://chromium.googlesource.com/chromium/src/+/156.0.8078.80/DEPS) |
| Electron patches and build | [Ordered patches](https://github.com/electron/electron/tree/v45.2.3/patches), [build instructions](https://github.com/electron/electron/blob/v45.2.3/docs/development/build-instructions-gn.md) |

## Original terms and replacing runtime components

Keep Electron's original `LICENSE` and `LICENSES.chromium.html`. FFmpeg's
original LGPL 2.1-or-later grant, Blink's original LGPL notices (including the
version-2-only `base64.cc` grant), and Mozilla-derived files' original license
alternatives are preserved. No blanket later-version election is made.
The GNU Library GPL version 2, LGPLv3 and GPLv3 texts remain in this directory.
The broad Chromium notice collection also includes optional or platform-specific
components which need not be present in every distributed binary.

Follow the versioned upstream build instructions on the target platform with
Git, Python, depot_tools and the documented compiler/SDK. Use the assembled
matching source tree. Set `target_cpu = "x64"` and import
`//electron/build/args/release.gn` in `out/Release/args.gn`, then run:

```sh
gn gen out/Release
ninja -C out/Release ffmpeg
# Rebuild statically incorporated components with the complete runtime:
ninja -C out/Release electron
```

A compatible rebuilt FFmpeg library may replace the original beside the
runtime executable while the app is closed. To replace the complete runtime,
use a separate package copy, preserve `resources/app` and original notices,
and apply the suite's packaging/branding source for executable naming.
There is no publisher signing-key requirement, and ThreadShelf imposes no
restriction on reverse engineering to debug these modifications.

The packagers use official Electron binaries. Source verification is not a
complete native rebuild, bit-identical binary reproduction or legal certification.
Preserve the suite source, original collection, supplement, notices and rebuild
instructions for as long as the corresponding binaries are offered.
