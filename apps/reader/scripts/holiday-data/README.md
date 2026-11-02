# ThreadShelf reproducible holiday-data inputs

Derived from ThreadShelf Local Suite 1.0.0. Holiday algorithms, data and parser pins are retained, with adapted output/import paths and the merge dependency security replacement described below. Original provenance and workflow notes are in `ENGINE-README.md`.

From this directory in a source checkout/archive, use Node 24.22.1 and the parent source helper. It prepares an isolated managed npm 12.2.1 copy with its bundled Undici replaced by the complete official 6.29.1 package, verifies pinned archive integrity and the resulting files, and does not modify global npm. This is a local toolchain modification, not an official patched npm release.

```sh
node ../npm-toolchain.mjs -- ci
node ../npm-toolchain.mjs -- run build
node ../npm-toolchain.mjs -- test
```

This regenerates `src/desktop/holiday/src/holiday-engine.mjs` and the corresponding rule JSON and notices, relative to the Reader source root. Build-time dependencies are isolated here and are not installed by the shipped app. Packaged desktop applications use the generated assets and do not include or require this source build helper.

## Merge dependency security

The pinned holiday parser imports `deepmerge`, whose published 4.3.1 release has
no patched version for GHSA-gcqx-w48m-w2h4. A direct local dependency and matching
npm override resolve that import to `safe-merge/`, an application-owned adapter
backed by the pinned `@fastify/deepmerge` 3.2.4 implementation. The vulnerable
package is neither installed nor bundled. This is a compatibility adapter for
the parser's `deepmerge.all(array)` calls, not an upstream `deepmerge` release.
It retains nested merging, array concatenation and cloning while discarding
`__proto__`, `constructor` and `prototype` keys at every nesting level.

`npm test` verifies the parser's actual module resolution, prototype-poisoning
payloads and input immutability, as well as national holiday event parity for
all 207 supported countries in 2025–2027. Regeneration retains the original
holiday rules and metadata; object-key ordering may differ from the earlier
merge implementation. The generated browser engine includes the same adapter.
