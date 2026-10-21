#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
latest=0
action=run
actions=0
node_version='24.19.0'
electron_version='44.9.1'
explicit_version=0
while (($#)); do
  case "$1" in
    --latest) latest=1; node_version=''; electron_version='' ;;
    --build|--test|--package|--resolve-only) action="${1#--}"; actions=$((actions + 1)) ;;
    --node-version|--electron-version)
      explicit_version=1
      [[ $# -gt 1 ]] || { echo "Missing value for $1" >&2; exit 2; }
      if [[ "$1" == --node-version ]]; then node_version="$2"; else electron_version="$2"; fi
      shift ;;
    --help|-h)
      echo 'Usage: ./scripts/run.sh [--latest] [--build|--test|--package|--resolve-only]'
      echo 'Default: exact Node 24.19.0 LTS and Electron 44.9.1.'
      echo '--latest: resolve stable Current Node (not LTS, alpha, beta, or nightly).'
      echo 'Exact reproduction: --node-version X.Y.Z --electron-version X.Y.Z'
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
(( actions <= 1 )) || { echo 'Select only one of --build, --test, --package, or --resolve-only.' >&2; exit 2; }
(( ! latest || ! explicit_version )) || { echo '--latest cannot be combined with exact version options.' >&2; exit 2; }
for version in "$node_version" "$electron_version"; do
  [[ -z "$version" || "$version" =~ ^v?[1-9][0-9]*\.[0-9]+\.[0-9]+$ ]] || { echo "Expected an exact stable version: $version" >&2; exit 2; }
done
for tool in curl tar sha256sum awk; do command -v "$tool" >/dev/null || { echo "Install $tool and retry." >&2; exit 1; }; done
[[ "$(uname -s)" == Linux ]] || { echo 'This script targets GNU/Linux.' >&2; exit 1; }
case "$(uname -m)" in x86_64|amd64) node_arch=x64 ;; aarch64|arm64) node_arch=arm64 ;; *) echo 'Unsupported CPU architecture.' >&2; exit 1 ;; esac
cd "$project_dir"
tooling_dir="$project_dir/.tooling"
mkdir -p "$tooling_dir/downloads"
metadata_file="$(mktemp "$tooling_dir/downloads/node-index.XXXXXX")"
sums_file="$(mktemp "$tooling_dir/downloads/node-sums.XXXXXX")"
trap 'rm -f -- "$metadata_file" "$sums_file"' EXIT
fetch() { curl --proto '=https' --tlsv1.2 -fsSL --retry 3 --connect-timeout 20 --max-time 300 "$1" -o "$2"; }
export TSLR_NODE_CHANNEL=lts
if (( latest )); then export TSLR_NODE_CHANNEL=current; fi
if [[ -z "$node_version" ]]; then
  echo "Checking official Node.js $TSLR_NODE_CHANNEL releases online..."
  fetch 'https://nodejs.org/dist/index.json' "$metadata_file" || { echo 'Cannot check current Node releases. No cached version is being called latest; retry online or select exact versions explicitly.' >&2; exit 1; }
  node_version="$(awk -v channel="$TSLR_NODE_CHANNEL" -f scripts/select-node.awk "$metadata_file")" || { echo "No supported stable Node $TSLR_NODE_CHANNEL release found." >&2; exit 1; }
  export TSLR_NODE_INDEX_FILE="$metadata_file"
else
  node_version="v${node_version#v}"
  export TSLR_NODE_CHANNEL=exact
  unset TSLR_NODE_INDEX_FILE
fi
[[ "${node_version#v}" =~ ^([0-9]+)\. ]] && (( BASH_REMATCH[1] >= 24 )) || { echo 'Node 24 or newer is required.' >&2; exit 1; }
node_archive="node-$node_version-linux-$node_arch.tar.xz"
node_url="https://nodejs.org/dist/$node_version"
fetch "$node_url/SHASUMS256.txt" "$sums_file"
node_sha="$(awk -v file="$node_archive" '$2 == file && length($1) == 64 {print $1}' "$sums_file")"
[[ "$node_sha" =~ ^[a-fA-F0-9]{64}$ ]] || { echo "Official checksum missing for $node_archive" >&2; exit 1; }
archive_path="$tooling_dir/downloads/$node_archive"
verify_archive() { [[ -f "$archive_path" ]] && [[ "$(sha256sum -- "$archive_path" | awk '{print $1}')" == "$node_sha" ]]; }
if ! verify_archive; then
  fetch "$node_url/$node_archive" "$archive_path.part.$$"
  [[ "$(sha256sum -- "$archive_path.part.$$" | awk '{print $1}')" == "$node_sha" ]] || { rm -f -- "$archive_path.part.$$"; echo 'Node archive checksum mismatch.' >&2; exit 1; }
  mv -f -- "$archive_path.part.$$" "$archive_path"
fi
verify_archive || { echo 'Node archive checksum mismatch.' >&2; exit 1; }
node_dir="$tooling_dir/${node_archive%.tar.xz}"
if [[ ! -x "$node_dir/bin/node" ]] || [[ "$("$node_dir/bin/node" --version 2>/dev/null || true)" != "$node_version" ]]; then
  rm -rf -- "$node_dir"
  tar --no-same-owner -xJf "$archive_path" -C "$tooling_dir"
fi
[[ "$("$node_dir/bin/node" --version)" == "$node_version" ]] || { echo 'Extracted Node version does not match the selected release.' >&2; exit 1; }
export PATH="$node_dir/bin:$PATH"
export TSLR_NODE_VERSION="$node_version" TSLR_NODE_SHA256="$node_sha"
# Native fetch in supported Node releases honors the same configured proxy as curl.
if [[ -n "${HTTPS_PROXY:-}${HTTP_PROXY:-}${https_proxy:-}${http_proxy:-}" ]]; then export NODE_USE_ENV_PROXY=1; fi
resolve_args=()
[[ -z "$electron_version" ]] || resolve_args=(--electron-version "$electron_version")
export TSLR_ELECTRON_VERSION
TSLR_ELECTRON_VERSION="$(node scripts/runtime-policy.mjs "${resolve_args[@]}")"
export ELECTRON_OVERRIDE_DIST_PATH="$tooling_dir/electron-$TSLR_ELECTRON_VERSION-linux-$node_arch/dist"
echo "Selected Node $(node --version) ($TSLR_NODE_CHANNEL); npm $(npm --version); Electron $TSLR_ELECTRON_VERSION (stable)."
echo 'Exact selections recorded in .tooling/toolchain.json.'
[[ "$action" != resolve-only ]] || exit 0
ONNXRUNTIME_NODE_INSTALL=skip ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --include=optional
node scripts/ensure-electron.mjs
npm run build
case "$action" in
  build) ;;
  test) npm test ;;
  package) npm run package ;;
  run) npm start ;;
esac
