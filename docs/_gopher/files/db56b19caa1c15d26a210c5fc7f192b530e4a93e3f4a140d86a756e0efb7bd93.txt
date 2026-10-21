# Reader Local Activity and Server Insights

## Switch workspaces, not applications

Reader's header offers **Reader / Activity** in Local mode and **Reader / Insights** in Server mode. The analytical workspace replaces the conversation list and reading pane while retaining the fixed header and status bar. It is distinct from the separate Local Analytics program described elsewhere in this manual.

Opening a conversation from a drilldown returns to Reader. Switching back retains the analytical selection for the current session. Startup always opens Reader. No model is required for Local Activity or Server Insights.

## Local Activity: establish the report scope

Local Activity derives metadata from conversations already imported into Reader. Select the collection, time range, metric, branch policy, local time or UTC, model and metadata search as appropriate. The metadata search examines titles, source filenames and providers, not message bodies.

A model filter selects whole conversations containing that model, so other messages within those conversations can remain in the report. This differs from filtering individual messages to that model. Check the selected scope before interpreting a model distribution.

**All time** is the default range. For a specific inclusive interval, choose **Custom range**, enter From and To, then apply it. Missing or reversed dates do not replace the existing applied report. Returning to All time removes the restriction. The chosen Local/UTC setting determines each event's calendar date.

## Calendar and timeline

The calendar mosaic displays one selected calendar year at a time. The year selector is independent of an All-time report range; changing the displayed year does not automatically restrict every other graph to that year. Dates outside an applied custom interval are unavailable. Select a day to inspect the matching conversation list.

Metrics distinguish messages, user messages, assistant messages and conversations started. Daily, weekly and monthly timelines aggregate the selected metric. Weekday and hour distributions use the selected time basis. Switching from local time to UTC can move events across a day, week or year boundary without changing the underlying timestamp.

Hover a timeline to inspect the nearest actual point. The tooltip reports the localized period, exact count and current unit. Keyboard focus supports arrow keys, Home, End and Escape. Expand the data table when you want the exact rows without interpreting a plotted curve. Large axis labels can use scientific notation to fit; the tooltip/table retains full counts.

## Bars and distributions

Model use counts retained assistant messages/turns and reports unknown models separately. Role distribution reflects retained dated messages/turns within the selected range. These are not token counts, monetary costs or billing records.

Hover or keyboard-focus a vertical/horizontal bar to outline it and dim the other bars in that chart. Labels and shown values retain normal contrast. Leaving the pointer returns to any keyboard-focused state or the normal chart. High-contrast/forced-color modes keep opacity readable and strengthen the outline.

**Settings → Appearance → Styled analytics bars** adds the active theme's gradient and glow to these bars. It does not alter counts, filters, geometry, the calendar, timeline behavior or charts inside archived conversations.

## Branch policies and retained data

| Source representation | Activity unit | Branch coverage |
| --- | --- | --- |
| Original ChatGPT mapping | Original message objects, including empty bodies; null nodes excluded | All messages or active/current parent path |
| Normalized records and copied server threads | Stored normalized turns | Only the path/turns actually retained |

An original ChatGPT message ID is counted once within a conversation. The active path follows parent links from the current node. A missing current node can require a deterministic fallback, and malformed cycles are reported. Activity does not rewrite original messages or create missing branches.

## Conversation starts and missing dates

Conversation-start activity normally uses the original conversation creation timestamp, including a retained server `threadCreatedAt`. For a normalized copy without that date, Activity can estimate the start from the earliest valid stored-message timestamp in that copy. **Source coverage** reports estimated starts for the selected range.

Original ChatGPT records without a creation date remain undated. Normalized conversations without a creation date or dated messages also remain undated. Import/catalog timestamps are never substituted. A date that an upstream importer assigned to a normalized message describes that retained copy, not a guarantee of original provider history.

This explains a common apparent mismatch: a copied server conversation may contribute an estimated Activity start while being excluded by Search's “Conversations started” period filter, which requires a source creation date. All time is the place to check undated search records.

## First build, refresh and rebuild

The first Activity request reads conversations to construct a compact derived metadata database. Large archives can take time. Later builds reuse unchanged records and process changes. A missing, stale, corrupt or incompatible Activity cache can be rebuilt from the retained archive. **Rebuild activity** does not delete source conversations.

The cache lives under `activity-v1/` in the Reader profile and follows the selected compression profile. Compression conversion discards this derived cache; the next Activity request builds it again. A rebuild cannot manufacture missing timestamps, models or branches from an incomplete source export.

## Export Local Activity CSV

Use the CSV export control and choose a destination. The UTF-8 CSV includes a BOM, quoted fields and CRLF line endings. It contains daily dates and message/stored-turn, user, assistant, tool and conversations-started count columns for the selected report. It retains all those daily columns even if the currently displayed calendar metric is only one of them.

The report can include estimated normalized starts as described by Source coverage. Formula-looking text is escaped. Retain the selected range, time basis and branch policy with your interpretation of the CSV; a count without a defined scope is ambiguous.

## Server Insights

Insights calls the selected server's existing summary endpoint. Refresh requests a new summary. It does not import every server conversation or create a Local analytical database.

| Section | Unit supplied by the server |
| --- | --- |
| Totals | Collections, source files, indexed passages/chunks, conversations and turns |
| Monthly activity | Indexed passages grouped by the server's month |
| Top models | Indexed passages associated with a model |
| Providers | Conversation and turn aggregates by provider |
| Longest conversations | The server's supplied longest-thread rows |
| Role counts | Server role aggregates, if supplied |

Indexed passages are not original message counts. Insights therefore does not offer Local's original-branch analysis, hour-of-day history or full calendar mosaic. Choose a longest-conversation row to read it using the existing live Reader endpoint.

A missing endpoint, unreachable server, invalid response or empty collection produces an explicit state. There is no fallback that silently scans the entire server archive. The optional server search-pagination extension is unnecessary for Insights.

## Interpreting differences between views

Before comparing two values, check five things: source, selected dataset/capture, time basis, branch policy and counted unit. A Local message count, Server indexed-passage count and separate Analytics filtered selection can all be correct while differing. Read the source-coverage notes before using any of them as a claim about total original account activity.

Related: [Separate Local Analytics](../Analytics/index.md), [Search](../Reader/search.md), [Server mode](../Reader/server.md).

