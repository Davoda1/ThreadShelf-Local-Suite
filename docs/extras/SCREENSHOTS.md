# README screenshots

These screenshots show the public application renderers with their bundled synthetic demonstration data. They were captured at **1600 × 1000** pixels from freshly generated offline previews, with no changes to the application HTML, CSS or rendered content.

| File | Application | View |
| --- | --- | --- |
| `reader-dark.png` | Reader 1.1.0 | Dark Platinum Plus theme, rich conversation layout |
| `reader-cache-light.png` | Reader 1.1.0 | Light Platinum Plus theme, independent image resource cache |
| `alternative-dark.png` | Alternative 1.1.0 | Dark theme, bundled Paper Observatory conversation |
| `analytics-light.png` | Analytics 1.0.0 | Light theme, overview of the synthetic archive |

The preview generators use the production renderers and styles. Reader's archive and cache services are session-only simulations in this preview; Analytics uses its synthetic bridge and the production calculation worker; Alternative uses its built-in demo. These captures illustrate the interface, not native storage, operating-system integration or live network behavior.

Each capture used an isolated browser context with English locale and UTC time zone. The date was fixed to 2026-10-01 for deterministic preview behavior. All HTTP and HTTPS access was blocked; the run recorded zero external requests and zero page errors. No real archive, personal edition, account, server or user profile was opened. Screenshots contain only PNG pixel chunks, with no text or EXIF metadata, and were visually checked before publication.

To generate the input previews, use `apps/reader/scripts/preview.mjs`, `apps/analytics/scripts/preview.mjs` after its renderer build, and `apps/alternative/scripts/build-demo.py`. Navigate through the normal appearance and conversation controls to the views above.
