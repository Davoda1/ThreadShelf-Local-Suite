# Screenshot provenance

All 44 images are fresh, unaltered captures of the public 1.4.5 native Linux
interfaces with synthetic demonstration records. The applications use Electron
45.2.3 at 100% application zoom.

| Application | Count | Capture size | Scope |
| --- | --- | --- | --- |
| Reader 1.4.5 | 18 | 1440 × 1000 | Reading, settings, code presentation, HTML rendering, collection cleanup, search, Activity, holiday controls, About and speech controls |
| Analytics 1.4.5 | 13 | Twelve 1600 × 1000; one 680 × 540 | Overview, Explorer, relationships, evidence, settings, appearance and compact density |
| Alternative 1.4.5 | 13 | 1600 × 1000 | Reading, settings, code presentation, HTML rendering, search, connection and speech controls |

Reader uses its actual local backend with synthetic records. Analytics uses its
actual backend and analysis workers over an isolated snapshot of its bundled
synthetic fixture. Alternative uses fictional Demo conversations. No live server
or private conversation archive is connected.

Reader and Alternative speech panels include real bundled Pocket TTS/Alba CPU
synthesis, paused playback and pinned recordings saved to disk. No remote speech
provider is called. These Linux demonstrations do not establish native Windows
execution or live-server availability.

The galleries identify what each view demonstrates. `../images.json` in the
website authoring snapshot records each image's original filename, dimensions,
SHA-256 checksum and published payload path. Preserve captions and capture scope
when replacing screenshots.
