# Reader duplicate cleanup

Open Settings → Database Manager → Deduplication. This is the fifth manager
section and uses the existing application controls, themes and spacing. Manual
cleanup opens a separate in-app review surface, outside the settings panel.

## Collection and provider boundaries

Separate collections always retain independent copies, even when every message
matches. Only an explicit merge brings those records together for comparison.
Within a collection, provider identity takes precedence: a VeniceAI conversation
using a Grok model is still VeniceAI and does not receive Grok export cleanup.

The new matching pass expands existing import/merge behavior. It matches title
and actual model identity, then compares the ordered conversation contents.
Export-specific IDs and bookkeeping do not establish a meaningful difference.
Different model variants, substantive reasoning, attachments, message order and
answered branches remain meaningful. Missing model data is not proof of a match.

Identical conversations retain one entry. If the complete shorter history is an
exact prefix of the longer history, the longer entry survives. Different answered
histories remain separate. The comparison is of saved contents, not screenshots,
rendered HTML or a similarity score.

## Grok/xAI export artifacts

These rules depend on the provider, not the selected AI model:

- A conversation containing only one user prompt and no substantive AI response
  is eligible for automatic prompt-only cleanup, subject to attachment/content
  preservation checks.
- Where two matching conversations have the same preceding history, but one ends
  in one or more unanswered user prompts and the other continues with an AI
  response, the unanswered variant can be superseded. The trailing user prompts
  may be the same or edited. The answered continuation survives.
- Divergent answered histories are not discarded under this rule.

## Automatic and manual operation

Automatic checks run after successful import/server-copy batches and applicable
collection operations. Existing records can be rechecked manually. The review
shows the affected collection, survivor/removal relationship and reason before
confirmation. If the archive changes after review, a stale result must be reviewed
again rather than applied to different data.

Prompt-only cleanup for other providers is an independent optional setting,
disabled by default. Enabling its automatic mode requires explicit confirmation.
Manual review can include that category without changing the automatic preference.
Text-only single-user records with no substantive response/tool/reasoning content
qualify; attachments are not silently discarded by this convenience rule.

Bookmarks, saved reading references and relevant retained source information
follow the surviving conversation. The current conversation/list and derived
indexes are refreshed after cleanup. Explicit prompt-only deletion has no survivor.
Regular archive backups remain available through Storage & backup.
