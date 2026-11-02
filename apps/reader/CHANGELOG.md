# Changelog

## 1.4.1 — 2026-11-02

- Fix the minimatch and glob build dependency vulnerabilities and replace vulnerable deepmerge in the offline holiday engine.
- Keep existing holiday data, application behavior, profiles and archive formats unchanged.

## 1.4.0

- Add optional per-message speech with Pocket TTS, Kokoro, self-hosted servers, ElevenLabs, OpenAI Realtime and OpenRouter.
- Add streaming/buffered playback, progress, seeking, replay, volume, speed, and optional thinking/code/citation reading.
- Keep up to three completed recordings in bounded session memory; optionally save verified audio to disk with pinning, expiry and reviewed deletion.
- Add provider discovery, isolated audio testing and passphrase-encrypted saved API keys.
- Prefer pinned recordings, then saved API audio by default, before exact settings matches or new generation. Reuse preserves the original reading of an unchanged full message across voice and text-inclusion changes.
- Preserve pinned originals while saving replacements separately when needed; recheck cache eligibility after concurrent changes and reselect completed playback after cache changes.
- Preserve the Playback page layout after audio cache deletion and other settings status updates.

## 1.2.0

- Display standalone assistant and reasoning JSON as indented, syntax-highlighted code while preserving exact original message text for whole-message copying and export.
- Keep empty internal status responses hidden. Ordinary Markdown, user/tool messages, fenced code and mixed prose retain their existing rendering.
- Preserve duplicate JSON keys, large integer digits and original number spelling; incomplete or ambiguous JSON remains visible without guessed content.
- Load the desktop page with the same canonical file URL used by its IPC trust guard, including paths with literal percent signs.
- Run the Windows build helper through the selected Node distribution's npm CLI, avoiding global npm-wrapper redirection.
- Preserve public profile paths, archive/storage formats, image loading/cache controls and the existing public image-address policy.

## 1.1.0

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
