ThreadShelf Local Suite runtime source collection

Embedded PART-MANIFEST.json files and original part sidecars are immutable preparation-time snapshots. Their collection-incomplete status was accurate when each part was accepted. Only this final manifest, identifying every part by exact size/SHA256 and all matching assembly/coverage evidence, supersedes that collection-level preparation status. It does not alter historical bytes, promote an individual part to a complete collection, or claim a native rebuild or reproducible binary.


Download every numbered runtime source ZIP and the Runtime-Sources-Metadata.zip
companion. Extract the metadata ZIP into the directory containing the intact
numbered ZIPs. The metadata includes source-publication/assemble-runtime-sources.py
and source-publication/final-runtime/SOURCE-MANIFEST.json, with the assembly
report and compressed full inventory beside the final manifest. Each numbered
ZIP contains its own PART-MANIFEST.json; do not manually unzip those parts over
one directory. Python 3.10+ and its standard library are sufficient.

Verify all outer/inner hashes, source member paths, cross-archive layout and
expanded symlink safety without writing the full source tree:

  python source-publication/assemble-runtime-sources.py --manifest source-publication/final-runtime/SOURCE-MANIFEST.json --parts-dir .

Optionally create a new/empty source tree (allow ample disk space for every
regular file and filesystem overhead; Windows needs symlink support):

  python source-publication/assemble-runtime-sources.py --manifest source-publication/final-runtime/SOURCE-MANIFEST.json --parts-dir . --destination runtime-source

Add --apply-patches to apply Electron's exact config/.patches order after
complete extraction. Git must be installed. No downloads, upstream hooks,
build scripts or source programs run. A failed extraction leaves an explicitly
incomplete SOURCE-ASSEMBLY.json and must be removed/restarted in a fresh tree.

RUNTIME-ASSEMBLY.json binds the full accepted source graph, required release
profiles/notices, per-archive inventories, and original patch paths/absences to
the exact ordered patch result. RUNTIME-FILE-INVENTORY.jsonl.gz contains the
complete pre-patch logical source-file inventory. Its uncompressed JSONL hash
is recorded in RUNTIME-ASSEMBLY.json. This inventory is release metadata, not
a substitute for the source ZIPs. Safely dangling internal symlinks are listed.

The maintainer verified all 257 Electron patches against the exact complete
set of touched source paths. This does not mean that the full runtime source
tree was physically extracted or that Electron was rebuilt from source.
Native compilers/platform SDKs and build prerequisites remain external.
The release publication guard independently reconciles the authoritative
DEPS/source classifications and current GitHub asset hashes before publication.
