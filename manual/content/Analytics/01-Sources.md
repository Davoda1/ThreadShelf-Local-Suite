# Installation, sources and captures

[Analytics manual](index.md)

## Install and start

On Windows, extract the portable ZIP into a normal writable application folder and open **ThreadShelf Local Analytics.exe** at the archive root. Keep the supporting application files together. On GNU/Linux, extract the portable TAR.GZ and open **bin/threadshelf-local-analytics**, the direct symlink to the native executable. The Debian package installs the native application and desktop integration; install the supplied package with your package manager, for example:

```bash
sudo apt install ./threadshelf-local-analytics_1.0.0_amd64.deb
```

Ordinary application use does not require administrator privileges, a separately installed Node runtime, an external archiver, an AI model or a network connection. Build scripts in the source archive are development tools; they are not the launchers for the packaged desktop app.

The startup cover follows the operating system's light or dark appearance before saved application preferences are loaded. Analytics then loads the snapshots and settings stored in the Analytics profile, calculates the first result and reveals the configured interface. If initialization fails, use the visible Retry control after correcting the reported problem. Reader discovery and new captures can continue in the background after the existing analysis is usable.

## Choose the correct source route

Choose **Add source** and select the route matching the material you actually have.

| Route | What to select | Result |
| --- | --- | --- |
| Reader archive | A compatible Reader profile or the profile’s local-storage-v2 directory | A validated capture of the committed archive with the corresponding collection memberships |
| Export files | One or several supported JSON, HTML or ZIP exports | An analysis-only copy normalized into Analytics-owned storage |
| Export directory | An extracted export folder | Bounded recursive inspection of supported files, with diagnostics for unsupported neighbors |

Do not point Export directory at a Reader profile. Reader storage has specific consistency and ownership rules, and the export route deliberately refuses it. Do not select Analytics' own application-data directory as an input source.

The source contract supports Reader’s **local-storage-v2** archive. Reader 1.0.0 retains this version-2 storage format and catalog schema 3. The format and coherent archive contents determine compatibility. Analytics does not migrate older unsupported Reader schemas. A familiar folder name alone is not proof that the contents are compatible.

## Automatic Reader discovery

After the window opens, Analytics checks the standard Reader archive location:

| Platform | Standard archive location |
| --- | --- |
| Windows | `%AppData%\ThreadShelf Local Reader\local-storage-v2\` |
| GNU/Linux with XDG configuration | `$XDG_CONFIG_HOME/ThreadShelf Local Reader/local-storage-v2/` |
| GNU/Linux default | `~/.config/ThreadShelf Local Reader/local-storage-v2/` |

It does not read Reader appearance or other preferences to discover these paths. **Find Reader archive** repeats the check from the empty view, Add source dialog or Sources & settings. An already connected source is not added a second time. If you remove the discovered Reader source, Analytics remembers that choice and suppresses automatic reconnection. Use Find Reader archive explicitly when you want it connected again.

Reader may be running while Analytics captures it. Analytics reads a coherent committed publication; it does not write locks, sidecars, analyzed flags, bookmarks or settings into the Reader profile. During a Reader maintenance operation, capture can retry for a bounded period. If the source cannot provide a coherent capture, the previous complete Analytics result remains available.

## Direct export support

The adapters recognize documented export shapes from ChatGPT/OpenAI, Claude/Anthropic, Google AI Studio, Gemini, Grok, OpenRouter, LM Studio, VeniceAI and Meta AI, as well as supported normalized/converted conversation records. Provider names are not a promise that every historical or future export variant is supported. Inspect the diagnostics for the exact file selected.

JSON may be supplied in supported Unicode encodings. HTML is parsed as inert archived data: supported embedded JSON and static conversation markup can be read, but archived scripts are not executed. ZIP/ZIP64 inputs are checked before their supported members are interpreted. Links, attachment paths and media references are not fetched.

For Venice multipart backups, select all complete ZIP parts from the same export together. Matching manifests and all required numbered chunks are necessary. Ordinary byte-split volumes, encrypted backups and unsupported Dexie encodings are not interchangeable with the supported multipart format. They remain unsupported.

For a standalone 7z or RAR export, extract it first using your usual archive tool and choose the extracted directory. Direct 7z/RAR export-container ingestion is not implemented. This is separate from Reader's own compressed object storage: Analytics has bundled codecs for supported Reader 7z/ZIP capture and does not require an external archiver for that route. Nested ZIP exports are not recursively interpreted.

## Register and verify a source

1. Choose Add source and the appropriate route.
2. Select the complete file set or directory. If using a multipart export, select all related parts in the same operation.
3. Let the progress indicator complete. The first capture includes reading, decompression where applicable, normalization and full-text analytical indexing.
4. Open Sources & settings.
5. Locate the source card and inspect the connection type, path, capture time, snapshot ID, conversation count and status.
6. Open Data quality to inspect limitations and unsupported-record diagnostics.
7. Confirm that the resulting dates and providers are plausible before making a detailed comparison.

Analytics refuses unsafe or changing source inputs rather than repairing them. Observed symbolic links, junctions, hard-linked direct-source files, unsafe ZIP paths and ZIP symlink members are examples of inputs that may be rejected by the read-only safeguards. A source that changes during a read can be discarded for that attempt. Preserve the original export; supply a stable ordinary copy through a supported route when appropriate.

## Refresh and cancellation

Use **Refresh** on a source card to capture the source’s current contents. Refresh reads the original source. **Rebuild analytical indexes** is different: it recomputes derived analysis from complete Analytics-owned captures and does not need the original source to be connected.

An optional automatic refresh interval is configured in Analytics appearance/settings. A value of **0** disables it; the numeric control accepts up to **1440 minutes**. This preference belongs to Analytics and does not change Reader refresh behavior.

Use **Cancel** in the progress area to request cancellation. Cancellation is cooperative: native decompression or one bounded parsing unit may finish before it responds. The displayed complete analysis is not replaced prematurely with a partially calculated result.

## Read source status carefully

| Status or situation | Meaning for your work |
| --- | --- |
| Registered without analysis | The connection exists, but no usable complete capture is currently available |
| Complete | A complete captured result is available within the source's supported format and coverage |
| Partial | Supported material was retained, with limitations or unsupported records to inspect |
| Stale | The saved capture remains available, but source freshness needs attention |
| Unavailable | The original path or source cannot currently be accessed; existing captured data may still be usable |
| Invalid/unsupported archive | The selected material fails the required format or integrity checks; Analytics does not migrate or repair it |

Capture time tells you when Analytics observed the source. Activity charts use original content timestamps according to the selected date basis. Importing an old conversation today does not move the conversation’s historical activity to today.

## Application version and captured formats

The public application version is **1.0.0**. The internal capture/catalog formats have independent schema versions. Do not rename or edit their markers to match the application version. Analytics validates a source format before reading it; an unsupported schema is reported rather than automatically repaired. Unknown saved filter fields remain stored and produce a visible partial-selection warning if they cannot be applied.

Continue with [filters and saved selections](02-Selections.md).
