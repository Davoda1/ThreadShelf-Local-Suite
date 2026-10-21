# Reader interface and navigation

## The fixed frame

Reader divides the window into an application header, a conversation list, a reading pane and a status bar. In Activity or Insights, the analytical workspace replaces the list and reading pane. The header and status bar remain available. Controls can become compact at the minimum window size, but the app does not turn into one long scrolling page.

| Region or control | Use |
| --- | --- |
| Local / ThreadShelf Server | Choose the data source |
| Reader / Activity or Reader / Insights | Switch the workspace within that source |
| Import | Read supported files or a folder into Local storage |
| Copy from server | Select live server collections to copy into Local |
| Saved reading | Open recent locations or bookmarks for the active source |
| Settings | Configure appearance, reading, sources, search, Local database and data/privacy |
| About | Inspect the application version and runtime information |
| Collection selector | Restrict the current list/search to a nonempty collection |
| Refresh | Reload the current source/list; server refresh requests current data |
| Search row | Expand or collapse archive-search controls |
| Sort selector | Recently updated, Title or Most messages when ordinary list sorting applies |
| Conversation rows | Open the selected conversation or matching passage |
| List footer | Page navigation or Load more, depending on your Reading preference |
| Status bar | Current source/connection and operation or search status |

## Choose a collection before searching

The collection selector sits above the search drawer. **All collections** searches or lists the available scope across collections. A named collection makes the task easier to audit and often reduces the amount of search work. Empty collections remain in Database Manager but are intentionally absent from this list.

Conversation rows identify the title, provider or collection, message count when supplied, and an available update/message date. These are metadata from the retained source, not proof that every original provider message or branch is present.

Use **Recently updated** for a recency-oriented list, **Title** for alphabetical navigation, or **Most messages** to locate long conversations. Ranked passage search uses relevance or server order, so the ordinary sort selector is disabled while that result mode is active.

## Expand and collapse the search drawer

Click **Search** to open the controls, or press **Ctrl+K**. Type a query, choose the method through the method/options control, and run **Search**. Collapsing the drawer preserves the active query and count; it does not clear the filter. Use the clear button when you want the full collection list again.

Search options have **Save without searching** and **Search** actions. Saving stores the draft for the active Local or Server source without immediately running it. Opening Search & models from the options dialog and returning preserves that options draft. This prevents a model setup visit from silently discarding your intended filters.

## Conversation header

When a conversation is open, the header shows the title, source/provider details and available message count. The source-file or collection metadata helps distinguish identically titled conversations. The header controls are:

- **Resume**: restore the saved position for this conversation, if one exists.
- **Read from start**: navigate to the beginning and update reading progress from there.
- **Bookmarks**: open saved bookmarks in the active source.
- **Find in conversation**: find text in the current open conversation, rather than searching the entire archive.
- **Export**: save the open thread as Markdown or JSON.
- **Close conversation** at the upper right: return to the welcome page while retaining saved reading.

In **Professional** and **Platinum Plus**, the conversation header overlays the scrolling conversation area. Navigation, search and bookmark anchors account for that header. Platinum Plus's header is fully opaque and unblurred in this release; Professional's header remains translucent with blur.

## Lists: pages or continuous scrolling

Open **Settings → Reading**. Choose **Pages** when you want a fixed page and explicit Previous/Next controls. Choose **Continuous scrolling** when you prefer an accumulating list; the footer also offers **Load more**. The available page sizes are 20, 25, 50, 100 and 200, with 50 as the default.

The page size is the list batch size, not a limit on the number of turns in a conversation. Local ranked search uses a top-1,000 result window. Server search follows separate continuation rules. A `+` by a server count means the scan has not yet established the final total.

## Progress and interruption

Imports, model operations, indexing and maintenance display a progress area with the phase and available counts. **Stop operation** requests a safe cancellation; the label can change to stopping while current accepted work drains. An indeterminate bar means the operation does not yet know a meaningful total.

Only one managed operation can run at a time. Waiting for an operation to finish is different from the interface being frozen: review the operation’s phase and count, and use the provided stop control if needed. Do not assume that cancellation reverses conversations already imported or a compression conversion already activated.

## Dialog navigation

Settings and confirmations stay inside the application window. **Tab** and **Shift+Tab** remain within the active modal. **Escape** closes the current modal or returns from a nested Settings subpage; a manager confirmation closes before the Settings window underneath it. Returning from a subpage preserves the parent Settings draft.

Appearance changes are previewed. **Save settings** commits those preferences. **Cancel** restores the saved appearance. Independent operational buttons such as Create backup, Move selected or Apply compression change do not wait for Save settings and are not undone by Cancel.

Related: [Reading](reading.md), [Search](search.md), [Settings and appearance](appearance.md).

