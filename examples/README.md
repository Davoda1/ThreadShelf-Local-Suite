# Synthetic ThreadShelf examples

These artificial conversation exports demonstrate ThreadShelf Local Suite **1.0.0**. All conversation text, identifiers, dates, model labels, source references and measurements were created for this sample set. No personal conversations, account identifiers, email addresses, credentials or private filesystem paths are included.

The files follow the conversation-and-mapping structure observed in ChatGPT exports. They are **synthetic compatibility examples**, not exports from an account, a complete definition of the ChatGPT format or a promise about future export formats. The observatory and instruments are imaginary within this dataset and do not refer to real projects. Code snippets are display samples and have not been compiled.

## Choose a file

| File | Conversations | Retained messages | Selected-path messages | Purpose |
| --- | ---: | ---: | ---: | --- |
| [01-rendering-showcase.json](01-rendering-showcase.json) | 8 | 22 | 22 | Markdown, code, mathematics, Mermaid, cards, charts, references and image placeholders |
| [02-search-and-branches.json](02-search-and-branches.json) | 6 | 15 | 14 | Literal search, dates, model grouping and a retained answer branch |
| [03-preserved-fallbacks.json](03-preserved-fallbacks.json) | 3 | 6 | 6 | Readable fallbacks for unknown code, missing assets and unsupported chart data |
| **All three** | **17** | **43** | **42** | Combined demonstration |

Counts exclude the non-message root node in each mapping. One conversation has a second assistant answer outside the selected path. The three files use separate conversation and message identities, so they can be imported together. Reimporting the same file does not create new synthetic identities; it is not a method of generating additional activity.

## Import into Local Reader

1. Open ThreadShelf Local Reader and select **Local** mode.
2. Select **Import files**. In the import dialog, enter a collection name such as `Synthetic examples`.
3. Select one or all three JSON files and allow the import to finish.
4. Open a conversation from the list. Start with **Demo 01 · Markdown field guide** or **Demo 06 · Cards and progress**.
5. To inspect the original formatting, use the message or code copy controls. Copying a sample does not run the code.

For the search example, select **Exact phrase** and enter `cobalt lantern`. The expected matches are in Search 01 and Search 02. Search returns passages, so a matching prompt and answer can appear as separate results. The default **Text** mode can also match either word and therefore return other Lantern conversations.

You can use a separate collection to keep the examples recognizable. Importing writes to the Reader archive you selected; it does not modify these source files.

## Open in Local Analytics

1. Open ThreadShelf Local Analytics and choose **Add Source**.
2. Choose **Export files**, then select the three JSON files. Wait for the owned capture and analysis to finish.
3. Check Overview, Activity & Time, Models & Platforms, Content & Code, and Conversations & Structure.
4. Use chart evidence or exact tables to inspect the records behind a count.

Alternatively, after importing into Reader, add that Reader archive through the **Reader archive** route. Use one route at a time when comparing expected totals; selecting both the direct exports and the imported Reader archive represents the same sample conversations in two sources.

The dates span January through May 2026. `demo-model-amber` and `demo-model-indigo` are artificial labels, not claims that a particular model generated these responses. No token usage, latency, price or real benchmark measurements are supplied. Missing measurements should remain unavailable. Analytics has independent definitions for records, turns and content segments; use the measurement contract when comparing a chart with the message counts above.

## Local Alternative

ThreadShelf Local Alternative reads a ThreadShelf server and does **not** directly import these JSON files. To use the examples there, place **only the three JSON files** in a new server import folder, import supported data using your ThreadShelf server's workflow, then connect Alternative to the server. Do not point the server importer at this entire directory: supporting files such as `LICENSE` are not conversation exports. Server import compatibility and any conversion must be checked separately. This example set does not include a server, credentials or a converted server archive.

## What to review

| Conversation | Expected result |
| --- | --- |
| Demo 01 · Markdown field guide | Headings, an aligned table, a blockquote, a checklist, emphasis, inline code and Unicode remain readable. |
| Demo 02 · Everyday code blocks | Common language fences have code controls and preserve source text. |
| Demo 03 · Less common code blocks | Coq, Wren, Stan, Ada, Lisp, Fortran and Mercury samples remain readable; highlighting depends on the available grammar. |
| Demo 04 · Mathematics notebook | Inline and display mathematics render, while fenced LaTeX remains code. |
| Demo 05 · Diagrams and workflow | Two valid Mermaid diagrams render. They describe a process without performing any action. |
| Demo 06 · Cards and progress | Three cards and fixed 40%, 65% and 90% tracks appear. These are not live measurements. |
| Demo 07 · Charts and exact values | Bar, line, ring and scatter presentations retain the saved values. Exact-value tables and chart inspection expose the underlying numbers. |
| Demo 08 · References and image placeholders | Fictional instruments appear in a table. One exact citation binds to a reserved example URL; the unresolved citation and absent image remain clearly labelled. |
| Search 01–05 | Select **Exact phrase** and search for `cobalt lantern` to find matching passages in the first two notes. The other phrases are `silver compass`, `quiet harbor` and `moss garden`. |
| Search 06 · Two possible itineraries | `current_node` chooses the moon route. The retained sun-route answer is outside that path. A branch-aware analysis can distinguish the alternative. |
| Fallback 01 · Literal markup and unknown code | The invented language remains a code block. Fenced component syntax and JSON remain literal code. |
| Fallback 02 · Missing interactive content | The missing-visualization sentence, offline image-query list and archived suggestion remain passive. No reminder or image download is created. |
| Fallback 03 · Unsupported chart contract | The made-up chart type produces a saved-data or source fallback. The following ordinary message text still renders. |

The example.org URLs are reserved demonstration destinations. No external links need to be opened to review the examples. The image placeholders intentionally contain no image bytes. A placeholder is the correct outcome for an absent asset, not an incomplete download.

## Verified behavior

The examples were checked on **21 October 2026** using the actual **Linux portable 1.0.0** applications with isolated demonstration data:

- **Reader:** imported 17 conversations with 42 selected-path messages. Mathematics, both Mermaid diagrams, four chart presentations with exact-value tables, the `3.125` value, tables, code samples, image placeholders and all three intentional fallback conversations were checked. **Exact phrase** search for `cobalt lantern` returned four passages across Search 01 and Search 02. The moon-route answer remained selected.
- **Analytics:** captured 17 conversations, 43 retained records, 42 selected segments and one branch point from the three JSON files, with no adapter diagnostics.
- **Alternative:** displayed the examples through a real ThreadShelf **1.3.0** server with the suite patch applied. Importing only the three JSON files produced 17 conversations and 42 chunks with no import errors; browsing, keyword search, mathematics and chart values were checked.

These checks cover the supplied examples and the tested import routes. Windows execution and DEB installation were not covered by this example review. The synthetic code snippets were not executed or compiled, and absent token, cost and latency measurements were not invented.

## Format and privacy notes

Every JSON file contains a top-level conversation array. Each conversation has a `mapping` of nodes, parent/child links and a `current_node` selecting a path. Messages retain role, synthetic timestamp, content and limited synthetic metadata. All graph links and selected nodes are internal to the same conversation.

The rich markup follows the bounded adapters documented by ThreadShelf Local Suite. It does not execute the original ChatGPT widget runtime. A normal fenced JSON block never becomes a chart solely because it contains numbers. Unsupported content is included deliberately and labelled in the corresponding conversation.

This directory is self-contained. No downloaded account export, private source excerpt, actual profile, screenshot metadata from a personal device or hidden attachment is required.

## License

Copyright (c) 2026 davoda1. These synthetic examples and this README are provided under the [MIT License](LICENSE).
