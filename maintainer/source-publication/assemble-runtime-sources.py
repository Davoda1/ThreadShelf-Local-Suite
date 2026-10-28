#!/usr/bin/env python3
"""Verify or assemble the complete ThreadShelf runtime source collection offline.

Copyright (c) 2026 davoda1. Distributed under the MIT license.
Requires Python 3.10+. No downloads, upstream hooks or build scripts are run.
Only --apply-patches invokes Git, to check/apply the retained patch data.

Download every ZIP part and SOURCE-MANIFEST.json. Run this file beside the
manifest, or supply --manifest and --parts-dir. The ZIP parts are read directly;
do not unpack their repeated PART-MANIFEST.json files into one directory.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import sqlite3
import stat
import subprocess
import tarfile
import tempfile
import zipfile


REPORT_NAME = 'SOURCE-ASSEMBLY.json'
CHUNK = 1024 * 1024


class SourceError(ValueError):
    """Invalid, incomplete or unsafe source collection."""


def relative(value: str) -> str:
    if not isinstance(value, str) or not value or value.startswith('/') or any(c in value for c in '\\\0\r\n:') or '..' in value.split('/'):
        raise SourceError(f'Unsafe relative path: {value!r}')
    if value != str(PurePosixPath(value)) or value == '.':
        raise SourceError(f'Noncanonical relative path: {value!r}')
    return value


def filename(value: str) -> str:
    value = relative(value)
    if '/' in value:
        raise SourceError(f'Expected one filename: {value!r}')
    return value


def digest_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for data in iter(lambda: source.read(CHUNK), b''):
            digest.update(data)
    return digest.hexdigest()


def valid_digest(value: str) -> bool:
    return isinstance(value, str) and re.fullmatch('[0-9a-f]{64}', value) is not None


def validate_manifest(manifest: dict) -> tuple[dict[str, dict], list[dict]]:
    if manifest.get('schema_version') != 2 or manifest.get('collection_complete') is not True:
        raise SourceError('A final, complete schema-version-2 collection manifest is required')
    parts_list, sources = manifest.get('parts'), manifest.get('sources')
    if not isinstance(parts_list, list) or not parts_list or not isinstance(sources, list) or not sources:
        raise SourceError('The manifest must identify every part and source archive')
    if type(manifest.get('part_count')) is not int or type(manifest.get('source_count')) is not int or manifest['part_count'] != len(parts_list) or manifest['source_count'] != len(sources):
        raise SourceError('Manifest part/source counts are incomplete or inconsistent')
    parts = {}
    for part in parts_list:
        name = filename(part['file'])
        if name in parts or type(part.get('size')) is not int or part['size'] <= 0 or not valid_digest(part.get('sha256')):
            raise SourceError('Invalid or duplicate part identity')
        parts[name] = part
    names, part_use = set(), set()
    for row in sources:
        name = filename(row['archive'])
        path = relative(row['path'])
        if path == REPORT_NAME or path.startswith(REPORT_NAME + '/'):
            raise SourceError('Source destination conflicts with the assembly state report')
        prefix = row.get('archive_prefix', '')
        if not isinstance(prefix, str) or prefix and (not prefix.endswith('/') or relative(prefix[:-1]) + '/' != prefix):
            raise SourceError('Invalid source archive prefix')
        part = filename(row['part'])
        if name in names or part not in parts or type(row.get('size')) is not int or row['size'] <= 0 or not valid_digest(row.get('sha256')):
            raise SourceError('Invalid, duplicate or unassigned source archive')
        names.add(name)
        part_use.add(part)
    if set(parts) != part_use:
        raise SourceError('An outer part has no assigned source archives')
    return parts, sources


def source_identity(row: dict) -> dict:
    return {key: row.get(key, '' if key == 'archive_prefix' else None) for key in ('archive', 'path', 'archive_prefix', 'size', 'sha256')}


def check_outer_parts(parts_dir: Path, parts: dict[str, dict], sources: list[dict]) -> None:
    for name, part in parts.items():
        file = parts_dir / name
        if file.is_symlink() or not file.is_file() or file.stat().st_size != part['size'] or digest_file(file) != part['sha256']:
            raise SourceError(f'Missing or changed source part: {name}')
        expected = {f'archives/{row["archive"]}': row for row in sources if row['part'] == name}
        with zipfile.ZipFile(file) as package:
            items = package.infolist()
            names = [item.filename for item in items]
            if len(names) != len(set(names)) or set(names) != {'PART-MANIFEST.json', *expected}:
                raise SourceError(f'Unexpected, duplicate or missing ZIP entries: {name}')
            for item in items:
                mode = stat.S_IFMT(item.external_attr >> 16)
                if item.is_dir() or mode not in (0, stat.S_IFREG) or item.flag_bits & 1 or item.compress_type != zipfile.ZIP_STORED:
                    raise SourceError(f'Unexpected ZIP member representation: {name}: {item.filename}')
            meta_info = package.getinfo('PART-MANIFEST.json')
            if meta_info.file_size > 32 * 1024 * 1024:
                raise SourceError('Embedded part manifest is unexpectedly large')
            embedded = json.loads(package.read(meta_info))
            declared = embedded.get('sources', [])
            if embedded.get('part') != name or not isinstance(declared, list) or len(declared) != len(expected):
                raise SourceError('Embedded part identity or source count mismatch')
            identities = [source_identity(row) for row in declared]
            if len({row['archive'] for row in identities}) != len(identities) or sorted(identities, key=lambda row: row['archive']) != sorted((source_identity(row) for row in expected.values()), key=lambda row: row['archive']):
                raise SourceError('Embedded and final source manifests disagree')
            for member, row in expected.items():
                if package.getinfo(member).file_size != row['size']:
                    raise SourceError(f'Inner archive length differs: {member}')


class Inventory:
    """A disk-backed logical source tree; complete sources are never held in RAM."""

    def __init__(self, path: Path):
        self.db = sqlite3.connect(path)
        self.db.execute('CREATE TABLE entries(path TEXT PRIMARY KEY,kind TEXT NOT NULL,link TEXT,mode INTEGER,size INTEGER,sha256 TEXT,archive TEXT NOT NULL)')
        self.member_count = 0
        self.regular_bytes = 0

    def add(self, path, kind, link, mode, size, digest, archive):
        path = relative(path)
        components = path.split('/')
        for end in range(1, len(components)):
            parent = '/'.join(components[:end])
            old = self.db.execute('SELECT kind FROM entries WHERE path=?', (parent,)).fetchone()
            if old and old[0] != 'dir':
                raise SourceError(f'Non-directory source ancestor: {parent}')
            if not old:
                self.db.execute('INSERT INTO entries VALUES(?,?,?,?,?,?,?)', (parent, 'dir', None, 0, 0, None, 'implicit'))
        old = self.db.execute('SELECT kind FROM entries WHERE path=?', (path,)).fetchone()
        if old:
            if kind == 'dir' and old[0] == 'dir':
                return
            raise SourceError(f'Overlapping source entry: {path}')
        if kind == 'symlink':
            link_parts(link)
        self.db.execute('INSERT INTO entries VALUES(?,?,?,?,?,?,?)', (path, kind, link, mode, size, digest, archive))
        self.member_count += 1
        self.regular_bytes += size if kind == 'file' else 0

    def entry(self, path):
        result = self.db.execute('SELECT kind,link,mode,size,sha256,archive FROM entries WHERE path=?', (path,)).fetchone()
        return None if result is None else dict(zip(('kind', 'link', 'mode', 'size', 'sha256', 'archive'), result))

    def check_links(self):
        records = []
        for path, target in self.db.execute("SELECT path,link FROM entries WHERE kind='symlink' ORDER BY path").fetchall():
            stack, pending = path.split('/')[:-1], link_parts(target)
            seen, expansions, dangling = set(), 1, False
            while pending:
                state = (tuple(stack), tuple(pending))
                if state in seen or expansions > 256:
                    raise SourceError(f'Cyclic or unbounded source symlink: {path}')
                seen.add(state)
                component, *pending = pending
                if component in ('', '.'):
                    continue
                if component == '..':
                    if not stack:
                        raise SourceError(f'Source symlink escapes after expansion: {path}')
                    stack.pop()
                    continue
                candidate = '/'.join([*stack, component])
                entry = self.entry(candidate)
                if entry and entry['kind'] == 'symlink':
                    expansions += 1
                    pending = link_parts(entry['link']) + pending
                    continue
                if entry is None:
                    dangling = True
                elif entry['kind'] != 'dir' and pending:
                    raise SourceError(f'Source symlink traverses a non-directory: {path}')
                stack.append(component)
            records.append({'path': path, 'target': target, 'resolved': '/'.join(stack) or '.', 'dangling': dangling})
        return records

    def close(self):
        self.db.close()


def link_parts(target):
    if not isinstance(target, str) or not target or target.startswith('/') or any(c in target for c in '\\\0\r\n:'):
        raise SourceError(f'Unsafe symlink target: {target!r}')
    return target.split('/')


class HashReader:
    def __init__(self, stream):
        self.stream, self.size, self.digest = stream, 0, hashlib.sha256()

    def read(self, size=-1):
        data = self.stream.read(size)
        self.size += len(data)
        self.digest.update(data)
        return data


def member_path(member, row):
    name = member.name
    while name.startswith('./'):
        name = name[2:]
    prefix = row.get('archive_prefix', '')
    if prefix:
        if name.rstrip('/') == prefix.rstrip('/'):
            if not member.isdir():
                raise SourceError('Repository archive wrapper is not a directory')
            return None
        if not name.startswith(prefix):
            raise SourceError(f'Unexpected source archive prefix: {name!r}')
        name = name[len(prefix):]
    if name in ('', '.'):
        if not member.isdir():
            raise SourceError('Empty source member is not a directory')
        return None
    if member.isdir():
        name = name.rstrip('/')
    return relative(row['path'] + '/' + relative(name))


def safe_target(root: Path, path: str) -> Path:
    target = root / relative(path)
    current = target
    while current != root:
        if current.is_symlink():
            raise SourceError(f'Refusing to write through a source symlink: {path}')
        current = current.parent
    if not target.resolve(strict=False).is_relative_to(root):
        raise SourceError(f'Source output leaves destination: {path}')
    return target


def inspect_archive(package: zipfile.ZipFile, row: dict, inventory: Inventory, destination: Path | None = None) -> dict:
    count, regular, raw_bytes = 0, 0, 0
    with package.open('archives/' + row['archive']) as original:
        hashed = HashReader(original)
        with gzip.GzipFile(fileobj=hashed, mode='rb') as decoded:
            with tarfile.open(fileobj=decoded, mode='r|') as archive:
                for member in archive:
                    path = member_path(member, row)
                    if path is None:
                        continue
                    count += 1
                    kind = 'dir' if member.isdir() else 'symlink' if member.issym() else 'file' if member.isfile() else None
                    if kind is None:
                        raise SourceError(f'Unsupported source member: {path}')
                    output = None
                    if destination is not None:
                        known = inventory.entry(path)
                        if known is None or known['kind'] != kind:
                            raise SourceError(f'Archive changed after logical verification: {path}')
                        target = safe_target(destination, path)
                        if kind == 'dir':
                            target.mkdir(parents=True, exist_ok=True)
                        elif kind == 'file':
                            target.parent.mkdir(parents=True, exist_ok=True)
                            output = target.open('xb')
                    digest, size = hashlib.sha256(), 0
                    if kind == 'file':
                        try:
                            with archive.extractfile(member) as source:
                                for data in iter(lambda: source.read(CHUNK), b''):
                                    digest.update(data)
                                    size += len(data)
                                    if output is not None:
                                        output.write(data)
                        finally:
                            if output is not None:
                                output.close()
                        if size != member.size:
                            raise SourceError(f'Truncated source member: {path}')
                        regular += 1
                        raw_bytes += size
                    file_digest = digest.hexdigest() if kind == 'file' else None
                    if destination is None:
                        inventory.add(path, kind, member.linkname if kind == 'symlink' else None, member.mode, size, file_digest, row['archive'])
                    else:
                        if kind != 'dir' and (known['archive'] != row['archive'] or known['mode'] != member.mode or known['size'] != size or known['sha256'] != file_digest or known['link'] != (member.linkname if kind == 'symlink' else None)):
                            raise SourceError(f'Source bytes/metadata changed during extraction: {path}')
                        if kind == 'file':
                            target.chmod(0o755 if member.mode & 0o111 else 0o644)
                # Check tarfile's buffered read-ahead as well as the gzip stream.
                for tail in iter(lambda: archive.fileobj.read(CHUNK), b''):
                    if any(tail):
                        raise SourceError('Nonzero data follows the source tar end marker')
            for tail in iter(lambda: decoded.read(CHUNK), b''):
                if any(tail):
                    raise SourceError('Nonzero data follows the source tar end marker')
        if hashed.size != row['size'] or hashed.digest.hexdigest() != row['sha256']:
            raise SourceError(f'Inner archive SHA256/length differs: {row["archive"]}')
    if row.get('member_count', count) != count or row.get('unpacked_member_bytes', raw_bytes) != raw_bytes:
        raise SourceError(f'Archive inventory differs from release manifest: {row["archive"]}')
    return {'archive': row['archive'], 'member_count': count, 'regular_files': regular, 'unpacked_member_bytes': raw_bytes}


def patch_environment(root: Path) -> dict:
    env = {key: value for key, value in os.environ.items() if not key.startswith('GIT_')}
    env.update(GIT_ATTR_NOSYSTEM='1', GIT_CEILING_DIRECTORIES=str(root.parent), GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_SYSTEM=os.devnull, GIT_TERMINAL_PROMPT='0')
    return env


def checked_patch_paths(contents: bytes, repository: str) -> list[str]:
    """Fail closed outside the reviewed text-patch forms used by this release."""
    paths, current, in_hunk = [], None, False
    for line in contents.decode('utf-8').splitlines():
        if line.startswith('diff --git '):
            match = re.fullmatch(r'diff --git a/(\S+) b/(\S+)', line)
            if not match:
                raise SourceError('Unreviewed diff header syntax')
            old, new = [relative(name) for name in match.groups()]
            if old != new or '.git' in PurePosixPath(old).parts:
                raise SourceError('Rename/copy/Git-metadata patch requires review')
            current, in_hunk = old, False
            paths.append(relative(repository + '/' + old))
        elif line.startswith(('rename from ', 'rename to ', 'copy from ', 'copy to ', 'GIT binary patch', 'Binary files ')):
            raise SourceError('Unreviewed binary or rename/copy patch')
        elif line.startswith(('new file mode ', 'deleted file mode ', 'old mode ', 'new mode ')):
            if current is None or line.rsplit(' ', 1)[-1] not in ('100644', '100755'):
                raise SourceError('Unreviewed source patch file mode')
        elif current is not None and not in_hunk and line.startswith('index '):
            match = re.fullmatch(r'index [0-9a-f]+\.\.[0-9a-f]+(?: ([0-9]{6}))?', line)
            if not match or match.group(1) not in (None, '100644', '100755'):
                raise SourceError('Unreviewed source patch index mode')
        elif line.startswith('@@'):
            in_hunk = True
        elif not in_hunk and line.startswith(('--- ', '+++ ')):
            expected = ('a/' if line.startswith('--- ') else 'b/') + str(current)
            if current is None or line[4:] not in (expected, '/dev/null'):
                raise SourceError('Patch file headers disagree')
    if not paths or len(paths) != len(set(paths)):
        raise SourceError('Missing or repeated patch file headers')
    return paths


def apply_patches(root: Path, inventory: Inventory) -> list[dict]:
    config_path = 'src/electron/patches/config.json'
    config = safe_target(root, config_path)
    row = inventory.entry(config_path)
    if not row or row['kind'] != 'file' or digest_file(config) != row['sha256']:
        raise SourceError('Patch configuration differs from verified source')
    configurations = json.loads(config.read_text(encoding='utf-8'))
    if not isinstance(configurations, list):
        raise SourceError('Invalid patch configuration')
    records, seen = [], set()
    env = patch_environment(root)
    for item in configurations:
        repo_name, patch_name = relative(item['repo']), relative(item['patch_dir'])
        repo, patch_dir = safe_target(root, repo_name), safe_target(root, patch_name)
        if not repo.is_dir() or not patch_dir.is_dir():
            raise SourceError(f'Missing patch repository/directory: {repo_name}')
        order_path = patch_name + '/.patches'
        order = safe_target(root, order_path)
        order_row = inventory.entry(order_path)
        if not order_row or order_row['kind'] != 'file' or digest_file(order) != order_row['sha256']:
            raise SourceError('Patch order differs from verified source')
        for line in order.read_text(encoding='utf-8').splitlines():
            if not line.strip():
                continue
            path = patch_name + '/' + relative(line)
            if path in seen:
                raise SourceError('Repeated ordered patch')
            seen.add(path)
            patch = safe_target(root, path)
            patch_row = inventory.entry(path)
            if not patch_row or patch_row['kind'] != 'file' or digest_file(patch) != patch_row['sha256']:
                raise SourceError('Patch data differs from verified source')
            touched_paths = checked_patch_paths(patch.read_bytes(), repo_name)
            for touched in touched_paths:
                safe_target(root, touched)
            command = ['git', '-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', 'apply']
            statistics = subprocess.run([*command, '--numstat', '-z', str(patch)], cwd=repo, env=env, check=True, capture_output=True).stdout
            parsed_paths = []
            for line in statistics.decode('utf-8').split('\0'):
                if not line:
                    continue
                fields = line.split('\t', 2)
                if len(fields) != 3 or not fields[0].isdigit() or not fields[1].isdigit():
                    raise SourceError('Unreviewed Git patch statistics')
                parsed_paths.append(relative(repo_name + '/' + relative(fields[2])))
            if parsed_paths != touched_paths:
                raise SourceError('Git patch targets disagree with reviewed file headers')
            subprocess.run([*command, '--check', str(patch)], cwd=repo, env=env, check=True)
            subprocess.run([*command, str(patch)], cwd=repo, env=env, check=True)
            records.append({'repository': repo_name, 'patch': path, 'sha256': patch_row['sha256']})
    return records


def run(manifest_path: Path, parts_dir: Path | None = None, destination: Path | None = None, apply: bool = False) -> dict:
    if apply and destination is None:
        raise SourceError('--apply-patches requires --destination')
    if manifest_path.is_symlink() or not manifest_path.is_file():
        raise SourceError('Manifest must be a regular file')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    parts, sources = validate_manifest(manifest)
    base = (parts_dir or manifest_path.parent).resolve()
    if destination is not None:
        if destination.is_symlink():
            raise SourceError('Destination must not be a symlink')
        destination = destination.resolve()
        if destination.exists() and (not destination.is_dir() or any(destination.iterdir())):
            raise SourceError('Destination must be a new or empty directory')
    check_outer_parts(base, parts, sources)
    with tempfile.TemporaryDirectory(prefix='threadshelf-source-inventory-') as temporary:
        inventory = Inventory(Path(temporary) / 'inventory.sqlite')
        try:
            reports = []
            for name in parts:
                with zipfile.ZipFile(base / name) as package:
                    for row in [row for row in sources if row['part'] == name]:
                        reports.append(inspect_archive(package, row, inventory))
            links = inventory.check_links()
            result = {
                'schema_version': 1,
                'manifest_sha256': digest_file(manifest_path),
                'status': 'verified-logical-assembly',
                'part_count': len(parts),
                'source_archive_count': len(sources),
                'regular_file_bytes': inventory.regular_bytes,
                'logical_entry_count': inventory.db.execute('SELECT COUNT(*) FROM entries').fetchone()[0],
                'symlink_count': len(links),
                'dangling_symlink_count': sum(link['dangling'] for link in links),
                'archives': reports,
                'scope': 'The declared final manifest is the authority for collection completeness; this helper does not derive the upstream dependency graph. All declared local parts and preserved archives rehashed; all member paths, collisions and symlink expansions checked. No runtime rebuild or binary reproducibility is claimed.',
            }
            if destination is None:
                return result
            if destination.exists() and (destination.is_symlink() or not destination.is_dir() or any(destination.iterdir())):
                raise SourceError('Destination changed during verification; refusing to add source files')
            destination.mkdir(parents=True, exist_ok=True)
            state = safe_target(destination, REPORT_NAME)
            state.write_text(json.dumps({'status': 'incomplete', 'manifest_sha256': result['manifest_sha256']}, indent=2) + '\n')
            # A second streaming pass extracts directly from the ZIPs. Sources
            # are rehashed again; no intermediate copy of the tarballs is needed.
            for name in parts:
                with zipfile.ZipFile(base / name) as package:
                    for row in [row for row in sources if row['part'] == name]:
                        inspect_archive(package, row, inventory, destination)
            for link in links:
                target = safe_target(destination, link['path'])
                if target.exists() or target.is_symlink():
                    raise SourceError('Deferred symlink destination already exists')
                target.parent.mkdir(parents=True, exist_ok=True)
                target.symlink_to(link['target'])
            result['patches'] = apply_patches(destination, inventory) if apply else []
            result['status'] = 'assembled-and-patched' if apply else 'assembled-unpatched'
            state.write_text(json.dumps(result, indent=2) + '\n')
            return result
        finally:
            inventory.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=Path(__file__).with_name('SOURCE-MANIFEST.json'))
    parser.add_argument('--parts-dir', type=Path, help='Directory containing every numbered ZIP part')
    parser.add_argument('--destination', type=Path, help='Create a new/empty complete source tree')
    parser.add_argument('--apply-patches', action='store_true', help='Check/apply ordered Electron patches after safe extraction (requires Git)')
    parser.add_argument('--report', type=Path, help='Write the completed verification report')
    args = parser.parse_args()
    report = run(args.manifest, args.parts_dir, args.destination, args.apply_patches)
    if args.report:
        if args.report.is_symlink():
            raise SourceError('Report path must not be a symlink')
        with args.report.open('x', encoding='utf-8') as output:
            output.write(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ('status', 'part_count', 'source_archive_count', 'regular_file_bytes', 'symlink_count')}, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, tarfile.TarError, zipfile.BadZipFile, subprocess.CalledProcessError) as error:
        raise SystemExit(f'Source verification/assembly failed: {error}')
