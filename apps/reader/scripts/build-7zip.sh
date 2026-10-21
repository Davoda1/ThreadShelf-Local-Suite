#!/usr/bin/env sh
set -eu
codec_script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
codec_root=$(CDPATH= cd -- "$codec_script_dir/.." && pwd)
codec_build=${1:-"$codec_root/.7zip-build"}
if [ -e "$codec_build" ]; then
  printf '%s\n' "Build directory already exists; select a fresh destination: $codec_build" >&2
  exit 1
fi
command -v make >/dev/null
command -v c++ >/dev/null
mkdir -p "$codec_build"
tar -xJf "$codec_root/vendor/7zip/7z2603-src.tar.xz" -C "$codec_build"
cd "$codec_build/CPP/7zip/Bundles/Alone2"
make -j2 -f ../../cmpl_gcc.mak
printf '%s\n' "Built executable: $codec_build/CPP/7zip/Bundles/Alone2/b/g/7zz"
