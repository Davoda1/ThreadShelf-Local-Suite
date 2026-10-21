# Electron runtime source access and rebuilding

All three ThreadShelf Local Suite 1.0.0 desktop applications use **Electron
44.9.1**, with **Chromium 152.0.7977.167** and Electron's pinned dependencies and
patches. The suite's MIT license covers the original application code; it does
not replace the runtime components' licenses.

## Sources available beside the applications

The [v1.0.0 release](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/tag/v1.0.0)
provides these source downloads beside the Windows and Linux binaries:

- `ThreadShelf-Local-Suite-1.0.0-Source.tar.gz`: the original suite application
  source, packaging and branding tools, manual and retained notices.
- `ThreadShelf-Local-Suite-1.0.0-Native-Sources.tar.gz`: the Reader native
  dependency source companion and the identified Electron library source sets,
  original licenses, provenance and per-file Blink license-selection index.
- **All numbered** `ThreadShelf-Local-Suite-1.0.0-Runtime-Sources-*.tar.gz`
  parts: the matching Electron/Chromium runtime source mirror. Download every
  numbered part and verify each against the release's `SHA256SUM.txt`.

The Runtime-Sources parts contain the complete pinned Git source trees selected
by Electron's dependency graph for Linux x64 and Windows x64, including the
complete Chromium tree, Electron's ordered patches, Node.js, V8 and the selected
recursive dependencies. Additional material includes the runtime JavaScript
package sources, source-bearing build packages, Rust standard-library sources
with their vendored dependencies, and the exact Linux, Windows and V8 release
optimization profiles. The manifest records revisions, original source URLs,
archive hashes, component destinations and the scope of supplemental material.
The dependency-condition audit distinguishes enabled and disabled platforms and
lists separately obtained build tools and SDKs.

Extract every Runtime-Sources part into the same parent directory. The parts
merge into `ThreadShelf-Local-Suite-1.0.0-Runtime-Sources/`. From that directory,
verify all inner archives with Python 3:

```sh
python assemble-runtime-sources.py
```

For an inspectable source tree with Electron's patches applied, choose a new,
empty destination and run:

```sh
python assemble-runtime-sources.py --destination ../electron-source --apply-patches
```

This step requires Git and considerable free disk space. The helper checks
archive hashes, extracts the pinned sources and applies the original patches in
order; it does not download or execute the source. Read the mirror's `README.md`
and `SOURCE-MANIFEST.json` for the source layout and build prerequisites. These
archives preserve the source and release build data; a compiler, platform SDK,
normal build utilities and package-manager installation remain necessary.

The Native-Sources companion additionally retains the original scoped source
archives for FFmpeg, Opus, NASM, Blink and Mozilla-derived code, together with the
Reader sharp/libvips dependencies. Keep both companions and the suite source
available alongside the binaries when redistributing the release. Ordinary
application installation does not require any source download.

## Exact upstream source references

