# ThreadShelf Local Analytics 1.0.0

Local Analytics examines the contents of archived AI conversations. It helps answer questions such as when activity occurred, which recorded models appear in an archive, how much retained content is code, how conversations branch, and which observations support a chart. It works from local captures and supported export files, with separate settings, saved views and annotations.

Analytics and Reader have different jobs. Reader is the conversation-reading application. Analytics is the measurement and evidence application. Analytics does not edit original conversations, synchronize bookmarks, provide chat generation, or require a running server. The optional evidence pane is a way to inspect the records behind a measure; it is not a replacement for Reader.

This manual describes Local Analytics **1.0.0**. The Analytics interface has 17 palettes; Reader also offers Platinum Plus and Professional. Small relationship density grids stay compact while preserving every cell and the corresponding contributor evidence. Application release numbers and internal storage-format numbers are separate concepts.

## Start here

1. [Install, attach sources and capture data](01-Sources.md).
2. [Select data with filters, saved views and annotations](02-Selections.md).
3. [Read the standard analytical workspaces](03-Workspaces.md).
4. [Use Explorer distributions and relationships](04-Explorer-Distributions.md).
5. [Use Explorer sequences, observability and capture history](05-Explorer-Sequences.md).
6. [Compare selections, inspect evidence and export reports](06-Evidence-and-Reports.md).
7. [Configure appearance, maintain storage and back up Analytics](07-Settings-and-Storage.md).
8. [Resolve problems and use keyboard controls](08-Troubleshooting.md).

## A reliable first analysis

1. Open the native application and allow it to load the data stored in the Analytics profile.
2. If a standard Reader archive is found, wait for the first capture of that archive. Otherwise choose Add source.
3. Open Sources & settings and check the source status, capture time, source path and snapshot identity.
4. Start in Overview with All time and the default unique-conversation perspective.
5. Review coverage before interpreting totals. Unknown dates, models, missing text and unavailable usage are separate conditions.
6. Select a chart mark or exact-table row to inspect the corresponding contributing records.
7. Apply a narrower selection when needed, then save it as a view.
8. Export an aggregate report only after checking the applied scope.

## The three levels of information

| Level | Purpose | What to check |
| --- | --- | --- |
| Chart | Recognize a pattern quickly | Axes, unit, category, date range and visible-mark limit |
| Exact table | Read the numerical result | Denominator, unavailable values, complete population and table paging |
| Evidence | Inspect the contributing source records | Original classification, source location, model/date provenance and branch status |

The chart, table and evidence belong to the same applied analytical selection. A table search narrows the rows shown in that table; it does not redefine the shared archive selection. An exported report contains the complete applied analytical tables, not merely the current screenful.

## Important interpretation rules

- An unavailable measurement is not zero. A missing model, hidden reasoning trace or absent token counter cannot be reconstructed from unrelated fields.
- A content segment, a stored source object, a logical message, a conversation and a tool event are different counting units.
- Conversation dates and capture times are not substitutes for original message timestamps.
- Equal prompt wording is not proof that two records are the same request.
- Longer responses, more code, more tool calls or more exported thinking do not establish better answer quality.
- Local source captures can remain useful when their original drive is disconnected. Their freshness and capture time still matter.

See the [complete Analytics screenshot gallery and provenance](../Screenshots/analytics-gallery.md) for the exact source-renderer capture method and image resolutions.

