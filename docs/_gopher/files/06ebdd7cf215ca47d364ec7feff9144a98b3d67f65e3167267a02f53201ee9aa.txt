# Alternative: reading, rendering and export

## Open and navigate a thread

Select a conversation or matching passage from the shelf. Alternative fetches the complete supported thread from the selected server. The heading shows the conversation title and retained date/context; the reading summary includes message and word counts and an estimated reading time.

Scroll the reading pane independently of the conversation list. The status bar shows progress through the rendered thread. Reading position is saved locally for that server/conversation identity. If the underlying content or window layout changes substantially, the restored visual position can differ.

Use **Show conversation outline** to list user prompts. Select a prompt to jump to the corresponding message. The outline’s **At a glance** metrics describe the current normalized conversation, not the whole server and not a quality rating. **Back to the beginning** returns to the top of the open thread.

## Find inside the current conversation

1. Open a conversation and press **Ctrl+F**, or choose the toolbar’s find icon.
2. Type a word or phrase.
3. Inspect the match count and highlighted occurrence.
4. Press Enter for the next match or Shift+Enter for the previous match. The arrow buttons provide the same navigation.
5. Close the find bar to remove the find highlights.

Find acts on visible/available rendered content in the current thread; it does not send a new archive query. A matched collapsed details section can open so you can see the target. A missing export field cannot become searchable merely by toggling a display preference.

## Code, mathematics and diagrams

Code blocks use offline syntax highlighting with VS Code Light+ or Dark+ colors following the application appearance. Each code block can be copied independently. Highlighting decorates the original text; it does not execute code or correct the program.

Supported mathematical notation renders locally with the bundled MathJax 4 assets. Mermaid diagrams render from their retained source. If a diagram has a common supported formatting defect, deterministic repair candidates may make it render. The interface identifies a repaired diagram and allows inspection of original/repaired source. Ordinary copying and Markdown export preserve the archived source; **Copy repaired** is a separate, deliberate action.

Not every invalid diagram can be repaired. A readable source/error fallback is preferable to silently inventing a different diagram. Inspect the source if the display does not represent what you expected.

## Rich exported elements

The renderer supports applicable tables, charts, cards, citations, math, diagrams and image-placeholder behavior from the suite’s conversation renderer. These features depend on metadata actually supplied by the server. A normalized export may not contain all provider-specific fields needed to reproduce the original web interface.

Available images load within the conversation according to **Settings → Reading & appearance → Images**: Click to load only or Load automatically. Unavailable images retain visible placeholders. Alternative does not provide Reader’s persistent image resource cache. External destination links require an explicit action. The application does not infer hidden reasoning or reconstruct missing attachments. **Show reasoning when available** displays only reasoning that exists in the retained conversation.

Useful JSON-only assistant and reasoning responses render as formatted, syntax-highlighted JSON; empty or internal-only responses remain hidden. Whole-message copying and export retain the source. Exported file citations use readable filename chips and a document icon; a label does not create access to a missing attachment.

## Listen to a message

The desktop application can read an individual message through the optional [Text-to-Speech controls](08-Text-to-Speech.md). Enable speech in Settings, choose a voice and select a message speaker button. This does not create a new answer or change the retained server conversation.

## Copy or export

**Copy conversation** copies plain conversation text to the clipboard. **Export conversation** opens the desktop save flow for a Markdown file. The export includes the conversation title and role-labelled messages; it is a document copy rather than a backup of server configuration, search indexes, pins or settings.

A Markdown reader may render features differently from Alternative. Preserve original source exports when full provider fidelity is important. The exported file and clipboard contain conversation text: review them before sharing. Browser demo downloads use the browser’s normal save behavior.

See [appearance and data](05-Settings-and-Data.md) for reading size, width, reasoning and state storage.
