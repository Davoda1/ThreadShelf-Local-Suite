> Core architecture and analytical definitions. For current storage, worker, evidence and security behavior, also see [Explorer architecture](Explorer-Architecture.md) and [Storage formats](Storage-Formats.md).

# Architecture and analytical definitions

## Components and ownership

`src/desktop/main.cjs` owns the sandboxed Electron window, native file pickers,
single-instance coordination and validated IPC. `AnalyticsService` owns source
registrations, settings, saved analytical views, aliases, exclusions and virtual
groups. `src/desktop/worker.mjs` performs capture, ingestion, normalization,
content indexing, compressed snapshot loading and report writing.

The renderer's `analytics-worker.js` calculates applied-filter reports and
comparisons off the GUI thread. It returns chart/table data first; evidence is
requested separately. Desktop IPC uses bounded excerpts of at most 8,000 UTF-16
code units per text record, avoiding a second full-text copy in the GUI. Derived
content metrics are computed before excerpting. Full normalized source text
remains in the Analytics-owned compressed snapshot for later report calculation.

| Module | Responsibility |
| --- | --- |
| `source-access.mjs` | Purpose-limited read-only archive access and source/output overlap checks |
| `reader-capture.mjs` | Consistent Reader publication capture and catalog replay |
| `ingest.mjs` and `parsers/` | Standalone JSON, inert HTML, ZIP and directory ingestion |
| `adapters.mjs` | Explicit provider/format registry, rich records, original identities and capabilities |
| `metrics.mjs` | Deterministic filters, counts, timelines, structure/content/tool/usage tables and comparisons |
| `reports.mjs` | CSV, JSON and inert self-contained HTML serialization of applied selections |
| `owned-storage.mjs` | Positively identified Analytics-only settings, staging and atomic compressed snapshots |
| `themes.mjs`, `appearance.mjs`, `i18n.mjs` | Static appearance resources and Analytics-owned preferences |

Reader startup, writable storage lifecycle, Database Manager, migration,
restoration and acquisition helpers are not instantiated against the source.
Pure retained parsers carry their original MIT notices. AI/search runtimes and
model dependencies are not needed for deterministic analysis.

## Reader capture protocol

Only ThreadShelf Local Reader's `local-storage-v2` format and catalog schema 3 are supported.
Older storage migrations are intentionally outside scope; historical export
variants accepted by the current importer remain part of direct ingestion.

1. Open the selected Reader archive through the read-only source capability.
   Validate the published `current.json` envelope and the associated catalog descriptor.
2. Validate the durable journal head for that selected epoch. The resulting
   publication/head hash identifies the committed boundary selected for capture.
3. Copy the referenced compressed catalog into a uniquely owned Analytics work
   directory. Validate the packed catalog's checksum, decompress only the copy, run SQLite
   integrity/schema checks and query permitted archive columns.
4. Replay required committed operations in sequence after the base snapshot.
   Revision and operation identities are checked. Known index-clear operations
   are analytical catalog no-ops; unknown operations fail closed.
5. Copy only final referenced conversation blocks. Validate descriptor lengths,
   packed hashes, expanded hashes and reconstructed conversation fingerprints.
6. Re-observe publication and head. A changed generation invalidates the attempt.
   A same-generation head advance leaves a valid selected-boundary capture,
   explicitly marked older than the observed source.
7. Normalize and index permitted conversation data. Atomically replace the owned
   compressed analytical snapshot only after a complete validated result exists.

Default generation-race retries are bounded to four attempts with 40/80/160 ms
backoff. Maintenance can make required old objects disappear; this produces a
retry or clear failure, never a mixed generation. Failure, cancellation or an
unavailable volume retains the last complete analytical snapshot. Idle attachment
does not require closing Reader or changing the Reader lease. Periodic freshness
observation reads only permitted control files, and optional refresh is saved in
Analytics settings.

