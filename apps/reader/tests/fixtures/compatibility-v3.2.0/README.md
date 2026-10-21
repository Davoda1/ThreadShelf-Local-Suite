# Released 3.2.0 Revision 6 preference readers

These three modules are copied byte-for-byte from the released 3.2.0 Revision 6
source. They are test fixtures only and must not be updated with production
settings changes. The complete modules retain their original relative imports;
tests therefore exercise the old validators and persistence implementation,
without substituting the new reader or the new reader's preference definitions.

| File under `core/` | SHA-256 |
|---|---|
| `state.mjs` | `7ad9fb3100fa944424e659a9be5fcccee9d0540299c283ab6d3d0a30b908e604` |
| `themes.mjs` | `da03e0d385798fc422386e223b18b91e48f395c0214b672dcd94239e57e2f992` |
| `reading-identity.mjs` | `7b98b76210ff0a76d87c7e956b113cf138972c2e55f831c74a61e95440a97400` |

Run `node --test tests/reader-appearance.test.mjs` for the self-contained checks.
To also run the complete released-service round trip, set
`THREADSHELF_LEGACY_SOURCE` to the extracted released 3.2.0 source root. That test
copies that source into a temporary directory and shares the unchanged installed
dependencies and codec executable; it does not modify the supplied baseline.
