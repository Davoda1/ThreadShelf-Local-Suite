# Reproducible build toolchain

The public application version is **1.3.0**. Release tools are pinned to Node.js **24.22.1 LTS**, Electron **45.1.0**, and an isolated managed copy of npm **12.2.1** with its bundled Undici replaced by the complete official **6.29.1** package. This is a documented local toolchain modification, not a new official npm release. Electron's embedded Node and Chromium are part of that Electron runtime and are distinct from external build tools.

The source helper verifies both upstream toolchain archives against pinned SHA-512 integrity values, checks the resulting file manifest and verifies the Undici actually resolved by npm's node-gyp consumer. It does not modify global npm or fall back to an unverified system copy. npm still reports 12.2.1; the managed profile records Undici 6.29.1 separately.

`package-lock.json` records application dependency versions and integrity values. Use `node scripts/npm-toolchain.mjs -- ci` from the application source directory to reproduce that release graph. The bundled 7-Zip codec includes corresponding source, checksums and license notices.

## ONNX Runtime

Reader pins `onnxruntime-web`, `onnxruntime-node` and `onnxruntime-common` to **1.31.1** with exact dependency overrides. Transformers **4.3.2** is loaded from its supplied source entry, which imports the external ONNX packages. Its unused prebuilt bundles are excluded from desktop packages because they embed a different ONNX version.

The desktop main process disables native ONNX telemetry before creating workers. This is required because a worker’s private JavaScript environment alone does not change the environment read by native libraries. Model downloads still require the existing explicit setup action. The model identity and cache layout are unchanged. See [source provenance](../licenses/ONNX-SOURCE-ACCESS.md).

## Direct commands

Install the pinned Node version, then run the commands below from the `apps/reader/` application directory in a source checkout/archive. From the repository root, enter it with `cd apps/reader`. The first command prepares the managed npm copy and prints its verified profile; no global npm installation is required. Packaged desktop distributions do not contain this source build helper and do not need it for ordinary use.

```sh
node scripts/npm-toolchain.mjs --report
node scripts/npm-toolchain.mjs -- ci --include=optional
node scripts/npm-toolchain.mjs -- run build
node scripts/npm-toolchain.mjs -- test
node scripts/package.mjs --linux --out release
node scripts/package.mjs --win32 --out release
```

Linux packaging needs `dpkg-deb`, `tar` and Bash. The Windows target may be packaged from Linux; this does not replace native Windows runtime testing. Build and package tests report actual execution coverage.

## Development helpers

`bash scripts/run.sh --build`, `powershell -NoProfile -File scripts/run.ps1 -Build`, or `scripts\run.cmd -Build` prepare the exact default Node/Electron versions and use the same managed npm profile. Node archives are verified against official checksums. Electron archives are verified by the Electron download tooling.

The optional `--latest`/`-Latest` switch explicitly selects current Node and stable Electron for development experiments; it does not replace the managed npm profile. It is not the public release default. Exact override flags remain available. Toolchain selections are recorded locally under `.tooling/`, which is excluded from source commits.

The packager accepts a runtime cache with `--runtime-cache DIRECTORY`. Each cached `electron-vVERSION-PLATFORM-x64.zip` must have a matching entry in that cache's `SHASUMS256.txt`. Production dependencies are installed separately for the target OS; native libraries must not be reused across incompatible targets.

## Entry points

Windows ZIPs contain the native EXE at the extraction root. Linux TAR.GZ/DEB entry points link directly to the native ELF executable. Development scripts are not application launchers. See [Packaging policy](Packaging-Policy.md).

## Manual screenshots

`node scripts/preview.mjs` builds the production renderer with a synthetic in-memory dataset. Install Playwright separately and run `node scripts/capture-manual.mjs` to capture the guide images. Optional `THREADSHELF_PLAYWRIGHT_MODULE` and `THREADSHELF_CHROMIUM` select an installed Playwright module and Chromium executable. The first two positional arguments select the preview HTML and screenshot directory. Captures deliberately retain the preview banner and report that native storage, server access and OS-region detection are not exercised.

A native Linux package smoke test is available as `node tests/packaged-smoke.browser.mjs PATH_TO_EXTRACTED_PACKAGE/app REPORT.json`. Run it on a desktop display (or a temporary Xvfb display) with Playwright available. It creates an isolated synthetic profile, checks the real packaged worker/preload and reading/search/settings flow, then removes the synthetic profile. The documented debugger, singleton and sandbox accommodations are test-host settings only; they are never written into the release package.
