# Changelog

## 1.1.0 — Unreleased

- Load supported images inside the conversation, automatically or on click, with bounded dimensions and distinct unavailable/loading/failure placeholders.
- Add an optional, independently managed Resources Cache for Local and Server images; caching is disabled by default and is excluded from conversation backup/restore and data-clearing operations.
- Hide structurally empty ChatGPT intermediate status records consistently in conversation views, outlines, counts, saved-reading views and search results without rewriting the source.
- Improve supported rich card layouts and preserve the public Mermaid/DOMPurify/KaTeX bundle.
- Remove the version from the system title bar and remove historical personal product labels from About and application attribution text.
- Preserve public 1.0.0 profile paths, archive formats, IDs, settings, bookmarks and reading positions.

## 1.0.0

First public release of ThreadShelf Local Reader as part of ThreadShelf Local Suite.

- Independent compressed local archive, multi-provider import, collection management, backup/restore and optional ThreadShelf server access.
- Literal and semantic search, local model setup, optional Ollama integration and cursor-paged search with the server patch.
- Source-preserving rich conversation rendering, code highlighting, math, Mermaid repair, image placeholders and saved reading.
- Activity charts and server Insights, with contributor navigation and clear interactive chart selection.
- Nineteen interface palettes and ten code palettes with System/Light/Dark appearance; Platinum Plus retains opaque, unblurred header and Settings surfaces.
- Optional offline wave backgrounds and welcome-page holiday decoration.
- English, Hungarian, German, French and Japanese interface translations.
- Public repository links, neutral server defaults, sanitized demonstration data and native Windows/Linux packages.

Internal archive and preference schema versions are independent of the public application version.
