# Runtime source preparation for Suite 1.3.0

The candidate targets Electron **45.1.0**, Chromium **156.0.8078.49**, and
embedded Node.js **24.22.1**. `runtime-sources-1.3.0.json` records the exact
source revisions, 11 retained upstream provenance inputs, and release profile
names/checksums. Original Electron and Chromium licenses accompany those inputs.

**This inventory is incomplete. The complete matching runtime/native source
companions must be prepared and validated before publishing the new binaries.**
The previous v1.0.0 runtime mirror covers Electron 44.9.1 and cannot be relabeled
as source for the new runtime. Its unchanged sharp/libvips material may be reused
only within that original, explicitly documented scope.

## Commands

Verify the retained provenance documents without network access:

```sh
python maintainer/prepare-runtime-sources.py
```

Download and inspect a pinned source seed into a separate directory:

```sh
python maintainer/prepare-runtime-sources.py --download --component electron --output ../runtime-source-seeds
```

The component ids are `electron`, `chromium`, `node`, and `ffmpeg`. Repeat
`--component` to select multiple sources, or omit it to fetch all four. The
default limits preserve 4 GiB of free space and cap each archive at 2 GiB.
Completed downloads can be reused only if their source URL and local checksum
match their recorded metadata. The downloader does not extract archives, execute
source, evaluate DEPS, install tools, or run upstream hooks.

The publication gate deliberately exits with status 1 while the complete mirror
is pending:

```sh
python maintainer/prepare-runtime-sources.py --publication-check
```

Obtaining every seed does **not** satisfy this gate. A complete source workflow
must resolve recursive DEPS for both target platforms, obtain supplemental
source/build inputs and release profiles, refresh the scoped native material
and license-selection evidence, verify assembly and patch application, and
produce the complete source companions. Replace this preparation gate with
evidence-backed validation only after those tasks are complete. The outstanding
requirements are enumerated in the JSON inventory.

## Verified preparation evidence

- Retained provenance input sizes and SHA-256 values verified locally.
- The exact Electron source archive was retrieved and inspected: 20,278,793
  compressed bytes, 3,779 archive members, 37,152,835 regular-file bytes.
- Its SHA-256 is
  `023fec7887359eeff6981ba34485b7849e0bb258f2e4f7e97474023cd6f8e54d`.
- The path validator rejected parent traversal, absolute paths and symlink
  escape; provenance verification rejected a checksum mismatch.
- The publication gate remained false after successful seed preparation.

The complete runtime was not rebuilt, and binary reproducibility was not
claimed. A local source archive seed is not advertised as a published release
asset. Its eventual release packaging must be covered by the single
release-level `SHA256SUM.txt`.

## Capacity baseline

The old runtime companion's three compressed parts total 4,463,083,956 bytes.
Its 208 inner source archives total 4,351,995,726 compressed bytes and
16,093,659,352 unpacked regular-file bytes, before filesystem overhead. Release
profiles add 585,758,200 bytes. The old Native-Sources archive is 625,292,648
bytes. These measurements establish preparation capacity needs; they do not
measure the new mirror.

The local environment had approximately 13 GiB free before parallel app
builds, insufficient for full source extraction plus retained archives and
assembly/patch verification. Retaining compressed seeds alone does not resolve
that verification requirement. No old source archives or source availability
requirements were removed to make the new candidate appear ready.

Final capacity reassessment after package testing: about 3.33 GiB was free. The
historical runtime and native distribution archives alone total 5,088,376,604
bytes; the matching new distribution size is not yet known. Streaming can avoid
a full source extraction, but does not remove the storage needed to retain the
complete distribution. A separate preparation workspace is required with the
current retained artifacts. Budgeting 10–12 GiB free for a carefully streamed
workflow or 25–30 GiB for retained archives plus full extraction is a planning
estimate, not a proven size bound.

Small endpoint checks succeeded for the new Chromium, Node, FFmpeg and three
release profile inputs. The profiles report 623,047,173 bytes in total. Endpoint
availability is not downloaded-content verification; recursive dependencies
still need resolving. The downloaded Electron seed preserves 257 ordered patch
entries across 15 lists, but those patches have not yet been applied to matching
upstream sources. Additional storage alone does not complete the source work.
