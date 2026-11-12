# Filters, saved views and annotations

[Analytics manual](index.md)

## Shared selection and table selection

The shared filter bar determines which archive records feed the analysis. It offers a date range, a quick collection choice, a quick platform choice, **Search titles and observed excerpts**, **All filters**, an active-filter count when applicable, **Reset** and **Save view**.

Quick choices apply as you change them. Selecting Custom dates opens the full filter dialog. The search field recalculates after a short typing delay. In the All filters dialog, you edit a draft; choose **Apply filters** to commit it. Closing the dialog without applying leaves the previous shared selection in place. Reset inside that dialog resets the draft. Reset on the main filter bar restores the default shared scope, using the configured timezone.

Table search and sort controls affect that table's displayed analytical rows. They are useful for finding a model or conversation inside a result, but they do not change the archive population represented by other workspaces. A visible-mark limit in Explorer similarly limits a drawing, not the entire numerical result.

## All filters reference

| Control | What it selects | Practical distinction |
| --- | --- | --- |
| Sources | Connected source identities | Separate a Reader capture from a separately imported export |
| Snapshots | Retained snapshot identities in the current data | Restrict which captured versions contribute |
| Collections | One or more collection memberships | Collections can contain several platforms |
| Platforms | Recorded provider/platform provenance | A collection name is not a provider identity |
| Export formats | Original or normalized format families | Useful when assessing coverage differences |
| Message-level model | Individual matching records | Other-model records in the conversation are removed |
| Conversation-level model | Conversations containing a matching model | Other records in those conversations remain subject to the other filters |
| Content categories | User, response, thinking, recap, commentary, redacted, tool call, tool output, system and other | Categories remain distinct counting populations |
| Date range | All time, last 7 days, last 30 days, calendar year, rolling year or custom | The range uses calendar boundaries in the chosen timezone |
| Timezone | Local, UTC or a listed IANA timezone | Changes date grouping and range boundaries |
| Time basis | Original message/event dates or conversation dates | Conversation dates do not make messages precisely timed |
| Calendar year | The year for Calendar year range | Distinct from the mosaic's displayed-year control |
| Start and end | Inclusive custom calendar dates | Only used for a custom range |
| Branch/version scope | Selected path/version, all retained records or alternative records | Alternative versions are not automatically new requests |
| Counting perspective | Unique conversations or collection memberships | Membership perspective can weight a conversation more than once |
| Content characteristics | All, code blocks, attachments or links | Uses recorded/recognized content characteristics |
| Selected virtual group | An Analytics-owned group | Does not alter Reader collections |
| Reliability | Recorded, derived, estimated or unavailable | Availability and analytical provenance are explicit |
| Coverage | Original, normalized or partial | A normalized-only export may lack original structure |
| Capabilities | Required available capability keys | A provider name alone does not guarantee a capability |
| Model families | An explicit analytical family label | Original model identifiers remain available in evidence |
| Include undated | Whether undated records remain in the selection | Undated material cannot supply an hour-of-day observation |
| Search titles and observed excerpts | Matching title/metadata or bounded observed text | This is not a full-archive text search |

Multi-selection lists support several values. Use the operating system's usual multi-select gestures, such as Ctrl-click on Windows/Linux or keyboard selection, and check the applied scope after committing the dialog.

## What the search actually searches

The shared text search examines titles, model/platform metadata and the first **8,000 UTF-16 code units of observed text per record**. A long record can contain a word beyond that excerpt and still fail this filter. This bound is used consistently by charts and exported reports.

Text-volume measures, code analysis and exact repeated-prompt identities use complete captured text or a validated full-text index of that text. They do not measure only the displayed excerpt. Therefore a large character total and a search miss are not necessarily contradictory: they answer different questions.

Use Reader when your goal is detailed conversation reading. Use Analytics search to select a documented excerpt-based analytical population, and record that scope when sharing a report.

## Dates and timezones

Original message/event dates are the default basis. Import time, file modification time, Reader operations and capture time are never fallback activity dates. Missing or invalid dates remain undated. Day-only records retain their calendar date but cannot enter precise hourly distributions.

Last 7 days includes today and the previous six calendar days. Last 30 days includes today and the previous 29. Rolling year is **365 calendar days**. Calendar year uses January 1 through the end of the selected year. A custom end date is inclusive in the interface. Equal-length previous-period comparison uses calendar-day lengths, including daylight-saving changes.

The full-year mosaic's **Displayed year** changes which year is drawn. It does not override the shared date range. Days outside the applied range are shown differently from days inside the range with zero matching activity.

## Counting perspectives and branches

With **Unique conversations**, explicit scoped conversation identities count once. With **Collection memberships**, contributions are weighted by how many selected collections contain the conversation. If a conversation belongs to two selected collections, a membership chart can count that conversation’s contributions twice. Selecting one collection makes that membership weight one.

The default **Selected path/version** scope follows the retained selected branch where the format supports it. **All retained records** includes retained alternatives. **Alternative records** isolates records explicitly marked unselected. Some exports do not retain reliable branch selection; read the coverage warning rather than assuming a complete conversation tree.

A stored alternative response version can share a logical request/message identity with another version. Retaining both does not automatically mean two original requests occurred. Structural all-retained denominators and filtered text-segment totals are separately labeled.

## Save a view

1. Apply the intended shared filters.
2. Check the scope line, including timezone and branch policy.
3. Choose **Save view**.
4. Enter a descriptive name, up to 150 characters, and save.
5. Find it in **Sources & settings → Saved views** and choose **Apply** to return to that selection.

Applying an ordinary saved view returns to Overview. A saved view records the analytical filter selection; it is not a source backup or an exported report. For a specific Explorer chart, local controls and an applied comparison, use **Save exploration preset** instead. That preset is documented in the Explorer chapters.

## Analytical annotations

Open **Annotations** from Data quality, Sources & settings or a record in the evidence pane. Select the target conversation before editing. All changes belong only to Analytics.

| Annotation | Use | Caution |
| --- | --- | --- |
| Display alias | Give a conversation a more useful analytical label | Does not rename the original conversation |
| Explicit identity alias target | Declare that two verified identities represent the same conversation | Use only after inspecting evidence; equal text alone is insufficient |
| Original model and model-family alias | Group a recorded model under an analytical family name | Does not rewrite original model metadata |
| Virtual groups | Assign comma-separated group names | Groups are Analytics selections, not Reader collections |
| Exclude | Remove a conversation from analytical selection | Does not delete it from Reader or the export |

Save commits the annotations and recalculates the analysis. Clear a display alias or family value when you want that annotation removed. Clear the explicit identity target to return to ordinary identity handling. Remove a virtual group name from the conversation's group field to remove that membership. Uncheck exclusion to include the conversation again.

Before comparing two analyses, check whether their aliases or exclusions changed. An apparent count change can be caused by an intentional analytical identity decision rather than a change in source activity.

Continue with [the standard workspaces](03-Workspaces.md).
