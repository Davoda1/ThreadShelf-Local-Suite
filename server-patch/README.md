# ThreadShelf server search patches

**Patch bundle 1.1.0 · Reader search API version 1 · MIT**

This optional server extension gives ThreadShelf Local Reader and Local
Alternative complete, cursor-paged search with exact hit totals. It is built
for the actual upstream ThreadShelf **1.4.1** source release and preserves the
original 1.3.0 runtime patch as a separate target.

The upstream project is [ChrystianSchutz/ThreadShelf](https://github.com/ChrystianSchutz/ThreadShelf).
This directory contains both patches, the dispatcher, reproducible tests,
validation reports and licenses. It does not contain a full server installation, database,
conversation export, environment configuration, model weights or dependencies.

## Supported sources

| Target | Exact upstream commit | Target patch version |
| --- | --- | --- |
| **ThreadShelf 1.4.1** | `d8e59473e465180fcdd7d690cfb61b35c00a6efe` (`v1.4.1`) | `1.1.0` |
| ThreadShelf 1.3.0, preserved legacy target | `3430dd04f50218fdea916b104709d24a651017fc` (`v1.3.0`) | `1.0.0` |

Use a source checkout containing `src/`, `package.json` and `package-lock.json`.
The root `manage.mjs` selects the correct target and then verifies its exact
source fingerprints and payload hashes. Version text alone never authorizes an
installation. The new target fingerprints 15 files, including the existing
server, ordinary search route and Host/Origin guard.

**Do not apply these patches to ThreadShelf Enhanced.** Enhanced already provides
the extension. Unsupported versions, altered required files, CRLF-converted
source and npm/npx or compiled-only installations are refused.

The patcher uses Node.js built-ins only. The supported upstream server requires
Node.js 20.19 or later; local validation used Node.js 24.22.1 and the
unchanged upstream dependency lockfile. No runtime dependency is added.

## Directory layout

| Path | Purpose |
| --- | --- |
| [`1.3.0/`](1.3.0/README.md) | Original 1.3.0 installer, payload, fingerprints and tests |
| [`1.4.1/`](1.4.1/README.md) | Validated 1.4.1 installer, payload, fingerprints and tests |
| `manage.mjs` | Select the matching target without changing the existing command |
| `tests/` | Shared integrity, dispatcher and real-server checks |
| `SHA256SUMS.txt` | One manifest covering this entire directory |

Use `server-patch/` from the current `master` source tree. Previously published
desktop packages and tagged source archives remain unchanged; this addition does
not require a new desktop release.

## What the 1.4.1 target changes

Installation changes only these server files:

| File | Change |
| --- | --- |
| `src/store.ts` | Append the complete indexed-passage snapshot function. |
| `src/routes/index.ts` | Import and mount the additional router. |
| `src/routes/reader-search.ts` | Add capabilities, paginated search and snapshot release endpoints. |

The 1.4.1 target reuses upstream's updated filter builder, portable model labels,
searchable-document checks, readiness masks, metadata compatibility and ranking
functions. It does not replace upstream's existing search implementation.
`/api/search`, the web interface, package version, lockfile, and Host/Origin
middleware remain unchanged.

A dedicated native read handle pins each collection scan to one table version.
Its count and result scan therefore see the same rows while ingestion continues
through the server's separate normal handle. After construction, pages are
served from a fixed in-memory result snapshot. An all-collections search reads
collections sequentially; it is not a global transactional database snapshot.

## Obtain a clean 1.4.1 source checkout

For a new installation, these commands work in Linux shells and PowerShell:

```sh
git clone --config core.autocrlf=false --branch v1.4.1 --depth 1 https://github.com/ChrystianSchutz/ThreadShelf.git ThreadShelf
git -C ThreadShelf rev-parse HEAD
```

The commit must be `d8e59473e465180fcdd7d690cfb61b35c00a6efe`. The clone setting
preserves LF bytes on Windows; exact-byte fingerprints deliberately reject a
checkout silently converted to CRLF. Do not alter the expected hashes to make a
different checkout pass.

An existing matching checkout can be used directly. Keep the suite checkout
and its patch files outside the server folder. Do not overwrite an existing server directory
or copy a new checkout over its private configuration and data.

## Check, install and restart

Run the examples below from the **ThreadShelf-Local-Suite repository root**.
They assume that the `ThreadShelf` source checkout is a sibling of the suite.
The root command automatically selects 1.3.0 or 1.4.1 and verifies its hashes.

Linux:

```sh
node server-patch/manage.mjs check ../ThreadShelf
node server-patch/manage.mjs install ../ThreadShelf --dry-run
# Stop the existing server through its normal service manager, if running.
node server-patch/manage.mjs install ../ThreadShelf
```

Windows PowerShell:

```powershell
node .\server-patch\manage.mjs check ..\ThreadShelf
node .\server-patch\manage.mjs install ..\ThreadShelf --dry-run
# Stop the existing server through its normal service manager, if running.
node .\server-patch\manage.mjs install ..\ThreadShelf
```

Quote paths containing spaces. `check` and `install --dry-run` are read-only.
Repeated installation verifies the existing patch and backup and makes no
further source changes.

Before any source write, the installer preserves the exact original files and
their modes in `.threadshelf-local-suite-backup-v1/` inside the target checkout.
Keep that backup until uninstalling. The installer never reads or modifies
`.env`, server settings, uploaded files, collections or databases, and it does
not start or stop processes.

For a **new** source installation, install the upstream dependencies and build
the web interface after the patch succeeds:

```sh
cd ../ThreadShelf
npm ci
npm run build:client
npm start
```

`npm start` runs the patched TypeScript through `tsx`. An already configured
source deployment needs its normal restart; an existing built web interface
does not need rebuilding for this server-only patch. Preserve the deployment's
existing data-path and environment configuration. Do not launch a second server
on the same port.

If the deployment executes compiled `dist/` files, rebuild the server with
`npm run build:server` and deploy the generated output through the existing
process. A fresh complete package can use `npm run build:package`. For a
container, apply the patch in its source build context and rebuild/recreate the
service while retaining its environment and data volumes. Patching `src/` alone
cannot update an already compiled server or a published npm cache.

## Verify and use it

At the server's existing URL, request:

```text
/api/reader/capabilities
```

For example, `http://localhost:3000/api/reader/capabilities` returns:

```json
{
  "readerSearch": {
    "version": 1,
    "path": "/api/reader/search",
    "maxPageSize": 50,
    "modes": ["keyword", "semantic"],
    "cursor": true,
    "providerFilter": true,
    "snapshotTtlSeconds": 900,
    "exactTotal": true
  }
}
```

Configure Reader or Alternative with that same server URL and start a **new**
search so the client detects the capability. Existing compatible adapters need
no changes. Analytics does not query this extension directly.

For a headless server reached from another computer, use its existing LAN URL.
The new routes are behind the same upstream Host/Origin guard and listener as
the other API routes. They add no port or authentication bypass. Keep the
existing `HOST`/`ALLOWED_HOSTS` configuration appropriate for that deployment.
The patcher does not edit network settings.

## Search semantics and limits

| Property | Behavior |
| --- | --- |
| Text search | Case-insensitive literal substring search over indexed passages; `%`, `_`, backslash and quotes remain literal query characters. |
| Meaning search | The server's existing local embedding model and native LanceDB cosine distance; the approximate vector index is bypassed for complete enumeration. |
| Smart search | Semantic distance ranking with the existing optional keyword boost. |
| Filters | Collection, provider, role, model, date range and origin apply before totals and pagination. |
| Paging | Maximum 50 hits per HTTP response; `total`, `hasMore` and `nextCursor` describe the complete snapshot. |
| Candidate limits | No fixed 50-, 200- or 12,800-result ceiling in the extension. |
| Snapshot lifetime | Fixed 15 minutes; access does not extend expiry. Restarting the server invalidates all cursors. |
| Cache | At most eight snapshots and 128 MiB of serialized cached result data. Native/JavaScript overhead and in-progress builds are additional. |
| Concurrent builds | At most two new searches at once. Existing cached pages do not require re-embedding. |
| Resource failures | HTTP 503 explicitly requests a retry or narrower filters; no partial set is labeled complete. |
| Cursor failures | HTTP 400 for invalid/mismatched query or filters; HTTP 410 for expired, released or evicted snapshots. |

Totals count **indexed passages**, not unique messages or conversations. One
long message can produce several hits. Reader's unpatched text-search fallback
scans live messages; after capability detection it uses indexed-passage search.
This change in search scope and hit counts is intentional. Unindexed material
does not become searchable merely by installing the patch.

Meaning-search totals count every eligible indexed passage ranked by cosine
distance. The extension introduces no minimum-similarity threshold.

There is no patch-specific database migration, reindexing or re-embedding.
Runtime search uses upstream's existing metadata-schema helper for older
collections; that helper may add missing optional metadata columns as it
normally does. Semantic queries still require a working upstream embedding
model, which upstream downloads on first use if it is not already cached.

An exhaustive first query can take longer and use more memory than a limited
top-results query. Later pages use the cached results. Cancelling a request
stops work between embedding, collection and native result batches; an already
running native/model operation may finish first.

## API contract

| Endpoint | Purpose |
| --- | --- |
| `GET /api/reader/capabilities` | Advertise extension version 1. |
| `GET /api/reader/search` | Start or continue keyword/semantic search. |
| `DELETE /api/reader/search?cursor=...` | Release an existing snapshot. |

Search parameters: `q`, `collection`, `mode`, `n`, `roles`, `provider`, `model`,
`from`, `to`, `origin`, `keywordBoost`, and `cursor`. Existing upstream validation
rules apply. `origin` accepts `archive` or `threadshelf`. The response is:

```json
{"results": [], "total": 0, "hasMore": false, "nextCursor": null}
```

Cursors remain 48 lowercase hexadecimal characters, a dot and a numeric offset.
They are bound to the normalized query and filters. Page size is excluded from
that binding, permitting resized pages and Alternative's rewind to offset zero.
Results include stable passage identity and collection/thread metadata.

## Uninstall and recovery

Stop the server, then run from the suite repository root:

```sh
node server-patch/manage.mjs uninstall ../ThreadShelf
```

This restores both original files byte-for-byte, removes the added route and
removes the verified backup. Rebuild compiled/container deployments if needed,
then restart normally. Uninstall the extension **before upgrading upstream**.

The installer refuses to overwrite later edits, corrupt backups, unexpected
files in the backup, or unknown source bytes. It also refuses affected file or
directory symlinks. There is no force flag. Preserve any named later edits and
the backup before reconciling a refusal.

A complete backup can recover a partially applied install/uninstall when all
affected files remain in recognized original or installed states. If a process
stops while the backup itself is being created, no source writes have begun;
inspect and compare the originals before manually clearing an incomplete backup.

An empty `.threadshelf-local-suite-patch.lock` directory excludes concurrent
patch operations. If a killed process leaves it behind, first establish that
no patcher is running, then remove only that empty directory with `rmdir` and
rerun `check`. Never recursively remove an unknown directory to clear a lock.

## Included verification

See `VALIDATION.md` for the exact executed results and platform limits.

Run installer and dispatch tests without server dependencies:

```sh
node --test server-patch/tests/integrity.test.mjs server-patch/tests/dispatcher.test.mjs server-patch/1.4.1/tests/installer.test.mjs server-patch/1.3.0/tests/installer.test.mjs
```

After applying the patch and installing upstream dependencies, run the
deterministic native LanceDB/HTTP tests:

```sh
node server-patch/1.4.1/tests/run-native.mjs ../ThreadShelf
```

The full-server runner exercises the actual server entry point, ingestion and
the real embedding model. Its invocation and optional current desktop adapter
checks are documented in `VALIDATION.md`. Both runners use copied source and
isolated synthetic test data rather than a running production database.

The human-reviewable diff is
`1.4.1/threadshelf-1.4.1-reader-search.patch`. Use `manage.mjs` for actual
installation so compatibility, backup and rollback checks run.

`SHA256SUMS.txt` covers all files under `server-patch/` except itself. Run
`node --test server-patch/tests/integrity.test.mjs` from the suite root on either
platform, or `sha256sum -c SHA256SUMS.txt` from inside `server-patch/` with GNU
coreutils. Git preserves the exact bytes of this directory on both platforms.

## Preserved 1.3.0 target

`1.3.0/` retains the original installer, runtime payload, source fingerprints,
reviewable diff and license notices byte-for-byte. Documentation paths were
updated for the versioned layout, and installer tests account for Windows
permissions and file-symlink privileges. Its original validation report is
historical; the root `VALIDATION.md` records the current checks.

The new dispatcher can check and uninstall an existing 1.3.0 installation using
its original backup. The 1.4.1 target does not relax the old target's checks.
There is no force option for applying either target to another upstream version.
