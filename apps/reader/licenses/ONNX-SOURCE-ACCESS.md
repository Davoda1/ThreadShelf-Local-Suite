# ONNX Runtime source, provenance and runtime controls

ThreadShelf Local Reader 1.3.0 uses **ONNX Runtime 1.31.1** for all three
installed packages: `onnxruntime-node`, `onnxruntime-web` and
`onnxruntime-common`. Native and Web packages both require common 1.31.1.
The native desktop packages retain the CPU binaries for their own Linux x64
or Windows x64 target; optional CUDA downloads are not part of these packages.

[ONNX-PROVENANCE.json](ONNX-PROVENANCE.json) records the exact npm archive URLs,
registry integrity values, installed package metadata hashes, source revision,
retained notices and provenance limits. The target production inventories and
each application's `licenses/DEPENDENCIES.json` describe the installed graph.

## Source and original notices

The official [1.31.1 release](https://github.com/microsoft/onnxruntime/releases/tag/v1.31.1)
corresponds to source commit
[`6af1a932e2286d5c58166085d24c68783033edee`](https://github.com/microsoft/onnxruntime/tree/6af1a932e2286d5c58166085d24c68783033edee).
The three JavaScript packages share this named upstream release and its native
core, `js/node`, `js/web` and `js/common` source trees. A commit-pinned
[source archive](https://codeload.github.com/microsoft/onnxruntime/tar.gz/6af1a932e2286d5c58166085d24c68783033edee)
was streamed in full for the telemetry source review, with its SHA-256 and
member counts recorded. The complete archive was not retained, and this review
does not constitute a complete source companion.

The published npm metadata omits `gitHead`. The verified release tag and the
npm integrity pins are therefore recorded separately; they do not establish
a reproducible source-to-binary build. This update uses the published npm
artifacts and does not claim that the suite rebuilt ONNX Runtime.

The original Microsoft [MIT license](ONNX-Runtime-MIT.txt) and upstream
[ThirdPartyNotices](ONNX-Runtime-ThirdPartyNotices.txt) are retained verbatim.
Both texts match the 1.30.0 versions byte-for-byte, while build dependency pins
have changed. The root notice file is an upstream inventory, not a statement
that every listed dependency is enabled in every target. Keep applicable
package and dependency notices with redistributed copies.

## Transformers integration

Reader retains unchanged Transformers.js **4.3.2** source and its Apache-2.0
license. Reader's `src/core/transformers-runtime.mjs` checks that version and
loads the upstream `src/transformers.js` entry, whose ONNX imports resolve to
the external packages pinned to 1.31.1. The packager omits only the unused
Transformers `dist` directory because those prebuilt bundles embed an older
ONNX Web runtime. Upstream source, package metadata and notices remain intact.

Transformers 4.3.2's original package metadata still declares native 1.30.0
and a Web development build. Reader intentionally overrides those dependency
constraints in its own lockfile. This is a locally tested integration, not an
upstream certification of this particular version combination. The original
constraint strings do not describe the ONNX packages installed in Reader.
Compatibility and package validation must cover the source adapter, real
native inference and the Web/WASM fallback after any future update.

## Native telemetry control

The official 1.31.1 Linux x64 and Windows x64 native libraries contain 1DS
telemetry support; Windows also retains a product telemetry provider. Reader
sets both `ORT_DISABLE_TELEMETRY=1` and `ORT_RUNNING_UNIT_TESTS=1` in the main
process through `src/core/onnx-privacy.cjs`, loaded before worker creation or
native initialization. These controls suppress collection and transmission;
the upstream telemetry code remains in the published native libraries.

The upstream [1DS initialization guard](https://github.com/microsoft/onnxruntime/blob/6af1a932e2286d5c58166085d24c68783033edee/onnxruntime/core/platform/telemetry_1ds.cc)
uses `ORT_DISABLE_TELEMETRY` to suppress the uploader, event emission and
device-ID persistence before initialization. That suppression is process-wide
and irreversible. The flag alone does not prevent Windows product telemetry
provider registration. The [Windows provider constructor](https://github.com/microsoft/onnxruntime/blob/6af1a932e2286d5c58166085d24c68783033edee/onnxruntime/core/platform/windows/telemetry.cc)
uses the separate `ORT_RUNNING_UNIT_TESTS` signal to return before registration.

`ORT_RUNNING_UNIT_TESTS` is an upstream **internal** suppression mechanism,
not a general public configuration API. Reader uses it as a compatibility
measure for the exact pinned 1.31.1 native runtime. A complete scan of that
repository revision found its production uses only in the telemetry helpers
and these two suppression paths; no inference or validation bypass uses were
found. Test-only references set or exercise the flag. The source snapshot and
scan hashes are recorded in `ONNX-PROVENANCE.json`; the suite source retains
the full scan record under `maintainer/onnx-source-inputs/1.31.1/`.
Re-review the flag's semantics and rerun the privacy/inference checks before
changing ONNX versions.

A separate [Windows diagnostic logging provider](https://github.com/microsoft/onnxruntime/blob/6af1a932e2286d5c58166085d24c68783033edee/onnxruntime/core/platform/windows/logging/etw_sink.cc)
remains available to an externally enabled operating-system trace session.
Reader does not enable that tracing or configure a diagnostic uploader.
This local tracing facility is distinct from the disabled product telemetry
provider and 1DS uploads; no claim is made that operating-system diagnostic
code has been removed.

Setting only a worker's JavaScript `process.env` is insufficient: default
Node workers receive a copied environment, while the native runtime reads
the operating-system environment. Reader therefore sets both flags on the
main thread before creating workers. Retain that order when adapting the
source. This provenance does not claim native Windows execution or a universal
absence of network activity; optional model downloads and user-selected
server connections remain separate application features.

## Rebuild and companion scope

Use the pinned upstream source, its build instructions, `.gitmodules` and
`cmake/deps.txt` to reconstruct the required target configuration. A GitHub
source archive alone excludes separate submodule contents and CMake-fetched
dependency archives. Compiler/SDK prerequisites and build flags also need to
be preserved or recorded. No full native rebuild or binary equivalence check
has been completed by this source preparation.

The suite source includes an ONNX preparation inventory at
`maintainer/onnx-sources-1.3.0.json`; it records submodule revisions and changed
build-input pins without claiming a complete mirror. The historical 1.0.0
source companions do not establish ONNX 1.31.1 coverage. Matching source
companion preparation and the separate Electron runtime source gate remain
incomplete. No unpublished companion asset is advertised here.
