> Retained legacy-board counting definitions. New Explorer algorithms, full-text indexes and exact tables are defined in [families 01–18](explorer-01-18-definitions.md), [families 19–32](explorer-sequences-comparison.md), and [release contracts](Version-Contracts.md).

# Analytical units, filters, coverage and reports

The calculation is deterministic JavaScript, with no model, network or filesystem access. `src/core/metrics.mjs` is used by both the desktop calculation worker and the offline preview. Parser adapters supply scoped original identities and content classifications. `buildReport` returns the exact shared arrays used by charts, accessible numerical tables, and report serializers.

## Units and scope

| Measure | Definition |
| --- | --- |
| Conversations | Distinct scoped conversation identities in the applied selection. Only explicit identities and user-saved aliases deduplicate. Similar text never merges conversations. |
| Collection memberships | Selected collection links, independently of platform/provider. A mixed collection is never assigned one platform. |
| Content segments / activity | Source-native classified content segments. Thinking, recap, commentary, final response, call, output, system, other and redacted segments stay separate. |
| User messages / response messages | Distinct scoped `logicalId` boundaries within the matching category. Segments with no trustworthy boundary do not manufacture logical messages. One response with several text/thinking segments is not several final replies. |
| Stored message objects | Distinct scoped `objectId` values represented in the selection, including identifiable empty objects. Different versions may share a logical message identity while retaining distinct stored-object identities. |
| Tool calls | Distinct recorded call identities scoped to conversation and, when supplied by the adapter, agent/message. Calls, outputs and display representations are not added together as invocations. |
| Tool outputs | Distinct recorded output events/objects. Call/output joins use scoped call identity. Unmatched outputs remain visible. |
| Tool indicators | Distinct exported object/name indicator entries. `toolIndicatorObjects` separately counts stored objects carrying indicators. Neither measure proves an invocation. |
| References and links | Recorded reference metadata and recognizable textual HTTP(S) links remain separate from recorded search events. A citation is not a search event. |

Unique-conversation perspective counts each conversation once. Collection-membership perspective weights records by the number of selected collection memberships. The same conversation can therefore count more than once in a membership chart. Selecting one collection makes these weights one. Table headings and exported filters preserve the perspective. A side-by-side comparison flags different population policies.

Selected-path/version scope is the default. All-retained scope includes alternative records; alternative-only scope includes records explicitly marked unselected. Logical request counts still use identities, so alternative versions do not create additional requests merely because their response text differs. Structural selected/all totals are labelled separately from record-filtered measures. Interaction depth uses retained parent-chain nodes where the adapter provides them; unavailable or cyclic depth is not invented. The depth unit includes retained non-message root nodes in ChatGPT mapping data.

Explicit repeated-prompt matching applies Unicode NFC, trims and collapses whitespace, and remains case-sensitive. Distinct prompt identities are retained. The table identifies repeated groups with neutral labels; it does not publish the private prompt text by default. Desktop compact records use a hash of this same full-source matching rule; excerpt text does not define the group.

## Applied filters

Supported shared selection keys include sources, snapshots, collections, providers, export formats, models, model families, categories, time range/basis/timezone, branch/version scope, unique/membership perspective, record coverage/reliability, capabilities, code/attachment/link characteristics, exclusions, explicit aliases, and title/observed-text search.

Message model filtering removes individual records that do not match. Conversation model filtering first selects conversations containing a matching original model and then retains their records subject to the other filters. These two modes have different labels and different populations. Model-family aliases are explicit analytical annotations; exact exported model identifiers remain in underlying evidence.

Shared search examines titles, model/platform metadata and the first 8,000 UTF-16 units of each observed text segment. This observed-excerpt scope is identical in the renderer and full-source report worker; applied filters record `searchScope: excerpt` and `searchLimit: 8000`. Exact repeated-prompt matching and all character/word/code/link calculations use complete source text or the precomputed full-text analysis of that text. The full-text worker can perform an explicitly requested programmatic full-search scope; the desktop filter labels the bounded excerpt search.

## Time

Timestamps are original message/event dates by default. Import time, filesystem modification time and Reader operation time are never fallback activity dates. An explicit conversation-date basis is separately selectable and labelled; it does not become an original per-message timestamp. Conversation dates and day-only records are excluded from hour-of-day distributions.

Epoch zero is valid. Missing and invalid dates remain undated. Day-only records preserve the exported calendar date without manufacturing an hour. UTC, system-local and supported IANA zones use `Intl.DateTimeFormat`. Calendar range boundaries are converted to the selected zone, including daylight-saving transitions. Custom ISO day end dates are inclusive in the UI and represented internally by the following midnight as an exclusive end.

Seven-day and thirty-day ranges include today and the previous six or twenty-nine calendar days. Rolling year is explicitly 365 calendar days. Calendar year uses January 1 to the following January 1. Equal-length previous-period comparisons use equal numbers of calendar days, rather than pretending a DST day always contains 24 hours. Percentage change is unavailable when the previous denominator is zero.

Daily, ISO-week and calendar-month tables count content segments, with user/thinking/response components in the same rows. Active days contain at least one dated selected segment. A streak follows consecutive calendar dates. Current streak ends today or yesterday; longest streak is independent. Average per active day and average per calendar day have separate denominators. Seven-day rolling averages divide by seven and treat dates without activity in the selected population as zero. Daily mosaics are bounded to 20,000 display days; all selected records remain in exact aggregate tables even when a longer span does not render a daily grid.

