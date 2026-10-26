# Local compressed storage — ThreadShelf Local Reader 1.2.0

Public Reader 1.2.0 uses internal Local storage format 2, plus a separate compressed and rebuildable Activity metadata database. Application, cache and storage schema versions are independent. See [Activity.md](Activity.md).

The version 2 format keeps a compact SQLite catalog in a private working directory and keeps conversation bodies, retained raw data, and semantic vectors in independent compressed objects. Opening a conversation decodes the requested content blocks; it does not extract the entire conversation archive. The catalog itself remains expanded while Local storage is mounted. The catalog size grows with metadata and references.

The application maintains `search/text-v1.sqlite`, a rebuildable cache of compressed text
blocks and source creation metadata, plus `extended-preferences-v1.json` for
search filters and the analytics bar option. Neither is part of the archive's
catalog schema or authoritative content. Local backups omit the disposable text
cache; it rebuilds after restore. ThreadShelf Local Analytics and older compatible
Reader releases continue to read the established archive. Close one Reader
before using the same profile in another version.

## Optional image cache

Public 1.1.0 added `remote-images-v1.json`, `resource-cache-v1.json` and the separately owned `resource-cache-v1/` image directory under the existing profile. The original settings schemas and `local-storage-v2/` archive remain unchanged. Image-cache operations never modify the conversation archive; archive clear, conversion, backup and restore leave this cache untouched. The cache may contain image bytes and conversation metadata, so manage it independently through Resources Cache. See [Images and Resources Cache](Images-and-Cache.md).

## Compression and compatibility

- **High compression (7z)** is the default: genuine 7z containers, LZMA2, 16 MiB dictionary, two compression threads, independent members.
- **Faster compression (ZIP level 6)** uses genuine ZIP containers with DEFLATE level 6.
- The application ships an upstream 7-Zip executable. Users do not install an archiver or configure PATH. Native work runs without a shell. The licenses and exact component provenance are recorded in the third-party notices.
- Durable redo records deliberately retain gzip level 3 in either profile. This avoids LZMA2 work for every small metadata operation. Content is already compressed before references to that content enter a redo record.

Version 2 uses `local-storage-v2/` inside the existing application profile. It does not migrate, overwrite, or delete a `local-storage-v1/` archive or a legacy root `archive.sqlite`. Populate the new archive from the server or supported original exports. Version 1 backups are not accepted by the version 2 restore path. Settings retain their existing location; version 2 reading data uses `reading-v2.json`.

