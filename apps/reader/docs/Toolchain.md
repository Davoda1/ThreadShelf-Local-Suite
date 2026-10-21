# Reproducible build toolchain

The public application version is **1.0.0**. Release tools are pinned to Node.js **24.19.0 LTS**, npm **11.9.0** and Electron **44.9.1**. Electron's embedded Node and Chromium are part of that Electron runtime and are distinct from external build tools.

`package-lock.json` records dependency versions and integrity values. Use `npm ci`, not an unlocked dependency update, to reproduce the release graph. The bundled 7-Zip codec includes corresponding source, checksums and license notices.

## Direct commands

Install the pinned Node/npm toolchain, then run the commands below from the `apps/reader/` application directory. From the repository root, enter it with `cd apps/reader`:

```sh
npm ci --include=optional
npm run build
npm test
node scripts/package.mjs --linux --out release
node scripts/package.mjs --win32 --out release
```

Linux packaging needs `dpkg-deb`, `tar` and Bash. The Windows target may be packaged from Linux; this does not replace native Windows runtime testing. Build and package tests report actual execution coverage.

## Development helpers

`bash scripts/run.sh --build`, `powershell -NoProfile -File scripts/run.ps1 -Build`, or `scripts\run.cmd -Build` prepare the exact default Node/Electron versions. Node archives are verified against official checksums. Electron archives are verified by the Electron download tooling.

The optional `--latest`/`-Latest` switch explicitly selects current Node and stable Electron for development experiments. It is not the public release default. Exact override flags remain available. Toolchain selections are recorded locally under `.tooling/`, which is excluded from source commits.

The packager accepts a runtime cache with `--runtime-cache DIRECTORY`. Each cached `electron-vVERSION-PLATFORM-x64.zip` must have a matching entry in that cache's `SHASUMS256.txt`. Production dependencies are installed separately for the target OS; native libraries must not be reused across incompatible targets.

## Entry points

Windows ZIPs contain the native EXE at the extraction root. Linux TAR.GZ/DEB entry points link directly to the native ELF executable. Development scripts are not application launchers. See [Packaging policy](Packaging-Policy.md).

## Manual screenshots

`node scripts/preview.mjs` builds the production renderer with a synthetic in-memory dataset. Install Playwright separately and run `node scripts/capture-manual.mjs` to capture the guide images. Optional `THREADSHELF_PLAYWRIGHT_MODULE` and `THREADSHELF_CHROMIUM` select an installed Playwright module and Chromium executable. The first two positional arguments select the preview HTML and screenshot directory. Captures deliberately retain the preview banner and report that native storage, server access and OS-region detection are not exercised.

A native Linux package smoke test is available as `node tests/packaged-smoke.browser.mjs PATH_TO_EXTRACTED_PACKAGE/app REPORT.json`. Run it on a desktop display (or a temporary Xvfb display) with Playwright available. It creates an isolated synthetic profile, checks the real packaged worker/preload and reading/search/settings flow, then removes the synthetic profile. The documented debugger, singleton and sandbox accommodations are test-host settings only; they are never written into the release package.
