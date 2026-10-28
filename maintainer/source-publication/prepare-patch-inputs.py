#!/usr/bin/env python3
"""Retain the pinned Electron45.1 patch recipe and enumerate touched source paths.

This only reads source data. It never applies patches, executes source/hook code,
or claims that the patch chain has been verified against its source inputs.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import tarfile

REVISION = '45d20ec03000aac41e73b2abdb707936b4f98ed0'
SEED_SHA256 = '023fec7887359eeff6981ba34485b7849e0bb258f2e4f7e97474023cd6f8e54d'
PREFIX = f'electron-{REVISION}/'
ROOT = Path(__file__).resolve().parent


def relative(name: str) -> str:
    path = PurePosixPath(name)
    if not name or path.is_absolute() or '..' in path.parts or '\\' in name or ':' in name or '\0' in name or any(c in name for c in '\r\n'):
        raise ValueError(f'Unsafe relative path: {name!r}')
    if str(path) != name or name in ('.', '..'):
        raise ValueError(f'Noncanonical relative path: {name!r}')
    return name


def digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def retain(output: Path, relative_path: str, contents: bytes) -> dict:
    rel = relative(relative_path)
    destination = output / rel
    for ancestor in [destination, *destination.parents]:
        if ancestor.is_symlink():
            raise ValueError(f'Output symlink refused: {ancestor}')
        if ancestor == output:
            break
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if not destination.is_file() or destination.read_bytes() != contents:
            raise ValueError(f'Refusing to replace different retained input: {destination}')
    else:
        with destination.open('xb') as stream:
            stream.write(contents)
        destination.chmod(0o644)
    return {'file': rel, 'bytes': len(contents), 'sha256': hashlib.sha256(contents).hexdigest()}


def parse_diff_headers(contents: bytes, repository: str) -> list[dict]:
    """Pinned patch syntax is deliberately restricted; refuse unknown file forms."""
    diffs: list[dict] = []
    current = None
    for line in contents.decode('utf-8').splitlines():
        if line.startswith('diff --git '):
            match = re.fullmatch(r'diff --git a/(\S+) b/(\S+)', line)
            if not match:
                raise ValueError(f'Unreviewed diff header syntax: {line}')
            old, new = [relative(name) for name in match.groups()]
            if old != new:
                raise ValueError('Rename/copy patch form requires separate review')
            current = {'path': relative(repository + '/' + old), 'operation': 'modify'}
            diffs.append(current)
        elif line.startswith(('rename from ', 'rename to ', 'copy from ', 'copy to ', 'GIT binary patch', 'Binary files ')):
            raise ValueError(f'Unreviewed patch operation: {line}')
        elif line.startswith(('new file mode ', 'deleted file mode ', 'old mode ', 'new mode ')):
            if current is None:
                raise ValueError('Patch mode header before file header')
            key, mode = line.rsplit(' ', 1)
            if mode not in ('100644', '100755'):
                raise ValueError(f'Unreviewed source file mode: {mode}')
            current[key.replace(' ', '_')] = mode
            if key == 'new file mode':
                current['operation'] = 'add'
            elif key == 'deleted file mode':
                current['operation'] = 'delete'
    if not diffs:
        raise ValueError('Patch contains no file diff headers')
    return diffs


def prepare(seed: Path, output: Path) -> dict:
    if digest(seed) != SEED_SHA256:
        raise ValueError('Electron source seed SHA256 differs from pinned input')
    output.mkdir(parents=True, exist_ok=True)
    retained = []
    with tarfile.open(seed, 'r:gz') as archive:
        entries = {}
        for member in archive.getmembers():
            name = member.name.rstrip('/')
            relative(name)
            if not (name == PREFIX.rstrip('/') or name.startswith(PREFIX)):
                raise ValueError('Source member has unexpected repository prefix')
            if name in entries:
                raise ValueError(f'Duplicate source archive member: {name}')
            entries[name] = member

        def read(path: str) -> bytes:
            member = entries[PREFIX + relative(path)]
            if not member.isfile():
                raise ValueError(f'Requested recipe input is not a regular file: {path}')
            source = archive.extractfile(member)
            assert source is not None
            data = source.read()
            if len(data) != member.size:
                raise ValueError(f'Truncated recipe input: {path}')
            return data

        def save(path: str) -> bytes:
            data = read(path)
            retained.append(retain(output, 'src/electron/' + path, data))
            return data

        save('LICENSE')
        configuration = json.loads(save('patches/config.json'))
        records = []
        global_paths = set()
        for config_index, item in enumerate(configuration):
            repository = relative(item['repo'])
            directory = relative(item['patch_dir'])
            if not directory.startswith('src/electron/patches/'):
                raise ValueError('Patch directory is outside Electron patch tree')
            local_directory = directory.removeprefix('src/electron/')
            order_bytes = save(local_directory + '/.patches')
            names = order_bytes.decode('utf-8').splitlines()
            if len(set(names)) != len(names):
                raise ValueError('Duplicate patch order entry')
            for name in names:
                if not name.strip():
                    continue
                relative(name)
                if name != name.strip():
                    raise ValueError('Whitespace in patch list entry')
                patch_file = local_directory + '/' + name
                data = save(patch_file)
                diffs = parse_diff_headers(data, repository)
                global_paths.update(row['path'] for row in diffs)
                records.append({
                    'ordinal': len(records) + 1,
                    'config_index': config_index,
                    'repository': repository,
                    'patch': 'src/electron/' + patch_file,
                    'sha256': hashlib.sha256(data).hexdigest(),
                    'bytes': len(data),
                    'diffs': diffs,
                })
    report = {
        'schema_version': 1,
        'status': 'patch-inputs-retained-not-applied',
        'scope': 'Exact upstream patch files, order and touched-path inventory. Source assembly and patch application are separate pending validations.',
        'electron_version': '45.1.0',
        'electron_revision': REVISION,
        'seed_sha256': SEED_SHA256,
        'patch_count': len(records),
        'target_repository_count': len(configuration),
        'diff_count': sum(len(row['diffs']) for row in records),
        'operation_counts': {op: sum(d['operation'] == op for row in records for d in row['diffs']) for op in ['modify', 'add', 'delete']},
        'unique_touched_paths': len(global_paths),
        'records': records,
        'required_paths': sorted(global_paths),
        'retained_inputs': retained,
        'required_verification': [
            'Stream and validate every source archive into a full logical assembly inventory before running patches.',
            'Retain every existing touched source path with exact source bytes and executable mode.',
            'Check missing paths against the full inventory; an absent sparse file must not hide an existing assembled source path.',
            'Reject ancestor symlinks/files, duplicate nondirectory paths, escaping links and special archive members.',
            'Apply this exact order sequentially with git apply --check then git apply in the named repository, blocking parent repository discovery.',
            'Report sparse patch verification accurately; it does not establish a complete native rebuild or binary reproducibility.'
        ]
    }
    if (report['patch_count'], report['target_repository_count'], report['diff_count'], report['unique_touched_paths']) != (257, 15, 1115, 882):
        raise ValueError('Pinned patch shape differs from independent inventory')
    if report['operation_counts'] != {'modify': 1053, 'add': 60, 'delete': 2}:
        raise ValueError('Pinned patch operation counts differ')
    retain(output, 'PATCH-INPUTS.json', (json.dumps(report, indent=2) + '\n').encode())
    retain(output, 'REQUIRED-SOURCE-PATHS.json', (json.dumps(sorted(global_paths), indent=2) + '\n').encode())
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seed', type=Path, default=ROOT.parent / f'runtime-source-seeds/electron-{REVISION}.tar.gz')
    parser.add_argument('--output', type=Path, default=ROOT / 'patch-inputs')
    args = parser.parse_args()
    report = prepare(args.seed.resolve(), args.output.absolute())
    print(json.dumps({k: report[k] for k in ['status', 'patch_count', 'target_repository_count', 'diff_count', 'operation_counts', 'unique_touched_paths']}, indent=2))


if __name__ == '__main__':
    main()
