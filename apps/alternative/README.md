# ThreadShelf Local Alternative

**Version 1.4.7 · Windows x64 and GNU/Linux amd64**

An independent desktop reading workspace for a ThreadShelf server. Alternative combines a conversation shelf, text and semantic search, saved searches, pins, a prompt outline, and focused reading. It is part of [ThreadShelf Local Suite](https://github.com/Davoda1/ThreadShelf-Local-Suite).

The server is the separate upstream [ChrystianSchutz/ThreadShelf](https://github.com/ChrystianSchutz/ThreadShelf) project. Install that project independently. The suite's `server-patch/` directory supplies the optional, version-checked search integration for the exact supported ThreadShelf 1.3.0 and 1.4.1 sources.

Version 1.4.7 improves archived ChatGPT rendering and adds visual hiding of eligible intermediate JSON-only responses. Existing HTML preview sizing, initial placement, and clipping remain supported. Complete HTML pages use a transparent 16:9 surface that fills the code block beneath its toolbar. Reading settings add optional wrapping and line numbers for code; line numbers appear only in Code view and never enter copied or exported source. Existing public privacy controls, isolated HTML scripts, image loading, rich-content rendering, and speech playback retain their behavior.

## Install and start

| Platform | Package | Start |
| --- | --- | --- |
| Windows x64 | `ThreadShelf-Local-Alternative-1.4.7-Windows-x64-Portable.zip` | Extract the complete ZIP and run `ThreadShelf Local Alternative.exe` at the extraction root. Keep the runtime files together. |
| Linux amd64 | `ThreadShelf-Local-Alternative-1.4.7-Linux-amd64.tar.gz` | Extract with executable permissions preserved, then run the real `threadshelf-local-alternative` executable at the extraction root. |
| Debian/Ubuntu amd64 | `threadshelf-local-alternative_1.4.7_amd64.deb` | Install using your package manager or `sudo apt install ./threadshelf-local-alternative_1.4.7_amd64.deb`, then use the application menu. |

The Windows executable is unsigned. Native packages contain the application runtime; ordinary use does not require Node.js or Python. Linux needs a compatible x86-64 graphical desktop and the declared Chromium/GTK dependencies. Portable Linux requires a working user-namespace sandbox; the Debian package installs Electron's sandbox helper. The desktop entry points are regular native binaries, with no symlink or script launchers.

## First use

1. Start your supported ThreadShelf server and ensure it already contains indexed conversations.
2. Open Alternative and choose **Connect your server**.
3. Enter the final HTTP(S) address, for example `http://localhost:3000`. Retain any required path prefix.
4. Choose a collection, or browse **All collections**. An empty query browses conversations; Filters provides collection and sorting controls.
5. Enter a phrase and press Enter for **Text search**, or select **Semantic** to search by meaning using the server's embedding model.
6. Open a result to read the full conversation. Search results are matching passages, so multiple results can belong to one conversation.

The search extension is detected automatically. It provides complete cursor-paged results with exact totals. Stock ThreadShelf search remains usable with an explicit best-50 limitation. If a result snapshot expires, restart the search from the first page. The app does not install server patches or change server configuration.

To explore without a server, select **Explore demo**. Fourteen synthetic conversations include three conversational guides, rich-rendering showcases, and an archived Grok/ChatGPT compatibility example. The demo semantic mode is a labelled approximation and makes no server requests.

## Read and organize

**Reading & appearance** can hide eligible intermediate JSON-only assistant responses visually. Search results pointing to hidden bubbles are omitted only from the returned page. Queries, indexing, totals, dates, ordering and pagination keep their existing behavior; toggling reuses the loaded page.

- **Library**, **Pins**, and **Recent** provide separate views. Pins retain references to source conversations, not offline copies.
- **Saved searches** retain the server, collection, query, and search options. The **+** control beside the search modes saves the current search.
- **Find** searches only the open conversation. The prompt outline jumps to a selected prompt.
- **Focus mode** hides navigation for reading; the shelf can also be collapsed separately.
- **Copy conversation** copies plain text; **Export conversation** opens an explicit Markdown save operation.
- Code blocks use offline syntax highlighting with VS Code Light+/Dark+ palettes and separate copy controls. **Reading & appearance** offers **Wrap long code lines** and **Show code line numbers**, both off by default. Numbers follow logical source lines, appear only in Code view, and are excluded from copying and export. HTML, SVG, Mermaid, and chart renderings do not show a code gutter.
- An **SVG / Code** toggle appears for untagged, `svg` or `xml` chat code blocks containing one complete, valid SVG document. Whitespace and XML comments may surround the root. Raw SVG, strict Base64 and `data:image/svg+xml;base64,` input are supported. HTML with embedded SVG, extra content, malformed input and other language tags stay as code. The initial view is Code; Copy retains its original source in both views, including Base64 input. Previews use inert image rendering with scripts and external resources disabled.
- Markdown tables, mathematics, supported rich cards and charts, citations, and Mermaid diagrams use bundled renderers.
- Saved Grok XML cards become citations, media placeholders, charts or labelled archive panels with SVG icons and source inspection. ChatGPT source/file references, entities, source lists and archived widget markers resolve from saved metadata. Missing or unsupported content stays readable and inert; markers inside code stay literal and Copy/export preserves the original source.
- Available images load inside the conversation and resize to the reading space, preserving their aspect ratio. Click-to-load is the default; automatic loading is optional. Failed requests use themed placeholders.
- JSON-only assistant and reasoning responses use indented, syntax-highlighted code. Formatting preserves duplicate keys, exact number tokens and key order; conservative display repairs never replace the archived text. **Copy message** and exports retain the original, while **Copy code** uses the displayed formatting.
- Empty internal ChatGPT thoughts envelopes are hidden from rendered messages and complete search hits. Useful JSON, code examples and original copied/exported text are preserved.
- Repaired Mermaid diagrams are labelled. The original source stays available; **Copy repaired** is separate from ordinary copy/export, which preserves archived text.

## Text-to-Speech

Open **Settings → Text-to-Speech**. Speech is off by default. Enable it to add a speaker button to eligible messages; choosing one opens the floating TTS bar. Play/pause, stop, replay and seek control audio without changing the conversation. Optional speed, volume and settings controls can be shown in the bar. Switching conversations stops playback.

- **Playback** controls speech, reasoning, streaming, volume and speed. Code and citation reading are optional. Temporary audio memory can be set to 32, 64, 128 or 256 MB (64 MB by default), with up to three completed recordings retained for the session.
- **Providers & voices** offers bundled Pocket TTS and Kokoro CPU voices, an OpenAI-compatible local or remote endpoint, ElevenLabs, OpenAI Realtime and OpenRouter. Each provider keeps its own model, voice and options.
- **Audio test** auditions the current settings without enabling conversation speech or saving the test to the audio cache. Its meter reflects the played signal.
- **Audio cache** optionally saves generated speech. Review clips, pin recordings, choose size/age limits and preview the scope before confirming deletion. Pinned recordings remain protected unless explicitly included.

**Prefer API recordings** is on by default. For the same conversation and unchanged full message, playback chooses a valid pinned recording first, then available API audio, then an exact match for the spoken text and selected generation settings. Disabling this option keeps pinned recordings first and otherwise uses only exact matches. API audio includes self-hosted speech endpoints, ElevenLabs, OpenAI and OpenRouter; this preference never makes a new provider request by itself. A reused recording preserves its original voice and code/citation selection, even if those settings have changed. To hear a different reading, unpin the recording and turn this preference off. New recordings use the unchanged full message for cross-settings reuse; an exact spoken-text and generation-settings match remains reusable after excluded-content edits. Older recordings are reused only when their stored spoken-text or synthesis identity proves a match. Pinned files are never overwritten; a replacement for a missing or corrupt pinned recording can be saved separately when caching and space permit. Persistent files are considered only while the disk cache is enabled; eligible session recordings can be reused with disk caching off.

Settings save automatically. API keys are session-only by default. To retain a key, choose encrypted storage and supply a passphrase; the passphrase is not saved and must be entered after restarting. Forgotten passphrases require replacing the saved key. Built-in CPU speech works offline using the model/runtime files in the application package; it needs no account or separately installed Python. Remote speech sends selected text only after an explicit speech or test request, and provider usage may be billed.

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

Speech preferences, optional encrypted API keys and opt-in audio-cache files use this same independent application profile. Audio caches can contain spoken conversation content.

Settings, pins, saved searches, recent history, and reading positions are stored in the app's independent `alternative-state.json`:

- Windows: `%APPDATA%\ThreadShelf Local Alternative\alternative-state.json`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/ThreadShelf Local Alternative/alternative-state.json`

Those preferences can contain conversation titles and queries. Close the application before backing up or replacing the profile. If the saved state is unreadable, Alternative preserves the original and keeps all changes in memory for that session, including on close. Settings displays recovery guidance: close the app, restore a backup or move aside only Alternative's own profile, then restart. Alternative does not discover or modify Reader or Analytics profiles. Demo state is separately scoped.

For the ThreadShelf archive connection, URL credentials, redirects, reverse-proxy login, and bearer-token authentication are not supported. Use the final permitted server address. Private archives should remain in a trusted local environment with appropriate server access controls.

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

See [docs/BUILD.md](docs/BUILD.md) for pinned Node.js LTS, Electron hashes, Windows/Linux commands, and package validation. `node scripts/test.cjs` runs the isolated server-adapter, state, message-visibility, JSON-formatting, native-path and speech-service tests. The application is packaged directly from source files without a transpilation step. Development scripts are excluded from native runtime packages.

`python3 scripts/build-demo.py` produces a self-contained offline HTML demonstration from the exact application renderer. It supports fictional search, pins, preferences, outline, and exports; it is not a live-server browser client. Its speech controls play a labeled synthetic test tone for UI exploration; actual voice generation requires the desktop application.

The complete illustrated manual is in the suite's `docs/` website. Build, server patch, and publishing instructions are included in the suite source archive. Report suite issues at [ThreadShelf-Local-Suite/issues](https://github.com/Davoda1/ThreadShelf-Local-Suite/issues).

Copyright (c) 2026 davoda1. Original application code is MIT licensed. Third-party components retain their own terms; see `LICENSE`, `THIRD-PARTY-NOTICES.md`, `licenses/`, and `vendor/RENDERER-NOTICES.txt`.

