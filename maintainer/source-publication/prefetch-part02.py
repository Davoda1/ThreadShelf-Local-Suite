#!/usr/bin/env python3
"""Bounded two-worker prefetch of pinned part02 sources; never execute contents."""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor, as_completed
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import threading
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
PLAN = ROOT / 'part02-plan.json'
OUTPUT = Path('/tmp/threadshelf-source-staging/prefetch-part02')
CAP = 600_000_000
RESERVE = int(1.2 * 1024**3)
LOCK = threading.RLock()
ROWS = json.loads(PLAN.read_text())
STATE = {'status': 'incomplete', 'scope': 'Pinned-source retrieval and byte-integrity evidence only; archive-member/assembly/patch validation happens separately.', 'workers': 2, 'aggregate_byte_cap': CAP, 'free_space_reserve_bytes': RESERVE, 'sources': {}}
RESERVED = {}
TOTAL_COMPLETED = 0
STOP = threading.Event()


class PrefetchError(ValueError):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        raise PrefetchError('Pinned source endpoint redirected; explicit review required')


OPENER = urllib.request.build_opener(NoRedirect())


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def validate(row):
    revision = row['revision']
    if not re.fullmatch(r'[0-9a-f]{40}', revision):
        raise PrefetchError('A full immutable commit is required')
    url = urllib.parse.urlsplit(row['archive_url'])
    if url.scheme != 'https' or url.username or url.password or url.query or url.fragment:
        raise PrefetchError('Only credential-free pinned HTTPS URLs are permitted')
    if url.hostname == 'codeload.github.com':
        if not re.fullmatch(r'/[^/]+/[^/]+/tar\.gz/' + revision, url.path):
            raise PrefetchError('Unexpected GitHub source endpoint')
    elif url.hostname and url.hostname.endswith('.googlesource.com'):
        if not url.path.endswith('/+archive/' + revision + '.tar.gz'):
            raise PrefetchError('Unexpected Gitiles source endpoint')
    else:
        raise PrefetchError('Unreviewed source host')
    if Path(row['archive']).name != row['archive'] or not re.fullmatch(r'[A-Za-z0-9._-]+', row['archive']):
        raise PrefetchError('Unsafe archive filename')


def checkpoint():
    with LOCK:
        STATE['completed_bytes_including_reused_local'] = TOTAL_COMPLETED
        STATE['active_partial_bytes'] = sum(RESERVED.values())
        STATE['free_bytes_observed'] = shutil.disk_usage(OUTPUT).free
        data = json.dumps(STATE, indent=2) + '\n'
        temp = OUTPUT / 'PREFETCH-STATUS.json.tmp'
        temp.write_text(data)
        temp.replace(OUTPUT / 'PREFETCH-STATUS.json')


def accept(row, path, size, sha, origin):
    global TOTAL_COMPLETED
    if row.get('expected_sha256') and row['expected_sha256'] != sha:
        raise PrefetchError('Expected source SHA256 mismatch')
    record = {'status': 'downloaded-and-hashed', 'path': row['path'], 'archive': row['archive'], 'url': row['archive_url'], 'revision': row['revision'], 'local_file': str(path), 'bytes': size, 'sha256': sha, 'expected_sha256_verified': bool(row.get('expected_sha256')), 'origin': origin}
    with LOCK:
        RESERVED.pop(row['archive'], None)
        if TOTAL_COMPLETED + sum(RESERVED.values()) + size > CAP:
            raise PrefetchError('Aggregate cap exceeded at acceptance')
        TOTAL_COMPLETED += size
        STATE['sources'][row['archive']] = record
        checkpoint()
    print(json.dumps({'complete': row['path'], 'bytes': size, 'sha256': sha, 'origin': origin}), flush=True)
    return record


