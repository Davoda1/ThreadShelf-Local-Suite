#!/usr/bin/env python3
"""Build the pinned public desktop packages from a clean checkout.

Copyright (c) 2026 davoda1. MIT; see ../LICENSE.
This is a development helper, not an application launcher.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
NODE = '24.19.0'
NPM = '11.9.0'
APPS = ('reader', 'analytics', 'alternative')


def run(args, cwd=ROOT, env=None):
    print('+ ' + ' '.join(map(str, args)), flush=True)
    subprocess.run(list(map(str, args)), cwd=cwd, env=env, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app', choices=('all',) + APPS, default='all')
    parser.add_argument('--target', choices=('all', 'windows', 'linux'), default='windows' if os.name == 'nt' else 'all')
    parser.add_argument('--out', type=Path, default=ROOT / 'release')
    parser.add_argument('--runtime-cache', type=Path, default=ROOT / '.cache' / 'electron')
    parser.add_argument('--skip-tests', action='store_true')
    args = parser.parse_args()
    if args.target != 'windows' and sys.platform != 'linux':
        parser.error('Linux TAR.GZ and DEB targets require GNU/Linux. On Windows use --target windows.')
    node = shutil.which('node')
    npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
    if not node or not npm:
        parser.error('Install the pinned Node.js/npm toolchain first; see maintainer/BUILD.md.')
    actual_node = subprocess.check_output([node, '--version'], text=True).strip().removeprefix('v')
    actual_npm = subprocess.check_output([npm, '--version'], text=True).strip()
    if (actual_node, actual_npm) != (NODE, NPM):
        parser.error(f'Expected Node {NODE} / npm {NPM}; found {actual_node} / {actual_npm}.')
    out = args.out.resolve()
    cache = args.runtime_cache.resolve()
    out.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env['ELECTRON_SKIP_BINARY_DOWNLOAD'] = '1'
    env['TSLR_NODE_VERSION'] = NODE
    for app in APPS if args.app == 'all' else (args.app,):
        project = ROOT / 'apps' / app
        package = json.loads((project / 'package.json').read_text(encoding='utf-8'))
        if package['version'] != '1.0.0':
            raise SystemExit(f'{app}: update this release helper together with the application version.')
        version = package.get('devDependencies', {}).get('electron', '44.9.1')
        runtime = cache / version
        runtime.mkdir(parents=True, exist_ok=True)
        if app == 'alternative':
            if not args.skip_tests:
                run([node, 'scripts/test.cjs'], project, env)
            targets = ('all',) if args.target == 'all' else ('windows',) if args.target == 'windows' else ('linux', 'deb')
            for target in targets:
                run([sys.executable, 'scripts/build.py', '--target', target, '--download',
                     '--runtime-cache', runtime, '--output-dir', out,
                     '--work-dir', project / '.build', '--node', node], project, env)
        else:
            run([npm, 'ci'], project, env)
            if not args.skip_tests:
                run([npm, 'test'], project, env)
            run([npm, 'run', 'build'], project, env)
            for target in ('windows', 'linux') if args.target == 'all' else (args.target,):
                run([node, 'scripts/package.mjs', '--win32' if target == 'windows' else '--linux',
                     '--runtime-cache', runtime, '--out', out], project, env)
    files = sorted(p for p in out.iterdir() if p.is_file() and (p.name.endswith('.zip') or p.name.endswith('.tar.gz') or p.suffix == '.deb'))
    lines = []
    for p in files:
        h = hashlib.sha256()
        with p.open('rb') as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b''):
                h.update(block)
        lines.append(f'{h.hexdigest()}  {p.name}\n')
    (out / 'SHA256SUM.txt').write_text(''.join(lines), encoding='utf-8', newline='\n')
    print(f'Built {len(files)} package files in {out}; see SHA256SUM.txt.')


if __name__ == '__main__':
    main()
