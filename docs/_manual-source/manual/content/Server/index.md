# ThreadShelf server search integration

The three desktop applications and the upstream ThreadShelf server are separate projects. The suite distributes a **patcher and related integration files**, not a configured server installation. Obtain ThreadShelf from the [original ThreadShelf repository](https://github.com/ChrystianSchutz/ThreadShelf).

The patch supports two exact upstream source versions:

| Upstream | Supported commit | Version directory |
| --- | --- | --- |
| **1.4.1** | `d8e59473e465180fcdd7d690cfb61b35c00a6efe` | `server-patch/1.4.1/` |
| **1.3.0** | `3430dd04f50218fdea916b104709d24a651017fc` | `server-patch/1.3.0/` |

Both supply the search-pagination capability used by Reader and Alternative.
The shared `server-patch/manage.mjs` command selects the version and checks its
source fingerprints. Version text alone never establishes compatibility.
Obtain the current `server-patch/` directory from the suite's `master` branch;
previously published desktop release archives remain unchanged.

ThreadShelf Enhanced already includes the extension and is not a patch target.

## Follow these steps

1. [Prepare the supported server source and protect existing data](01-Prerequisites.md).
2. [Check, dry-run and install the integration](02-Apply.md).
3. [Verify the endpoint and connect desktop clients](03-Verify-and-Connect.md).
4. [Troubleshoot or remove the integration](04-Rollback-and-Troubleshooting.md).

## What the integration changes

A server may expose only a bounded search result set. The supported integration advertises a reader-search capability with cursor pagination, exact result totals and a maximum of 50 passages per page. Reader and Alternative detect that capability and follow the returned cursors for supported content searches.

A search result is a passage, and multiple passages can belong to one conversation. Exact result totals do not mean a deduplicated count of threads. The integration does not install an embedding model, index missing exports or grant new network access. Configure the upstream server normally for those responsibilities.

## Boundaries

The patcher does not read your real `.env` or alter the conversation database. Keep your own environment configuration, data directories, models and backups on the server host. The suite contains no private launcher, hosted-reader installation or prefilled personal server address.

Local Reader’s ordinary Local workflows and separate Local Analytics do not require this server patch. Apply it only to a server you administer and whose source matches the documented baseline. Use the patcher’s checks rather than copying payload files by hand.
