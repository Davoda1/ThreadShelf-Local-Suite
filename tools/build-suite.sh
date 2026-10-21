#!/usr/bin/env bash
set -euo pipefail
suite_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
exec python3 "$suite_root/tools/build-suite.py" "$@"
