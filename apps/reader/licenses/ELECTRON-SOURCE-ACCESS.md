# Electron runtime source access and rebuilding

The ThreadShelf Local Suite **1.3.0** uses **Electron 45.1.0**,
**Chromium 156.0.8078.49**, and embedded **Node.js 24.22.1**. Electron's embedded
Node version is independent of the Node/npm installation used to build the apps.
The suite's MIT license covers its original application code and does not
replace the licenses of Electron, Chromium, or other bundled components.

## Matching source downloads

The complete selected Linux x64 and Windows x64 source collection is supplied
with the 1.3.0 release:

- Runtime source ZIPs: [part 01](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.3.0/ThreadShelf-Local-Suite-1.3.0-Runtime-Sources-01.zip) · [part 02](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.3.0/ThreadShelf-Local-Suite-1.3.0-Runtime-Sources-02.zip) · [part 03](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.3.0/ThreadShelf-Local-Suite-1.3.0-Runtime-Sources-03.zip) · [part 04](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.3.0/ThreadShelf-Local-Suite-1.3.0-Runtime-Sources-04.zip) · [part 05](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.3.0/ThreadShelf-Local-Suite-1.3.0-Runtime-Sources-05.zip) · [part 06](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.3.0/ThreadShelf-Local-Suite-1.3.0-Runtime-Sources-06.zip).
- [Runtime source metadata and offline assembler](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.3.0/ThreadShelf-Local-Suite-1.3.0-Runtime-Sources-Metadata.zip).
- [Release SHA256SUM.txt](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/download/v1.3.0/SHA256SUM.txt), covering these assets and the application packages.

Keep **all six numbered ZIPs** together. Extract only the metadata ZIP, which
creates `source-publication/`; the assembler reads the numbered ZIPs directly.
Do not extract their repeated `PART-MANIFEST.json` files over one another.
With Python 3.10+:

```sh
python source-publication/assemble-runtime-sources.py --manifest source-publication/final-runtime/SOURCE-MANIFEST.json --parts-dir /path/to/source-parts
```

To assemble a new source tree and apply the retained Electron patches, add
`--destination /path/to/new-source-tree --apply-patches`. This additionally
requires Git, symlink support and sufficient space for the expanded sources.
The helper performs no downloads, upstream hooks or compilation.

The suite source retains the pinned provenance inventory and source-verifier
at `maintainer/runtime-sources-1.3.0.json` and
`maintainer/verify-release-sources.py`. The complete manifests and compressed
per-file inventories are in the metadata companion. The historical Electron
44.9.1 mirror remains associated with its earlier release. Reader reuses only
the unchanged sharp/libvips scope of the original Native-Sources companion;
see its [native source references](../../reader/licenses/SOURCE-AND-REBUILD.md).

## Exact upstream inputs

