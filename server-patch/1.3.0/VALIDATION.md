# Server patch 1.0.0 validation

Validation date: **21 October 2026**.

| Check | Result |
| --- | --- |
| Upstream identity | GitHub tag `v1.3.0` resolves to `3430dd04f50218fdea916b104709d24a651017fc` |
| Source comparison | Supplied server package/lock and referenced upstream helpers match the pinned public source |
| Patcher preflight | Clean public 1.3.0 source fingerprints accepted |
| Patcher installation | Two source files changed and one route added; repeat install and installed check accepted |
| Real-source rollback | Every pinned upstream source hash restored exactly |
| Unified diff | `git apply --check` accepted against the clean pinned source |
| Installer safety suite | 16 tests passed; 0 failed, 0 skipped |
| Native database/HTTP suite | 12 tests passed; 0 failed, 0 skipped |
| Privacy boundary | Tests use synthetic fixtures and temporary data; no real `.env`, database or conversation exports included |

Installer tests cover read-only preflight, dry-run, exact restoration and file
modes, repeated installation, unsupported versions, edited upstream files,
conflicting route files, edited installed files, corrupted backups, malformed
manifests, unexpected backup contents, recovery from recognized partial changes,
symlink refusal, concurrent-operation lock refusal, changed payloads and CLI exits.

The native suite uses real LanceDB 0.29.0 and Express 5.2.1 with 520 synthetic
rows across two collections. It checks keyword, semantic and keyword-boosted
pagination past the old 50/200 limits; no page overlap; exact short final pages;
rare model matches; provider/role/date/origin filters; empty results; invalid
cursors and page sizes; cache deletion; unchanged upstream search contract; and
snapshot stability after a database update.

Runtime: Node.js **24.19.0** on Linux x64; TypeScript loader **tsx 4.23.1**,
esbuild **0.28.1**. Dependencies were taken from the supplied lock-matching server
installation; no model download was required. Synthetic query vectors exercise
the native distance/search pipeline. Actual embedding-model output, a user's
network setup and a production service/container restart were not tested.

The execution environment mounts working storage without executable mappings.
For this test run only, native LanceDB/esbuild files were copied to executable
temporary storage and restored afterward. No such workaround is present in the
distributed patch. Native Windows server execution was not performed here.