def obtain(row):
    validate(row)
    archive = row['archive']
    if row.get('local_file'):
        path = Path(row['local_file'])
        if path.is_symlink() or not path.is_file():
            raise PrefetchError('Existing local source must be a regular file')
        return accept(row, path, path.stat().st_size, digest(path), 'verified-existing-local-input')
    final = OUTPUT / archive
    metadata = OUTPUT / (archive + '.download.json')
    if final.exists():
        if final.is_symlink() or not metadata.is_file():
            raise PrefetchError('Unrecorded or unsafe existing source file')
        old = json.loads(metadata.read_text())
        sha = digest(final)
        if old['url'] != row['archive_url'] or old['sha256'] != sha or old['bytes'] != final.stat().st_size:
            raise PrefetchError('Existing prefetch record mismatch')
        return accept(row, final, final.stat().st_size, sha, 'verified-prefetch-reuse')
    partial = OUTPUT / (archive + '.partial')
    if partial.exists():
        raise PrefetchError('Interrupted partial requires review before reuse')
    if STOP.is_set():
        raise PrefetchError('Stopped after another source failed')
    request = urllib.request.Request(row['archive_url'], headers={'User-Agent': 'ThreadShelf-Local-Suite-source-prefetch/1.3.0'})
    count = 0
    hasher = hashlib.sha256()
    try:
        print(json.dumps({'start': row['path'], 'url': row['archive_url']}), flush=True)
        with OPENER.open(request, timeout=60) as response, partial.open('xb') as target:
            length = response.headers.get('Content-Length')
            length = int(length) if length else None
            if length and length > CAP:
                raise PrefetchError('Source exceeds aggregate cap')
            for chunk in iter(lambda: response.read(1024 * 1024), b''):
                with LOCK:
                    if STOP.is_set():
                        raise PrefetchError('Stopped after another source failed')
                    if TOTAL_COMPLETED + sum(RESERVED.values()) + len(chunk) > CAP:
                        raise PrefetchError('Aggregate byte cap reached')
                    if shutil.disk_usage(OUTPUT).free - len(chunk) < RESERVE:
                        raise PrefetchError('Free-space reserve reached')
                    RESERVED[archive] = RESERVED.get(archive, 0) + len(chunk)
                target.write(chunk)
                hasher.update(chunk)
                count += len(chunk)
            if length is not None and count != length:
                raise PrefetchError('Source response length mismatch')
        sha = hasher.hexdigest()
        if row.get('expected_sha256') and row['expected_sha256'] != sha:
            raise PrefetchError('Expected source SHA256 mismatch')
        partial.replace(final)
        metadata.write_text(json.dumps({'url': row['archive_url'], 'revision': row['revision'], 'bytes': count, 'sha256': sha}, indent=2) + '\n')
        return accept(row, final, count, sha, 'fresh-pinned-https-download')
    except Exception as error:
        partial.unlink(missing_ok=True)
        with LOCK:
            RESERVED.pop(archive, None)
            STATE['sources'][archive] = {'status': 'failed', 'path': row['path'], 'url': row['archive_url'], 'error': f'{type(error).__name__}: {error}', 'partial_bytes_discarded': count}
            STOP.set()
            checkpoint()
        raise


def main():
    global OUTPUT
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    args = parser.parse_args()
    OUTPUT = args.output.absolute()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for row in ROWS:
        validate(row)
    checkpoint()
    failures = []
    with ThreadPoolExecutor(max_workers=2) as executor:
        tasks = {executor.submit(obtain, row): row for row in ROWS}
        for task in as_completed(tasks):
            row = tasks[task]
            try:
                task.result()
            except Exception as error:
                failures.append({'path': row['path'], 'error': f'{type(error).__name__}: {error}'})
                print(json.dumps({'failed': row['path'], 'error': str(error)}), flush=True)
    completed = {key: value for key, value in STATE['sources'].items() if value['status'] == 'downloaded-and-hashed'}
    if not failures and len(completed) == len(ROWS):
        local_plan = [{**row, 'local_file': completed[row['archive']]['local_file'], 'expected_sha256': completed[row['archive']]['sha256']} for row in ROWS]
        (ROOT / 'part02-local-plan.json').write_text(json.dumps(local_plan, indent=2) + '\n')
        STATE['status'] = 'all-prefetch-inputs-complete-not-assembly-validated'
    else:
        STATE['status'] = 'incomplete'
    STATE['failed_or_unstarted'] = failures
    checkpoint()
    print(json.dumps({'status': STATE['status'], 'completed': len(completed), 'planned': len(ROWS), 'completed_bytes': TOTAL_COMPLETED, 'failures': failures}, indent=2), flush=True)
    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(main())
