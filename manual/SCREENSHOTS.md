# Screenshot provenance

All 35 images were captured from the 1.4.0 application interfaces with synthetic
records. Screenshots are unaltered application pixels; version labels were not
edited into older images.

| Application | Count | Capture route | Resolution | Scope |
| --- | --- | --- | --- | --- |
| Reader 1.4.0 | 13 | Compiled production renderer, explicit synthetic browser preview; Chromium 156.0.8078.79 | 1360 × 900 | Light/dark, settings, search, activity, rich rendering, holiday controls, About, TTS Playback, Providers & voices, Audio test, message player and Audio cache |
| Analytics 1.4.0 | 13 | Compiled renderer and built-in synthetic demo bridge, UTC; Chromium 156.0.8078.79 | 12 at 1440 × 1000; compact at 680 × 540 | Light/dark overview, Explorer, relationships, evidence, settings, appearance and compact density |
| Alternative 1.4.0 | 9 | Native Electron 45.1.0 on Linux with a virtual display and bundled demo | 1440 × 960 | Light/dark, settings, search, connection form and all four TTS settings sections |

All three desktop applications retain the pinned Electron 45.1.0 runtime.
Browser preview captures use the separate Chromium version identified above;
they do not identify a replacement runtime for the desktop packages.

Reader and Analytics previews do not exercise native dialogs, real archives,
live servers or model execution. Reader TTS preview playback uses a labelled
synthetic test tone, not a generated voice. Alternative's native capture uses
its bundled demo; its speech settings images illustrate controls and do not
claim a successful paid-provider request. No private conversation data, API
keys or live server addresses were used.

The capture reports in `capture-reports/` record the application runs and
screenshot filenames. Alternative's no-sandbox and single-instance bypass
settings were automation accommodations; they are not normal launch guidance.
The browser capture harness also used a no-sandbox test flag. Follow the normal
sandbox-preserving installation instructions for everyday use.

Recreate screenshots from the application interface and synthetic fixtures after
changing the UI. The capture tools are in each application's source directory.
The manual gallery captions describe the individual views and their limits.