The profile is `%AppData%\ThreadShelf Local Reader\` on Windows and `$XDG_CONFIG_HOME/ThreadShelf Local Reader/` (normally `~/.config/ThreadShelf Local Reader/`) on GNU/Linux.

Reader stores wave-background and prompt-control preferences in a separate `reader-appearance.json` under that profile. These preferences do not change the archive schema. See [Themes.md](Themes.md) for defaults and persistence details.

## Persistent layout

| Path in `local-storage-v2/` | Purpose |
| --- | --- |
| `current.json` | Checksummed authoritative generation manifest: codec, catalog descriptor, semantic catalog descriptor, journal boundary, epoch and restore-reading token. |
| `snapshots/<id>.7z` or `.zip` | Verified catalog or semantic metadata SQLite snapshot. Each native archive has one fixed `payload.bin` member. The expanded size and compressed SHA-256 are recorded in the generation manifest. |
| `objects/<logical-hash>.<encoded-hash>.7z` or `.zip` | Immutable conversation content blocks. Catalog references contain codec, exact expanded/compressed sizes and checksums. |
| `objects/vector-<hash>.7z` or `.zip` | Immutable semantic vector blocks. Their descriptors and model/revision identity reside in the semantic metadata catalog. |
| `records/<epoch>/<sequence>-<id>.json.gz` | Immutable durable operation records. |
| `records/<epoch>/head.json` | Checksummed last committed record/boundary. Detects a missing final record as well as gaps. |
| `previous.json` | Previous manifest retained until reclamation; never silently substituted for a damaged current generation. |
| `writer.json`, `writer-gate.json` | Single-writer lease and short-lived acquisition gate. |
| `initializing.json` | Explicit first-publication marker permitting retry of an interrupted empty archive initialization. |
| `cleanup-pending.json` | Persists a post-publication cleanup failure for display after restart. |

Working `archive.sqlite`, optional `vectors.sqlite`, WAL/SHM files and operation staging live under a randomly named `threadshelf-local-*` directory in the operating-system temporary location. The owner marker includes the format, profile identity, host, PID and session token. Normal close drains accepted work, closes handles and removes this directory; it does not recompress the full content archive. Cleanup ignores unknown directories, other profiles, symlinks and directories whose owner could still be alive.

Server-only startup does not mount Local storage. Semantic metadata remains compressed until needed. Model downloads are separate assets and are unaffected by compression changes or index deletion.

## Lazy content and search

Content blocks have a maximum expanded size of **16 MiB**. Large serialized content is split into bounded blocks; conversation turn groups allow partial thread access. The default content cache is **256 MiB** and evicts decoded data by byte budget. The desktop thread API still materializes the full selected conversation for rendering. Internal turn/passage iterators and search process bounded turn groups; there is no incremental desktop thread rendering endpoint in this release. The largest supported individual JSON string is constrained by JavaScript allocation/string limits; this is not an unlimited-size streaming JSON editor.

Collection membership is stored in the catalog, independent of content pack boundaries. Copies can share immutable content. Rename and move operations do not rewrite the conversation body. Reclamation derives liveness from current references, never merely from which blocks happen to be cached.

Keyword, exact and fuzzy searches scan bounded passage iterators. A broad cold search can visit all content blocks sequentially; laziness lowers resident working space rather than promising that a global scan is cheap. No permanent full plaintext FTS copy is kept. Semantic blocks expand to at most **4 MiB**, and semantic scoring streams blocks while retaining bounded candidate state. Model identity, logical revision and stale-index checks remain separate from compression format. A codec conversion does not invalidate an otherwise valid semantic index.

## Durable writes and recovery

The service serializes mutations and maintenance and checks mutation preconditions before durable acceptance. Conversation content objects are written, flushed, decoded and verified before their references are committed to the journal. The storage queue then:

1. Streams the exact operation JSON through gzip into a new staging file.
2. Flushes it through a writable regular-file handle, closes it, renames it into the committed sequence and flushes the containing directory where supported.
3. Atomically publishes the checksummed recovery head.
4. Applies the operation to working SQLite and reconciles reading references.
5. Reports success only after durable recording and application.

A failure after step 2 may still represent a committed operation. The session blocks subsequent mutations until recovery. Stable operation identities make replay idempotent. Startup verifies the current snapshot and replays committed records after the snapshot boundary. Missing sequences, a missing final acknowledged record, corrupt records or a corrupt current manifest stop recovery explicitly. Older snapshots are not silently selected.

A checkpoint uses SQLite's backup API, including committed WAL transactions. The resulting snapshot is compressed, decoded into a temporary verification file, checked with SQLite integrity checks, then published through the authoritative manifest. Journal byte/count thresholds are reconstructed across sessions; they are not reset merely by restarting the app. Superseded records remain safe until reclamation folds them into a published catalog.

## Changing compression

The service drains accepted Local work and closes catalog/index owners. Independent settings, Server operations and reading-state saves retain their own lifecycle. New Local writes are blocked while maintenance owns the archive.

Conversion copies compact working catalogs to owned staging, then reads and re-encodes each referenced content and semantic block with the selected codec. Newly written objects coexist with the old ones. Staged references are rewritten and every output is decoded and checksum-verified; catalog integrity and reference counts are also checked. Event-loop yields between blocks permit cancellation to arrive during long operations.

After a final cancellation check, publication atomically replaces `current.json` with the complete new catalogs, codec and fresh journal epoch at the same logical operation boundary. The service reopens these catalogs. Conversation IDs, source identity, collections, turn anchors and logical search revisions are unchanged. Reading positions are not restored from an older conversion snapshot.

Before publication, cancellation or failure preserves the old authoritative generation and removes operation-owned staging and new objects where possible. After publication, the generation is never automatically rolled back. An adoption interruption is recovered from the new manifest on the next mount. Stop is disabled at publication; postcommit cleanup is not a cancellable rollback.

Reclamation retires covered journals and obsolete snapshots before deleting unreferenced, positively owned immutable object files. Unknown files are preserved. Failed deletions are reported as **conversion complete; cleanup pending**, with error state persisted for the next start. Consolidate/reclaim retries the remaining work. External backups, source exports and version 1 storage are untouched.

Both compressed copies must coexist until commit. The displayed additional-space estimate uses expanded live object sizes, codec overhead, catalog/index staging and reserve space; it does not assume an optimistic compression ratio. Preflight checks persistent and temporary volumes independently. Runtime disk-full, permission and write/flush failures remain handled because free space can change after preflight.

## Backups and restore

A version 2 backup is a **ZIP64** container with a manifest, compact catalog, Local reading data and all referenced compressed content objects. Optional semantic metadata and the compressed vector objects it references can be included. Existing object archives are stored without recompressing them; catalog members use DEFLATE. Backup generation streams files, verifies all members and preserves an existing destination if cancelled before replacement.

Content object filenames include both logical and encoded hashes, so identical content encoded differently on another platform can coexist safely. Restore never overwrites a different valid representation. If a local file under the same encoded-hash name is actually damaged, confirmed restore first preserves the original version 2 profile, then atomically repairs that file. The validated replacement also repairs existing references to those exact expected bytes; the generation is still switched only after all replacement components are ready.

Restore checks the version, entry names, duplicate members, declared/actual sizes, checksums, SQLite integrity and every referenced compressed object before publication. No archive entry controls an arbitrary extraction path. Restoring publishes a new epoch so old journal records cannot replay into the restored archive. The restore-reading token lets startup finish replacing Local reading state after an interruption; Server reading state remains separate.

If current storage is damaged, restricted recovery mode allows backup preview. Confirmed installation first preserves the damaged version 2 storage under `recovery-preserved/<id>/` with a flushed ownership marker. Compaction retains these copies unless explicit recovery reclamation is requested. Only matching version 2/profile ownership markers authorize deletion. Manual external backups remain untouched.

## Accounting, limits and platform boundaries

- `activeCompressedBytes`: referenced snapshot/object bytes and active recovery records; `persistentBytes`: total stored data including superseded/preserved copies. `pendingCleanupBytes` includes obsolete snapshots/records and unreferenced owned objects. `indexCompressedBytes` includes the semantic metadata snapshot and live vector objects. Expanded catalog, temporary directory and RAM cache usage are reported separately.
- Catalog snapshot and backup members stream to disk and may exceed 4 GiB. A deliberate **64 GiB per-member/snapshot limit** bounds codec metadata validation; it is not a 4 GiB ZIP limitation or a total collection limit. ZIP64 is forced for backup archives.
- Reading/backup manifest metadata is limited to **32 MiB**; backups allow at most 1,000,000 listed members, subject to that manifest limit. Normal workloads will reach practical metadata/OS limits earlier than an unlimited archive claim.
- Individual durable operation JSON is limited to **512 MiB** UTF-8; recovery envelopes are capped at **1 GiB**. Normal version 2 upserts journal compact references rather than full conversation text.
- Regular-file fsync uses writable handles. Genuine file flush errors propagate. Directory fsync is used on GNU/Linux; unsupported Windows directory flushes are accepted as a platform limitation. Atomic same-volume replacement plus file flushing is not a guarantee against every hardware, filesystem or power-loss failure.
- A live writer lease blocks a second process. Dead leases are reclaimed under the acquisition gate. An incomplete or interrupted gate requires conservative manual recovery: close instances, preserve the profile and remove only a confirmed stale gate. Corrupt lease information is never guessed.
- Native Windows runtime execution, emulated filesystem semantics and cross-build/package checks are distinct evidence categories. See the release verification report for exactly what was executed.

## Development API and verification

`CompressedStorage` retains the lifecycle APIs `init`, `recover`, `commit`, `checkpoint`, `ensureVectors`, `status`, `verify`, `compact`, `backup`, `prepareRestore`, `installRestore`, `cleanTemporary` and `close`; `convert(profile,{signal,onProgress,reading})` adds generation conversion. `archivePath` and `vectorPath` are disposable working paths; `objectsDir` is durable. `profile` is authoritative and canonicalized to `7z` or `zip6`. `finalizeMigration` is a compatibility no-op; it never deletes older-version files.

Callers must drain operations and close SQLite owners before conversion or restore installation. Root service lifecycle gates provide this. Fault hooks cover record flush/commit/application, snapshot stages, pointer replacement, conversion publication and cleanup. Focused checks:

```sh
node --test tests/storage.test.mjs tests/storage-v2.test.mjs tests/storage-windows-flush.test.mjs tests/conversion-service.test.mjs
```

These tests include real process termination, loss of temporary working files, failed writes, conversion in both directions, semantic object conversion, backup/restore, cleanup sharing failures and cancellation. Synthetic fault injection does not substitute for native power-loss testing on every filesystem.
