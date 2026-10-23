# Rich export rendering — ThreadShelf Local Reader 1.1.0

This release renders supported declarative graphics already present in a message. It does not reconstruct missing export data or run the original ChatGPT widget runtime. Local mode, Server mode and conversations copied from a server use the same message renderer. Existing converted Markdown tables, ordinary links and saved text snapshots continue through the existing Markdown pipeline.

## Format support

| Preserved input | Presentation in 1.1.0 |
| --- | --- |
| `box`, `row`, `grid`, `grid-item` | Validated nested layouts, cards, architecture groups and layout-based bars; bounded dimensions, spacing, alignment and theme colors |
| `text`, `title`, `caption`, `divider`, `icon` | Markdown text, semantic headings, captions, dividers and app-owned line icons; unknown icon names use a passive symbol |
| Static `svg` containing `path`/`circle` | Validated saved area/doughnut illustrations, with bounded literal geometry and paint; no scripts, styles, references, resource URLs or arbitrary SVG |
| `Entity` | Inline saved label; category/disambiguation retained in the title; no invented entity destination |
| `Link` | Explicit safe HTTP(S) or mailto link; opened through the Reader's existing external-link action |
| `Cite` | Exact recorded ID binding when available; otherwise a compact unavailable-source pill retaining the exact identifiers in the accessible label and tooltip |
| `AsyncImage` | Recorded source image loaded inline under the online-image preference, or a theme-aware placeholder when no usable source exists; no image search or guessed asset |
| `AsyncImageGroup` | Passive offline query-list text; no simulated carousel or guessed assets |
| `Chart.content`, legacy `genui.chart.content` | Retained exported bar contract: categories, ordered series, numeric values, inherited chart/series suffixes, saved bounds and metadata |
| Legacy `genui.charts_widget_v2.content` | Validated bar, horizontal-bar layout, categorical line, pie-family and numeric scatter contracts, using the supplied chat-derived fixture envelopes |
| Reader-owned `threadshelf-chart` schema, version 1 | Explicit normalized bar (vertical/horizontal), categorical line/area, pie/doughnut and numeric scatter; see the chart specification below |
| Finite `{#each … as item,i}`, `{#if …}` and own-property bindings inside validated layouts | Bounded literal-data interpretation; bound strings are inert text, never new markup or executable expressions |
| Legacy GenUI `citation`/`refs` | Same exact-binding citation policy as `Cite` |
| Legacy GenUI `suggest_automation` | Passive saved suggestion label; no action or schedule is created |
| Legacy GenUI `map_widget` | Passive saved name/category list; no map tiles, geocoding or inferred location |
| Unknown component syntax, malformed fragments, unsupported charts/semantics/versions | Original safe source, or a saved-data fallback for a recognized chart container; later independent fragments remain renderable |

The supported markup contracts do not declare a version. Recognition is by the bounded component grammar and validated properties, never by a conversation title, person, model name or country. The explicitly versioned `threadshelf-chart` contract belongs to this Reader; the examples are synthetic and are not claimed as discovered ChatGPT schemas.

The renderer handles neutral percentage fills whose source surface color matched the containing card, and accepts the semantic `info` fill used in the second formatting response. Full-width rounded tracks keep the saved 51%/71%/100% proportions. Neutral fills use the chart accent while semantic and explicit colors remain supported; other cards retain their styles. The archive, badge-check, file-search, layout-dashboard, panels-top-left, type, database and sparkles names now use app-owned line icons. The deliberate unknown-icon example retains the fallback.

The renderer preserves the saved flex ratios of bounded horizontal allocation tracks, including the 160:32 two-colour example at minimum window size. Image slots keep their saved width/maxWidth and aspect ratio beside the accompanying entity text; query-only exports use a local SVG placeholder. Citation markers use compact pills with the original identifiers retained accessibly. These changes do not supply missing photographs or infer citation destinations from unrelated search-result lists.

The renderer applies the Corner aperture and Soft horizon designs to the corresponding image layouts. The placeholder geometry remains local, trusted application code. All paints inherit the active Reader theme, while source dimensions, aspect ratios, descriptions and source copying are retained. The exported SVG grammar remains bounded; recorded HTTP(S) image URLs use the separately documented online-image policy.

Full schema details and limits are in [rich-parser-support.md](rich-parser-support.md) and [rich-chart-support.md](rich-chart-support.md). The source modules define the executable limits and property allow-lists.

## Chart display and interaction

Charts use production DOM/SVG plus theme-aware custom inspection panels. Bars highlight the active mark; categorical lines and areas share one tooltip and aligned crosshair across all series at that position. Scatter preserves numeric X/Y and uses a point-aligned guide. Keyboard inspection, Escape dismissal and exact-value disclosures provide equivalent access without a mouse. Source values, including zero, negative zero and `3.125`, are not rounded or multiplied by suffixes.

Chart-level suffixes are inherited only when the series has no explicit suffix or unit. An explicit empty suffix overrides inheritance. A common axis shows a unit only when series agree. For `charts_widget_v2` bar data, `layout: "vertical"` means horizontal bars; omitted layout means vertical bars. The Reader-owned orientation contract remains unchanged.

The evidenced widget `chartType: "pie"` uses a local ring presentation policy, without changing source type or inventing an inner-radius field. Explicit Reader-owned solid pie/doughnut retain their shape. Circular panels show raw values alongside a labelled calculated share of total; exact tables retain the raw data. Unknown exported area/doughnut, stacking, fields, versions and layouts retain a safe fallback.

The offline preview includes all seven chat-derived fixture wrappers, all seven Reader-owned presentations, a three-card dashboard, source-sized image placeholders, a two-part allocation bar, compact citations, four ordered steps with three arrows, 51%/71%/100% layout bars, exact-value disclosures and literal/code/table regression examples. It is built from the shared production renderer and shell, preserving theme and localization controls. The preview records are synthetic and do not establish a real account-export, converter or server round trip.

