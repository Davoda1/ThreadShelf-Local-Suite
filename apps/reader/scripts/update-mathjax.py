#!/usr/bin/env python3
"""Restore pinned offline browser dependencies from authenticated npm integrity records.

The Mermaid bundle has its own npm lock and build recipe in tools/mermaid-bundle.
The original TeX font is extracted as constant data only, using the pinned v3
font source at build time; the shipped parser and renderer remain MathJax 4.
"""
import argparse
import base64
import hashlib
import io
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parent.parent

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=ROOT / '.cache/vendor')
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    lock = json.loads((ROOT / 'scripts/mathjax-vendor-lock.json').read_text())
    for package in lock['packages']:
        archive = args.cache / (package['name'].replace('/', '-') + '-' + package['version'] + '.tgz')
        data = archive.read_bytes() if archive.exists() else urllib.request.urlopen(package['tarball'], timeout=90).read()
        actual = 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode()
        if actual != package['integrity']:
            raise SystemExit('Integrity mismatch for ' + package['name'])
        archive.write_bytes(data)
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as tar:
            for member_name, destination in package['files'].items():
                target = ROOT / destination
                if not target.resolve().is_relative_to(ROOT):
                    raise SystemExit('Unsafe dependency output path')
                member = tar.getmember(member_name)
                if not member.isfile():
                    raise SystemExit('Dependency input must be a regular file')
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open('wb') as output:
                    output.write(tar.extractfile(member).read())
                    output.flush()
                    os.fsync(output.fileno())
            if generation := package.get('generate'):
                # The old package is build-time input only. Never copy its
                # executable implementation into public/ or source deliverables.
                with tempfile.TemporaryDirectory(prefix='threadshelf-font-') as work:
                    for member in tar.getmembers():
                        target = Path(work) / member.name
                        if not target.resolve().is_relative_to(Path(work)) or member.issym() or member.islnk():
                            raise SystemExit('Unsafe font source archive member')
                        if member.isfile():
                            target.parent.mkdir(parents=True, exist_ok=True)
                            target.write_bytes(tar.extractfile(member).read())
                    node = shutil.which('node')
                    if not node:
                        raise SystemExit('Node.js is required to generate the original font data')
                    output = ROOT / generation['output']
                    subprocess.run([node, str(ROOT / generation['script']), str(Path(work) / 'package'), str(output)], check=True)
                    if hashlib.sha256(output.read_bytes()).hexdigest() != generation['sha256']:
                        raise SystemExit('Generated original TeX font does not match its verified hash')
        print(package['name'] + ' ' + package['version'] + ': integrity verified')

if __name__ == '__main__':
    main()
