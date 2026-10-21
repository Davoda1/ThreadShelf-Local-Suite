# ThreadShelf Local Suite

Desktop readers, local archive analytics, and a search integration patch for [ThreadShelf](https://github.com/ChrystianSchutz/ThreadShelf).

**Public release: 1.0.0 · Windows x64 · GNU/Linux amd64**

| Application | Choose it when you want… |
| --- | --- |
| **ThreadShelf Local Reader** | A full reading workspace with a local archive, optional server connection, search, rich conversation rendering, and extensive appearance settings. |
| **ThreadShelf Local Analytics** | Read-only analysis of a Reader archive through captures, filters, charts, relationships, and exportable reports. |
| **ThreadShelf Local Alternative** | A separate, focused server-reading interface with saved searches, pins, a prompt outline, and a built-in demonstration. |
| **Server patch** | Complete paginated search integration for the desktop clients on the exact supported upstream ThreadShelf 1.3.0 baseline. |

## Download and start

Get an application package from [Releases](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases). You do not need Node.js or npm to run the packaged desktop apps.

- **Windows:** extract the entire portable ZIP and run the application EXE at the extraction root. Keep the runtime files beside it.
- **Linux portable:** extract the TAR.GZ and run the extracted `bin/threadshelf-local-*` entry. Preserve the extracted directory structure and executable permissions.
- **Debian/Ubuntu:** install the appropriate `.deb` with `sudo apt install ./<package-name>.deb`, then launch it from the application menu.

The packages are unsigned. Linux needs the desktop libraries listed in the application's build/install guide. Analytics reads a compatible Reader archive or supported conversation exports; Alternative connects to a ThreadShelf server or runs the built-in synthetic demo. Semantic search requires the relevant search/embedding setup described in the manual.

## Read the manual

- [Read the manual on GitHub](manual/content/index.md).
- [Built HTML manual files](docs/): download or clone the complete repository, then open `docs/index.html` locally.
- [Online user manual](https://davoda1.github.io/ThreadShelf-Local-Suite-Manual/).
- Offline: open `docs/index.html` in the source distribution, or `manual/index.html` in the combined release distribution.

The illustrated Gopher manual covers installation, first use, workflows, settings, charts, search, data management, troubleshooting, and the server patch. Screenshots use synthetic demonstration data. See the manual's screenshot provenance for the precise capture method.

The hosted manual is published from the separate [manual website repository](https://github.com/Davoda1/ThreadShelf-Local-Suite-Manual). That repository contains the generated documentation and required notices; the application sources and releases remain here.

## Server integration

Acquire ThreadShelf itself from [ChrystianSchutz/ThreadShelf](https://github.com/ChrystianSchutz/ThreadShelf). Read [server-patch/README.md](server-patch/README.md) before applying the supplied patcher. It checks the supported baseline, offers a dry run, backs up affected files, detects a previously applied patch, and supports rollback.

This repository contains the integration changes and patching tools. Configuration and archive data belong to each person's own server installation.

## Project structure

| Path | Purpose |
| --- | --- |
| `apps/reader/` | Reader source, tests, assets and native packaging tools |
| `apps/analytics/` | Analytics source, tests, assets and native packaging tools |
| `apps/alternative/` | Alternative source, offline renderer dependencies and native packaging tools |
| `server-patch/` | Version-bound integration patch, patcher and tests |
| `manual/` | Editable manual content, fresh screenshots and Gopher 3.0.0 publisher |
| `docs/` | Generated static user manual |
| `maintainer/` | GitHub setup, builds, release procedure and verification |
| `tools/` | Suite-level build and source verification helpers |

## Build or publish

Start with [maintainer/BUILD.md](maintainer/BUILD.md). The suite pins Node.js **24.19.0** and npm **11.9.0** for development builds. Electron is pinned separately for each application; the embedded Node.js is part of that runtime.

For the repository owner, [maintainer/GITHUB-SETUP.md](maintainer/GITHUB-SETUP.md) explains the first upload, repository description/settings, private Git commit email, Pages, Actions and release assets. The included workflows build artifacts; publication is a separate maintainer action.

## Independence and attribution

ThreadShelf Local Suite is an independent companion project maintained by **davoda1**. It is not a fork of the upstream server and does not imply upstream endorsement. ThreadShelf server code is maintained by the original project. The integration patch identifies the upstream base and preserves applicable notices.

Original suite code is available under the [MIT license](LICENSE), `Copyright (c) 2026 davoda1`. Third-party components, fonts, codecs, rendering libraries, and runtime files retain their own terms. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and each application's included notices/source offers.

The [v1.0.0 release](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/tag/v1.0.0) provides the suite Source archive, the Native-Sources dependency companion, and **all numbered Runtime-Sources TAR.GZ parts**. The runtime mirror contains the complete pinned Electron/Chromium Git dependency trees for Linux x64 and Windows x64, plus the source-bearing build material and release profiles described in the manifests. Preserve all source downloads, notices and rebuild instructions alongside the desktop packages when redistributing them. Normal installation needs only an application package; runtime rebuilding also needs the documented compiler, SDK and build utilities. See [runtime source access and rebuilding](apps/reader/licenses/ELECTRON-SOURCE-ACCESS.md).

## Help and contributions

Read the troubleshooting chapters, then [open an issue](https://github.com/Davoda1/ThreadShelf-Local-Suite/issues) with a minimal synthetic reproduction. Do not attach real conversation archives, access tokens, private URLs or personal configuration. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
