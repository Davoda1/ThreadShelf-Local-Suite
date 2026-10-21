#!/usr/bin/env bash
# Source development/build tooling only. No application launcher is packaged.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
pinned=1; action=build
for arg in "$@"; do
 case "$arg" in
  --pinned) pinned=1 ;;
  --system) pinned=0 ;;
  --build) action=build ;;
  --test) action=test ;;
  --package) action=package ;;
  --run) action=run ;;
  --help|-h) echo 'Usage: ./scripts/run.sh [--pinned|--system] [--build|--test|--package|--run]'; exit 0 ;;
  *) echo "Unknown option: $arg" >&2; exit 2 ;;
 esac
done
cd "$project_dir"
if ((pinned)); then
 for tool in curl tar sha256sum; do command -v "$tool" >/dev/null || { echo "Install $tool and retry." >&2; exit 1; }; done
 [[ "$(uname -s)" == Linux ]] || { echo 'This script targets GNU/Linux.' >&2; exit 1; }
 case "$(uname -m)" in x86_64|amd64) node_arch=x64 ;; *) echo 'Packages target GNU/Linux x86-64.' >&2; exit 1 ;; esac
 tooling_dir="$project_dir/.tooling"; mkdir -p "$tooling_dir/downloads"
 curl -fsSL --retry 2 'https://nodejs.org/dist/v24.19.0/SHASUMS256.txt' -o "$tooling_dir/downloads/SHASUMS256.txt"
 node_archive="$(awk -v a="$node_arch" '$2 ~ ("^node-v[0-9.]+-linux-" a "\\.tar\\.xz$") {print $2; exit}' "$tooling_dir/downloads/SHASUMS256.txt")"
 [[ -n "$node_archive" ]] || { echo 'Cannot resolve pinned Node.js 24.19.0 LTS.' >&2; exit 1; }
 if [[ -f "$tooling_dir/downloads/$node_archive" ]] && ! (cd "$tooling_dir/downloads"; awk -v a="$node_archive" '$2 == a {print}' SHASUMS256.txt | sha256sum -c - >/dev/null 2>&1); then rm -f -- "$tooling_dir/downloads/$node_archive"; fi
 if [[ ! -f "$tooling_dir/downloads/$node_archive" ]]; then
  node_version="${node_archive%%-linux-*}"; node_version="${node_version#node-}"
  curl -fsSL --retry 2 "https://nodejs.org/dist/$node_version/$node_archive" -o "$tooling_dir/downloads/$node_archive.part"
  mv -- "$tooling_dir/downloads/$node_archive.part" "$tooling_dir/downloads/$node_archive"
 fi
 (cd "$tooling_dir/downloads"; awk -v a="$node_archive" '$2 == a {print}' SHASUMS256.txt | sha256sum -c -)
 node_dir="$tooling_dir/${node_archive%.tar.xz}"
 if [[ ! -x "$node_dir/bin/node" ]] || ! "$node_dir/bin/node" --version >/dev/null 2>&1; then tar --no-same-owner -xJf "$tooling_dir/downloads/$node_archive" -C "$tooling_dir"; fi
 export PATH="$node_dir/bin:$PATH"
fi
command -v node >/dev/null; command -v npm >/dev/null
node -e 'if(Number(process.versions.node.split(".")[0])<24) throw Error("Node 24+ required; use default pinned LTS tooling")'
echo "Node $(node --version); npm $(npm --version)"
npm ci --ignore-scripts --no-audit --no-fund
node scripts/ensure-electron.mjs
npm run build
case "$action" in
 build) ;;
 test) npm test ;;
 package) npm test; npm run package ;;
 run) npm start ;;
esac
