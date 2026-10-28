#!/usr/bin/env python3
"""Validate a completed logical source assembly, including symlink expansion.

Read-only against the source inventory SQLite database. Symlinks are resolved in
POSIX component order: a symlink is expanded before subsequent '..' components.
This check does not claim that all expected source archives have been retrieved;
the caller must establish source-collection completeness separately.
"""
from __future__ import annotations
import argparse
import json
import posixpath
from pathlib import Path, PurePosixPath
import sqlite3


class UnsafeAssembly(ValueError):
    pass


def canonical_path(value: str) -> str:
    if not isinstance(value, str) or not value or value.startswith('/') or any(c in value for c in '\\\0\r\n:') or '..' in value.split('/'):
        raise UnsafeAssembly(f'Unsafe inventory path: {value!r}')
    if value != str(PurePosixPath(value)) or value == '.':
        raise UnsafeAssembly(f'Noncanonical inventory path: {value!r}')
    return value


def link_parts(value: str) -> list[str]:
    if not isinstance(value, str) or not value or value.startswith('/') or any(c in value for c in '\\\0\r\n:'):
        raise UnsafeAssembly(f'Unsafe symlink target: {value!r}')
    return value.split('/')


def load_entries(database: Path) -> dict[str, dict]:
    # A URI with mode=ro prevents an absent path from creating an empty database.
    uri = database.resolve().as_uri() + '?mode=ro'
    with sqlite3.connect(uri, uri=True) as connection:
        rows = connection.execute('SELECT path,kind,link FROM entries').fetchall()
    entries = {}
    for path, kind, target in rows:
        canonical_path(path)
        if kind not in ('dir', 'file', 'symlink'):
            raise UnsafeAssembly(f'Unsupported assembly member kind: {kind!r}')
        if path in entries:
            raise UnsafeAssembly(f'Duplicate assembly member: {path}')
        if kind == 'symlink':
            link_parts(target)
        elif target is not None:
            raise UnsafeAssembly(f'Nonsymlink member contains a link target: {path}')
        entries[path] = {'kind': kind, 'link': target}
    for path in entries:
        parts = path.split('/')
        for n in range(1, len(parts)):
            parent = '/'.join(parts[:n])
            if parent not in entries or entries[parent]['kind'] != 'dir':
                raise UnsafeAssembly(f'Missing or nondirectory assembly ancestor: {parent}')
    return entries


def resolve_link(path: str, entries: dict[str, dict], max_expansions: int = 256) -> dict:
    canonical_path(path)
    if path not in entries or entries[path]['kind'] != 'symlink':
        raise UnsafeAssembly(f'Expected a symlink member: {path}')
    stack = path.split('/')[:-1]
    pending = link_parts(entries[path]['link'])
    seen = set()
    expansions = 1
    dangling = False
    while pending:
        state = (tuple(stack), tuple(pending))
        if state in seen:
            raise UnsafeAssembly(f'Cyclic symlink resolution requires review: {path}')
        seen.add(state)
        part, *pending = pending
        if part in ('', '.'):
            continue
        if part == '..':
            if not stack:
                raise UnsafeAssembly(f'Symlink escapes assembly after expansion: {path}')
            stack.pop()
            continue
        candidate = '/'.join([*stack, part])
        row = entries.get(candidate)
        if row is not None and row['kind'] == 'symlink':
            expansions += 1
            if expansions > max_expansions:
                raise UnsafeAssembly(f'Unbounded symlink resolution requires review: {path}')
            pending = link_parts(row['link']) + pending
            continue
        if row is None:
            # Continue resolving lexical parents even for dangling targets; this
            # proves they do not become escaping links if a missing directory
            # is subsequently created under the assembled source root.
            dangling = True
        elif row['kind'] != 'dir' and pending:
            raise UnsafeAssembly(f'Symlink traverses a nondirectory member: {path}: {candidate}')
        stack.append(part)
    return {'path': path, 'target': entries[path]['link'], 'resolved': '/'.join(stack) or '.', 'expansions': expansions, 'dangling': dangling}


def validate(database: Path) -> dict:
    entries = load_entries(database)
    links = [resolve_link(path, entries) for path in sorted(entries) if entries[path]['kind'] == 'symlink']
    return {
        'schema_version': 1,
        'passed': True,
        'scope': 'All inventory ancestors are directories; every symlink remains within the logical assembly under component-order expansion. Collection completeness, archive integrity and patch application are separate gates.',
        'entry_count': len(entries),
        'symlink_count': len(links),
        'dangling_symlink_count': sum(item['dangling'] for item in links),
        'symlinks': links,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    report = validate(args.database)
    if args.output:
        args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ['passed', 'entry_count', 'symlink_count', 'dangling_symlink_count']}, indent=2))


if __name__ == '__main__':
    main()
