# ThreadShelf reproducible holiday-data inputs

Copied from ThreadShelf Local Suite 1.0.0. Algorithms, data and dependency pins are retained. Only output/import paths were adapted for ThreadShelf. Original provenance and workflow notes are in `ENGINE-README.md`.

From this directory in a source checkout/archive, use Node 24.22.1 and the parent source helper. It prepares an isolated managed npm 12.2.1 copy with its bundled Undici replaced by the complete official 6.29.1 package, verifies pinned archive integrity and the resulting files, and does not modify global npm. This is a local toolchain modification, not an official patched npm release.

```sh
node ../npm-toolchain.mjs -- ci
node ../npm-toolchain.mjs -- run build
node ../npm-toolchain.mjs -- test
```

This regenerates `src/desktop/holiday/src/holiday-engine.mjs` and the corresponding rule JSON and notices, relative to the Reader source root. Build-time dependencies are isolated here and are not installed by the shipped app. Packaged desktop applications use the generated assets and do not include or require this source build helper.
