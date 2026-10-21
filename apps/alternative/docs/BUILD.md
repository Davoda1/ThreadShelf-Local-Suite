# Build and package

Application version: **1.0.0**. This is an independent product.

## Requirements

- Python 3.10 or newer.
- Node.js 24.19.0 LTS and npm 11.9.0 for Windows executable branding and the development tests.
- Debian/Ubuntu tooling (`dpkg-deb`) on Linux or WSL for the `.deb`.
- The two official Electron 44.9.1 x64 runtime ZIPs. The packaging script verifies
  their pinned SHA-256 hashes before extraction. It never executes a downloaded
  Windows executable during the build.

There is no application transpilation or npm install step for packaging. The
highlighter is already bundled; `node vendor/highlight-source/build.cjs` rebuilds
it deterministically from the included source without npm or network access. Runtime
renderer libraries and the small Windows resource editing libraries are included
with their licenses. Electron ZIPs are intentionally not embedded in the source
archives. They can be downloaded by the build script or provided in a cache.

`python3 vendor/reader-source/build-repair.py` regenerates the Mermaid repair
adapter in `vendor/reader-rich.js` from the included, unchanged Reader source.
This build helper and the corresponding source are excluded from runtime packages.

## Linux / WSL

From the source directory:

```bash
python3 scripts/build.py --target all --download --include-source
python3 scripts/validate-packages.py dist --runtime-cache .cache/electron
```

The equivalent development entry point is `scripts/build.sh`. It is included in
source only, never in a portable or installed application package.

To use previously downloaded runtimes without network access:

```bash
python3 scripts/build.py --target all --runtime-cache /path/to/electron-cache
```

That cache must contain:

```text
electron-v44.9.1-linux-x64.zip
electron-v44.9.1-win32-x64.zip
```

## Windows

Build the Windows portable package in PowerShell:

```powershell
py -3 scripts/build.py --target windows --download
```

Or use `scripts\build.ps1 --target windows --download` / `scripts\build.cmd
--target windows --download`. Linux tarball and Debian builds should be performed
on Linux or WSL, where symlink creation and Unix file permissions are preserved.

## Outputs and staging

`dist/` contains release archives; `.build/` contains temporary staging trees.
Both paths can be changed with `--output-dir` and `--work-dir`. `--stage-only`
prepares runtime trees for inspection without creating archives. `--target
source` creates the ZIP and tar.gz source archives.

The application files are copied into `resources/app/`, using an explicit
production allowlist. `scripts/`, tests, build dependencies, evidence, and source
development files do not enter runtime packages. Do not edit a staged runtime
after validation; change the source and rebuild instead.

## Package entry points

- Windows: `ThreadShelf Local Alternative.exe` at the ZIP root. Native x64 PE.
- Linux portable: `bin/threadshelf-local-alternative`, a relative symlink to the
  native ELF at `lib/threadshelf-local-alternative/threadshelf-local-alternative`.
- Debian: `/usr/bin/threadshelf-local-alternative`, a symlink to the native ELF
  under `/opt/threadshelf-local-alternative/`. A desktop menu entry is included.

No runtime launchers or shell wrappers are created. Chromium's renderer sandbox
remains enabled. The portable Linux package requires a desktop environment that
supports Electron's sandbox. The Debian package installs the upstream sandbox
helper with root ownership and the required setuid mode; it uses no maintainer
scripts. The packaging code does not add `--no-sandbox`.

Distribution README and notice files use paths valid at their packaged locations.
`APPLICATION-LICENSE` identifies the application MIT license; the runtime-level
`LICENSE` remains Electron’s original license. Complete application and renderer
notices remain under `resources/app/`. The validator resolves local links in each
generated distribution document and checks the distinct application-license bytes.

The Windows EXE is rebranded with this project's icon, name and 1.0.0.0 resource
version. The original upstream signature cannot remain valid after resource
editing; the generated application EXE is explicitly unsigned.

## Verification

