# Search in ThreadShelf Local Reader 1.1.0

Local search runs against the local archive. ThreadShelf Server mode searches the active server through the server API; the two sources never silently substitute for each other.

## Which search needs a model?

The search drawer opens beneath the compact Search row. Click that row to expand or collapse it; Ctrl+K (Command+K on macOS source builds) opens it and focuses the input. A collapsed drawer keeps the active query and result count visible. Collections remain available above the drawer. Local / ThreadShelf Server is selected in the application header; the server address belongs in Settings → Sources.

| Source | Search choice | Scope and requirements |
| --- | --- | --- |
| Local | Quick filter | Conversation titles, contents and source filenames. No model. Returns conversations. |
| Local | Text search, Exact phrase, Fuzzy search | Local archive text. No model or Ollama. Returns matching passages. |
| Local | Local meaning | Reader's built-in embedding model, explicitly downloaded and indexed once. No Ollama. |
| Local | Hybrid search | Combines ranked text and the built-in meaning model. No Ollama. Reports text fallback if the model/index is unavailable. |
| Local | Ollama meaning | Selected embedding-capable model on a reachable Ollama service. Separate from the built-in model. |
| ThreadShelf Server | Quick filter | Filters the server's conversation titles. Opening a result can also highlight the same words in the conversation contents. No Reader model. |
| ThreadShelf Server | Server text | Complete live message-text scan on an unchanged server; ranked indexed passages when the optional pagination extension is installed. No Reader model or Ollama. |
| ThreadShelf Server | Server meaning | ThreadShelf's own semantic search. The server supplies the model and index; no Reader model or Ollama connection. |

“Quick filter” replaces the old “Titles only” label without changing the useful filtering behavior. The two source modes have different filter scopes, which the interface explains.

## Server results beyond 50

Reader limits calls to the original ThreadShelf search API to 50 ranked passages; that API has no result cursor. Adding an ignored offset would repeat those same results. Reader checks the optional pagination capability when a new search begins and chooses among three paths:

- **Server text, unchanged server:** Reader reads the active server's conversation list and normalized messages through the existing server API. It matches a case-insensitive literal substring and continues until there is another page or the source is exhausted. Each result is a matching message with the original turn index; results follow the server's conversation/message order. The first page does not require scanning the entire archive. No conversation is imported into Local mode, and no model is needed.
- **Server text/meaning, extension enabled:** Reader detects the included server pagination extension and follows the extension’s result cursors. Each server request remains at most 50 indexed passages, while the selected desktop page may combine several requests. Meaning continues to use the server's own embedding model and index.
- **Server meaning, unchanged server:** The original top-50 set remains available. The interface explicitly shows **Server search setup**, which explains how to enable pagination. It does not silently substitute text search, a Reader model or Local conversations for semantic results.

Use Settings → Sources & files → **Server search setup**, or the setup button below an older server's Meaning results. **Open setup files** opens the bundled `server-support` folder. The bundled README links to the suite's [ThreadShelf 1.3.0 patcher and installation instructions](../../../server-patch/README.md). The patcher supports only the exact upstream baseline documented there. Apply the extension on the computer hosting ThreadShelf, rebuild/restart that server, then refresh the Reader search. The desktop application does not modify a remote server itself. No database migration or re-indexing is required by the extension.

In continuous-list mode, **Load more** fetches subsequent matches. Page mode supports Next and Previous. A **+** after the count means the total is not yet known; it becomes exact when scanning finishes. Cached pages and query sessions are temporary memory state, separate from the Local archive. Refresh starts a new live search. Failed or cancelled reads do not mark the remaining source exhausted; retry resumes the requested page, preserving already displayed results. Large, sparse queries may need to inspect many conversations; progress and cancellation remain available.

## Local search behavior

| Mode | Behavior | Setup |
| --- | --- | --- |
| Text search | Streaming passage scan with global BM25-style relevance, title and exact phrase boosts, and stronger ranking when more query terms match | Works immediately |
| Exact phrase | Case- and accent-insensitive literal substring matching in message text and conversation titles | Works immediately |
| Fuzzy search | Ranked word matching with one-character insertions, deletions, substitutions, or adjacent transpositions for words of at least four characters | Works immediately |
| Local meaning | Multilingual similarity using a local embedding model, including matches without the same wording | Explicit model setup, then Build / update index |
| Hybrid search | Reciprocal-rank fusion of text and semantic results | Same setup as Local meaning; text results remain available if the model or index is unavailable |
| Ollama meaning | Semantic similarity using an installed embedding-capable model served by Ollama on the local computer or private LAN | Running Ollama, installed embedding model, configured address and selected model |

For ranked text and fuzzy searches, surround a phrase with double quotes to require it, and prefix an unwanted word or quoted phrase with `-` to exclude it. For example:

