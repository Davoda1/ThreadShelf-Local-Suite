# Reading, navigating and exporting conversations

## Open and orient yourself

Select a conversation row from the ordinary list or a search result. An ordinary open can restore a saved reading position. A passage result takes you to the matching retained turn. The header identifies the title and source, while message role labels and colored edges distinguish user, assistant, thinking and other retained messages.

A displayed message count refers to the stored thread representation. It need not equal all branch nodes from a provider's original export. Reader's analytical branch controls do not rewrite the conversation you are reading.

## Compact messages and long prompts

**Settings → Reading → Compact conversation layout** is enabled by default. It allows long user prompts and thinking blocks to collapse. A long prompt shows a shortened area with **Show full prompt**. Activate it to reveal the entire retained prompt; **Collapse prompt** restores the compact view. A short prompt has no unnecessary expansion control.

Thinking content, when supplied by the export, has a reasoning expand/collapse control in the thinking header. This is archived provider content, not newly generated reasoning. With Compact conversation layout disabled, content remains expanded and the collapse controls are hidden or disabled as appropriate.

The five prompt-button appearances in Settings only change the position and styling of the control. They do not shorten the underlying message, alter exports, change search scope or delete text. Search and navigation can reveal collapsed content to reach a target.

## Conversation outline

The narrow conversation navigator provides a rail and an expandable **Conversation outline**. It includes prompts and responses with short excerpts and tracks the current reading location. The prompt count refers to user prompts; assistant and thinking turns do not increase that count.

Hover the rail to inspect the outline, or click to pin it open. Choose an entry to navigate to that turn. Keyboard focus also opens the outline; Tab can move from the trigger into the first outline entry. **Escape** dismisses it. When it is not pinned, leaving the navigator restores the compact presentation.

The outline is useful for long conversations whose prompt titles or opening words are more recognizable than a scrollbar position. It navigates to retained message anchors, not guessed percentages of the original export.

## Find in the open conversation

Use **Find in conversation** or **Ctrl+F**. Enter the text and use previous/next controls to visit matches. The counter shows the current and total matches. Clear removes the query; the close control or Escape closes the find bar and clears the active find state.

This is different from archive search. Find examines the open conversation; archive search locates conversations/passages across the current source and filters. If you are unsure which is active, check whether the input is above the reading pane or in the list's Search drawer.

## Bookmarks and reading progress

Every displayed message provides a bookmark control. Click it once to save that message; click again to remove the mark. A bookmark records the conversation identity, retained turn and role. **Saved reading → Bookmarks** lists bookmarks for the active Local source or current server address. Selecting a bookmark reopens the corresponding conversation and target message.

Reading progress is updated as you read. **Resume** restores the saved position; **Read from start** deliberately returns to the start. The Recent tab in Saved reading lists recent locations. Closing a conversation returns to the welcome page without discarding the conversation’s saved position or bookmarks.

Local and Server saved reading are independent. A Local copy of a server thread does not inherit the server reading position automatically. Moving a Local conversation through Database Manager preserves identities; copying produces an independent identity, with copying bookmarks offered as a separate option.

If the app reports that reading progress could not be saved, it retains the failed write for retry on a later reading action. Treat the warning as unresolved until saving succeeds; check free space and profile access rather than assuming a remembered screen position is durable.

## Copy text and code

**Copy message** copies the retained source text for that message. A rich card or chart can therefore copy as the original component syntax rather than as the rendered layout. This is intentional: the renderer's display transformations do not overwrite the archived message.

A code block's **Copy** button copies that block's code. The language label is used for syntax highlighting when a bundled grammar is available; an unrecognized label still leaves readable plain text. Copying code does not execute it. Check copied commands before running them in a terminal.

**Settings → Reading → Wrap long code lines** and **Show code line numbers** are independent, default-off display preferences. Wrapping fits long source lines to the block width. Numbers identify logical source lines, including blank lines; wrapped continuations do not become new source lines. Numbers appear only in Code view and are never added to copied text or exports. HTML, SVG, Mermaid and chart Render views have no line-number gutter. Returning to Code restores the selected presentation.

![Reader 1.4.5 Code view with wrapping and display-only line numbers enabled](../Images/reader-145-code-options-dark.png)

## Markdown, mathematics and diagrams

The renderer supports Markdown text, headings, lists, tables, code and mathematics with bundled rendering assets, including MathJax 4. Large tables and code use contained scroll regions. Mermaid diagrams render locally where the retained source can be interpreted. The renderer can apply bounded repairs as a reading aid.

A repaired Mermaid diagram can expose a **Repaired / Original** source toggle. The diagram-level Copy control copies the displayed Mermaid source. Whole-message Copy and conversation export preserve the original source text; they do not silently replace it with the repaired diagram code. If a diagram remains unsupported or malformed, readable source is retained instead of inventing a missing diagram.

## SVG source previews

A code block with no language tag, or an `svg` or `xml` tag, can offer **SVG / Code** when it contains one complete, valid SVG document. Raw SVG, strict Base64 and `data:image/svg+xml;base64,` forms are supported. HTML containing an SVG, extra prose or elements, malformed content and other language tags keep their code presentation.

The initial view is Code. Select **SVG** for the image and **Code** to return. Copy preserves the original source, including an original Base64 representation. SVG preview is image-only: scripts and external resources do not run or load. The optional line-number gutter is hidden while the image is rendered.

