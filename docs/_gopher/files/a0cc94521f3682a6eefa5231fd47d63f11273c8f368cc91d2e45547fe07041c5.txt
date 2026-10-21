# Alternative: troubleshooting and shortcuts

## Resolve the source before the symptom

Check whether you are in **Demo workspace** or connected to a real server. Confirm the server address, current collection, selected navigation view, query and role filter. Pins, Recent and Library intentionally show different populations.

| Symptom | Checks and next action |
| --- | --- |
| Cannot connect | Server is running; address is the final HTTP(S) base URL; correct port/prefix; reachable network; Host/Origin rules and firewall permit it |
| Browser server works but app does not | Check interactive login, proxy authentication or redirects; this release does not implement those login flows |
| No conversations | Choose a nonempty collection or All collections; clear query/filters; confirm the server contains indexed data |
| Search has several hits with one title | Search returns passages; open them to inspect their common conversation |
| Search ends at 50 | Read the bounded-result notice; use the verified server integration if complete pagination is needed |
| A later search page fails | Search snapshot may have expired or the server restarted; rerun from the first page |
| Semantic search fails | Inspect the server’s embedding/model setup and error; desktop appearance does not configure server models |
| Pin or Recent entry cannot reopen | The reference remains local but the referenced server/source conversation must still exist and be reachable |
| Rich image/widget is absent | Required metadata or media may not exist in the export/server normalization; inspect the source and fallback text |
| Diagram cannot render | Inspect original source; automatic repairs cover only known deterministic cases |
| Saved preferences could not be loaded | Changes remain session-only and saves are blocked; close the app, preserve the profile, restore a good backup or move aside only this profile, then restart |
| Preference does not survive restart after a successful load | Check save-error notification, profile permissions and available storage; preserve the existing state file |
| Startup cover remains visible | Read the error, correct it and choose Retry startup |

## Keyboard reference

| Shortcut | Action |
| --- | --- |
| Ctrl+K | Focus/select library search and reveal the shelf |
| Ctrl+F | Find within the open conversation |
| Enter in Find | Next match |
| Shift+Enter in Find | Previous match |
| Ctrl+Shift+F | Toggle focus mode |
| Ctrl+\ | Show or hide the conversation shelf |
| Esc | Close the active relevant panel or leave focus mode |

Keyboard actions do not override a currently open modal dialog. Esc closes the relevant active UI in context; it is not a server-disconnect or data-delete command.

## A useful issue report

Report the app version **1.0.0**, operating system, package filename, source type, steps, expected result, actual result and exact nonsecret error. State whether it happens in the native desktop app or standalone demo. Supply a minimal synthetic conversation if that reproduces the issue. Review screenshots and copied URLs before posting them.

Use the [suite issue tracker](https://github.com/Davoda1/ThreadShelf-Local-Suite/issues). Issues in the unmodified server itself belong to the [upstream ThreadShelf project](https://github.com/ChrystianSchutz/ThreadShelf); explain whether the search patch is applied.
