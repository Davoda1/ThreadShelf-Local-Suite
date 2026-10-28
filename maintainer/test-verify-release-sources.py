#!/usr/bin/env python3
"""Offline adversarial fixtures for the source publication guard."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import warnings
import zipfile

SPEC = importlib.util.spec_from_file_location('source_guard', Path(__file__).with_name('verify-release-sources.py'))
guard = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(guard)
H = 'a' * 64


class FakeBundle:
    def __init__(self, values):
        self.values = values

    def get(self, key):
        return self.values[key]

    def sha(self, key):
        return guard.canonical_digest(self.values[key])

    def material(self, *args, **kwargs):
        raise AssertionError('Unexpected fixture material lookup')


def git_fixture():
    revisions = {'electron': '1'*40, 'chromium': '2'*40, 'node': '3'*40}
    seeds = []
    for name, revision in revisions.items():
        url = (f'https://chromium.googlesource.com/chromium/src/+archive/{revision}.tar.gz'
               if name == 'chromium' else f'https://codeload.github.com/electron/electron/tar.gz/{revision}')
        seeds.append({'id': name, 'revision': revision, 'archive': f'{name}-{revision}.tar.gz', 'archive_url': url})
    rows = [
        {'path': 'src', 'enabled': True, 'url': 'https://chromium.googlesource.com/chromium/src.git@156.0.0'},
        {'path': 'src/third_party/electron_node', 'enabled': True, 'url': 'https://github.com/nodejs/node.git@v24.0.0'},
        {'path': 'src/library', 'enabled': True, 'url': 'https://github.com/example/library.git@'+'4'*40},
    ]
    inventory = {'targets': [{'target': target, 'dependencies': deepcopy(rows), 'selected_git': deepcopy(rows)}
                             for target in ('linux', 'win')]}
    return inventory, {'source_seeds': seeds}


def patch_fixture():
    original = {'bytes': 1, 'mode': 420, 'sha256': '1'*64}
    changed = {'bytes': 2, 'mode': 420, 'sha256': '2'*64}
    added = {'bytes': 3, 'mode': 493, 'sha256': '3'*64}
    recipe = {'electron_revision': 'a'*40, 'seed_sha256': '6'*64, 'retained_inputs': [], 'required_paths': ['src/a', 'src/new'],
              'records': [
                  {'ordinal': 1, 'repository': 'src', 'patch': 'modify.patch', 'sha256': '4'*64,
                   'diffs': [{'path': 'src/a', 'operation': 'modify'}]},
                  {'ordinal': 2, 'repository': 'src', 'patch': 'add.patch', 'sha256': '5'*64,
                   'diffs': [{'path': 'src/new', 'operation': 'add'}]},
              ]}
    plan = [{'path': 'src', 'revision': 'a'*40}]
    result = {'electron_revision': 'a'*40, 'status': 'all-ordered-patches-applied',
              'recipe_sha256': guard.canonical_digest(recipe), 'plan_sha256': guard.canonical_digest(plan),
              'applied_patches': [
                  {'ordinal': 1, 'repository': 'src', 'patch': 'modify.patch', 'patch_sha256': '4'*64,
                   'before': {'src/a': original}, 'after': {'src/a': changed},
                   'commands': [{'phase': 'check', 'exit_code': 0}, {'phase': 'apply', 'exit_code': 0}]},
                  {'ordinal': 2, 'repository': 'src', 'patch': 'add.patch', 'patch_sha256': '5'*64,
                   'before': {'src/new': None}, 'after': {'src/new': added},
                   'commands': [{'phase': 'check', 'exit_code': 0}, {'phase': 'apply', 'exit_code': 0}]},
              ], 'final_touched_paths': {'src/a': changed, 'src/new': added},
              'initially_absent_paths': ['src/new'], 'source_archive_coverage': {'owner_archives': ['src.tar.gz', 'electron.tar.gz']}}
    bundle = FakeBundle({'patch_recipe': recipe, 'patch_result': result, 'git_plan': plan})
    accepted = {'src.tar.gz': {'archive': 'src.tar.gz', 'path': 'src'},
                'electron.tar.gz': {'archive': 'electron.tar.gz', 'path': 'src/electron', 'revision': 'a'*40, 'sha256': '6'*64}}
    assembly = {'initial_patch_paths': {'src/a': original, 'src/new': None}}
    return bundle, accepted, assembly


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def rejects(self, function, *args):
        with self.assertRaises(guard.GuardError):
            function(*args)

    def test_duplicate_json_key_rejected(self):
        path = self.root/'proof.json'
        path.write_text('{"passed":false,"passed":true}')
        self.rejects(guard.read_json, path)

    def test_paths_cannot_escape_or_alias(self):
        for path in ('../proof', '/proof', 'a/../proof', 'C:proof', 'a\\b', './proof', 'a//b', '.'):
            with self.subTest(path=path):
                self.rejects(guard.relative, path)

    def make_bundle(self, descriptor):
        path = self.root/'bundle.json'
        path.write_text(json.dumps({'schema_version': 1, 'inputs': {'proof': descriptor}}))
        return path

    def test_hash_bound_file_mutation_rejected(self):
        path = self.root/'proof.json'; path.write_text('{}')
        desc = {'file': path.name, 'bytes': 2, 'sha256': guard.digest_file(path)}
        bundle = self.make_bundle(desc)
        self.assertEqual(guard.Bundle(bundle).get('proof'), {})
        path.write_text('[]')
        self.rejects(guard.Bundle, bundle)

    def test_external_metadata_requires_explicit_directory(self):
        metadata = self.root/'metadata'; metadata.mkdir()
        path = metadata/'proof.json'; path.write_text('{}')
        bundle = self.make_bundle({'file': 'proof.json', 'bytes': 2, 'sha256': guard.digest_file(path), 'storage': 'metadata'})
        self.rejects(guard.Bundle, bundle)
        self.assertEqual(guard.Bundle(bundle, metadata).get('proof'), {})

    def test_symlink_proof_rejected(self):
        real = self.root/'real'; real.write_text('{}')
        (self.root/'proof').symlink_to(real)
        bundle = self.make_bundle({'file': 'proof', 'bytes': 2, 'sha256': guard.digest_file(real)})
        self.rejects(guard.Bundle, bundle)

    def test_authoritative_git_union(self):
        inventory, seeds = git_fixture()
        result = guard.derive_git_sources(inventory, seeds)
        self.assertEqual(set(result), {'src', 'src/electron', 'src/third_party/electron_node', 'src/library'})
        self.assertEqual(result['src']['revision'], '2'*40)
        self.assertEqual(result['src/library']['targets'], ['linux', 'win'])

    def test_same_count_duplicate_checkout_rejected(self):
        inventory, seeds = git_fixture()
        for key in ('dependencies', 'selected_git'):
            inventory['targets'][0][key][2] = deepcopy(inventory['targets'][0][key][1])
        self.rejects(guard.derive_git_sources, inventory, seeds)

    def test_cross_target_revision_substitution_rejected(self):
        inventory, seeds = git_fixture()
        for key in ('dependencies', 'selected_git'):
            inventory['targets'][1][key][2]['url'] = 'https://github.com/example/library.git@'+'5'*40
        self.rejects(guard.derive_git_sources, inventory, seeds)

    def test_selected_git_omission_rejected(self):
        inventory, seeds = git_fixture()
        inventory['targets'][0]['selected_git'].pop()
        self.rejects(guard.derive_git_sources, inventory, seeds)

    def test_self_consistent_single_part_cannot_claim_complete_runtime(self):
        inventory, seed = git_fixture()
        inventory['electron'] = '45.1.0'
        for target in inventory['targets']:
            target['parsed'] = []
        profile_name = 'electron-v8-x64-pinned.profile'
        seed.update(suite_version='1.3.0', electron_version='45.1.0', provenance_inputs=[],
                    release_profiles=[{'file': profile_name, 'expected_sha256': H, 'url': 'https://example.invalid/'+profile_name}])
        plan = list(guard.derive_git_sources(inventory, seed).values())
        parser = {'input_sha256': {'deps-45.1-inventory.json': guard.canonical_digest(inventory)}, 'deps_inputs': [],
                  'targets': [{'target': t['target'], 'dependencies': len(t['dependencies']),
                               'selected_git': len(t['selected_git']), 'all_rows_equal': True} for t in inventory['targets']]}
        marker = (profile_name+'\n').encode()
        profile = {'archive': 'profiles.tar.gz', 'source_files': [
            {'file': profile_name, 'archive_member': 'electron-v8-builtins.profile', 'sha256': H,
             'url': 'https://example.invalid/'+profile_name},
            {'archive_member': 'electron-v8-builtins.profile.version', 'size': len(marker),
             'sha256': hashlib.sha256(marker).hexdigest()}]}
        manifest = {'schema_version': 2, 'collection_complete': True, 'part_count': 1, 'source_count': 1,
                    'parts': [{'file': 'part01.zip', 'size': 100, 'sha256': H}],
                    'sources': [{**plan[0], 'part': 'part01.zip', 'size': 50, 'sha256': H}]}
        bundle = FakeBundle({'seed': seed, 'deps_inventory': inventory, 'deps_parser_proof': parser,
                             'git_plan': plan, 'supplemental_manifest': {'sources': []},
                             'supplemental_validation': {'archives': []}, 'profiles': profile,
                             'runtime_manifest': manifest})
        bundle.data = {'version': '1.3.0', 'electron_version': '45.1.0'}
        with self.assertRaisesRegex(guard.GuardError, 'Complete runtime archive coverage'):
            guard.check_runtime(bundle)

    def test_nested_conditions_and_constant_string(self):
        values = {'host_os': 'linux', 'checkout_linux': True, 'expr': 'checkout_linux and host_os == "linux"'}
        self.assertTrue(guard.condition_value('expr', values, ['host_os']))
        self.assertFalse(guard.condition_value('not expr', values, ['host_os']))
        self.rejects(guard.condition_value, '__import__("os")', values, ['host_os'])
        self.rejects(guard.condition_value, 'missing', values, ['host_os'])
        self.rejects(guard.condition_value, 'recursive', {'recursive': 'recursive'}, [])

    def test_patch_added_file_absence_is_valid(self):
        self.assertEqual(guard.check_electron_patches(*patch_fixture()), 2)

    def test_patch_same_count_reordering_rejected(self):
        bundle, accepted, assembly = patch_fixture()
        bundle.values['patch_result']['applied_patches'].reverse()
        self.rejects(guard.check_electron_patches, bundle, accepted, assembly)

    def test_patch_stale_recipe_hash_rejected(self):
        bundle, accepted, assembly = patch_fixture()
        bundle.values['patch_result']['recipe_sha256'] = H
        self.rejects(guard.check_electron_patches, bundle, accepted, assembly)

    def test_patch_failed_apply_not_overridden_by_status(self):
        bundle, accepted, assembly = patch_fixture()
        bundle.values['patch_result']['applied_patches'][1]['commands'][1]['exit_code'] = 1
        self.rejects(guard.check_electron_patches, bundle, accepted, assembly)

    def test_patch_source_hash_continuity_required(self):
        bundle, accepted, assembly = patch_fixture()
        bundle.values['patch_result']['applied_patches'][0]['before']['src/a'] = {'bytes': 1, 'mode': 420, 'sha256': H}
        self.rejects(guard.check_electron_patches, bundle, accepted, assembly)

    def test_patch_missing_owner_or_unproven_absence_rejected(self):
        for mutation in ('owner', 'absence', 'initial'):
            bundle, accepted, assembly = patch_fixture()
            if mutation == 'owner': bundle.values['patch_result']['source_archive_coverage']['owner_archives'] = []
            if mutation == 'absence': bundle.values['patch_result']['initially_absent_paths'] = []
            if mutation == 'initial': assembly['initial_patch_paths'].pop('src/new')
            with self.subTest(mutation=mutation):
                self.rejects(guard.check_electron_patches, bundle, accepted, assembly)

    def constraint_fixture(self):
        graph = {'ports': [{'name': 'lib', 'versionFields': {'version': '2.3.0', 'port-version': 1}}],
                 'edges': [{'from': 'onnxruntime', 'to': 'lib', 'target': 'linux-x64', 'version>=': '2.3.0#1'}]}
        proof = {'graphSha256': H, 'constraints': [{'from': 'onnxruntime', 'to': 'lib', 'target': 'linux-x64',
                 'minimum': '2.3.0#1', 'candidateVersion': '2.3.0', 'candidatePortVersion': 1, 'satisfied': True}]}
        return graph, proof

    def test_exact_active_constraint_success(self):
        graph, proof = self.constraint_fixture()
        self.assertEqual(guard.check_vcpkg_constraints(graph, proof, H), 1)

    def test_stale_missing_or_unsatisfied_constraints_rejected(self):
        for mutation in ('stale', 'missing', 'lower'):
            graph, proof = self.constraint_fixture()
            if mutation == 'stale': proof['graphSha256'] = 'b'*64
            if mutation == 'missing': proof['constraints'] = []
            if mutation == 'lower': graph['ports'][0]['versionFields']['port-version'] = 0
            with self.subTest(mutation=mutation):
                self.rejects(guard.check_vcpkg_constraints, graph, proof, H)

    def zip_fixture(self, extra=False, duplicate=False, compressed=False):
        path = self.root/'part.zip'
        data = b'exact preserved source archive bytes'
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)
            with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED if compressed else zipfile.ZIP_STORED) as archive:
                archive.writestr('archives/source.tar.gz', data)
                if extra: archive.writestr('unexpected', b'')
                if duplicate: archive.writestr('archives/source.tar.gz', data)
        members = {'archives/source.tar.gz': {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}}
        return path, path.stat().st_size, guard.digest_file(path), members

    def test_local_full_outer_and_inner_rehash(self):
        guard.check_local_zip(*self.zip_fixture())

    def test_present_corrupt_part_never_falls_back(self):
        args = self.zip_fixture()
        args[0].write_bytes(b'bad')
        self.rejects(guard.check_local_zip, *args)

    def test_inner_archive_substitution_rejected(self):
        args = self.zip_fixture()
        args[3]['archives/source.tar.gz']['sha256'] = H
        self.rejects(guard.check_local_zip, *args)

    def test_zip_duplicates_extra_and_compression_rejected(self):
        for option in ('extra', 'duplicate', 'compressed'):
            with self.subTest(option=option):
                self.rejects(guard.check_local_zip, *self.zip_fixture(**{option: True}))

    def test_symlink_local_part_rejected(self):
        args = self.zip_fixture()
        link = self.root/'link.zip'; link.symlink_to(args[0])
        self.rejects(guard.check_local_zip, link, *args[1:])

    def remote_fixture(self):
        repository = 'owner/repository'; tag = 'v1.3.0'; commit = 'f'*40
        now = datetime(2026, 10, 28, tzinfo=timezone.utc)
        asset = {'id': 42, 'name': 'Sources.zip', 'state': 'uploaded', 'size': 100, 'digest': 'sha256:'+H,
                 'url': f'https://api.github.com/repos/{repository}/releases/assets/42',
                 'browser_download_url': f'https://github.com/{repository}/releases/download/{tag}/Sources.zip'}
        snapshot = {'repository': repository, 'checked_at': now.isoformat(), 'tag_commit': commit,
                    'release': {'id': 7, 'tag_name': tag, 'draft': False, 'url': f'https://api.github.com/repos/{repository}/releases/7'},
                    'assets': [asset]}
        return snapshot, [{'file': 'Sources.zip', 'size': 100, 'sha256': H}], repository, 7, tag, commit, now

    def test_fresh_exact_remote_snapshot(self):
        result = guard.reconcile_remote(*self.remote_fixture())
        self.assertEqual(result['asset_count'], 1)
        self.assertIn('not downloaded', result['evidence'])

    def test_draft_route_is_allowed_only_before_publication(self):
        args = self.remote_fixture(); snapshot = args[0]
        snapshot['release']['draft'] = True
        snapshot['release']['html_url'] = 'https://github.com/owner/repository/releases/tag/untagged-123abc'
        snapshot['assets'][0]['browser_download_url'] = 'https://github.com/owner/repository/releases/download/untagged-123abc/Sources.zip'
        guard.reconcile_remote(*args)
        snapshot['release']['draft'] = False
        self.rejects(guard.reconcile_remote, *args)

    def test_external_ledger_has_no_commit_self_reference(self):
        sources = [{'name': 'Sources.zip', 'bytes': 100, 'sha256': H}]
        ledger = {'schema_version': 1, 'source_commit': 'f'*40, 'source_bundle_sha256': 'b'*64,
                  'source_assets': deepcopy(sources), 'assets': [*deepcopy(sources),
                  {'name': 'App.zip', 'bytes': 200, 'sha256': 'c'*64}]}
        self.assertEqual(len(guard.reconcile_ledger(ledger, sources, 'b'*64, 'f'*40)), 2)
        for mutation in ('missing', 'stale_bundle', 'wrong_commit', 'source_subset'):
            bad = deepcopy(ledger)
            if mutation == 'missing': bad['assets'].pop(0)
            if mutation == 'stale_bundle': bad['source_bundle_sha256'] = 'd'*64
            if mutation == 'wrong_commit': bad['source_commit'] = 'e'*40
            if mutation == 'source_subset': bad['source_assets'] = []
            with self.subTest(mutation=mutation):
                self.rejects(guard.reconcile_ledger, bad, sources, 'b'*64, 'f'*40)

    def test_source_symlink_expansion_and_cycles(self):
        kinds = {'src': 'dir', 'src/a': 'dir', 'src/b': 'dir', 'src/b/file': 'file',
                 'src/a/link': 'symlink', 'src/jump': 'symlink'}
        links = {'src/a/link': '../b/file', 'src/jump': 'a/link'}
        result = guard.resolve_inventory_links(kinds, links)
        self.assertTrue(all(r['resolved'] == 'src/b/file' and not r['dangling'] for r in result))
        self.rejects(guard.resolve_inventory_links, kinds, {'src/jump': '../..'})
        self.rejects(guard.resolve_inventory_links, kinds, {'src/jump': 'jump'})
        self.rejects(guard.resolve_inventory_links, kinds, {'src/jump': 'b/file/child'})

    def write_index(self, rows, ascii=True):
        data = b''.join(json.dumps(r, sort_keys=True, separators=(',', ':'), ensure_ascii=ascii).encode()+b'\n' for r in rows)
        path = self.root/'inventory.jsonl.gz'
        path.write_bytes(gzip.compress(data, mtime=0))
        return path, data

    def git_index_fixture(self):
        contents = b'source\n'
        oid = hashlib.sha1(b'blob 7\0'+contents).hexdigest()
        blob = {'type': 'blob', 'path': 'file', 'mode': '100644', 'sha1': oid,
                'size': len(contents), 'sha256': hashlib.sha256(contents).hexdigest()}
        entry = {'name': 'file', 'mode': '100644', 'sha1': oid}
        tree_bytes = b'100644 file\0'+bytes.fromhex(oid)
        tree_id = hashlib.sha1(b'tree '+str(len(tree_bytes)).encode()+b'\0'+tree_bytes).hexdigest()
        header = {'type': 'header', 'schema_version': 1, 'repository': 'https://example.googlesource.com/lib',
                  'revision': 'a'*40, 'archive_sha256': H, 'archive_bytes': 100, 'root_git_tree': tree_id}
        tree = {'type': 'tree', 'path': '', 'sha1': tree_id, 'entries': [entry]}
        rows = [header, blob, tree]
        path, data = self.write_index(rows)
        legacy = (json.dumps(['file', '100644', oid, len(contents), blob['sha256']],separators=(',', ':'))+'\n').encode()
        proof = {k: header[k] for k in ('repository', 'revision', 'archive_sha256', 'archive_bytes', 'root_git_tree')}
        proof.update({'source_inventory': {'jsonl_sha256': hashlib.sha256(data).hexdigest(), 'jsonl_bytes': len(data), 'records': len(rows)},
                      'source_blob_inventory_sha256': hashlib.sha256(legacy).hexdigest(), 'blob_count': 1, 'git_tree_count': 1, 'gitlinks': []})
        return path, proof, rows

    def test_full_git_inventory_reconstructs_immutable_root(self):
        path, proof, rows = self.git_index_fixture()
        self.assertIn('', guard.check_git_inventory(path, proof))

    def test_raw_git_commit_binds_exact_revision_and_reconstructed_tree(self):
        tree = 'a'*40
        payload = ('tree '+tree+'\nauthor Source <source@example.invalid> 0 +0000\n'
                   'committer Source <source@example.invalid> 0 +0000\n\nsource update\n').encode()
        revision = hashlib.sha1(b'commit '+str(len(payload)).encode()+b'\0'+payload).hexdigest()
        guard.check_git_commit_object(payload, revision, tree)
        self.rejects(guard.check_git_commit_object, payload+b'changed', revision, tree)
        self.rejects(guard.check_git_commit_object, payload, revision, 'b'*40)
        duplicate = payload.replace(b'\nauthor ', ('\ntree '+tree+'\nauthor ').encode())
        oid = hashlib.sha1(b'commit '+str(len(duplicate)).encode()+b'\0'+duplicate).hexdigest()
        self.rejects(guard.check_git_commit_object, duplicate, oid, tree)

    def test_self_consistent_git_index_cannot_omit_root_child(self):
        path, proof, rows = self.git_index_fixture()
        rows[-1]['entries'] = []
        path, data = self.write_index(rows)
        proof['source_inventory'].update(jsonl_sha256=hashlib.sha256(data).hexdigest(), jsonl_bytes=len(data))
        self.rejects(guard.check_git_inventory, path, proof)

    def test_git_blob_inventory_hash_is_recomputed(self):
        path, proof, rows = self.git_index_fixture()
        rows[1]['sha256'] = 'c'*64
        path, data = self.write_index(rows)
        proof['source_inventory'].update(jsonl_sha256=hashlib.sha256(data).hexdigest(), jsonl_bytes=len(data))
        self.rejects(guard.check_git_inventory, path, proof)

    def test_onnx_inventory_binds_recipe_bytes_and_archive_set(self):
        row = {'path': 'onnxruntime/cmake/recipe.cmake', 'source': 'onnxruntime',
               'relativePath': 'cmake/recipe.cmake', 'kind': 'file', 'mode': 420, 'size': 3, 'sha256': H}
        path, data = self.write_index([row], ascii=False)
        logical = hashlib.sha256(data).hexdigest()
        sources = {'onnxruntime': {'destination': 'onnxruntime'}}
        layout = {'inventory': {'logical_encoding': 'canonical-jsonl-utf8-v1', 'logical_sha256': logical},
                  'assembledLayoutSha256': logical, 'sources': [{'source': 'onnxruntime', 'indexedFilesAndLinks': 1,
                  'regularFileBytes': 3, 'sourceContentLayoutSha256': logical}], 'symlinks': [], 'danglingLinks': []}
        guard.check_onnx_inventory(path, layout, sources, {row['path']: H})
        self.rejects(guard.check_onnx_inventory, path, layout, sources, {row['path']: 'b'*64})
        self.rejects(guard.check_onnx_inventory, path, layout, sources, {'onnxruntime/missing': H})
        layout['sources'][0]['sourceContentLayoutSha256'] = 'c'*64
        self.rejects(guard.check_onnx_inventory, path, layout, sources)

    def test_runtime_full_index_binds_absence_modes_and_per_archive_bytes(self):
        rows = [
            {'path': 'src', 'kind': 'dir', 'link': None, 'mode': 0, 'size': 0, 'sha256': None, 'source': 'implicit'},
            {'path': 'src/file', 'kind': 'file', 'link': None, 'mode': 0o100644, 'size': 3, 'sha256': H, 'source': 'src.tar.gz'},
        ]
        path, data = self.write_index(rows)
        file_line = guard.canonical(rows[1])+b'\n'
        assembly = {'compressed_inventory': {}, 'logical_inventory_sha256': hashlib.sha256(data).hexdigest(),
                    'entry_count': 2, 'required_members': [{'path': 'src/file', 'size': 3, 'sha256': H}],
                    'initial_patch_paths': {'src/file': {'bytes': 3, 'mode': 420, 'sha256': H}, 'src/new': None},
                    'symlinks': [], 'dangling_links': [],
                    'symlink_verification': {'input_sha256': {'logical_inventory': hashlib.sha256(data).hexdigest()},
                                             'symlinks_sha256': guard.canonical_digest([])},
                    'per_archive_inventory': [{'archive': 'src.tar.gz', 'entry_count': 1, 'regular_files': 1,
                                               'regular_bytes': 3, 'logical_records_sha256': hashlib.sha256(file_line).hexdigest()}]}
        accepted = {'src.tar.gz': {'archive': 'src.tar.gz', 'path': 'src', 'regular_files': 1, 'unpacked_member_bytes': 3}}
        bundle = FakeBundle({'patch_recipe': {'retained_inputs': []}, 'native_grant_index': {'scope_prefixes': []},
                             'native_ffmpeg': {'records': [], 'electron_inputs': []}})
        bundle.nested_file = lambda *args: path
        guard.check_runtime_inventory(bundle, assembly, accepted)
        bad = deepcopy(assembly); bad['initial_patch_paths']['src/file'] = None
        self.rejects(guard.check_runtime_inventory, bundle, bad, accepted)
        bad = deepcopy(assembly); bad['per_archive_inventory'][0]['regular_bytes'] = 0
        self.rejects(guard.check_runtime_inventory, bundle, bad, accepted)
        bad = deepcopy(assembly); bad['logical_inventory_sha256'] = 'b'*64
        self.rejects(guard.check_runtime_inventory, bundle, bad, accepted)
        # Actual Gitiles TAR links may carry regular-file bits in the raw mode.
        rows.append({'path': 'src/link', 'kind': 'symlink', 'link': 'file', 'mode': 0o100644,
                     'size': 0, 'sha256': None, 'source': 'src.tar.gz'})
        path, data = self.write_index(rows)
        assembly['entry_count'] = 3
        assembly['logical_inventory_sha256'] = hashlib.sha256(data).hexdigest()
        assembly['symlinks'] = guard.resolve_inventory_links({r['path']: r['kind'] for r in rows}, {'src/link': 'file'})
        assembly['symlink_verification'] = {'input_sha256': {'logical_inventory': assembly['logical_inventory_sha256']},
                                           'symlinks_sha256': guard.canonical_digest(assembly['symlinks'])}
        assembly['per_archive_inventory'][0]['entry_count'] = 2
        assembly['per_archive_inventory'][0]['logical_records_sha256'] = hashlib.sha256(
            b''.join(guard.canonical(r)+b'\n' for r in rows[1:])).hexdigest()
        guard.check_runtime_inventory(bundle, assembly, accepted)

    def test_recipe_cannot_drop_patch_while_original_order_is_unchanged(self):
        contents = b'diff --git a/file b/file\n--- a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+new\n'
        directory = 'src/electron/patches/test'
        files = {'src/electron/LICENSE': b'original license',
                 'src/electron/patches/config.json': json.dumps([{'repo': 'src', 'patch_dir': directory}]).encode(),
                 directory+'/.patches': b'a.patch\nb.patch\n',
                 directory+'/a.patch': contents, directory+'/b.patch': contents}
        retained = []
        for name, data in files.items():
            path = self.root/name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
            retained.append({'file': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        records = [{'ordinal': n, 'config_index': 0, 'repository': 'src', 'patch': directory+'/'+name,
                    'sha256': hashlib.sha256(contents).hexdigest(), 'bytes': len(contents),
                    'diffs': [{'path': 'src/file', 'operation': 'modify'}]}
                   for n, name in enumerate(('a.patch', 'b.patch'), 1)]
        recipe = {'retained_inputs': retained, 'records': records, 'required_paths': ['src/file']}
        bundle = FakeBundle({'patch_recipe': recipe, 'patch_result': {'configurations': [
            {'index': 0, 'repo': 'src', 'patch_dir': directory, 'patch_count': 2}]}})
        bundle.material = lambda base, record: self.root/record['file']
        guard.check_patch_recipe(bundle)
        recipe['records'].pop()
        bundle.values['patch_result']['configurations'][0]['patch_count'] = 1
        self.rejects(guard.check_patch_recipe, bundle)

    def test_metadata_archive_must_publish_consumed_indexes(self):
        metadata = self.root/'metadata'; metadata.mkdir()
        descriptors = []
        for name, data in [('runtime.json', b'{}'), ('assembly.json', b'{}'), ('onnx.json', b'{}'), ('full-index.jsonl.gz', b'index bytes')]:
            path = metadata/name; path.write_bytes(data)
            descriptors.append({'file': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'storage': 'metadata'})
        asset = self.root/'Source-Metadata.zip'
        def write_zip(include_index):
            with zipfile.ZipFile(asset, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
                for desc in descriptors:
                    if include_index or desc['file'] != 'full-index.jsonl.gz':
                        archive.write(metadata/desc['file'], desc['file'])
        def bundle_for_zip(required=None):
            asset_desc = {'file': asset.name, 'bytes': asset.stat().st_size, 'sha256': guard.digest_file(asset)}
            value = {'schema_version': 1, 'inputs': dict(zip(('runtime_manifest', 'runtime_assembly', 'onnx_manifest'), descriptors[:3])),
                     'material_files': [*descriptors, asset_desc], 'metadata_required_files': required or descriptors,
                     'source_metadata_assets': [{'file': asset.name, 'size': asset_desc['bytes'], 'sha256': asset_desc['sha256']}]}
            path = self.root/'bundle.json'; path.write_text(json.dumps(value))
            return guard.Bundle(path, metadata)
        write_zip(True)
        self.assertEqual(len(guard.check_metadata_assets(bundle_for_zip())), 1)
        # The outer archive's new hash is valid, and the original full index is
        # available locally; omitting that index from the published ZIP fails.
        write_zip(False)
        self.rejects(guard.check_metadata_assets, bundle_for_zip())
        substituted = b'substitute index'
        required = deepcopy(descriptors)
        required[-1].update(bytes=len(substituted), sha256=hashlib.sha256(substituted).hexdigest())
        with zipfile.ZipFile(asset, 'w') as archive:
            for desc in descriptors:
                archive.writestr(desc['file'], substituted if desc['file'] == 'full-index.jsonl.gz'
                                 else (metadata/desc['file']).read_bytes())
        # The ZIP is self-consistent with its own allowlist, but differs from
        # the actual full index consumed from the metadata directory.
        self.rejects(guard.check_metadata_assets, bundle_for_zip(required))

    def test_exact_gitlink_dispositions_cannot_be_omitted_or_relabelled(self):
        identity = {'owner_archive': 'lib.tar.gz', 'repository': 'https://example.googlesource.com/lib',
                    'revision': 'a'*40, 'path': 'tools/example', 'gitlink_revision': 'b'*40}
        row = {**identity, 'disposition': 'external-build-or-test', 'explanation': 'Not selected by pinned build recipe.',
               'review_inputs': [{'file': 'recipe.gn', 'bytes': 3, 'sha256': H}]}
        bundle = FakeBundle({'gitlink_dispositions': {'gitlinks': [row]}})
        bundle.material = lambda *args: self.root/'recipe.gn'
        guard.check_gitlink_dispositions(bundle, [identity], {})
        row['disposition'] = 'unknown'
        self.rejects(guard.check_gitlink_dispositions, bundle, [identity], {})
        row['disposition'] = 'external-build-or-test'; row['gitlink_revision'] = 'c'*40
        self.rejects(guard.check_gitlink_dispositions, bundle, [identity], {})
        bundle.values['gitlink_dispositions']['gitlinks'] = []
        self.rejects(guard.check_gitlink_dispositions, bundle, [identity], {})

    def test_remote_incomplete_extra_stale_wrong_identity_rejected(self):
        for mutation in ('missing', 'duplicate', 'extra', 'stale', 'future', 'release', 'commit', 'state', 'size', 'digest', 'download'):
            args = self.remote_fixture(); snapshot = args[0]
            if mutation == 'missing': snapshot['assets'] = []
            if mutation == 'duplicate': snapshot['assets'].append(deepcopy(snapshot['assets'][0]))
            if mutation == 'extra': snapshot['assets'].append({**snapshot['assets'][0], 'name': 'Extra.zip', 'id': 43})
            if mutation == 'stale': snapshot['checked_at'] = (args[-1]-timedelta(minutes=16)).isoformat()
            if mutation == 'future': snapshot['checked_at'] = (args[-1]+timedelta(seconds=1)).isoformat()
            if mutation == 'release': snapshot['release']['id'] = 8
            if mutation == 'commit': snapshot['tag_commit'] = 'e'*40
            if mutation == 'state': snapshot['assets'][0]['state'] = 'starter'
            if mutation == 'size': snapshot['assets'][0]['size'] = 99
            if mutation == 'digest': snapshot['assets'][0]['digest'] = 'sha256:'+'b'*64
            if mutation == 'download': snapshot['assets'][0]['browser_download_url'] = 'https://github.com/other/repo/releases/download/v1.3.0/Sources.zip'
            with self.subTest(mutation=mutation):
                self.rejects(guard.reconcile_remote, *args)

    def test_partial_collection_flags_cannot_overwrite_success(self):
        bundle = self.root/'partial.json'
        bundle.write_text(json.dumps({'schema_version': 1, 'collection_complete': True,
                                      'publication_ready': True, 'inputs': {}}))
        output = self.root/'passing.json'; output.write_text('preserved prior report\n')
        result = subprocess.run([sys.executable, str(Path(guard.__file__)), '--bundle', str(bundle), '--output', str(output)],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertFalse(json.loads(result.stdout)['publication_ready'])
        self.assertEqual(output.read_text(), 'preserved prior report\n')


if __name__ == '__main__':
    unittest.main(verbosity=2)
