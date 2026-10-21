# User guide

## Startup and background updates

The first screen uses the operating system's light/dark preference: white with a
black loading ring, or black with a white ring. This choice does not read saved
preferences. Analytics then loads local Analytics snapshots and configuration,
builds the first report, and reveals the configured interface in one step. A
startup failure leaves a visible Retry button. Reader discovery and new captures
continue in the background after the owned database loads.

Metadata checks and capture progress preserve the current workspace's scroll,
open exact tables, nested table scroll, dialog drafts, focus and text selection.
Changing workspaces starts the new view at the top. Reset and changed dialog
targets intentionally use fresh fields.

## Existing Analytics 1.0.0 stores

Use the existing Analytics application-data location. Valid 1.0.0 captures open
without the Reader or original exports. New text-derived indexes use complete
owned snapshots, while old producer tags, identities, settings, views and
annotations remain intact. The original marker and files are a separate rollback
baseline; later 2.0-only changes do not synchronize back into 1.0. Close the legacy
version before starting 2.0. Unknown saved filter fields remain stored and produce
an explicit partial-selection warning when unsupported.

## Attach a source

Analytics automatically checks ThreadShelf Local Reader's standard profile after the Analytics window
opens and captures a valid archive in the background. The locations are
`%AppData%\ThreadShelf Local Reader\local-storage-v2\` on Windows and
`$XDG_CONFIG_HOME/ThreadShelf Local Reader/local-storage-v2/` or
`~/.config/ThreadShelf Local Reader/local-storage-v2/` on GNU/Linux. It does not
read Reader preferences to find these locations. Detection and capture use the
same read-only source safeguards as manual attachment.

**Find Reader archive** in the empty view, Add Source dialog or Sources & Settings
checks this standard location again. An already attached Reader source is not
duplicated. Removing it remembers that decision in Analytics and prevents
automatic reattachment; the explicit Find control can reconnect it. Missing,
unavailable or invalid standard archives leave other sources usable.

Choose **Add Source**, then the source route matching the data:

| Route | Select | Result |
| --- | --- | --- |
| Reader archive | ThreadShelf Local Reader profile or that profile's `local-storage-v2` directory | Validated committed snapshot with Reader collections retained |
| Export files | One or several supported JSON, HTML or ZIP files | Analysis-only ingestion into Analytics |
| Export directory | Extracted export folder | Bounded recursive ingestion; recognized neighbors retained with diagnostics |

Reader may be running. Do not select the Reader profile through the export-directory
route: that route rejects Reader profile data, while Reader capture reads only
the audited archive inputs. Never choose Analytics' own data directory as a
source. Older Reader storage schemas are unsupported rather than migrated.

Select complete Venice multipart ZIP parts together. For a standalone 7z/RAR
export container, extract it first and select the extracted directory. Reader's
compressed 7z/ZIP storage is handled directly and needs no installed archiver.

The Sources view reports registration/capture status, capture time, commit or
snapshot identity where available, covered dates and freshness. A stale snapshot
can remain useful when the source changes or disconnects; the snapshot status must guide
interpretation. Analytics never silently substitutes a different source.

## Refresh, cancel and stored analysis

Refresh builds another validated result without replacing the displayed complete
snapshot prematurely. During Reader maintenance it may retry a bounded number of
times; if no coherent capture is available, keep using the previous result and
refresh after maintenance finishes. Cancel requests cooperative cancellation.
Expensive native decoding or individual bounded parsing work may finish the
current unit before responding; the interface remains independent of that worker.

Automatic refresh is optional and saved only in Analytics. Keep it disabled for
manual control or choose a bounded interval suitable for your archive. Refresh
does not change Reader's settings or mark Reader records as analyzed.

## Read the workspaces

Navigation contains Overview, Activity & Time, Models & Platforms, Content &
Code, Conversations & Structure, Tools & Recorded Usage, Data Quality, Explorer,
and Sources & Settings. Explorer has Distributions, Relationships, Sequences,
Compare and Observability subviews. Compare also opens a separate selection
dialog. Chart tables
provide exact values and keyboard-accessible detail alongside the visual
presentation.

Calendar mosaic follows Reader's full-year layout: one square for every day,
Monday-first weekday rows, week columns, localized month and weekday labels,
and five activity intensities. Leap years include February 29. The displayed
year control changes the calendar view while the applied shared filters still
determine every count. Days outside an applied date range are marked separately
from zero-activity days. Arrow keys move by day/week, Home/End move to the first
or last eligible day, and Enter opens the contributing records. A day with no
matching dated records does not open unrelated evidence.

| Area | Interpret it as |
| --- | --- |
| Activity | Selected content segments by original date, week, month, hour or weekday; active days, streaks and rolling averages |
| Models/platforms | Original platform and model distributions, changes within conversations and date series |
| Composition | User, exported thinking, final response, recap, commentary, tool and secondary categories kept separate |
| Content/code | Unicode text measures, declared fence languages, code lines/proportions, recognizable structures, domains and attachment metadata |
| Conversation structure | Observed sizes, logical boundaries, retained branches, alternatives, versions and explicit repeated-prompt matching |
| Tools/usage | Recorded named calls, associated outputs/events, indicators, explicit durations and interpretable usage fields |
| Data quality | Capabilities, missing/ambiguous dates and models, unsupported records, provenance, deduplication and coverage |

The familiar category colors are blue for User, amber for Thinking and green for
Response. Tools and other records use secondary labels and treatment. Model-series
colors do not change category meanings, and text/markers accompany colors.

## Apply filters and compare

Use the shared selection controls for sources/snapshots, one or more collections,
platforms, formats, models/families, categories, dates/time basis, branch scope,
reliability/coverage and applicable content characteristics. Reset returns the
selection to the default scope. Apply commits the filter draft; charts, evidence
and exports correspond to the committed selection.

The shared search scans metadata and the first 8,000 UTF-16 code units of observed
text per record. This bounded excerpt scope is the same in charts and exported
reports. It is not a claim of full archive text search. Content counts and
repeated-prompt identities still use the complete captured text. Table search
and sorting narrow the displayed analytical rows independently.

- A collection is a grouping, not a provider. Platform filters work inside mixed
  collections, and comparisons can use different provider subsets of the same
  collection.
- Message-model filters retain only matching records. The separately labelled
  conversation-model option selects conversations containing a model, which is
  a different population.
- Selected path is distinct from all retained branches and alternatives. When
  the export does not record a reliable selected path, read the coverage warning.
- Unique-conversation perspective avoids repeated explicit identities; membership
  perspective weights selected collection memberships. Compare using the same
  unit unless the difference itself is intentional and clearly labelled.
- The default time basis uses original message/event dates. Conversation-date
  basis is explicitly broader and does not imply a precise time for each message.
  Local, UTC and valid IANA zones use calendar boundaries in that zone. Day-only
  dates do not become precise hour-of-day observations.
- Seven-day, 30-day, rolling-year, calendar-year and custom ranges use stated
  calendar boundaries. Equal-length previous-period comparisons preserve calendar
  days across daylight-saving changes. Undated inclusion is explicit.

Save a useful selection as an analytical view. Aliases, exclusions and virtual
groups are stored in Analytics only and do not rename or delete Reader content.
Choose Compare to define two independent selections from current filters, saved
views, the equal-length previous period, or Edit A/B Filters. Check displayed
scope differences and coverage before interpreting a numerical delta.

## Explorer and capture comparisons

Choose a chart in the appropriate Explorer subview. The chart's measurement contract
states the observed unit, applied population, available/unavailable counts,
timezone, original-date precision, branch policy, provenance and algorithm
version. Chart-local controls apply only to supported measurements. The drawn
view can be bounded; the chart's disclosure and complete exact table remain authoritative.
Select a mark or exact row to inspect the contributing records. Missing data is
unavailable rather than a fabricated zero.

Explorer comparisons use explicitly applied A/B selections. Check both scopes,
counting perspective, date basis and coverage before interpreting differences.
Save an exploration preset to retain the current filters, chart and configuration
separately from an ordinary saved view. Ordinary saved views retain their legacy
filter meaning.

Capture history is optional and disabled by default. Enable retention in Sources
& Settings; the bounds apply per source (up to 20 prior captures and 4 GiB of
compressed history). Open a source's Capture history control, select two actual
retained captures, and compare added/removed/changed identities and associated
metadata. The active capture is listed and protected. Capture times are
observation times, never substitutes for activity dates. No earlier unretained state
can be reconstructed. Removing routine history does not remove the active
capture, the protected recovery predecessor or the independent 1.0 baseline.
Storage use reports those retained files separately from routine history.

## Inspect evidence

Select a chart item or detail row to open evidence for the contributing records.
Inspect the source/conversation, original versus normalized classification,
segment/object/logical identities, branch status, recorded date/model metadata,
field provenance and contribution reason. Copy controls help copy selected values
or code excerpts safely. Markdown headings, emphasis, lists, quotes and tables
render within the evidence pane. Raw source HTML stays inert, images never load,
and HTTP(S) links require an explicit Copy/Open action. Display limits are stated;
copy uses the original text/code represented by the displayed excerpt.

The evidence panel displays bounded excerpts, up to 100 contributing records per
request, and the exact contributing population total. Previous/Next controls
retrieve additional pages. An empty contributing selection stays empty.
It is not a complete second Reader.
Large text can be truncated in the panel while indexed content measures refer to
the captured record. Missing original branches or blocks in normalized-only data
cannot be reconstructed. The application provides no editing, Reader bookmarks,
synchronized reading positions or conversation generation.

## Export a report

Apply the desired selection, then choose CSV, JSON or offline HTML. Choose a
destination outside source files and Reader profiles. The export includes schema
and adapter versions, capture/report times, source/snapshot scope, applied filters,
units, date/timezone and branch policies, coverage and exact numerical tables.

Reports default to aggregate analytical data without private conversation text or
titles. To include evidence, explicitly select it and opt in. Review the resulting
privacy mode before sharing. New private categorical labels require a separate
label-inclusion choice. Unknown unapplied filter values are omitted by default
while their keys and unapplied status remain recorded. Evidence can contain
confidential material even though HTML is inert and external resources are
disabled. Legacy categorical labels such as model names may still be sensitive.
Legacy-compatible export retains supported 1.0 meanings and omits Explorer
additions; it is not a lossless downgrade or application-state backup.

CSV uses a multi-section format: metadata and definitions first, summary next,
then named tables with their columns. JSON is best for further scripted analysis.
HTML is one self-contained file with navigation, charts, tables, favicon and
automatic light/dark styling, usable without a network connection.

## Bar chart details

Hover a bar or focus it with the keyboard to show the bar's period or label and exact
total. Stacked activity bars also show User, Thinking, Response and the Other
group with colored dots matching the chart. Recorded categories within Other,
such as recap, commentary and tool records, appear as indented details of that
group. Those detail rows are already included in the Other subtotal. Zero counts
remain visible for the four plotted groups. Enter opens the same contributing
records as before; Escape dismisses the tooltip.

## Read Relationships

Prompt/reply and exported-trace/response relationships use labeled bin heatmaps.
Rows and columns have equal visual spacing so large outliers cannot compress the
rest of the chart. The compact density grid fits the card width without separate
scrollbars. The grid's full height follows the number of bins; the workspace can still
scroll on shorter windows. Compact range labels use k for 1,000 and M for
1,000,000. Hover and keyboard focus show the exact, unabbreviated ranges.
Range labels describe the existing half-open numerical bins;
the upper edge is excluded. The final open-ended range has no upper limit.
Every populated bin is shown, independently of the visible mark limit used by
other charts. Color uses a logarithmic count scale; cell numbers, tooltips and
exact tables retain the original counts. Empty combinations have zero observed
support and no evidence; unavailable observations remain separate in coverage.

Model/feature maps show labeled features and prevalence, with missing metadata
marked unavailable. Co-occurrence maps use the same labels on both axes and
mirror recorded pairs across the diagonal; mirrored cells open the same
contributing observations. They do not add observations to the exact table.
Structure profiles use labeled horizontal bars. Hover or keyboard focus exposes
exact values, and selecting a populated cell or bar opens the corresponding evidence.

## Line graph hover details

Daily model and platform series each have a local hover control above the graph.
**All series** follows the nearest displayed date with a vertical guide and a
tooltip containing each displayed series. **Single point** shows details for an
individual observed point. The choice stays with that graph while the app is
open; it does not change the other graph or shared settings. Missing date/series
groups show zero observed segments with a coverage note and no fabricated point
or evidence link. Recorded values retain their exact table-row drilldown.

Use Left/Right, Home and End on a graph to move between dates. Enter moves focus
into available evidence values; Escape clears the hover. Existing point and
legend evidence controls remain usable by keyboard.

## Appearance and accessibility

System appearance is the default; Light and Dark can be chosen independently of
the interface theme. Available interface themes are Default, Ocean, Forest, Ember,
Amethyst, OLED, Modern, Modern OLED, Platinum, Vellum, Prism, Nocturne, Garnet,
Smoked Glass, Harbor Haze, Amber Room and Opal Daylight.

Default and Modern use ThreadShelf Local Reader's exact light/dark base colors. Modern adds
neutral depth effects to those colors. The four Glassy themes use Reader-inspired
gradient backdrops, translucent panel fills and frosted blur across the header,
navigation, cards, dialogs and evidence panel. Transparency applies to decorative
fills rather than to text. Reduced transparency, high contrast, forced colors
and unsupported blur rendering fall back to solid surfaces.

Code display has a separate theme setting: Default, VS Code, GitHub, Monokai,
Nord, Dracula, Solarized, Codex, Xcode Classic or Ayu. It retains Reader's syntax
highlighting coverage. Code theme selection does not replace the interface theme.

Interface languages are English, Hungarian, German, French and Japanese. Original
conversation/model/provider labels are not automatically translated. Locale
formatting and language preferences belong to Analytics, independently of Reader.

Reduced motion, reduced transparency and high-contrast settings help remove
decorative effects and retain usable solid surfaces. Keyboard focus is visible;
workspace, table and evidence panes can scroll independently. The minimum desktop
window is 680×540. Window state is restored within available display bounds.

## Manage Analytics storage

The storage total and breakdown retain exact byte counts and add a scaled size,
for example `56,334,035 Bytes (53.72MiB)` in English. Sizes below 10,000,000 bytes
use KiB; 10,000,000 through 2,000,000,000 bytes use MiB; larger sizes use GiB.
These MB/GB thresholds use decimal bytes, while KiB/MiB/GiB conversion uses
1,024-based units. Scaled values have two decimal places in the selected locale.

The Settings/Sources storage controls affect Analytics only:

| Control | Effect |
| --- | --- |
| Rebuild analytical indexes | Recompute derived indexes from complete Analytics-owned captures; no Reader/export access is required |
| Remove Source | Remove the source's active v2 capture, indexes and registration; preserve the original 1.0 rollback baseline |
| Clear Analytics Caches | Remove active v2 analyses and indexes; retain registrations, preferences and the original 1.0 rollback baseline |
| Capture history | Compare or remove actual retained immutable captures; the active capture is protected |
| Storage use | Show legacy baseline, v2 metadata/captures/indexes, work and routine history reference sizes |

Reader data and original exports are untouched by these controls. Analytics keeps
separate last-used source/destination directories, with sensible picker fallback if the
saved location is missing. Reports already written elsewhere are separate files
and are not deleted by cache cleanup.

To reset Analytics completely, close it and remove only the Analytics data directory:
`%AppData%\ThreadShelf Local Analytics\` on Windows or
`$XDG_CONFIG_HOME/ThreadShelf Local Analytics/` / 
`~/.config/ThreadShelf Local Analytics/` on Linux. This removes the Analytics settings,
registrations, saved views, annotations and snapshots. Never use the Reader
profile path for this operation.

## Troubleshooting and trustworthy interpretation

| Situation | Action |
| --- | --- |
| No matching activity | Check applied filters, date range, timezone, branch policy and Undated inclusion. Distinguish this from missing export capability. |
| Missing usage/model/timing | Inspect capability and coverage explanations. The application does not infer consumption from text, attachment token sizes or model names. |
| Source is unavailable/stale | Reconnect the source volume or choose Refresh after Reader maintenance; the last valid capture remains available. |
| Integrity/corruption error | Preserve the original source. Analytics will not repair it. Use Reader's own recovery separately if appropriate, then refresh. |
| Unsupported Reader format | Use ThreadShelf Local Reader storage or a supported standalone export route; Analytics performs no migration. |
| Partial/unsupported exports | Inspect diagnostics. Select complete multipart input, extract unsupported outer containers, or supply surviving supported records. |
| Insufficient space/permission | Free space or choose a writable safe report destination. Failed publication retains the last complete analysis; do not change source permissions just for Analytics. |
| Linux sandbox error | Use a host permitting Chromium user namespaces, or the distribution-installed DEB sandbox helper. Do not run as root or disable production sandboxing. |
| Native runtime libraries missing | Install the package manager's declared runtime dependencies; see Packaging Policy for distribution alternatives. |

First analysis includes capture, decompression, normalization and content indexing.
Later unchanged Reader checks can reuse the complete cache; changed content reuses
valid conversation analysis where possible. Query time depends on selected record
counts and analytical scope. Synthetic checks do not establish unlimited-size guarantees.

The public release is validated with synthetic fixtures. Consult the suite verification report for the tests executed for the supplied packages.

No telemetry, automatic remote content loading, update checks, accounts, local AI
models or server are required. Optional server support is omitted because summary
APIs do not supply the original-record and stable-capture detail used by these
deep local analytics.

Legacy exact data tables show 100 rows per page; Explorer tables show 50.
Previous/Next controls keep the complete numerical populations accessible.
Legacy table Copy copies the visible page as TSV; Explorer Copy table copies the
complete chart table. CSV, JSON and HTML exports contain complete applied tables.
