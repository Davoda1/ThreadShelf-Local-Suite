# Build the public desktop releases

The current tree builds **1.3.1 packages** for Reader, Analytics and Alternative. The version map is `tools/release-versions.json`. The server patch and manual are unchanged. No GitHub release is implied by building this tree.

## Pinned toolchain

| Tool | Version / requirement |
| --- | --- |
| Node.js | **24.22.1**, LTS development toolchain |
| npm | **12.2.1**, managed copy with bundled **Undici 6.29.1** |
| Electron (all three applications) | **45.1.0** |
| Python | 3.10 or newer |
| Debian packaging | GNU/Linux with `dpkg-deb`, `tar`, `gzip`, and `cc` with static libc development files (for example `build-essential` on Debian/Ubuntu) |
| Manual build | PHP CLI with ctype; see `manual/README.md` |

Electron's embedded Node.js belongs to the Electron runtime and can differ from the Node.js used to build the application. Electron uses supported stable release lines; the term LTS above applies to the development Node.js toolchain.

Install Node from [the official 24.22.1 distribution](https://nodejs.org/dist/v24.22.1/), checking the published checksums, or use a trusted version manager. Select the pinned version before building and check `node --version`. From the repository root, run `node tools/npm.mjs --report` to prepare and verify the managed npm profile. Its upstream npm version remains 12.2.1; the separately recorded Undici 6.29.1 replacement repairs npm's bundled dependency. [NPM-TOOLCHAIN.md](NPM-TOOLCHAIN.md) records the exact inputs, verification and commands.

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

Use `--runtime-cache <directory>` to keep downloaded Electron ZIPs between builds. The helper creates a version-specific subdirectory for each runtime. Internet access is required for missing npm dependencies and runtime archives. Alternative's renderer dependencies are already vendored and it needs no npm installation.

`--skip-tests` is available for a local packaging iteration after the exact current sources have already passed tests. Do not use it as the only release verification.

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

The [1.3.1 release](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/tag/v1.3.1) supplies the exact tagged application source. The unchanged Electron and ONNX source companions remain in [release 1.3.0](https://github.com/Davoda1/ThreadShelf-Local-Suite/releases/tag/v1.3.0): six Runtime-Sources ZIP parts, two ONNX-Sources ZIP parts and a metadata ZIP for each collection. The original v1.0.0 Native-Sources companion is reused only for unchanged sharp/libvips inputs. Its old Electron material does not cover the new runtime.

Verify all downloaded assets against their original release's `SHA256SUM.txt`. Keep numbered source ZIPs together and extract only the metadata ZIPs into a separate directory. Both use the `source-publication/` namespace. The ordinary application packagers use official pinned Electron/ONNX binaries; rebuilding those dependencies is separate.

Verify the original source collections without downloading or executing upstream build hooks:

```sh
python source-publication/assemble-runtime-sources.py --manifest source-publication/final-runtime/SOURCE-MANIFEST.json --parts-dir /path/to/source-parts
python source-publication/onnx/assemble-onnx-sources.py --manifest source-publication/onnx/ONNX-COLLECTION-MANIFEST.json --parts-dir /path/to/source-parts
```

To extract runtime source and apply Electron's ordered patches, add `--destination /path/to/new-runtime-tree --apply-patches` to the first command. For original ONNX source extraction, add `--destination /path/to/new-onnx-tree` to the second; its upstream recipes apply the appropriate platform-specific patches. Python 3.10+, original symlink support and substantial free space are required; runtime patch application also needs Git.

The manifests preserve the selected Linux/Windows Git dependency union, source-bearing supplemental material, Rust library/vendor sources, compiler-runtime source references, exact optimization profiles, ONNX active CMake/vcpkg dependencies, and source/configuration provenance. Compilers, platform SDKs and normal build utilities remain external prerequisites. Read [source verification](RUNTIME-SOURCE-PREPARATION.md), [runtime source access](../apps/reader/licenses/ELECTRON-SOURCE-ACCESS.md) and [ONNX source access](../apps/reader/licenses/ONNX-SOURCE-ACCESS.md) for precise scope and limits. No complete runtime rebuild or byte-identical binary reproduction is claimed.

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

Reader and Alternative validation additionally launches their actual extracted Windows ZIP and Linux TAR.GZ/DEB executables with the Chromium sandbox enabled, fresh synthetic profiles and the recipe-pinned Playwright driver. It checks the interface, settings across restart and byte integrity of the extracted application. Analytics validation on Linux uses its package GUI harness to import synthetic data, persist settings and verify unchanged installed files. Analytics Windows validation covers native runtime identity without a GUI claim.

Install the locked driver with `node ../npm.mjs -- ci --ignore-scripts` in `tools/mermaid-bundle`. Linux GUI checks require Xvfb, the required desktop libraries and working Chromium sandbox support. The GitHub runner configures its temporary host to permit sandboxed user namespaces; package launchers and application source receive no sandbox bypass. DEB checks use extracted payloads rather than system-wide installation. Reports distinguish native runtime checks from GUI checks.

## Validation and updating pins

See `VERIFICATION.md` for the results of this delivery and each component's verification notes. A successful cross-build does not by itself prove native execution on the other operating system. Test downloaded packages on clean Windows and Linux desktops before later public updates.

For a deliberate runtime update, choose an exact supported version, update manifests/locks/checksum pins together, run the complete relevant tests, inspect light/dark/minimum-size UI, rebuild all affected packages and refresh screenshots if the visible interface changes. Record the actual versions in the release notes.
