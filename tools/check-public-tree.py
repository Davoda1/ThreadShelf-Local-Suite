#!/usr/bin/env python3
"""Check repository structure, version metadata and accidental private state.

This is a release hygiene check, not a complete secret scanner.
Copyright (c) 2026 davoda1. MIT.
"""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
IGNORE = {'.git', '.cache', '.build', '.packaging', '.verification', '.tooling', '__pycache__', '.build-runtime'}
REQUIRED = ['README.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'CONTRIBUTING.md', 'SECURITY.md',
            'server-patch/README.md', 'manual/README.md', 'docs/index.html', 'maintainer/GITHUB-SETUP.md']


def skip(relative):
    parts = relative.parts
    if any(p in IGNORE for p in parts):
        return True
    if parts and parts[0] in {'release', 'releases', 'out', 'node_modules'}:
        return True
    if len(parts) > 2 and parts[0] == 'apps' and parts[2] in {'dist', 'release', 'releases'}:
        return True
    if len(parts) > 2 and parts[:3] == ('tools', 'mermaid-bundle', 'node_modules'):
        return True
    return len(parts) > 2 and parts[0] == 'apps' and parts[1] in {'reader', 'analytics'} and parts[2] == 'node_modules'


def main():
    problems = []
    for name in REQUIRED:
        if not (ROOT / name).is_file():
            problems.append('Missing required file: ' + name)
    for app in ('reader', 'analytics', 'alternative'):
        file = ROOT / 'apps' / app / 'package.json'
        if not file.is_file():
            problems.append('Missing app manifest: ' + app)
            continue
        package = json.loads(file.read_text(encoding='utf-8'))
        if package.get('version') != '1.0.0':
            problems.append('Incorrect public version: ' + app)
    count = 0
    largest = (0, '')
    for p in ROOT.rglob('*'):
        relative = p.relative_to(ROOT)
        if skip(relative):
            continue
        if p.is_symlink():
            problems.append('Unexpected repository symlink: ' + relative.as_posix())
            continue
        if not p.is_file():
            continue
        count += 1
        size = p.stat().st_size
        largest = max(largest, (size, relative.as_posix()))
        if size > 100 * 1024 * 1024:
            problems.append('File exceeds 100 MiB: ' + relative.as_posix())
        if p.name == '.env' or (p.name.startswith('.env.') and p.name != '.env.example'):
            problems.append('Environment file included: ' + relative.as_posix())
        if any(x in {'.lancedb', '.threadshelf'} for x in relative.parts):
            problems.append('Private state directory included: ' + relative.as_posix())
        if p.suffix.lower() in {'.pem', '.key'}:
            problems.append('Possible private key included: ' + relative.as_posix())
    if problems:
        print('\n'.join(problems), file=sys.stderr)
        return 1
    print(f'Public tree checks passed: {count} files; largest {largest[0]} bytes ({largest[1]}).')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
