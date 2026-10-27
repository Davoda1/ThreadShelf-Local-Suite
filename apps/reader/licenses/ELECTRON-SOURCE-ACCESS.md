# Electron runtime source access and rebuilding

The ThreadShelf Local Suite **1.3.0 candidate** targets **Electron 45.1.0**,
**Chromium 156.0.8078.49**, and embedded **Node.js 24.22.1**. Electron's embedded
Node version is independent of the Node/npm installation used to build the apps.
The suite's MIT license covers its original application code and does not
replace the licenses of Electron, Chromium, or other bundled components.

## Source preparation status

**The complete matching runtime source companion has not yet been assembled
and verified. Publication of the 1.3.0 binaries remains blocked on this work.**
The prepared source seeds and provenance documents are not a complete runtime
mirror and must not be described as one.

The historical [v1.0.0 source companions](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/tag/v1.0.0)
cover Electron **44.9.1** and Chromium **152.0.7977.167**. They do not supply
matching source for the new runtime. The unchanged sharp/libvips materials in
the old Native-Sources companion may still be reused for those exact Reader
native dependencies; the old Electron-specific FFmpeg/Blink/Mozilla materials
must be refreshed. See the Reader's `SOURCE-AND-REBUILD.md` for its native scope.

The suite source checkout includes the machine-readable preparation inventory
at `maintainer/runtime-sources-1.3.0.json`, with exact source revisions, retained
provenance hashes, release profile pins, and unresolved requirements. Its
`complete_runtime_mirror` and `publication_ready` fields are deliberately false.
`maintainer/prepare-runtime-sources.py` verifies these retained inputs and can
download explicitly selected source seeds into a separate work directory.
Its publication check fails until a complete successor workflow has assembled
and validated the matching source companions. No release download link for
uncreated 1.3.0 companions is advertised here.

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

These upstream references establish provenance and support preparation. They do
not replace the complete accompanying source mirror required by this release's
distribution procedure. A source seed archive does not include separate Git
repositories selected by recursive DEPS, supplemental source/build inputs, or
all release optimization data.

## Complete matching source requirements

Before publication, preserve all selected Git source trees for the union of
separate Linux x64 and Windows x64 configurations, including Electron, Chromium,
Node.js, V8 and recursive dependencies. Preserve the ordered Electron patches,
source-bearing build packages, runtime JavaScript sources, Rust standard-library
sources and vendored dependencies, exact compiler-runtime sources, and the
matching Linux/Windows/V8 release optimization profiles. Classify excluded
platforms and separately required compilers, platform SDKs, and normal build
utilities in the manifest rather than claiming an offline SDK.

Verify archive hashes, content safety, complete assembly and patch application.
Record source URLs, immutable revisions, archive destinations and hashes,
license-selection evidence and limitations. Publish the suite application
source, updated native/runtime source companions, all numbered parts if split,
and a single release-level `SHA256SUM.txt` alongside the corresponding binaries.
Maintain these downloads for as long as the matching binaries are offered.

The previous runtime mirror contained 208 source archives and approximately
16.09 GB of unpacked source-file contents, before filesystem overhead. Its
three compressed distribution parts totalled approximately 4.46 GB. These are
capacity baselines for preparation, not measured sizes of the new mirror.

## Retained original licenses

Keep Electron's original `LICENSE` and `LICENSES.chromium.html` beside the
runtime executable. The broad Chromium notice collection does not imply every
named Android, macOS, system, test or optional component is present in the
Windows/Linux application packages.

FFmpeg's original grant permits LGPL 2.1 or later. Any permitted later-version
selection must retain the original grant and exact source/build configurations.
Do not carry the old Blink per-file selection index forward as evidence for a
new Chromium revision; regenerate and review it against the new source.

The newly retrieved Chromium 156.0.8078.49 production file
`third_party/blink/renderer/platform/wtf/text/base64.cc` still carries its
original LGPL version 2 grant without an “or later” option. That source and its
original terms must be preserved. Its retained source hash is recorded in the
preparation inventory. Mozilla-derived files retain their original multi-license
choices. No blanket LGPLv3-only claim is made for these runtime sources.

The full GNU Library GPL version 2, GNU LGPLv3 and GNU GPLv3 texts remain in
`GNU-LGPL-2.0.txt`, `GNU-LGPL-3.0.txt`, and `GNU-GPL-3.0.txt` in this directory.
The distribution retains its equivalent-source-access procedure for the LGPL
version 2 component; complete matching source/relink material is a publication
requirement, not fulfilled by this preparation inventory alone.

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
bit-for-bit reproduction is claimed by this local source preparation.
