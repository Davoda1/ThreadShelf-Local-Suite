> Current adapter hardening and audited format changes supplement these route and limit definitions; see [Adapter hardening](Adapter-Design.md).

# Direct export ingestion

`ingestExports(paths, {sourceId, collectionId, signal, onProgress, limits})`
returns `{sourceId, conversations, diagnostics, files, bytes}`. Conversations are
the rich adapter schema. `files` lists physical sources with path, size, SHA-256,
status and retained conversation count. Unsupported files or members have
explicit diagnostics; cancellation rejects with `AbortError`.

The direct-source route reads files and recursively inspects extracted folders.
It refuses Reader profile roots and descendants using name inventories only;
Reader settings, appearance, reading state, activity/cache and SQLite files are
never interpreted as direct exports. The Reader-source route is separate.
Linux file opens are anchored through directory descriptors with `O_NOFOLLOW`.
All platforms reject observed symlinks/junctions, compare handle/path identity,
size, ctime and mtime before/after reads, and discard changed source file results.
No source file, sidecar, temporary extraction, or lock is written.
Direct hard-linked sources are refused because writable aliases cannot be safely
scoped. ZIP symlink members are refused even though no members are extracted.

Inputs include strict JSON in UTF-8/16/32, BOMs, inert JSON-bearing HTML scripts,
strict `jsonData = [...]` literals, static message markup, Gemini Takeout HTML,
ZIP/ZIP64 and extensionless extracted documents. Scripts are never executed;
URLs and attachment/media references are never fetched. ZIP entries are parsed
in memory with CRC checks, duplicate/unsafe path rejection and size/depth bounds.
Nested ZIPs are not recursively interpreted. Unsupported 7z/RAR export archives
produce diagnostics; Reader compressed storage uses an independent capture path.

Large UTF-8 arrays and `conversations` wrappers are framed in two passes: the
whole document is validated before any conversation is retained, then provider
records are normalized individually. Providers joining activity records or
owner/message tables require bounded whole-document processing. Default limits
are 512 MiB per whole document or record, 256 GiB per streaming/expanded input,
1 TiB per ZIP, 100,000 filesystem/ZIP entries, two million JSON records, depth
64 (JSON depth 256), and four million JSON containers. Gemini HTML retains the
audited 64 MiB, depth 160 and one-million-node parser limits.

Venice v4 parts must be complete ZIP containers selected together. Manifests
must match, every numbered Dexie v1 chunk must occur exactly once, database
versions must agree, conversations/message IDs must be unambiguous, and every
message must have an associated conversation. Incomplete, mixed, encrypted and unsupported
Dexie backups contribute no conversations. Binary media is never expanded.
Unrelated manifests with a backupVersion field do not trigger Venice routing;
the supported manifest shape or actual Dexie v1 chunk shape must be established.
Only safe manifest fields and permitted media-member descriptors survive into
Analytics; unrelated profile tables/fields are discarded before persistence.

Only successfully normalized supported JSON blocks suppress static HTML fallback.
Gemini HTML additionally retains bounded typed prompt-only, feedback, Canvas and
unknown source events, with uncertainty/truncation disclosed. Static HTML retains
supplied parent/status/date/model and media dimension/size descriptors without
loading media or executing archived content. Whole and streamed documents retain
the same original root indexes and source pointers.
