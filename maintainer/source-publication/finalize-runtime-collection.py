#!/usr/bin/env python3
"""Derive final runtime manifests from a complete, verified accepted inventory.

Maintainer-only offline tool: no downloads, extraction, hooks or patch execution.
Uses the existing part verifier for local hashes / explicitly recorded prior
local hashes plus GitHub receipts. The full file index is streamed to JSONL.gz;
it belongs in release metadata, not in the Git repository. A logical assembly
and previously executed ordered-patch proof do not claim a native rebuild.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from functools import lru_cache
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sqlite3
import stat
import urllib.parse

ROOT = Path(__file__).resolve().parent


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, file)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


parts_tool = module('finalize_parts', ROOT / 'verify-source-parts.py')
patch_tool = module('finalize_patches', ROOT / 'verify-ordered-patches.py')
links_tool = module('finalize_links', ROOT / 'validate-source-symlinks.py')


class FinalizationError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise FinalizationError(message)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode('utf-8')


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def sha_file(file):
    require(not file.is_symlink() and file.is_file(), f'Ordinary input file required: {file}')
    return parts_tool.sha256_file(file)


def load(file):
    sha_file(file)
    return json.loads(file.read_text())


def relative(value):
    return parts_tool.safe_relative(value)


def filename(value):
    require(relative(value) == Path(value).name, 'Expected a single safe filename')
    return value


def indexed(rows, field, label):
    result = {}
    for row in rows:
        key = row[field]
        require(key not in result, f'Duplicate {label}: {key}')
        result[key] = row
    return result


def exact_set(actual, expected, label):
    require(len(actual) == len(set(actual)), f'Duplicate {label}')
    require(set(actual) == set(expected), f'{label}: missing={sorted(set(expected)-set(actual))[:5]}, extra={sorted(set(actual)-set(expected))[:5]}')


def projection(row):
    return {key: row.get(key, '' if key == 'archive_prefix' else None)
            for key in ('archive', 'path', 'repository', 'revision', 'archive_url', 'archive_prefix')}


def derive_git(inventory, seed):
    """Reconcile the selected table against every enabled DEPS Git dependency."""
    seeds = indexed(seed['source_seeds'], 'id', 'source seed')
    targets = indexed(inventory['targets'], 'target', 'DEPS target')
    exact_set(list(targets), ['linux', 'win'], 'DEPS target coverage')
    selected = {}
    for target, data in targets.items():
        enabled = [row for row in data['dependencies'] if row.get('enabled') is True and 'url' in row]
        require(enabled == data['selected_git'], 'Selected Git table differs from enabled full dependency table')
        indexed(enabled, 'path', 'target Git checkout')
        for row in enabled:
            path = relative(row['path'])
            repository, revision = row['url'].rsplit('@', 1)
            if path in ('src', 'src/third_party/electron_node'):
                component = seeds['chromium' if path == 'src' else 'node']
                expected_url = 'https://chromium.googlesource.com/chromium/src.git' if path == 'src' else 'https://github.com/nodejs/node.git'
                require(repository.rstrip('/') == expected_url, 'Seed repository differs')
                revision = component['revision']
            require(re.fullmatch('[0-9a-f]{40}', revision), 'Unresolved Git revision')
            if path in selected:
                require((repository, revision) == (selected[path]['repository'], selected[path]['revision']), 'Conflicting target checkout')
                selected[path]['targets'].append(target)
            else:
                selected[path] = dict(path=path, repository=repository, revision=revision, targets=[target])
    require('src/electron' not in selected, 'Electron checkout unexpectedly duplicates seed')
    selected['src/electron'] = dict(path='src/electron', repository='https://github.com/electron/electron.git', revision=seeds['electron']['revision'], targets=['linux', 'win'])
    for path, row in selected.items():
        url = urllib.parse.urlsplit(row['repository'])
        require(url.scheme == 'https' and not url.username and not url.password, 'Unsafe source URL')
        revision = row['revision']
        if url.netloc == 'github.com':
            project = url.path.removesuffix('.git').strip('/')
            row['archive_url'] = f'https://codeload.github.com/{project}/tar.gz/{revision}'
            row['archive_prefix'] = f'{project.split("/")[-1]}-{revision}/'
        else:
            require(url.netloc.endswith('.googlesource.com'), 'Unreviewed Git source host')
            row['archive_url'] = row['repository'] + f'/+archive/{revision}.tar.gz'
            row['archive_prefix'] = ''
        row['archive'] = path.replace('/', '__') + f'-{revision}.tar.gz'
        if path in ('src', 'src/electron'):
            component = seeds['chromium' if path == 'src' else 'electron']
            row['archive'] = component['archive']
            require(component['archive_url'].replace('.git/+archive/', '/+archive/') == row['archive_url'].replace('.git/+archive/', '/+archive/'), 'Seed archive URL differs')
        row['targets'].sort()
    return selected


def expected_sources(data):
    derived = derive_git(data['deps_inventory'], data['seed'])
    plan = indexed(data['git_plan'], 'path', 'Git plan checkout')
    exact_set(list(plan), list(derived), 'Authoritative Git source coverage')
    for path, row in derived.items():
        require(projection(row) == projection(plan[path]), f'Git plan identity differs: {path}')
        exact_set(plan[path]['targets'], row['targets'], f'Git plan target coverage {path}')
    extra = indexed(data['supplemental_manifest']['sources'], 'archive', 'supplemental archive')
    validation = data['supplemental_validation']
    require(validation.get('passed') is True, 'Supplemental validation incomplete')
    proofs = indexed(validation['archives'], 'archive', 'supplemental proof')
    exact_set(list(proofs), list(extra), 'Supplemental proof coverage')
    for name, row in extra.items():
        proof = proofs[name]
        require(proof.get('passed') is True and all(proof.get(k) == row.get(k) for k in ('size', 'sha256', 'source_record')), f'Supplemental proof differs: {name}')
    expected = indexed([*plan.values(), *extra.values(), data['profiles']], 'archive', 'expected archive')
    indexed(expected.values(), 'path', 'expected checkout')
    return expected


def accepted_sources(db, expected):
    rows, groups = [], defaultdict(list)
    for name, part, text in db.execute('SELECT name,part,record FROM archives ORDER BY name'):
        filename(name); filename(part)
        row = json.loads(text)
        require(row.get('archive') == name and 'part' not in row, 'Accepted archive identity/part differs')
        rows.append({**row, 'part': part})
        groups[part].append(row)
    accepted = indexed(rows, 'archive', 'accepted archive')
    exact_set(list(accepted), list(expected), 'Complete accepted archive coverage')
    for name, wanted in expected.items():
        actual = accepted[name]
        require(projection(actual) == projection(wanted), f'Accepted source identity differs: {name}')
        require(re.fullmatch('[0-9a-f]{64}', actual.get('sha256', '')), 'Invalid accepted archive digest')
        require(type(actual.get('size')) is int and actual['size'] > 0, 'Invalid accepted archive size')
        pinned = wanted.get('expected_sha256', wanted.get('sha256'))
        require(not pinned or actual['sha256'] == pinned, f'Pinned source hash differs: {name}')
        require('size' not in wanted or actual['size'] == wanted['size'], f'Pinned source size differs: {name}')
    return accepted, groups


class InventoryView:
    """Small cached database mapping for the independently tested link resolver."""
    def __init__(self, db):
        self.db = db

    @lru_cache(maxsize=8192)
    def get(self, path):
        row = self.db.execute('SELECT kind,link FROM entries WHERE path=?', (path,)).fetchone()
        return dict(zip(('kind', 'link'), row)) if row else None

    def __contains__(self, path):
        return self.get(path) is not None

    def __getitem__(self, path):
        result = self.get(path)
        if result is None:
            raise KeyError(path)
        return result


def check_inventory(db, accepted, compressed_index):
    """Stream all rows; never load the million-file source graph into memory."""
    totals = {name: {'archive': name, 'entry_count': 0, 'regular_files': 0, 'regular_bytes': 0,
                     'digest': hashlib.sha256()} for name in accepted}
    view = InventoryView(db)
    logical = hashlib.sha256()
    count = regular_bytes = 0
    symlinks = []
    previous = None
    with compressed_index.open('xb') as output:
        with gzip.GzipFile(filename='', fileobj=output, mode='wb', mtime=0, compresslevel=6) as zipped:
            for values in db.execute('SELECT path,kind,link,mode,size,sha256,source FROM entries ORDER BY path COLLATE BINARY'):
                row = dict(zip(('path', 'kind', 'link', 'mode', 'size', 'sha256', 'source'), values))
                path, kind, source = row['path'], row['kind'], row['source']
                relative(path)
                require(previous is None or path > previous, 'Duplicate or unsorted logical path')
                previous = path
                require(kind in ('file', 'dir', 'symlink'), 'Unsupported logical entry kind')
                require(type(row['mode']) is int and row['mode'] >= 0, 'Invalid source mode')
                require(type(row['size']) is int and row['size'] >= 0, 'Invalid source byte count')
                parent = path.rpartition('/')[0]
                if parent:
                    ancestor = view.get(parent)
                    require(ancestor and ancestor['kind'] == 'dir', f'Missing/nondirectory logical ancestor: {path}')
                if source == 'implicit':
                    require(kind == 'dir' and row['mode'] == 0, 'Only implicit directories may lack source archive')
                else:
                    require(source in accepted, f'Entry refers to unknown source archive: {path}')
                    base = accepted[source]['path']
                    require(path == base or path.startswith(base + '/'), f'Entry outside owner archive checkout: {path}')
                if kind == 'file':
                    require(row['link'] is None and re.fullmatch('[0-9a-f]{64}', row['sha256'] or ''), 'Invalid regular file metadata')
                    totals[source]['regular_files'] += 1
                    totals[source]['regular_bytes'] += row['size']
                    regular_bytes += row['size']
                else:
                    require(row['size'] == 0 and row['sha256'] is None, 'Nonfile unexpectedly has byte metadata')
                    if kind == 'dir':
                        require(row['link'] is None, 'Directory unexpectedly has link target')
                    else:
                        symlinks.append(links_tool.resolve_link(path, view))
                encoded = canonical(row) + b'\n'
                logical.update(encoded)
                zipped.write(encoded)
                if source != 'implicit':
                    totals[source]['entry_count'] += 1
                    totals[source]['digest'].update(encoded)
                count += 1
    require(count > 0, 'Empty logical source inventory')
    per_archive = []
    for name, total in sorted(totals.items()):
        record = accepted[name]
        require(total['regular_files'] == record.get('regular_files'), f'Archive regular-file count differs: {name}')
        require(total['regular_bytes'] == record.get('unpacked_member_bytes'), f'Archive regular byte count differs: {name}')
        # Existing/implicit directory rows are intentionally coalesced on ingest.
        require(0 <= total['entry_count'] <= record.get('member_count', -1), f'Archive logical-entry count differs: {name}')
        per_archive.append({**{k: v for k, v in total.items() if k != 'digest'}, 'logical_records_sha256': total['digest'].hexdigest()})
    return dict(inventory_kind='complete-logical-tree', entry_count=count, regular_bytes=regular_bytes,
                logical_inventory_sha256=logical.hexdigest(),
                logical_inventory_encoding='UTF-8 canonical JSON objects (sort_keys=True, ensure_ascii=True, compact separators), one LF-terminated row per path sorted by SQLite BINARY collation; fields path,kind,link,mode,size,sha256,source.',
                per_archive_inventory=per_archive, collisions=[], unsafe_links=[], symlinks=symlinks,
                dangling_links=[row for row in symlinks if row['dangling']],
                symlink_verification={'passed': True, 'input_sha256': {'logical_inventory': logical.hexdigest()},
                                      'symlink_count': len(symlinks), 'symlinks_sha256': digest(symlinks),
                                      'algorithm': 'POSIX component order: expand links before following subsequent dot-dot components; reject escapes, cycles and nondirectory traversal; retain safely dangling internal targets.'},
                compressed_inventory={'file': compressed_index.name, 'bytes': compressed_index.stat().st_size,
                                      'sha256': sha_file(compressed_index), 'storage': 'metadata'})


def member(db, path):
    relative(path)
    value = db.execute('SELECT kind,mode,size,sha256,source FROM entries WHERE path=?', (path,)).fetchone()
    return dict(zip(('kind', 'mode', 'size', 'sha256', 'source'), value)) if value else None


def owner(accepted, path):
    candidates = [row for row in accepted.values() if path.startswith(row['path'] + '/')]
    require(candidates, f'No complete source owner for path: {path}')
    return max(candidates, key=lambda row: len(row['path']))['archive']


def required_members(db, data, accepted):
    wanted = {row['git_path']: {'size': row['bytes'], 'sha256': row['sha256']}
              for row in data['supplemental_manifest']['required_git_tree_notices']}
    profiles = data['profiles']
    for row in profiles['source_files']:
        path = relative(profiles['path'] + '/' + row['archive_member'])
        require(path not in wanted, 'Duplicate required profile/notice path')
        wanted[path] = {'size': row['size'], 'sha256': row['sha256']}
    result = []
    git_accepted = {row['archive']: accepted[row['archive']] for row in data['git_plan']}
    for path, expected in sorted(wanted.items()):
        actual = member(db, path)
        # SDK headers occupy supplemental subdirectories of the Chromium tree,
        # while their original notices are supplied by the enclosing Git tree.
        expected_owner = profiles['archive'] if path.startswith(profiles['path'] + '/') else owner(git_accepted, path)
        require(actual and actual['kind'] == 'file' and actual['source'] == expected_owner, f'Required source member missing or from wrong owner: {path}')
        require(all(actual[key] == value for key, value in expected.items()), f'Required profile/notice bytes differ: {path}')
        result.append({'path': path, **expected, 'source': actual['source']})
    return result


SOURCE_CLASSES = {'compiler-and-runtime-source', 'platform-sdk-with-source-headers',
                  'required-build-javascript-source', 'required-source-headers'}
NON_GIT_CLASSES = SOURCE_CLASSES | {'build-or-test-tool', 'separate-test-data-or-product-binary',
                                    'optional-test-binary', 'separate-test-or-automation-tool', 'platform-sysroot'}
LLVM_INPUTS = {'src/third_party/llvm-build/Release+Asserts', 'src/third_party/llvm-libclang',
               'src/third_party/openscreen/src/third_party/llvm-build/Release+Asserts'}


def non_git_mappings(data):
    fields = ('path', 'deps_file', 'condition', 'dep_type', 'bucket', 'objects', 'packages')
    expected = {}
    for target in data['deps_inventory']['targets']:
        for row in target['dependencies']:
            if row.get('enabled') is True and 'url' not in row:
                identity = digest({key: row[key] for key in fields if key in row})
                targets = expected.setdefault(identity, [])
                require(target['target'] not in targets, 'Duplicate enabled non-Git target input')
                targets.append(target['target'])
    classification = data['non_git_classification']
    require(not classification.get('unknown_classifications'), 'Unclassified non-Git source input')
    seen = []
    supplemental = data['supplemental_manifest']['sources']
    mappings = []
    for row in classification['rows']:
        identity = digest({key: row[key] for key in fields if key in row})
        require(identity in expected, 'Substituted non-Git classification input')
        exact_set(row['targets'], expected[identity], 'Non-Git classification targets')
        seen.append(identity)
        require(row.get('classification') in NON_GIT_CLASSES and row.get('source_access_disposition'), 'Unknown or unexplained non-Git input disposition')
        if row['classification'] in SOURCE_CLASSES:
            linked = [s['archive'] for s in supplemental if s['path'] == row['path']]
            if row['path'] in LLVM_INPUTS:
                linked = [s['archive'] for s in supplemental if s.get('role') == 'exact-toolchain-compiler-runtime-source-reference']
                require(len(linked) == 1, 'Exact LLVM compiler-runtime supplemental source ambiguous')
            require(linked, f'Unmapped source-bearing non-Git input: {row["path"]}')
            mappings.append({'path': row['path'], 'classification_row_sha256': digest(row), 'archives': sorted(linked)})
    exact_set(seen, list(expected), 'Full non-Git classification coverage')
    indexed(mappings, 'path', 'non-Git source mapping')
    return sorted(mappings, key=lambda row: row['path'])


def patch_evidence(db, accepted, data, files):
    recipe, _ = patch_tool.validate_recipe(files['patch_recipe'].parent)
    require(recipe == data['patch_recipe'], 'Selected patch recipe differs from retained validated recipe')
    electrons = [row for row in accepted.values() if row['path'] == 'src/electron']
    require(len(electrons) == 1 and (electrons[0]['revision'], electrons[0]['sha256']) ==
            (recipe['electron_revision'], recipe['seed_sha256']), 'Exact Electron patch-recipe archive differs')
    for row in recipe['retained_inputs']:
        actual = member(db, row['file'])
        require(actual and actual['kind'] == 'file' and actual['source'] == owner(accepted, row['file']), 'Patch recipe file not in exact full source owner')
        require((actual['size'], actual['sha256']) == (row['bytes'], row['sha256']), 'Retained patch recipe differs from complete source archive')
    initial, owners = {}, {electrons[0]['archive']}
    for path in recipe['required_paths']:
        archive = owner(accepted, path)
        owners.add(archive)
        actual = member(db, path)
        if actual is None:
            initial[path] = None
        else:
            require(actual['kind'] == 'file' and actual['source'] == archive, f'Original touched source has wrong kind/owner: {path}')
            initial[path] = {'bytes': actual['size'], 'mode': 0o755 if actual['mode'] & 0o111 else 0o644, 'sha256': actual['sha256']}
    result = data['patch_result']
    require(result.get('passed') is True and result.get('status') == 'all-ordered-patches-applied', 'Ordered patch result incomplete')
    require(result.get('recipe_sha256') == sha_file(files['patch_recipe']) and result.get('plan_sha256') == sha_file(files['git_plan']), 'Ordered patch proof input binding differs')
    require(result.get('electron_revision') == recipe['electron_revision'], 'Ordered patch revision differs')
    require(result.get('original_source_bytes_and_modes_unchanged') is True, 'Original source preservation not verified')
    exact_set(result['initially_absent_paths'], [path for path, value in initial.items() if value is None], 'Original touched-file absence')
    exact_set(result['source_archive_coverage']['owner_archives'], list(owners), 'Patch owner-archive coverage')
    state = dict(initial)
    records, applied = recipe['records'], result['applied_patches']
    require(len(records) == len(applied) == result.get('patch_count') and records, 'Patch count/order incomplete')
    for ordinal, (wanted, actual) in enumerate(zip(records, applied), 1):
        require((wanted['ordinal'], actual['ordinal']) == (ordinal, ordinal), 'Patch ordinal changed')
        require((actual['repository'], actual['patch'], actual['patch_sha256']) == (wanted['repository'], wanted['patch'], wanted['sha256']), 'Patch order/identity changed')
        require([(c.get('phase'), c.get('exit_code')) for c in actual.get('commands', [])] == [('check', 0), ('apply', 0)], 'Patch check/apply execution failed or absent')
        paths = [row['path'] for row in wanted['diffs']]
        exact_set(list(actual['before']), paths, 'Patch before-path coverage')
        exact_set(list(actual['after']), paths, 'Patch after-path coverage')
        for path in paths:
            require(actual['before'][path] == state[path], f'Patch original/intermediate bytes differ: {path}')
            state[path] = actual['after'][path]
    require(result['final_touched_paths'] == state, 'Final patch state differs')
    return {'initial_patch_paths': initial, 'patch_owner_archives': sorted(owners), 'ordered_patch_count': len(records)}


HISTORICAL_SCOPE = (
    'Embedded PART-MANIFEST.json files and original part sidecars are immutable '
    'preparation-time snapshots. Their collection-incomplete status was accurate '
    'when each part was accepted. Only this final manifest, identifying every '
    'part by exact size/SHA256 and all matching assembly/coverage evidence, '
    'supersedes that collection-level preparation status. It does not alter '
    'historical bytes, promote an individual part to a complete collection, '
    'or claim a native rebuild or reproducible binary.')


def finalize(files, database, parts_dir, receipts_file, output_dir):
    require(not output_dir.exists(), 'Final output directory must not exist')
    input_hashes = {name: sha_file(file) for name, file in files.items()}
    data = {name: load(file) for name, file in files.items()}
    expected = expected_sources(data)
    receipts = indexed(load(receipts_file), 'part', 'remote receipt') if receipts_file else {}
    # The single transaction pins accepted archives and inventory to one state.
    with sqlite3.connect(database.resolve().as_uri() + '?mode=ro', uri=True) as db:
        db.execute('BEGIN')
        accepted, groups = accepted_sources(db, expected)  # Fail partial now, before index allocation.
        members = required_members(db, data, accepted)
        mappings = non_git_mappings(data)
        patches = patch_evidence(db, accepted, data, files)
        part_rows, part_proofs = [], []
        for name, records in sorted(groups.items()):
            report = parts_tool.read_part_report(parts_dir, name, records)
            local = parts_dir / name
            if local.exists() or local.is_symlink():
                proof = parts_tool.verify_local_part(parts_dir, name, records, report)
            else:
                require(name in receipts, f'Missing accepted part and verified receipt: {name}')
                proof = parts_tool.verify_remote_receipt(name, records, report, receipts[name], receipts_file.parent)
            part_proofs.append(proof)
            part_rows.append({'file': name, 'size': report['bytes'], 'sha256': report['sha256']})
        manifest = {'schema_version': 2, 'collection_complete': True,
                    'scope': 'Complete declared Linux x64 / Windows x64 runtime source collection, verified as a logical tree with exact ordered Electron patch proof. Native compilation and binary reproducibility are not claimed.',
                    'preparation_status_supersession': HISTORICAL_SCOPE,
                    'part_count': len(part_rows), 'source_count': len(accepted),
                    'parts': part_rows, 'sources': sorted(accepted.values(), key=lambda row: row['archive'])}
        output_dir.mkdir(parents=True)
        # Final JSON manifests are written only after the full inventory passes.
        inventory_file = output_dir / 'RUNTIME-FILE-INVENTORY.jsonl.gz'
        try:
            assembly = check_inventory(db, accepted, inventory_file)
            manifest_bytes = json.dumps(manifest, indent=2).encode() + b'\n'
            assembly.update(schema_version=1, passed=True, scope=manifest['scope'],
                            input_sha256={**{k: v for k, v in input_hashes.items() if k != 'seed'}, 'runtime_manifest': hashlib.sha256(manifest_bytes).hexdigest()},
                            seed_source_identities_sha256=digest(data['seed']['source_seeds']),
                            archive_records_sha256=digest(manifest['sources']), archives_scanned=sorted(accepted),
                            required_members=members, non_git_source_mappings=mappings,
                            part_verifications=part_proofs, **patches)
            for name, file in files.items():
                require(sha_file(file) == input_hashes[name], f'Input changed during finalization: {name}')
            (output_dir / 'SOURCE-MANIFEST.json').write_bytes(manifest_bytes)
            (output_dir / 'RUNTIME-ASSEMBLY.json').write_text(json.dumps(assembly, indent=2) + '\n')
            (output_dir / 'README-RUNTIME-SOURCES.txt').write_text(readme())
        except BaseException:
            inventory_file.unlink(missing_ok=True)
            # Never leave a failed run looking like a published final collection.
            for name in ('SOURCE-MANIFEST.json', 'RUNTIME-ASSEMBLY.json', 'README-RUNTIME-SOURCES.txt'):
                (output_dir / name).unlink(missing_ok=True)
            output_dir.rmdir()
            raise
    return manifest, assembly


def readme():
    return '''ThreadShelf Local Suite runtime source collection\n\n''' + HISTORICAL_SCOPE + '''\n\n
Download every numbered runtime source ZIP and the Runtime-Sources-Metadata.zip
companion. Extract the metadata ZIP into the directory containing the intact
numbered ZIPs. The metadata includes source-publication/assemble-runtime-sources.py
and source-publication/final-runtime/SOURCE-MANIFEST.json, with the assembly
report and compressed full inventory beside the final manifest. Each numbered
ZIP contains its own PART-MANIFEST.json; do not manually unzip those parts over
one directory. Python 3.10+ and its standard library are sufficient.

Verify all outer/inner hashes, source member paths, cross-archive layout and
expanded symlink safety without writing the full source tree:

  python source-publication/assemble-runtime-sources.py --manifest source-publication/final-runtime/SOURCE-MANIFEST.json --parts-dir .

Optionally create a new/empty source tree (allow ample disk space for every
regular file and filesystem overhead; Windows needs symlink support):

  python source-publication/assemble-runtime-sources.py --manifest source-publication/final-runtime/SOURCE-MANIFEST.json --parts-dir . --destination runtime-source

Add --apply-patches to apply Electron's exact config/.patches order after
complete extraction. Git must be installed. No downloads, upstream hooks,
build scripts or source programs run. A failed extraction leaves an explicitly
incomplete SOURCE-ASSEMBLY.json and must be removed/restarted in a fresh tree.

RUNTIME-ASSEMBLY.json binds the full accepted source graph, required release
profiles/notices, per-archive inventories, and original patch paths/absences to
the exact ordered patch result. RUNTIME-FILE-INVENTORY.jsonl.gz contains the
complete pre-patch logical source-file inventory. Its uncompressed JSONL hash
is recorded in RUNTIME-ASSEMBLY.json. This inventory is release metadata, not
a substitute for the source ZIPs. Safely dangling internal symlinks are listed.

The maintainer verified all 257 Electron patches against the exact complete
set of touched source paths. This does not mean that the full runtime source
tree was physically extracted or that Electron was rebuilt from source.
Native compilers/platform SDKs and build prerequisites remain external.
The release publication guard independently reconciles the authoritative
DEPS/source classifications and current GitHub asset hashes before publication.
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, required=True)
    parser.add_argument('--parts-dir', type=Path, required=True)
    parser.add_argument('--receipts', type=Path)
    parser.add_argument('--output-dir', type=Path, required=True)
    names = ('seed', 'deps_inventory', 'git_plan', 'non_git_classification',
             'supplemental_manifest', 'supplemental_validation', 'profiles',
             'patch_recipe', 'patch_result')
    for name in names:
        parser.add_argument('--' + name.replace('_', '-'), type=Path, required=True)
    args = parser.parse_args()
    manifest, assembly = finalize({name: getattr(args, name) for name in names}, args.database,
                                  args.parts_dir, args.receipts, args.output_dir)
    print(json.dumps({'passed': True, 'parts': manifest['part_count'], 'archives': manifest['source_count'],
                      'entries': assembly['entry_count'], 'patches': assembly['ordered_patch_count'],
                      'logical_inventory_sha256': assembly['logical_inventory_sha256']}, indent=2))


if __name__ == '__main__':
    main()