```text
"keyboard layout" USB -piano
```

Collection, provider and role filters restrict the passages included in ranking. The Assistant role selects archived `ai` messages; original role values and source turn anchors are preserved. A result retains the exact original message index, including gaps in source indexes. Snippets are excerpts for inspection; they never replace the stored original message.

Version 2 has no 20,000-candidate cutoff. Every eligible passage is considered, and the search service returns an exact matching total when it finishes. Ranked text and fuzzy queries use at most 40 distinct positive word tokens; ranked Local search queries are limited to 4,000 characters (Quick filter accepts up to 8,192).

The desktop retains the existing **top 1,000 Local results** window. Page mode and continuous-list mode navigate within that returned window. When more passages match, the interface reports the displayed and matching counts; narrow the query or collection to inspect a different set. The search service also supports `limit` (1–1,000) and `offset` for programmatic pagination, but the desktop does not automatically fetch later Local windows. Server continuation follows the separate behavior described above.

## Streaming search and working space

Reader keeps compressed searchable strings and original conversation-creation
metadata in the disposable `search/text-v1.sqlite` sidecar. The first query or
explicit index preparation reads changed conversation content once. Later queries
scan bounded compressed text blocks without reopening the original export objects.
Imports update changed entries; removed entries are discarded. Local meaning
indexing prepares the same text cache. The archive schema is unchanged.

The Local period selector is All time, Last week, Last month, Last 3 months,
Last 6 months, Last year, Last 2 years, or Last 5 years. Calendar-month boundaries
are clamped to the last valid day, and ranges end at the query's start time.
Creation comes from original export metadata, never the import time or first
message. Unknown dates match All time only; eligible conversations retain all
messages regardless of each message's date.

Search options can be saved without searching. Local and Server drafts remain
separate, and opening Search & Model preserves the current options draft.

Ranked text computes term frequencies and match statistics across the complete filtered scan, then scores all matching candidates together. Title occurrences have triple word weight, and phrase, title and query-coverage boosts are retained. Ranking does not merge unrelated per-block BM25 scores. Hybrid uses reciprocal-rank fusion over the complete text and semantic rankings before selecting the requested result window.

Candidates, excerpts and ranking statistics spill into an owned temporary SQLite database instead of an all-passages JavaScript array. The configured ceiling is **512 MiB**. On completion, cancellation or an error, the query closes this database and removes the temporary directory. If the candidate workspace fills or the temporary volume is exhausted, the query reports an error instead of silently returning an incomplete ranking. Narrow the query or free temporary disk space before retrying.

The 512 MiB ceiling applies to the candidate database, **not** to combined application RAM or all temporary disk usage. SQLite sorting, the expanded catalog, content/model caches, codec buffers and other active work require additional resources. Semantic block size and the content-cache budget are separate limits. A very large selected message or conversation also needs memory to reconstruct the contents; lazy storage does not guarantee constant total memory.

A first query still needs to prepare missing text blocks. Subsequent broad
queries must scan eligible compressed searchable text, so a large archive can
still take time. After 45 seconds, Local matches append provisionally; final
ranking occurs once the scan completes. Cancel preserves visible incomplete
results, while Clear and a new query reset them. The progress estimate reflects
known processed work and is not a completion-time guarantee.

Completed query pages reuse an in-memory result snapshot within the existing
1,000-result display window. Expired snapshots or archive changes restart from
page one so old and new rankings cannot mix. Database management and compression
conversion cancel and drain active Local searches before changing resources;
independent Server searches remain available.

## Local semantic model

