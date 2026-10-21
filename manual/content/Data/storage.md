# Storage, compression and maintenance

## What the storage figures mean

Reader stores a compact catalog and independently compressed content blocks. Listing titles loads catalog metadata; opening a conversation decodes the requested content. This avoids expanding every conversation simply to list the archive. The selected conversation is still materialized for rendering, so unusually large individual threads can use significant RAM.

| Figure | Meaning |
| --- | --- |
| Active compressed data | Referenced snapshots/objects and active recovery records |
| Total stored data | Persistent storage including superseded or preserved copies |
| Temporary workspace | Private operation/catalog working files on the OS temporary volume |
| Expanded catalog | The working metadata database used while Local storage is mounted |
| Content cache in RAM | Retained decoded blocks, not total app memory |
| Pending cleanup | Eligible obsolete internal storage that has not yet been reclaimed |
| Semantic index size | Stored derived semantic metadata and vector objects |

Do not add these numbers indiscriminately: some describe current physical storage, others RAM or working-space categories. A collection does not have an exact standalone disk footprint because collections share a catalog and can share immutable content blocks.

## Two compression profiles

| Profile | Codec | Intended tradeoff |
| --- | --- | --- |
| High compression | 7z / LZMA2 | Default; prioritizes compressed storage |
| Faster compression | ZIP level 6 / DEFLATE | Trades compression ratio for faster writes |

Both retain the same conversation data and Reader features. Reader bundles the required 7-Zip engine; a separate installed archiver or PATH adjustment is unnecessary for Reader’s internal storage. The profile selection does not apply to your external original exports or Ollama installation.

## Apply a compression change

1. Open **Settings → Database Manager → Storage & backup**.
2. Read the **Active format** status.
3. Select the other compression profile.
4. Review the additional working-space estimate.
5. Press **Apply compression change**.
6. Watch progress and allow the operation to finish.
7. Confirm that Active format now identifies the intended committed profile.

Selecting an option alone does not start recompression. The ordinary **Save settings** button is not the activation command. The old generation remains authoritative while the replacement is constructed and checked. Conversion needs room for old and new data together on the relevant persistent and temporary volumes.

Before publication, Stop can cancel safely and retain the old active generation. When activation begins, Stop becomes unavailable. After a new generation is published, cleanup failure does not mean it rolls back. The app can report **conversion complete; cleanup pending**: the new format is active, but obsolete internal files still need reclamation.

There is no fixed promised compression ratio or duration. Text, retained raw structures, images/attachments and already compressed material behave differently. Compare verified actual storage after completion instead of assuming a percentage saving.

## Maintenance controls

| Control | Effect | Retains |
| --- | --- | --- |
| Verify integrity | Checks managed Local storage/database and reports results | The existing dataset |
| Consolidate storage | Publishes a fresh verified generation and folds recovery records into it | Logical conversations and reading identities |
| Reclaim recovery space | Removes eligible internal superseded/recovery data after confirmation | External backups, original exports and separate unsupported legacy storage |
| Clear disposable cache | Releases the decoded-content cache in RAM | On-disk search indexes, archive objects, conversations, bookmarks and downloaded models |
| Build / update index | Prepares derived semantic search data | Authoritative archive |
| Clear semantic index | Removes the derived semantic index | Text search, conversation content and downloaded models |
| Rebuild activity | Regenerates derived activity metadata | Source conversations and their reading state |

Read the actual confirmation scope. A cleanup action is not the same as Delete all Local data, and a cache operation cannot repair missing original provider metadata.

## Why storage can temporarily grow

Imports, backup, conversion and consolidation can require staging and simultaneous old/new generations. Crash recovery records and preserved damaged storage also consume space until eligible cleanup. A successful conversion with pending cleanup can therefore show the new format before the final smaller disk footprint is reached.

Free-space checks reduce predictable failures, but another process can consume space after the check. A runtime disk-full or permission error must still be addressed. When an operation fails, keep the exact diagnostic and use the available retry/maintenance path rather than deleting unknown internal files by name.

## Temporary working files

Reader uses a private randomly named directory beneath `%TEMP%`, `$TMPDIR` or `/tmp` for expanded SQLite catalogs and operation staging. Normal close drains accepted work, closes handles and removes that directory. Recovery cleanup identifies abandoned directories created by Reader and avoids unknown directories or live owners.

The compressed permanent profile is authoritative. Copying a random temporary `archive.sqlite` file is not a full backup; it lacks the independent compressed content objects and may omit uncheckpointed or associated state. Use the managed backup action or a closed complete profile copy.

## Performance expectations

The default decoded-content cache is bounded, but the limit does not bound the whole Electron process. Model inference, the open conversation, catalog, decoding buffers and sorting can allocate additional memory. Broad cold searches and first Activity/index builds can visit many content blocks. Lazy storage improves resident working space; it does not promise instant analysis of an arbitrarily large archive.

Independent content blocks are the lazy access boundary. Reader does not randomly seek arbitrary uncompressed bytes inside one gigantic solid 7z file. Changing compression can affect work time, but it does not transform a huge conversation into incremental desktop rendering.

## When maintenance needs exclusive access

Local writes and searches are coordinated around conversion and database changes. The service cancels/drains affected Local search work before changing resources. Independent Server operations and settings retain their separate lifecycle. A second writer process is blocked by the archive's ownership/lease mechanism.

Close other Reader instances before troubleshooting a writer conflict. If a stale or corrupt gate remains after an interrupted run, preserve the profile and diagnose ownership conservatively; this manual does not recommend blind deletion of writer files.

Related: [Backup and upgrades](backup.md), [Troubleshooting](../Reference/troubleshooting.md).