## Content

Characters are Unicode code points, not UTF-16 code units or user-perceived grapheme clusters. An emoji sequence can therefore contain several counted code points. Words/text units use `Intl.Segmenter` word-like segments, including Japanese and other non-space-delimited text. Runtime ICU segmentation can vary across runtime versions; the fallback is Unicode letter/number runs and is labelled. The tested Electron/Node versions are recorded in the suite verification report.

Code analysis recognizes Markdown fences indented at most three spaces, backtick or tilde runs of at least three characters, matching closing fence type/length, and unclosed retained fences. Declared fence language is recorded exactly; no inferred programming language is presented as a declaration. Code lines and characters count fence bodies. Prose excludes fence lines and bodies. Code-character proportion divides body code points by all observed text code points; fence delimiters remain in the full text denominator, so prose plus code does not necessarily equal full text characters.

Markdown tables require an observed header row and recognizable separator row. HTTP(S) Markdown links, autolinks and ordinary recognizable URLs are counted outside fenced code. Structured references and textual citation markers remain distinct. Source domains are observations from these retained links/references, not a guarantee that a page was visited or searched.

Attachment counts deduplicate recorded identity, or otherwise original object plus retained path/name/type. Explicit byte sizes remain separate from token metadata. Width and height are retained when recorded. Missing attachment bytes and metadata-only availability are not silently transformed into actual accessible files. No attachment file-token size enters request-token totals.

## Thinking, durations and usage

Observed thinking-trace/final-response character ratios use only conversations containing an observed exported original trace and observed response text. Summary-only exported thinking is excluded from this trace ratio and has separate counts and a text-volume table. Empty and unavailable traces remain separate. The coverage numerator is the number of such conversations, and the denominator is the selected conversation count. Redacted and omitted thinking is unavailable, never an observed zero-length trace. There is no reconstruction of internal reasoning that the source did not export.

Structured nonnegative durations preserve original unit/scope/provenance. A numerical exported recap label such as `Thought for 2m 3s` is a derived recap-duration observation. Vague labels such as `Thought for a few seconds` remain unmeasured. Recap duration is never labelled complete compute time. User-to-assistant timestamp differences are not used as inference latency.

Usage tables retain individual verified fields by recorded scope and unit. Input, output, total, cached, reasoning and cache-creation fields are not summed into a second invented total. Context occupancy is a separate table; it is not consumed or billable tokens. Metadata without interpretable scope is reported in diagnostics and excluded from consumption measures. Genuine usage metadata from other providers remains available even when a ChatGPT export has none. No billable cost, subscription usage, credit total or unlabelled transcript-token estimate is calculated.

## Coverage and provenance

Every metric family includes counting unit, eligible population, applied filter scope, time basis, branch policy, derivation, coverage and reliability. Recorded means supplied by the source, not independently proven. Missing numerators with an empty eligible denominator have a null percentage. Missing model/platform/date values are visible categories, and unsupported empty conversations remain visible beside valid neighbors. Capability matrices group actual detected capabilities by source, format, collection and provider. Original/normalized coverage is explicit.

Evidence relates metric records to conversation/source/snapshot identities, original objects/logical boundaries, content classification, selected status, timestamp/model provenance, source field location, event/usage/attachment/reference metadata, inclusion rule and safely rendered excerpts. Renderer excerpts are explicitly marked when truncated; full-source numerical totals remain separate.

## Reports

CSV, structured JSON and self-contained HTML serializers consume one complete `buildReport` object. They preserve the object's applied filter scope rather than reading unfinished UI drafts. Each report includes application/schema/adapter versions, generation and capture times, source/snapshot identities, timezone/range/precision policy, branch/perspective, coverage explanations and counting definitions. Exact numerical chart arrays are exported as tables. CSV contains labelled sections with a table name and header for each analytical array.

The default report contains aggregates and observed-number tables. Conversation labels are neutralized, excerpts/titles are omitted, and original filesystem paths are stripped from source scope. Evidence text requires an explicit opt-in, with optional selected evidence IDs. Source content is escaped, never inserted as executable HTML. The HTML report embeds a favicon and CSS, uses automatic light/dark colors, contains navigation and accessible tables, and has no external assets or scripts. Main report headings follow English, Hungarian, German, French or Japanese settings; machine schema keys and source-defined identifiers retain stable values.

CSV quotes all cells and doubles quotes. Textual values beginning with spreadsheet formula prefixes, including leading control/whitespace characters, receive a literal apostrophe. Actual numeric negatives remain numeric. The desktop service separately guards all output destinations against Reader/source paths and aliases; serializers themselves have no filesystem API.

## Reproducible verification

Run `node --test test/metrics.test.mjs`. The independent synthetic expected counts cover mixed providers, segment/object/logical-message distinctions, branches and memberships, scoped deduplication, message-versus-conversation model selection, epoch zero, unknown dates, explicit conversation date basis, day-only precision, DST, previous periods, Japanese segmentation, code/tables/links/citations, tool joins, usage scopes, paired thinking ratios, empty populations, compact full-text metrics, source-path suppression, all five HTML heading languages, opt-in evidence and CSV/HTML injection protection. No private export is bundled in this test fixture.
