# Bundled 7-Zip 26.03

ThreadShelf Local Reader includes unmodified upstream 7-Zip executables. Users do
not install 7-Zip or put any archiver on PATH. The application launches the
bundled executable without a shell, using bounded pipes. This is an intentional
change from the plan's preferred native Node addon: separate native processes
avoid Electron ABI coupling, make cancellation effective, and isolate crashes.

| Target | Included executable | Upstream distribution |
|---|---|---|
| GNU/Linux amd64 | `linux-x64/7zz` | Static `7zzs` from `7z2603-linux-x64.tar.xz`, renamed |
| Windows x64 | `win32-x64/7za.exe` | `x64/7za.exe` from `7z2603-extra.7z` |

The release was verified at <https://www.7-zip.org/download.html> on 28 September
2026. The published release date is 3 September 2026. Exact download URLs and
locally measured SHA-256 hashes are recorded in `provenance.json`. These hashes
record the retrieved artifacts; they are not represented as publisher signatures.

## Licensing and complete corresponding source

7-Zip is a separate upstream program; it is not relicensed as ThreadShelf code.
`License.txt` retains 7-Zip's LGPL/BSD/unRAR notices and `copying.txt` contains the GNU
LGPL 2.1 text. The complete unmodified upstream source, build files and build
instructions are included in `7z2603-src.tar.xz` in source and binary packages.
The app uses only 7z and ZIP storage; the full Linux program also includes other
upstream readers. The unRAR source must not be used to recreate the proprietary
RAR compression algorithm. Source and notices remain available independently of
the license of ThreadShelf's own code.

The executable is replaceable: rebuild 7-Zip and replace the matching executable
at the path above, preserving the executable name and executable permissions. The application
does not require an upstream checksum at runtime, does not link against 7-Zip,
and does not prevent modified compatible versions from running. The verification
script reports changes for reproducible packaging; it is not a runtime restriction.

## Build or reacquire

The existing executables are complete and ready to use. No build is needed to run
the application. To rebuild Linux, install GNU make and a C/C++ compiler, then run:

```sh
./scripts/build-7zip.sh /absolute/path/to/7zip-build
```

That script creates a separate build tree and prints the built executable path;
it does not automatically replace the bundled binary. The upstream source's
`DOC/readme.txt` documents optional assembly optimization and additional targets.
On Windows, extract `7z2603-src.tar.xz` (for example with Windows `tar`), open a
Visual Studio x64 Native Tools Command Prompt, change into
`CPP\7zip\Bundles\Alone`, and run `nmake`. A supported Visual Studio C++ toolchain
and Windows SDK are required. See `DOC/readme.txt` for exact upstream requirements.

To reacquire the published binaries, use only the exact official GitHub URLs in
`provenance.json`, verify the downloaded archives against the recorded hashes,
extract `7zzs` and `x64/7za.exe`, and copy them to the paths in the table. The
Linux executable must have mode `0755`. Do not substitute obsolete p7zip builds.
Run `node scripts/verify-codec.mjs` to verify the bundled files and source.

## Storage parameters and limits

- Profiles: `7z` (LZMA2, 16 MiB dictionary, compression level 7, two threads) and
  `zip6` (ZIP/DEFLATE level 6, two threads). ZIP uses ZIP64 when required.
- Each object has one `payload.bin` member. Pack independence prevents a solid
  archive spanning the database. 7z header compression and saved timestamps are
  disabled; object plaintext and hashes are independent of host metadata.
- Buffer API: at most 64 MiB expanded input/output. It runs synchronously inside
  the storage worker; cancellation is checked between objects, not during one
  synchronous object. Default per-process timeout is five minutes.
- File API: streaming, at most 64 GiB expanded per file, explicit decode budget,
  live AbortSignal cancellation, 15-minute process timeout. Catalog databases
  and backup components can exceed 4 GiB without whole-file RAM allocation.
- Decoding verifies container, exactly one member, expected length if supplied,
  supported method, 16 MiB LZMA2 dictionary, native CRC, and output byte limits.
  Storage verifies the object's SHA-256 descriptor separately.
- Native encoding RAM includes dictionary/match-finder overhead beyond 16 MiB;
  the dictionary setting is not a total process RAM guarantee. Temporary buffer
  operations write only compressed bytes in an owned private directory. File
  decoding writes the requested bounded plaintext destination and removes failed
  temporary output. Abrupt OS termination can leave an orphan private codec
  directory containing compressed bytes; it is not mistaken for committed data.

## Qualification

`node --test tests/codec.test.mjs` covers both profiles, Unicode content and paths,
incompressible input, empty records, corrupt/truncated data, descriptor mismatch,
size caps, malformed member names, oversized dictionaries, both conversion
directions, no-overwrite publication, and cancellation cleanup.

`node scripts/test-codec-interoperability.mjs report.json` additionally checks
independent py7zr/Python zipfile extraction, a synthetic mixed JSON corpus, and
long Unicode paths. Python and py7zr are development-only prerequisites for this
optional check; the application never needs them. The measured compression ratios describe
that synthetic corpus and are not estimates for arbitrary user exports.

`node scripts/test-codec-large.mjs report.json` is an opt-in real ZIP64 boundary
test using a 4 GiB + 65 byte sparse source. It requires 4.1 GiB temporary free disk
space and Python for an independent ZIP reader. The test streams native encoding,
checks independent ZIP64 metadata/CRC/SHA-256, streams native restoration, compares
the complete restored hash, then removes both large files.

Native Windows execution must be tested on Windows. Having the upstream PE x64
binary included and the binary hash checked is not a claim that this Linux validation
environment executed the Windows program.
