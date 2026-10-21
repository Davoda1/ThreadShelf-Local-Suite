# Architecture and scope

Public version 1.0.0. Alternative is an independent desktop client within ThreadShelf Local Suite.

## Components

- `main.cjs`: native Electron window, independent profile, validated IPC, clipboard and explicit export/open-link operations.
- `preload.cjs`: narrow functions and one resolved startup-theme value exposed to a sandboxed renderer. No filesystem or Node API is exposed.
- `core/server.cjs`: read-only ThreadShelf HTTP adapter, bounded responses/timeouts, exact archive identity, search capability negotiation and cursor cache.
- `core/state.cjs`: app-owned preferences, pins, saved searches, history and reading positions, atomic state writes.
- `renderer/`: editorial workspace and rich conversation content rendering.
- `vendor/`: offline rendering dependencies and licensed Reader parser components. `vendor/build/` is development tooling only.
- `scripts/`: build, demo creation, package validation and test tooling.

## Archive and connection boundaries

The app never imports, reindexes, deletes, or updates a server conversation. All server requests are GETs to an explicit endpoint allowlist. HTTP redirects and embedded URL credentials are rejected; use the final configured server URL. It supports HTTP(S), LAN hosts, and optional path prefixes. It does not implement reverse-proxy login or bearer-token authentication. Do not use a publicly exposed unauthenticated ThreadShelf server for private archives.

Search result identity includes server address, collection, sourceFile, and conversationKey. A source JSON file can contain many conversations; basenames and result chunk IDs are not treated as unique archive identities. Search passage indices are retained so opening a result can jump to the matching turn.

The custom `/api/reader/capabilities` version-1 extension enables exact totals and cursor paging over the complete result snapshot. Semantic ranking remains the server's job. Stock `/api/search` is supported with an explicit best-50 warning and no claim of exhaustive results. Browse uses the server's conversation list; sorting and paging apply to that complete list.

No conversation database is written locally. Transient thread content lives in application memory. Preferences retain titles, identities, saved queries, and history; exported Markdown is written only through an explicit save operation. Demo records are fictional.

## Isolation

The only automatically created profile is `ThreadShelf Local Alternative` under Electron's platform app-data directory. The application never discovers or migrates Reader/Analytics profiles. The Electron app ID and single-instance lock are also separate. The public app ID is `io.github.davoda1.threadshelf-local-alternative`. Demo state uses a separate scope.

## Limits

The server remains responsible for indexing and the embedding model. This release is an English-language, x64 desktop client. The HTML demo is an offline demonstration using fictional records; it is not a browser network client. Large archives require the server's `/api/files` response to fit within the adapter's 128 MiB response bound. Rich elements that cannot be faithfully reconstructed remain readable as safe text, source links, or unavailable-image placeholders. ThreadShelf 1.3.0 may not retain every rich metadata field from an original provider export.

## Rendering and sidebar

Code blocks use bundled highlight.js 11.12.0 and the Reader-derived language resolver. VS Code Light+ and Dark+ colors follow the resolved application theme through CSS. Known language fences are tokenized; unknown/plain and oversized code remain escaped readable text. Copy and export use original source text. Literal query and Find matches group text across adjacent syntax spans, preserving token markup and counting each phrase once.

Sidebar controls are compact and secondary filters are grouped, preserving more vertical area for conversation selection. The profile schema and read-only server protocol remain unchanged.

## Startup

The main process reads the existing appearance preference before constructing the hidden native window and assigns the matching background color. A validated, synchronous preload request supplies only the resolved Light/Dark value before the document parses. Reloads read the current saved preference. Ordinary IPC retains the main-frame and exact application-file checks.

The first head script sets the document theme before styles and content scripts load. An opaque fixed loading screen covers the full window; the application stays inert and hidden until state normalization, appearance, and local event bindings complete. Two animation frames then hand rendering over to the prepared application. No artificial minimum loading delay is imposed. Remote reconnect begins after the local workspace is usable.

The loader supports reduced motion, an error message and retry, and a 15-second recovery prompt for slow or missing initialization. The loader's inline fallback remains opaque if a required script fails. Preference writes and close-time flushing are disabled until state has loaded successfully; a rejected state read retains the known startup theme and keeps changes in memory for that session, protecting unread saved settings.

## Guide and rich rendering

The offline adapter contains thirteen authored conversations: the original eight, three Claude-style guides, and two ChatGPT-style rendering notebooks. Guides lead the default All collections / Recently updated view. Other sorting and search/filter operations keep their normal semantics. The initial demo conversation and the demo home destination are the start guide. Both desktop Explore demo and the standalone HTML use the same records and renderer.

Guide links use the reserved `https://guide.threadshelf.invalid/` origin. A narrow route handler permits known bundled chat IDs and explicit interface actions only while a verified bundled demo conversation is open. It rejects malformed routes and prevents reserved-origin links from reaching external navigation. Server conversations cannot activate these shortcuts, including by copying a demo ID. Ordinary web links continue through the existing validated external-link path.

The Local Reader Mermaid repair module is included unchanged and adapted into the offline rendering bundle. Rendering first tries the original source, then at most four deterministic candidates. Diagram source is bounded, exported configuration is ignored, strict Mermaid security remains enabled, and generated SVG is sanitized. Original and repaired display/source modes are separate; default Copy/export uses the original. Theme changes rerender diagrams, and disposed conversation views do not receive late updates.

Direct ChatGPT mapping messages now retain their message/node identities during normalization so citation lookup can find the original message-scoped reference metadata. Provider names distinguish Claude and ChatGPT responses in the authored demos. No server protocol or saved-state schema changes were required.
