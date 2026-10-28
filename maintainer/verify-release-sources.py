#!/usr/bin/env python3
"""Check source collection coverage and release-asset integrity evidence.

This is a structural source-access gate, not a binary rebuild or legal opinion.
All inputs are local, hash-bound files. Publication additionally needs a recent
GitHub API snapshot supplied by the release operator; this program never reads
credentials, downloads source archives, or writes to GitHub.
"""
from __future__ import annotations

import argparse
import ast
import gzip
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import tempfile
import urllib.parse
import zipfile


class GuardError(ValueError):
    """Missing, stale, inconsistent or unsafe publication evidence."""


def require(condition, message):
    if not condition:
        raise GuardError(message)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f'Duplicate JSON key: {key}')
        result[key] = value
    return result


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'), object_pairs_hook=unique_object)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()


def canonical_digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def digest_file(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def digest(value):
    require(isinstance(value, str) and re.fullmatch(r'[0-9a-f]{64}', value), 'Invalid SHA-256')
    return value


def relative(value):
    require(isinstance(value, str) and value and not value.startswith('/') and
            not any(c in value for c in '\\\0\r\n:') and '..' not in value.split('/') and
            value == str(PurePosixPath(value)) and value != '.', f'Unsafe path: {value!r}')
    return value


def filename(value):
    require('/' not in relative(value), f'Expected filename: {value!r}')
    return value


def ordinary_file(root, name):
    path = root / relative(name)
    for ancestor in (path, *path.parents):
        require(not ancestor.is_symlink(), f'Symlink input refused: {name}')
        if ancestor == root:
            break
    require(path.is_file(), f'Missing input: {name}')
    return path


def indexed(rows, key, label):
    require(isinstance(rows, list), f'{label} must be a list')
    result = {}
    for row in rows:
        require(isinstance(row, dict) and key in row, f'Malformed {label}')
        identity = row[key]
        require(isinstance(identity, (str, int)) and identity not in result,
                f'Duplicate/invalid {label} identity: {identity}')
        result[identity] = row
    return result


def exact(actual, expected, label):
    require(actual == expected, f'{label} differs from authoritative inputs')


def exact_set(actual, expected, label):
    require(len(actual) == len(set(actual)), f'Duplicate {label}')
    require(set(actual) == set(expected),
            f'{label}: missing={sorted(set(expected)-set(actual))[:5]}, extra={sorted(set(actual)-set(expected))[:5]}')


class Bundle:
    """A closed, explicitly hashed set of ordinary files below one directory."""
    def __init__(self, path, metadata_dir=None):
        self.path = path.resolve()
        self.root = self.path.parent
        self.metadata_root = metadata_dir.resolve() if metadata_dir else None
        self.data = read_json(self.path)
        require(self.data.get('schema_version') == 1, 'Unsupported source bundle schema')
        self.inputs = self.data.get('inputs', {})
        require(isinstance(self.inputs, dict), 'Bundle inputs must be named descriptors')
        self.loaded = {}
        self.files = {}
        for desc in [*self.inputs.values(), *self.data.get('material_files', []),
                     *self.data.get('part_verifications', []), *self.data.get('validator_files', [])]:
            self.verify_file(desc)

    def verify_file(self, desc):
        require(isinstance(desc, dict), 'Malformed file descriptor')
        name = relative(desc.get('file'))
        storage = desc.get('storage', 'bundle')
        require(storage in ('bundle', 'metadata', 'repository'), 'Unknown proof storage location')
        root = {'bundle': self.root, 'metadata': self.metadata_root, 'repository': self.root.parent}[storage]
        require(root is not None, f'Companion metadata is required for {name}; supply --metadata-dir')
        require(type(desc.get('bytes')) is int and desc['bytes'] >= 0, 'Invalid input byte count')
        digest(desc.get('sha256'))
        if name in self.files:
            prior = self.files[name]
            exact((desc['bytes'], desc['sha256'], storage),
                  (prior['bytes'], prior['sha256'], prior.get('storage', 'bundle')), f'Duplicate descriptor for {name}')
            return root / name
        path = ordinary_file(root, name)
        require(path.stat().st_size == desc['bytes'] and digest_file(path) == desc['sha256'],
                f'Input size/hash mismatch: {name}')
        self.files[name] = desc
        return path

    def get(self, name):
        require(name in self.inputs, f'Missing required proof: {name}')
        if name not in self.loaded:
            self.loaded[name] = read_json(self.verify_file(self.inputs[name]))
        return self.loaded[name]

    def sha(self, name):
        self.get(name)
        return self.inputs[name]['sha256']

    def bound_inputs(self, report, names):
        bindings = report.get('input_sha256', {})
        for name in names:
            exact(bindings.get(name), self.sha(name), f'Proof binding {name}')

    def material(self, base_input, record, path_key='file', size_key='bytes'):
        parent = PurePosixPath(self.inputs[base_input]['file']).parent
        name = str(parent / relative(record[path_key]))
        require(name in self.files, f'Unbound retained material: {name}')
        desc = self.files[name]
        exact(desc['sha256'], record['sha256'], f'Retained material hash {name}')
        if size_key in record:
            exact(desc['bytes'], record[size_key], f'Retained material size {name}')
        return self.verify_file(desc)

    def nested(self, base_input, desc):
        """Load a hash-bound descriptor relative to another input's directory."""
        parent = PurePosixPath(self.inputs[base_input]['file']).parent
        adjusted = {**desc, 'file': str(parent / relative(desc['file']))}
        if 'storage' not in adjusted and self.inputs[base_input].get('storage'):
            adjusted['storage'] = self.inputs[base_input]['storage']
        return read_json(self.verify_file(adjusted))

    def nested_file(self, base_input, desc):
        parent = PurePosixPath(self.inputs[base_input]['file']).parent
        adjusted = {**desc, 'file': str(parent / relative(desc['file']))}
        if 'storage' not in adjusted and self.inputs[base_input].get('storage'):
            adjusted['storage'] = self.inputs[base_input]['storage']
        return self.verify_file(adjusted)


def derive_git_sources(inventory, seed):
    seeds = indexed(seed['source_seeds'], 'id', 'source seeds')
    targets = indexed(inventory['targets'], 'target', 'DEPS targets')
    exact_set(list(targets), ['linux', 'win'], 'DEPS targets')
    selected = {}
    for target, data in targets.items():
        # The full dependency table and selected table must agree exactly.
        full = [r for r in data['dependencies'] if r.get('enabled') is True and 'url' in r]
        exact(data['selected_git'], full, f'{target} selected Git dependencies')
        seen = set()
        for row in full:
            path = relative(row['path'])
            require(path not in seen, f'Duplicate {target} checkout: {path}')
            seen.add(path)
            repository, revision = row['url'].rsplit('@', 1)
            if path in ('src', 'src/third_party/electron_node'):
                component = seeds['chromium' if path == 'src' else 'node']
                revision = component['revision']
                official = ('https://chromium.googlesource.com/chromium/src.git' if path == 'src'
                            else 'https://github.com/nodejs/node.git')
                exact(repository.rstrip('/'), official, 'Seed repository')
            require(re.fullmatch('[0-9a-f]{40}', revision), f'Unresolved Git pin: {path}')
            if path in selected:
                exact((repository, revision), (selected[path]['repository'], selected[path]['revision']),
                      f'Conflicting target checkout {path}')
                selected[path]['targets'].append(target)
            else:
                selected[path] = dict(path=path, repository=repository, revision=revision, targets=[target])
    electron = seeds['electron']
    require('src/electron' not in selected, 'Electron seed duplicates DEPS checkout')
    selected['src/electron'] = dict(path='src/electron', repository='https://github.com/electron/electron.git',
                                    revision=electron['revision'], targets=['linux', 'win'])
    for path, row in selected.items():
        url = urllib.parse.urlsplit(row['repository'])
        require(url.scheme == 'https' and not url.username and not url.password, 'Unsafe Git URL')
        revision = row['revision']
        if url.netloc == 'github.com':
            project = url.path.removesuffix('.git').strip('/')
            row['archive_url'] = f'https://codeload.github.com/{project}/tar.gz/{revision}'
            row['archive_prefix'] = f'{project.split("/")[-1]}-{revision}/'
        else:
            require(url.netloc.endswith('.googlesource.com'), 'Unreviewed source host')
            row['archive_url'] = row['repository'] + f'/+archive/{revision}.tar.gz'
            row['archive_prefix'] = ''
        row['archive'] = path.replace('/', '__') + f'-{revision}.tar.gz'
        if path in ('src', 'src/electron'):
            component = seeds['chromium' if path == 'src' else 'electron']
            row['archive'] = component['archive']
            # Gitiles accepts the same repository URL with or without .git.
            # Keep the canonical DEPS repository spelling in archive identity.
            exact(component['archive_url'].replace('.git/+archive/', '/+archive/'),
                  row['archive_url'].replace('.git/+archive/', '/+archive/'), 'Seed archive URL')
        row['targets'].sort()
    return selected


def condition_value(expression, variables, literals):
    """Evaluate only the boolean subset used by retained nested DEPS objects.

    Non-literal string variables recursively denote conditions in gclient_eval;
    literal_variables records its ConstantString exceptions.
    """
    active = set()
    def value(node):
        if isinstance(node, ast.Constant) and type(node.value) in (str, bool, int):
            return node.value
        if isinstance(node, ast.Name):
            require(node.id in variables and node.id not in active, f'Unknown/cyclic DEPS variable: {node.id}')
            item = variables[node.id]
            if isinstance(item, str) and node.id not in literals:
                active.add(node.id)
                try:
                    return value(ast.parse(item, mode='eval').body)
                finally:
                    active.remove(node.id)
            return item
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
            return not value(node.operand)
        if isinstance(node, ast.BoolOp):
            if isinstance(node.op, ast.And):
                return all(value(v) for v in node.values)
            if isinstance(node.op, ast.Or):
                return any(value(v) for v in node.values)
        if isinstance(node, ast.Compare) and len(node.ops) == 1:
            left, right = value(node.left), value(node.comparators[0])
            if isinstance(node.ops[0], ast.Eq):
                return left == right
            if isinstance(node.ops[0], ast.NotEq):
                return left != right
        raise GuardError('Unsupported nested DEPS condition syntax')
    return bool(value(ast.parse(expression, mode='eval').body))


NON_GIT_CLASSES = {
    'build-or-test-tool', 'separate-test-data-or-product-binary',
    'compiler-and-runtime-source', 'optional-test-binary',
    'separate-test-or-automation-tool', 'platform-sysroot',
    'platform-sdk-with-source-headers', 'required-build-javascript-source',
    'required-source-headers',
}


def check_non_git(bundle, inventory, classification, supplemental):
    fields = ('path', 'deps_file', 'condition', 'dep_type', 'bucket', 'objects', 'packages')
    expected = {}
    parsed = {}
    for target in inventory['targets']:
        for item in target['parsed']:
            parsed[(target['target'], item['path'] + '/' + item['file'])] = item
        for row in target['dependencies']:
            if row.get('enabled') is not True or 'url' in row:
                continue
            identity = canonical({k: row[k] for k in fields if k in row})
            entry = expected.setdefault(identity, {'targets': []})
            require(target['target'] not in entry['targets'], 'Duplicate enabled non-Git row')
            entry['targets'].append(target['target'])
    seen = set()
    nested_count = 0
    for row in classification['rows']:
        identity = canonical({k: row[k] for k in fields if k in row})
        require(identity in expected and identity not in seen, 'Missing/substituted/duplicate non-Git row')
        seen.add(identity)
        exact_set(row['targets'], expected[identity]['targets'], 'Non-Git row targets')
        require(row.get('classification') in NON_GIT_CLASSES and row.get('source_access_disposition'),
                'Unknown or unexplained non-Git disposition')
        evaluations = []
        for target in row['targets']:
            source = parsed[(target, row['deps_file'])]
            exact(row.get('deps_file_sha256'), source['sha256'], 'Non-Git DEPS hash')
            for obj in row.get('objects', []):
                expression = obj.get('condition', 'True')
                evaluations.append({'target': target, 'object_name': obj['object_name'],
                                    'condition': expression,
                                    'enabled': condition_value(expression, source['effective_variables'], source['literal_variables'])})
        exact(row.get('objects_evaluation'), evaluations, 'Nested non-Git conditions')
        nested_count += len(evaluations)
        for record in row.get('retained_source_review_inputs', []):
            bundle.material('non_git_classification', record)
    exact(seen, set(expected), 'Enabled non-Git row coverage')
    # Explicit source dispositions must point to a collected archive or notice.
    mappings = bundle.get('runtime_assembly').get('non_git_source_mappings', [])
    source_rows = [r for r in classification['rows'] if r['classification'] in {
        'compiler-and-runtime-source', 'platform-sdk-with-source-headers',
        'required-build-javascript-source', 'required-source-headers'}]
    mapping = indexed(mappings, 'path', 'non-Git source mappings')
    exact_set(list(mapping), [r['path'] for r in source_rows], 'Non-Git source mappings')
    sources = indexed(supplemental['sources'], 'archive', 'supplemental archives')
    for row in source_rows:
        linked = mapping[row['path']]
        exact(linked.get('classification_row_sha256'), canonical_digest(row), 'Non-Git mapping input')
        require(linked.get('archives') and all(a in sources for a in linked['archives']),
                'Source-bearing non-Git row lacks collected source')
        if row['path'] in ('src/third_party/llvm-build/Release+Asserts', 'src/third_party/llvm-libclang',
                           'src/third_party/openscreen/src/third_party/llvm-build/Release+Asserts'):
            matching = [s['archive'] for s in sources.values()
                        if s.get('role') == 'exact-toolchain-compiler-runtime-source-reference']
        else:
            matching = [s['archive'] for s in sources.values() if s['path'] == row['path']]
        require(matching, 'Unreviewed non-Git source destination mapping')
        exact_set(linked['archives'], matching, 'Exact non-Git source archive mapping')
    return {'rows': len(seen), 'nested_conditions': nested_count}


def archive_projection(row):
    return {k: row.get(k, '' if k == 'archive_prefix' else None)
            for k in ('archive', 'path', 'repository', 'revision', 'archive_url', 'archive_prefix')}


def canonical_json_lines(path, ensure_ascii=True, max_line_bytes=1024 * 1024):
    with gzip.open(path, 'rb') as stream:
        while True:
            line = stream.readline(max_line_bytes + 1)
            if not line:
                break
            require(len(line) <= max_line_bytes and line.endswith(b'\n'), 'Malformed or oversized source index record')
            row = json.loads(line, object_pairs_hook=unique_object)
            expected = json.dumps(row, sort_keys=True, separators=(',', ':'), ensure_ascii=ensure_ascii).encode() + b'\n'
            exact(line, expected, 'Canonical source index encoding')
            yield row, line


def check_runtime_inventory(bundle, assembly, accepted):
    path = bundle.nested_file('runtime_assembly', assembly['compressed_inventory'])
    digest_all = hashlib.sha256()
    counts = {name: {'entry_count': 0, 'regular_files': 0, 'regular_bytes': 0, 'digest': hashlib.sha256()}
              for name in accepted}
    selected = {}
    retained = bundle.get('patch_recipe')['retained_inputs']
    wanted = ({r['path'] for r in assembly['required_members']} | set(assembly['initial_patch_paths']) |
              {r['file'] for r in retained} | getattr(bundle, 'gitlink_selected_paths', set()))
    previous = None
    total = 0
    ancestors = []
    kinds, links = {}, {}
    native_prefixes = tuple('src/' + relative(p.rstrip('/')) + '/' for p in bundle.get('native_grant_index')['scope_prefixes'])
    ffmpeg = bundle.get('native_ffmpeg')
    native_paths = {'src/third_party/ffmpeg/' + relative(r['source_path']) for r in ffmpeg['records']}
    native_paths.update(relative(r['source_path']) for r in ffmpeg['electron_inputs'])
    bundle.native_runtime_files = {}
    bundle.supplemental_runtime_files = {}
    for row, line in canonical_json_lines(path):
        exact(set(row), {'path', 'kind', 'link', 'mode', 'size', 'sha256', 'source'}, 'Runtime inventory record schema')
        name = relative(row['path'])
        require(previous is None or previous < name, 'Runtime inventory must have sorted unique paths')
        previous = name
        require(row['kind'] in ('dir', 'file', 'symlink'), 'Unsupported source inventory entry kind')
        parent = name.rpartition('/')[0]
        require(not parent or kinds.get(parent) == 'dir', 'Missing/non-directory source inventory ancestor')
        kinds[name] = row['kind']
        require(type(row['mode']) is int and 0 <= row['mode'] <= 0o177777 and type(row['size']) is int and row['size'] >= 0,
                'Invalid source inventory mode/size')
        # TAR typeflag determines kind; Gitiles can retain regular-file mode bits
        # on symlink entries. Preserve the original mode in the logical digest.
        require(stat.S_IFMT(row['mode']) in (0, stat.S_IFREG, stat.S_IFDIR, stat.S_IFLNK),
                'Unsupported source inventory mode bits')
        while ancestors and not name.startswith(ancestors[-1][0] + '/'):
            ancestors.pop()
        require(not ancestors or ancestors[-1][1] == 'dir', 'Source inventory has non-directory ancestor')
        ancestors.append((name, row['kind']))
        if row['kind'] == 'file':
            digest(row['sha256'])
            require(row['link'] is None, 'Regular source file has link target')
        elif row['kind'] == 'symlink':
            target = row['link']
            require(isinstance(target, str) and target and not target.startswith('/') and
                    not any(c in target for c in '\\\0\r\n:'), 'Unsafe source index link')
            links[name] = target
            require(row['size'] == 0 and row['sha256'] is None, 'Symlink inventory contains regular-file byte metadata')
        else:
            require(row['size'] == 0 and row['sha256'] is None and row['link'] is None,
                    'Directory inventory contains file/link metadata')
        source = row['source']
        require(source == 'implicit' and row['kind'] == 'dir' or source in accepted, 'Unknown source inventory archive owner')
        if source == 'implicit':
            require(row['mode'] == 0, 'Implicit source directory must have unspecified mode')
        if source != 'implicit':
            require(name == accepted[source]['path'] or name.startswith(accepted[source]['path'] + '/'), 'Source inventory destination mismatch')
            stats = counts[source]
            stats['entry_count'] += 1
            stats['regular_files'] += row['kind'] == 'file'
            stats['regular_bytes'] += row['size'] if row['kind'] == 'file' else 0
            stats['digest'].update(line)
        if name in wanted:
            selected[name] = row
        if name in native_paths or name.startswith(native_prefixes):
            bundle.native_runtime_files[name] = row
        if row['kind'] == 'file' and (name.startswith('src/third_party/rust-toolchain/lib/rustlib/src/rust/') or
                name.startswith('src/electron/lib/') and name.endswith(('.js', '.ts')) and not name.endswith('.d.ts')):
            bundle.supplemental_runtime_files[name] = row
        digest_all.update(line)
        total += 1
    exact(digest_all.hexdigest(), assembly['logical_inventory_sha256'], 'Runtime full logical inventory digest')
    exact(total, assembly['entry_count'], 'Runtime full logical inventory entry count')
    resolved_links = resolve_inventory_links(kinds, links)
    exact(assembly['symlinks'], resolved_links, 'Expanded runtime symlink proof')
    exact(assembly['dangling_links'], [r for r in resolved_links if r['dangling']], 'Explicit runtime dangling links')
    symlink_proof = assembly['symlink_verification']
    exact(symlink_proof.get('input_sha256', {}).get('logical_inventory'), digest_all.hexdigest(), 'Symlink full-inventory binding')
    exact(symlink_proof['symlinks_sha256'], canonical_digest(resolved_links), 'Symlink result digest')
    declared = indexed(assembly['per_archive_inventory'], 'archive', 'per-archive logical inventory')
    exact_set(list(declared), list(accepted), 'Per-archive logical inventory coverage')
    for name, stats in counts.items():
        expected = {k: stats[k] for k in ('entry_count', 'regular_files', 'regular_bytes')}
        expected['logical_records_sha256'] = stats['digest'].hexdigest()
        exact({k: declared[name].get(k) for k in expected}, expected, 'Per-archive inventory counts/digest')
        exact(stats['regular_files'], accepted[name]['regular_files'], 'Accepted archive regular-file coverage')
        exact(stats['regular_bytes'], accepted[name]['unpacked_member_bytes'], 'Accepted archive regular-byte coverage')
    for member in assembly['required_members']:
        row = selected.get(member['path'], {})
        exact((row.get('kind'), row.get('size'), row.get('sha256')), ('file', member['size'], member['sha256']),
              'Required source bytes in full inventory')
    for member in retained:
        row = selected.get(member['file'], {})
        exact((row.get('kind'), row.get('size'), row.get('sha256')), ('file', member['bytes'], member['sha256']),
              'Original Electron patch/config bytes in full archive inventory')
        require(row.get('source') in accepted and accepted[row['source']]['path'] == 'src/electron',
                'Retained Electron recipe bytes came from another archive owner')
    for path in getattr(bundle, 'gitlink_selected_paths', set()):
        require(path in selected and selected[path]['kind'] in ('dir', 'file'), 'Selected vendored Gitlink alternative absent from full source inventory')
    for name, initial in assembly['initial_patch_paths'].items():
        row = selected.get(name)
        if initial is None:
            require(row is None, 'Patch-created path was present in complete original inventory')
        else:
            require(row is not None and row['kind'] == 'file', 'Original patch source missing from full inventory')
            owners = [r for r in accepted.values() if name.startswith(r['path'] + '/')]
            require(owners, 'No accepted source owner for patch input')
            owner = max(owners, key=lambda r: len(r['path']))
            exact(row['source'], owner['archive'], 'Original patch source archive owner')
            exact(initial, {'bytes': row['size'], 'mode': 0o755 if row['mode'] & 0o111 else 0o644,
                            'sha256': row['sha256']}, 'Initial patch bytes/mode in full inventory')


def resolve_inventory_links(kinds, links):
    results = []
    for path, target in sorted(links.items()):
        require(target and not target.startswith('/') and not any(c in target for c in '\\\0\r\n:'), 'Unsafe source symlink target')
        stack, pending = path.split('/')[:-1], target.split('/')
        seen, expansions, dangling = set(), 1, False
        while pending:
            state = (tuple(stack), tuple(pending))
            require(state not in seen and expansions <= 256, 'Cyclic/unbounded source symlink')
            seen.add(state)
            component, *pending = pending
            if component in ('', '.'):
                continue
            if component == '..':
                require(stack, 'Source symlink escapes logical root')
                stack.pop()
                continue
            candidate = '/'.join([*stack, component])
            if candidate in links:
                expansions += 1
                pending = links[candidate].split('/') + pending
                continue
            if candidate not in kinds:
                dangling = True
            else:
                require(kinds[candidate] == 'dir' or not pending, 'Source symlink traverses a non-directory')
            stack.append(component)
        results.append({'path': path, 'target': target, 'resolved': '/'.join(stack) or '.',
                        'expansions': expansions, 'dangling': dangling})
    return results


def check_git_inventory(path, proof):
    header = None
    blobs, trees, gitlinks = {}, {}, {}
    full_digest, total_bytes, total_rows = hashlib.sha256(), 0, 0
    # A single real Git tree can contain tens of thousands of children; the
    # same 16 MiB bound is used by the pinned Gitiles metadata collector.
    for row, line in canonical_json_lines(path, max_line_bytes=16 * 1024 * 1024):
        full_digest.update(line); total_bytes += len(line); total_rows += 1
        kind = row.get('type')
        if kind == 'header':
            require(header is None and total_rows == 1, 'Duplicate/misplaced Git inventory header')
            header = row
            continue
        require(kind in ('blob', 'tree', 'gitlink'), 'Unknown Git inventory record')
        name = row['path']
        if name != '':
            relative(name)
        require(kind == 'tree' or name, 'Only Git root tree may have empty path')
        require(name not in blobs and name not in trees and name not in gitlinks, 'Duplicate Git object path')
        require(re.fullmatch('[0-9a-f]{40}', row.get('sha1', '')), 'Invalid Git object ID')
        if kind == 'blob':
            require(row.get('mode') in ('100644', '100755', '120000') and type(row.get('size')) is int and row['size'] >= 0,
                    'Invalid Git blob mode/size')
            digest(row.get('sha256'))
            blobs[name] = row
        elif kind == 'gitlink':
            require(row.get('mode') == '160000', 'Invalid Gitlink mode')
            gitlinks[name] = row
        else:
            trees[name] = row
    require(header is not None, 'Missing Git inventory header')
    for key in ('repository', 'revision', 'archive_sha256', 'archive_bytes', 'root_git_tree'):
        exact(header.get(key), proof[key], 'Git inventory source binding')
    descriptor = proof['source_inventory']
    exact((full_digest.hexdigest(), total_bytes, total_rows),
          (descriptor['jsonl_sha256'], descriptor['jsonl_bytes'], descriptor['records']), 'Complete Git inventory stream')
    children = {name: {} for name in trees}
    for name, row in {**blobs, **gitlinks, **trees}.items():
        if not name:
            continue
        parent, _, basename = name.rpartition('/')
        require(parent in children, 'Missing Git parent tree')
        children[parent][basename] = {'name': basename, 'mode': '40000' if name in trees else row['mode'], 'sha1': row['sha1']}
    for name, tree in trees.items():
        entries = indexed(tree['entries'], 'name', 'Git tree entries')
        exact(entries, children[name], 'Exact Git tree child coverage')
        ordered = sorted(entries.values(), key=lambda r: (r['name'] + ('/' if r['mode'] == '40000' else '')).encode())
        data = b''.join(r['mode'].encode() + b' ' + r['name'].encode() + b'\0' + bytes.fromhex(r['sha1']) for r in ordered)
        oid = hashlib.sha1(b'tree ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        exact(tree['sha1'], oid, 'Reconstructed Git tree object')
    require('' in trees, 'Missing Git root tree')
    exact(trees['']['sha1'], proof['root_git_tree'], 'Pinned immutable Git source root')
    fingerprint = hashlib.sha256()
    for name, row in sorted(blobs.items()):
        fingerprint.update((json.dumps([name, row['mode'], row['sha1'], row['size'], row['sha256']],
                                      ensure_ascii=True, separators=(',', ':')) + '\n').encode())
    exact(fingerprint.hexdigest(), proof['source_blob_inventory_sha256'], 'Complete Git blob inventory fingerprint')
    exact((len(blobs), len(trees)), (proof['blob_count'], proof['git_tree_count']), 'Git blob/tree coverage counts')
    exact([{'path': name, 'revision': row['sha1']} for name, row in sorted(gitlinks.items())],
          sorted(proof['gitlinks'], key=lambda r: r['path']), 'Gitlink identity coverage')
    return trees


def check_git_commit_object(payload, revision, root_tree):
    require(len(payload) <= 4 * 1024 * 1024 and b'\n\n' in payload, 'Malformed/oversized raw Git commit object')
    oid = hashlib.sha1(b'commit ' + str(len(payload)).encode() + b'\0' + payload).hexdigest()
    exact(oid, revision, 'Raw Git commit object immutable revision')
    headers = payload.split(b'\n\n', 1)[0].splitlines()
    tree_headers = [line for line in headers if line.startswith(b'tree ')]
    require(len(tree_headers) == 1 and headers[0] == tree_headers[0], 'Raw Git commit has ambiguous tree header')
    exact(tree_headers[0], b'tree ' + root_tree.encode('ascii'), 'Raw commit root versus reconstructed full Git tree')


def check_supplemental_evidence(bundle):
    supplemental = bundle.get('supplemental_manifest')
    js_descriptor = supplemental['runtime_javascript_evidence']
    exact(js_descriptor.get('external_npm_runtime_packages'), 0, 'Electron external runtime npm package count')
    js = read_json(bundle.material('supplemental_manifest', js_descriptor))
    electron = next(r for r in bundle.get('git_plan') if r['path'] == 'src/electron')
    exact((js.get('passed'), js.get('electronVersion'), js.get('sourceRevision')),
          (True, bundle.data['electron_version'], electron['revision']), 'Electron runtime JavaScript classification identity')
    for key in ('externalPackages', 'dynamic', 'errors'):
        exact(js.get(key), [], 'Unresolved Electron runtime JavaScript references')
    files = bundle.supplemental_runtime_files
    js_files = {p: r for p, r in files.items() if p.startswith('src/electron/lib/')}
    exact(js.get('sourceFiles'), len(js_files), 'Electron runtime JavaScript source coverage')
    exact(js.get('staticModuleReferences'), len(js['modules']), 'Electron static module reference count')
    for module in js['modules']:
        path = 'src/electron/' + relative(module['file'])
        require(path in js_files, 'Electron classified JavaScript absent from complete source inventory')
        exact(module['sourceSha256'], js_files[path]['sha256'], 'Electron classified JavaScript source bytes')
        require(module['classification'] in ('electron-source', 'node-source-or-built-in'),
                'External Electron runtime JavaScript dependency')
    rust = next(r for r in supplemental['sources'] if r['path'] == 'src/third_party/rust-toolchain')
    parity_desc = rust['windows_source_parity_evidence']
    parity = read_json(bundle.material('supplemental_manifest', parity_desc))
    validation = next(r for r in bundle.get('supplemental_validation')['archives'] if r['archive'] == rust['archive'])
    source = read_json(bundle.material('supplemental_manifest',
                      {'file': rust['source_record'], 'sha256': validation['source_record_sha256']}))
    members = indexed([r for r in source['members'] if r['path'].startswith('lib/rustlib/src/rust/') and r['sha256'] is not None],
                      'path', 'Rust source-subtree files')
    actual = {p.removeprefix(rust['path'] + '/'): (r['size'], r['sha256'])
              for p, r in files.items() if p.startswith(rust['path'] + '/')}
    exact(actual, {p: (r['bytes'], r['sha256']) for p, r in members.items()}, 'Rust parity source bytes in complete inventory')
    exact((parity.get('passed'), parity.get('linux_source_files'), parity.get('windows_source_files'), parity_desc['source_files']),
          (True, len(members), len(members), len(members)), 'Rust Linux/Windows source parity coverage')
    for key in ('missing', 'additional', 'changed'):
        exact(parity.get(key), [], 'Rust source parity differences')
    classified = next(r for r in bundle.get('non_git_classification')['rows'] if r['path'] == rust['path'])
    selected = [r['object_name'] for r in classified['objects_evaluation'] if r['target'] == 'win' and r['enabled']]
    require(len(selected) == 1, 'Exact Windows Rust package selection required')
    package = next(r for r in classified['objects'] if r['object_name'] == selected[0])
    url = f"https://storage.googleapis.com/{classified['bucket']}/{package['object_name']}?generation={package['generation']}"
    exact((parity['windows_package_url'], parity['windows_package_bytes'], parity['windows_package_sha256']),
          (url, package['size_bytes'], package['sha256sum']), 'Rust parity exact Windows package provenance')
    return {'electron_javascript_files': len(js_files), 'static_module_references': len(js['modules']),
            'external_npm_runtime_packages': 0, 'rust_source_files_per_platform': len(members)}


def check_runtime(bundle):
    seed, inventory, plan = bundle.get('seed'), bundle.get('deps_inventory'), bundle.get('git_plan')
    exact(seed['suite_version'], bundle.data['version'], 'Source seed suite version')
    exact(seed['electron_version'], bundle.data['electron_version'], 'Source seed Electron version')
    exact(inventory['electron'], seed['electron_version'], 'DEPS Electron version')
    for record in seed['provenance_inputs']:
        bundle.material('seed', record)
    parser = bundle.get('deps_parser_proof')
    exact(parser['input_sha256'].get('deps-45.1-inventory.json'), bundle.sha('deps_inventory'),
          'Official parser inventory binding')
    for file, sha in parser['input_sha256'].items():
        if file != 'deps-45.1-inventory.json':
            bundle.material('deps_parser_proof', {'file': file, 'sha256': sha})
    for record in parser['deps_inputs']:
        bundle.material('deps_parser_proof', record)
    parsed_hashes = {p['sha256'] for t in inventory['targets'] for p in t['parsed']}
    material_hashes = {p['sha256'] for p in parser['deps_inputs']} | {p['sha256'] for p in seed['provenance_inputs']}
    require(parsed_hashes <= material_hashes, 'Parsed DEPS input bytes missing from hash chain')
    compared = indexed(parser['targets'], 'target', 'upstream parser target comparisons')
    exact_set(list(compared), [t['target'] for t in inventory['targets']], 'Upstream parser target coverage')
    for target in inventory['targets']:
        proof = compared[target['target']]
        exact((proof['dependencies'], proof['selected_git'], proof['all_rows_equal']),
              (len(target['dependencies']), len(target['selected_git']), True), 'Upstream parser row comparison')
    expected = derive_git_sources(inventory, seed)
    declared = indexed(plan, 'path', 'Git plan checkouts')
    exact_set(list(declared), list(expected), 'Git plan coverage')
    for path, row in expected.items():
        exact(archive_projection(declared[path]), archive_projection(row), f'Git plan identity {path}')
        exact_set(declared[path]['targets'], row['targets'], f'Git plan targets {path}')
    supplemental = bundle.get('supplemental_manifest')
    validation = bundle.get('supplemental_validation')
    validated = indexed(validation['archives'], 'archive', 'supplemental archive proofs')
    extra = indexed(supplemental['sources'], 'archive', 'supplemental archives')
    exact_set(list(validated), list(extra), 'Supplemental validation coverage')
    for name, row in extra.items():
        proof = validated[name]
        require(proof.get('passed') is True, f'Unverified supplemental archive {name}')
        for key in ('size', 'sha256', 'source_record'):
            exact(proof[key], row[key], f'Supplemental proof {key}')
        bundle.material('supplemental_manifest', {'file': row['source_record'], 'sha256': proof['source_record_sha256']})
    profiles = bundle.get('profiles')
    profile_rows = indexed([p for p in profiles['source_files'] if 'file' in p], 'file', 'release profile inputs')
    exact_set(list(profile_rows), [p['file'] for p in seed['release_profiles']], 'Pinned release profile set')
    for expected_profile in seed['release_profiles']:
        actual_profile = profile_rows[expected_profile['file']]
        destination = ('electron-v8-builtins.profile' if expected_profile['file'].endswith('.profile')
                       else expected_profile['file'])
        exact((actual_profile['archive_member'], actual_profile['sha256'], actual_profile['url']),
              (destination, expected_profile['expected_sha256'], expected_profile['url']),
              'Pinned release profile identity')
    markers = [p for p in profiles['source_files'] if 'file' not in p]
    require(len(markers) == 1, 'Exact upstream profile version marker required')
    marker_bytes = (next(p['file'] for p in seed['release_profiles'] if p['file'].endswith('.profile')) + '\n').encode()
    exact((markers[0]['archive_member'], markers[0]['size'], markers[0]['sha256']),
          ('electron-v8-builtins.profile.version', len(marker_bytes), hashlib.sha256(marker_bytes).hexdigest()),
          'Upstream profile version marker')
    sources = [*plan, *extra.values(), profiles]
    manifest = bundle.get('runtime_manifest')
    require(manifest.get('schema_version') == 2, 'Runtime final schema 2 is required')
    accepted = indexed(manifest.get('sources'), 'archive', 'runtime archive records')
    exact_set(list(accepted), [r['archive'] for r in sources], 'Complete runtime archive coverage')
    gitlink_identities = []
    for row in sources:
        actual = accepted[row['archive']]
        exact(archive_projection(actual), archive_projection(row), f'Accepted archive identity {row["archive"]}')
        digest(actual.get('sha256'))
        require(type(actual.get('size')) is int and actual['size'] > 0, 'Invalid archive byte count')
        expected_hash = row.get('expected_sha256', row.get('sha256'))
        if expected_hash:
            exact(actual['sha256'], expected_hash, f'Pinned archive hash {row["archive"]}')
        if 'size' in row:
            exact(actual['size'], row['size'], f'Pinned archive size {row["archive"]}')
        if row.get('source_identity_proof'):
            identity = bundle.nested('git_plan', row['source_identity_proof'])
            exact((identity.get('archive'), identity.get('archive_bytes'), identity.get('archive_sha256'),
                   identity.get('repository'), identity.get('revision')),
                  (actual['archive'], actual['size'], actual['sha256'], actual['repository'], actual['revision']),
                  'Gitiles byte-representation proof binding')
            require(identity.get('passed') is True and re.fullmatch('[0-9a-f]{40}', identity.get('root_git_tree', '')),
                    'Gitiles source identity proof incomplete')
            exact(identity['root_git_tree'], row['source_identity_proof']['root_git_tree'], 'Pinned Git root tree')
            digest(identity.get('source_blob_inventory_sha256'))
            require(type(identity.get('blob_count')) is int and identity['blob_count'] > 0 and
                    type(identity.get('git_tree_count')) is int and identity['git_tree_count'] > 0,
                    'Gitiles complete blob/tree inventory required')
            inventory_desc = identity['source_inventory']
            inventory_desc = {**inventory_desc, 'file': str(PurePosixPath(row['source_identity_proof']['file']).parent /
                                                           relative(inventory_desc['file']))}
            trees = check_git_inventory(bundle.nested_file('git_plan', inventory_desc), identity)
            gitlink_identities.extend({'owner_archive': actual['archive'], 'repository': actual['repository'],
                                       'revision': actual['revision'], 'path': link['path'],
                                       'gitlink_revision': link['revision']} for link in identity['gitlinks'])
            metadata_paths = []
            method = identity.get('source_identity_method', 'gitiles-tree-metadata')
            require(method in ('gitiles-tree-metadata', 'git-commit-object'), 'Unknown Git source identity method')
            if method == 'git-commit-object':
                require(identity.get('metadata') == [], 'Git transport proof must not impersonate fetched Gitiles metadata')
                parent = PurePosixPath(row['source_identity_proof']['file']).parent
                commit_desc = {**identity['commit_object'], 'file': str(parent / relative(identity['commit_object']['file']))}
                raw = bundle.nested_file('git_plan', commit_desc).read_bytes()
                check_git_commit_object(raw, actual['revision'], identity['root_git_tree'])
                receipt_desc = {**identity['retrieval_receipt'], 'file': str(parent / relative(identity['retrieval_receipt']['file']))}
                receipt = bundle.nested('git_plan', receipt_desc)
                exact((receipt.get('repository'), receipt.get('revision'), receipt.get('fetched_revision'), receipt.get('retrieval_method')),
                      (actual['repository'], actual['revision'], actual['revision'], 'git-smart-http'),
                      'Original exact-revision Git transport receipt')
            for meta in identity['metadata']:
                base_url = identity['repository'].rstrip('/') + '/+/' + identity['revision'] + '/'
                require(meta['url'].startswith(base_url) and meta['url'].endswith('?format=JSON'), 'Gitiles metadata immutable URL mismatch')
                tree_path = urllib.parse.unquote(meta['url'][len(base_url):-len('?format=JSON')])
                if tree_path:
                    relative(tree_path)
                metadata_paths.append(tree_path)
                meta_desc = {**meta, 'file': str(PurePosixPath(row['source_identity_proof']['file']).parent / relative(meta['file']))}
                data = read_json(bundle.nested_file('git_plan', meta_desc))
                require(tree_path in trees, 'Gitiles metadata tree absent from complete inventory')
                exact((data['id'], meta['git_tree']), (trees[tree_path]['sha1'], trees[tree_path]['sha1']), 'Pinned Gitiles metadata root/tree identity')
                entries = [{'name': e['name'], 'mode': format(e['mode'], 'o'), 'sha1': e['id']} for e in data['entries']]
                exact(indexed(entries, 'name', 'Gitiles metadata entries'),
                      indexed(trees[tree_path]['entries'], 'name', 'reconstructed tree entries'), 'Gitiles source tree entries')
                if meta.get('receipt'):
                    receipt_desc = {**meta['receipt'], 'file': str(PurePosixPath(row['source_identity_proof']['file']).parent /
                                                                 relative(meta['receipt']['file']))}
                    receipt = bundle.nested('git_plan', receipt_desc)
                    exact(receipt, {k: meta[k] for k in ('url', 'bytes', 'sha256')}, 'Original Gitiles metadata retrieval receipt')
            if method == 'gitiles-tree-metadata':
                require('' in metadata_paths and len(metadata_paths) == len(set(metadata_paths)), 'Exact pinned Gitiles root metadata is required')
    check_gitlink_dispositions(bundle, gitlink_identities, declared)
    assembly = bundle.get('runtime_assembly')
    bundle.bound_inputs(assembly, ['deps_inventory', 'git_plan', 'non_git_classification',
                                  'supplemental_manifest', 'supplemental_validation',
                                  'profiles', 'runtime_manifest'])
    exact(assembly.get('archive_records_sha256'), canonical_digest(sorted(manifest['sources'], key=lambda r: r['archive'])),
          'Complete assembly archive record binding')
    exact_set(assembly.get('archives_scanned', []), list(accepted), 'Full logical inventory archive coverage')
    require(assembly.get('inventory_kind') == 'complete-logical-tree' and
            type(assembly.get('entry_count')) is int and assembly['entry_count'] > 0 and
            assembly.get('collisions') == [] and assembly.get('unsafe_links') == [],
            'Complete logical assembly/collision/link proof required')
    digest(assembly.get('logical_inventory_sha256'))
    require(isinstance(assembly.get('dangling_links'), list), 'Explicit dangling-link report required')
    check_runtime_inventory(bundle, assembly, accepted)
    members = indexed(assembly.get('required_members'), 'path', 'required source members')
    for notice in supplemental['required_git_tree_notices']:
        actual = members.get(notice['git_path'], {})
        exact((actual.get('size'), actual.get('sha256')), (notice['bytes'], notice['sha256']), 'Supplemental notice bytes')
    for profile in profiles['source_files']:
        actual = members.get(profiles['path'] + '/' + profile['archive_member'], {})
        exact((actual.get('size'), actual.get('sha256')), (profile['size'], profile['sha256']), 'Release profile bytes')
    non_git = check_non_git(bundle, inventory, bundle.get('non_git_classification'), supplemental)
    supplemental_evidence = check_supplemental_evidence(bundle)
    check_patch_recipe(bundle)
    patches = check_electron_patches(bundle, accepted, assembly)
    return {'git_archives': len(plan), 'supplemental_archives': len(extra),
            'archives': len(accepted), 'non_git': non_git, 'patches': patches,
            'reviewed_gitlinks': len(gitlink_identities), 'supplemental_evidence': supplemental_evidence}, manifest


def check_gitlink_dispositions(bundle, expected, plan):
    proof = bundle.get('gitlink_dispositions')
    fields = ('owner_archive', 'repository', 'revision', 'path', 'gitlink_revision')
    identities = [canonical({k: r[k] for k in fields}) for r in proof['gitlinks']]
    exact_set(identities, [canonical(r) for r in expected], 'Exact nested Gitlink review coverage')
    bundle.gitlink_selected_paths = set()
    for row in proof['gitlinks']:
        require(row.get('disposition') == 'external-build-or-test' and row.get('explanation'),
                'Unreviewed nested Gitlink source disposition')
        require(isinstance(row.get('review_inputs'), list) and row['review_inputs'],
                'Nested Gitlink disposition lacks retained original source evidence')
        for record in row['review_inputs']:
            bundle.material('gitlink_dispositions', record)
        selected = row.get('selected_dependency')
        if selected:
            require(selected['path'] in plan, 'Gitlink replacement points to an uncollected checkout')
            actual = plan[selected['path']]
            exact((selected['repository'], selected['revision']), (actual['repository'], actual['revision']),
                  'Separate selected dependency mapping')
            if selected.get('vendored_path'):
                vendored = relative(selected['vendored_path'])
                require(vendored.startswith(selected['path'] + '/'), 'Vendored dependency path escapes selected source owner')
                bundle.gitlink_selected_paths.add(vendored)


def check_electron_patches(bundle, accepted, assembly):
    recipe, result = bundle.get('patch_recipe'), bundle.get('patch_result')
    exact(result.get('recipe_sha256'), bundle.sha('patch_recipe'), 'Electron patch recipe binding')
    exact(result.get('plan_sha256'), bundle.sha('git_plan'), 'Electron patch plan binding')
    exact(result.get('electron_revision'), recipe['electron_revision'], 'Electron patch revision')
    require(result.get('status') == 'all-ordered-patches-applied', 'Ordered Electron patch result incomplete')
    records = recipe['records']
    applied = result['applied_patches']
    require(len(records) == len(applied) and records, 'Missing ordered Electron patches')
    for material in recipe['retained_inputs']:
        bundle.material('patch_recipe', material)
    initial = assembly.get('initial_patch_paths')
    require(isinstance(initial, dict), 'Complete owner-archive patch-path/absence proof required')
    exact_set(list(initial), recipe['required_paths'], 'Initial patch-path coverage')
    state = dict(initial)
    owners = set()
    electron = [r for r in accepted.values() if r['path'] == 'src/electron']
    require(len(electron) == 1, 'Exact Electron patch recipe source archive required')
    exact(electron[0]['revision'], recipe['electron_revision'], 'Electron recipe source revision')
    exact(electron[0]['sha256'], recipe['seed_sha256'], 'Electron recipe archive bytes')
    owners.add(electron[0]['archive'])
    for path, value in initial.items():
        candidates = [r for r in accepted.values() if path.startswith(r['path'] + '/')]
        require(candidates, f'No source owner for patch path {path}')
        owner = max(candidates, key=lambda r: len(r['path']))
        owners.add(owner['archive'])
        if value is not None:
            digest(value.get('sha256'))
    for ordinal, (wanted, actual) in enumerate(zip(records, applied), 1):
        exact((wanted['ordinal'], actual['ordinal']), (ordinal, ordinal), 'Electron patch ordinal')
        exact((actual['repository'], actual['patch'], actual['patch_sha256']),
              (wanted['repository'], wanted['patch'], wanted['sha256']), 'Ordered Electron patch identity')
        exact([(c.get('phase'), c.get('exit_code')) for c in actual.get('commands', [])],
              [('check', 0), ('apply', 0)], 'Actual Electron patch commands')
        paths = [r['path'] for r in wanted['diffs']]
        exact_set(list(actual['before']), paths, 'Patch before-state paths')
        exact_set(list(actual['after']), paths, 'Patch after-state paths')
        for path in paths:
            exact(actual['before'][path], state[path], 'Patch source byte/mode continuity')
            state[path] = actual['after'][path]
    exact(result['final_touched_paths'], state, 'Final ordered patch state')
    exact_set(result['initially_absent_paths'], [p for p, v in initial.items() if v is None], 'Proved added-file absence')
    exact_set(result['source_archive_coverage']['owner_archives'], list(owners), 'Electron patch owner archives')
    # Every owner source must have full local archive verification, including
    # absence of patch-created files; sparse trees alone cannot prove absence.
    return len(records)


def patch_diff_headers(contents, repository):
    rows = []
    current = None
    for line in contents.decode('utf-8').splitlines():
        if line.startswith('diff --git '):
            match = re.fullmatch(r'diff --git a/(\S+) b/(\S+)', line)
            require(match is not None, 'Unreviewed Electron patch header syntax')
            old, new = map(relative, match.groups())
            require(old == new, 'Unreviewed rename/copy patch')
            current = {'path': relative(repository + '/' + old), 'operation': 'modify'}
            rows.append(current)
        elif line.startswith(('rename from ', 'rename to ', 'copy from ', 'copy to ', 'GIT binary patch', 'Binary files ')):
            raise GuardError('Unreviewed Electron patch operation')
        elif line.startswith(('new file mode ', 'deleted file mode ', 'old mode ', 'new mode ')):
            require(current is not None, 'Patch mode appears before file header')
            key, mode = line.rsplit(' ', 1)
            require(mode in ('100644', '100755'), 'Unreviewed patch file mode')
            current[key.replace(' ', '_')] = mode
            if key == 'new file mode':
                current['operation'] = 'add'
            elif key == 'deleted file mode':
                current['operation'] = 'delete'
    require(rows, 'Electron patch contains no diff headers')
    return rows


def check_patch_recipe(bundle):
    recipe = bundle.get('patch_recipe')
    files = indexed(recipe['retained_inputs'], 'file', 'retained Electron patch inputs')
    def read(name):
        require(name in files, f'Missing original Electron patch input: {name}')
        return bundle.material('patch_recipe', files[name]).read_bytes()
    configuration = json.loads(read('src/electron/patches/config.json'), object_pairs_hook=unique_object)
    require(isinstance(configuration, list) and configuration, 'Original Electron patch config is empty')
    required = {'src/electron/LICENSE', 'src/electron/patches/config.json'}
    records, configurations = [], []
    for index, config in enumerate(configuration):
        repository, directory = relative(config['repo']), relative(config['patch_dir'])
        require(directory.startswith('src/electron/patches/'), 'Patch directory outside Electron source')
        order_file = directory + '/.patches'
        required.add(order_file)
        names = read(order_file).decode('utf-8').splitlines()
        require(len(names) == len(set(names)), 'Duplicate upstream patch order entry')
        count = 0
        for name in names:
            if not name.strip():
                continue
            require(name == name.strip(), 'Whitespace in patch order entry')
            path = directory + '/' + relative(name)
            required.add(path)
            data = read(path)
            records.append({'ordinal': len(records)+1, 'config_index': index, 'repository': repository,
                            'patch': path, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
                            'diffs': patch_diff_headers(data, repository)})
            count += 1
        configurations.append({'index': index, 'patch_dir': directory, 'repo': repository, 'patch_count': count})
    exact_set(list(files), list(required), 'Original patch/config/order input coverage')
    exact(recipe['records'], records, 'Recipe reconstructed from upstream config/order/patch bytes')
    exact(recipe['required_paths'], sorted({d['path'] for r in records for d in r['diffs']}), 'Derived patch-touched path set')
    exact(bundle.get('patch_result')['configurations'], configurations, 'Actual ordered patch configurations')


def check_onnx(bundle):
    manifest = bundle.get('onnx_manifest')
    require(manifest.get('schemaVersion') == 1 and manifest.get('kind') == 'onnx-source-collection',
            'Final ONNX collection manifest is required')
    exact((manifest['suiteVersion'], manifest['onnxruntimeVersion']),
          (bundle.data['version'], bundle.data['onnx_version']), 'ONNX collection versions')
    descriptors = {**manifest['inputs'], **manifest['proofs']}
    require(len(descriptors) == len(manifest['inputs']) + len(manifest['proofs']), 'Duplicate ONNX proof key')
    loaded = {}
    original_metadata = {}
    def retain_original(path, sha):
        mappings = [('upstream-metadata/onnxruntime/', 'onnxruntime'),
                    ('upstream-metadata/vcpkg-registry/', 'vcpkg-registry')]
        mappings += [('upstream-metadata/vcpkg-selected-ports/' + name.removeprefix('vcpkg-port-') + '/', name)
                     for name in sources if name.startswith('vcpkg-port-')]
        matches = [(prefix, source) for prefix, source in mappings if path.startswith(prefix)]
        require(len(matches) == 1, f'Unmapped original ONNX recipe source: {path}')
        prefix, source = matches[0]
        destination = sources[source]['destination'] + '/' + relative(path[len(prefix):])
        if destination in original_metadata:
            exact(original_metadata[destination], sha, 'Conflicting ONNX original recipe hash')
        original_metadata[destination] = digest(sha)
    def load(key):
        require(key in descriptors, f'Missing ONNX proof: {key}')
        if key not in loaded:
            loaded[key] = bundle.nested('onnx_manifest', descriptors[key])
        return loaded[key]
    expected = {}
    for key in ('rootInputManifest', 'part02InputManifest'):
        for row in load(key)['items']:
            if row['kind'] == 'binary-prerequisite':
                continue
            if row['name'] in expected:
                prior = expected[row['name']]
                exact(prior['url'], row['url'], 'Overlapping ONNX source URL')
                for field in ('revision', 'sha1', 'sha256', 'sha512'):
                    if field in prior and field in row:
                        exact(prior[field], row[field], 'Overlapping ONNX source pin')
                expected[row['name']] = {**prior, **row}
            else:
                expected[row['name']] = row
    graph = load('activeVcpkgGraph')
    ports = indexed(graph['ports'], 'name', 'active vcpkg ports')
    registry = indexed(load('registrySources')['sources'], 'name', 'vcpkg registry sources')
    registry_pins = {'vcpkg-registry': graph['registryBaseline']}
    for name, port in ports.items():
        if port['provenance']['kind'] == 'registry-override':
            registry_pins['vcpkg-port-' + name] = port['provenance']['gitTree']
    exact_set(list(registry), list(registry_pins), 'Vcpkg registry/override archive set')
    for name, revision in registry_pins.items():
        exact(registry[name]['revision'], revision, 'Vcpkg registry/override revision')
        require(name not in expected, 'Registry archive duplicates source input')
        expected[name] = registry[name]
    sources = indexed(manifest['sources'], 'name', 'ONNX source archives')
    exact_set(list(sources), list(expected), 'Complete active ONNX source coverage')
    assembly_plan = load('assemblyPlan')
    planned_sources = indexed(assembly_plan['sources'], 'name', 'ONNX scanned assembly plan')
    exact_set(list(planned_sources), list(sources), 'ONNX scanned assembly source set')
    for name, planned in planned_sources.items():
        exact({key: sources[name].get(key) for key in planned}, planned,
              'ONNX final source identities versus scanned assembly plan')
    for key, desc in assembly_plan['bindings'].items():
        exact(desc['sha256'], descriptors[key]['sha256'], 'ONNX assembly plan input binding')
    for name, row in expected.items():
        actual = sources[name]
        for key in ('url', 'revision', 'kind', 'sha1', 'sha256', 'sha512'):
            if key in row:
                exact(actual.get(key), row[key], f'ONNX source {name} {key}')
        digest(actual.get('sha256'))
        require(type(actual.get('bytes')) is int and actual['bytes'] > 0, 'Invalid ONNX source byte count')
        relative(actual['archive'])
        relative(actual['member'])
        relative(actual['destination'])
        prefix = actual['archivePrefix']
        require(isinstance(prefix, str) and (not prefix or prefix.endswith('/') and relative(prefix[:-1])), 'Invalid ONNX archive prefix')
        origin = bundle.nested('onnx_manifest', actual['record'])
        for key in ('name', 'url', 'kind', 'archive', 'bytes', 'sha256', 'revision'):
            if key in origin:
                exact(actual.get(key), origin[key], f'Original accepted ONNX source record {key}')
        exact(actual['archivePrefix'], origin['validation']['archivePrefix'], 'Original ONNX archive prefix')
    exact(manifest['sourceRevision'], sources['onnxruntime']['url'].rsplit('/', 1)[-1], 'ONNX root source revision')
    # Full archive audits must cover the exact final union, including originally
    # separate registry trees. Historical completeCompanion:false is preserved.
    audits = []
    for key in ('archiveAuditPart01', 'archiveAuditPart02'):
        audit = load(key)
        require(audit.get('failed') == [], 'ONNX archive safety audit failed')
        audits.extend(audit['archives'])
    audit_rows = indexed(audits, 'name', 'ONNX archive safety proofs')
    exact_set(list(audit_rows), list(sources), 'ONNX archive audit coverage')
    for name, row in sources.items():
        proof = audit_rows[name]
        exact((proof['archive'], proof['sha256']), (row['archive'], row['sha256']), 'ONNX archive audit identity')
        require(proof.get('memberPathsAndLinksValid') is True and proof.get('zipFullCrcCheckPassed') in (True, None),
                'ONNX archive path/link/CRC validation failed')
    active = indexed(load('activeVcpkgSourceInputs')['ports'], 'name', 'active vcpkg source inputs')
    exact_set(list(active), list(ports), 'Active vcpkg source coverage')
    mappings = indexed(manifest['sourceMappings']['vcpkg'], 'port', 'active vcpkg source mappings')
    exact_set(list(mappings), list(ports), 'Active vcpkg source mapping coverage')
    for name, port in active.items():
        bundle.material('onnx_manifest', {'file': port['portfile'], 'sha256': port['portfileSha256']})
        retain_original(port['portfile'], port['portfileSha256'])
        mapped = mappings[name]['sources']
        require(len(mapped) == len(set(mapped)) and all(n in sources for n in mapped), 'Invalid vcpkg source mapping')
        wanted = port['sourceFetches']
        require(len(wanted) == len(mapped), 'Vcpkg source-fetch mapping incomplete')
        for fetch in wanted:
            matches = [sources[n] for n in mapped if sources[n]['url'] == fetch['url']]
            require(len(matches) == 1, 'Vcpkg source-fetch URL mapping missing/ambiguous')
            if fetch.get('upstreamSha512'):
                exact(matches[0].get('sha512'), fetch['upstreamSha512'], 'Vcpkg upstream SHA-512')
        if not wanted:
            require(mappings[name].get('disposition') == 'source-free-helper', 'Unclassified source-free vcpkg port')
    dawn = load('dawnSourceInputs')
    for row in dawn['inputs']:
        require(row['name'] in sources, 'Missing transitive Dawn source')
        actual = sources[row['name']]
        exact((actual['url'], actual['revision']), (row['url'], row['revision']), 'Dawn transitive source identity')
        exact(actual['destination'], 'dependencies/dawn/' + row['path'], 'Dawn source assembly destination')
    emscripten = indexed(load('emscriptenSourceInputs')['inputs'], 'name', 'Emscripten source inputs')
    ems_maps = indexed(manifest['sourceMappings']['emscripten'], 'name', 'Emscripten source dispositions')
    exact_set(list(ems_maps), list(emscripten), 'Emscripten source disposition coverage')
    for name, row in emscripten.items():
        mapping = ems_maps[name]
        exact(mapping['revision'], row['revision'], 'Emscripten source revision')
        if mapping['sources']:
            require(all(s in sources for s in mapping['sources']), 'Uncollected Emscripten source mapping')
            require(any(sources[s].get('revision') == row['revision'] for s in mapping['sources']),
                    'Emscripten collected source revision mismatch')
        else:
            require(mapping.get('disposition') == 'external-build-or-test-tool' and mapping.get('reason'),
                    'Unreviewed omitted Emscripten source')
    constraints = check_vcpkg_constraints(graph, load('activeVcpkgConstraints'), descriptors['activeVcpkgGraph']['sha256'])
    bindings = load('patchBindings')
    for key in ('cmakePatchInputs', 'activeVcpkgPatchInputs', 'activeVcpkgGraph', 'cmakePatchResult', 'vcpkgPatchResult'):
        exact(bindings.get('input_sha256', {}).get(key), descriptors[key]['sha256'], 'ONNX patch proof input binding')
    patch_count = 0
    for recipe_key, result_key, rows_key, id_key in (
            ('cmakePatchInputs', 'cmakePatchResult', 'groups', 'group'),
            ('activeVcpkgPatchInputs', 'vcpkgPatchResult', 'ports', 'port')):
        recipes = load(recipe_key)
        require(recipes.get('missingLocalPatchCopies') == [], 'Missing retained ONNX patches')
        wanted = {r[id_key]: r for r in recipes[rows_key] if r['orderedPatches']}
        results = indexed(load(result_key)[rows_key], id_key, 'ONNX ordered patch results')
        exact_set(list(results), list(wanted), 'ONNX ordered patch group coverage')
        for name, recipe in wanted.items():
            result = results[name]
            exact([(p['path'], p['sha256']) for p in result['orderedPatches']],
                  [(p['path'], p['sha256']) for p in recipe['orderedPatches']], 'ONNX ordered patch identities')
            require(all(p.get('checkedAndApplied') is True or p.get('appliedWithUpstreamFlags') is True
                        for p in result['orderedPatches']), 'ONNX patch application failed')
            if id_key == 'group':
                exact(result['sourceInput'], recipe['sourceInput'], 'CMake patch source input')
                source = sources[recipe['sourceInput']]
            else:
                require(len(mappings[name]['sources']) == 1, 'Ambiguous vcpkg patch source')
                source = sources[mappings[name]['sources'][0]]
            exact(result['sourceSha256'], source['sha256'], 'ONNX actual patch source bytes')
            for patch in recipe['orderedPatches']:
                bundle.material('onnx_manifest', patch, path_key='path')
                retain_original(patch['path'], patch['sha256'])
            patch_count += len(recipe['orderedPatches'])
    layout = load('assemblyLayout')
    exact(layout['assemblyPlanSha256'], descriptors['assemblyPlan']['sha256'], 'ONNX complete inventory assembly-plan binding')
    layout_rows = indexed(layout['sources'], 'source', 'ONNX full assembly records')
    exact_set(list(layout_rows), list(sources), 'Complete ONNX logical assembly coverage')
    require(layout.get('fileCollisions') == [] and layout.get('ancestorConflicts') == [], 'ONNX source assembly conflicts')
    digest(layout.get('assembledLayoutSha256'))
    for name, row in sources.items():
        proof = layout_rows[name]
        exact((proof['destination'], proof['archiveSha256']), (row['destination'], row['sha256']), 'ONNX assembly source binding')
        digest(proof['sourceContentLayoutSha256'])
    inventory_desc = {**layout['inventory'], 'file': str(PurePosixPath(descriptors['assemblyLayout']['file']).parent /
                                                        relative(layout['inventory']['file']))}
    parity = load('metadataArchiveParity')
    for source, archive_hash in parity['archiveBindings'].items():
        exact(sources[source]['sha256'], archive_hash, 'ONNX scope metadata archive binding')
    for row in parity['metadataChecks']:
        require(row.get('matchesCompleteArchive') is True, 'ONNX source-scope metadata did not match original archive')
        original_metadata[sources[row['source']]['destination'] + '/' + relative(row['file'])] = digest(row['sha256'])
    check_onnx_inventory(bundle.nested_file('onnx_manifest', inventory_desc), layout, sources, original_metadata)
    integration = load('integrationSnapshot')
    historical_lock = bundle.nested('onnx_manifest', integration['packageLock'])
    exact(integration.get('onnxruntimeVersion'), manifest['onnxruntimeVersion'], 'ONNX npm integration version')
    npm = indexed(integration.get('packages'), 'name', 'ONNX npm integration packages')
    exact_set(list(npm), ['onnxruntime-node', 'onnxruntime-web', 'onnxruntime-common'], 'ONNX npm package family')
    for row in npm.values():
        exact(row['version'], manifest['onnxruntimeVersion'], 'Stable ONNX npm version')
        require(row.get('integrity') and row.get('resolved'), 'Missing npm provenance')
        current = [p for path, p in bundle.get('native_reader_lock')['packages'].items()
                   if path == 'node_modules/' + row['name'] or path.endswith('/node_modules/' + row['name'])]
        require(len(current) == 1, 'ONNX npm family must resolve once in current Reader lock')
        exact({k: current[0].get(k) for k in ('version', 'integrity', 'resolved')},
              {k: row[k] for k in ('version', 'integrity', 'resolved')}, 'ONNX current lock provenance')
        exact({k: historical_lock['packages']['node_modules/' + row['name']].get(k)
               for k in ('version', 'integrity', 'resolved')}, {k: row[k] for k in ('version', 'integrity', 'resolved')},
              'Retained ONNX integration lock provenance')
    return {'archives': len(sources), 'active_vcpkg_ports': len(ports), 'minimum_constraints': constraints,
            'ordered_patch_applications': patch_count}, manifest


def check_onnx_inventory(path, layout, sources, required_files=None):
    require(layout['inventory']['logical_encoding'] == 'canonical-jsonl-utf8-v1', 'Unknown ONNX index encoding')
    total_digest = hashlib.sha256()
    stats = {name: {'digest': hashlib.sha256(), 'count': 0, 'bytes': 0} for name in sources}
    kinds, links = {}, {}
    previous = None
    remaining = dict(required_files or {})
    for row, line in canonical_json_lines(path, ensure_ascii=False):
        name, source = relative(row['path']), row['source']
        require(source in sources, 'Unknown ONNX index archive owner')
        require(previous is None or previous < name, 'ONNX index paths must be sorted and unique')
        previous = name
        exact(name, sources[source]['destination'] + '/' + relative(row['relativePath']), 'ONNX index destination')
        require(row['kind'] in ('file', 'symlink'), 'Unexpected ONNX logical index record kind')
        require(type(row['mode']) is int and 0 <= row['mode'] <= 0o7777, 'Invalid ONNX index mode')
        components = name.split('/')
        for n in range(1, len(components)):
            parent = '/'.join(components[:n])
            require(kinds.get(parent, 'dir') == 'dir', 'ONNX file/symlink ancestor collision')
            kinds[parent] = 'dir'
        require(name not in kinds, 'ONNX file/directory destination collision')
        kinds[name] = row['kind']
        if row['kind'] == 'file':
            digest(row.get('sha256'))
            require(type(row.get('size')) is int and row['size'] >= 0, 'Invalid ONNX file size')
            stats[source]['bytes'] += row['size']
            if name in remaining:
                exact(row['sha256'], remaining.pop(name), 'Original ONNX recipe/patch bytes in complete archive inventory')
        else:
            require(isinstance(row.get('target'), str), 'Missing ONNX symlink target')
            links[name] = row['target']
        stats[source]['count'] += 1
        stats[source]['digest'].update(line)
        total_digest.update(line)
    exact(total_digest.hexdigest(), layout['assembledLayoutSha256'], 'Complete ONNX logical inventory digest')
    require(not remaining, f'Required original ONNX recipe/patch files missing from inventory: {list(remaining)[:3]}')
    exact(total_digest.hexdigest(), layout['inventory']['logical_sha256'], 'ONNX physical index logical hash binding')
    proof_rows = indexed(layout['sources'], 'source', 'ONNX per-source inventory')
    for name, row in stats.items():
        proof = proof_rows[name]
        exact((proof['indexedFilesAndLinks'], proof['regularFileBytes'], proof['sourceContentLayoutSha256']),
              (row['count'], row['bytes'], row['digest'].hexdigest()), 'ONNX per-source complete inventory')
    resolved = resolve_inventory_links(kinds, links)
    exact(layout['symlinks'], resolved, 'ONNX expanded symlink safety')
    exact(layout['danglingLinks'], [r for r in resolved if r['dangling']], 'ONNX explicit dangling links')


def version_key(value):
    pieces = value.split('#')
    require(len(pieces) <= 2 and re.fullmatch(r'\d+(?:[.-]\d+)*', pieces[0]), 'Unsupported vcpkg version ordering')
    return tuple(int(v) for v in re.split('[.-]', pieces[0])), int(pieces[1]) if len(pieces) == 2 else 0


def check_vcpkg_constraints(graph, proof, graph_sha):
    exact(proof.get('graphSha256'), graph_sha, 'Active vcpkg constraint graph hash')
    ports = indexed(graph['ports'], 'name', 'vcpkg version candidates')
    expected = []
    for edge in graph['edges']:
        if 'version>=' not in edge:
            continue
        fields = ports[edge['to']]['versionFields']
        versions = [v for k, v in fields.items() if k in ('version', 'version-semver', 'version-date', 'version-string')]
        require(len(versions) == 1, 'Ambiguous vcpkg candidate version')
        version, port_version = versions[0], fields.get('port-version', 0)
        minimum = edge['version>=']
        require(version_key(version + '#' + str(port_version)) >= version_key(minimum), 'Unsatisfied active vcpkg minimum')
        expected.append({'from': edge['from'], 'to': edge['to'], 'target': edge['target'],
                         'minimum': minimum, 'candidateVersion': version, 'candidatePortVersion': port_version,
                         'satisfied': True})
    exact(proof['constraints'], expected, 'Exact active vcpkg minimum constraints')
    return len(expected)


def check_parts(bundle, runtime, onnx, parts_dir=None):
    expected = {}
    local_reports = []
    for desc in bundle.data.get('part_verifications', []):
        report = read_json(bundle.verify_file(desc))
        require(report.get('passed') is True, 'Prior local source-part validation failed')
        local_reports.extend(report.get('parts', []))
    runtime_parts = indexed(runtime['parts'], 'file', 'runtime parts')
    exact_set(list(runtime_parts), list({r['part'] for r in runtime['sources']}), 'Runtime part assignment')
    results = []
    for name, part in runtime_parts.items():
        filename(name)
        records = sorted(({k: v for k, v in row.items() if k != 'part'} for row in runtime['sources']
                          if row['part'] == name), key=lambda r: r['archive'])
        required = {'part': name, 'verification': 'local-outer-and-inner-rehashed',
                    'bytes': part['size'], 'sha256': part['sha256'], 'source_count': len(records),
                    'database_archive_records_sha256': canonical_digest(records)}
        matches = [r for r in local_reports if r.get('part') == name and
                   r.get('verification') == 'local-outer-and-inner-rehashed']
        require(matches, f'Missing prior full outer/inner rehash proof: {name}')
        for match in matches:
            exact({k: match.get(k) for k in required}, required, f'Local runtime part hash chain {name}')
        members = {'archives/' + filename(r['archive']): {'bytes': r['size'], 'sha256': r['sha256']}
                   for r in records}
        if parts_dir is not None and ((parts_dir / name).exists() or (parts_dir / name).is_symlink()):
            check_local_zip(parts_dir / name, part['size'], part['sha256'], members,
                            extra_member='PART-MANIFEST.json', embedded_records=records)
            mode = 'local-outer-and-inner-rehashed'
        else:
            mode = 'hash-bound-prior-local-outer-and-inner-rehash'
        expected[name] = {'file': name, 'size': part['size'], 'sha256': part['sha256']}
        results.append({'part': name, 'verification': mode})
    for part in onnx['parts']:
        name = filename(part['file'])
        require(name not in expected, 'Duplicate source part name')
        proof = bundle.nested('onnx_manifest', part['verification'])
        members_manifest = bundle.nested('onnx_manifest', part['fileManifest'])
        exact(proof.get('manifestSha256'), part['fileManifest']['sha256'], 'ONNX local member manifest binding')
        exact((proof.get('bytes'), proof.get('sha256')), (part['bytes'], part['sha256']), 'ONNX prior local part identity')
        require(all(proof.get(key) is True for key in ('zipFullCrcPassed', 'everyMemberSha256Passed', 'explicitInputAllowlistPassed')),
                'Prior ONNX full member verification required')
        files = indexed(members_manifest['files'], 'file', 'ONNX part member manifest')
        source_rows = {r['archive']: r for r in onnx['sources'] if r['part'] == name}
        exact_set([f for f in files if f.startswith('archives/')], list(source_rows), 'ONNX source part inner membership')
        prefix = part['prefix']
        require(prefix.endswith('/') and relative(prefix[:-1]), 'Invalid ONNX part prefix')
        for file, source in source_rows.items():
            exact((files[file]['bytes'], files[file]['sha256']), (source['bytes'], source['sha256']), 'ONNX inner archive integrity')
            exact(source['member'], prefix + file, 'ONNX source ZIP member identity')
        members = {prefix + f: {'bytes': r['bytes'], 'sha256': r['sha256']} for f, r in files.items()}
        embedded_name = prefix + filename(Path(part['fileManifest']['file']).name)
        members[embedded_name] = {k: part['fileManifest'][k] for k in ('bytes', 'sha256')}
        exact(proof.get('zipMembers'), len(members), 'ONNX prior local member coverage')
        if parts_dir is not None and ((parts_dir / name).exists() or (parts_dir / name).is_symlink()):
            check_local_zip(parts_dir / name, part['bytes'], part['sha256'], members)
            mode = 'local-outer-and-inner-rehashed'
        else:
            mode = 'hash-bound-prior-local-outer-and-inner-rehash'
        expected[name] = {'file': name, 'size': part['bytes'], 'sha256': part['sha256']}
        results.append({'part': name, 'verification': mode})
    return results


def check_local_zip(path, size, sha256, members, extra_member=None, embedded_records=None):
    require(not path.is_symlink() and path.is_file(), f'Local source part is not an ordinary file: {path.name}')
    require(path.stat().st_size == size and digest_file(path) == digest(sha256),
            f'Corrupt local source part (remote fallback refused): {path.name}')
    with zipfile.ZipFile(path) as archive:
        names = [item.filename for item in archive.infolist()]
        exact_set(names, [*members, *([extra_member] if extra_member else [])], 'Local ZIP member coverage')
        for item in archive.infolist():
            require(not item.is_dir() and stat.S_IFMT(item.external_attr >> 16) in (0, stat.S_IFREG)
                    and not item.flag_bits & 1 and item.compress_type == zipfile.ZIP_STORED,
                    'Unexpected source-part ZIP member type or compression')
            if item.filename == extra_member:
                require(item.file_size <= 32 * 1024 * 1024, 'Oversized embedded source manifest')
                embedded = json.loads(archive.read(item), object_pairs_hook=unique_object)
                exact(embedded.get('part'), path.name, 'Embedded source part identity')
                exact(sorted(embedded.get('sources', []), key=lambda r: r['archive']), embedded_records,
                      'Embedded runtime archive identities')
                continue
            record = members[item.filename]
            require(item.file_size == record['bytes'], 'Source-part member size mismatch')
            result = hashlib.sha256()
            with archive.open(item) as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b''):
                    result.update(block)
            exact(result.hexdigest(), digest(record['sha256']), 'Source-part member SHA-256')


def reconcile_remote(snapshot, expected_assets, repository, release_id, tag, commit, now=None):
    now = now or datetime.now(timezone.utc)
    require(snapshot.get('repository') == repository, 'Remote snapshot repository mismatch')
    checked = datetime.fromisoformat(snapshot['checked_at'].replace('Z', '+00:00'))
    require(checked.tzinfo is not None and 0 <= (now-checked).total_seconds() <= 900,
            'Remote API snapshot is stale or in the future')
    release = snapshot['release']
    exact((release.get('id'), release.get('tag_name')), (release_id, tag), 'Final release identity')
    exact(release.get('url'), f'https://api.github.com/repos/{repository}/releases/{release_id}', 'Release API URL')
    exact(snapshot.get('tag_commit'), commit, 'Tagged source revision')
    require(re.fullmatch('[0-9a-f]{40}', commit), 'Expected full tagged commit required')
    require(type(release.get('draft')) is bool, 'Remote release draft/public state missing')
    download_tag = tag
    if release['draft']:
        html = urllib.parse.urlsplit(release.get('html_url', ''))
        prefix = f'/{repository}/releases/tag/'
        require(html.scheme == 'https' and html.netloc == 'github.com' and not html.query and not html.fragment and
                html.path.startswith(prefix), 'Draft release HTML identity mismatch')
        download_tag = urllib.parse.unquote(html.path[len(prefix):])
        require(download_tag == tag or re.fullmatch(r'untagged-[0-9a-f]+', download_tag), 'Unexpected draft download route')
    expected = indexed(expected_assets, 'file', 'expected release assets')
    assets = indexed(snapshot['assets'], 'name', 'remote release assets')
    exact_set(list(assets), list(expected), 'Final remote asset set')
    ids = []
    for name, row in expected.items():
        asset = assets[name]
        require(type(asset.get('id')) is int and asset['id'] > 0, 'Invalid remote asset ID')
        ids.append(asset['id'])
        exact((asset.get('state'), asset.get('size'), asset.get('digest')),
              ('uploaded', row['size'], 'sha256:' + digest(row['sha256'])), f'Remote asset integrity {name}')
        exact(asset.get('url'), f'https://api.github.com/repos/{repository}/releases/assets/{asset["id"]}', 'Remote asset URL')
        exact(asset.get('browser_download_url'), f'https://github.com/{repository}/releases/download/{urllib.parse.quote(download_tag, safe="")}/{urllib.parse.quote(name, safe="")}', 'Remote download identity')
    require(len(ids) == len(set(ids)), 'Duplicate remote asset ID')
    return {'asset_count': len(assets), 'checked_at': snapshot['checked_at'],
            'evidence': 'GitHub API size/digest metadata; remote bytes not downloaded or rehashed'}


def reconcile_ledger(ledger, source_assets, bundle_sha, commit):
    require(ledger.get('schema_version') == 1, 'Unsupported final asset ledger schema')
    exact(ledger.get('source_commit'), commit, 'Final asset ledger source commit')
    exact(ledger.get('source_bundle_sha256'), bundle_sha, 'Final asset ledger source-bundle hash')
    declared_sources = indexed(ledger.get('source_assets'), 'name', 'ledger source assets')
    required_sources = indexed(source_assets, 'name', 'derived source assets')
    exact(declared_sources, required_sources, 'Final ledger exact source asset set')
    assets = indexed(ledger.get('assets'), 'name', 'final ledger assets')
    for name, source in required_sources.items():
        require(name in assets, f'Required source asset missing from final ledger: {name}')
        exact({k: assets[name].get(k) for k in ('name', 'bytes', 'sha256')}, source, 'Final ledger source asset identity')
    for name, row in assets.items():
        filename(name)
        digest(row.get('sha256'))
        require(type(row.get('bytes')) is int and row['bytes'] > 0, 'Invalid final ledger asset size')
    return [{'file': r['name'], 'size': r['bytes'], 'sha256': r['sha256']} for r in assets.values()]


def check_metadata_assets(bundle):
    assets = bundle.data.get('source_metadata_assets')
    require(isinstance(assets, list) and assets, 'Final source metadata companion asset is required')
    required = indexed(bundle.data.get('metadata_required_files'), 'file', 'published metadata member descriptors')
    require(required, 'Complete source metadata member allowlist is required')
    for name, desc in required.items():
        relative(name)
        digest(desc.get('sha256'))
        require(type(desc.get('bytes')) is int and desc['bytes'] >= 0, 'Invalid published metadata member length')
    asset_names = [filename(a['file']) for a in assets]
    require(len(asset_names) == len(set(asset_names)), 'Duplicate metadata companion asset')
    for key in ('runtime_manifest', 'runtime_assembly', 'onnx_manifest'):
        require(bundle.inputs[key]['file'] in required, f'Final {key} omitted from source metadata companion')
    for desc in bundle.files.values():
        if desc['file'] in required:
            exact((required[desc['file']]['bytes'], required[desc['file']]['sha256']),
                  (desc['bytes'], desc['sha256']), 'Published metadata differs from consumed proof bytes')
        if desc.get('storage') == 'metadata' and Path(desc['file']).name not in asset_names:
            require(desc['file'] in required, f'Consumed full metadata proof omitted from published companion: {desc["file"]}')
    found = set()
    result = []
    for item in assets:
        matches = [d for d in bundle.files.values() if Path(d['file']).name == item['file'] and
                   d['bytes'] == item['size'] and d['sha256'] == item['sha256']]
        require(len(matches) == 1, 'Source metadata companion bytes must be hash-verified')
        path = bundle.verify_file(matches[0])
        with zipfile.ZipFile(path) as archive:
            for info in archive.infolist():
                name = relative(info.filename)
                require(name not in found and name in required, 'Duplicate/unexpected source metadata ZIP member')
                require(not info.is_dir() and stat.S_IFMT(info.external_attr >> 16) in (0, stat.S_IFREG) and
                        not info.flag_bits & 1, 'Unexpected metadata ZIP entry representation')
                found.add(name)
                row = required[name]
                require(info.file_size == row['bytes'], 'Metadata ZIP member size mismatch')
                value = hashlib.sha256()
                with archive.open(info) as stream:
                    for block in iter(lambda: stream.read(1024 * 1024), b''):
                        value.update(block)
                exact(value.hexdigest(), row['sha256'], 'Published metadata ZIP member hash')
        result.append({'name': item['file'], 'bytes': item['size'], 'sha256': item['sha256']})
    exact(found, set(required), 'Complete published source metadata membership')
    return result


def verify(bundle, parts_dir=None, snapshot=None, release_id=None, tag=None, commit=None, ledger=None, historical_snapshot=None):
    validators = indexed(bundle.data.get('validator_files'), 'file', 'source verifier implementations')
    expected_validators = (Path(__file__).name, 'verify-native-source-scope.py')
    exact_set(list(validators), list(expected_validators), 'Exact source verifier implementation set')
    for name, descriptor in validators.items():
        exact(bundle.verify_file(descriptor).resolve(), Path(__file__).resolve().with_name(name),
              'Bundle must bind the actual executing source verifier')
    runtime_result, runtime = check_runtime(bundle)
    helper = Path(__file__).with_name('verify-native-source-scope.py')
    require(helper.is_file() and not helper.is_symlink(), 'Native source-scope verifier is missing')
    spec = importlib.util.spec_from_file_location('threadshelf_native_source_scope', helper)
    native = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(native)
    native_result = native.check_native_scope(bundle, runtime['sources'], historical_snapshot)
    onnx_result, onnx = check_onnx(bundle)
    parts = check_parts(bundle, runtime, onnx, parts_dir)
    source_assets = [{'name': p['file'], 'bytes': p['size'], 'sha256': p['sha256']} for p in runtime['parts']]
    source_assets += [{'name': p['file'], 'bytes': p['bytes'], 'sha256': p['sha256']} for p in onnx['parts']]
    source_assets += check_metadata_assets(bundle)
    indexed(source_assets, 'name', 'source release assets')
    report = {'schema_version': 1, 'collection_verified': True, 'publication_ready': False,
              'bundle_sha256': digest_file(bundle.path), 'runtime': runtime_result,
              'validator_files': [{k: validators[name][k] for k in ('file', 'bytes', 'sha256')} for name in expected_validators],
              'source_commit': None, 'source_assets': source_assets,
              'onnx': onnx_result, 'native': native_result, 'parts': parts,
              'scope': 'Exact source coverage and integrity evidence; no binary rebuild or legal judgment.'}
    if snapshot is not None:
        require(release_id and tag and commit and ledger, 'Publication needs explicit release ID, tag, commit and final asset ledger')
        require(historical_snapshot is not None, 'Publication needs fresh availability proof for the reused historical native source asset')
        assets = reconcile_ledger(ledger, source_assets, report['bundle_sha256'], commit)
        report['remote'] = reconcile_remote(snapshot, assets,
                                            bundle.data['repository'], release_id, tag, commit)
        report['source_commit'] = commit
        report['publication_ready'] = True
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle', required=True, type=Path)
    parser.add_argument('--parts-dir', type=Path)
    parser.add_argument('--metadata-dir', type=Path, help='Extracted companion metadata for descriptors marked storage=metadata')
    parser.add_argument('--remote-snapshot', type=Path)
    parser.add_argument('--asset-ledger', type=Path, help='External post-tag complete asset ledger, required for publication')
    parser.add_argument('--historical-snapshot', type=Path, help='Fresh API snapshot for the unchanged reused native source companion')
    parser.add_argument('--release-id', type=int)
    parser.add_argument('--tag')
    parser.add_argument('--commit')
    parser.add_argument('--output', type=Path, help='Write successful report atomically; failure never overwrites it')
    args = parser.parse_args(argv)
    try:
        bundle = Bundle(args.bundle, args.metadata_dir)
        result = verify(bundle, args.parts_dir, read_json(args.remote_snapshot) if args.remote_snapshot else None,
                        args.release_id, args.tag, args.commit,
                        read_json(args.asset_ledger) if args.asset_ledger else None,
                        read_json(args.historical_snapshot) if args.historical_snapshot else None)
        text = json.dumps(result, indent=2) + '\n'
        if args.output:
            require(not args.output.is_symlink(), 'Output report symlink refused')
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=args.output.parent,
                                             prefix=args.output.name+'.', suffix='.tmp', delete=False) as stream:
                temporary = Path(stream.name)
                stream.write(text)
            try:
                os.replace(temporary, args.output)
            finally:
                temporary.unlink(missing_ok=True)
        print(text, end='')
        return 0
    except (OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile) as error:
        print(json.dumps({'collection_verified': False, 'publication_ready': False, 'error': str(error)}, indent=2))
        return 1


if __name__ == '__main__':
    sys.exit(main())
