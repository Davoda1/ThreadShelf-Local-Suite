# Screenshot provenance

All 26 images are new, unaltered application captures using synthetic data.

| Application | Count | Capture route | Resolution | Scope |
| --- | --- | --- | --- | --- |
| Reader 1.0.0 | 8 | Production renderer, explicit offline browser preview | 1360 × 900 | Light/dark, settings, search, activity, rich rendering, holiday controls, About |
| Analytics 1.0.0 | 13 | Compiled renderer and built-in synthetic demo bridge, UTC | 12 at 1440 × 1000; compact at 680 × 540 | Light/dark overview, Explorer, relationships, evidence, settings, appearance, compact density |
| Alternative 1.0.0 | 5 | Native Electron 44.4.5 capture on Linux, virtual display, bundled demo | 1440 × 960 | Light/dark, settings, search, connection form |

All three final desktop packages use Electron 44.9.1. The Alternative capture
record retains Electron 44.4.5 because that was the actual capture runtime; it
does not identify the runtime included in the final packages.

Reader/Analytics previews do not exercise native dialogs, personal archives, live
servers or model execution. Alternative's native capture uses the built-in demo,
not a live server. Automation reported zero renderer/page errors and no external
HTTP(S) requests. Alternative's test-only sandbox/single-instance accommodations
are recorded in `capture-reports/alternative.json`; do not copy those switches
into normal application launch commands.

The applications' source folders contain their capture tooling. Recreate images
from the actual interface and synthetic fixtures after changing UI labels. Never
edit a screenshot to impersonate a new version number. The manual gallery
captions describe each image and the workflow it illustrates.
