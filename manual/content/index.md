# ThreadShelf Local Suite

## User manual · public release 1.0.0

ThreadShelf Local Suite provides three separate desktop applications: **Local Reader**, **Local Analytics** and **Local Alternative**, plus a search-integration patch for **ThreadShelf 1.3.0**. This manual covers the public 1.0.0 GUI builds. English control labels are used; changing an interface language does not translate archived conversations.

The suite is an independent project maintained by **davoda1**. The original [ThreadShelf server](https://github.com/ChrystianSchutz/ThreadShelf) is a separate upstream project. Obtain the server source there, then follow this manual if you need the suite’s search integration. The suite is not a fork of that repository and does not distribute a configured server installation.

## Choose a starting point

| Your goal | Read this |
| --- | --- |
| Install a desktop application | [Installation and first session](Start/installation.md) |
| Decide which application fits your work | [Applications and data sources](Start/applications.md) |
| Import, organize and read an offline archive | [Reader](Reader/index.md) |
| Learn Reader search and optional meaning search | [Archive search](Reader/search.md), [Models](Reader/models.md) |
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

Preferences such as a palette normally require **Save settings** or **Save**. Operations such as import, backup, moving records or refreshing a capture have their own action and confirmation rules. Closing Settings does not undo a completed database operation.

## Keep the application roles clear

Reader’s **Activity** and **Server Insights** views are built into Reader. They differ from the separate Local Analytics application. Alternative keeps reading preferences and server navigation state locally; it does not create Reader’s Local conversation database. None of the three desktop applications generates new AI answers.

Preserve your original provider exports, inspect import/capture diagnostics, check the selected source and filters before interpreting a result, and keep backups outside the active application profile. Use synthetic examples when reporting bugs. The screenshots in this manual contain invented demonstration conversations and metrics, not a private user archive.

[Suite repository and downloads](https://github.com/Davoda1/ThreadShelf-Local-Suite) · [Original ThreadShelf](https://github.com/ChrystianSchutz/ThreadShelf)
