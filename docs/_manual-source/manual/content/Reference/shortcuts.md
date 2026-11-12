# Keyboard and control reference

## Reader shortcuts

| Key or action | Result |
| --- | --- |
| Ctrl+K | Return to Reader workspace, open archive Search and focus/select the query |
| Ctrl+F | Return to Reader and open Find in conversation when a conversation is open |
| Ctrl+O | Open the import dialog |
| Ctrl+, | Open Settings |
| Enter in archive Search | Run the search |
| Enter in conversation Find | Move to the next find result |
| Escape in Find | Close the find bar and clear the active find state |
| Escape in a modal | Close the current modal or return to the parent modal |
| Escape in a manager action dialog | Cancel that dialog before closing Settings underneath it |
| Tab / Shift+Tab in a modal | Move among enabled visible controls within that dialog |
| Escape in conversation outline | Dismiss/unpin the outline |
| Enter in manager search | Apply the manager’s filter |
| Timeline arrows, Home, End | Inspect timeline data points when the graph is focused |
| Escape on an active chart inspector | Dismiss the inspection panel |

The implementation also accepts Command equivalents on macOS source builds, but this release's distributed native packages are Windows/Linux x64. Do not infer unlisted desktop shortcuts such as a fullscreen key from the presence of saved fullscreen state.

## Search can run while typing

The archive input uses a short delay after edits: ordinary search methods refresh after typing pauses; semantic/hybrid/Ollama methods use a longer delay. The Search button or Enter provides an explicit run action. This is why the count can begin changing before you press Search. The options dialog's **Save without searching** still specifically avoids executing a new query from that action.

## Action scope reference

| Control | Scope |
| --- | --- |
| Clear search | Query/result state; no stored conversations removed |
| Clear saved positions | Saved reading for the active source; conversation content retained |
| Clear bookmarks | Bookmarks for the active source |
| Close conversation | Current reader view; saved reading retained |
| Remove bookmark | One retained bookmark |
| Delete selected in manager | Selected Local records and associated Local references |
| Clear semantic index | Derived index; model files and conversations retained |
| Clear disposable cache | Decoded-content RAM cache only; on-disk search indexes and archive objects retained |
| Restore backup | Replace current Local archive with validated backup |
| Delete all Local data | Explicit Local reset; external backups and Server data retained |
| Save settings | Commit preference draft; not an undo/commit wrapper around manager operations |

## Useful workflow recipes

### Find a recently created conversation

Select Local, the relevant collection, then Search options. Choose a wording-based method and a Conversations started period. If a known conversation is absent, retry All time to include unknown creation dates. Search matching date semantics differ from Activity's estimated starts.

### Resume a long reading session

Select the correct source/address, open Saved reading → Recent, then choose the thread. Use Resume if you navigated away from the saved position. Add a bookmark for a stable important message instead of relying only on recent order.

### Reorganize without breaking reading progress

Create a backup, use Database Manager to select records and **Move selected**. Review the destination and preview. Move preserves identity; Copy deliberately creates independent identities.

### Inspect a chart without relying on color

Focus the chart marks or plot, inspect tooltips with the supported keyboard controls, then expand the exact-value/data table. Read units and scope rather than estimating a number from bar length.

### Prepare for offline semantic search

Download the built-in model while connected, build a current Local index, then check status and a representative query. Ordinary Local text search already works without that setup.

## Other applications

Analytics has separate [keyboard and chart controls](../Analytics/08-Troubleshooting.md). Alternative provides a separate [shortcut reference](../Alternative/07-Troubleshooting.md). Do not assume a shortcut in one application changes another application's settings or data.
