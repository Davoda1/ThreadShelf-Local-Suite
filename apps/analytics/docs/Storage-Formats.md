# Storage formats and legacy compatibility

The public application release is 1.0.0 and uses storage format 2. References to legacy 1.0 and current 2.0 below describe historical storage producers, not the public product version. The root `analytics-owner.json` identity remains `threadshelf-local-analytics:1`. Product, storage, normalized-schema, adapter, text-index and report versions have separate identities. The explicit supported capture readers accept adapter/content producer versions `1.0.0` and `2.0.0`; unfamiliar formats are preserved and reported unsupported rather than relabelled or deleted.

## Namespace and rollback

The positively identified `analytics-v2/` directory contains an independent ownership marker, immutable mutable-state generations, compressed immutable captured blobs, per-source atomic publication pointers, derived indexes, temporary work and an owned writer lease. At first initialization, settings/state are copied into this namespace. Legacy snapshot references record SHA-256 of the exact original compressed bytes. Full legacy text remains in the original snapshot: the GUI's 8,000-character excerpt is a display boundary only.

The original 1.0 ownership marker, settings, state and snapshots are not modified by migration, reindexing, source removal or cache/history cleanup. Those original files remain a 1.0 rollback baseline. The 1.0 executable will see that baseline, not later 2.0 settings, annotations, filters or captures. Subsequent 2.0 changes are not synchronized backwards. Existing exported reports are not rewritten.

Identity preservation includes source, conversation, logical-message, stored-object and segment identities; membership/evidence references keep the existing normalizer identities. There is no title/text-similarity identity migration. Unknown top-level state/settings fields, discovery fields, annotation fields, saved-view extensions and unknown saved filter keys round-trip. Window settings retain unknown fields. New exploration presets are kept separately from ordinary saved views.

## Atomic publication and fallback

A new immutable state/capture file is completed, flushed and closed before the corresponding atomic pointer is renamed into place. The previous state pointer and previous complete capture remain independently available. A failed or aborted publication leaves the previous pointer usable. If a new captured blob or current capture pointer becomes corrupt/unreadable, the protected previous complete capture can be loaded and is explicitly marked stale with a recovery reason. An invalid or unsupported first capture is reported; no missing data is invented.

Protected prior complete captures are retained independently of optional history and may account for additional storage. Source removal/cache clearing publishes a tombstone and clears protected fallback references so legacy or stale indexes cannot resurrect a removed source. Removal preserves the independent 1.0 rollback baseline.

Desktop instances use Electron's existing application-instance mechanism. A positively owned process/token writer lease also prevents two Analytics services from writing the same store. Worker processes are controlled by that owner. Running legacy and current versions as independent writers outside the desktop instance mechanism is unsupported; close one version before starting the other. The writer lease does not claim cooperation from arbitrary legacy CLI programs.

The current lease is `analytics-v2/writer-lock/lease.json`. The complete, flushed,
nonempty directory is renamed exclusively from a recognized owned work job, so
an interruption cannot publish a partial lease. Startup honors earlier valid
`writer.json` leases and detects dead/recycled process identities. Reclaimed
directory leases leave small nonempty records under `retired-writers/`; their
shared destination prevents a competing late reclaimer from moving a new live
lock. They are counted as mutable storage. Graceful close removes only the
matching live lock. Incomplete unpublished work is cleaned through the normal
owned-job recovery, without following aliases or source references.

## Derived text indexes

Startup reads owned snapshots rather than reopening original export sources. New record analyses are generated from complete owned normalized text in a worker. Legacy `contentAnalysis`, machine metric definitions and capture producer tags are preserved. New marked-parser analyses are stored separately under their own algorithm/schema version and exact base compressed snapshot fingerprint. A version/fingerprint mismatch forces an owned-text reindex. The renderer receives the compact new measurements and bounded excerpts; full text stays in worker/owned storage.

A derived-index persistence failure leaves the original capture usable; measurements already computed in the current worker remain available with a persistence warning. The next startup rebuilds the missing index. Rebuild indexes does not recapture a source. Refresh source is a separate operation and continues to obey the source read-only boundary.

## Optional history

History is disabled by default. When enabled, each source retains immutable prior captures, bounded by the configured number (0–20; default 3) and compressed-byte budget (default 128 MiB; maximum 4 GiB). The active usable capture is never evicted by a history limit. The independent protected recovery capture and original rollback baseline are excluded from routine history eviction. Disabling retention stops adding prior captures; refresh with retention disabled removes routine retained history. Explicit history removal never deletes the active capture or the legacy baseline.

History comparisons operate on retained scoped IDs and recorded text/metadata hashes under the supplied filters. Tables identify added/removed/changed records, added/removed conversations and capability changes. They preserve capture provenance and distinguish capture observation time from original activity dates. They cannot reconstruct captures never retained. Source selections refer only to owned snapshot data; no source paths are traversed during history cleanup.

## Storage controls and accounting

Storage usage includes original legacy bytes, all v2 state generations/pointers, immutable blobs (including protected fallback), derived indexes and temporary work. Routine history referenced bytes are reported separately and are not added a second time. Immutable blob garbage collection enumerates positively owned v2 references and deletes only unreachable v2 blobs. Known source references are never used as deletion targets. Legacy snapshots and root files remain part of rollback storage after a v2 clear.

Safety checks reject traversal, links, hard-link file aliases, replaced root identities and cleanup escaping owned work. Recovery cleans only recognized v2 temporary job directories. Analytics issues no mutations to the Reader or original exports; the operating system may independently update access times.
