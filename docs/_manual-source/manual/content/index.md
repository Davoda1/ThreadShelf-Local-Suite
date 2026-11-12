# ThreadShelf Local Suite

## User manual · public release 1.4.5

ThreadShelf Local Suite provides three separate desktop applications: **Local Reader**, **Local Analytics** and **Local Alternative**, plus a search-integration patch for **ThreadShelf 1.3.0 and 1.4.1**. This manual covers the public 1.4.5 GUI builds. English control labels are used; changing an interface language does not translate archived conversations.

The suite is an independent project maintained by **davoda1**. The original [ThreadShelf server](https://github.com/ChrystianSchutz/ThreadShelf) is a separate upstream project. Obtain the server source there, then follow this manual if you need the suite’s search integration. The suite is not a fork of that repository and does not distribute a configured server installation.

## What changed since the first public manual

Reader and Alternative provide safe inline HTML formatting, VeniceAI citation badges and isolated temporary previews for complete HTML pages. The previews fit the reading pane during initial display and scrolling. Optional code wrapping and display-only line numbers apply only to Code view. Reader integrates collection-scoped merging and cleanup into imports/server copies and provides a progress-reporting review for existing Local data. Both retain per-message Text-to-Speech, bundled CPU voices, optional remote providers, streaming playback, protected credentials and audio caching. This manual also covers controlled online-image loading, Reader’s separate image resource cache, readable JSON-only responses, MathJax 4 mathematics and readable file-citation labels. Analytics retains its existing features and is versioned with the rest of the suite at **1.4.5**.

## Choose a starting point

| Your goal | Read this |
| --- | --- |
| Install a desktop application | [Installation and first session](Start/installation.md) |
| Decide which application fits your work | [Applications and data sources](Start/applications.md) |
| Import, organize and read an offline archive | [Reader](Reader/index.md) |
| Learn Reader search and optional meaning search | [Archive search](Reader/search.md), [Models](Reader/models.md) |
| Listen to a message or configure speech providers | [Reader Text-to-Speech](Reader/text-to-speech.md), [Alternative Text-to-Speech](Alternative/08-Text-to-Speech.md) |
| Explore local statistics and contributor evidence | [Analytics](Analytics/index.md) |
| Browse a live server with a focused reading workspace | [Alternative](Alternative/index.md) |
| Enable complete server search pagination | [Server patch and connection](Server/index.md) |
| Protect, move or restore an archive | [Data management](Data/index.md) |
| See the actual public interfaces | [Screenshot guides](Screenshots/index.md) |
| Diagnose a problem | [Troubleshooting](Reference/troubleshooting.md) |
| Build or publish the suite | [Developer and maintainer reference](Reference/development.md) |

## Reading this manual

The Gopher-style directory menus group related tasks into focused chapters. Parent links return to the enclosing topic. The document contents list jumps to a section, and the search index searches the documentation without sending a query to a server. Screenshots are local assets with captions; open them at their original size when inspecting a small control.

The built manual works offline. Open `docs/index.html` in the source archive, or `manual/index.html` in the release archive. It can also be served by an ordinary static HTTP server. Reading the manual does not open or change your application data.

Reader and Analytics preferences such as a palette normally require **Save settings** or **Save**. Alternative appearance and speech preferences save automatically; key actions use their own controls. Operations such as import, backup, moving records or refreshing a capture have their own action and confirmation rules. Closing Settings does not undo a completed database operation.

## Keep the application roles clear

Reader’s **Activity** and **Server Insights** views are built into Reader. They differ from the separate Local Analytics application. Alternative keeps reading preferences and server navigation state locally; it does not create Reader’s Local conversation database. Reader and Alternative can synthesize audio for existing messages; Analytics has no speech feature. None of the three desktop applications generates new AI answers.

Preserve your original provider exports, inspect import/capture diagnostics, check the selected source and filters before interpreting a result, and keep backups outside the active application profile. Use synthetic examples when reporting bugs. The screenshots in this manual contain invented demonstration conversations and metrics, not a private user archive.

[Suite repository and downloads](https://github.com/Davoda1/ThreadShelf-Local-Suite) · [Original ThreadShelf](https://github.com/ChrystianSchutz/ThreadShelf)
