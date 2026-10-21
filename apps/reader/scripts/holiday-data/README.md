# ThreadShelf reproducible holiday-data inputs

Copied from ThreadShelf Local Suite 1.0.0. Algorithms, data and dependency pins are retained. Only output/import paths were adapted for ThreadShelf. Original provenance and workflow notes are in `ENGINE-README.md`.

Run `npm ci && npm run build && npm test` inside this directory. This regenerates `src/desktop/holiday/src/holiday-engine.mjs` and the corresponding rule JSON and notices. Build-time dependencies are isolated here and are not installed by the shipped app.
