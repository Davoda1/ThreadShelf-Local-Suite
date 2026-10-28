#!/usr/bin/env python3
"""Verify Electron's ordered patches against a copy of exact sparse source bytes.

Original sparse source files are never changed. Source-owner coverage and prior
part-integrity reports establish whether each initial touched path exists in the
complete relevant archive. No build hooks or source programs are executed.
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import stat
import subprocess

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('patch_input_preparer', ROOT / 'prepare-patch-inputs.py')
recipe_tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recipe_tools)
spec2 = importlib.util.spec_from_file_location('part_integrity', ROOT / 'verify-source-parts.py')
part_tools = importlib.util.module_from_spec(spec2)
spec2.loader.exec_module(part_tools)


class PatchVerificationError(ValueError):
    pass


def safe_file(root: Path, relative: str) -> Path:
    recipe_tools.relative(relative)
    target = root / relative
    for ancestor in [target, *target.parents]:
        if ancestor.is_symlink():
            raise PatchVerificationError(f'Symlink in retained/copy path: {relative}')
        if ancestor == root:
            break
    if not target.resolve().is_relative_to(root.resolve()):
        raise PatchVerificationError(f'Path escapes selected root: {relative}')
    return target


def sha(path: Path) -> str:
    return part_tools.sha256_file(path)


def validate_recipe(inputs: Path) -> tuple[dict, list[dict]]:
    report_path = safe_file(inputs, 'PATCH-INPUTS.json')
    report = json.loads(report_path.read_text())
    retained = {}
    for row in report['retained_inputs']:
        if row['file'] in retained:
            raise PatchVerificationError('Duplicate retained recipe input')
        path = safe_file(inputs, row['file'])
        if not path.is_file() or path.stat().st_size != row['bytes'] or sha(path) != row['sha256']:
            raise PatchVerificationError(f'Retained patch recipe bytes differ: {row["file"]}')
        retained[row['file']] = row
    config_file = 'src/electron/patches/config.json'
    if config_file not in retained:
        raise PatchVerificationError('Patch configuration missing from retained inputs')
    config = json.loads(safe_file(inputs, config_file).read_text())
    ordered = []
    for index, item in enumerate(config):
        repository = recipe_tools.relative(item['repo'])
        directory = recipe_tools.relative(item['patch_dir'])
        if not directory.startswith('src/electron/patches/'):
            raise PatchVerificationError('Patch directory outside Electron patch recipe')
        order_file = directory + '/.patches'
        if order_file not in retained:
            raise PatchVerificationError('Patch order list missing from retained inputs')
        names = safe_file(inputs, order_file).read_text().splitlines()
        names = [name for name in names if name.strip()]
        if len(names) != len(set(names)):
            raise PatchVerificationError('Duplicate patch order entry')
        for name in names:
            patch = directory + '/' + recipe_tools.relative(name)
            if patch not in retained:
                raise PatchVerificationError('Ordered patch missing from retained inputs')
            data = safe_file(inputs, patch).read_bytes()
            ordered.append({'ordinal': len(ordered) + 1, 'config_index': index, 'repository': repository, 'patch': patch, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'diffs': recipe_tools.parse_diff_headers(data, repository)})
    if ordered != report['records']:
        raise PatchVerificationError('Patch metadata differs from exact config/list order or patch headers')
    paths = sorted({diff['path'] for record in ordered for diff in record['diffs']})
    if paths != report['required_paths'] or report['patch_count'] != len(ordered) or report['target_repository_count'] != len(config) or report['unique_touched_paths'] != len(paths):
        raise PatchVerificationError('Patch recipe shape/path inventory mismatch')
    if json.loads(safe_file(inputs, 'REQUIRED-SOURCE-PATHS.json').read_text()) != paths:
        raise PatchVerificationError('Required source path file differs from patch recipe')
    return report, config


def read_inventory(database: Path, paths: list[str]) -> tuple[dict, dict, dict]:
    archives = {}
    groups = {}
    entries = {}
    with sqlite3.connect(database.resolve().as_uri() + '?mode=ro', uri=True) as db:
        db.execute('BEGIN')
        for name, part, text in db.execute('SELECT name,part,record FROM archives'):
            record = json.loads(text)
            if record['archive'] != name or name in archives:
                raise PatchVerificationError('Invalid accepted archive identity')
            archives[name] = {'part': part, 'record': record}
            groups.setdefault(part, []).append(record)
        for path in paths:
            row = db.execute('SELECT kind,mode,size,sha256,source FROM entries WHERE path=?', (path,)).fetchone()
            if row:
                entries[path] = dict(zip(['kind', 'mode', 'size', 'sha256', 'source'], row))
    return archives, groups, entries


def require_coverage(plan: list[dict], recipe: dict, archives: dict, groups: dict, entries: dict, part_reports: list[dict]) -> dict:
    paths = recipe['required_paths']
    owners = {}
    selected = {}
    if len({row['path'] for row in plan}) != len(plan):
        raise PatchVerificationError('Duplicate planned source checkout')
    for path in paths:
        choices = [row for row in plan if path == row['path'] or path.startswith(row['path'] + '/')]
        if not choices:
            raise PatchVerificationError(f'No planned source owner for touched path: {path}')
        owner = max(choices, key=lambda row: len(row['path']))
        owners[path] = owner['archive']
        selected[owner['archive']] = owner
    electrons = [row for row in plan if row['path'] == 'src/electron']
    if len(electrons) != 1:
        raise PatchVerificationError('Exact Electron recipe source missing from plan')
    electron = electrons[0]
    if electron['revision'] != recipe['electron_revision']:
        raise PatchVerificationError('Electron recipe revision differs from source plan')
    selected[electron['archive']] = electron
    parts = set()
    for name, planned in selected.items():
        if name not in archives:
            raise PatchVerificationError(f'Patch source owner archive not yet accepted: {planned["path"]}')
        accepted = archives[name]['record']
        for key in ['archive', 'path', 'revision', 'archive_url']:
            if accepted.get(key) != planned.get(key):
                raise PatchVerificationError(f'Accepted patch source differs from plan: {name}: {key}')
        if planned.get('expected_sha256') and planned['expected_sha256'] != accepted['sha256']:
            raise PatchVerificationError('Accepted source differs from pinned SHA256')
        if name == electron['archive'] and accepted['sha256'] != recipe['seed_sha256']:
            raise PatchVerificationError('Electron patch recipe source digest mismatch')
        parts.add(archives[name]['part'])
    for path, row in entries.items():
        if row['source'] != owners[path]:
            raise PatchVerificationError(f'Touched path came from the wrong source archive: {path}')
    evidence = {}
    for report in part_reports:
        if report.get('passed') is not True:
            raise PatchVerificationError('Part-integrity evidence is not passing')
        for item in report.get('parts', []):
            if item['part'] in evidence and evidence[item['part']] != item:
                raise PatchVerificationError('Conflicting part-integrity evidence')
            evidence[item['part']] = item
    for part in parts:
        item = evidence.get(part)
        if not item or item.get('verification') not in ('local-outer-and-inner-rehashed', 'prior-local-check-plus-github-api-receipt') or item.get('database_archive_records_sha256') != part_tools.records_digest(groups[part]) or item.get('source_count') != len(groups[part]):
            raise PatchVerificationError(f'Missing or stale part-integrity evidence: {part}')
    return {'owner_archives': sorted(selected), 'parts': sorted(parts), 'owner_by_path': owners}


def sanitized_environment(work: Path) -> dict:
    environment = {key: value for key, value in os.environ.items() if not key.startswith('GIT_')}
    environment.update({
        'GIT_CONFIG_NOSYSTEM': '1',
        'GIT_CONFIG_GLOBAL': os.devnull,
        'GIT_CONFIG_SYSTEM': os.devnull,
        'GIT_ATTR_NOSYSTEM': '1',
        'GIT_CEILING_DIRECTORIES': str(work.parent),
        'GIT_OPTIONAL_LOCKS': '0',
        'GIT_TERMINAL_PROMPT': '0',
    })
    return environment


def describe_file(path: Path) -> dict | None:
    if not path.exists() and not path.is_symlink():
        return None
    if path.is_symlink() or not path.is_file():
        raise PatchVerificationError(f'Nonregular patch working file: {path}')
    return {'bytes': path.stat().st_size, 'mode': stat.S_IMODE(path.stat().st_mode), 'sha256': sha(path)}


def apply_chain(inputs: Path, plan_file: Path, database: Path, sparse: Path, work: Path, part_report_files: list[Path], output: Path, require_production_shape: bool = True) -> dict:
    recipe, config = validate_recipe(inputs)
    if require_production_shape and (recipe['electron_revision'], recipe['seed_sha256'], recipe['patch_count'], recipe['target_repository_count'], recipe['unique_touched_paths']) != (recipe_tools.REVISION, recipe_tools.SEED_SHA256, 257, 15, 882):
        raise PatchVerificationError('Production pinned recipe identity/shape differs')
    plan = json.loads(plan_file.read_text())
    archives, groups, entries = read_inventory(database, recipe['required_paths'])
    evidence = [json.loads(path.read_text()) for path in part_report_files]
    coverage = require_coverage(plan, recipe, archives, groups, entries, evidence)
    part_tools.verify_sparse(sparse, entries)
    # Missing initial paths are proven against every complete relevant source
    # archive, rather than assumed absent because the sparse checkout omits them.
    initially_absent = sorted(set(recipe['required_paths']) - set(entries))
    work = work.absolute()
    if work.is_symlink() or any(parent.is_symlink() for parent in work.parents):
        raise PatchVerificationError('Work directory has a symlink ancestor')
    if work.exists() and (not work.is_dir() or any(work.iterdir())):
        raise PatchVerificationError('Patch work directory must be new or empty')
    work.mkdir(parents=True, exist_ok=True)
    report = {
        'schema_version': 1,
        'status': 'incomplete',
        'passed': False,
        'scope': 'Sparse ordered-patch verification against every exact touched source path. Original sources remain unchanged; this is not a complete native rebuild or a claim of binary reproducibility.',
        'electron_version': recipe['electron_version'],
        'electron_revision': recipe['electron_revision'],
        'recipe_sha256': sha(inputs / 'PATCH-INPUTS.json'),
        'plan_sha256': sha(plan_file),
        'part_verification_reports': [{'sha256': sha(path), 'file': path.name} for path in part_report_files],
        'initial_source_files': len(entries),
        'initially_absent_paths': initially_absent,
        'source_archive_coverage': {key: coverage[key] for key in ['owner_archives', 'parts']},
        'configurations': [{'index': index, **item, 'patch_count': sum(row['config_index'] == index for row in recipe['records'])} for index, item in enumerate(config)],
        'applied_patches': [],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + '\n')
    try:
        for path, row in entries.items():
            destination = safe_file(work, path)
            destination.parent.mkdir(parents=True, exist_ok=True)
            with safe_file(sparse, path).open('rb') as source, destination.open('xb') as target:
                shutil.copyfileobj(source, target)
            destination.chmod(0o755 if row['mode'] & 0o111 else 0o644)
            if sha(destination) != row['sha256']:
                raise PatchVerificationError('Sparse source copy SHA256 mismatch')
        for row in recipe['retained_inputs']:
            destination = safe_file(work, row['file'])
            destination.parent.mkdir(parents=True, exist_ok=True)
            with safe_file(inputs, row['file']).open('rb') as source, destination.open('xb') as target:
                shutil.copyfileobj(source, target)
            destination.chmod(0o644)
        for item in config:
            safe_file(work, item['repo']).mkdir(parents=True, exist_ok=True)
        environment = sanitized_environment(work)
        git = shutil.which('git')
        if not git:
            raise PatchVerificationError('Git executable unavailable')
        for row in recipe['records']:
            paths = [diff['path'] for diff in row['diffs']]
            before = {path: describe_file(safe_file(work, path)) for path in paths}
            for diff in row['diffs']:
                state = before[diff['path']]
                if diff['operation'] == 'add' and state is not None:
                    raise PatchVerificationError(f'New patch file already exists: {diff["path"]}')
                if diff['operation'] != 'add' and state is None:
                    raise PatchVerificationError(f'Patch base file is absent: {diff["path"]}')
            patch = safe_file(work, row['patch'])
            if sha(patch) != row['sha256']:
                raise PatchVerificationError('Copied patch SHA256 mismatch')
            base = [git, '-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', '-c', 'core.hooksPath=' + os.devnull, 'apply']
            results = []
            for options in [['--check'], []]:
                process = subprocess.run([*base, *options, str(patch)], cwd=safe_file(work, row['repository']), env=environment, capture_output=True, text=True)
                if process.returncode:
                    raise PatchVerificationError(f'Patch {row["ordinal"]} {row["patch"]} failed {"check" if options else "apply"}: {process.stderr.strip()}')
                results.append({'phase': 'check' if options else 'apply', 'exit_code': process.returncode, 'stdout': process.stdout, 'stderr': process.stderr})
            after = {path: describe_file(safe_file(work, path)) for path in paths}
            report['applied_patches'].append({'ordinal': row['ordinal'], 'repository': row['repository'], 'patch': row['patch'], 'patch_sha256': row['sha256'], 'before': before, 'after': after, 'commands': results})
        # Rehash every original after successful application to demonstrate that
        # all mutations were confined to the separate worktree copy.
        part_tools.verify_sparse(sparse, entries)
        report.update(status='all-ordered-patches-applied', passed=True, patch_count=len(report['applied_patches']), original_source_bytes_and_modes_unchanged=True)
        report['final_touched_paths'] = {path: describe_file(safe_file(work, path)) for path in recipe['required_paths']}
        output.write_text(json.dumps(report, indent=2) + '\n')
        return report
    except BaseException as error:
        report.update(status='failed', error=f'{type(error).__name__}: {error}')
        output.write_text(json.dumps(report, indent=2) + '\n')
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs', type=Path, default=ROOT / 'patch-inputs')
    parser.add_argument('--plan', type=Path, default=ROOT / 'complete-git-source-plan.json')
    parser.add_argument('--database', type=Path, default=Path('/tmp/threadshelf-source-staging/runtime/assembly-inventory.sqlite'))
    parser.add_argument('--sparse-source', type=Path, default=Path('/tmp/threadshelf-source-staging/runtime/sparse-source'))
    parser.add_argument('--work', type=Path, default=Path('/tmp/threadshelf-source-staging/runtime/patch-work'))
    parser.add_argument('--part-verification', type=Path, action='append', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report = apply_chain(args.inputs, args.plan, args.database, args.sparse_source, args.work, args.part_verification, args.output)
    print(json.dumps({'passed': report['passed'], 'patches': report['patch_count'], 'configurations': len(report['configurations']), 'originals_unchanged': report['original_source_bytes_and_modes_unchanged']}, indent=2))


if __name__ == '__main__':
    main()
