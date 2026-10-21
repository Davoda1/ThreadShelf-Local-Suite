# Archive search

## Choose a method that answers your question

Archive search operates on the active Local or ThreadShelf Server source. The method determines whether you are finding conversations by metadata/content or ranked individual passages. The same text can therefore produce different counts in different modes.

| Method | Where it searches | When to use it |
| --- | --- | --- |
| Local Quick filter | Conversation titles, contents and source filenames | Find a recognizable thread or filename quickly |
| Local Text search | Ranked retained text passages and titles | Find the most relevant wording across a collection |
| Local Exact phrase | Case- and accent-insensitive literal substring in message text and titles | Locate a particular phrase or distinctive fragment |
| Local Fuzzy search | Ranked word matches including limited typographical edits | Find a term whose spelling may differ slightly |
| Local meaning | Similarity through Reader's optional built-in embedding model | Find concepts expressed with different wording |
| Hybrid search | Combined text and built-in semantic rankings | Use wording and meaning together |
| Ollama meaning | Similarity through the selected external Ollama embedding service | Use an embedding model you manage separately |
| Server Quick filter | Server conversation titles | Locate a named server thread |
| Server text | Live message text or the server extension's indexed passages | Search server content without copying it to Local |
| Server meaning | The server's own semantic index | Use the server's meaning-search capability |

Only the three meaning-related Local methods require model setup. Server search uses the server's facilities, not Reader's downloaded built-in model or Reader's Ollama selection.

## Run and refine a Local search

1. Select Local and the appropriate collection.
2. Open the Search drawer or press Ctrl+K.
3. Type a query.
4. Open **Search options** through the method control.
5. Choose the method, provider, role and conversation-start period as applicable.
6. Choose **Search** to run now, or **Save without searching** to keep the options for later.
7. Inspect result excerpts, then open a result to reach the matching retained original turn.
8. Narrow the collection or query if the result window contains too many matches.

The role choices include all roles, User, Assistant and Thinking. The role filter is disabled for Quick filter because that mode returns conversations, not role-specific passage matches. Provider filters distinguish the retained import family; they do not contact the original provider.

## Text syntax and matching

Text search uses a ranked scan with word frequency statistics, title boosts, phrase boosts and query-coverage weighting. A conversation title contributes to relevance, so a result can rank highly even if the result snippet does not look identical to the query.

For ranked Text and Fuzzy search, double quotes require a phrase, and a leading minus excludes a word or quoted phrase:

```text
"keyboard layout" USB -piano
```

This looks for the required phrase together with relevant USB wording, while excluding the unwanted piano term under that search grammar. Use a short distinctive phrase first, then add exclusions deliberately. A query with too many broad words can produce a slower, less useful result set.

Exact phrase is a case- and accent-insensitive literal substring method. It is useful when you remember a sentence fragment, identifier or error text. It is not a regular-expression search. Fuzzy matching supports a one-character insertion, deletion, substitution or adjacent transposition for eligible words of at least four characters. It is not unlimited approximate matching or an AI explanation of your query.

Ranked Local queries accept up to 4,000 characters and use at most 40 distinct positive word tokens. Quick filter accepts up to 8,192 characters. These limits protect the search pipeline; practical queries should normally be much shorter.

## Conversation-start periods

The **Conversations started** selector offers All time, Last week, Last month, Last 3 months, Last 6 months, Last year, Last 2 years and Last 5 years. It filters conversations by their original source creation date. Once a conversation qualifies, all retained messages in that conversation can be searched, including messages written outside that time window.

This is not an import-date filter or a filter on each matching message's timestamp. Conversations without a source creation date appear only in **All time**. If a known conversation disappears when you choose a period, return to All time before concluding that the conversation’s messages are absent.

Local Activity can estimate the start of some normalized conversations from their earliest retained message. Search's age filter deliberately does not adopt that estimate. The two views can therefore select different populations for a superficially similar date range.

## Understand totals and the result window

The search service considers all eligible passages under the query and filters. The desktop displays the existing **top 1,000 Local results** window. Pages and continuous scrolling navigate within that returned window, not through unlimited later ranked matches. If the interface says it is showing the top results out of a larger matching count, refine the query or collection to reach another portion of the archive.

A conversation can have several matching messages. Passage result counts are therefore not necessarily unique-conversation counts. Quick filter returns conversations, while Text, Exact, Fuzzy and meaning searches return matching passages. Compare like with like.

Completed Local search pages reuse one result snapshot. A changed archive or expired snapshot restarts the result session from page one so results from different rankings are not mixed. Ordinary list sorting remains separate from ranked search order.

## First searches and long searches

The first Local query can prepare a compressed searchable-text cache by reading missing or changed conversation content. **Settings → Search & models → Prepare text search** performs that preparation explicitly. Subsequent searches reuse valid cached text; they still scan the eligible text and can take time across a large archive.

For a Local search running beyond 45 seconds, results can append provisionally as matches are found. Final relevance ordering happens when the scan completes. A result moving later in the list after completion is expected, not evidence that the stored text changed.

**Cancel** retains the visible incomplete matches and labels them accordingly. Clearing the query or starting a new query discards that partial result state. An estimated percentage reflects known processed work, not a guaranteed finish time. Wait for the complete state when you need an exact total or final ranking.

## Disk and memory implications

Search uses bounded compressed text blocks and a temporary candidate database. The candidate workspace has a 512 MiB ceiling. If that space or the temporary volume fills, search reports an error instead of silently presenting a complete-looking partial ranking. Narrow the query or free temporary disk before retrying.

The workspace ceiling is not a total RAM limit. The open conversation, renderer, catalog, model inference and caches require their own memory. A single huge conversation can still need substantial memory when opened even though the complete archive is not expanded at once.

## What a result preserves

A result retains the original message index and role. Opening it navigates to the correct retained turn, including sources with gaps in their original index numbering. The excerpt is a convenience preview, not a replacement for the source message. Use the open conversation's Copy or Export controls when you need the retained original text.

Search highlights do not change stored content. Clearing a search removes the active filtering state, not your conversations. A stale semantic index can produce an explicit text fallback; read the notice rather than treating those results as proof that meaning search ran.

## A reliable search sequence

If you remember a precise phrase, try Exact phrase in All time first. If you remember a subject but not wording, try Text search with a few discriminating terms. Add provider/role filters only after confirming that they match the retained records. For a conceptual query across languages or paraphrases, set up Local meaning and build a current index. Keep ordinary text search available as a baseline for checking results.

Related: [Models and semantic search](models.md), [Server search](server.md), [Troubleshooting](../Reference/troubleshooting.md).

