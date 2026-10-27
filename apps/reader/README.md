# ThreadShelf Local Reader

**Public edition 1.3.0 · Windows x64 and GNU/Linux amd64**

An independent desktop archive and reader for exported AI conversations, with optional read access to a ThreadShelf server. Original exported messages remain available while the reading interface adds Markdown, code highlighting, mathematics, diagrams, supported rich content, saved reading and local search.

Part of [ThreadShelf Local Suite](https://github.com/Davoda1/ThreadShelf-Local-Suite). The original [ThreadShelf project](https://github.com/ChrystianSchutz/ThreadShelf) provides the optional server. See the suite's illustrated Gopher manual for the full user guide.

## Install

- **Windows:** Extract `ThreadShelf-Local-Reader-1.3.0-Windows-x64-Portable.zip` and run `ThreadShelf Local Reader.exe` at the extraction root. Keep all accompanying files together.
- **Linux portable:** Extract `ThreadShelf-Local-Reader-1.3.0-Linux-amd64.tar.gz` and run `bin/threadshelf-local-reader`. It links directly to the native executable; preserve the directory structure and symlinks.
- **Debian/Ubuntu:** Install `threadshelf-local-reader_1.3.0_amd64.deb` using your package manager or `sudo apt install ./threadshelf-local-reader_1.3.0_amd64.deb`. Launch it from the application menu.

The distributions include their Electron runtime. Users do not need Node.js or npm. Windows executables are unsigned. Linux requires the desktop libraries listed by the DEB; use the DEB where distribution sandbox policies prevent the portable application from starting. Do not disable the sandbox for ordinary use.

## First session

1. Start in **Local** mode and import an export file or folder through the file picker. Choose a destination collection.
2. Browse the conversation list and open a conversation. Filters, sorting, paging or continuous list scrolling help navigate larger archives.
3. Use text search for literal content. Local semantic search requires an explicitly installed embedding model and a prepared index; an optional Ollama connection provides another supported search route.
4. Open **Settings** to select the interface language, appearance, reading controls, source settings and other preferences.
5. Use **Saved reading** for bookmarks, recent conversations and saved reading positions.

Supported import adapters include ChatGPT, Claude/Anthropic, Gemini/Google AI Studio, Grok, OpenRouter, LM Studio, Meta, Venice and supported normalized exports. Provider export formats vary; an unavailable or unrecognized export is reported rather than silently fabricated.

## Local archive and optional server

Local and Server are independent sources. Reading from a server does not automatically import that server's archive. Explicit server import copies selected data into the local archive. Enter your own server URL in Settings; the default is `http://localhost:3000/`.

Complete cursor-paged server search needs the suite's [ThreadShelf 1.3.0 server patch](https://github.com/Davoda1/ThreadShelf-Local-Suite/tree/master/server-patch). The bundled `server-support/README.md` points to the patch instructions. The original server is obtained separately from the upstream repository.

The standalone Local Analytics application can capture supported Reader archive data through Analytics' read-only adapter. Reader's integrated **Activity** and server **Insights** views are separate features.

## Reading and appearance

The Reader supports code copying, an in-conversation find control, message outlines, collapsed prompts and exported reasoning, tables, mathematical formulas and Mermaid diagrams. A deterministic repair may be offered for imperfect Mermaid syntax; the original archived text is preserved. Unsupported rich content stays readable where possible, with theme-aware image placeholders when needed.

Online images can load **automatically** (the default) or **on click** through Settings → Appearance. Images load inside the conversation, keep their aspect ratio, and stay within the reading pane. Failed loads use a theme-aware placeholder. Structurally empty ChatGPT status records are hidden from the view; substantive text, source indexes and stored records remain intact.

Standalone assistant and reasoning JSON is displayed as indented, highlighted code. Whole-message Copy and conversation export retain the original source, including duplicate keys and exact number spelling. Empty internal status responses remain hidden; ordinary Markdown and existing code blocks keep their established behavior.

An optional **Resources Cache** is available in Settings → Database manager. Caching starts disabled. When enabled, loaded supported images can be reused offline, with per-conversation and clear-all controls. It is separate from the conversation archive and backups. See [Images and Resources Cache](docs/Images-and-Cache.md).

Color mode follows **System**, **Light** or **Dark** independently of the interface palette and code palette. Nineteen interface palettes include Platinum Plus and Professional. Platinum Plus has an opaque, unblurred thread header and Settings window. Ten code palettes include VS Code, Xcode Classic and Ayu.

Wave video backgrounds are optional and bundled for offline playback. Optional welcome-page fireworks require both wave and welcome video preferences, and an offline holiday decision made at startup. Conversations keep the normal light/dark wave loop. See [Themes](docs/Themes.md) and [Holidays](docs/Holidays.md).

## Data and backups

Default application data directories:

- Windows: `%APPDATA%\ThreadShelf Local Reader`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/ThreadShelf Local Reader`

These contain the local archive, search data, preferences, saved reading and a separately managed optional image cache. Upgrading from public 1.0.0 or 1.1.0 keeps the same profile and archive format; no reimport is required. The application directory is not the data directory. Use **Database manager** to inspect, organize, back up or restore the local archive. Review destructive-operation previews before confirming. Store backups outside the application profile. See [Storage](docs/Storage.md) and [Database manager](docs/DATABASE-MANAGER.md).

Import and export actions use explicit file selection. Remote model setup and server connections are user-selected operations. Public demonstrations and test fixtures contain synthetic content.

## Build from source

Pinned release tools: **Node.js 24.22.1 LTS**, **Electron 45.1.0**, and an isolated managed copy of **npm 12.2.1** with its bundled Undici replaced by the complete official **6.29.1** package. The helper verifies pinned archive integrity and the resulting files before use. This is a documented local modification of npm, not an official patched npm release, and does not change global npm. See [Toolchain](docs/Toolchain.md).

Reader pins `onnxruntime-web`, `onnxruntime-node` and `onnxruntime-common` to stable **1.31.1**. Transformers 4.3.2 uses its supplied source entry with those external dependencies. See [ONNX source and build details](licenses/ONNX-SOURCE-ACCESS.md).

Run these commands from the Reader application directory in a source checkout or source archive. The build helper is included in source distributions; packaged desktop applications do not include it or require npm.

```sh
node scripts/npm-toolchain.mjs -- ci --include=optional
node scripts/npm-toolchain.mjs -- run build
node scripts/npm-toolchain.mjs -- test
node scripts/package.mjs --linux
node scripts/package.mjs --win32
```

The Linux target creates the TAR.GZ and DEB. Windows target packaging creates the portable ZIP. DEB creation requires Linux and `dpkg-deb`. Required build/runtime downloads need network access or verified caches. `scripts/run.sh`, `scripts/run.ps1` and `scripts/run.cmd` are development conveniences, excluded from GUI entry points.

To create the optional offline HTML preview, run `node scripts/preview.mjs` after installing dependencies. It embeds synthetic examples and media; native-only operations are labelled unavailable.

## Technical reference

- [Images and Resources Cache](docs/Images-and-Cache.md)
- [Search](docs/Search.md)
- [Activity](docs/Activity.md)
- [Code highlighting](docs/Code-Highlighting.md)
- [Rich rendering](docs/Rich-Rendering.md)
- [Architecture](ARCHITECTURE.md)
- [Native packaging policy](docs/Packaging-Policy.md)

## License and attribution

Copyright (c) 2026 davoda1. Original application code is MIT licensed. Third-party code, fonts, data, codecs and media retain their applicable terms; see [LICENSE](LICENSE), [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and `licenses/`. Holiday data is separately licensed CC BY-SA 3.0. This project is independently maintained and is not an official upstream ThreadShelf release.
