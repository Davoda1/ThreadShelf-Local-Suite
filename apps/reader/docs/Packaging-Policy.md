# Native application packaging

Version **1.3.1** uses native application entry points. Shell, CMD, PowerShell, Python and JavaScript launch wrappers are excluded from desktop distribution entry points. Source-only build and test scripts remain available.

| Distribution | Entry point | Native target |
| --- | --- | --- |
| Windows portable ZIP | `ThreadShelf Local Reader.exe` at extraction root | Native PE executable with adjacent runtime files |
| Linux portable TAR.GZ | `threadshelf-local-reader` | Real native ELF executable with adjacent runtime files |
| Debian package | `/usr/bin/threadshelf-local-reader` | Regular static ELF entry point executing the native payload under `/opt/threadshelf-local-reader/` |

Preserve native executable permissions and the complete runtime directory. The DEB installs the sandbox helper with the required owner and mode. A desktop-entry file is menu metadata and resolves through the native entry point.

Release checks cover archive integrity, entry-point file types/targets, executable branding and version, required assets, dependency/license contents and public metadata. Package version and visible application version are 1.3.1. The candidate produces three platform packages; publication requires the suite release gates and a consolidated checksum manifest.