| Material | Pinned source |
| --- | --- |
| Electron 45.1.0 | [`45d20ec03000aac41e73b2abdb707936b4f98ed0`](https://github.com/electron/electron/tree/45d20ec03000aac41e73b2abdb707936b4f98ed0) |
| Chromium 156.0.8078.49 | [`29eb03535d5f2f4f899b95f22a92413ffde5284e`](https://chromium.googlesource.com/chromium/src/+/29eb03535d5f2f4f899b95f22a92413ffde5284e/) |
| Node.js 24.22.1 | [`ce7aaf1cee78b8cf0ce17364260535c418d3ed26`](https://github.com/nodejs/node/tree/ce7aaf1cee78b8cf0ce17364260535c418d3ed26) |
| Chromium FFmpeg fork | [`9db86ce5b5b454dfc96c435f9f0723012980c37f`](https://chromium.googlesource.com/chromium/third_party/ffmpeg/+/9db86ce5b5b454dfc96c435f9f0723012980c37f/) |
| Dependency pins | [Electron DEPS](https://github.com/electron/electron/blob/v45.1.0/DEPS), [Chromium DEPS](https://chromium.googlesource.com/chromium/src/+/156.0.8078.49/DEPS) |
| Electron modifications | [Ordered patches](https://github.com/electron/electron/tree/v45.1.0/patches), [patch configuration](https://github.com/electron/electron/blob/v45.1.0/patches/config.json) |
| Build procedure | [Versioned build instructions](https://github.com/electron/electron/blob/v45.1.0/docs/development/build-instructions-gn.md) |

## Coverage and verification

The collection contains **179 selected Git source trees**, **six supplemental
source archives**, and **one archive of the three exact release optimization
profiles and their version marker**: 186 archives in total. It preserves the
Linux x64/Windows x64 union of recursive DEPS, runtime JavaScript source,
source-bearing build packages, Rust library/vendor source and exact
compiler-runtime source references. Non-Git conditions, external compilers,
platform SDKs and build utilities are classified explicitly in the metadata.
It is a source collection, not an offline SDK or an attested compiler image.

Validation binds outer and inner hashes, every logical file/link entry,
archive destinations and source identities. It checks collisions, expanded
symlink targets, original notice bytes and all **257 ordered Electron patch
applications**. New files introduced by patches are distinguished from missing
original inputs. Gitiles archives whose tar metadata varied were additionally
checked against their pinned Git blob/tree identities.

The ordinary suite packagers use official Electron binaries. The source
collection was not used for a complete Electron rebuild, and no byte-identical
binary reproducibility claim is made. Preserve the suite source, all matching
source companions, original notices and rebuild instructions alongside the
corresponding binaries for as long as those binaries are offered.

## Retained original licenses

Keep Electron's original `LICENSE` and `LICENSES.chromium.html` beside the
runtime executable. The broad Chromium notice collection does not imply every
named Android, macOS, system, test or optional component is present in the
Windows/Linux application packages.

FFmpeg's original grant permits LGPL 2.1 or later. Any permitted later-version
selection must retain the original grant and exact source/build configurations.
Do not carry the old Blink per-file selection index forward as evidence for a
new Chromium revision; regenerate and review it against the new source.

The pinned Chromium 156.0.8078.49 production file
`third_party/blink/renderer/platform/wtf/text/base64.cc` still carries its
original LGPL version 2 grant without an “or later” option. That source and its
original terms must be preserved. Its retained source hash is recorded in the
source inventory. Mozilla-derived files retain their original multi-license
choices. No blanket LGPLv3-only claim is made for these runtime sources.

The full GNU Library GPL version 2, GNU LGPLv3 and GNU GPLv3 texts remain in
`GNU-LGPL-2.0.txt`, `GNU-LGPL-3.0.txt`, and `GNU-GPL-3.0.txt` in this directory.
The distribution retains its equivalent-source-access procedure for the LGPL
version 2 component; the matching source and build/relink inputs are supplied through the complete
source collection described above.

## Obtain and rebuild from upstream

Follow the linked versioned Electron instructions on the target platform.
Install Git, Python, Chromium depot_tools, and the documented compiler/SDK.
In a new checkout directory:

```sh
gclient config --name "src/electron" --unmanaged https://github.com/electron/electron
git clone --branch v45.1.0 --depth 1 https://github.com/electron/electron src/electron
gclient sync --with_branch_heads --with_tags
```

The unmanaged Electron checkout remains on the selected release. Normal gclient
hooks apply Electron's patches and retrieve platform-specific build inputs.
For the source mirror, evaluate the Linux and Windows dependency configurations
separately and preserve their union. Do not substitute Chromium's latest branch
or an unrelated upstream FFmpeg release. Record original dependency revisions,
applied patches and resulting checkout state.

From `src/`, create `out/Release/args.gn` containing:

```gn
import("//electron/build/args/release.gn")
target_cpu = "x64"
```

Then use:

```sh
gn gen out/Release
gn desc out/Release //third_party/ffmpeg:ffmpeg outputs
ninja -C out/Release ffmpeg
# To rebuild statically incorporated components as well:
ninja -C out/Release electron
```

Keep the release args and matching codec configuration. A compatible rebuilt
FFmpeg shared library can replace the file beside the runtime executable while
the application is closed. For a complete rebuilt runtime, work on a separate
copy and replace the runtime files together, preserving `resources/app` and all
notices. Use the suite packaging/branding source to restore the application
name and Windows resources. Follow the package README for the actual runtime
installation directory.

ThreadShelf imposes no restriction on replacing these components or on reverse
engineering to debug those modifications. The application binaries are unsigned
and do not require a publisher signing key to run a compatible rebuilt runtime.
These are upstream rebuild directions; no complete native runtime rebuild or
bit-for-bit reproduction is claimed by this source collection.
