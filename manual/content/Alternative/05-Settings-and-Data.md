# Alternative: settings and local data

Open **Settings** on the navigation rail or **Reading** in the bottom status bar to open **Reading & appearance**. Unlike Reader and Analytics settings forms, these Alternative controls **save automatically** when changed. **Done** closes the dialog; there is no separate Save button.

| Control | Choices | Effect |
| --- | --- | --- |
| Color theme | System, Light, Dark | System follows the operating system; explicit modes remain selected |
| Reading size | 14–24 px | Changes conversation text size |
| Reading width | Compact 640 px, Comfortable 820 px, Wide 1040 px | Sets the preferred maximum reading width within available space |
| Show reasoning when available | On/off | Displays reasoning included in retained content |

The reading-width values are preferences, not a minimum window width. A small window constrains the actual content width. Code colors follow Light/Dark automatically; Alternative does not offer Reader’s full interface/code-theme catalogs.

## Where state is stored

| Platform | State file |
| --- | --- |
| Windows | `%APPDATA%\ThreadShelf Local Alternative\alternative-state.json` |
| Linux | `$XDG_CONFIG_HOME/ThreadShelf Local Alternative/alternative-state.json` |
| Linux default | `~/.config/ThreadShelf Local Alternative/alternative-state.json` |

The state contains server address, preferences, pins, saved searches, recent metadata and reading positions. Names, excerpts and identities in these records may reveal which conversations you opened. Protect this file as personal application data.

Full conversations are requested into memory and are not automatically copied into a local conversation database. An explicit Markdown export creates a separate file wherever you save it. External original server data, exported documents and application preferences have different backup lifecycles.

## Back up or reset

For a backup, finish any export, close Alternative and copy the whole application-data directory. Restore a matching closed-profile copy as a unit, retaining the existing folder as a backup until the restored settings are checked. Do not merge pieces of unrelated JSON state files.

For a fresh start, close the app and move aside only the Alternative profile directory. Reopening creates fresh state. Keep the old copy if the saved pins or searches might be needed. This operation does not delete server conversations, Reader archives or Analytics captures.

## Preference errors

If saved settings cannot be read, the app keeps the default settings and current startup appearance for that session. The Settings dialog explains that changes stay in the current session. Both the renderer and native state store block subsequent saves, so changing a preference cannot overwrite the unreadable original file.

Close Alternative and preserve the existing profile before recovery. Restore a known-good backup or move aside only Alternative’s own profile directory, then restart. There is no automatic reset or in-app recovery button. Merely changing settings or waiting does not re-enable persistence after a failed initial read.

A later save failure after a successful initial load is a separate problem: new choices may not survive restart. Check the reported error, directory permissions and free storage, and keep the existing state before making repairs.

No telemetry or automatic update requests are part of this release. Server requests occur for the selected archive operations; deliberate external links open through the operating system/browser. See [privacy](../Data/privacy.md) and [troubleshooting](07-Troubleshooting.md).
