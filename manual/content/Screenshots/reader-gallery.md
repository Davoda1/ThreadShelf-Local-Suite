# Local Reader 1.4.5 — screenshot guide

## Code and cleanup features

These screenshots show the public **Local Reader 1.4.5** native Linux interface with synthetic conversations at 1440 × 1000 and 100% zoom. They cover the current controls and rendering, using the actual local backend. No live server is connected.

### Reading preferences and code presentation

**Settings → Reading** provides independent **Wrap long code lines** and **Show code line numbers** switches. Both start off. Wrapping keeps long source lines inside the code area, while numbers identify logical source lines rather than wrapped display rows.

![Reader 1.4.5 Reading preferences in light mode, including optional code wrapping and line numbers](../Images/reader-145-reading-preferences-light.png)

The code example below has wrapping and line numbers enabled. These are display preferences: block Copy, message Copy and export keep their original text. Rendered HTML, SVG, Mermaid and charts have no line-number gutter.

![Reader 1.4.5 code presentation in dark mode with wrapped lines and a display-only logical line-number gutter](../Images/reader-145-code-options-dark.png)

### HTML rendering

The **Render** view uses the block’s available width at a responsive 16:9 ratio, without an extra surrounding HTML frame. It remains inside the reading pane while opening, zooming, resizing and scrolling. Code is the initial view; selecting Code restores the source presentation.

![Reader 1.4.5 native HTML preview in light mode, filling the code-block interior without line numbers](../Images/reader-145-html-preview-light.png)

### Conversation cleanup

Reader performs merge and cleanup processing during import and server copy. Existing Local collections can be reviewed from **Settings → Database Manager → Deduplication**. The separate optional unanswered-prompt switch explicitly applies to providers other than Grok/xAI.

![Reader 1.4.5 conversation-cleanup settings in dark mode with the separate non-Grok unanswered-prompt option](../Images/reader-145-cleanup-settings-dark.png)

The review displays the removal candidates, reasons and retained conversations. Active analysis has a progress indicator; closing the review preserves the operation and its selection so the same control can reopen it. Expanded database size and available disk space are displayed separately. Counts in this image describe only the synthetic example.

![Reader 1.4.5 cleanup review in light mode with synthetic candidates and separate database-size and free-space figures](../Images/reader-145-cleanup-review-light.png)

See [reading and export](../Reader/reading.md) and [collection cleanup](../Data/collections.md) for the behavior and confirmation rules.

## Library and workflow controls

The following captures show the current public 1.4.5 native interface with synthetic demonstration records. They illustrate the actual controls without connecting a live server or using a private conversation archive.

### Library and conversation: light and dark

The header selects Local or Server. The conversation shelf, collections and reading pane provide the main workflow. Theme choices preserve the same content and controls.

![Local Reader light interface with synthetic sample data](../Images/reader-light.png)

![Local Reader dark interface with synthetic sample data](../Images/reader-dark.png)

### Settings: sources and appearance

Settings control the source URL, local storage, models and presentation. Save changed preferences where the form provides a Save action. Read the dedicated [appearance](../Reader/appearance.md), [storage](../Data/storage.md) and [server](../Reader/server.md) chapters before changing paths or connections.

![Reader Settings in dark mode](../Images/reader-settings-dark.png)

### Search: scope and evidence

A search combines the selected source, collection, query mode and filters. Results lead back to their conversations. Counts may represent matching passages rather than unique threads. The search example uses only synthetic demonstration records.

![Reader search results from synthetic preview data](../Images/reader-search.png)

### Activity

Reader Activity and Server Insights summarize the selected source. Their scope and available data differ from a separately imported Analytics capture.

![Reader Activity with synthetic statistics](../Images/reader-activity.png)

### Rich reading

The production renderer displays supported code, math, diagrams and cards from a sample conversation. Exports can omit original assets or contain unsupported payloads; a placeholder is preferable to an invented image or chart.

![Reader rich rendering from a synthetic conversation](../Images/reader-rich-rendering.png)

### Holiday controls

The screenshot shows the real dependent settings for optional holidays and appearance. It does not demonstrate a video playing. See [holidays](../Reader/holidays.md) for schedules, visibility and reduced-motion behavior.

![Reader holiday settings](../Images/reader-holiday-settings.png)

### About and version

Use About when preparing a support report. The public application version is 1.4.5; internal storage schema labels can legitimately use different numbers.

The footer lists the inherited rendering adapters and their own source versions; those attribution numbers are independent of Local Reader’s public version at the top.

![Reader About showing version 1.4.5](../Images/reader-about.png)

### Text-to-Speech playback settings

The Playback section controls speaker buttons, reasoning, code/citation reading, streaming, speed, volume and temporary audio memory. The settings layout keeps each section within its own panel. The [speech guide](../Reader/text-to-speech.md) explains the controls and privacy choices.

![Reader Text-to-Speech Playback settings](../Images/reader-tts-playback.png)

### Providers, voices and audio test

Choose a bundled CPU engine or configure an optional remote service. Audio test uses draft choices without saving them and has its own player and output-level meter. This capture uses the bundled Pocket TTS engine and Alba voice to generate the test passage locally.

![Reader speech provider and voice settings](../Images/reader-tts-providers.png)

![Reader 1.4.5 Audio test with locally generated Pocket/Alba speech paused](../Images/reader-tts-test.png)

### Message playback bar

Speaker buttons open playback for one message. The bar offers transport controls and progress, with optional speed, volume and settings controls. The capture shows actual locally generated speech for a synthetic demonstration passage, using the bundled Pocket TTS engine and Alba voice. Playback is paused; no remote speech provider is called. A still image does not establish voice quality.

![Reader 1.4.5 message speech playback bar](../Images/reader-tts-player.png)

### Audio cache

The cache example contains an actual locally generated recording, pinned through the interface. Audio cache is separate from Reader's image resource cache and conversation archive. Pinned recordings take priority for an unchanged full message and are never overwritten by a voice change. Prefer API recordings is on by default. Review cleanup scopes before deleting audio; pinned and playing clips are protected.

![Reader Audio cache settings and cleanup controls](../Images/reader-tts-cache.png)
