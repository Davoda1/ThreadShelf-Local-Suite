# Backup, restore, relocation and upgrades

## Choose the right kind of copy

| Copy | What it is for | What it does not replace |
| --- | --- | --- |
| Original provider export | Preserve the provider-supplied source, including content Reader may not use | Reader bookmarks/settings backup |
| Reader Local backup | Consistent versioned Local archive plus Local reading/bookmark data | Entire application profile or Ollama installation |
| Closed full profile copy | Preserve Reader's persistent profile, including settings and cached model files | Separate original exports or external backup files elsewhere |
| Conversation Markdown/JSON export | Share or reuse one retained conversation | Whole-archive recovery |
| Analytics capture/report | Analyze or publish a chosen captured dataset | Reader's operational backup/restore contract |

A good archive routine keeps original exports and at least one validated Local backup outside the active profile. Putting a backup inside a directory you later delete with the profile defeats the purpose of the backup.

## Create a Local backup

1. Open **Settings → Database Manager → Storage & backup**.
2. Choose **Create backup**.
3. Select an external destination and a recognizable filename in the native save dialog.
4. Let the operation complete. Watch for errors or cancellation rather than assuming a chosen filename means the file is complete.
5. Retain the resulting backup independently of the program folder.

The default manager backup contains the Local archive/catalog and Local bookmarks/reading positions. It excludes downloaded models and rebuildable indexes. The internal backup format supports additional index information, but the ordinary manager action does not expose this as a required backup component.

The version-2 backup is a ZIP64 container with a manifest and verified referenced compressed objects. Existing compressed objects are stored without recompressing them into another archival generation. Backup creation checks the archive members and preserves an existing destination if cancellation occurs before replacement.

You can create this managed backup during use because the application coordinates changes to the data state. A manual copy of the full profile should be made only after Reader has closed.

## Restore a Local backup

Restore **replaces** the current Local dataset; it is not an append/import operation.

1. If the current Local archive is useful, create a fresh backup before replacing it.
2. Open the manager's **Restore backup** control.
3. Choose the backup through the file picker.
4. Wait for validation and inspect the preview counts.
5. Read the in-window confirmation and confirm only the intended replacement.
6. Let restoration finish.
7. Check several conversations, collections, bookmarks and reading positions.
8. Rebuild optional indexes/Activity metadata when requested.

Validation checks the format version, entry names, sizes, checksums, SQLite integrity and every referenced compressed object. A backup filename or extension alone is not proof of validity. Server saved-reading data is separately scoped and retained by Local restore.

## Recovery when the archive cannot open

Reader shows **Local archive unavailable** with the actual diagnostic, rather than displaying an unreadable archive as an empty database. Settings and Server mode remain available. Database Manager exposes **Try again** and **Restore backup**.

If you restore in this restricted recovery state, the damaged version-2 storage is preserved separately under the profile's `recovery-preserved` directory before the validated replacement is installed. Keep that preserved material until you have reviewed the restored archive. Explicit recovery-space reclamation can later remove eligible internal preserved copies; external backups remain separate.

Do not manually edit `current.json`, delete random object archives or remove lock/gate files merely because a folder looks old. Those files establish which generation and operations are authoritative. For an unexplained failure, preserve the closed profile and the diagnostic before attempting a repair.

## Copy the whole Reader profile

1. Use **Settings → Application data → Open data folder** to identify the active directory.
2. Close Reader normally and wait for the Reader process to exit.
3. Copy the complete profile directory to your backup location.
4. Preserve filenames and subdirectories; do not select only one SQLite-looking file.
5. Keep the source profile until you have verified any restored copy.

The persistent profile includes settings, appearance sidecars, reading state, compressed storage, downloaded built-in model files, derived caches and application session/log data. Working SQLite files in an OS temporary directory are disposable working copies, not the complete permanent archive. They are normally removed on close.

Portable program folders do not contain the normal profile. Moving just the extracted executable directory to another computer moves the program, not your conversations. For a data-only transfer, use the managed Local backup/restore process; for a full preference/profile transfer, copy the closed profile deliberately and verify the active destination path.

## Updating or moving this public release

The public release is **1.0.0**. Application version and archive schema are separate. Reader uses `threadshelf-local-storage-v2`, archive format 2, catalog schema 3 and `reading-v2.json`; those numbers do not require editing when the application version changes.

1. Create a managed Local backup and close Reader.
2. Preserve the complete existing profile as an additional backup when moving machines or testing a future release.
3. Extract the complete new portable program folder, or install the matching DEB.
4. Launch one Reader instance and confirm the active data folder.
5. Verify collections, bookmarks, reading positions and appearance before removing the old program folder.

Appearance, wave-background and prompt-button preferences belong to the application profile. Replacing program files does not move that profile. Future releases may introduce explicit migration instructions; follow the documentation packaged with the target release. Do not run two different versions against the same profile simultaneously.

An unsupported archive or backup schema needs matching software or a supported export/import route. Do not alter format markers to force it open. Keep the original exports and the untouched old profile until you have verified a transfer.

## Uninstalling and cleanup

Replacing or removing program files does not automatically delete the user profile. Conversely, clearing Local data in Database Manager is an explicit data operation even though the executable remains installed. Downloaded models, original exports, external backups and Analytics captures have distinct lifecycles. Decide which object you intend to remove before using a cleanup control.

Related: [Storage](storage.md), [Database Manager](collections.md), [Troubleshooting](../Reference/troubleshooting.md).

