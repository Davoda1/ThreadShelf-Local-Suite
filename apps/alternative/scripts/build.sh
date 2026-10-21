#!/usr/bin/env bash
# Development/build entry only. This script is excluded from runtime packages.
set -euo pipefail
task_script_dir="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$task_script_dir/build.py" "$@"
