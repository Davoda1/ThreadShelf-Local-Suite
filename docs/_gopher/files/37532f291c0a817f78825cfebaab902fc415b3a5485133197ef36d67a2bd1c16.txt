# Appearance, accessibility, storage and backup

[Analytics manual](index.md)

## Appearance controls

Open the appearance/settings dialog or **Sources & settings → Appearance**. Changes in the form take effect when you choose **Save**. Closing an unsaved dialog discards that draft. Analytics preferences are independent of Reader.

| Setting | Available choices or range | Effect |
| --- | --- | --- |
| Interface theme | 17 palettes listed below | Colors and decorative interface materials |
| Appearance | System, Light, Dark | Chooses light/dark rendering independently of palette |
| Code theme | 10 themes listed below | Syntax colors in displayed code, independently of interface colors |
| Language | English, Hungarian, German, French, Japanese | Interface text and locale formatting |
| Timezone | Local, UTC, Europe/Budapest, Europe/Berlin, America/New_York, Asia/Tokyo | Default analytical timezone; saving also updates the current shared filter timezone |
| Automatic refresh interval | 0–1440 minutes | 0 means off; a positive interval enables automatic source refresh checks |
| High contrast | On/off | Improves readability and reduces decorative ambiguity |
| Reduced motion | On/off | Reduces motion effects |
| Reduced transparency | On/off | Uses more solid interface surfaces |

The 17 interface themes are **Default, Ocean, Forest, Ember, Amethyst, OLED, Modern, Modern OLED, Platinum, Vellum, Prism, Nocturne, Garnet, Smoked Glass, Harbor Haze, Amber Room and Opal Daylight**. The Reader-specific Professional and Platinum Plus themes are not part of Analytics 1.0.0.

Default and Modern share Reader-inspired base light/dark colors; Modern adds neutral depth effects. The four Glassy palettes use gradient backdrops, translucent fills and frosted blur on panels such as the header, navigation, dialogs and evidence. Transparency affects decorative surfaces, not text opacity. High contrast, reduced transparency, forced colors or unsupported blur rendering can cause solid fallbacks. A solid surface under those settings is expected behavior.

Code themes are **Default, VS Code, GitHub, Monokai, Nord, Dracula, Solarized, Codex, Xcode Classic and Ayu**. Changing the code theme does not replace the interface theme. Original model/provider/conversation labels are not automatically translated with the interface.

The minimum desktop window is **680 × 540**. The workspace, exact tables and evidence pane can scroll independently. Saved window bounds are restored within the available display area. At a compact size, scrolling a workspace is normal; it is not evidence that source data was cut off.

## Owned storage

Analytics stores captures, derived indexes, configuration, saved views, exploration presets and annotations in a dedicated application-data directory:

| Platform | Analytics data directory |
| --- | --- |
| Windows | `%AppData%\ThreadShelf Local Analytics\` |
| GNU/Linux with XDG configuration | `$XDG_CONFIG_HOME/ThreadShelf Local Analytics/` |
| GNU/Linux default | `~/.config/ThreadShelf Local Analytics/` |

These are different from the Reader paths. Installing or replacing a portable application folder does not by itself relocate this profile. The app remembers the last source/destination picker directories and falls back when a saved location no longer exists.

Sources & settings shows total owned storage and a **Storage breakdown** dialog. Categories distinguish legacy baseline files, mutable state/settings, captured blobs, derived indexes, work data and routine-history references. A history-reference size describes how retained captures are referenced; it should not be blindly added to total bytes as if all referenced content were an additional physical copy.

The size display includes exact bytes plus a scaled size. Values below 10,000,000 bytes use KiB; from 10,000,000 through 2,000,000,000 bytes use MiB; larger values use GiB. The thresholds are decimal byte counts, but the scaled KiB/MiB/GiB conversion uses powers of 1,024. Two decimal places follow the selected locale.

## Maintenance controls

| Control | What it changes | What it does not change |
| --- | --- | --- |
| Refresh | Builds a new validated capture from the original source | Reader preferences, conversation files or export contents |
| Rebuild analytical indexes | Recomputes derived indexes from complete owned captures | Original Reader/export source; source access is not required |
| Remove source | Removes the active v2 source registration/capture/indexes | Original exports, Reader data and the preserved legacy rollback baseline |
| Clear Analytics caches | Removes active v2 analyses and indexes while retaining registrations/preferences | Reader data, original exports or reports already written elsewhere |
| Capture history removal | Removes the selected removable routine historical capture | The active capture and separately protected baseline/recovery data |

Source removal and cache clearing use an in-window confirmation. Read the confirmation text before applying the change. After cache clearing, a disconnected original source may need to be reconnected and refreshed before analysis of that source can be recreated. Retaining a source registration is not the same as retaining the full captured source content.

Removing an automatically discovered Reader source also records that it should not be automatically reattached. **Find Reader archive** is the explicit reconnection action. To make an analytical exclusion without removing the source, use the conversation exclusion annotation instead.

## Back up the analysis state

The interface does not expose a complete application-state backup/restore button. For a file-system backup of your Analytics state:

1. Finish or cancel captures and close Analytics completely.
2. Copy the entire **ThreadShelf Local Analytics** data directory to your backup destination.
3. Keep the directory structure and all included files together, including ownership/version markers and legacy baseline material.
4. Keep any separate original export backups and Reader backups according to their own policies.
5. Keep exported reports separately when they are part of the record you want to preserve.

Copying only a report does not preserve sources, captures, views or annotations. Copying only an index is not a complete backup. The whole closed application-data directory is the useful unit because current state can refer to versioned capture and generation files within it.

For a cautious restore, close Analytics, preserve the current profile as a separate backup, and restore the complete saved Analytics directory to the appropriate profile location before reopening the matching application version. Avoid merging individual state/index files from unrelated backups. Verify source status, saved views and representative evidence after reopening. An original source on another drive may remain unavailable until the source path is accessible; an intact saved Analytics capture can still be read independently.

This file-system procedure is operational guidance based on the application-owned storage design; it is not an advertised in-app migration wizard or a claim of cross-version downgrade compatibility.

## Complete reset

A complete reset is different from Clear Analytics caches. Close the application and remove or move aside **only the Analytics data directory** to discard settings, registrations, saved views, annotations and captures. Keep a backup first if any of those may be needed. Never use a Reader profile path for this operation. The next launch starts a new Analytics profile and may discover a standard Reader source again.

A complete profile reset removes all state inside that profile, including any protected baseline or recovery material. It is broader than routine cache cleanup.

Continue with [troubleshooting and keyboard controls](08-Troubleshooting.md).
