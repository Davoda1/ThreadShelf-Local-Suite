#!/usr/bin/env python3
"""Verify accepted source parts and sparse pre-patch bytes without changing them.

A local part is rehashed and each preserved archive is read through ZIP's CRC
check. Remote-only parts require an explicit GitHub SHA256/size receipt linked
to a prior local verification report. Such a receipt is labeled as API evidence,
never represented as a fresh download/rehash. This is not a completeness gate.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import sqlite3
import stat
import zipfile

ROOT = Path(__file__).resolve().parent
REPOSITORY = 'Davoda1/ThreadShelf-Local-Suite'


class PartVerificationError(ValueError):
    pass


def safe_relative(value: str) -> str:
    if not isinstance(value, str) or not value or value.startswith('/') or any(c in value for c in '\\\0\r\n:') or '..' in value.split('/') or value != str(PurePosixPath(value)) or value == '.':
        raise PartVerificationError(f'Unsafe relative path: {value!r}')
    return value


def sha256_file(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def canonical_digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def load_snapshot(database: Path, required_paths: list[str]) -> tuple[dict[str, list[dict]], dict[str, dict]]:
    groups: dict[str, list[dict]] = {}
    known = {}
    with sqlite3.connect(database.resolve().as_uri() + '?mode=ro', uri=True) as db:
        db.execute('BEGIN')
        for name, part, text in db.execute('SELECT name,part,record FROM archives ORDER BY name'):
            safe_relative(name)
            if safe_relative(part) != Path(part).name:
                raise PartVerificationError('Part identity must be one filename')
            record = json.loads(text)
            if record.get('archive') != name:
                raise PartVerificationError('Database archive identity mismatch')
            groups.setdefault(part, []).append(record)
        for path in required_paths:
            safe_relative(path)
            row = db.execute('SELECT kind,mode,size,sha256 FROM entries WHERE path=?', (path,)).fetchone()
            if row:
                known[path] = dict(zip(['kind', 'mode', 'size', 'sha256'], row))
    return groups, known


def records_digest(records: list[dict]) -> str:
    return canonical_digest(sorted(records, key=lambda row: row['archive']))


def read_part_report(parts: Path, name: str, records: list[dict]) -> dict:
    report_file = parts / Path(name).with_suffix('.json')
    if report_file.is_symlink():
        raise PartVerificationError('Part report symlink refused')
    report = json.loads(report_file.read_text())
    if report.get('part') != name or report.get('source_count') != len(records):
        raise PartVerificationError('Part report identity/count mismatch')
    if sorted(report.get('sources', []), key=lambda row: row['archive']) != sorted(records, key=lambda row: row['archive']):
        raise PartVerificationError('Part report differs from database archive records')
    return report


def verify_local_part(parts: Path, name: str, records: list[dict], report: dict) -> dict:
    part = parts / name
    if part.is_symlink() or not part.is_file():
        raise PartVerificationError('Local part must be a regular file')
    if part.stat().st_size != report['bytes'] or sha256_file(part) != report['sha256']:
        raise PartVerificationError('Outer source part size/SHA256 mismatch')
    expected = {'archives/' + safe_relative(row['archive']): row for row in records}
    with zipfile.ZipFile(part) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or set(names) != {'PART-MANIFEST.json', *expected}:
            raise PartVerificationError('Unexpected or duplicate outer ZIP members')
        for item in archive.infolist():
            kind = stat.S_IFMT(item.external_attr >> 16)
            if item.is_dir() or kind not in (0, stat.S_IFREG) or item.flag_bits & 1 or item.compress_type != zipfile.ZIP_STORED:
                raise PartVerificationError('Unexpected outer ZIP entry representation')
        manifest = json.loads(archive.read('PART-MANIFEST.json'))
        if manifest.get('part') != name or sorted(manifest.get('sources', []), key=lambda row: row['archive']) != sorted(records, key=lambda row: row['archive']):
            raise PartVerificationError('Embedded manifest differs from database archive records')
        for member, row in expected.items():
            info = archive.getinfo(member)
            if info.file_size != row['size']:
                raise PartVerificationError('Preserved inner archive size mismatch')
            digest = hashlib.sha256()
            total = 0
            with archive.open(info) as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b''):
                    total += len(block)
                    digest.update(block)
            if total != row['size'] or digest.hexdigest() != row['sha256']:
                raise PartVerificationError('Preserved inner archive SHA256 mismatch')
    return {
        'part': name,
        'verification': 'local-outer-and-inner-rehashed',
        'bytes': report['bytes'],
        'sha256': report['sha256'],
        'source_count': len(records),
        'database_archive_records_sha256': records_digest(records),
    }


def verify_remote_receipt(name: str, records: list[dict], report: dict, receipt: dict, receipt_directory: Path) -> dict:
    expected = {
        'status': 'github-api-digest-and-size-verified',
        'repository': REPOSITORY,
        'part': name,
        'bytes': report['bytes'],
        'sha256': report['sha256'],
        'asset_digest': 'sha256:' + report['sha256'],
    }
    if any(receipt.get(key) != value for key, value in expected.items()):
        raise PartVerificationError('Remote receipt identity, size or digest mismatch')
    asset_id = receipt.get('asset_id')
    if type(asset_id) is not int or asset_id <= 0 or receipt.get('asset_api_url') != f'https://api.github.com/repos/{REPOSITORY}/releases/assets/{asset_id}':
        raise PartVerificationError('Remote receipt asset identity mismatch')
    local_report_name = safe_relative(receipt.get('local_verification_report'))
    prior_file = receipt_directory / local_report_name
    if prior_file.is_symlink() or sha256_file(prior_file) != receipt.get('local_verification_sha256'):
        raise PartVerificationError('Prior local verification report hash mismatch')
    prior = json.loads(prior_file.read_text())
    if prior.get('passed') is not True:
        raise PartVerificationError('Prior local verification was not passing')
    candidates = [item for item in prior.get('parts', []) if item.get('part') == name]
    if len(candidates) != 1:
        raise PartVerificationError('Prior local verification part missing/duplicate')
    item = candidates[0]
    required = {
        'verification': 'local-outer-and-inner-rehashed',
        'bytes': report['bytes'],
        'sha256': report['sha256'],
        'source_count': len(records),
        'database_archive_records_sha256': records_digest(records),
    }
    if any(item.get(key) != value for key, value in required.items()):
        raise PartVerificationError('Prior local verification does not cover current archive records')
    return {
        'part': name,
        'verification': 'prior-local-check-plus-github-api-receipt',
        'bytes': report['bytes'],
        'sha256': report['sha256'],
        'source_count': len(records),
        'database_archive_records_sha256': records_digest(records),
        'asset_id': asset_id,
        'asset_api_url': receipt['asset_api_url'],
        'local_verification_sha256': receipt['local_verification_sha256'],
        'limitation': 'This invocation did not download or rehash the remote asset; it checked the explicit API digest/size receipt and prior local report.',
    }


def verify_sparse(root: Path, known: dict[str, dict]) -> dict:
    for path, row in known.items():
        if row['kind'] != 'file':
            raise PartVerificationError(f'Patch-touched original source is not a regular file: {path}')
        file = root / safe_relative(path)
        for ancestor in [file, *file.parents]:
            if ancestor.is_symlink():
                raise PartVerificationError(f'Sparse source symlink refused: {path}')
            if ancestor == root:
                break
        expected_mode = 0o755 if row['mode'] & 0o111 else 0o644
        if not file.is_file() or file.stat().st_size != row['size'] or stat.S_IMODE(file.stat().st_mode) != expected_mode or sha256_file(file) != row['sha256']:
            raise PartVerificationError(f'Sparse pre-patch source bytes/mode differ: {path}')
    return {'phase': 'before-patch-application', 'known_touched_source_files_verified': len(known)}


def verify(database: Path, parts: Path, sparse: Path, required_paths: list[str], selected: list[str] | None = None, receipts_file: Path | None = None) -> dict:
    groups, known = load_snapshot(database, required_paths)
    if selected:
        if len(selected) != len(set(selected)) or set(selected) - set(groups):
            raise PartVerificationError('Requested part missing or duplicated')
        groups = {name: groups[name] for name in selected}
    if not groups:
        raise PartVerificationError('No accepted source parts to verify')
    receipts = {}
    if receipts_file:
        data = json.loads(receipts_file.read_text())
        if not isinstance(data, list):
            raise PartVerificationError('Receipts must be an explicit JSON array')
        for receipt in data:
            if receipt['part'] in receipts:
                raise PartVerificationError('Duplicate remote part receipt')
            receipts[receipt['part']] = receipt
    results = []
    for name, records in sorted(groups.items()):
        report = read_part_report(parts, name, records)
        if (parts / name).exists() or (parts / name).is_symlink():
            results.append(verify_local_part(parts, name, records, report))
        elif name in receipts:
            results.append(verify_remote_receipt(name, records, report, receipts[name], receipts_file.parent))
        else:
            raise PartVerificationError(f'Accepted part is absent and has no verified remote receipt: {name}')
    sparse_result = verify_sparse(sparse, known)
    return {
        'schema_version': 1,
        'passed': True,
        'scope': 'Accepted part integrity and database consistency only. Expected Git/non-Git source completeness, logical symlink safety, ordered patch application and publication are separate gates.',
        'part_count': len(results),
        'parts': results,
        'sparse_source': sparse_result,
        'required_paths_not_yet_in_inventory': len(set(required_paths) - set(known)),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, default=ROOT / 'assembly-inventory.sqlite')
    parser.add_argument('--parts-dir', type=Path, default=ROOT / 'parts')
    parser.add_argument('--sparse-source', type=Path, default=ROOT / 'sparse-source')
    parser.add_argument('--required-paths', type=Path, default=ROOT / 'patch-inputs/REQUIRED-SOURCE-PATHS.json')
    parser.add_argument('--part', action='append')
    parser.add_argument('--receipts', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report = verify(args.database, args.parts_dir, args.sparse_source, json.loads(args.required_paths.read_text()), args.part, args.receipts)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'passed': True, 'parts': report['part_count'], 'known_sparse_files': report['sparse_source']['known_touched_source_files_verified']}, indent=2))


if __name__ == '__main__':
    main()