The optional model is `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, the same model family used by ThreadShelf. It runs on the CPU through Transformers.js and ONNX Runtime, with quantized weights and 384-dimensional normalized embeddings. A generative LLM and Ollama are unnecessary for this mode.

If the native ONNX binding cannot load—for example, because a Windows computer lacks the optional VC++ runtime—the app automatically uses the bundled portable CPU/WebAssembly engine. This uses the same tokenizer, model weights, mean pooling and normalization. It does not require another model download or a separate runtime installation. The portable engine may index more slowly.

Setup contacts the model host to download the tokenizer, configuration and quantized weights, verifies a real embedding, and records readiness. This is an explicit action; ordinary import, text search and application startup do not download a model. Allow roughly 120–150 MB for the model cache, plus space for the archive and semantic index. Download size can differ as upstream model files change.

After setup, loading and inference use local files only. Long messages are split into 500-character windows with 100-character overlap so content near the end can also be retrieved. A message appears at most once in semantic results, using the best matching window and original turn index. Semantic scoring streams independently compressed vector blocks, consults catalog metadata for filters, and loads message text for the selected result excerpts. It does not expand the complete vector index into a persistent working database.

Each vector block expands to at most **4 MiB**. This is a serialized payload limit, not a bound on all JavaScript/native allocations while decoding or scoring it. A compact semantic SQLite catalog stores model/revision information and references to those blocks. Compressed vector bytes use the selected High (7z/LZMA2) or Faster (ZIP6) profile. Changing compression converts existing semantic metadata and all live vector blocks along with the archive, without invalidating an otherwise current index.

Indexing scans the archive and writes new immutable blocks. Unchanged chunks from the previous completed index reuse their embeddings. New metadata is published only after all chunks are ready and the source revision is unchanged. Cancellation or failure preserves the previous completed generation; unfinished new work is not treated as a current index or promised as a resumable partial index. Unreferenced objects can be reclaimed by storage maintenance. During built-in setup or indexing, Local meaning and Hybrid queries report a text fallback without terminating the active model task.

Inside the application profile, model files remain under `search/models`. Persistent semantic metadata snapshots are managed under `local-storage-v2/snapshots`, and vector blocks under `local-storage-v2/objects/vector-<encoded-sha256>.7z` or `.zip`. An optional working `vectors.sqlite` in the owned temporary Local directory contains metadata and references, not all expanded vector values. There is no persistent version 2 `search/vectors.sqlite` vector store. No separate home-directory model cache is used. Model download temporary files are cleaned after cancellation or completion. See [Storage.md](Storage.md) for platform profile paths, backup and cleanup behavior.

Importing or changing conversations invalidates the semantic index. Run indexing again to refresh it; unchanged passage vectors are reused. Until then, Semantic and Hybrid return text results with an explicit notice. Empty or removed conversations are removed from the vector index on the next successful refresh.

## Optional Ollama

Settings → Search provides the Ollama setup controls. The usual local address is `http://127.0.0.1:11434`.

1. Detect the service and installed models. If Ollama is installed on this computer but stopped, use **Start installed Ollama**. Reader does not install Ollama or start services on another computer.
2. Select an embedding-capable model. Known chat-only models are excluded from the search-model chooser. Older services that omit capability metadata can still be checked with an actual embedding test.
3. If no compatible model is installed, explicitly download a named model through the configured Ollama service. Download progress and cancellation are available; there is no automatic model pull.
4. Test the selected model, then save settings. The test sends only a synthetic sentence, never archive contents.
5. Choose **Ollama meaning** in Local search. The first search builds the archive's embedding index.

This shares the converter's discover/start/list workflow, but search needs an **embedding** model. A chat model used for re-titling is not automatically suitable. Ollama is not needed for Server search, local text search, or the Reader's separate built-in meaning model.

The first Ollama search builds embeddings for the local archive, sending message chunks to the configured Ollama instance. Later searches reuse vectors. Selecting a different model, replacing a model (the reported digest changes), changing the address, or changing the archive causes the corresponding index to refresh. The current `/api/embed` endpoint is used; the legacy `/api/embeddings` endpoint is tried when the newer endpoint is unavailable. Archive data and all cached vectors remain in the application user-data directory. The external Ollama service manages the installation and model files in the configured location; Reader does not relocate them.

Ollama URLs are limited to loopback, private LAN addresses and local hostnames. Redirects are rejected. This integration does not call Ollama cloud services.

## Verification

Run the focused automated checks with:

```sh
node --test tests/search.test.mjs tests/segmented-search.test.mjs tests/search-lifecycle.test.mjs
```

They cover text ranking, phrases/exclusions, typo and accent matching, filters, sparse source anchors, the metadata-only archive integration, global ranking beyond 20,000 matches, result windows, exact hybrid fusion, bounded vector packs, both compression conversions, unchanged-vector reuse, corruption fallback, workspace exhaustion, cancellation and revision changes. Lifecycle tests check that conversion waits for aborted Ollama indexing cleanup and that manager mutations follow the durable checkpoint of a successful Ollama search. Modern and legacy Ollama HTTP contracts use controlled fixtures; these checks do not install or pull a real Ollama model.

See the [suite verification record](../../../maintainer/VERIFICATION.md) for the release's actual results, skipped checks and platform limits.

The optional real-model test requires an already downloaded model cache and never downloads anything:

```sh
THREADSHELF_MODEL_CACHE="/absolute/path/to/ThreadShelf Local Reader/search/models" node --test tests/semantic-offline.test.mjs
```

PowerShell:

```powershell
$env:THREADSHELF_MODEL_CACHE = Join-Path $env:APPDATA 'ThreadShelf Local Reader\search\models'
node --test tests/semantic-offline.test.mjs
```

That test restarts the model in separate workers, makes every network fetch throw, and verifies that English and Hungarian food queries rank a food passage above unrelated computer and astronomy passages. It also forces a native binding load failure, verifies automatic portable-engine fallback, and checks that the portable engine’s embeddings remain numerically compatible with the native engine.
