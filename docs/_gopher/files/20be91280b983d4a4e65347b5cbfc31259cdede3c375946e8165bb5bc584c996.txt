# Alternative: pins, saved searches and recent work

## Pin a conversation

Open a thread and select **Pin conversation** in the reading toolbar. The active icon indicates a pinned thread. Select it again to unpin. Open **Pins** on the navigation rail to revisit the saved references for the current server.

A pin is not a server-side bookmark and does not change Reader bookmarks. It retains enough identity and display information to find the thread again. If the server is unavailable or the source conversation has been removed, the pin cannot recreate the conversation content.

The application supports up to **500 pins**. At the limit, unpin an item before adding another. Limits apply to stored state across scopes, even though the current view shows entries only for the selected server.

## Save a search

Run a nonempty query, then choose **+** beside the search-mode controls. Open **Saved searches** from the bookmark icon above the shelf. Select a saved entry to apply the stored server-scoped collection, query, mode and role/options; use the delete control beside an entry to remove it.

Identical stored searches are not repeatedly added. Up to **100 saved searches** are retained. Removing one saved search does not delete conversations or alter the server index. Saving a query is not saving a snapshot of the current results.

## Recent conversations and reading positions

**Recent** lists recently opened conversations for the active server scope, with up to **100** stored recent entries. Reading positions are retained for up to **1,000** conversation identities; the oldest positions can be dropped when that limit is exceeded.

Opening the same thread after a server-address change may use a different scope. For example, two URLs that reach the same server are not necessarily the same saved-state identity. Use a consistent final address when you want one set of pins and reading positions.

## Demo scope is separate

The built-in demo has a separate scope. Demo pins and saved searches do not become entries for your real server. The standalone HTML demonstration also stores preferences under a dedicated browser storage key, independent of the desktop application profile.

## Preserve your state

Close Alternative completely, then copy the full Alternative application-data directory if you want to back up pins, saved searches, recent metadata, reading positions and preferences. Retain server backups separately: a copy of Alternative’s state does not contain the full conversation archive.

Continue with [settings and local data](05-Settings-and-Data.md).
