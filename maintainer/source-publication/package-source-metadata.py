#!/usr/bin/env python3
"""Package an explicit, hash-bound source metadata allowlist; execute no inputs.

The input array maps local files to portable ZIP member paths. The final outer
publication bundle must not be an input, because it records this ZIP's hash.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import zipfile


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def package(allowlist, destination, report):
    rows = json.loads(allowlist.read_text())
    if not isinstance(rows, list) or not rows:
        raise ValueError('An explicit nonempty metadata allowlist is required')
    seen = set()
    for row in rows:
        name = row['file']
        if not isinstance(name, str) or name in ('', '.') or name.startswith('/') or name != str(PurePosixPath(name)) or any(c in name for c in '\\\0\r\n:') or '..' in name.split('/') or name in seen:
            raise ValueError('Unsafe or duplicate metadata member')
        if PurePosixPath(name).name == 'PUBLICATION-SOURCE-INPUTS.json':
            raise ValueError('Outer publication bundle would create a self-hash cycle')
        source = Path(row['source'])
        if not stat.S_ISREG(source.lstat().st_mode) or source.stat().st_size != row['bytes'] or digest(source) != row['sha256']:
            raise ValueError('Metadata source is not an exact regular-file input: ' + name)
        seen.add(name)
        # Only reviewed local proof/input files are allowed. This supplements
        # the explicit provenance allowlist; it is not a broad secret detector.
        if source.stat().st_size < 16 * 1024**2 and source.suffix not in ('.gz', '.zip'):
            if re.search(rb'github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|Authorization:\s*(?:Bearer|token)\s+[A-Za-z0-9_]{20,}', source.read_bytes()):
                raise ValueError('Credential-shaped text requires review: ' + name)
    if destination.exists() or report.exists():
        raise ValueError('Refusing to overwrite an existing metadata package/report')
    created = False
    try:
        with zipfile.ZipFile(destination, 'x', allowZip64=True) as output:
            created = True
            for row in sorted(rows, key=lambda value: value['file']):
                info = zipfile.ZipInfo(row['file'], (1980, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = (stat.S_IFREG | 0o644) << 16
                info.compress_type = zipfile.ZIP_STORED if row['file'].endswith('.gz') else zipfile.ZIP_DEFLATED
                with output.open(info, 'w', force_zip64=True) as target, Path(row['source']).open('rb') as source:
                    for block in iter(lambda: source.read(1024**2), b''):
                        target.write(block)
        # Independent readback verifies every actual ZIP member, size, hash and
        # CRC rather than relying on the pre-package source-file checks.
        expected = {row['file']: row for row in rows}
        with zipfile.ZipFile(destination) as archive:
            if len(archive.infolist()) != len(expected) or set(archive.namelist()) != set(expected):
                raise ValueError('Metadata ZIP membership mismatch')
            for info in archive.infolist():
                row = expected[info.filename]
                if info.file_size != row['bytes'] or stat.S_IFMT(info.external_attr >> 16) != stat.S_IFREG:
                    raise ValueError('Metadata ZIP member type/size mismatch')
                with archive.open(info) as content:
                    actual = hashlib.file_digest(content, 'sha256').hexdigest()
                if actual != row['sha256']:
                    raise ValueError('Metadata ZIP member digest mismatch')
        result = {'schema_version': 1, 'passed': True, 'file': destination.name,
                  'size': destination.stat().st_size, 'sha256': digest(destination),
                  'member_count': len(rows), 'uncompressed_bytes': sum(row['bytes'] for row in rows),
                  'allowlist_sha256': digest(allowlist),
                  'members': [{key: row[key] for key in ('file', 'bytes', 'sha256')} for row in sorted(rows, key=lambda value: value['file'])],
                  'scope': 'Exact reviewed source-provenance metadata allowlist; every ZIP member hash, size, type and CRC verified. Outer publication bundle excluded.'}
        with report.open('x') as stream:
            stream.write(json.dumps(result, indent=2) + '\n')
        return result
    except BaseException:
        if created:
            destination.unlink(missing_ok=True)
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allowlist', required=True, type=Path)
    parser.add_argument('--destination', required=True, type=Path)
    parser.add_argument('--report', required=True, type=Path)
    args = parser.parse_args()
    result = package(args.allowlist, args.destination, args.report)
    print(json.dumps({key: result[key] for key in ('passed', 'file', 'size', 'sha256', 'member_count')}, indent=2))
