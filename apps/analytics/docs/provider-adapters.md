# Provider adapters and counting provenance

New captures use adapter `2.0.0` / schema `2`; supported legacy captures retain `1.0.0` / schema `1` and their actual producer provenance. The registry in `src/core/adapters.mjs` lists recognizers, native formats, normalizers and descriptions. `normalizeConversations` is independent of Reader storage ownership. The normalizer's only external module operations are deterministic hashing and pure transcript helpers. It does not perform filesystem or network I/O. See `Adapter-Design.md` for the targeted corrections, typed additions, identity audits and current verification scope.

| Adapter | Recognized retained or direct shapes | Specific interpretation |
|---|---|---|
| ChatGPT/OpenAI | Mapping objects; arrays/indexed `conversations`; Reader retained originals; JSON-bearing indexed HTML via ingestion | Node/message identities; parent-derived children; selected path and all retained alternatives; thoughts, recap, text, multimodal and explicit tool-recipient records |
| Claude/Anthropic | Single/array/wrapped `chat_messages`; project `messages` with `content.content` / `contentBlocks` | Original object and block boundaries; thinking, redacted thinking, tools and response text separately; assembled fallback response only when no source text block exists |
| Google AI Studio | `chunkedPrompt.chunks`; `imagenPrompt.imagenTurns`; extensionless files | Contiguous role groups provide explicitly derived logical prompt/response groups; chunks remain individual original objects; image output remains attachment metadata |
| Gemini | My Activity JSON arrays/`activity`/`activities`; supported Takeout outer-cell HTML; retained converter chunks | Source activity-event granularity; incomplete events do not acquire invented responses; day-only dates remain calendar dates; no model inferred |
| Grok | Native account envelope with `conversations`, `projects`, `tasks`, `media_posts`; individual response wrappers with declared provenance | Response/trace identities; Mongo dates; explicitly converted Venice provenance takes precedence. An unlabeled compatible conversation wrapper keeps Unknown platform |
| OpenRouter | Explicit OpenRouter platform/provider provenance plus `turns` | Named user/ai turns and role messages remain separate; recorded turn association is pairing evidence, array position is not. Generic token semantics remain unverified |
| LM Studio | `messages[].versions`, selected version and execution steps; model-specific empty chat config | Every retained version, selected status, shared message identity and version-specific source object; content versus technical execution steps |
| VeniceAI | Console `owners[].conversations` formatVersion 1; conventional and agent messages; explicit Venice-to-Grok conversion; v4 multipart Dexie ZIP backup through ingestion | Original agent output items reconciled with display `agentSegments.raw`; independently scoped calls/outputs/search events; no addition of context occupancy into consumed usage |
| Meta AI | Native `label_values` transcripts; explicit Meta-to-Anthropic transcript archive | Unindented `You:`/`Meta AI:` speaker lines outside Markdown fences; conversation-label date kept separate; exact model remains unknown; account/transcript identity matches the Reader converter |
| Normalized / converted | ThreadShelf named turn fields, bare turn arrays, surviving server-normalized records, supported static HTML and generic role messages | Original data limitations remain explicit; display copies are not counted when a retained original is understood; missing logical message boundaries stay null |

Ingestion supports Reader-compatible JSON encodings, inert HTML, ZIP/ZIP64 and extracted directories. See `direct-export-ingestion.md` for source limits and container rules. Direct 7z/RAR export inputs remain optional and are not implemented. This does not restrict mandatory Reader 7z/ZIP object capture.

## Counting units

- `objectId` identifies an original stored message or chunk/version object. Several text segments can share it.
- `logicalId` groups a trustworthy source message, or a documented derived contiguous chunk group. It is null where only an activity event or normalized segment survives.
- `segmentId` is separate from the source object and identifies text/content blocks.
- Event identities and call associations are distinct from message identities. Repeated agent display objects do not create additional invocations.
- A tool call, the call's output and a web-search event remain three different source categories; their counts are not interchangeable.
- Empty source objects remain visible, including empty ChatGPT `thoughts` arrays. They do not become observed zero-length traces.
- Explicit ChatGPT thought entries preserve `reasoningRepresentation`: full exported trace, summary-only, or unavailable. Summary-only text is the recorded summary, never JSON serialization of the entire source object.
- A redacted block carries no artificial placeholder text for text-volume metrics. It is marked `observed:false`.
- Interface role colors do not change any counting unit.

## Branches, versions and identity

ChatGPT children are reconstructed from retained parent links even if `children` arrays are absent. A valid `current_node` defines the selected path. If absent or invalid, the latest dated retained leaf is an explicitly diagnosed fallback. Cycles and missing parents are diagnosed. Maximum/selected depth is the number of retained mapping nodes along the parent chain, including a non-message root; cyclic depth is unavailable.

LM Studio versions share a logical source-message boundary but have distinct object/version identity. Alternative versions remain selected=false. Venice child variants are preserved as alternatives; original output items keep the enclosing source message object identity.

Conversation IDs include source instance, platform and explicit account scope. No text-similarity merging occurs. Identical content representations merge collection memberships. Conflicting versions with the same recorded identity remain reviewable as separate export versions, with all analytical record identities rebased to the version scope. Explicit original IDs stay unchanged. Native and explicitly converted Venice representations preserve account/identity and a canonical original-content hash. Native and converted Meta representations use the Reader-compatible transcript/account hash.

## Dates and models

Every message/segment timestamp has a source field path, precision and timezone assumption. Epoch zero is valid. Invalid calendar/clock dates stay undated with diagnostics. Day-only source dates retain their calendar string. Offset-less source datetimes are interpreted as UTC and clearly marked as an assumption. Millisecond projection is retained alongside the original supplied timestamp value. Conversation creation/update dates never fill missing message dates. Filesystem times, import times and Reader operation timestamps are not message dates.

Models originate from explicit message/item metadata or an explicitly recorded conversation default. Inheritance is marked. Model labels and IDs are retained independently when both exist. A platform display label such as Meta AI is not treated as an exact model. No model or developer identity is guessed from text, collection name or an adjacent segment.

## Usage, duration and unavailable data

Interpretable request usage accepts explicit standard token fields from supplied `usage` records. Input, output, cached, reasoning and total fields remain separate; total is not constructed by summing potentially overlapping fields. Venice `context_metadata` is preserved as context occupancy, separate from consumption. Attachment `file_token_size` is metadata, not usage.

Validated event start/completion timestamps can produce an event duration. Explicit `duration_ms` preserves the original recorded scope. Numerical `Thought for …` recap labels can yield a recap duration with text provenance; vague labels yield none. Neither recap duration nor user-to-assistant timestamp difference is labeled complete inference/compute latency.

Capabilities are detected from actual records. Coverage, diagnostics and per-format limitations accompany every conversation. A provider name does not promise reasoning, usage, attachments, precise timestamps or tools.

## Reproducible verification

`test/adapters.test.mjs` and `test/fixtures/provider-fixtures.mjs` use wholly synthetic records. They cover every adapter family, mixed collections, models, selected/all branches, missing links/cycles, versions, agent mirror deduplication, scoped calls, redaction, day-only/epoch-zero dates, unknown provenance, normalized fallbacks and export identity conflicts. `test/ingest.test.mjs` covers file/container routes independently. Private source samples are never distributed with these fixtures.