## Rich cards, charts and exact values

Saved supported components can appear as cards, layout groups, allocation bars, inline entities, citations, static illustrations and charts. These are local interpretations of declarative content already present in the archive. They are not the original live ChatGPT widget service.

Supported saved Grok cards, citation markers and artifacts, and ChatGPT entities, source/file citations and chart records, are interpreted from the metadata retained in the export. Unknown or incomplete records keep a readable fallback or source view. Archived tools, tasks and automation suggestions do not execute.

For supported data charts:

- Hover or focus a mark to inspect exact values.
- Bars highlight the active item. Lines and areas can share a category crosshair across series.
- Scatter charts retain numeric X and Y coordinates.
- Use the **Exact values** disclosure/table when you need the saved numbers independent of chart geometry.
- Circular charts label any calculated share of the total while preserving raw values in the exact-value table.
- Escape dismisses inspection panels where provided.

A suffix such as `%` or a unit is presentation metadata; it does not authorize multiplying a saved numeric value. A saved static SVG illustration may look like a chart but has no inferred data table or interactive series unless an actual supported chart contract is present.

## JSON-only responses

Useful JSON-only assistant and reasoning responses render as indented, syntax-highlighted JSON. Empty or internal-only responses remain hidden. Original message copying and export preserve the retained source, while copying a formatted code block uses its displayed text. Embedded HTML inside JSON remains literal text.

## Missing images, citations and dynamic content

Available linked images follow **Settings → Reading → Online images**: load automatically or click the placeholder to load. Embedded images display directly. Reader’s separate **Database Manager → Resources cache** can retain loaded images for offline reuse. The image cache is independent of the speech audio cache.

Query-only image exports display local theme-aware placeholders: **Corner aperture** beside text and **Soft horizon** in full-width layouts. Their saved size, aspect ratio and description help preserve the layout. They do not trigger an image search or fetch a guessed photograph.

Exported ChatGPT/Codex file citations display a readable filename, document icon and known file-type label where available. These display-only labels do not grant access to a missing file or invent a download destination.

A citation opens a destination only when the retained message's metadata binds the citation’s exact identifier to a safe explicit URL. Otherwise the compact citation pill retains the original identifier and indicates that the source is unavailable. The renderer does not infer a URL from a similar title, unrelated message or source-list order.

Automation suggestions, maps, dynamic components and unsupported markup remain passive labels or safe source where no supported local representation exists. No schedule is created by reading an old automation suggestion. No map tiles, live exchange rates or missing interactive data are invented.

## Safe formatting and HTML previews

Ordinary prompts and responses can show safe inline HTML formatting, including `<mark>` and spans with bounded text/background colors. Scripts, event handlers, URL-bearing CSS and styles that affect the application are rejected. Numeric VeniceAI markers such as `^1^` appear as small theme-aware badges; they do not invent a source URL. Code and mathematical expressions remain protected.

Complete HTML5 documents in unlabelled, `unknown`, `html`, `htm` or `html5` code blocks can offer **Code / Render**. The page must include its doctype and explicit html, head and body structure. Fragments, malformed or multiple documents, escaped examples and blocks labelled as programming languages stay code. The initial view is Code. Copy and download always use the original source; standalone SVG keeps its separate image-only preview.

The HTML viewport uses the code block’s full interior width and a responsive 16:9 ratio, without an extra frame or surrounding margin. It stays clipped inside the reading pane during initial display, application zoom, resizing and scrolling. The loading surface is transparent against the code-block background; a failed preview shows an error with its source available. These HTML-specific dimensions do not change Code, SVG, Mermaid or chart layouts.

![Reader 1.4.5 HTML preview uses the code-block interior with no line-number gutter](../Images/reader-145-html-preview-light.png)

Render opens a temporary native sandbox. The page may run its own JavaScript, but has no Node.js or application API and cannot read the archive, settings or arbitrary local files. Permissions, popups, downloads, navigation and form submissions are restricted. Leaving the conversation or returning to Code destroys the preview and its temporary state.

**Allow external resources in HTML previews** starts enabled in the reading settings. It permits guarded public HTTPS resources only; local/private destinations and unsupported protocols are blocked. Turning it off stops active previews and blocks further external requests, while embedded scripts/assets remain usable. It does not control ordinary conversation images or configured providers and cannot undo a completed request. The standalone offline demo does not execute these native previews.

## Listen to a message

Enable the optional [Text-to-Speech](text-to-speech.md) feature to add speaker buttons to readable messages. Each button opens the playback bar for that message; saved or retained matching audio can be reused. Speech controls do not alter the archive, copying or export.

## Export the open conversation

1. Open the conversation you need.
2. Click **Export** in the conversation header.
3. Choose **Export Markdown** or **Export original JSON**.
4. Choose a destination in the native save dialog.
5. Verify the resulting file before using it as an input to another application.

Markdown preserves the retained message/code text in a readable document. The JSON option serializes the open conversation object, including retained source fields where available. Despite the interface wording, it is not guaranteed to be a byte-for-byte reconstruction of the provider's original entire export file. Neither option is a complete Local backup with all collections, bookmarks and reading positions.

Related: [Search](search.md), [Appearance](appearance.md), [Backup](../Data/backup.md).
