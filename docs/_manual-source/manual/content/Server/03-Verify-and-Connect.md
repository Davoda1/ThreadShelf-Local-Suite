# Server integration: verify and connect clients

## Verify the live capability endpoint

After the server restarts, request:

```text
http://localhost:3000/api/reader/capabilities
```

Use your actual server address and retained path prefix where needed. A browser can display the JSON response. From a command-line HTTP client:

```sh
curl http://localhost:3000/api/reader/capabilities
```

The supported response advertises `readerSearch` with these values:

| Field | Expected value |
| --- | --- |
| `version` | `1` |
| `cursor` | `true` |
| `exactTotal` | `true` |
| `maxPageSize` | `50` |

A missing endpoint or old response usually means the wrong instance is running, the patched process was not restarted, a compiled deployment was not rebuilt, or a URL prefix/proxy route is incorrect. Check the source tree and launch command before repeating the patch.

## Connect Local Reader

1. Open **Settings → Sources & files**.
2. Enter the final supported server address and save settings.
3. Select **ThreadShelf Server** in the header.
4. Connect/refresh, select a collection and open a conversation.
5. Run a representative text search, then a meaning search if the server’s model setup supports it.
6. Inspect the count and continue to another page or load more results where enough passages match.

Reader detects the server capability. The **Server search setup** reference in Reader links to the suite patch instructions. The GUI does not install the patch remotely.

## Connect Local Alternative

1. Select the connection card or **Connect your server**.
2. Enter the same final server base URL and choose **Connect server**.
3. Select a nonempty collection or All collections.
4. Run a **Text** query and inspect the result notice and pagination.
5. Try **Semantic** only after the server’s embeddings/search are available.

Alternative uses server result order for content searches. The browse sorts do not reorder a semantic search snapshot.

## Verify a meaningful result set

Use a synthetic test collection or a nonprivate known query that matches more than 50 passages when checking continuation. A query with only ten matches cannot demonstrate a second page. Verify that later pages contain additional passage identities, that totals remain consistent for the snapshot, and that a result opens the expected full conversation.

Roles and collections constrain the search population. Multiple passages from a single thread are legitimate hits. Compare like-for-like counts instead of treating passage totals as conversation totals.

If the server restarts or a search snapshot expires, rerun the query from page one. The desktop client should report the expired/invalid state rather than silently repeat the first page.

## What this check does not establish

The capability endpoint confirms that the integration is exposed. It does not confirm every model, imported provider format, reverse proxy or desktop environment. Test your normal workflow after configuration changes and retain a rollback path.

See [rollback and troubleshooting](04-Rollback-and-Troubleshooting.md).
