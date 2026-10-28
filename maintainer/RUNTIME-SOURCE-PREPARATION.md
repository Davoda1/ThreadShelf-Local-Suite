# Source collections and publication verification for Suite 1.3.0

The source collections match Electron **45.1.0**, Chromium
**156.0.8078.49**, embedded Node.js **24.22.1**, and ONNX Runtime
**1.31.1**. The ordinary application packagers use the official pinned
binaries. Source verification does not claim a complete native rebuild,
byte-identical binary reproduction or a bundled compiler/SDK environment.

## Downloads and offline assembly

The [1.3.0 release](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/tag/v1.3.0)
provides six `ThreadShelf-Local-Suite-1.3.0-Runtime-Sources-NN.zip` parts,
two `ThreadShelf-Local-Suite-1.3.0-ONNX-Sources-NN.zip` parts, and the
corresponding `Runtime-Sources-Metadata.zip` and `ONNX-Sources-Metadata.zip`.
The exact numbered names and hashes are in the final manifests and release
`SHA256SUM.txt`. Download every part needed for the chosen collection.

Keep the original ZIPs in one source-assets directory. Extract **only the two
metadata ZIPs into that same directory**; they use separate paths within
`source-publication/`. Numbered source ZIPs contain repeated part-manifest
names and should remain intact. From the source-assets directory:

```sh
python source-publication/assemble-runtime-sources.py --manifest source-publication/final-runtime/SOURCE-MANIFEST.json --parts-dir .
python source-publication/onnx/assemble-onnx-sources.py --manifest source-publication/onnx/ONNX-COLLECTION-MANIFEST.json --parts-dir .
```

These commands verify the downloaded collection bytes offline. Python 3.10+
is required. Add `--destination /path/to/new-runtime-tree --apply-patches`
to the runtime command to extract and apply Electron's ordered patches; this
also needs Git and symlink support. Add `--destination /path/to/new-onnx-tree`
to the ONNX command to extract its original sources. Its upstream recipes
apply the selected target's patches during the build. Neither helper downloads
files, installs toolchains or executes upstream build hooks.

## Exact coverage

The runtime collection contains 179 selected Git source trees, six
supplemental archives and one exact release-profile archive: 186 archives.
The recursive Linux/Windows DEPS union, 82 enabled non-Git classification
rows and 197 nested conditions are retained with the pinned upstream parser
cross-check. Source-bearing supplemental inputs and the three original
optimization profiles are mapped explicitly. Full logical inventories record
file hashes, modes, archive ownership, collisions and resolved symlinks.
All 257 ordered Electron patches are checked and applied to verified original
inputs; newly added files have explicit prior-absence evidence.

The ONNX collection contains 96 source archives and a complete indexed
source layout, with active CMake/vcpkg, Dawn and Emscripten mappings. It binds
33 active ports, 28 version constraints and 60 actual ordered patch
applications. The canonical final manifests supersede explicitly historical
incomplete checkpoints retained inside earlier immutable parts.

The original v1.0.0 Native-Sources asset is reused only for unchanged
sharp/libvips material. Current lock pins, 103 component-version comparisons,
27 npm package inputs, historical full-archive hashing and original
provenance limitations are retained. Current FFmpeg/Blink/Mozilla inputs are
bound to the new runtime. Original-header classifications are retained,
hash-bound review evidence; the publication verifier checks those identities
and patch effects, rather than independently making a new legal
classification of every source file. Original version-2-only and Mozilla
license alternatives remain preserved.

## Retained evidence and final publication gate

From the suite source checkout, validate the tracked input bundle and extracted
companion metadata:

```sh
python maintainer/verify-release-sources.py --bundle maintainer/PUBLICATION-SOURCE-INPUTS.json --metadata-dir /path/to/source-assets --parts-dir /path/to/source-assets --output /path/to/collection-report.json
```

This recomputes exact coverage, proof/input bindings and complete logical
indexes. Present source parts are fully rehashed; absent local parts require
the retained prior full outer/inner verification records. The report explicitly
distinguishes those modes. It is not a fresh remote download audit. Use the
offline assemblers above to verify every downloaded source archive directly.
Collection-only success always reports `publication_ready: false`.

Final publication additionally requires `--asset-ledger`, `--remote-snapshot`,
`--historical-snapshot`, `--release-id`, `--tag` and `--commit`. The external
post-tag ledger binds every release asset and the exact tracked bundle hash;
it is deliberately outside the tagged source to avoid self-referential hashes.
Fresh complete GitHub API snapshots reconcile asset identities, names, states,
sizes and digests, including the linked historical Native-Sources asset.
The verifier performs no authenticated requests or GitHub writes itself.

`prepare-runtime-sources.py` remains a provenance/seed-download utility. Its
`--publication-check` option delegates to the full verifier and requires the
same explicit final evidence. Downloading top-level seeds alone cannot pass.
Application tests, all native package jobs, final privacy/artifact review and
the release-wide checksum remain separate publication requirements.
