# Local Activity and Server Insights — 1.0.0

The Banner bar has two independent choices: **Local / Server** selects the data
source; **Reader / Activity** or **Reader / Insights** selects the workspace.
The analytics workspace replaces both the conversation list and reading pane.
The title, Banner and Status bars remain fixed. Analytics panes scroll internally,
including at the minimum 680 × 540 window size. Reader opens at startup.

Both Banner choices use a sliding active highlight. The animation preference
and the operating system's reduced-motion setting also apply to these controls.

Reader and analytics retain their own session state. Open a conversation from an
activity row or a server longest-conversations row to read it using the existing
reader. Return with the Banner switch to resume the analytics view and filters.

## Local Activity

Local Activity analyzes conversations already stored in the Local archive. It
requires neither a ThreadShelf server nor an embedding model. Available views
include the activity calendar mosaic, daily/weekly/monthly timelines, weekday
and hour distributions, model use, roles, and a paged conversation list.

Filters select a collection, time range, metric, branch policy, local time or UTC,
model and metadata search. Metadata search checks titles, source filenames and
providers; it does not search message bodies. A model filter selects whole
conversations containing that model, so other messages in those conversations
remain included. Select a calendar day to open the matching conversation list.
The calendar's displayed year can be changed independently of an all-time range.

**All time** is the default Date range and includes the full retained history,
including graphs across multiple years. **Custom range** focuses the Local
report on an inclusive From/To interval. Apply the two dates to update graphs,
totals, distributions, conversation results and CSV together; return to All time
to remove the range. Incomplete or reversed dates do not replace the applied
report. The chosen Local/UTC setting determines each event's calendar date.
The mosaic continues to display one selected calendar year at a time, with
dates outside the applied interval unavailable.

### Counting and coverage

| Retained source data | Counted unit | Branch support |
| --- | --- | --- |
| Original ChatGPT `mapping` | Original message objects, including empty message bodies; null nodes excluded | All messages or the active/current path |
| Normalized records, other providers, copied server threads | Stored normalized turns | Only the retained path/turns is available |

An original ChatGPT message ID is counted once per conversation. The
current path follows parent links from `current_node`; a missing current node
uses a deterministic leaf fallback and is reported. Cycles are detected and
reported. Original source records and the Reader's message content are not
rewritten by analytics.

Message activity uses each retained message's own timestamp. Conversation-start
activity uses the original conversation creation timestamp when available,
including ThreadShelf Server's `threadCreatedAt` field. For a normalized copy
that lacks a valid conversation creation date, Activity uses the earliest valid
stored-message timestamp as an estimated start. Source coverage reports how many
starts in the selected range are estimates. This is especially relevant to
server-imported conversations: the server may retain message dates while omitting
the original conversation creation date.

Original ChatGPT exports without a creation date remain undated. Normalized
conversations with neither a creation date nor any dated messages also remain
undated. Import/catalog timestamps are never used. Normalized message timestamps
may themselves have been assigned by an upstream importer; they describe the
retained copy, not a guarantee of original provider history.

Reader automatically regenerates older Activity caches. Rebuild activity is
also safe and does not alter saved conversations. These Activity estimates do not
change Local search's conversation-age filter, which still requires an explicit
source creation date (or All time).

Messages, user messages, assistant messages and conversations started are distinct
calendar/timeline metrics. Role and model distributions describe retained,
dated messages/turns within the selected range. Model usage counts assistant
messages/turns and reports unknown models separately. Weekday and hour graphs
use the chosen local-time or UTC boundary; switching it can move a message to a
different day. These are descriptive archive statistics, not token counts or
billing measurements.

Settings → Appearance offers **Styled analytics bars**, Off by default. When
On, horizontal and vertical bars in Local Activity and Server Insights use the
active theme's light/dark gradient and glow. Conversation charts retain their
existing rendering. High-contrast and forced-color modes retain readable fills.

