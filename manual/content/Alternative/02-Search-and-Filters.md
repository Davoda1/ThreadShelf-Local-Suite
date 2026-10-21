# Alternative: browsing, search and filters

## Browse without a query

Select **Library**, clear the search box and use **Filters** to choose the collection. With an empty query, the shelf lists conversations. The available browsing sorts are **Recently updated**, **Oldest first**, **Title A–Z** and **Longest first**. Use the page arrows to move through the list.

A title, source file and conversation identity may differ. Two equal titles do not mean duplicate conversations. Collection choice narrows the available source, while a content search can produce several matching passages from the same conversation.

## Text search

1. Press **Ctrl+K** to focus and select the library query.
2. Choose **Text**.
3. Type the remembered word or phrase and press Enter or the arrow button.
4. Read the excerpt and result notice before opening a hit.
5. Open a hit to retrieve the complete matching conversation and the relevant context.

The query is sent to the server’s text-search API. This is different from **Find in conversation**, which searches the already open thread. It is also different from filtering by a title in a browse-only interface.

## Semantic search

Choose **Semantic** when you remember an idea but not the exact wording. The server needs a working embedding/search setup. Changing the desktop theme or installing a model in another application does not configure this server dependency.

Semantic hits are ranked matching passages. A high rank is a search ordering, not an assessment of an answer’s correctness or quality. Read the surrounding thread before relying on an excerpt. If the server cannot run semantic search, inspect the server error and model configuration; Alternative does not silently label text results as semantic output.

## Collection, role and ordering

**Filters** groups the controls so the conversation list retains vertical space. Collection scope applies to the source being searched. During content search, the role choices are **All roles**, **Your prompts** and **Responses**. Choosing a role restricts the matching passages; it does not remove other roles from the full conversation when opened.

Content-search results retain **Server result order**. The browse sorting options do not re-rank a semantic result set. Clear the query to return to browsing with date, title or length sorting. Read the filter summary and count indicator when a result seems unexpectedly absent.

## Pagination and exact totals

Alternative detects the suite’s supported ThreadShelf search extension. With it, the client follows a cursor-backed search snapshot and can continue beyond the first 50 matching passages. The result count describes the server search population, which can contain multiple hits belonging to one thread.

A stock server that exposes only a bounded top-50 search set remains usable with an explicit limitation notice. Alternative does not call those 50 passages the entire archive. Installing the GUI alone cannot change a server endpoint’s capabilities; use the [server patch instructions](../Server/index.md).

If the server restarts, a result snapshot expires or a cursor becomes invalid, restart the search from page one. Do not compare pages from separate search snapshots as if they were one fixed ranking.

## Save and revisit a query

After running a nonempty query, choose the **+** button beside Text/Semantic to save it. The saved entry retains the server scope, collection, query, mode and role/options. Open the bookmark-shaped **Saved searches** button above the shelf to rerun it. It saves the query, not a frozen result set: subsequent server content can change the matches.

See [Saved work](04-Saved-Work.md) for limits and server scoping, and [Troubleshooting](07-Troubleshooting.md) when counts or pages seem inconsistent.
