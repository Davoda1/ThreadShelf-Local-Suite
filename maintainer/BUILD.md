# Build the public desktop releases

The current tree builds **1.4.4 packages** for Reader, Analytics and Alternative. The version map is `tools/release-versions.json`. Reader and Alternative add safe inline HTML formatting, VeniceAI citations and isolated HTML previews; Reader also adds duplicate cleanup. Analytics functionality and all dependency/runtime pins are unchanged. Dependency and runtime pins are recorded below. The server patch is unchanged. The manual and application READMEs describe the 1.4.4 controls and safety boundaries; existing screenshots retain their original provenance. No GitHub release is implied by building this tree.

## Pinned toolchain

| Tool | Version / requirement |
| --- | --- |
| Node.js | **26.13.0**, LTS development toolchain |
| npm | **12.2.2**, managed copy with verified upstream security dependency pins |
| Electron (all three applications) | **45.2.3** |
| Python | 3.11.8 or newer for CPU speech asset preparation |
| Debian packaging | GNU/Linux with `dpkg-deb`, `tar`, `gzip`, and `cc` with static libc development files (for example `build-essential` on Debian/Ubuntu) |
| Manual build | PHP CLI with ctype; see `manual/README.md` |

Electron's embedded Node.js belongs to the Electron runtime and can differ from the Node.js used to build the application. Electron uses supported stable release lines; the term LTS above applies to the development Node.js toolchain.