Both Reader High/7z and Faster/ZIP6 storage profiles use the bundled audited
7-Zip codec. Native tools receive fixed argument arrays without shell execution.
Decoded content uses a 64 MiB LRU; individual blocks are limited to 16 MiB, and
assembled records/catalog snapshots to 512 MiB. These limits are deliberate
resource bounds, not claims of unlimited archive support. Transient compressed
copies and catalog files are removed within positively identified owned staging.

## Exact input boundary

The implemented archive-file allowlist is:

- `local-storage-v2/current.json`;
- `records/<epoch>/head.json`;
- required committed `records/<epoch>/<sequence>-<id>.json.gz`;
- the published referenced `snapshots/<id>.7z` or `.zip`;
- referenced conversation `objects/<plain-hash>.<packed-hash>.7z` or `.zip`.

The copied catalog selects collection identity/name metadata, conversation
identity/provenance/content descriptors, required revision/archive identity, and
operation IDs for replay idempotency. It does not select applied-operation result
JSON or unrelated catalog metadata.

Required control envelopes co-locate reading-related values with archive control
and include them in a whole-envelope checksum. Capture reads the required control
envelopes to verify those checksums, then projects only permitted fields. The projected result excludes
embedded positions, bookmarks, recent reading and bookmark-policy flags; these
values do not enter snapshots, annotations, evidence, charts or reports. Separate
Reader preferences, `reading-v2` files, Activity data, vector objects/indexes,
downloaded models, Chromium data, credentials, logs, crash reports and unrelated
temporary workspaces are never opened by the source capability.

The full baseline audit and reproducible safety tests are in
[source-access-audit.md](source-access-audit.md). The application never hashes
forbidden files merely to demonstrate unchanged contents; independent test
instrumentation verifies access and attempted writes.

## Filesystem enforcement and limits

Source access exposes no create, rename, unlink, permission, repair, lock, lease,
checkpoint or cleanup API. All source handles use `O_RDONLY`. Observed symlinks,
junctions and hard-linked file aliases are rejected. File identity, size and
modification metadata are checked around reads, and changed data is discarded.

On Linux, `O_DIRECTORY`/`O_NOFOLLOW` handles and `/proc/self/fd` anchor traversal
to the opened directory rather than replaceable pathname ancestors. Windows uses
Node/libuv's normal sharing semantics and observed type/identity checks. It does
not claim perfect hostile-race isolation on Windows, a kernel security sandbox
for the main process, or protection against a privileged process replacing
directories concurrently. Analytics issues no source mutations; it cannot control
OS access-time updates, antivirus work or Reader's independent legitimate writes.
It never restores timestamps to conceal access.

Output validation rejects source/profile overlap, unsafe links, hard-linked
existing destinations and traversal. Cleanup operates only on validated
Analytics ownership identities. Report bytes are written to an owned temporary
file and atomically renamed in the selected safe destination directory. Source
permissions and ownership are not changed.

## Direct export compatibility

The explicit adapter registry includes ChatGPT mapping exports; Claude messages,
blocks and projects; Grok response/account structures; Google AI Studio chunks
and Imagen; Gemini Takeout/My Activity JSON/HTML/canvas entries; LM Studio versions
and execution data; OpenRouter; Venice conventional and agent messages,
Grok-compatible conversions and multipart Dexie backups; Meta transcripts; and
surviving normalized/converted turns.

Ingestion accepts strict JSON byte encodings, supported normalized/indexed
wrappers, inert JSON-bearing/static HTML, ZIP/ZIP64 and extracted directories.
Scripts are parsed as data only where a supported literal form exists; they are
never executed. Media and remote URLs are never fetched. Unsafe/duplicate ZIP
entries, unsupported neighbors, ambiguous structures and incomplete Venice parts
produce diagnostics. Nested ZIPs must be extracted and selected separately.
Direct 7z/RAR export containers are optional and not implemented: extract them
before selecting the directory. This does not affect mandatory Reader 7z storage.