| Material | Exact source |
| --- | --- |
| Electron | [v44.9.1 source tree](https://github.com/electron/electron/tree/v44.9.1), [source archive](https://github.com/electron/electron/archive/refs/tags/v44.9.1.tar.gz), [DEPS](https://github.com/electron/electron/blob/v44.9.1/DEPS) |
| Chromium | [152.0.7977.167 source tree](https://chromium.googlesource.com/chromium/src/+/152.0.7977.167/), [complete dependency pins](https://chromium.googlesource.com/chromium/src/+/152.0.7977.167/DEPS) |
| FFmpeg fork | [2b68d2babae73714846961fb0ee47e3b3d2e39a9](https://chromium.googlesource.com/chromium/third_party/ffmpeg/+/2b68d2babae73714846961fb0ee47e3b3d2e39a9/) |
| Electron's Chromium modifications | [44.9.1 patch set](https://github.com/electron/electron/tree/v44.9.1/patches/chromium) and [patch configuration](https://github.com/electron/electron/blob/v44.9.1/patches/config.json) |
| Electron build procedure | [versioned build instructions](https://github.com/electron/electron/blob/v44.9.1/docs/development/build-instructions-gn.md) |
| Suite application/branding source | [ThreadShelf Local Suite v1.0.0](https://github.com/Davoda1/ThreadShelf-Local-Suite/tree/v1.0.0) |

Keep the original Electron `LICENSE` and `LICENSES.chromium.html` beside the
runtime executable. The latter is a broad upstream notice collection; the
presence alone does not mean every named Android, macOS, system or optional
component is included in these Windows/Linux packages.

## License selections and retained exceptions

FFmpeg's original grant permits LGPL 2.1 or later. For the FFmpeg library in this
distribution, LGPLv3 is selected under that permission. The Chrome x64 configs
retained in the source set have `CONFIG_GPL=0`, `CONFIG_NONFREE=0` and
`CONFIG_VERSION3=0`; those upstream build settings are preserved unchanged.
The distribution's permitted license-version selection does not change the
library bytes or claim that optional GPL-only FFmpeg features were enabled.

For Blink source files whose original grant explicitly permits a later LGPL
version, this distribution selects LGPLv3. The exact reviewed files and source
hashes are recorded in `electron-runtime/BLINK-LICENSE-SELECTION.json` in the
companion. All original notices remain intact. This selection does not apply
to other files merely because they belong to Blink.

In particular, Blink's production file
`third_party/blink/renderer/platform/wtf/text/base64.cc` retains the original
LGPL version 2 grant, which does not state an “or later” option. It is mirrored
unchanged in the complete renderer source archive. The original terms remain
applicable; it is not represented as an LGPLv3-only file. The original
multi-license choices of Mozilla-derived files also remain available.

Full GNU Library GPL version 2, GNU LGPLv3 and GNU GPLv3 texts accompany this
document as `GNU-LGPL-2.0.txt`, `GNU-LGPL-3.0.txt` and `GNU-GPL-3.0.txt` in the
application's `licenses/` directory. Source archives retain additional original
license texts, including the Mozilla terms.

## Obtain the complete matching runtime source

Use the requirements and platform-specific setup in Electron's versioned build
instructions linked above. Install Git, Python and Chromium's depot_tools on a
supported build host, with depot_tools on PATH. In a new checkout directory:

```sh
gclient config --name "src/electron" --unmanaged https://github.com/electron/electron
git clone --branch v44.9.1 --depth 1 https://github.com/electron/electron src/electron
gclient sync --with_branch_heads --with_tags
```

The unmanaged Electron checkout stays on the selected tag. The Electron DEPS file selects
Chromium 152.0.7977.167 and the remaining exact dependency revisions. Normal
gclient hooks apply Electron's patches and prepare the upstream toolchain/build
inputs. Do not replace this with Chromium's latest branch, an unpatched Chromium
checkout, or the unrelated upstream FFmpeg release branch. The full checkout and
platform build tools are substantial downloads and are performed only when a
developer chooses to retrieve/rebuild the runtime.

Check the selected source before building:

```sh
git -C src/electron describe --tags --exact-match
git -C src/third_party/ffmpeg rev-parse HEAD
```

Electron's applied patches can add local commits to dependency repositories, so
retain the original DEPS revision and applied patch records as well as the
post-hook HEAD. The Runtime-Sources `SOURCE-MANIFEST.json` supplies independent
archive hashes and the exact inputs used for this release's source preservation.

## Rebuild and install modified components

From `src/`, create `out/Release/args.gn` containing:

```gn
import("//electron/build/args/release.gn")
target_cpu = "x64"
```

Then run:

```sh
gn gen out/Release
gn desc out/Release //third_party/ffmpeg:ffmpeg outputs
ninja -C out/Release ffmpeg
```

This builds the `libffmpeg.so` Linux or `ffmpeg.dll` Windows shared-library
target using the release's Chrome codec configuration. Keep the Release args:
Electron's separate `build/args/ffmpeg.gn` selects a different Chromium-codec
replacement build. Windows additionally requires the Visual Studio/Windows SDK
setup described by the versioned Electron instructions; Linux needs the supported
compiler and sysroot setup.

To modify Blink or another statically incorporated runtime component, rebuild
the complete runtime instead:

```sh
ninja -C out/Release electron
```

With the application closed, an interface-compatible replacement FFmpeg library
can replace the existing file beside the Electron executable. For a rebuilt
complete runtime, use a separate copy of the extracted application and replace
the runtime files together, preserving the application's `resources/app` payload
and original notices. Use the suite's published packaging/branding scripts to
restore the application name and Windows resources. Runtime locations are the
Windows portable root, Linux Reader/Analytics `app/`, Linux Alternative
`lib/threadshelf-local-alternative/`, and the Debian installation's
`/opt/threadshelf-local-<application>/` directory.

The suite imposes no restriction on modifying/replacing these libraries or on
reverse engineering to debug those modifications. The packages are unsigned and
do not require a publisher signing key to run a rebuilt compatible runtime.
These are source/build instructions; a full native runtime rebuild and
bit-for-bit reproduction of Electron's release binaries were not performed as
part of the source-preservation checks.

## Keeping source access available when redistributing

Offer the suite Source archive, the Native-Sources companion and **every**
Runtime-Sources part from the same release/download location as the corresponding
binaries. Keep the source-access documents and original license files inside
each application package. Preserve the exact source manifests, patches,
provenance, build data and notices; publish updated source material when changing
a covered component. An upstream link alone does not replace the accompanying
source mirror for this release.

For the retained LGPL version 2 component, this distribution uses section 6(c):
equivalent access to the section 6(a) source/relink materials from the same
designated download place. The complete runtime source mirror supplies the
library and the source form of the runtime that links with the library; the
suite Source archive supplies the application and branding code. The build and
replacement instructions above explain how to produce and use modified versions.
See the included `GNU-LGPL-2.0.txt` for the original terms.

The same source access also accompanies the components selected under LGPLv3;
LGPLv3 section 4(d)(0) refers to GPLv3's corresponding-source provisions. The
original Mozilla terms and all other retained component licenses continue to
apply. Keep all source parts available for as long as the matching binary
downloads are offered.
