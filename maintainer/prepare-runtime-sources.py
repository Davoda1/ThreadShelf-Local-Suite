#!/usr/bin/env python3
"""Verify pinned seed provenance or delegate complete source/publication checks.

This downloader does not evaluate upstream DEPS, execute hooks, extract archives,
or infer that four top-level repositories cover the recursive runtime graph.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tarfile
import urllib.parse
import urllib.request


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def child(root, relative):
    """Resolve only ordinary relative paths under an explicitly supplied root."""
    value = PurePosixPath(relative)
    if value.is_absolute() or '..' in value.parts or not value.parts:
        raise ValueError(f'Unsafe relative path: {relative}')
    target = root.joinpath(*value.parts)
    if not target.resolve().is_relative_to(root.resolve()):
        raise ValueError(f'Path escapes output directory: {relative}')
    return target


def verify_inputs(manifest_path, manifest):
    for item in manifest['provenance_inputs']:
        path = child(manifest_path.parent, item['file'])
        if not path.is_file() or path.stat().st_size != item['bytes']:
            raise ValueError(f'Missing or wrong-sized provenance input: {item["file"]}')
        if digest(path) != item['sha256']:
            raise ValueError(f'Provenance hash mismatch: {item["file"]}')


def inspect_archive(path):
    members = 0
    uncompressed_bytes = 0
    with tarfile.open(path, mode='r|gz') as archive:
        for member in archive:
            name = PurePosixPath(member.name)
            if name.is_absolute() or '..' in name.parts:
                raise ValueError(f'Unsafe archive path: {member.name}')
            if member.isdev() or member.isfifo():
                raise ValueError(f'Unexpected special archive member: {member.name}')
            # No extraction takes place. Record symlinks in the complete archive;
            # their destinations must be reviewed by the eventual assembly step.
            members += 1
            if member.isfile():
                uncompressed_bytes += member.size
    return {'members': members, 'uncompressed_member_bytes': uncompressed_bytes}


def obtain(item, output, reserve_bytes, max_bytes):
    target = child(output, item['archive'])
    record_path = child(output, item['archive'] + '.download.json')
    if target.exists():
        if not record_path.is_file():
            raise ValueError(f'Refusing to overwrite an unrecorded file: {target}')
        record = json.loads(record_path.read_text())
        if record['url'] != item['archive_url'] or record['sha256'] != digest(target):
            raise ValueError(f'Existing source does not match its download record: {target}')
        if item.get('expected_sha256') and record['sha256'] != item['expected_sha256']:
            raise ValueError(f'Existing source does not match the pinned checksum: {target}')
        return record
    url = urllib.parse.urlsplit(item['archive_url'])
    if url.scheme != 'https' or url.username or url.password:
        raise ValueError('Only credential-free HTTPS source URLs are accepted')
    partial = target.with_name(target.name + '.partial')
    if partial.exists():
        raise ValueError(f'Review/remove the interrupted download before retrying: {partial}')
    total = 0
    request = urllib.request.Request(item['archive_url'], headers={
        'User-Agent': 'ThreadShelf-Local-Suite-source-preparation',
    })
    created = False
    try:
        with urllib.request.urlopen(request, timeout=60) as response, partial.open('xb') as destination:
            created = True
            length = response.headers.get('Content-Length')
            if length and int(length) > max_bytes:
                raise ValueError(f'Source exceeds --max-archive-gib: {item["id"]}')
            for chunk in iter(lambda: response.read(1024 * 1024), b''):
                total += len(chunk)
                if total > max_bytes or shutil.disk_usage(output).free < reserve_bytes + len(chunk):
                    raise ValueError('Download stopped at the configured size/free-space limit')
                destination.write(chunk)
            if length and total != int(length):
                raise ValueError('Incomplete source download')
        if item.get('expected_sha256') and digest(partial) != item['expected_sha256']:
            raise ValueError('Upstream source checksum mismatch')
        record = {'id': item['id'], 'url': item['archive_url'], 'revision': item['revision'],
                  'bytes': total, 'sha256': digest(partial),
                  'integrity_basis': 'HTTPS retrieval from pinned repository revision; local SHA-256',
                  'archive_validation': inspect_archive(partial)}
        partial.rename(target)
        record_path.write_text(json.dumps(record, indent=2) + '\n')
        return record
    except Exception:
        # Only this invocation's explicitly created incomplete output is removed.
        if created:
            partial.unlink(missing_ok=True)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path,
                        default=Path(__file__).with_name('runtime-sources-1.3.0.json'))
    parser.add_argument('--download', action='store_true', help='Download selected pinned source seeds')
    parser.add_argument('--component', action='append', default=[], help='Seed id; repeat to select multiple')
    parser.add_argument('--output', type=Path, help='Required with --download; keep source archives outside the checkout')
    parser.add_argument('--reserve-gib', type=float, default=4, help='Free disk space to preserve during downloads')
    parser.add_argument('--max-archive-gib', type=float, default=2, help='Maximum compressed bytes per archive')
    parser.add_argument('--publication-check', action='store_true', help='Run the complete source/publication verifier with explicit final evidence')
    parser.add_argument('--metadata-dir', type=Path)
    parser.add_argument('--parts-dir', type=Path)
    parser.add_argument('--asset-ledger', type=Path)
    parser.add_argument('--remote-snapshot', type=Path)
    parser.add_argument('--historical-snapshot', type=Path)
    parser.add_argument('--release-id', type=int)
    parser.add_argument('--tag')
    parser.add_argument('--commit')
    args = parser.parse_args()
    if args.publication_check:
        required = ('metadata_dir', 'asset_ledger', 'remote_snapshot', 'historical_snapshot',
                    'release_id', 'tag', 'commit')
        if args.download or any(getattr(args, name) is None for name in required):
            parser.error('--publication-check requires --metadata-dir, --asset-ledger, --remote-snapshot, '
                         '--historical-snapshot, --release-id, --tag and --commit; do not combine with --download')
        command = [sys.executable, str(Path(__file__).with_name('verify-release-sources.py')),
                   '--bundle', str(Path(__file__).with_name('PUBLICATION-SOURCE-INPUTS.json'))]
        for name in (*required, 'parts_dir'):
            value = getattr(args, name)
            if value is not None:
                command.extend(['--' + name.replace('_', '-'), str(value)])
        return subprocess.run(command, check=False).returncode
    manifest = json.loads(args.manifest.read_text())
    verify_inputs(args.manifest, manifest)
    report = {'electron': manifest['electron_version'], 'provenance_inputs_verified': True,
              'scope': 'Pinned seed provenance only; use verify-release-sources.py for complete collection verification.',
              'complete_runtime_mirror_recorded': manifest.get('complete_runtime_mirror', False),
              'publication_ready': False,
              'outstanding': manifest['outstanding_requirements']}
    if args.download:
        if args.output is None:
            parser.error('--download requires --output')
        if args.reserve_gib < 0 or args.max_archive_gib <= 0:
            parser.error('Invalid storage limits')
        known = {item['id'] for item in manifest['source_seeds']}
        if set(args.component) - known:
            parser.error('Unknown component id')
        args.output.mkdir(parents=True, exist_ok=True)
        seeds = [item for item in manifest['source_seeds'] if not args.component or item['id'] in args.component]
        report['downloaded_seeds'] = [obtain(item, args.output, int(args.reserve_gib * 1024**3),
                                            int(args.max_archive_gib * 1024**3)) for item in seeds]
        (args.output / 'PREPARATION-STATUS.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, tarfile.TarError, KeyError) as error:
        print(f'Source preparation failed: {error}', file=sys.stderr)
        sys.exit(1)