For Venice multipart backups, select the complete compatible parts together.
Manifests, numbered chunks, database versions and owner/message identities are
validated before retaining conversations. Binary media is not expanded.
[direct-export-ingestion.md](direct-export-ingestion.md) documents exact limits
and APIs. Provider recognition runs per record, not once per collection; a bad
neighbor does not silently discard recognized conversations.

## Data model, identities and units

Conversation identity is scoped by source instance, provider, account scope where
available, and original ID or content identity. Export format, platform, model,
developer, source and collection remain separate concepts. A converted Venice
conversation is not relabelled Grok solely because the container is compatible.

Records retain scoped object/logical/segment identities, raw field references,
original labels, timestamp provenance/precision, selected/alternative status,
classification, capability and reliability information. Original retained data
is analyzed once; the normalized Reader display copy is not additional activity.
Original source field references enable limited evidence inspection rather than
editing or reading-position synchronization.

| Measure | Definition |
| --- | --- |
| Content segments / activity | Source-native classified segments selected by applied filters |
| User/response messages | Distinct identifiable scoped logical boundaries in those categories |
| Stored objects | Distinct original object identities; multiple blocks can share an object |
| Thinking / recaps / commentary | Separate exported categories; never silently final replies |
| Tools | Recorded call identities, with scoped output associations; indicators stay separate |
| Conversations | Unique scoped identities after explicit aliases/deduplication |
| Collection memberships | A distinct perspective weighting selected collection memberships |

Unique perspective merges repeated explicit identities and memberships. Aliases
and exclusions are Analytics-only, reviewable choices. Similar text does not
silently collapse unrelated conversations. Repeated-prompt statistics use Unicode
NFC, trimming and whitespace collapse, case-sensitively; they do not deduplicate
the actual records.

ChatGPT parent links reconstruct child relationships even when children arrays
are absent. Selected-path, alternative and all-retained scopes remain distinct.
Cycles, missing parents, unknown branch selection and unsupported blocks produce
diagnostics. LM Studio alternatives remain versions of logical exchanges;
Google chunks do not automatically become separate complete requests. Redacted
thinking is unavailable observation, not observed empty thinking.

## Dates, content and usage

Message time is the default basis. Explicit conversation-date basis is labelled
separately and excludes hour-of-day interpretation. Import, filesystem and Reader
operation times do not substitute for original message dates. Epoch zero is
valid. Day-only values retain their precision; invalid/absent dates remain
Undated. IANA timezone boundaries and DST affect calendar selections. Custom end
dates are inclusive in the UI, converted to exclusive next-day boundaries.

Text characters count Unicode code points. Words use `Intl.Segmenter` word-like
units, including Japanese, with a documented Unicode-run fallback. Segmentation
can differ with runtime ICU versions. Code metrics use Markdown fences and their
declared language, not inferred-language guesses. Recognizable Markdown tables,
HTTP(S) links, structured references and textual citation markers have separate
counts. Referenced domains and source search-event counts remain distinct.

Durations require explicit valid source units/scopes. Numeric recap duration is
not total compute time. User/assistant timestamp gaps are not inference latency.
Recorded request/generation/context token fields stay separated; overlapping
fields are not added into an invented billable total. Venice context occupancy,
attachment `file_token_size`, textual discussion of tokens, subscriptions, credits
or costs cannot become consumption evidence. No tokenizer estimate, LLM ranking
or semantic model is required or inferred.

Every report carries eligible populations, units, filters, time/branch policy,
derivations, coverage numerators/denominators and reliability. Unknown model,
Unknown platform, unsupported and ambiguous records remain visible. Missing
data yields unavailable metrics with explanations rather than misleading zeroes.

## Owned persistence and publication

