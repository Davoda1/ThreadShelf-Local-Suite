# Local Reader 1.4.0 — screenshot guide

These new 1360 × 900 screenshots show the exact production 1.4.0 renderer in the explicitly labelled synthetic offline browser preview. Native file operations, live server calls and model operations are simulated in that preview; TTS preview playback uses a labelled synthetic test tone rather than synthesized speech; the images demonstrate the controls and rendering, not successful native/server execution. They are unaltered captures of real application UI.

## Library and conversation: light and dark

The header selects Local or Server. The conversation shelf, collections and reading pane provide the main workflow. Theme choices preserve the same content and controls.

![Local Reader light interface with synthetic sample data](../Images/reader-light.png)

![Local Reader dark interface with synthetic sample data](../Images/reader-dark.png)

## Settings: sources and appearance

Settings control the source URL, local storage, models and presentation. Save changed preferences where the form provides a Save action. Read the dedicated [appearance](../Reader/appearance.md), [storage](../Data/storage.md) and [server](../Reader/server.md) chapters before changing paths or connections.

![Reader Settings in dark mode](../Images/reader-settings-dark.png)

## Search: scope and evidence

A search combines the selected source, collection, query mode and filters. Results lead back to their conversations. Counts may represent matching passages rather than unique threads. The preview shown here uses synthetic search responses.

![Reader search results from synthetic preview data](../Images/reader-search.png)

## Activity

Reader Activity and Server Insights summarize the selected source. Their scope and available data differ from a separately imported Analytics capture.

![Reader Activity with synthetic statistics](../Images/reader-activity.png)

## Rich reading

The production renderer displays supported code, math, diagrams and cards from a sample conversation. Exports can omit original assets or contain unsupported payloads; a placeholder is preferable to an invented image or chart.

![Reader rich rendering from a synthetic conversation](../Images/reader-rich-rendering.png)

## Holiday controls

The screenshot shows the real dependent settings for optional holidays and appearance. It does not demonstrate a video playing. See [holidays](../Reader/holidays.md) for schedules, visibility and reduced-motion behavior.

![Reader holiday settings](../Images/reader-holiday-settings.png)

## About and version

Use About when preparing a support report. The public application version is 1.4.0; internal storage schema labels can legitimately use different numbers.

The footer lists the inherited rendering adapters and their own source versions; those attribution numbers are independent of Local Reader’s public version at the top.

![Reader About showing version 1.4.0](../Images/reader-about.png)

## Text-to-Speech playback settings

The Playback section controls speaker buttons, reasoning, code/citation reading, streaming, speed, volume and temporary audio memory. The settings layout keeps each section within its own panel. The [speech guide](../Reader/text-to-speech.md) explains the controls and privacy choices.

![Reader Text-to-Speech Playback settings](../Images/reader-tts-playback.png)

## Providers, voices and audio test

Choose a bundled CPU engine or configure an optional remote service. Audio test uses draft choices without saving them and has its own player and output-level meter.

![Reader speech provider and voice settings](../Images/reader-tts-providers.png)

![Reader Audio test passage and controls](../Images/reader-tts-test.png)

## Message playback bar

Speaker buttons open playback for one message. The bar offers transport controls and progress, with optional speed, volume and settings controls. This browser preview illustrates the real interface using a synthetic test tone, not a provider-generated voice.

![Reader message speech playback bar in the synthetic preview](../Images/reader-tts-player.png)

## Audio cache

Audio cache is separate from Reader's image resource cache and conversation archive. Pinned recordings take priority for an unchanged full message and are never overwritten by a voice change. Prefer API recordings is on by default. Review cleanup scopes before deleting audio; pinned and playing clips are protected.

![Reader Audio cache settings and cleanup controls](../Images/reader-tts-cache.png)
