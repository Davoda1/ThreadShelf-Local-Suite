# Server search patch validation

Validation date: **2 November 2026**. Patch tools version: **1.1.0**.
These results concern the server extension; they do not change the desktop
application versions or the existing release assets.

## Exact source targets

| Upstream version | Commit | Target directory |
| --- | --- | --- |
| 1.3.0 | `3430dd04f50218fdea916b104709d24a651017fc` | [`1.3.0/`](1.3.0/README.md) |
| 1.4.1 | `d8e59473e465180fcdd7d690cfb61b35c00a6efe` | [`1.4.1/`](1.4.1/README.md) |

The installers, runtime payloads, source fingerprints and reviewable diffs are
unchanged from the validated targets. The repository layout, documentation and
dispatcher paths were updated. Installer tests now account for Windows file
permissions and file-symlink privileges; directory-junction checks still run.
The original [1.3.0 validation record](1.3.0/VALIDATION.md) remains historical.

## Executed checks

| Check | Result |
| --- | --- |
| Bundle integrity | All files covered by one SHA-256 manifest; payload hashes match both targets |
| Dispatcher and installer safety | 52 passed on Linux |
| Native 1.3.0 LanceDB/HTTP integration | 12 passed on the exact upstream source |
| Native 1.4.1 LanceDB/HTTP integration | 24 passed on the exact upstream source |
| Actual 1.4.1 server, model and desktop adapters | 18 checks passed |
| TypeScript checks | Both patched source targets passed |
| 1.4.1 lint and compiled server build | Passed |
| Reviewable diffs and rollback | Both targets apply cleanly and restore the original tracked source |
| Documentation | Strict manual build and generated local-link checks passed |
| Public-tree review | Passed; synthetic fixtures only |

The 1.4.1 native tests enumerate **13,017 semantic results** without missing or
duplicate pages. Other cases cover filters, literal wildcard characters,
Unicode model labels, legacy metadata, concurrent writes, pending-index masks,
cursor expiry/release, snapshot admission and existing Host/Origin protection.

The full-server runner starts the actual `src/server.ts`, ingests 210 synthetic
passages and uses the real `Xenova/paraphrase-multilingual-MiniLM-L12-v2` q8 model
with 384-dimensional embeddings. It exercises the public Reader and Alternative
1.4.1 adapters, including Reader's 100/100/10 pages and both clients' filters.
All configuration, database and upload paths are isolated test storage.

Local execution used Linux x64, Node.js 24.22.1, LanceDB 0.29.0, Express 5.2.1,
tsx 4.23.1 and TypeScript 6.0.3. The upstream lockfiles were not modified.

## Broader upstream checks and limits

The 1.4.1 unit run passed 679 tests, failed one and skipped five. After the
server build, all 11 packaging tests passed, covering the two initial skips
that required compiled output. Three platform/privilege skips remain: Windows
PowerShell ZIP inspection, DOS short-name behavior and permission denial when
running as root. The upstream HTTP/MCP suite passed 37 tests and failed one.

Both failures reproduce on unmodified upstream 1.4.1 in the same environment:

- The npm CLI test cannot create the Unix IPC socket used by the tsx command.
  All three underlying CLI programs pass equivalent behavior checks through
  `node --import tsx`, without altering their source.
- The optional network-listener test cannot enumerate network interfaces
  (`uv_interface_addresses` is denied), so upstream's status route returns 502.

These are recorded as environment-limited failures, not passing tests. No
upstream code or tests were changed to hide them. The patch-specific HTTP,
native-database and real-model checks all passed.

Native Windows server execution, packaged desktop windows, production archives,
container deployment and large-archive peak memory were not exercised locally.
CI separately checks installers on Linux and Windows and native integration
against both pinned upstream versions on Linux. CI results must be assessed on
the actual committed revision; this document does not claim future checks passed.

## Reproduce

Run from the suite repository root:

```sh
node --test server-patch/tests/integrity.test.mjs server-patch/tests/dispatcher.test.mjs server-patch/1.3.0/tests/installer.test.mjs server-patch/1.4.1/tests/installer.test.mjs
node server-patch/manage.mjs install ../ThreadShelf
node server-patch/1.4.1/tests/run-native.mjs ../ThreadShelf
node server-patch/tests/full-server.mjs ../ThreadShelf --model-cache ../ThreadShelf-test-model-cache --suite .
```

For the 1.3.0 native suite, use `server-patch/1.3.0/tests/run-native.mjs` with
its matching patched checkout. Both native runners require upstream's locked
dependencies. The full-server runner is specific to 1.4.1 and additionally
requires the real embedding runtime and cached model or model-download access.
The `--suite` argument adds current desktop-adapter checks.

Use disposable source checkouts and synthetic data for upstream regression
tests. Do not set a global `THREADSHELF_DATA_DIR` for their unit suite: a
packaging test intentionally checks the normal source-checkout layout.