`validate-packages.py` confirms the native Windows root EXE, native Linux targets,
symlink destinations, Debian metadata and ownership, desktop entry, runtime
license files, absence of launcher scripts and build tools, and exact SHA-256
parity between every included application file and the source tree. It does not
claim to replace native Windows execution or Linux distribution installation
tests. With `--runtime-cache`, it also derives the exact runtime file inventory
from the verified official Electron ZIPs, checks the unchanged runtime bytes,
and rejects unexpected files, duplicate paths and unsupported entry types.
The builder uses that same explicit inventory for runtime copies and archives.
Build evidence records which runtime hashes were used. In a platform-specific CI
job, add `--platform win32` to validate only the Windows ZIP, or `--platform linux`
to validate both the Linux tarball and Debian package. Runtime-cache verification
then requires only the selected platform’s official Electron ZIP. Omitting this
option validates all three packages as before.

The suite release contains one consolidated `SHA256SUM.txt` covering the GUI
packages. Package verification reports belong with the suite release documentation.

## Optional GUI and server tests

`node scripts/test.cjs` runs isolated unit tests without a browser or server.
`test/integration-server.cjs` and `test/start-gui-server.cjs` accept
`THREADSHELF_TEST_SERVER_ROOT` pointing to an existing ThreadShelf 1.3.0 code and
dependency tree. `THREADSHELF_TEST_MODEL_CACHE` may point to a complete cached
MiniLM model. These paths are read-only inputs: test databases, uploads, settings,
and a copied model cache live only in freshly created temporary directories.

For browser checks, install Playwright, or set `PLAYWRIGHT_PATH` to the Playwright
module directory, and optionally `CHROMIUM_PATH` to a compatible Chromium binary.
`node test/content.cjs` exercises content rendering. `node test/highlighting.cjs`
verifies token colors, language aliases, exact copying, safe fallbacks, phrase
search across tokens, and automatic theme switching. Build the demo, then set
`DEMO_PATH` and run `node test/demo.cjs` for the full offline interface checks.
`node test/demo-guides.cjs` uses that same file to verify the conversational guide
menu, all thirteen sample records, rendering showcases, and route boundaries.
`node test/reader-parity.cjs` exercises Reader-compatible rich rendering and
Mermaid repair without changing archived source text.

`node test/startup.cjs` checks the loading cover, first painted themes, readiness,
recovery, reduced motion, and preference-write guards. `node test/native-startup.cjs`
checks the native window color, sandboxed preload, saved/System themes, reload,
and startup recovery with the matching Electron runtime. These tests use isolated
profiles and controlled delays to expose intermediate startup frames.
The native startup test also requires `pngjs` beside Playwright for in-memory
pixel checks. It always uses a temporary test wrapper: select the official
Electron executable with `ELECTRON_PATH` and the application's directory with
`TSA_APP_PATH`. For packaged files, point the latter at `resources/app`; do not
set `TSA_PACKAGED` for this startup test.

`node test/native-demo.cjs` uses the same isolated native setup to exercise
Explore demo, the conversational menu, showcase diagrams, native clipboard,
and connection-panel behavior without contacting a server.

For native checks, set `ELECTRON_PATH`, the server variables above, and run
`node test/gui.cjs` with an X display on Linux. `TSA_PACKAGED=1` selects the
packaged application's native executable and bundled main process.
The highly restricted release environment needed `TSA_TEST_NO_UNIX_SOCKETS=1`:
this creates a temporary test-only wrapper that replaces only the unavailable
single-instance socket operation. For this restricted mode, use the matching
upstream Electron executable, set `TSA_APP_PATH` to the final packaged
`resources/app` directory, and leave `TSA_PACKAGED` unset; a packaged runtime
always chooses the bundled application before a command-line wrapper. The
release verifies that the upstream and packaged Linux ELF bytes are identical.
No such wrapper enters delivered runtime
packages. The root-only test harness passes `--no-sandbox`; production startup
does not. This means normal OS sandbox/single-instance behavior remains a
target-machine acceptance check.
