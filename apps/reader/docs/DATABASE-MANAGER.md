# Local Database Manager — 1.0.0

Open **Settings → Database Manager**. It always manages this computer’s Local data, even when the reader is browsing a ThreadShelf server. Manager actions save immediately; the Settings **Cancel** button does not undo a completed manager action.

The overview shows collection and conversation totals plus compressed storage size. Expand it for active compressed data, total stored data, temporary workspace, expanded catalog, content cache in RAM, pending cleanup and recovery usage. Collections share a catalog and independently compressed content packs, so an exact per-collection physical size is not reported.

## Collections

- **New collection** creates an empty destination. Empty collections are available in the import destination suggestions and manager; the reader’s established collection chooser continues to list nonempty collections.
- Filter names, select collections and use **Merge collections** to choose an existing or new destination. The preview reports selected conversations, identical duplicates and differing variants. Choose whether emptied source collections should be removed.
- Row actions browse contents, rename the display name or delete the collection. Renaming preserves the collection’s identity and saved reading.
- A collection deletion can either remove the contents or move them into another collection before removing the source collection. Review the destination and count before confirming.

## Conversations

Choose a collection and provider, optionally enter a title/message/source-file filter and press **Search**. Filter changes clear the selection.

**Select this page** adds the visible rows to an explicit selection; selections survive paging. **Select all matching** explicitly selects every result matching the current filters. The displayed count identifies the selection’s scope. Clear the selection before making a different one.

- **Move selected** preserves identities and saved reading. Identical source/content duplicates at the destination are combined with their reading references.
- **Copy selected** creates independent identities. Copying associated bookmarks is an explicit option, disabled by default; original saved reading remains with the originals.
- **Delete selected** removes the chosen Local records and their associated Local reading references and search results. Deleting the currently open Local conversation clears the reader coherently.

Different content variants are retained. Matching titles alone are not a reason to combine conversations. A stale preview is rejected if the database changes; refresh and review the action again.

## Compression and working space

Open **Settings → Database Manager → Storage & backup**. **High compression — 7z / LZMA2** is the default; **Faster compression — ZIP level 6** trades compression ratio for faster writes. Both retain the same conversation data and reader features. The required codec is included with the application; a separate archiver is not needed.

The **Active format** label comes from the committed archive. Selecting a different option only enables **Apply compression change**. Press that button to start conversion; the normal **Save settings** button does not start a conversion. The panel reports an estimate of additional working space because old and new compressed copies coexist until the replacement is verified.

Conversion has a progress bar and can be stopped before activation. The active label remains on the old format until the new archive is published. Successful completion refreshes the displayed format. Cancellation or failure also refreshes the authoritative status; an error remains visible. Once activation starts, the Stop button becomes unavailable. If old internal files cannot yet be removed, the manager explicitly reports **cleanup pending**; **Reclaim recovery space** retries eligible cleanup.

**Clear disposable cache** releases eligible cached data without deleting conversations. The expanded catalog remains in use while Local storage is mounted. Opening a conversation expands the independent content packs as needed; a broad search may visit many packs. Cache totals describe storage work, not total Electron or model memory. Settings, bookmarks, reading positions, downloaded models and external backup files are separate from the selected compression profile.

The offline HTML preview labels these controls as a simulation. It changes only the sample session state; it never compresses data or writes an archive.

## Storage and backup

- **Verify integrity** checks the Local database/storage and displays the result.
- **Consolidate storage** produces a fresh verified generation and consolidates recovery records.
- **Reclaim recovery space** removes eligible internal recovery data and superseded generations. The confirmation explains the scope. It does not delete the separate 1.x archive or external backups.
- **Build index** rebuilds the Local semantic index. **Clear semantic index** preserves conversations, text search and downloaded models.
- **Create backup** asks where to save a versioned Local backup. It contains the archive/catalog and Local bookmarks/reading positions. Downloaded models and rebuildable indexes are excluded by the manager’s default backup action.
- **Restore backup** validates the chosen backup, shows the counts, then asks for in-window confirmation before replacing current Local data. Server saved reading remains separately scoped.
- **Delete all Local data** removes Local conversations, collections, search indexes, saved reading and internal recovery copies. Settings, downloaded models, externally saved backups and Server data are retained.

Progress and cancellation use the application’s operation bar. Atomic mutations either finish durably or fail without a partial manager selection. Imports have separate durable-batch cancellation behavior. Errors remain visible in the manager, with retry available.

## When the Local archive cannot open

The application keeps Settings and Server mode available and shows **Local archive unavailable**. Database Manager displays the actual diagnostic with **Try again** and **Restore backup**; it does not represent unreadable content as an empty database. Choose a valid external backup and confirm the replacement in the application. Recovery restoration preserves the damaged compressed storage separately under the profile’s `recovery-preserved` directory. Do not delete that preserved copy until the restored data has been reviewed; the manager’s explicit recovery-space reclamation can remove eligible preserved copies later.

## Storage format boundary

Public Reader 1.0.0 uses internal storage format 2 and the `reading-v2.json` namespace. These internal format numbers are independent of the application version. Both compression profiles can be converted to each other. Activity uses a separate rebuildable metadata cache; see [Activity.md](Activity.md).
