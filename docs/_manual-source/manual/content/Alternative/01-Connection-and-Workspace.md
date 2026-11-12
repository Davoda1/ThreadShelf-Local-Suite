# Alternative: connection and workspace

## Connect your own server

1. Install and start ThreadShelf separately. The suite’s [server integration](../Server/index.md) is optional for basic browsing but supplies complete supported search pagination.
2. Start Alternative and choose **Connect your server** on the welcome page, or select the connection card above the conversation shelf.
3. Enter the final server URL, including `http://` or `https://` and a nondefault port where required. For the same machine, use an address such as `http://localhost:3000`.
4. Choose **Connect server** and wait for the connection status and collection list.
5. Open **Filters**, choose a collection or All collections, and select a conversation.

If your installation serves ThreadShelf beneath a URL prefix, retain the required prefix. Do not paste a web UI page URL, a search URL or a conversation URL in place of the server base address. The address must be reachable from the computer running Alternative.

Alternative does not launch the server. The server’s network binding, firewall and permitted Host/Origin configuration must already allow the chosen address. Do not solve a connection error by exposing a private archive on an unrestricted public interface.

## Connection boundaries

This release does not offer a bearer-token field, embedded URL credentials, reverse-proxy login or redirect-based authentication. Enter the final supported HTTP(S) endpoint. If your server needs an interactive login flow, use the server’s supported browser client or configure an appropriate deployment rather than inserting credentials into the URL.

The main process performs the permitted server requests; the renderer does not freely browse network endpoints. Selecting a normal external link deliberately opens your browser. Conversations are retrieved on demand, not automatically copied into a permanent local archive.

## Map of the interface

| Area | Main controls |
| --- | --- |
| Left navigation rail | Home/logo, Library, Pins, Recent, Settings |
| Conversation shelf | Connection card, search box, Text/Semantic modes, Filters, saved searches, result list and page controls |
| Reading toolbar | Show/hide shelf, pin, find, copy, Markdown export, prompt outline and focus mode |
| Reading pane | Conversation title, message content, code/math/diagrams and end-of-thread navigation |
| Optional outline | User prompts and a compact reading summary |
| Bottom status bar | Current source/context, reading progress and Reading settings |

The toolbar’s conversation actions are disabled when no thread is open. Hiding the shelf changes the layout; it does not disconnect from the server or erase the current search.

## Compact windows and focus

The minimum window is **680 × 540**. The conversation list and reading pane have separate internal scroll areas. Use the shelf toggle or **Ctrl+\** to create reading space. **Ctrl+Shift+F** enters or leaves focus mode; **Esc** can leave focus. The visible **Exit focus** action also returns the normal controls.

The prompt outline may close after a selection at narrower sizes so the selected content has room. This is a layout adaptation, not loss of the outline entries.

## Startup and retry

A full-window loading cover follows the chosen appearance while preferences initialize. A slow server does not prevent the local workspace from opening. If startup fails or stalls, the cover offers **Retry startup**. Correct the reported issue first, then retry. Reduced-motion preferences suppress unnecessary animation.

Continue with [search and filters](02-Search-and-Filters.md).
