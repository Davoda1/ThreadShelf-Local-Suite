# Adapter hardening and typed source enrichment

New captures record normalizer `2.0.0` and normalized schema `2`. The supported
producer readers include `1.0.0`/schema `1`; loading an old owned capture keeps
the capture's real producer provenance and established IDs. Storage migration is specified
separately in `Storage-Formats.md`.

| Corrected route | Current adapter behavior | Verification |
| --- | --- | --- |
| JSON-bearing HTML | A block suppresses static fallback only after successful supported normalization. Unrelated JSON-LD remains an inert diagnostic. | Synthetic WebPage plus valid static conversation |
| ZIP dispatch | Require supported v4 manifest structure or actual Dexie v1 chunk structure. An unrelated backupVersion or chunk-like filename cannot discard ordinary members. | Synthetic unrelated manifest and ordinary member tests; supported multipart fixture |
| Gemini HTML | Retain typed prompt-only, feedback, Canvas and unknown source events, including original card index, classification/date uncertainty and provenance. No invented reply or association. | Synthetic paired and incomplete activity cards |
| OpenRouter | Explicit source turns retain named user/thinking/ai fields before generic role fallback, with verified turn association distinct from array adjacency. | Synthetic explicit platform and envelope variants |
| LM Studio | A valid original outer-message date is inherited only when a version lacks a valid version-specific date. Conversation dates never become message dates. | Synthetic epoch-zero, explicit version date and undated message |
| Meta conversion | An explicit Meta archive envelope propagates provenance through Claude-compatible inner syntax. The opaque prior ID namespace is retained. | Synthetic envelope-only conversion |
| Streaming | Original root/wrapper indexes and full source JSON pointers match whole-document parsing, including unsupported neighbors. Segment identity paths remain stable. | Synthetic root/wrapper equivalence |

The normalized `sourceLocation` combines source filename and original root
pointer with a segment's local source path. These private values are evidence
metadata; default aggregate reports must not include source paths.

## Typed enrichment and measurement limits

ChatGPT topology retains all mapping nodes, including non-message roots,
parents, reconstructed children, message-object links, selected nodes, the
source-selected leaf and fallback distinction. Missing parents/cycles make the topology's
completeness false. Aliased mapping representations do not duplicate messages.
`relationship` identifies recorded parents or named source turns; a source
array's `originalOrder` alone is never prompt/reply pairing evidence.

Venice items retain source item/order, scoped call/request/task identity, status,
creation/completion endpoints, source-item interval scope, exact original model,
and supplied context totals/limits. Item creation is not verified execution start:
execution/concurrency lifecycle semantics remain unavailable. Generic
`executionTime`, `totalInferenceTime` and similar scalars remain uninterpreted;
their names do not establish units. Context occupancy is separate from consumed
request tokens. Summaries and original trace text remain separate representations.

Token counters retain their values, zeros, original fields and provenance, but
generic consumer-export fields are `verified:false`/`scopeVerified:false`.
A source-provided `verified` flag cannot audit provider semantics. API token
documentation alone does not validate consumer exports; no billable costs,
inference latency or hidden reasoning are inferred.

Generation settings are narrowly whitelisted numeric/string parameters;
finish/status fields, attachment byte/dimension/hash/page/media-duration metadata
and citation/reference identifiers/spans are typed. Arbitrary profile/account
objects are not mirrored. LM Studio step stats keep a small numeric whitelist
with unverified semantics rather than copying whole statistics/profile objects.

Supported Venice backup inventories retain only safe manifest fields and
permitted archive-member name/size descriptors. Binary media is not opened and
an unassociated container member is not a conversation attachment observation.
Only conversations/messages tables enter the dataset. Other tables are discarded
without analytical counts, names or values. Co-located manifest/descriptor
profile fields are filtered again at the adapter boundary for direct JSON input.

New Gemini HTML event text is bounded to 65,536 Unicode code points per activity,
with original text length and an explicit truncation flag; ordinary retained
query/response text keeps the existing source limit. Repeated cards with distinct
source identities/positions remain distinct; only an exact repeated recorded
activity-ID representation is reconciled.

## Identity audits

The established identity algorithm remains unchanged for existing routes.
The OpenRouter missing named-turn fields case preserves the prior empty-container
segment ID on the primary reply (or prompt if no reply exists) and preserves
prior thinking IDs/logical boundaries; other newly retained fields get separate
identities. `identityAudit` records the actual source-field correspondence.
An envelope-only Meta provider correction retains the previous opaque
`anthropic:` ID prefix and descendant IDs. The provider dimension becomes Meta;
the prefix is not evidence of provider. Old snapshots are never relabelled.

## Evidence and scope

`test/adapter-hardening.test.mjs` contains targeted synthetic regressions and
actual direct-import access instrumentation: all opened handles are read-only,
and no filesystem/handle write operation is attempted. Hard-link aliases,
symlinks and archive symlink members are refused. Hash equality is supplementary
evidence rather than the sole source-safety check.

Encrypted Venice backups, byte-split volumes, direct 7z/RAR export archives,
unsupported Dexie value encodings and nested ZIPs remain unsupported. Reader's
separate 7z/ZIP storage capture still uses Reader's bundled codecs.
