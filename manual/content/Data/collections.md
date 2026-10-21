# Database Manager: collections and conversations

## Scope and commit behavior

Open **Settings → Database Manager**. It always manages the computer's **Local** archive, including when the reading source is a live server. It does not delete or reorganize that server. Manager actions save immediately through their own controls. Closing Settings with Cancel does not undo a completed move, merge, deletion, restore or other manager action.

The overview reports collections, conversations and compressed storage. Expand it to inspect active data, total stored data, temporary workspace, expanded catalog, RAM content cache, pending cleanup and recovery usage. Collections share storage objects, so the interface does not claim an exact independent physical size for each collection.

## Create and rename collections

Use **New collection** to create an empty destination. It appears in the manager and import destination suggestions. It appears in the normal Reader selector after it contains conversations.

Use a collection row's rename action to change the collection’s display name. Renaming preserves identity and saved reading. Choose a useful organizational label; matching names and titles are not substitute identifiers for deduplication.

## Browse and select conversations

1. Open the Conversations view or a collection's browse action.
2. Choose a collection and provider, if required.
3. Enter an optional title/message/source-file filter.
4. Press **Search** to apply it.
5. Check individual rows or use the selection controls.
6. Read the selected-count label before starting an operation.

Changing filters clears the selection. **Select this page** adds the visible rows to an explicit selection, which can survive paging. **Select all matching** selects every result in the current filter scope, not merely the visible page. **Clear selection** removes the selection without deleting anything.

Do not treat a checkbox list as an implicit confirmation of all conversations in the database. The displayed count and active filters are the authoritative operation scope. The manager uses filters independent of Reader’s current search.

## Move versus copy

| Operation | Identity and saved-reading effect |
| --- | --- |
| Move selected | Preserves the conversation identity and associated saved reading |
| Copy selected | Creates independent identities; the originals remain |
| Copy associated bookmarks | Separate copy option, Off by default |
| Merge collections | Combines selected content into an existing/new destination after preview |

Move is appropriate when reorganizing one archive without creating another logical conversation. Copy is appropriate when you intentionally want independent entries. Copies can share immutable stored content internally, so duplicating an entry does not imply an immediate full physical duplication of every byte.

At a destination, identical source/content duplicates can be combined with their reading references. Differing content variants are retained; matching titles alone do not cause combination. Review the preview's selected, identical-duplicate and differing-variant counts.

## Move or copy step by step

1. Select the intended conversations.
2. Choose **Move selected** or **Copy selected**.
3. Choose an existing destination or the new-destination option and name it.
4. For a copy, decide whether associated bookmarks should be copied.
5. Review the preview and count.
6. Confirm the operation.
7. Browse the destination and check a few moved/copied records.

If the database changes between preview and execution, a stale preview is rejected. Refresh and review it again rather than attempting to confirm an obsolete count.

## Merge collections

Filter and select the source collections, then choose **Merge collections**. Pick an existing or new destination. The preview reports the scope and duplicate/variant behavior. An explicit option determines whether emptied source collections are removed. If you need a recovery point before a large merge, create a backup first.

Merging is not the same as importing a server collection again. It reorganizes the already retained Local archive and should not be used to solve missing source content or a bad provider parser result.

## Delete a collection or conversation

A collection deletion can either remove the collection’s contents or move those contents into another collection before the source collection is removed. Review the destination and count in the confirmation. Deleting selected conversations removes their Local records and associated Local reading/search references. Deleting the currently open Local conversation clears the reader coherently.

Deletion does not remove your original export files, a separate external backup, or a conversation from ThreadShelf Server. Conversely, a separate Analytics capture is an independent copy and does not automatically disappear because a Reader record was deleted.

## Delete all Local data

This operation removes Local conversations, collections, search indexes, saved reading and internal recovery copies. It retains settings, window state, downloaded models, external backup files and separately scoped Server data/reading.

Use it only when you intend to reset the whole Local archive. It is not a troubleshooting substitute for clearing a disposable cache or rebuilding Activity. If the source archive cannot open, use the recovery controls and a validated backup instead of representing damaged storage as an empty database.

## Maintenance is separate from organization

Verify integrity, consolidation, compression conversion, index maintenance and backup/restore are described in [Storage and maintenance](storage.md) and [Backup and upgrades](backup.md). Their purpose is storage management, not editing the wording of conversation messages. Reader is an archive reader and organizer; this manager is not a chat-composition editor.

