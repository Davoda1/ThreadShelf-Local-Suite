# Changelog

## Reader and Alternative 1.2.0

- Useful JSON-only assistant and reasoning responses display as indented, syntax-highlighted JSON. Strings, large numbers and original lexical values remain intact; message copy and export retain the original source, while code-block copy uses the formatted display.
- Empty and internal-only responses stay hidden. User messages, Markdown examples and fenced code keep their existing rendering. Embedded HTML and rich-content markers inside JSON remain literal text.
- Native startup uses canonical file URLs so special characters in installation paths do not break the trusted renderer or IPC checks. Alternative also handles literal backslashes in POSIX paths without weakening Windows separator checks.
- Reader’s PowerShell development helper resolves bundled npm through Node when no standalone npm wrapper is present.
- Public settings, profile/archive identities, image controls and Reader’s separate optional image cache are preserved. Analytics remains 1.0.0; the manual, server patch, runtime and dependency pins are unchanged.
- Source and native package validation cover JSON rendering, hidden responses and exact-source clipboard behavior, alongside existing image, storage and compatibility checks.

## Reader and Alternative 1.1.0

- Reader adds controlled image loading and a separate resource cache, with settings and theme-aware image placeholders.
- Reader filters empty reasoning and unusable JSON-only content from conversation display and navigation, and removes the version from the native window title.
- Reader's About window describes this desktop application without references to separate personal web readers.
- Alternative loads requested images within the conversation, offers automatic or click-to-load behavior, provides failure placeholders, and fits images to the reading area.
- Alternative suppresses unusable JSON-only responses. It does not add Reader's persistent resource cache.
- Existing public profile names and data/schema identifiers are retained. Public defaults, synthetic examples and hardened offline rendering dependencies are preserved.
- Native Windows startup accepts equivalent file-URL percent encoding while retaining exact application-file, sender and main-frame checks.
- Build helpers track component versions separately. Analytics remains 1.0.0; the server patch and manual are unchanged.
- GitHub source checks cover Windows as well as Linux, including explicit image/cache browser and archive integration gates. Analytics test fixtures use explicit time zones and Reader's own dependency tree without changing Analytics application code.
- Release validation launches the extracted Windows ZIP, Linux TAR.GZ and DEB applications with Chromium's sandbox enabled and synthetic profiles, including settings persistence and package-integrity checks.

## 1.0.0 — 2026-10-20

First public ThreadShelf Local Suite release.

- Reader, Analytics and Alternative are released as separate native desktop applications, each version 1.0.0.
- Includes the latest confirmed development functionality, public-safe defaults, synthetic examples, and refreshed project links.
- Supplies a standalone, baseline-checked ThreadShelf 1.3.0 search patcher with backup and rollback support.
- Includes a rebuilt Gopher 3.0.0 user manual, light/dark screenshots, and editable documentation sources.
- Adds pinned build instructions, GitHub configuration guidance, issue templates and artifact build workflows.

Application release versions and internal data-format/schema versions serve different purposes. Internal schema identifiers remain as required by each implementation.
