#!/usr/bin/env python3
"""Extract the already hash-verified package runtime for native source tests.

Copyright (c) 2026 davoda1. MIT; see ../LICENSE.
This never downloads files or changes packaged application bytes.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--platform', choices=('linux', 'win32'), required=True)
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('alternative_package', ROOT / 'apps/alternative/scripts/build.py')
    package = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(package)
    for app in ('reader', 'alternative'):
        manifest = json.loads((ROOT / 'apps' / app / 'package.json').read_text())
        if manifest['devDependencies']['electron'] != package.ELECTRON:
            raise ValueError('The native test runtime must match both application manifests.')
    cache = ROOT / '.cache/electron' / package.ELECTRON
    # Alternative uses a flat cache; @electron/get keeps hash-named subfolders.
    candidates = sorted(cache.rglob(f'electron-v{package.ELECTRON}-{args.platform}-x64.zip'))
    if not candidates:
        raise ValueError('Build the native package before preparing its test runtime.')
    archive = package.runtime(candidates[0].parent, args.platform, False)
    verification = ROOT / '.verification'
    verification.mkdir(exist_ok=True)
    destination = Path(tempfile.mkdtemp(prefix='native-html-preview-', dir=verification))
    package.extract(archive, destination)
    print(destination / ('electron.exe' if args.platform == 'win32' else 'electron'))


if __name__ == '__main__':
    main()
