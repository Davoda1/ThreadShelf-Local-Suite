# Server integration: rollback and troubleshooting

## Remove the integration

1. Stop the running ThreadShelf instance with the normal server controls.
2. From the suite source root, run:

```sh
node server-patch/manage.mjs uninstall ../ThreadShelf
```

3. Read the result. The patcher uses the recorded backup and expected installed state to restore the affected files.
4. If the deployment uses compiled output, rebuild it with the upstream build command.
5. Restart the server normally and verify ordinary browsing/search.
6. Expect the desktop client’s search capability/limit notice to reflect the unpatched server again.

Do not remove or edit the patch backup while relying on it for restoration. If affected files were changed after installation, preserve that work and inspect the reported conflict instead of forcing a blind overwrite. A full server backup remains separate from this source-file rollback.

## Common installation problems

| Symptom | Meaning or action |
| --- | --- |
| Target path does not exist | Correct and quote the path; run from the directory assumed by your relative argument |
| Expected source files are missing | Use the verified source checkout, not a compiled-only package or a different directory |
| Unsupported version/hash | Wrong upstream baseline or affected local edits; preserve edits and obtain the supported source |
| Already applied | No additional install is required; check/restart the correct instance |
| Backup conflict | Inspect the existing installation/backup state; do not merge backups from different source trees |
| Endpoint still unavailable | Check restart, build mode, actual process path and reverse-proxy route |
| Semantic results fail | Check server model/index setup; patch installation does not configure embeddings |
| Search stops at a bounded first set | Client may be connected to an unpatched instance; inspect that instance’s capability endpoint |
| Page cursor expires | Start the query again from the first page |
| Rollback refuses changes | Affected installed files differ from the recorded state; preserve them before manual reconciliation |

## Snapshot limits and interrupted operations

A paged search is a stable snapshot: changes to indexed data appear only in a new search. Cursors expire after 15 minutes. The server caches at most eight sessions and 128 MiB of serialized results, with additional runtime overhead, and builds at most two snapshots concurrently. An oversized query returns HTTP 503 rather than silently truncating the exact result total; narrow the query or filters. An expired/evicted cursor returns HTTP 410; a cursor with changed query/filter arguments returns HTTP 400. Restart the search in these cases.

The patcher excludes concurrent operations with `.threadshelf-local-suite-patch.lock`. After an abrupt termination, first confirm no installer is running. Remove only the empty stale lock with `rmdir`, then rerun `check`. Do not recursively delete an unknown directory. Recognized partial operations with a complete backup can be recovered with `uninstall`; preserve unexpected files and consult the detailed `server-patch/README.md` before attempting recovery.

## Keep configuration separate

The patcher does not manage `.env`, database directories, exports or model caches. If a server fails because an environment value is missing, repair that deployment according to the deployment documentation. Do not copy personal environment data into a public issue or the suite repository.

## Report integration issues

Include the suite version, Node version, supported upstream commit, patch command, nonsecret diagnostic and whether the problem occurs before or after a server restart. Provide a small synthetic dataset for a search mismatch. Avoid posting real `.env` contents, access tokens, private hostnames, conversation text or unredacted logs.

Use the [suite issue tracker](https://github.com/Davoda1/ThreadShelf-Local-Suite/issues) for patcher/client integration. For an issue reproduced on unmodified ThreadShelf, link the relevant [upstream project](https://github.com/ChrystianSchutz/ThreadShelf) and state that the integration is not applied.
