# Packaging policy

Version 1.3.1 produces these native packages:

- `ThreadShelf-Local-Analytics-1.3.1-Windows-x64-Portable.zip`
- `ThreadShelf-Local-Analytics-1.3.1-Linux-amd64.tar.gz`
- `threadshelf-local-analytics_1.3.1_amd64.deb`

The Windows EXE is at the archive root. The Linux archive contains the real `threadshelf-local-analytics` executable and its runtime files at root. The DEB installs a native executable under `/opt/threadshelf-local-analytics` and a regular static ELF entry point in `/usr/bin`. Runtime packages contain no GUI launcher scripts.

## Toolchain

Release builds use Node 24.22.1, Electron 45.1.0, and an isolated managed copy of npm 12.2.1 with its bundled Undici replaced by the complete official 6.29.1 package. The npm helper verifies pinned SHA-512 archive integrity, the resulting file manifest and node-gyp's actual Undici resolution. This is a local toolchain modification, not an official patched npm release. It neither modifies global npm nor falls back to an unverified system copy. npm's version remains 12.2.1; Undici 6.29.1 is recorded separately in the managed profile.

The isolated runtime helper resolves the exact Node release from the release's official `SHASUMS256.txt` and verifies the downloaded archive. `--system` on GNU/Linux or the corresponding Windows switch allows an existing Node installation; the managed npm profile is still required. Use the exact release versions for reproducibility. Electron archive checksums are verified against the release checksum file. Dependency versions are locked in `package-lock.json`.

Linux build tools include curl, tar, xz, sha256sum, Python 3 and dpkg-deb. The target desktop needs the GTK/graphics libraries required by Electron. A DEB is created on Linux; Windows packaging can also run on Linux. Cross-platform packaging is not native Windows execution testing.

## Build and package

From this application directory in a source checkout/archive. Packaged desktop distributions do not contain these build helpers and do not require npm:

```sh
./scripts/run.sh --build
./scripts/run.sh --test
node scripts/package.mjs --linux --win32 --out release
python3 scripts/validate-packages.py --binaries --out release --runtime-cache .packaging/runtime-cache
```

On Windows use `scripts/run.ps1 -Build`, `scripts/run.ps1 -Test`, and `node scripts/package.mjs --win32 --out release`. The `run.cmd` wrapper forwards the same actions. With Node 24.22.1 already selected, `node scripts/npm-toolchain.mjs --report` prepares and verifies the managed npm profile; use `node scripts/npm-toolchain.mjs -- ci`, `node scripts/npm-toolchain.mjs -- run build` and `node scripts/npm-toolchain.mjs -- test` for direct source installation, build and tests. `--runtime-cache /path/to/cache` can reuse verified Electron ZIPs and their checksum file. Build commands require access to the official Node/Electron downloads and npm registry unless those inputs are already cached.

The package script uses the renderer already produced by the build step, stages only production dependencies, bundles the original 7-Zip executable and required license/source offer, and creates native archives. The Linux package verifies regular native ELF entry points and rejects symlinks and launcher scripts at those entry points. The validator checks package structure, runtime contents, native executable identities, required resources, notices, and checksums.

The suite release uses one combined source archive and a release checksum manifest. Component `--source` packaging and the synthetic browser preview are optional development conveniences, not additional required releases. Exclude `node_modules`, runtime/build caches, personal profiles, environment files and private captures from the source archive.