Normal data locations are `%AppData%\ThreadShelf Local Analytics\` on Windows
and `$XDG_CONFIG_HOME/ThreadShelf Local Analytics/` or
`~/.config/ThreadShelf Local Analytics/` on GNU/Linux.

| Owned item | Purpose and removal |
| --- | --- |
| `analytics-owner.json` | Identifies the application's storage boundary |
| `settings.json` | Appearance, language, accessibility, window and last-used directory preferences |
| `state.json` | Source registrations, saved views and analytical annotations |
| `snapshots/<source-id>.json.gz` | Compressed normalized records, precomputed content analysis, source identity, coverage, diagnostics and measured job resources |
| `work/job-<uuid>/` | Temporary capture/ingestion staging; identified interrupted work is reclaimed on startup |

The analytical store is gzip-compressed JSON rather than a writable Reader or
SQLite database. SQLite is used only for an Analytics-owned copied catalog.
Writes use temporary files, flushes and atomic replacement. A source refresh
checks content/snapshot and adapter/content-analysis versions, reuses unchanged
conversation analysis where valid and recomputes when versions or records change.
Source caches never become installation-directory writes. Repeated-prompt keys
are SHA-256 of the full Unicode-NFC/whitespace-normalized prompt, calculated
before desktop excerpting, so equal excerpt prefixes do not falsely match.
Shared text search deliberately uses metadata and the first 8,000 UTF-16 code
units per observed record in both desktop charts and exported reports. This
declared excerpt search scope preserves filter fidelity without shipping full
private text over the desktop bridge. It does not truncate content metrics or
repeated-prompt identity calculations.

Rebuild recomputes owned derived data. Remove Source deletes that source's owned
snapshot and registration. Clear Analytics Caches deletes captured analyses while
retaining registrations/preferences. None follows source references to delete
Reader data. Storage-use totals describe owned metadata and snapshot files.
Removing the entire data directory while Analytics is closed resets Analytics'
preferences and registrations as well; protect or retain reports separately.

## IPC, rendering and reports

The renderer has context isolation, no Node integration and enabled sandboxing.
IPC accepts only a fixed operation list from the application's own frame, with
request size limits and validated arguments. CSP restricts assets to application
resources; permissions, external requests, webviews and new windows are denied.
Archived HTML/scripts are never executed, and conversation content cannot invoke
arbitrary shell commands, filesystem APIs or remote image loading.

CSV neutralizes spreadsheet formula prefixes in textual cells. HTML escapes
source values, embeds the report's favicon/style/charts and uses no external assets or
conversation scripts. JSON preserves structured scope and numerical tables.
Reports are recomputed from completed captured records and applied filters.
Default exports omit conversation text/titles and private source paths. Selected
evidence inclusion is explicit, and the resulting report must be handled as
private material.

The optional server feature is omitted: summary endpoints alone do not provide
the retained original records, detailed coverage or stable multi-page capture
semantics needed here. Local routes are complete independently; no Server tab or
hidden server credential reuse is present.

Large desktop updates cross context isolation as inert serialized JSON, with compact mutation acknowledgements to avoid returning the same captured records twice. The calculation worker retains drilldown identities; default renderer reports omit those repeated lists. Data tables render 100 rows per page while exports preserve the entire applied population.


## Initialization and view continuity

The native window chooses a background from Electron nativeTheme without reading
Analytics settings. A static inline HTML/CSS boot shell is present before renderer
JavaScript runs. The desktop initialization gate waits for the window's
ready-to-show event before opening owned settings/state or loading snapshots.
Bootstrap and mutating IPC await the same initialization promise. Failed
initialization permits a later bootstrap to retry. Restored bounds are applied
while the cover is present; the existing source/network/sandbox protections stay
in force.

Bootstrap and every desktop update carry a monotonic `__updateRevision`. The
renderer queues pre-bootstrap updates, rejects older snapshots, applies the saved
configuration and dataset, and removes the inert cover only after the current
calculation worker report succeeds. Fatal startup/worker errors keep the cover
with Retry. The standalone preview embeds the same static boot shell and renderer.

`view-state.mjs` restores keyed, same-context pane positions, details, form drafts,
focus and caret after DOM replacement. Workspace, dialog target/generation and
evidence request identities prevent restoration into a different selection.
`series-hover.mjs` owns separate in-memory modes per graph and maps pointer
coordinates through SVG transforms; date/value tooltips retain original exact
row indexes. UI state never contributes to analytical metrics or source writes.
