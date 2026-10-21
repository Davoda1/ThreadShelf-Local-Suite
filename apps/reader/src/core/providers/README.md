# Bundled native provider parsers

These modules are bundled with the desktop app; a ThreadShelf server and a TypeScript runtime are not required.

- `threadshelf-parser.mjs`: ThreadShelf 1.2.3 `src/parser.ts`, type annotations removed once with Node's type-stripper. MIT license retained in `ThreadShelf-LICENSE.txt`. Detection, active-branch traversal, and Harmony control-token handling are reused. The desktop normalizer adds source indexes, raw records, reasoning channels, tool/system text, and full original-text whitespace retention.
- `gemini.mjs`, `meta.mjs`, `venice.mjs`, `common.mjs`: AI Export Converter GUI 1.2.1 MIT modules. License in `AI-Export-Converter-LICENSE.txt`. Gemini parser changes retain original parsed activity cards and source card indexes; Venice ZIP reader adds cooperative cancellation and entry-count bounds. Export-only functions are retained for regression compatibility but not exposed by the desktop bridge.

All fixtures under `tests/fixtures/imports` are the upstream explicitly synthetic, anonymized parser snapshots. No private account exports are shipped.

## Supported import surfaces

Native ChatGPT mapping JSON; Anthropic/Claude top-level and project conversations; Google AI Studio chunkedPrompt and Imagen histories (including extensionless files); ThreadShelf's OpenRouter browser export; LM Studio selected message versions and multi-step reasoning; Grok account exports; Venice console `venice-chat-history` and unencrypted native backup v4 ZIP containers; Gemini Takeout/My Activity HTML or JSON; Meta Accounts Center labeled transcripts.

Compatibility inputs include AI Export Converter Venice Grok-compatible and Meta Anthropic-compatible JSON, Gemini Googlefy folders/ZIPs, ThreadShelf CLI bare turn arrays and thread objects, and ChatGPT Export Processor `conversations-index.json` and `chat-index.html`. The latter contains strict JSON in `jsonData`; the importer parses that JSON literal without evaluating any JavaScript or applying the converter transformations a second time.

User-selected files and folders are read in place. ZIP entries are never extracted to disk. ZIP CRC validation, duplicate-name/path rejection, entry/depth limits, expanded-size limits, regular-file checks, and symlink skipping are applied. Default input ceiling is 512 MiB per JSON/converted HTML, 4 GiB per ZIP, and 2 GiB of selected expanded ZIP data; native Gemini HTML has the existing 64 MiB parser limit. Size overruns and unsupported inputs produce source-specific diagnostics; later selected files continue importing. Cancellation stops between filesystem reads, entry chunks, and conversation yields. CPU-bound JSON parsing is performed in the service worker, so it does not block the interface.

## Deliberate boundaries

- ChatGPT displays the active branch, with every alternative node preserved in `raw.mapping`. LM Studio displays the selected version and retains all versions in raw source.
- Original per-conversation records are retained, including unfamiliar fields. Unsafe integer IDs are preserved as exact decimal strings for JSON storage. Tool/system records are labeled by `source_role`, while thinking and answer remain separate turns.
- Conversation indexes retain empty source slots; split thinking/answer turns can share an index with different roles. Gemini chronological reading order retains original activity card indexes.
- Binary media remains in the original export; image/audio/video parts with no text display attachment markers. Referenced media is not silently downloaded. Native Venice internally encrypted payloads require an unencrypted export; ZIP passwords are not a substitute for Venice payload decryption.
- Gemini activity cards missing a deterministic conversation relationship are diagnosed; Canvas activities are saved as separate inert records. Unrecognized HTML is never opened as a web page.
- Undocumented export schemas may evolve. Unsupported future shapes are reported, not claimed to be universally supported.
