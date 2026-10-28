#!/usr/bin/env python3
"""Reuse the tested bounded prefetcher for the final runtime part's URLs.

Completed per-source receipts are reusable across interrupted attempts. The
collector still validates every TAR member and global assembly afterwards.
"""
import importlib.util
import json
from pathlib import Path
import sys

root = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('bounded_prefetch', root / 'prefetch-part02.py')
prefetch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prefetch)
plan = json.loads((root / 'part06-final-collection-plan.json').read_text())
prefetch.ROOT = Path('/tmp/threadshelf-source-staging/runtime06-prefetch')
prefetch.OUTPUT = prefetch.ROOT
prefetch.ROWS = [row for row in plan if not row.get('local_file')]
# Finish independent inputs before the two identical endpoints currently under
# source-identity review; a fetch failure must not hide another missing input.
prefetch.ROWS.sort(key=lambda row: row['path'].endswith('/clang-format/script'))
prefetch.CAP = 200_000_000
prefetch.RESERVE = 500 * 1024**2
prefetch.STATE['aggregate_byte_cap'] = prefetch.CAP
prefetch.STATE['free_space_reserve_bytes'] = prefetch.RESERVE
# libc++abi's literal '+' is an ordinary filename character. Keep every other
# existing source URL/path restriction, without changing the frozen helper.
original_validate = prefetch.validate
def validate_with_literal_plus(row):
    original_validate({**row, 'archive': row['archive'].replace('+', 'p')})
prefetch.validate = validate_with_literal_plus
sys.argv = [sys.argv[0], '--output', str(prefetch.OUTPUT)]
result = prefetch.main()
if result == 0:
    fetched = json.loads((prefetch.ROOT / 'part02-local-plan.json').read_text())
    by_name = {row['archive']: row for row in fetched}
    local_plan = [by_name.get(row['archive'], row) for row in plan]
    if len(local_plan) != 122 or not all(row.get('local_file') for row in local_plan):
        raise ValueError('Final local plan is incomplete')
    (root / 'part06-all-local-plan.json').write_text(json.dumps(local_plan, indent=2) + '\n')
raise SystemExit(result)
