# Packaging scripts

> Documentation adaptation: only relative link destinations have been replaced with matching upstream release links. The [unaltered upstream README](sharp-libvips-Upstream-README-original.txt) is retained byte-for-byte with its provenance in `UPSTREAM-SOURCES.json`. All original license and attribution text below is unchanged.

libvips and its dependencies are provided as pre-compiled shared libraries
for the most common operating systems and CPU architectures.

These are [packaged](https://github.com/lovell/sharp-libvips/tree/ebb95f8add54eee8bed840e3fb587e4cbec857d7/npm) and published to the npm registry under the
[@img](https://www.npmjs.com/org/img) organisation.

## Creating a tarball

Most people will not need to do this; proceed with caution.

Run the top-level [build script](https://github.com/lovell/sharp-libvips/blob/ebb95f8add54eee8bed840e3fb587e4cbec857d7/build.sh) without parameters for help.

### Linux

One [build script](https://github.com/lovell/sharp-libvips/blob/ebb95f8add54eee8bed840e3fb587e4cbec857d7/build/posix.sh) is used to (cross-)compile
the same shared libraries within multiple containers.

* [x64 glibc](https://github.com/lovell/sharp-libvips/blob/ebb95f8add54eee8bed840e3fb587e4cbec857d7/platforms/linux-x64/Dockerfile)
* [x64 musl](https://github.com/lovell/sharp-libvips/blob/ebb95f8add54eee8bed840e3fb587e4cbec857d7/platforms/linuxmusl-x64/Dockerfile)
* [ARMv6 glibc](https://github.com/lovell/sharp-libvips/blob/ebb95f8add54eee8bed840e3fb587e4cbec857d7/platforms/linux-armv6/Dockerfile)
* [ARM64v8-A glibc](https://github.com/lovell/sharp-libvips/blob/ebb95f8add54eee8bed840e3fb587e4cbec857d7/platforms/linux-arm64v8/Dockerfile)
* [ARM64v8-A musl](https://github.com/lovell/sharp-libvips/blob/ebb95f8add54eee8bed840e3fb587e4cbec857d7/platforms/linuxmusl-arm64v8/Dockerfile)
* [ppc64le glibc](https://github.com/lovell/sharp-libvips/blob/ebb95f8add54eee8bed840e3fb587e4cbec857d7/platforms/linux-ppc64le/Dockerfile)
* [RISC-V 64-bit glibc](https://github.com/lovell/sharp-libvips/blob/ebb95f8add54eee8bed840e3fb587e4cbec857d7/platforms/linux-riscv64/Dockerfile)
* [s390x glibc](https://github.com/lovell/sharp-libvips/blob/ebb95f8add54eee8bed840e3fb587e4cbec857d7/platforms/linux-s390x/Dockerfile)

### Windows

The output of libvips' [build-win64-mxe](https://github.com/libvips/build-win64-mxe)
static "web" releases are [post-processed](https://github.com/lovell/sharp-libvips/blob/ebb95f8add54eee8bed840e3fb587e4cbec857d7/build/win.sh) within a [container](https://github.com/lovell/sharp-libvips/blob/ebb95f8add54eee8bed840e3fb587e4cbec857d7/platforms/win32/Dockerfile).

### macOS

Uses a macOS virtual machine hosted by GitHub to compile the shared libraries.
The dylib files are compiled within the same build script as Linux.

* x64
* ARM64

Dependency paths are modified to use the relative `@rpath` with `install_name_tool`.

### WebAssembly

The scripts from [wasm-vips](https://github.com/kleisauke/wasm-vips)
are [used to compile](https://github.com/lovell/sharp-libvips/blob/ebb95f8add54eee8bed840e3fb587e4cbec857d7/build/wasm.sh) libvips and its dependencies
as static Wasm libraries ready for further compilation into a single,
statically-linked sharp shared library.

## Licences

These scripts are licensed under the terms of the [Apache 2.0 Licence](https://github.com/lovell/sharp-libvips/blob/ebb95f8add54eee8bed840e3fb587e4cbec857d7/LICENSE).

The shared libraries contained in the tarballs are distributed under
the terms of [various licences](https://github.com/lovell/sharp-libvips/blob/ebb95f8add54eee8bed840e3fb587e4cbec857d7/THIRD-PARTY-NOTICES.md), all of which
are compatible with the Apache 2.0 Licence.
