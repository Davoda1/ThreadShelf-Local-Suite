# ThreadShelf Local Reader architecture

All persistent application files live beneath one Electron userData directory: %AppData%/ThreadShelf Local Reader or $XDG_CONFIG_HOME/ThreadShelf Local Reader (default ~/.config/ThreadShelf Local Reader). Working SQLite catalog/index databases and their WAL/SHM files are private temporary files; compressed snapshots, immutable content objects and durable redo records under userData are authoritative. Bodies are decoded by demand, without extracting every stored conversation to disk. Local and server modes have distinct collection selection, identity and reading state. Server mode always reads the configured live HTTP API, never silently substitutes local data.

## Revision 2 compatibility boundary

The durable `threadshelf-local-storage-v2` format (version 2), catalog schema 3,
conversation objects, reading identities and semantic publication format remain
unchanged. `extended-preferences-v1.json` stores new preferences outside strict
legacy files. `search/text-v1.sqlite` is disposable compressed searchable text;
Activity's disposable cache normalization version advances independently.
ThreadShelf Local Analytics reads the unchanged authoritative archive.

## Modules

- src/core/conversation-date.mjs: shared original creation/update timestamp normalization. Never use catalog import times as conversation creation dates.
- src/core/search-text-index.mjs: transactional incremental compressed text cache, bounded blocks, source creation filters and checksum recovery. SearchService owns session identity, progress and final ranking.
- src/core/extended-preferences.mjs: validated per-source search preferences and default-Off analytics bar styling, in a separate versioned JSON envelope.
- src/core/importers.mjs + stream-json.mjs: asynchronous export import and bounded UTF-8 streaming JSON events. Recognized conversation arrays/containers validate syntax and ZIP CRC before yielding normalized records. Random-access ZIP/ZIP64 reads do not load the full archive. Whole-document adapters retain explicit limits. Provider parsers are bundled; no server required.
- src/core/archive.mjs: ArchiveStore operates on the mounted temporary catalog and separate ContentStore references. Owns SQLite transactions, the explicit collection catalog, immutable Local identities and replayable mutations. collections({includeEmpty}) returns [{id,name,count,turnCount}]; the reader excludes empty collections while the manager includes them. files returns {files,total,page,pageSize}; thread reconstructs only the requested document and returns complete summary+turns; passages retains original turn indexes. Listing summaries does not decode all bodies. prepareMutation/previewMutation/applyMutation separate validation, count/conflict preview and idempotent application. Service-mediated writes are durably recorded before success.
- src/core/storage.mjs: CompressedStorage owns the profile lease, disposable working catalogs, verified 7z/ZIP snapshots, checksummed gzip redo, full-profile conversion, consolidation, backup and restore. The new root is local-storage-v2; v1 files are left intact and not mounted automatically. See docs/Storage.md.
- src/core/content-packs.mjs: ContentStore writes immutable SHA-256-addressed compressed objects and checks both compressed and expanded bytes. Independently decodable blocks cap ordinary decoder/cache units at 16 MiB. Header/source and turn groups use separate references. A 256 MiB default LRU bounds retained decoded blocks; one requested large JSON record and renderer memory can exceed the retained-cache bound.
- src/core/codec.mjs: pinned bundled 7-Zip 26.03 engine for real 7z/LZMA2 and ZIP level 6 output; direct executable invocation, bounded decoded output, predictable archive member name, cancellation and integrity checks. No global 7-Zip dependency. See vendor/7zip/README.md and provenance.json.
- src/core/manager-reading.mjs: browser-safe Local ID keys and reading reconciliation for rename, move, coalescing, copy and deletion. Server reading entries pass through unchanged.
- src/core/search.mjs: SearchService({store,dataDir,onProgress}), search({q,collection='all',mode='keyword',provider,role,limit=100}), setupSemantic({signal}), indexSemantic({signal}), status(), ollamaModels({url}), searchOllama(options). Modes keyword/exact/fuzzy/semantic/hybrid. Results {results:[{conversationId,turnIndex,role,text,score,title,collection,provider}],total,notice?}. Supports local multilingual embedding model and optional Ollama. Model files remain persistent under dataDir/search/models; the derived vector SQLite file is mounted lazily in temporary storage and snapshotted independently. Archive revision/model metadata marks stale indexes.
- src/core/server.mjs and service.mjs: server adapter, dispatch, import orchestration, settings and reading state. ServerSearchPager supplies desktop pages through the optional cursor API or a live text scan. Legacy semantic requests remain bounded to 50 and explicitly require the server extension for further pages. Network search requests never exceed 50; collection copying is independent.
- src/core/ollama.mjs: discovery of an installed local Ollama executable and explicitly requested service startup. SearchService owns capability detection, synthetic embedding tests, model download progress/cancellation, and archive embedding search.
- src/desktop/main.cjs + preload.cjs: Electron process, tightly scoped IPC, native file dialogs, window bounds and app-data paths.
- src/ui/app.js + style.css + i18n.js + index.html: desktop shell, controller, settings, collections, source transfer and localization.
- src/reader/* + public renderer assets: complete port from Reader 3.1.1/Plus5, including navigator and reading interactions through adapter.
- scripts build/package/docs: reproducible build and packaging commands, portable/source archives, licensing and verification evidence.

## Conversation contract

Normalized conversation input: {collection?,provider,sourceFile,conversationKey,title,turns,raw?,sourceIdentity?,lastTurnAt?}. turns retain original source ordering and indexes: [{user:string}|{ai:string}|{thinking:string}] with optional model,createdAt,turn_index. Preserve extra fields and original source records. Empty text must not renumber later source turns. Summary: {id,collection,sourceFile,conversationKey,title,provider,turnCount,lastTurnAt?}. Server id is based on canonical server URL+collection+full source path+conversation key. Native imports deduplicate deterministically. Reimport must not multiply exact copies. Search results point to exact original turn indexes.

## Renderer bridge

Revision 2 adds `search.prepare` and confirmed `ollama.delete {url,model}` after UI confirmation.
Local search accepts a creation `period`, `searchId`, and paged `searchSession`.
Progress for a slow Local query uses `phase: 'search-results'` with appended
`results`, `provisional: true`, and the exact `searchId`; stale events are ignored.
Final response replaces provisional order. Expired or changed sessions restart
at page one before continuous scrolling can append.
UI receives window.desktop.invoke(action,args), window.desktop.onProgress(callback), window.desktop.onMenu(callback). Progress {operation,phase,current?,total?,message?}. All methods promise; errors reject with actionable Error. DOM is isolated and has no Node primitives.

Actions:
- bootstrap -> {settings,reading,dataDir,version:'1.0.0',searchStatus}
- settings.save {values} -> settings (merge validated keys). Legacy preferences stay in settings.json; new drawer preference searchPanelExpanded stays in interface.json. Both schema-1 files are under the same dataDir. New uiPalette/codeTheme preferences use appearance.json, preserving the strict 1.1.0 interface reader too. Bootstrap and save return all three validated snapshots merged. Legacy files keep their previous schema and keys.
- collections {mode,serverUrl?} -> {collections:[{name,count}]}; server call may fetch summaries to determine nonempty.
- files {mode,serverUrl?,collection:'all'|name,page:1,pageSize:50,sort:'updated'|'title'|'length',q?,provider?} -> {files,total,page,pageSize}
- thread {mode,serverUrl?,id?,collection,sourceFile,conversationKey} -> normalized thread
- search {mode,serverUrl?,q,collection,searchMode:'keyword'|'exact'|'fuzzy'|'semantic'|'hybrid'|'ollama',provider?,role?,page?,pageSize?,searchSession?} -> SearchService result for Local; ServerSearchPager result for paginated Server requests. Server supports keyword/semantic; see the preserved server-paging contract below.
- import.pick {kind:'files'|'folder'} -> {paths:string[],notice?} native OS dialog with deterministic configured directory fallback.
- import.paths {paths,collection} -> {imported,updated,skipped,errors,cancelled}; progresses via onProgress.
- operation.cancel {scope?:search|operation} -> {ok:true} cooperative cancellation. Search cancellation does not interrupt an independent import/download; no scope retains the legacy cancel-all behavior.
- server.collections {serverUrl} -> {collections:[{name,count}]}
- server.import {serverUrl,collections:string[]} -> {imported,updated,skipped,errors,cancelled}; only selected complete conversations copied into local archive, source provenance retained; doesn't copy server vector database bytes.
- reading.save {key,position?,bookmark?,removeBookmark?,clear?,sourceScope?} -> reading. Local keys are JSON {mode:"local",id}; Server keys retain canonical server/collection/full source/key; reading object {positions:{},bookmarks:[],recent:[]}. position {turnIndex,role,offset,expanded?}; bookmark {turnIndex,role,title?}; clear 'position'|'positions'|'bookmarks'|'all'. sourceScope is {mode:'local'} or {mode:'server',serverUrl}; scoped mutations validate identity and scoped clear preserves other sources. Desktop clear controls always provide the active source scope. Omitting it retains the legacy API behavior.
- src/core/reading-identity.mjs is a browser-safe source matcher. Parsed identity keys take precedence over embedded navigation refs; server URLs are canonicalized. Unidentified or ambiguous legacy entries survive scoped clears. Recent history retains up to 200 entries per Local source or server address, without evicting other sources. reading-v2.json retains positions/bookmarks/recent, adds an internal _localRecovery epoch/sequence watermark and _localRestoreToken, and migrates recognized legacy Local keys to immutable IDs. These markers make redo reconciliation and restore idempotent; ordinary Server entries remain separately scoped. Saved reading filters recent locations and bookmarks to the active source.
- semantic.setup -> {status}; semantic.index -> {status}; search.status -> status.
- ollama.models {url} -> service availability, local installation/start capability, model names and embedding-capability details.
- ollama.test {url,model} -> synthetic embedding validation; no archive contents are sent.
- ollama.start {url} -> explicitly starts an already installed local service, then returns detected models; remote services are never started.
- ollama.pull {url,model} -> explicit streaming model download via the configured Ollama service; progress and cancellation use the existing operation channel. Ollama owns the external model storage; Reader owns compressed archive/vector storage and built-in-model data under dataDir; mounted SQLite files are temporary.
- export.conversation {thread,format:'md'|'json'} -> native save dialog + file write; export contains original text, not Mermaid repaired display.
- clipboard.write {text} -> {ok:true}; main-process native text write only, guarded by the existing trusted window/main-frame/page check. No clipboard-read API is exposed to the renderer. The immutable preload capability selects this path; standalone HTML uses browser clipboard with a caught-denial fallback.
- app.openData -> reveal app-data folder; app.about -> version/runtime info; external.open {url} allowed http/https/mailto only.

Settings defaults: {mode:'local',language:'en',theme:'system',fontSize:'normal',highContrast:false,compact:true,animations:true,listMode:'pages',pageSize:50,sort:'updated',directoryMode:'last',customDirectory:'',lastDirectory:'',serverUrl:'http://localhost:3000/',serverAddresses:['http://localhost:3000/'],localCollection:'all',serverCollection:'all',searchMode:'keyword',ollamaUrl:'http://127.0.0.1:11434',ollamaModel:'',window:{}}. Four full locales en/hu/de/fr. No whole-window scrolling at >=680x540. Source mode selector always visible in the application header. Compact collections toolbar and collapsible search drawer leave room for the independently scrolling conversation list. Drawer expansion is persisted separately in interface.json. Settings top aligned. Consistent SVG icons/chevrons. Font sizes small/normal/large/xl. data-theme dark/light follows OS when system.

Reader adapter: src/reader/reader.js exports class ReaderView({container,onPosition,onBookmark,onExternal,t,settings}). Public async show(thread,{key,query,position,targetTurn,bookmarks}), setSettings(settings), find(query,direction), resume(position), start(), destroy(). container is #readerHost; internally #conversationContent preserved. Provide navigator for >=2 prompts, hide for one, precise turn identity, collapse, copy, math, Mermaid repair, animations, bookmarks and reading offsets. UI owns toolbar and saved-reading dialog; adapter may return navigation/message info as needed. 

Security: renderer sandbox/context isolation, no raw arbitrary IPC/filesystem/network bridge. Input HTML/code inert. Sanitize all rendered content; external navigation handed to validated main process. No telemetry. Source archives contain synthetic fixtures only, never user exports/state/credentials.


## Compressed storage and lifecycle

Persistent `local-storage-v2/` contains the authoritative checksummed pointer,
profile-selected catalog snapshots, immutable content/index objects and durable
gzip operation records. The `profile` in the committed pointer is authoritative;
a dropdown selection alone never changes the format of existing data. Small
control metadata and redo keep their fixed formats under both profiles.

An exclusive profile lease prevents overlapping writers. Every process mounts
working catalogs in a random private temporary directory with an ownership
marker. Cleanup validates markers and live ownership. It does not remove an
arbitrary similarly named directory. Old `local-storage-v1/` and legacy SQLite
files remain untouched; this release does not mount or convert them. Old backup
formats are rejected explicitly. Reimport supported original exports or copy
selected live server collections to populate the new Local archive.

The catalog stores summaries, organization, identities and content references.
Immutable blocks carry compressed and decoded SHA-256 values and byte counts.
Turn ordering and group boundaries are validated before use. Normal listing
needs the catalog only; a conversation read decodes that conversation's header and turn groups.
The renderer still materializes the requested conversation, and source JSON
parsing can materialize an unusually large record. Lexical search and semantic
index construction may scan more content. The byte-budgeted LRU bounds cached
blocks rather than total process memory.

ApplicationService loads settings and reading state first. A saved Server-mode
startup can list and read live server content without mounting Local storage.
Local access and manager actions await one shared mount/recovery operation.
Derived semantic data is mounted on demand. Search/mutation coordination
quiesces Local searches before replacing catalogs or changing their contents.

Immutable compressed objects are verified and flushed before an acknowledged
mutation can reference them. A checksummed flushed redo record protects the
replayable catalog operation and associated Local reading reconciliation.
Operation IDs make replay idempotent; reading-v2.json's recovery watermark prevents
repeated remapping. Success requires consistent working data and reading state.
A poisoned operation blocks unsafe follow-up writes and reports recovery error.
SQLite snapshots use SQLite's consistent backup API; source live WAL is never simply
ignored. Ordinary shutdown drains durable work and closes handles without
requiring a final whole-archive recompression for acknowledged writes.

Conversion reads and recompresses the complete managed database set under the
requested profile into a staged generation, validates the staged references/content,
and publishes an atomic checksummed pointer only after verification. Old data
remains authoritative until publication. Cancellation before that point leaves
the prior profile usable; post-publication cleanup cannot roll the commit back.
Insufficient-space, denied-delete or interruption paths retain or report cleanup
work. UI queries wait for catalog replacement, avoiding a competing mount.
The service reopens catalog/search owners against the newly committed profile.

Backups use an outer ZIP64 envelope with manifests, catalog data, compressed
content objects and Local reading state. Optional derived indexes are separate.
Restore validates into private staging, installs a new journal epoch and uses a
restore token to finish Local reading replacement after interruption. Server
reading data is retained. Corrupt authoritative data is never silently treated
as an empty archive. External user backups remain outside cleanup ownership.
Downloaded model files are separate from rebuildable indexes and decoded cache.
Windows directory flush limitations remain documented in docs/Storage.md.

## Database Manager bridge

The manager always targets Local data, regardless of the current reader mode.
The existing settings form has a separate Database Manager tab with collection,
conversation and storage views. UI mutations refresh lists/filters/search and
reconcile any open Local conversation without changing the selected Server.

- `manager.status` returns collections including empty entries, revision,
  storage usage/health, active profile, cache/pending-cleanup information and search status.
- `storage.convert {profile:"7z"|"zip6"}` recompresses the managed database set as one operation; the backend validates the target and waits for Local transition completion.
- `manager.files` accepts collectionId/query/provider/page/pageSize/sort and
  returns bounded conversation summaries with total count.
- `manager.preview` resolves explicit IDs or `selection.allMatching` filters,
  validates destination/scope and reports count/duplicates/conflicts/revision.
- `manager.mutate` accepts create/rename/move/copy/merge/deleteConversations/
  deleteCollection/clear, with a checked expectedRevision. Collection IDs and
  Local conversation IDs are stable; provenance is distinct from organization.
- Copy creates an independent identity; optional bookmark copy defaults off.
  Exact source/content duplicates can coalesce in move/merge. Conflicting
  content is retained, and remapped positions/bookmarks use valid message
  anchors. Merge can optionally remove emptied source collections.
- `manager.maintenance` verifies SQLite/FTS/snapshot integrity, compacts storage,
  cleans eligible temporary data, clears retained decoded blocks, or clears derived indexes without models.
- `manager.backup` uses a native save dialog; `manager.restore.pick` uses a
  native open dialog and validates backup counts; `manager.restore` installs
  only the inspected selection after the in-window confirmation.

Desktop IPC restricts backup/restore paths to native dialog selections; the
renderer cannot choose arbitrary filesystem paths. The standalone offline
preview simulates collection/conversation/compression controls in memory and uses
the same reading reconciliation helper. It does not perform file backup, compression or
physical storage operations.

## Appearance contract (preserved from 1.1.1)

Color mode remains the existing theme value system/light/dark. uiPalette selects default/ocean/forest/ember/amethyst/oled; codeTheme selects default/vscode/github/monokai/nord/dracula/solarized/codex. Both default to default and persist in appearance.json under the same user-data root. src/core/themes.mjs owns the catalog and validators use the catalog IDs.

The document root receives data-theme (resolved light/dark), data-ui-palette and data-code-theme. UI and code palettes change scoped CSS variables/token colors independently; the color mode selects each palette’s light/dark variant. Default adds no palette override. Original code text, language grammars, message structure and source identities are unaffected. docs/Themes.md describes palette provenance.

## Server search paging (preserved from 1.1.1 revision 2)

The desktop sends `page`, `pageSize` and optional opaque `searchSession` for Server text/meaning searches. `ServerSearchPager` returns the current page, `hasMore`, `totalKnown`, a lower-bound/exact `total` and engine metadata. Live text compatibility reads `/api/files` and `/api/thread` incrementally and never writes the Local archive. The optional server extension advertises `/api/reader/capabilities` and serves `/api/reader/search` with opaque result cursors. Missing support (HTTP 404) enables live text fallback; authentication or service failures remain errors. Legacy Meaning is explicitly marked `paginationRequiresUpdate`.

UI next/load-more controls use `hasMore`, rather than treating the returned page length as the complete result count. Incomplete totals have a plus suffix. Search sessions bind server, query, collection and filters; changing a query or explicitly refreshing cancels earlier reads and starts a new session. A failed page retains already displayed results and the requested page for retry. Server setup is an explicit user action on the server host; `app.openServerSupport` only opens the bundled local instructions directory through the trusted main process.

## 3.0.0 analytics workspaces

- `src/core/activity-normalize.mjs` extracts original ChatGPT or normalized-turn metadata without copying message bodies into the Activity database.
- `src/core/activity.mjs` maintains the rebuildable compressed SQLite cache and filtered/paged reports. Archive identity/revision plus content hashes prevent stale restoration and avoid re-decoding unchanged conversations.
- `activity.query`, `activity.rebuild`, `activity.status` and `activity.csv` stay Local. The desktop `activity.export` opens a native save dialog and writes the report CSV.
- `server.insights` reads only existing `/api/insights` aggregates. It never substitutes Local analysis or a full remote conversation scan.
- The Banner workspace switch preserves Reader state; Local Activity and Server Insights have separate view/filter state. Internal panes scroll while the shell remains fixed.
- `local-storage-v2` and reading identities remain compatible with 2.0.0. Activity is derived data and may be rebuilt.
- `scripts/preview-activity.mjs` implements the explicitly synthetic in-memory preview reports with the production metadata normalizer. It is not shipped as the desktop analysis service.