## Passive formats and preserved conversions

The observed marker vocabulary is `cite`, `i`, `video`, `navlist`, `link`, `product_entity`, `products`, `businesses_map`, `filecite`, `entity`, `image_group`, `entity_metadata`, `product`, `link_title`, `genui`, `url` and `visualize`. Only the documented literal GenUI wrappers have active local presentation adapters. Other marker text remains inert source. Arbitrary fenced JSON does not become a chart. Raw exported HTML and SVG outside the documented static illustration subset remain escaped or sanitized by the existing path.

The saved C06 area and C08 doughnut illustrations use the separate bounded SVG adapter. It accepts only `svg`, `path` and `circle` with literal geometry and paint, creates fresh SVG DOM nodes and retains the surrounding source labels. It does not infer a chart data contract, create hover inspection or invent an exact-value table for an illustration. Unsupported SVG preserves the original safe source. Exact property and resource limits are listed in `rich-parser-support.md`.

The 26 observed metadata-reference families are not a license to execute their payloads. Metadata without visible message content stays invisible. DIL 2.0 actions, expressions, resource URLs, callbacks, dynamic widgets and the opaque currency marker are not executed. The intentionally exported `[Interactive visualization not included in this export.]` sentence stays intact. A converter's saved currency rate, date and not-a-live-rate label are not replaced with a live rate.

A chart converted to an ordinary Markdown table stays a table. Values alone do not establish the former chart type, axes, stacking or interaction. A screenshot alone does not supply chart data.

## Citation association

For native archives with `raw.mapping`, the display adapter associates a turn using the exact `source_node_id` and `source_message_id`. When only a source message ID exists, it must identify a unique node. It reads only that message's `metadata.content_references` and only the observed `grouped_webpages.items[].refs` tuples. A valid `{turn_index, ref_type: "search" | "view", ref_index}` tuple binds to that item's explicit safe HTTP(S) URL. Conflicting URLs for one reference are discarded. Supporting-site order, title similarity, list position and references from unrelated messages never establish a binding. Unsafe URLs, inherited properties, getters and ambiguous identities do not resolve.

The context is a transient frozen record attached to display messages. Copied server turns without original mapping retain a passive citation fallback; their missing metadata is not invented. Already-converted Markdown citations remain unchanged. Citations are not fetched while rendering. Recorded image URLs may load under the selected online-image policy; query-only images remain unavailable.

## Image loading and empty status records

See [Images and Resources Cache](Images-and-Cache.md) for automatic/click loading, bounded sizing, placeholder behavior, cache ownership and trust boundaries. Empty ChatGPT intermediate status envelopes are filtered from presentation only; ordinary JSON examples, code blocks, unknown records and substantive thoughts remain visible.

## Data and compatibility

The archive and imported conversation objects are not mutated. `message.content`, `sourceText`, raw data, turns, roles, dates, models, IDs and selected branches are unchanged. Whole-message Copy retains the archived source, including component syntax. Graphics are children of the existing `.message` anchors; they do not create turns, attachments or Activity events. Exact chart tables and custom pointer/keyboard inspection offer local data access without changing copy semantics. Tooltip contents, guides, derived shares and normalized chart state are temporary and are not archived.

This is a render-only upgrade: SQLite schema 3, content references v1, `threadshelf-content-v2`, storage-v2 format 2, 7z/ZIP6 codecs, lazy loading, search passage IDs, reading-v2 identities, bookmarks, positions, database management, backup/restore and Local/Server separation retain their existing contracts. It does not require reimporting, recopying, reindexing, migrating or recompressing existing archives. Local Analytics 1.0.0 continues to capture the same source content through the existing read-only contract.

The nineteen interface themes, 10 code themes and five locales remain available. New reader-owned labels are translated into English, Hungarian, German, French and Japanese. Chart marks, series swatches, hover panels and active styling derive from the selected Reader theme; exported semantic colors map to current theme variables. Large charts/tables use contained scroll regions. The minimum application window remains 680 × 540.

## Trust boundary and offline behavior

The parser uses Markdown tokenization plus a bounded component/literal grammar. It protects code, escaped examples, mathematics and unrelated raw HTML. Only finite local arrays and own properties of parsed literal records can feed template bindings. It does not use `eval`, `Function`, JSX compilation, Svelte compilation, widget runtimes or exported scripts.

Transient random placeholders connect validated records to sanitized Markdown. Trusted code constructs DOM/SVG nodes and assigns saved values as text. Bound template values are inserted after Markdown parsing and cannot become tags, links, directives or code. Event attributes, spread attributes, prototype keys, arbitrary styles, CSS resource URLs and executable expressions are rejected. Parsing and expansion have aggregate budgets. Unsupported input falls back without changing archive data.

Renderer, Electron and storage dependency versions are recorded in [package.json](../package.json) and [package-lock.json](../package-lock.json). See [Toolchain.md](Toolchain.md) for the current pinned runtime and build toolchain. Context isolation, web security, disabled Node integration and the Electron sandbox remain enabled. Image CSP permits HTTP(S) image resources, while connect-src remains disabled; the cache bridge validates every resource action and conversation-bound URL. The offline preview bundles synthetic examples and existing renderer assets; it is an in-memory demonstration, not a physical archive or a server.

## Verification

See the release's [suite verification record](../../../maintainer/VERIFICATION.md) for the actual checks, results and platform limits. The source package includes reproducible synthetic tests and compact verification records. Private export inputs and real profiles are not included. Native Linux execution, browser tests, package byte validation and unavailable native Windows execution are reported separately.
