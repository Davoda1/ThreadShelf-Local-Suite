# Analytics 1.4.6 processing and compatibility

Analytics captures a coherent committed Reader publication through read-only access. Conversation normalization runs one document at a time and writes an owned SQLite capture transactionally. A failed or cancelled capture leaves the last complete result available. Logical change detection excludes checkpoints, recompression and nonanalytical housekeeping while retaining genuine conversation and collection changes.

Native analysis selects and reduces records on disk. Exact tables, distributions, contributors and history populations remain complete; the renderer requests bounded pages and chart views. Whole-result CSV, JSON, HTML and TSV exports stream from disk. The worker heap ceiling remains **2 GiB**. Archive growth consumes disk and processing time rather than one growing JavaScript dataset; individual-document, integrity and nesting safeguards still apply.

The public application retains complete text in a separate owned body store. Evidence keeps safe Markdown/code rendering and copying. Search preserves the existing first-8,000-UTF-16-unit excerpt semantics and the saved full-text search scope. Aggregate exports keep their privacy defaults; explicit evidence exports can include retained text. Historical evidence resolves its pinned capture rather than a newer source revision.

Compatible completed public gzip captures migrate incrementally without re-normalizing identities or requiring the original source. Settings, registrations, saved views, annotations, history policy and recoverable captures remain. Offline reindexing uses owned text. A statistics-only capture cannot invent missing text; refresh its source to obtain text where needed. Do not run independent writers against the same profile concurrently.

The existing application layout and plain operating-system title remain. Native long-result controls page through complete results; complete-table export writes TSV rather than constructing a giant clipboard string. Startup errors retain a bounded code/message and Retry recalculates a missing report even when the capture has not changed.

Public product version is **1.4.6**. Persisted schema, adapter and algorithm identities are independent of this product number. The suite manual content remains 1.4.5 for this fix release; the suite release contains the current illustrated manual and authoring sources.
