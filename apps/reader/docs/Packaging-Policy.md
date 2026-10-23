# Native application packaging

Public release **1.1.0** uses native application entry points. Shell, CMD, PowerShell, Python and JavaScript launch wrappers are excluded from desktop distribution entry points. Source-only build and test scripts remain available.

| Distribution | Entry point | Native target |
| --- | --- | --- |
| Windows portable ZIP | `ThreadShelf Local Reader.exe` at extraction root | Native PE executable with adjacent runtime files |
| Linux portable TAR.GZ | `bin/threadshelf-local-reader` | Direct relative symlink to `../app/threadshelf-local-reader` |
| Linux portable TAR.GZ | `threadshelf-local-reader` | Direct relative symlink to `app/threadshelf-local-reader` |
| Debian package | `/usr/bin/threadshelf-local-reader` | Direct relative symlink to the installed native executable under `/opt/threadshelf-local-reader/` |

Preserve symlinks, native executable permissions and the complete runtime directory. The DEB installs the sandbox helper with the required owner and mode. A desktop-entry file is menu metadata and resolves through the native entry point.

Release checks cover archive integrity, entry-point file types/targets, executable branding and version, required assets, dependency/license contents and public metadata. Package version and visible application version are 1.1.0. Three platform packages are included in the suite release with a consolidated checksum manifest.
