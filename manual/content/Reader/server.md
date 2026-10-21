# ThreadShelf Server mode

## Connect to a server

1. Start the ThreadShelf server separately on the server host computer.
2. Open **Settings → Sources & files** in Reader.
3. Enter the server’s HTTP or HTTPS address and save settings.
4. Select **ThreadShelf Server** in the header and use **Connect** or Refresh as needed.
5. Select a nonempty server collection, then open a conversation.

The default address is local (`http://127.0.0.1:3000` or `http://localhost:3000`). Enter the actual address of your own server. The accepted address has no embedded username/password, query string or fragment. Saved addresses make it easier to revisit a localhost or LAN instance.

The status bar indicates connecting, connected or not connected. Reader does not start ThreadShelf, install it on a remote machine, or silently use Local copies when the live server fails. For offline access, use the separate **Copy from server** workflow.

## Live reading and saved locations

Server conversations use the same display renderer as Local conversations. Rendering support therefore does not require a Local import. However, the server must supply the message content and any supporting metadata; missing raw provider data can limit rich citations or branch analysis.

Bookmarks and reading progress are scoped by server address and source identity. Changing the server can show a different Saved reading list. A Local copy has a separate identity and separate progress. Clearing one server's reading data does not delete that server's conversations.

## Server Quick filter

Quick filter searches the server's conversation titles. It is useful when you remember a title and want a short conversation list. This is narrower than Local Quick filter, which can inspect Local contents and filenames too. If you need to find a phrase buried in server messages, choose **Server text** instead.

## Server text on an unchanged server

Reader can scan the live server's conversation list and normalized messages through the existing server API. Matching uses a case-insensitive literal substring. Results preserve server conversation/message order and the original retained turn index. The first page does not require a full archive scan.

Use **Load more** in continuous-list mode or Next/Previous in page mode to continue. The count has a `+` while more source remains and becomes exact once the scan is exhausted. A sparse query can inspect many conversations before finding another result. Progress and cancellation remain available.

This scan does not copy the records into Local storage and needs no Reader model. Refresh starts a new live search. Failed or cancelled reads do not falsely mark the unscanned remainder as exhausted; retries can continue while retaining displayed results.

## Server meaning and the top-50 boundary

When a server exposes only the first 50 ranked passages and no continuation cursor, the client cannot request further ranked results through that endpoint. Reader does not invent an offset parameter that merely repeats those same results. It shows a **Server search setup** explanation when continuation support is needed.

The suite’s separate `server-patch/` package adds the cursor-pagination integration to the verified ThreadShelf 1.3.0 source baseline. With that extension active, Reader detects it and follows the server's result cursors for text and meaning search. Individual requests remain at most 50 passages, but the overall ranked result set can continue beyond the first 50.

Open **Settings → Sources & files → Server search setup → Open setup files** for the public setup reference. Follow the [server integration manual](../Server/index.md) and obtain the separate `server-patch/` directory from the suite repository. The patcher checks the supported source and creates backups. Apply it on the server host, then rebuild/restart as directed. Reader does not patch a remote server automatically.

Without the extension, the original top-50 meaning result set remains available. Reader does not silently substitute text search or Local data and claim it was server semantic search.

## Server Insights

Use the **Reader / Insights** workspace switch to inspect the selected server's summary endpoint. It presents server-supplied totals, monthly indexed passages, models, providers, role counts when supplied, and longest conversations. This is described in [Reader analytics workspaces](../Activity/index.md).

Insights uses the existing `/api/insights` endpoint and does not require the search-pagination extension. An older server without the endpoint shows unavailable status; Reader does not work around it by downloading the complete archive behind your back.

## Server problems to check

| Symptom | First checks |
| --- | --- |
| Cannot connect | Correct address/port, server running, network reachability and host firewall |
| Empty collection list | Server contains nonempty collections; correct server address selected |
| Search stops at 50 meaning passages | Original API limitation; inspect Server search setup |
| Search results have no final total yet | Live scan still has unvisited conversations |
| Different counts in Insights and Local Activity | Indexed passages versus messages/turns; different source and filters |
| Local data still available when server is down | Expected independent Local archive, not a live server connection |

Related: [Importing and server copies](importing.md), [Applications and sources](../Start/applications.md).

