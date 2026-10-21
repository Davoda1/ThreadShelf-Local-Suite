# ThreadShelf 1.3.0 search integration patch

**ThreadShelf Local Suite patch 1.0.0 · Copyright (c) 2026 davoda1 · MIT**

This optional extension gives Local Reader and Local Alternative cursor-paged
server search with exact hit totals. It adds `/api/reader/capabilities` and
`/api/reader/search` to an existing ThreadShelf server. The applications detect
the capability when a new server search starts. Local Analytics reads Reader
captures and does not require this patch directly.

The upstream server is a separate project by Chrystian Schutz:
[ChrystianSchutz/ThreadShelf](https://github.com/ChrystianSchutz/ThreadShelf).
Obtain it from that repository. This folder contains the extension and patcher,
not a server installation, environment file, database, launcher or hosted reader.

## Exact supported source

| Item | Required value |
| --- | --- |
| Package | `threadshelf` |
| Version | `1.3.0` |
| Upstream tag | `v1.3.0` |
| Verified commit | `3430dd04f50218fdea916b104709d24a651017fc` |
| Target | Source checkout containing `src/`, `package.json` and `package-lock.json` |
| Patcher runtime | Node.js 24 LTS recommended; tested with 24.19.0 |
| Additional patch dependencies | None |

`supported-source.json` records SHA-256 fingerprints for the affected files and
the upstream helpers they use. It also verifies the payload files. The patcher
refuses unknown versions, altered required files, conflicting route files and
symlinked affected files/directories. Unrelated files, private configuration and
data may remain in the checkout and are not read by the patcher.

The npm/npx distribution contains compiled files rather than the required
source tree. Do not patch an npm cache. Use the pinned source checkout and
configure it to use the intended persistent data paths.

## New server: obtain the source

Install Git and Node.js 24 LTS using their official installation instructions.
The suite build documentation records exact pinned build-tool versions; a
compatible maintained Node LTS patch release can run this installer.

These commands work in a terminal on Linux and in PowerShell on Windows:

```sh
git clone --config core.autocrlf=false https://github.com/ChrystianSchutz/ThreadShelf.git ThreadShelf
cd ThreadShelf
git checkout --detach 3430dd04f50218fdea916b104709d24a651017fc
git rev-parse HEAD
```

The last command must print the commit listed above. Run the patch preflight
before modifying the source or dependency lockfile. Keep the Suite repository
and this server checkout as separate directories.

The clone setting preserves the upstream LF line endings on Windows as well as
Linux. Fingerprints compare exact bytes; a checkout converted to CRLF is refused
even when the code looks identical in an editor. Use the clean checkout above
instead of changing hashes to accept a different representation.

## Check and install

The examples assume `ThreadShelf-Local-Suite` and `ThreadShelf` are sibling
directories. Replace the example paths for your installation. All commands
below run from the **Suite repository root**.

Linux:

```sh
node server-patch/manage.mjs check ../ThreadShelf
node server-patch/manage.mjs install ../ThreadShelf --dry-run
# Stop an existing ThreadShelf process/service using the normal stop command.
node server-patch/manage.mjs install ../ThreadShelf
```

PowerShell:

```powershell
node .\server-patch\manage.mjs check ..\ThreadShelf
node .\server-patch\manage.mjs install ..\ThreadShelf --dry-run
# Stop an existing ThreadShelf process/service using the normal stop command.
node .\server-patch\manage.mjs install ..\ThreadShelf
```

`check` and `install --dry-run` are read-only. A successful check reports the
verified upstream commit. Installation changes exactly `src/store.ts` and
`src/routes/index.ts`, and adds `src/routes/reader-search.ts`. It saves exact
originals and their file modes in `.threadshelf-local-suite-backup-v1/` inside
the server checkout before changing any source file. A repeated install checks
integrity and reports that the patch is already installed.

The installer neither stops nor starts server processes. It never reads or
modifies `.env`, settings, uploaded files, collections or database contents.
Before changing a production server, retain your normal data/configuration
backup as well as the patcher's source backup.

## Install dependencies and start

For a new source checkout, after the patch succeeds:

```sh
cd ../ThreadShelf
npm ci
npm run build:client
npm start
```

On the verified upstream version, `npm start` uses `tsx src/server.ts`, so it
loads the patched TypeScript directly. The client build is needed for a fresh
checkout's web interface; changing this server-only extension does not require
rebuilding an already built client. Upstream's default address is
`http://localhost:3000`; the documented alternate-port syntax is
`npm start -- 3001`.

For an existing installation, preserve the environment and data-path
configuration and restart it through the same service manager. Do not start a
second process on the same port. If `npm ci` is needed, it installs the existing
upstream lockfile without adding dependencies for this patch.

For a deployment that runs `dist/`, run `npm run build` in the patched source
checkout and deploy the rebuilt output using your existing process. Editing
`src/` does not update an already compiled server. For containers, apply the
patch to the image's source build context, then rebuild/recreate that service
while preserving the service's environment, mounts, data volumes and port mapping.

## Verify the connection

Open the existing server's address followed by:

```text
/api/reader/capabilities
```

For example, `http://localhost:3000/api/reader/capabilities` should return a
`readerSearch` object containing:

```json
{
  "version": 1,
  "path": "/api/reader/search",
  "maxPageSize": 50,
  "modes": ["keyword", "semantic"],
  "cursor": true,
  "providerFilter": true,
  "snapshotTtlSeconds": 900,
  "exactTotal": true
}
```

In Reader or Alternative, configure the server URL and start a **new** search.
Use Next/Load more where the selected application exposes it. More than 50
matching indexed chunks should remain accessible. One conversation may produce
several chunk hits; the reported hit total is not a unique-conversation count.
Semantic search still needs the server's existing working embedding model.

The patch keeps the server's existing Host/Origin and network-access boundary.
It introduces no new port or authentication bypass. When the desktop and server
are on different computers, use the server's real reachable URL and follow
upstream's network configuration instructions. An access refusal is not solved
by disabling those controls.

## Search behavior and limits

- Keyword mode applies upstream's case-insensitive substring matching and
  occurrence/date ranking across all eligible indexed chunks.
- Semantic mode uses the existing embedding function and LanceDB cosine
  distance, bypassing the approximate vector index so later matches are not
  lost behind a small candidate window. Optional keyword boost is preserved.
- Collection, role, provider, model, date and origin filters apply before
  pagination. Pending-index masks and searchable-document checks are retained.
- Each network page contains at most 50 hits. The response supplies `total`,
  `hasMore` and `nextCursor`; a client may combine pages for a larger display.
- A search builds a stable snapshot. Continuing that cursor keeps the same
  results even if indexed data changes. Start a new search to see new data.
- Snapshots expire after 15 minutes. At most eight sessions and 128 MiB of
  serialized result data are cached across them; JavaScript/native overhead is
  additional. At most two snapshot builds run concurrently.
- An oversized single snapshot fails with HTTP 503 and asks for narrower
  filters. It is never silently truncated and labeled complete.
- An expired or evicted cursor returns HTTP 410. A cursor used with different
  filters/query returns HTTP 400. Restart the search in either case.
- Cancelling a client request stops work between embedding, collection and
  native result batches. An operation already running may finish first.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/reader/capabilities` | Advertise the extension contract |
| `GET /api/reader/search` | Start or continue a paged keyword/semantic search |
| `DELETE /api/reader/search?cursor=...` | Release the cursor's cached snapshot |

The existing `/api/search` response and validation contract are unchanged.
No database reindex or new storage migration is introduced by installing the
source patch. Runtime reads reuse upstream's existing metadata-schema helper
for older collections.

## Uninstall and recovery

Stop the server, then run from the Suite root:

```sh
node server-patch/manage.mjs uninstall ../ThreadShelf
```

Original changed files are restored byte-for-byte and the added route is
removed. Rebuild compiled/container deployments if applicable, then restart
normally. Private configuration and indexed data remain in place.

Do not delete the backup before uninstalling. The patcher verifies every saved
original against the upstream fingerprint and every installed file against the
known original/patched bytes. It refuses to overwrite later user edits, corrupted
backups or unexpected extra files in the backup directory. Preserve those files
and merge/recover manually when a refusal identifies them; there is no force flag.

A partially applied install or uninstall can be recovered with `uninstall`
when all affected files are still in a recognized original/patched state and
the backup is complete. If interruption happened while the backup itself was
being created, no source writes had begun; inspect the backup and compare the
affected originals before removing that incomplete backup directory manually.

Concurrent patch operations are excluded by an empty directory named
`.threadshelf-local-suite-patch.lock`. A process killed abruptly may leave it.
Only after confirming no installer is running, remove that **empty** directory
with `rmdir`, then rerun `check` and follow the reported result. Never recursively
remove an unknown directory to clear a lock.

Remove the extension before upgrading ThreadShelf. A later upstream release
requires a separately reviewed patch; changing the expected version or hashes
to force this patch onto different code is not supported.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Unsupported or locally modified source | Check the commit and named file. Use a clean pinned checkout or review your local changes before proceeding. |
| Missing `src/` | Obtain the upstream source checkout; do not patch the npm cache or compiled-only package. |
| Capability URL returns 404 | Confirm the URL/process; restart the patched source deployment or rebuild the compiled image. |
| Desktop still shows limited server search | Verify the capability endpoint, then start a new search using the same server URL. |
| HTTP 400 on continuation | Restart with the intended query/filters; never reuse a cursor after changing them. |
| HTTP 410 | The snapshot expired or was evicted; start the search again. |
| HTTP 503 | Wait for ongoing searches or narrow the collection/query/date/model filters. |
| Semantic search fails while text works | Check the upstream server's model installation/configuration and logs locally. |
| Modified installed source during uninstall | Preserve the later edits and backup; reconcile the named files manually. |

## Tests and provenance

Run installer safety tests without a server or dependencies:

```sh
node --test server-patch/tests/installer.test.mjs
```

After installing upstream dependencies and this patch, run the real native
LanceDB/HTTP test from the Suite root:

```sh
node server-patch/tests/run-native.mjs ../ThreadShelf
```

The native runner copies only source files into temporary test storage and uses
synthetic rows. It never connects to the running server or uses that server's
databases.
Deterministic query vectors exercise real LanceDB semantic ranking without
downloading a model; this does not validate a particular embedding-model setup.
See `VALIDATION.md` for the executed checks and platform limits.

`threadshelf-1.3.0-reader-search.patch` is the human-reviewable unified diff.
Use `manage.mjs` for installation so compatibility, backup and rollback checks
are applied. `ThreadShelf-LICENSE.txt` preserves upstream's MIT terms;
`THIRD-PARTY-NOTICES.md` explains attribution and runtime dependencies.
