# Reader duplicate cleanup

Open **Settings → Database Manager → Deduplication**. **Review conversation cleanup**
opens a separate in-app view for existing records. Import and server copy use the
same rules while processing incoming records; they do not require a separate
cleanup operation after the transfer.

## Identity and collection boundaries

Comparisons remain inside one collection. Separate collections retain independent
copies, even when all messages match. Provider identity is normalized independently
of the selected model: VeniceAI using a Grok model is still VeniceAI.

For ChatGPT, Anthropic, Meta and other providers with reliable IDs, provider plus
conversation ID establishes identity. Two different IDs are kept even if titles
and user prompts are identical. Repeated identical snapshots retain one record;
when a shorter snapshot is a complete prefix of a fuller snapshot, the fuller
record survives. Other snapshots with the same reliable ID resolve to the newest
record. Message order, attachments and structured content are compared from source,
not rendered HTML or similarity scores.

VeniceAI IDs are unreliable. Its records instead need matching provider, title,
actual model and compatible complete source history. Missing model information or
divergent answered histories are not proof of a match. Content matching preserves
meaningful attachments, reasoning and other structured data.

## Grok/xAI export artifacts

Grok rules depend on the provider, never merely the selected model:

- A text-only conversation with one user prompt and no substantive response,
  reasoning, tool output, attachment or other content is automatically deleted.
  Repeated source wrappers and empty-response diagnostics do not constitute an
  answer, but unknown substantive fields remain protected.
- Matching conversations with an answered shared history can contain an unanswered
  trailing variant and an answered continuation. The answered continuation survives;
  the superseded variant is deleted, even when its trailing user prompt was edited.
- Different answered branches are preserved by this cross-ID content rule.

## Processing and review

Imports and server copies merge and deduplicate during processing with bounded
parallel workers. Existing archives can be reviewed manually. The review shows
progress, affected collections, reasons and survivor/removal relationships. It also
shows expanded conversation database size and the lowest free-space value among
checked volumes; separate search indexes and audio caches are excluded from that
expanded size. Mutations check available disk space before writing.

The review can be closed and reopened while scanning or applying changes. Progress,
completed results and selections remain available. A changed archive invalidates
stale selections and requires a new scan. Only selected review entries are applied.

**Automatically delete single unanswered prompts from providers that are not Grok**
is an independent setting, disabled by default. Enabling it requires confirmation.
Review can include those providers without enabling their automatic deletion.

Superseded records are deleted rather than retained as hidden copies. Cleanup also
removes obsolete embedded copies from older archives while retaining the current
conversation. Saved reading and bookmarks follow a survivor; prompt-only deletion
has no survivor. Archive storage, derived indexes and the displayed conversation
are refreshed. A storage reclamation failure is reported separately from saved
conversation changes. Regular backups remain available through Storage & backup.
