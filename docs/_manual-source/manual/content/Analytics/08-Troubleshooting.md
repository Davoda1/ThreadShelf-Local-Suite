# Troubleshooting and keyboard reference

[Analytics manual](index.md)

Start with the visible source status, applied filters and coverage. Preserve the source files before investigating an integrity error. Analytics deliberately does not repair or migrate unsupported Reader archives.

## Source and startup problems

| Symptom | What to check or do |
| --- | --- |
| Empty first screen | Use Find Reader archive or Add source. Check that the Reader archive exists at the expected profile path. A source on another user account or custom path requires manual selection. |
| Find Reader archive reports previously removed | The remembered removal suppresses automatic reconnection. Use Find Reader archive explicitly to reconnect it. |
| Source path unavailable | Reconnect the drive or restore access. Existing complete owned analysis can remain usable; check the capture time and stale status. |
| Reader capture is busy or cannot obtain a coherent snapshot | Let Reader maintenance finish, then Refresh. Do not copy random partial storage files into the archive. |
| Reader format unsupported | Check whether it uses the supported local-storage-v2 archive contract. Analytics does not migrate an older schema. Use an appropriate supported export route if available. |
| Integrity/corruption error | Preserve the original. Use Reader's own recovery workflow separately where appropriate, then refresh Analytics. Analytics will not silently repair the source. |
| Multipart export produces no conversations | Select all matching complete supported ZIP parts together. Mixed exports, missing chunks, encryption and ordinary byte-split volumes are not supported substitutes. |
| Direct 7z/RAR file rejected | Extract it first and use Export directory. Do not confuse outer export containers with Reader's separately supported compressed object storage. |
| Directory rejected as a Reader profile | Use the Reader archive route, not Export directory. |
| Unsupported neighbors in an extracted folder | Inspect diagnostics. Supported surviving records can be retained with explicit partial coverage; an unsupported file is not evidence of zero activity. |
| Startup cover remains with Retry | Correct the reported owned-storage or initialization problem, then Retry. Preserve the profile before attempting a reset. |
| Linux sandbox error | Use a host that permits Chromium user namespaces or the installed package's supported sandbox helper. Normal production use should not run as root or disable sandboxing. |
| Native runtime dependencies missing | Install the dependencies declared by the package through the distribution's package manager. Source scripts and Node installation are not a substitute for missing desktop system libraries. |

## Unexpected numerical results

| Symptom | Explanation to investigate |
| --- | --- |
| No matching activity | Check sources, collections, search, range, timezone, branch scope, exclusions, virtual group and Include undated. Reset is a quick way to test whether filters explain it. |
| A known word is not found | Shared search scans the first 8,000 UTF-16 units of observed text per record, plus title/metadata. The word may be beyond that bound. |
| Chart count differs from a Reader message count | Check whether the measure is a segment, logical message, stored object, conversation, membership or event count. |
| Membership totals exceed unique totals | One conversation can belong to several selected collections. This is the chosen weighting perspective. |
| Hourly activity is lower than daily activity | Day-only dates cannot enter hourly charts. Missing original clock precision is unavailable. |
| An old conversation appears in a recent capture | Capture time is the observation time. Activity time remains the original recorded date. |
| Trace ratio missing | Original trace and final-response text must both exist in the eligible population. Summary-only or redacted thinking does not become an original trace. |
| Standard usage table has values but strict Explorer usage does not | Explorer requires verified field meaning, provider/export audit, units and scope. A recorded candidate counter is not automatically semantically verified. |
| A zero-count cell has no evidence | There are no observed contributors for that cell. This differs from a measurement whose source data is unavailable. |
| Density-grid bins look equally wide despite different ranges | Equal spacing is intentional; labels give actual half-open numeric ranges. The layout prevents large outliers compressing the rest. |
| Two depth or percentile views differ | Legacy and Explorer definitions differ and are labeled. Check observation unit, grouping, branch population and algorithm before comparing. |
| A percentage change is unavailable | The baseline may be zero or the population incompatible/unavailable. The app does not invent an infinite or arbitrary percentage. |
| Capture-difference totals overlap | One record/conversation can have content, selected-path and capability changes. Those categories are not necessarily disjoint. |
| Saved selection reports unsupported fields | The original unknown keys remain preserved, but unsupported parts are not silently applied. Review the partial-selection warning and edit a supported selection. |

## Appearance and interaction

If a translucent theme appears solid, check Reduced transparency, High contrast, operating-system forced colors and blur support. If a screenshot uses another palette, language, size or scroll position, the geometry and visible records can differ while the functionality remains the same.

If a long exact table appears incomplete, use Previous/Next. Standard tables have 100 rows per page and Explorer tables 50. Standard Copy copies the visible page; Explorer Copy exact table copies the full chart-local table. Use report export for complete applied analytical tables.

Background checks should preserve workspace scroll, open exact tables, nested scrolling, dialog drafts, focus and selected text. Changing workspace, resetting filters or changing the target of a dialog intentionally starts the relevant new context. If a calculation is pending, the interface can retain the previous complete analysis with a notice until the next result is ready.

## Keyboard reference

| Context | Key/control | Result |
| --- | --- | --- |
| Ordinary controls | Tab / Shift+Tab | Move keyboard focus through available controls |
| Dialog | Tab / Shift+Tab | Focus stays within the open dialog |
| Dialog or evidence | Escape | Closes the open dialog first; otherwise closes evidence |
| Selectable exact row or supported chart mark | Enter or Space | Opens the corresponding contributing evidence |
| Focusable bar | Focus, then Enter | Shows exact hover details and opens the corresponding evidence |
| Bar/series hover | Escape | Dismisses hover details |
| Calendar mosaic | Arrow keys | Move by day/week within the calendar's eligible day navigation |
| Calendar mosaic | Home / End | Move to the first/last eligible day |
| Calendar mosaic | Enter | Opens contributing records for a populated day |
| Daily model/platform series | Left / Right | Move between displayed dates |
| Daily model/platform series | Home / End | Move to the first/last displayed date |
| Daily model/platform series | Enter | Move into available evidence values |
| Daily model/platform series | Escape | Clear hover |

No additional global keyboard-shortcut set is claimed here. Standard operating-system text selection, clipboard and window controls continue to apply where the focused widget supports them.

## Performance and storage

The first capture is normally more expensive than opening existing owned analysis because it includes reading, decompression, normalization and full-text indexing. An unchanged Reader publication can reuse a complete cache; changed content can reuse valid per-conversation analysis where possible. Query time depends on selected records and measurement scope.

Cancel requests stop at a cooperative boundary, so a single large decode/parse unit may take time to finish. A failed new publication keeps the previous complete result instead of presenting a partially built replacement. Check free space and write permission in the Analytics profile and report destination if capture/export fails.

The source package's verification records contain measurements from specific datasets and hosts. They are not universal maximum archive sizes or timing guarantees. Direct ingestion and text parsers deliberately enforce bounds and report unsupported/limited cases; larger input does not imply unlimited memory or parsing capacity.

## What Analytics does not do

Analytics does not generate conversations, infer hidden reasoning, estimate billable costs from model names, fetch remote images, execute archived scripts, update Reader bookmarks, synchronize reading positions or require an Analytics server. It has no automatic remote-content loading, telemetry or update checks in this source release. Deliberately opening an external link uses the explicit action exposed in evidence.

For a useful issue report, record the application version and package identity, operating system, source route and format, relevant source status/diagnostics, applied scope, exact chart family and the observed behavior. Use synthetic or redacted examples when possible. Include complete confidential evidence only when you intend to disclose it.

[Return to the Analytics manual](index.md).