Move the pointer across a timeline to inspect the nearest actual data point.
The hit area extends eight CSS pixels beyond the plot to make edge points easier
to reach; the visible geometry and nearest-bucket selection remain unchanged.
The selected point’s marker and tooltip show the localized period, exact count and current unit.
The graph also accepts keyboard focus: use the arrow keys, Home and End to
select points, and Escape to dismiss the tooltip. The expandable data table
remains available. The same inspection controls apply to Server monthly activity.
Large axis labels use scientific notation to fit the existing chart gutter;
tooltips and data tables always retain the full counts.

### Storage and maintenance

The existing 2.0.0 Local archive remains authoritative. The first Activity request
builds a derived metadata index, reading one conversation at a time. Large
archives can therefore take time on their first build. Future builds compare
archive identity, revision and content hashes, reuse unchanged metadata and
process changed conversations. Collection changes and deletions are reconciled.

The derived database lives under the profile's `activity-v1/` directory. The
durable SQLite snapshot is compressed with the active **7z/LZMA2** or **ZIP level
6** profile and protected by a SHA-256 checksum. The uncompressed working SQLite
copy is private and contains analytics metadata, not message text. It is removed
when closed; marked leftovers from an interrupted run are reclaimed when Activity next initializes.

Compression conversion discards the derived Activity cache. The next Activity
request rebuilds it using the target compression profile. An absent, stale, corrupted or incompatible Activity cache is
rebuildable from retained conversations. Rebuild does not delete the authoritative
archive. Backup/restore and clear operations reconcile the derived cache with the
active archive rather than treating analytics as another source of truth.

### Bar inspection

Hover a vertical or horizontal bar to outline it and dim the other bars in the
same chart. The native value tooltip remains available; bar labels and displayed
values keep their normal contrast. Keyboard focus gives the same visual emphasis.
Pointer inspection takes priority within a chart while hovering; leaving returns
to any keyboard-focused bar or the normal appearance. High contrast and forced
colors keep all bars fully opaque and strengthen the active outline.

This treatment applies to Local Activity and Server Insights with both the plain
and styled bars. It does not change values, bar dimensions, filters, chart layout,
timeline inspection, the calendar or charts rendered inside conversations.

### CSV

Export creates a UTF-8 CSV with a BOM, quoted fields and CRLF line endings. It
contains daily dates, messages/stored turns, user, assistant, tool and
conversations-started counts for the selected report, including the estimated
normalized starts described in Source coverage. The existing CSV columns stay
unchanged. Formula-looking text is
escaped. The calendar metric changes presentation; the CSV retains all of these
daily count columns. The desktop save dialog chooses the destination.

## Server Insights

Server Insights calls the selected server's existing
`GET /api/insights?collection=...` endpoint. It needs no new server extension,
local analytics database or conversation-wide download. It does not modify the
server. Refresh explicitly requests the current summary again.

| Section | Meaning supplied by the server |
| --- | --- |
| Totals | Collections, source files, indexed passages/chunks, conversations and turns |
| Monthly activity | Indexed passages grouped by the server's month |
| Top models | Indexed passages associated with each model |
| Providers | Conversations and turns by provider |
| Longest conversations | Up to the server's supplied longest-thread rows |
| Role counts | Server role aggregates, when supplied |

Indexed passages are not original message counts. The Server view therefore
uses different labels and does not offer the Local mosaic, original branch
analysis or hour-of-day history. Opening one longest-conversation row uses the
existing Reader endpoint for that conversation.

Top models and Message roles share a row when space allows; Providers fills
the row below. Compact windows stack the cards in one column.

A missing Insights endpoint, an unreachable server, an invalid response or an
empty collection receives an explicit state. Changing server or collection
prevents an earlier response from overwriting the newly selected scope. No
fallback scans the full server archive.

## Offline Preview

The release Preview HTML uses the actual application UI and reader with synthetic
records. Activity and Server Insights operate on those bundled examples without
network access. The preview’s CSV button creates a browser download. Collection edits,
preferences and simulated compression choices last only for the open preview
session. Actual imports, durable database compression and backups require the
desktop application.
