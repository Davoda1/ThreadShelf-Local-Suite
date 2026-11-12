# Electron 45.3.0 source update

This supplement updates the original Electron **45.1.0** source collection to
**45.3.0**, Chromium **156.0.8078.96**, and embedded Node.js **24.22.2**.
It is supplied as `ThreadShelf-Local-Suite-1.4.6-Runtime-Source-Update.tar.gz`.
It requires all six original **1.3.0 Runtime-Sources ZIP parts** and their
metadata ZIP. The historical collection alone is not matching source for the
new runtime. The unchanged ONNX and sharp/libvips companions remain separate.

The supplement supplies full current Electron and embedded Node source
archives, exact replacement bytes and original/current SHA-256 values for
changed files in eleven other checkouts, the three exact release optimization
profiles (including the fixed V8 builtins profile filename used by GN), the original upstream diff records, the recursive DEPS comparison,
and offline application/verification tools. Original copyright and license
notices are retained in their source files. External compilers, SDKs and system
build utilities remain prerequisites of the upstream build instructions.

## Assemble offline

Keep all six 1.3.0 source ZIP parts together and extract only their metadata ZIP.
First use its assembler **without `--apply-patches`**:

```sh
python source-publication/assemble-runtime-sources.py --manifest source-publication/final-runtime/SOURCE-MANIFEST.json --parts-dir /path/to/parts --destination /path/to/new-source-tree
```

Extract this supplement into another directory. From there:

```sh
python runtime-source-update/update-runtime-sources.py --destination /path/to/new-source-tree --apply-patches
```

The updater requires the completed original-tree assembly report, verifies
all source-update inputs and original changed-file hashes, installs the exact
new sources and profiles, and checks/applies Electron's current ordered patch
recipe using Git. It executes no upstream hooks or source/build programs.
Use a fresh source tree; do not update a patched, locally modified or previously
updated tree. Preserve both source collections and their checksum manifests.

Without `--apply-patches`, the result contains updated original sources only.
The upstream Electron build workflow can then apply the retained patch recipe.
Follow `src/electron/docs/development/build-instructions-gn.md` for platform
prerequisites and compilation. Do not substitute unrelated current sources.

## Reproduce the supplement

From a tagged suite source checkout:

```sh
python maintainer/runtime-source-update/build-source-update.py --out /path/to/output --version 1.4.6
```

The builder verifies the committed source payloads, downloads only immutable
revision source archives and hash-pinned optimization profiles, and requires
its deterministic output to match `asset-integrity.json`. `--cache-dir` may
reuse already verified inputs. The output uses fixed archive timestamps and
preserves original source archives as ordinary files inside the supplement.

Verification covers recursive dependency changes, exact original/current
source bytes, archive integrity and ordered patch applicability. It does not
claim a complete native rebuild, bit-identical Electron binary reproduction,
or a legal-compliance certification. The historical source verification
records retain their original version and scope.
