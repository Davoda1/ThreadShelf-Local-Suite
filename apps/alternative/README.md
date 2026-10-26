# ThreadShelf Local Alternative

**Version 1.2.0 · Windows x64 and GNU/Linux amd64**

An independent desktop reading workspace for a ThreadShelf server. Alternative combines a conversation shelf, text and semantic search, saved searches, pins, a prompt outline, and focused reading. It is part of [ThreadShelf Local Suite](https://github.com/Davoda1/ThreadShelf-Local-Suite).

The server is the separate upstream [ChrystianSchutz/ThreadShelf](https://github.com/ChrystianSchutz/ThreadShelf) project. Install that project independently. The suite's `server-patch/` directory supplies the optional, version-checked search integration for ThreadShelf 1.3.0.

## Install and start

| Platform | Package | Start |
| --- | --- | --- |
| Windows x64 | `ThreadShelf-Local-Alternative-1.2.0-Windows-x64-Portable.zip` | Extract the complete ZIP and run `ThreadShelf Local Alternative.exe` at the extraction root. Keep the runtime files together. |
| Linux amd64 | `ThreadShelf-Local-Alternative-1.2.0-Linux-amd64.tar.gz` | Extract with symlinks and executable permissions preserved, then run `bin/threadshelf-local-alternative`. |
| Debian/Ubuntu amd64 | `threadshelf-local-alternative_1.2.0_amd64.deb` | Install using your package manager or `sudo apt install ./threadshelf-local-alternative_1.2.0_amd64.deb`, then use the application menu. |

The Windows executable is unsigned. Native packages contain the application runtime; ordinary use does not require Node.js or Python. Linux needs a compatible x86-64 graphical desktop and the declared Chromium/GTK dependencies. Portable Linux requires a working user-namespace sandbox; the Debian package installs Electron's sandbox helper. The desktop entry points are native binaries or direct symlinks to them.

## First use

1. Start your ThreadShelf 1.3.0 server and ensure it already contains indexed conversations.
2. Open Alternative and choose **Connect your server**.
3. Enter the final HTTP(S) address, for example `http://localhost:3000`. Retain any required path prefix.
4. Choose a collection, or browse **All collections**. An empty query browses conversations; Filters provides collection and sorting controls.
5. Enter a phrase and press Enter for **Text search**, or select **Semantic** to search by meaning using the server's embedding model.
6. Open a result to read the full conversation. Search results are matching passages, so multiple results can belong to one conversation.

The search extension is detected automatically. It provides complete cursor-paged results with exact totals. Stock ThreadShelf search remains usable with an explicit best-50 limitation. If a result snapshot expires, restart the search from the first page. The app does not install server patches or change server configuration.

To explore without a server, select **Explore demo**. Thirteen synthetic conversations include three conversational guides and two rich-rendering showcases. The demo semantic mode is a labelled approximation and makes no server requests.

## Read and organize

- **Library**, **Pins**, and **Recent** provide separate views. Pins retain references to source conversations, not offline copies.
- **Saved searches** retain the server, collection, query, and search options. The **+** control beside the search modes saves the current search.
- **Find** searches only the open conversation. The prompt outline jumps to a selected prompt.
- **Focus mode** hides navigation for reading; the shelf can also be collapsed separately.
- **Copy conversation** copies plain text; **Export conversation** opens an explicit Markdown save operation.
- Code blocks use offline syntax highlighting with VS Code Light+/Dark+ palettes and separate copy controls.
- Markdown tables, mathematics, supported rich cards and charts, citations, and Mermaid diagrams use bundled renderers.
- Available images load inside the conversation and resize to the reading space, preserving their aspect ratio. Click-to-load is the default; automatic loading is optional. Failed requests use themed placeholders.
- JSON-only assistant and reasoning responses use indented, syntax-highlighted code. Formatting preserves duplicate keys, exact number tokens and key order; conservative display repairs never replace the archived text. **Copy message** and exports retain the original, while **Copy code** uses the displayed formatting.
- Empty internal ChatGPT thoughts envelopes are hidden from rendered messages and complete search hits. Useful JSON, code examples and original copied/exported text are preserved.
- Repaired Mermaid diagrams are labelled. The original source stays available; **Copy repaired** is separate from ordinary copy/export, which preserves archived text.

## Appearance and shortcuts

Reading & appearance offers System, Light and Dark themes; reading text from 14–24 px; Compact (640 px), Comfortable (820 px), or Wide (1040 px) reading width; a switch for reasoning already present in an export; and **Images** options for click-to-load or automatic loading. Settings save automatically. The startup cover uses the saved appearance before revealing the workspace.

| Shortcut | Action |
| --- | --- |
| Ctrl+K | Focus library search |
| Ctrl+F | Find in the open conversation |
| Enter / Shift+Enter in Find | Next / previous match |
| Ctrl+Shift+F | Toggle focus mode |
| Ctrl+Backslash | Show or hide the library shelf |
| Esc | Close the active panel/dialog or leave focus mode |

The minimum native window is 680 × 540. The shelf, reading pane, and dialogs scroll internally.

## Local data and privacy

Alternative reads server APIs. It does not import, reindex, edit, or delete server conversations. Full thread contents are held in memory; an explicit Markdown export creates a file at the chosen destination. No telemetry or automatic-update requests are made. Remote image loading contacts the saved HTTP(S) image host only after activation or when automatic loading is selected. Embedded raster images need no network. Image loading never opens a browser, sends no referrer, cookies or authentication headers, discards response cookies, and has no persistent image cache; Chromium’s HTTP cache is disabled.

Settings, pins, saved searches, recent history, and reading positions are stored in the app's independent `alternative-state.json`:

- Windows: `%APPDATA%\ThreadShelf Local Alternative\alternative-state.json`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/ThreadShelf Local Alternative/alternative-state.json`

Those preferences can contain conversation titles and queries. Close the application before backing up or replacing the profile. If the saved state is unreadable, Alternative preserves the original and keeps all changes in memory for that session, including on close. Settings displays recovery guidance: close the app, restore a backup or move aside only Alternative's own profile, then restart. Alternative does not discover or modify Reader or Analytics profiles. Demo state is separately scoped.

URL credentials, redirects, reverse-proxy login, and bearer-token authentication are not supported. Use the final permitted server address. Private archives should remain in a trusted local environment with appropriate server access controls.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Cannot connect | Open the same address in a browser; check protocol, port, host restrictions, path prefix, and reachability. |
| Browse works but search is empty | Check collection and role filters, try a distinctive word, and read the search coverage notice. |
| Semantic search fails | Verify the server's embedding model and index. Text search uses a different matching mode. |
| Search stops at 50 | Install the suite's supported search extension on a compatible server; the displayed stock-server limit is intentional. |
| Snapshot expired | Rerun the query and begin at page one. |
| Image or citation unavailable | The server/export may not retain the required asset or source metadata. The client does not invent replacements. |
| Startup recovery appears | Choose Retry startup. If the profile cannot be read, changes remain in memory to protect unread settings. |

## Source and builds

See [docs/BUILD.md](docs/BUILD.md) for pinned Node.js LTS, Electron hashes, Windows/Linux commands, and package validation. `node scripts/test.cjs` runs the isolated server-adapter, state, message-visibility, JSON-formatting and native-path tests. The application is packaged directly from source files without a transpilation step. Development scripts are excluded from native runtime packages.

`python3 scripts/build-demo.py` produces a self-contained offline HTML demonstration from the exact application renderer. It supports fictional search, pins, preferences, outline, and exports; it is not a live-server browser client.

The complete illustrated manual is in the suite's `docs/` website. Build, server patch, and publishing instructions are included in the suite source archive. Report suite issues at [ThreadShelf-Local-Suite/issues](https://github.com/Davoda1/ThreadShelf-Local-Suite/issues).

Copyright (c) 2026 davoda1. Original application code is MIT licensed. Third-party components retain their own terms; see `LICENSE`, `THIRD-PARTY-NOTICES.md`, `licenses/`, and `vendor/RENDERER-NOTICES.txt`.

