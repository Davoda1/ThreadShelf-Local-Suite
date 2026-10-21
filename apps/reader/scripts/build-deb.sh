#!/usr/bin/env bash
# Finalize a DEB staging tree and reject a package without its required sandbox mode.
set -euo pipefail
if [[ $# -ne 2 ]]; then
  echo 'Usage: build-deb.sh STAGING_DIRECTORY OUTPUT_DEB' >&2
  exit 2
fi
deb_staging=$1
deb_output=$2
deb_sandbox="$deb_staging/opt/threadshelf-local-reader/chrome-sandbox"
[[ -f "$deb_sandbox" ]] || { echo 'DEB staging is missing chrome-sandbox.' >&2; exit 1; }
# Keep this immediately before dpkg-deb in the same native shell. Managed copy
# layers can clear setuid while completing earlier staging writes.
chmod 4755 "$deb_sandbox"
dpkg-deb --threads-max=1 --root-owner-group --build "$deb_staging" "$deb_output"
# Stream the actual archive, checking owner/group and mode without extraction.
# tar consumes the full input; no early-closing pipe or large in-memory buffer.
deb_sandbox_record="$(dpkg-deb --fsys-tarfile "$deb_output" | LC_ALL=C tar --numeric-owner -tvf - ./opt/threadshelf-local-reader/chrome-sandbox)"
if [[ "$deb_sandbox_record" != '-rwsr-xr-x 0/0 '* ]]; then
  echo "DEB sandbox archive metadata is incorrect: $deb_sandbox_record" >&2
  exit 1
fi
printf '%s\n' 'Verified archived chrome-sandbox: root:root, mode 04755.'
