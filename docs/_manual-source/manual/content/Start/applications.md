# Applications and data sources

## Applications and workspaces

| Interface | What it reads | Main purpose |
| --- | --- | --- |
| Reader: Local / Reader | Reader's own imported Local archive | Organize, search, read, bookmark and export retained conversations |
| Reader: Local / Activity | Metadata derived from that Local archive | Calendar and timeline activity, message/model distributions and conversation drilldown |
| Reader: Server / Reader | A configured live ThreadShelf server | Read and search server conversations without first importing them |
| Reader: Server / Insights | The server's summary API | Inspect server-supplied aggregates such as indexed passages and longest conversations |
| Local Alternative | A selected live ThreadShelf server | Focused browsing, content search, pins and reading with separate local preferences |
| Separate Local Analytics | An owned capture of a supported source | Detailed archive exploration, distributions, comparison and analysis in a separate application |

The distinction matters whenever counts differ. A server may report indexed passages, while Local Activity counts retained message objects or turns. The Analytics application maintains independent filters, calculations and a data snapshot. Equal-looking chart titles do not guarantee equal populations or units.

## Local and Server in Reader

Choose **Local** when you want the archive stored by Reader on this computer. It remains available after the server stops or the network is disconnected. Choose **ThreadShelf Server** when you want the selected server's current data. Reader does not silently switch to Local copies when that server is unavailable.

The source switch changes the active source. It does not migrate, merge or delete your conversations. The collection selector, saved reading and search options belong to the active source. A Local conversation and the original server conversation retain independent reading positions, even if their text is identical.

Each server address has a separate saved-reading scope. If you change the address and your recent list looks different, first check the source shown by **Saved reading**. Clearing bookmarks for one source is not a command to clear bookmarks everywhere.

## Collections and conversations

A collection is a named grouping of Local conversations. It is not a separate executable, profile or copy of the entire application database. A conversation is the retained thread with messages and associated source information. The same title can occur in several different conversations, providers or collections; a matching title alone does not establish a duplicate.

The ordinary Reader collection selector shows nonempty collections. Database Manager also shows empty collections so they can be used as destinations. If a collection exists in the manager but not in the reading selector, check whether it contains any conversations before treating it as missing.

## What Reader preserves and what it cannot supply

Reader imports supported provider records, retains their original source records where available, and normalizes messages for consistent reading. It can preserve reasoning content, dates, model identifiers, attachments' metadata and rich exported content only when those items exist in the input format.

A missing photograph, missing attachment, absent citation URL, removed conversation branch or unavailable dynamic widget cannot be recreated merely because a corresponding title or description is present. The renderer keeps safe text or a clearly visible fallback. This is different from an import error: an export can be valid while incomplete as a record of what the original web application displayed.

## Keep the applications' storage separate

Reader's portable release still uses the standard per-user application data directory. Analytics has a separate application identity and separate settings/capture storage. Alternative uses another independent profile for server-scoped pins, saved searches, recent items and reading preferences. Moving an executable folder does not move any of these profiles. Installing a newer executable is not the same as importing a dataset.

For Reader, use **Settings → Application data → Open data folder** to locate the exact active profile. For Analytics, use the corresponding data controls described in the [Analytics manual](../Analytics/07-Settings-and-Storage.md). Never point an unrelated program at Reader's internal temporary SQLite files as if they were a complete permanent archive.

## Which workflow should you choose?

- For a fresh provider export, import into Reader, check the import report, then read a few representative threads.
- For a focused server reading workspace, use [Alternative](../Alternative/index.md). It reads live server content and keeps navigation preferences locally.
- For a live server in Reader, connect Reader in Server mode. Copy collections to Local only when you want independent offline content.
- For a quick question about daily use, use Reader's Local Activity.
- For deeper exploration and comparisons, load or capture the supported source in Local Analytics.
- For a reliable restore point, create a Reader Local backup. A chart export or one-conversation JSON export is not a complete database backup.

Related: [Installation](installation.md), [Importing](../Reader/importing.md), [Backup](../Data/backup.md), [Local Analytics](../Analytics/index.md).