Install Node from [the official 26.13.0 distribution](https://nodejs.org/dist/v26.13.0/), checking the published checksums, or use a trusted version manager. Select the pinned version before building and check `node --version`. From the repository root, run `node tools/npm.mjs --report` to prepare and verify the managed npm profile. Its upstream npm version remains 12.2.2; the separately recorded dependency replacements update bundled glob/minimatch and preserve the verified Undici 6.29.1 fix. [NPM-TOOLCHAIN.md](NPM-TOOLCHAIN.md) records the exact inputs, verification and commands.

The suite helper and Reader/Analytics source run.sh/run.ps1 helpers use this managed npm profile. It does not modify a global npm installation or fall back to an unverified system copy. CI selects Node with setup-node and invokes the same managed entrypoint. Do not install npm globally for these builds or update application lockfiles merely to reproduce a release.

## Windows checkout

Some synthetic test-fixture filenames exceed Windows' traditional path limit. Enable Git long-path handling while cloning, and use a short checkout directory:

```text
git clone -c core.longpaths=true https://github.com/Davoda1/ThreadShelf-Local-Suite.git
```

For an existing checkout, run `git config --local core.longpaths true` before checking out or updating the files. The Windows build workflow enables this before checkout.

## Build using the suite helper

Run from the repository root. The helper verifies the toolchain, installs the locked dependencies for Reader/Analytics, runs their tests, rebuilds the renderer, and calls each application's native packager. It uses production package inputs and official runtime archives.

Use a fresh output directory for a release. The final checksum manifest includes all package files already present in that directory, so reusing an old directory can include stale packages.

GNU/Linux, all nine packages:

```text
python3 tools/build-suite.py --app all --target all --out release
```

Windows PowerShell, the three Windows ZIPs:

```text
python tools/build-suite.py --app all --target windows --out release
```

One component on GNU/Linux:

```text
python3 tools/build-suite.py --app reader --target linux --out release
```

The equivalent development entry points are `tools/build-suite.sh`, `tools/build-suite.ps1` and `tools/build-suite.cmd`. They invoke the same Python helper. They are development scripts, not GUI launchers.

Use `--runtime-cache <directory>` to keep downloaded Electron ZIPs between builds. The helper creates a version-specific subdirectory for each runtime. Internet access is required for missing npm dependencies, runtime archives and the explicit CPU speech asset preparation step. Alternative's renderer dependencies are already vendored and it needs no npm installation.

`--skip-tests` is available for a local packaging iteration after the exact current sources have already passed tests. Do not use it as the only release verification.

### Bundled CPU speech assets

Reader and Alternative packages require the complete pinned Pocket/Kokoro payload. The suite helper prepares it once in `.cache/tts-assets/` before packaging either application. This is a build-time download; the installed application never downloads these models. Use `--tts-assets <directory>` or `THREADSHELF_TTS_ASSETS` to select a previously prepared payload. Every file is checked against the complete inventory when staged; a missing or altered payload stops packaging.

For direct component packaging, first run from the repository root:

```sh
python3 apps/reader/tts/cpu/prepare_assets.py --output /absolute/path/to/tts-assets
```

Set `THREADSHELF_TTS_ASSETS` to that directory before running either component packager. The shared payload contains `common/`, `linux-x64/` and `win32-x64/`; only common files and the selected platform are copied into each desktop package. The prepared asset cache and full model files do not belong in application source archives. Original notices, voice attribution and corresponding GPL source archives travel in each package under `resources/tts-assets/`. See [CPU speech build details](../apps/reader/tts/cpu/README.md).

## Direct component commands

Reader and Analytics:

```text
node scripts/npm-toolchain.mjs -- ci
node scripts/npm-toolchain.mjs -- test
node scripts/npm-toolchain.mjs -- run build
node scripts/package.mjs --win32 --out <output-directory>
node scripts/package.mjs --linux --out <output-directory>
```

Run these inside the relevant `apps/` directory. `--runtime-cache` can select the directory containing that exact Electron version's ZIPs and `SHASUMS256.txt`. The Linux target emits the portable TAR.GZ and DEB.

Alternative:

```text
node scripts/test.cjs
python scripts/build.py --target windows --download --output-dir <output-directory>
python scripts/build.py --target linux --download --output-dir <output-directory>
python scripts/build.py --target deb --download --output-dir <output-directory>
```

The Python command may be named `python3` on GNU/Linux. The build script's `--runtime-cache` and `--work-dir` switches support external caches/staging. Package filenames use each application's public version without personal revision suffixes.

## Dependency and runtime source companions

The [1.4.4 release](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/tag/v1.4.4) supplies the exact tagged application source and `ThreadShelf-Local-Suite-1.4.4-Runtime-Source-Update.tar.gz`. This supplement updates the original Electron 45.1.0 source collection to Electron 45.2.3. Matching runtime source requires **both** the supplement and the six original Runtime-Sources ZIP parts plus their metadata from [release 1.3.0](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/tag/v1.3.0). Both ONNX-Sources ZIP parts and their metadata remain unchanged there. The v1.0.0 Native-Sources companion is reused only for unchanged sharp/libvips sources.

Verify files against their original release's `SHA256SUM.txt`. Keep the numbered ZIPs intact and extract only their metadata ZIPs. Assemble the original runtime sources **without `--apply-patches`**, then apply the update supplement:

```sh
python source-publication/assemble-runtime-sources.py --manifest source-publication/final-runtime/SOURCE-MANIFEST.json --parts-dir /path/to/parts --destination /path/to/new-runtime-tree
python runtime-source-update/update-runtime-sources.py --destination /path/to/new-runtime-tree --apply-patches
```

The updater checks the original source hashes, complete new Electron/Node source archives, current release profiles and ordered Electron patches. Use a freshly assembled original tree. See [the update instructions](runtime-source-update/README.md) for the exact source scope and reproducible supplement build. It does not execute upstream hooks or compile the runtime. Python 3.10+, Git, symlink support and sufficient disk space are required.

The unchanged ONNX collection is independently assembled with:

```sh
python source-publication/onnx/assemble-onnx-sources.py --manifest source-publication/onnx/ONNX-COLLECTION-MANIFEST.json --parts-dir /path/to/parts --destination /path/to/new-onnx-tree
```

The ordinary app packagers use official pinned binaries. Rebuilding native dependencies requires the documented upstream compiler/SDK prerequisites. The original source-verification records retain their historical versions; they are not evidence that the old runtime sources alone cover Electron 45.2.3.

## What to preserve

- `package-lock.json`, runtime pins and official runtime checksum verification.
- Bundled fonts, renderer libraries, codecs, notices, the suite Source archive, the scoped Native-Sources companion, every Runtime/ONNX source part and both metadata ZIPs.
- Windows EXE at the portable ZIP root.
- Linux portable native executables at archive root and regular static ELF entry points in Debian `/usr/bin/`; no symlink or script launchers.
- Correct native executable permissions and DEB sandbox-helper mode.
- Application data-format/schema identifiers; they are not release-version strings.

Do not add production `--no-sandbox` flags, launch wrappers, private URLs or personal defaults. Test-only environment accommodations are documented separately and must not enter packages.

## Validate on the target operating system

After building, run the validator from the repository root on the matching native host. It checks package contents and official runtime hashes, launches the staged application executable in Electron's Node mode, and checks the runtime identity. Reader also exercises real SQLite storage, bundled compression, backup/restore, search and persisted settings with synthetic data.

GNU/Linux, after a Reader Linux build:

```text
python3 tools/validate-suite.py --app reader --platform linux --out release
```

Windows PowerShell, after a Reader Windows build:

```text
python tools/validate-suite.py --app reader --platform win32 --out release
```

Replace `reader` with `analytics` or `alternative` for the other applications. Use the same `--runtime-cache` location passed to the build helper, if it was customized. Linux validation covers both the portable TAR.GZ and DEB; Windows validation covers the portable ZIP. Reports are written to `release/verification/` with machine-specific paths removed. The build workflow runs this validation before uploading an artifact.

Reader and Alternative validation additionally launches their actual extracted Windows ZIP and Linux TAR.GZ/DEB executables with the Chromium sandbox enabled, fresh synthetic profiles and the recipe-pinned Playwright driver. It checks the interface, settings across restart and byte integrity of the extracted application. Analytics validation on Linux uses its package GUI harness to import synthetic data, persist settings and verify unchanged installed files. Analytics Windows validation checks native startup, settings changes, graceful close and a persisted restart through its GUI harness. Every application/platform job must record successful native GUI evidence before publication.

Install the locked driver with `node ../npm.mjs -- ci --ignore-scripts` in `tools/mermaid-bundle`. Linux GUI checks require Xvfb, the required desktop libraries and working Chromium sandbox support. The GitHub runner configures its temporary host to permit sandboxed user namespaces; package launchers and application source receive no sandbox bypass. DEB checks use extracted payloads rather than system-wide installation. Reports distinguish native runtime checks from GUI checks.

## Validation and updating pins

See `VERIFICATION.md` for the results of this delivery and each component's verification notes. A successful cross-build does not by itself prove native execution on the other operating system. Test downloaded packages on clean Windows and Linux desktops before later public updates.

For a deliberate runtime update, choose an exact supported version, update manifests/locks/checksum pins together, run the complete relevant tests, inspect light/dark/minimum-size UI, rebuild all affected packages and refresh screenshots if the visible interface changes. Record the actual versions in the release notes.
