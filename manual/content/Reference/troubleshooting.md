# Troubleshooting and common questions

## Begin with the source and scope

Before repairing anything, note the app, product version, package identity, selected source/address, collection, active filters and exact error. Reader, Analytics and Alternative are separate programs. For Alternative connection and rendering issues, see the [Alternative troubleshooting guide](../Alternative/07-Troubleshooting.md). Reader Local, Server, Activity and Insights have different data paths and units. Many apparent missing-data problems are a filter or source mismatch rather than storage damage.

## Installation and launch

| Symptom | Checks and next action |
| --- | --- |
| Windows EXE fails after being copied elsewhere | Keep the entire extracted runtime/resources beside the root EXE; re-extract the complete package |
| Linux portable entry is missing or broken | Re-extract with a symlink-preserving utility and keep `app/` with the root/bin links |
| Missing Linux shared-library error | Use the distribution's package dependencies/DEB; do not replace the native launcher with a shell workaround |
| App opens with no expected data after moving program files | Portable programs still use the per-user profile; verify the actual profile path |
| Another writer/process error | Close other Reader instances using the same profile; preserve evidence before touching lease files |
| Window restored off-screen | The app clamps saved bounds to available displays; if a persistent problem remains, preserve the profile and report the display setup |

## Missing or incomplete imports

Check the import completion notes and ensure the input belongs to a supported provider/converted format. Extract 7z/RAR before importing. An arbitrary webpage saved as HTML is not a native conversation export. A valid export can omit attachments, branches, dates, model labels or citation metadata that were visible online.

Repeated imports can correctly report unchanged records. Stopped imports retain completed conversations. Use the same input again and inspect the result rather than assuming cancellation erased all progress.

If a new collection is absent from Reader's selector, look in Database Manager. Empty collections are hidden from the ordinary reading selector until populated. If titles are present but a particular feature is missing, compare the retained source data before blaming the display renderer.

## Search problems

| Symptom | Likely distinction and action |
| --- | --- |
| Known thread absent from a date-filtered search | Use All time; the original creation date may be unknown |
| Expected text absent from Server Quick filter | It searches titles; choose Server text for message content |
| Several results have the same conversation title | Passage search can return multiple messages in one thread |
| Only 1,000 Local results are accessible | Desktop result-window limit; narrow query/collection |
| Server meaning stops at 50 | Original server API limit; inspect Server search setup |
| Count has `+` | Server scan has not reached the final total |
| Incomplete results remain after Cancel | Expected retained partial matches; clear/new query resets them |
| First Local search is slow | Missing compressed text-cache blocks are being prepared |
| Semantic query says text fallback | Model/index unavailable, stale or busy; inspect Search & models status |
| Temporary workspace exhausted | Free temporary space or narrow query; no complete-ranking claim is made |

Do not compare provisional ranking during a long scan with the final sorted order as if the source changed. The final pass can reorder results after global statistics are known.

## Reading and rendering

Missing image placeholders are expected for query-only exports with no image bytes/URL that the supported renderer can use. The selected Corner aperture and Soft horizon designs preserve layout and descriptions without fetching guessed assets.

An unavailable citation pill means the exact source reference could not be bound from the retained message metadata. It is not a prompt to infer a destination from a similarly named source. Unsupported rich syntax, dynamic widgets and malformed diagrams retain readable fallbacks. Copy message/export retains original text even when a repaired diagram or chart is drawn on screen.

If reasoning or a long prompt appears hidden, check **Compact conversation layout** and use the corresponding expand control. If a tooltip number differs from your visual estimate of a bar, use the exact table and unit. Decorative chart shares are labeled calculations; original values remain available.

A bookmark that no longer opens can point to content removed or replaced at the original source or a now-unreachable server. Confirm source and server address first. Reading-save errors require free space/profile write access and a successful retry; do not assume the current scroll position was durably saved after a warning.

## Appearance and video

Platinum Plus in this release has an opaque, unblurred conversation header and Settings window. Professional remains translucent/blurred. Thinking and other dialogs can retain inherited effects, so seeing blur there is not a failure of this palette.

To see welcome video, enable the master wave switch and Show video on welcome page. Fireworks additionally requires Use holiday fireworks and a startup holiday decision. Open conversations keep ordinary waves. Restart after changing the OS date/region or after crossing into a new day if you want reevaluation. Unknown country and rule failures use ordinary waves. Animation/reduced-motion/visibility policies can suppress playback.

If an appearance choice disappears after closing Settings, check whether you used Save settings or Cancel. Operating-system high contrast, forced colors or reduced transparency can deliberately replace translucent materials with opaque readable surfaces.

## Activity and count differences

Check metric, source, date range, timezone and branch policy. Message activity uses message timestamps; conversation-start activity uses source creation or eligible normalized estimates. Server Insights may count indexed passages, which are not original messages. A model filter in Local Activity selects whole conversations that contain the model, so other model messages may remain.

The calendar year selector changes the displayed mosaic year independently of an All-time report. A year change does not prove every chart is restricted to that year. Source coverage explains missing/estimated dates and branch limitations. Rebuilding Activity repairs derived cache state, not missing original metadata.

## Storage and recovery

A compression conversion may succeed while old-data cleanup remains pending. Read Active format and the explicit cleanup message. Use Reclaim recovery space to retry eligible cleanup; do not assume the format change failed just because disk use has not fallen yet.

If Local archive unavailable appears, preserve the diagnostic. Use Try again for a transient access problem or Restore backup for a valid external recovery point. The app preserves damaged storage during recovery restore. Do not erase it before inspecting the restored data.

A Local backup is different from a one-conversation export, and a temporary SQLite file is not the full archive. See [Backup and upgrades](../Data/backup.md) before relocating or resetting data.

## What to include in a useful issue report

Record the exact package filename, OS and architecture, selected source/address type, the action sequence, expected and observed behavior, full error text, and whether a small synthetic example reproduces it. Include screenshots only after checking them for private content. State whether the problem occurs in the desktop app or the self-contained sample Preview: the Preview does not execute real import, compression or backup operations.

Related: [Keyboard and control reference](shortcuts.md), [Privacy](../Data/privacy.md), [Analytics troubleshooting](../Analytics/index.md).
