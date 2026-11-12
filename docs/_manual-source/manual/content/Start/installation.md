# Installation and first session

## Select the right package

Each desktop application is released as **1.4.5** for Windows x64 and GNU/Linux amd64. The release archive contains three packages per application: Windows portable ZIP, Linux portable TAR.GZ and Debian DEB. Select one format for your system. Source archives are for development; an HTML demonstration is not a persistent desktop installation.

| Application | Windows executable | Linux entry point |
| --- | --- | --- |
| Reader | `ThreadShelf Local Reader.exe` | `threadshelf-local-reader` |
| Analytics | `ThreadShelf Local Analytics.exe` | `threadshelf-local-analytics` |
| Alternative | `ThreadShelf Local Alternative.exe` | `threadshelf-local-alternative` |

Use the consolidated `SHA256SUM.txt` delivered with the release packages to verify the exact bytes you downloaded. On Linux, run `sha256sum -c SHA256SUM.txt` from the package directory. Missing-file messages mean that a manifest entry is not present locally; every package you intend to install must match. On Windows, compare the full SHA-256 value from `Get-FileHash -Algorithm SHA256` with the corresponding manifest line.

The release provides the suite Source archive and source-access references for its bundled dependencies. The unchanged Electron and ONNX source collections remain associated with v1.3.0; the original Native-Sources companion is reused only for its unchanged sharp/libvips scope. Do not substitute the historical Electron source collection for the current runtime. Follow [native dependency sources and runtime rebuilds](../Reference/development.md#native-dependency-sources-and-runtime-rebuilds) and the packaged source-access notices when rebuilding or redistributing. Ordinary installation uses the desktop packages and does not require these development sources.

## Windows portable installation

1. Extract the complete application ZIP into a writable folder.
2. Open the extracted folder and run the native EXE at the folder root.
3. Keep the application’s DLLs, resources and other runtime files together. Moving only the EXE will break the installation.
4. Use a separate program folder for each application.

Ordinary use needs no separately installed Node.js, npm or Python. The portable distribution describes the program folder; user settings and data still live in the normal Windows application-data profile. The builds are unsigned unless a later release explicitly states otherwise.

## GNU/Linux portable installation

Extract the TAR.GZ with an archive tool that preserves symbolic links and executable permissions. From the extracted directory, run the matching entry point, for example:

```sh
./threadshelf-local-reader
```

The entry is the real native executable at the archive root. Preserve the complete extracted directory structure. It can move as a unit; no shell launcher is needed.

Use an ordinary desktop account with an X11 or Wayland session and the required Electron/GTK/NSS/ALSA system libraries. A distribution must also support Chromium’s normal sandbox mechanism. If portable startup reports a sandbox problem, prefer the DEB and check the distribution’s user-namespace policy. Disabling the sandbox is not a normal installation step.

## Debian package installation

Use the graphical package manager, or install the selected package:

```sh
sudo apt install ./threadshelf-local-reader_1.4.5_amd64.deb
```

Replace `reader` with `analytics` or `alternative` for the other packages. Launch the application from the desktop menu or by running the installed command. The installed command is a regular native executable in `/usr/bin`, not a symlink or launcher script. These desktop packages do not install a server or background daemon.

## Reader: first Local session

1. Start Reader and select **Local**.
2. Use **Import files** on the welcome page or **Import** in the header.
3. Leave **Collection name** blank for provider-based grouping, or enter your own collection name.
4. Select a supported export file, ZIP or extracted directory.
5. Wait for completion and review added, updated, unchanged and diagnostic counts.
6. Select a nonempty collection and open a conversation.
7. Try an ordinary text search, inspect a code block and add a bookmark.
8. Open Settings to choose language and appearance, then choose **Save settings**.
9. Create a Local backup after the archive contains material you want to keep.

No model download or server is required for this workflow. See [Importing](../Reader/importing.md) and [Backup](../Data/backup.md).

## Analytics: first capture

1. Start Analytics. Let automatic discovery check the standard Reader archive location.
2. If no compatible archive is found, choose **Add source**.
3. Select **Reader archive**, **Export files** or **Export directory**, matching the input you have.
4. Wait for the capture and inspect **Sources & settings** for the status and capture time.
5. Start with **Overview**, then review **Data quality** before comparing totals.
6. Select a chart mark or exact-table row to inspect the corresponding contributing evidence.

Analytics reads the configured sources and owns the resulting capture. It does not edit Reader data or the original exports. See [Sources and captures](../Analytics/01-Sources.md).

## Alternative: first server session

1. Start your separately installed ThreadShelf server.
2. Open Alternative and choose **Connect your server**.
3. Enter the server’s final HTTP(S) address, such as `http://localhost:3000`.
4. Select a collection, or browse all collections, and open a conversation.
5. Try **Text search**, pin a conversation and save a useful search.
6. Use **Semantic** only when the server’s embedding/search setup is available.

Use **Explore demo** to learn the interface without a server. Demo content is invented, and semantic search in the demo is an approximation. See [Alternative](../Alternative/index.md).

## Profiles, window size and updates

Each application stores preferences under a separate named profile in `%APPDATA%` on Windows or the XDG configuration location on Linux. Reader and Analytics also own their respective archive/capture data. Alternative stores navigation and reading state but does not automatically archive full server conversations. Reader and Alternative can also retain optional generated speech in their own separate audio caches.

All three GUIs support a minimum window of **680 × 540**. Lists, conversations, settings and analytical workspaces scroll within their own panes. If a control is out of view, scroll the containing pane. Keep the original exports and back up application data before replacing program files or moving machines. Application release numbers and internal storage-schema numbers are independent.
