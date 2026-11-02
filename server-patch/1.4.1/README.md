# Upstream 1.4.1 target

This directory contains patch version **1.1.0** for upstream ThreadShelf
**1.4.1**, commit `d8e59473e465180fcdd7d690cfb61b35c00a6efe`.

Use the `manage.mjs` dispatcher in the parent `server-patch/` directory. Full installation,
verification, rollback, API and resource-limit instructions are in
[`../README.md`](../README.md). Executed results and limits are in
[`../VALIDATION.md`](../VALIDATION.md).

`supported-source.json` binds the target to the exact upstream source and
payload hashes. `threadshelf-1.4.1-reader-search.patch` is for human review;
install through the dispatcher to retain preflight, backup and rollback checks.
