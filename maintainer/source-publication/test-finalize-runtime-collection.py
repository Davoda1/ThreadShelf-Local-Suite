#!/usr/bin/env python3
"""Small real ZIP/TAR/SQLite/ordered-Git-patch finalization boundary fixtures."""
import copy
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sqlite3
import tarfile
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('finalizer', ROOT / 'finalize-runtime-collection.py')
f = importlib.util.module_from_spec(spec)
spec.loader.exec_module(f)

PATCH1 = b'''diff --git a/code.txt b/code.txt
--- a/code.txt
+++ b/code.txt
@@ -1 +1 @@
-A
+B
diff --git a/new.txt b/new.txt
new file mode 100644
--- /dev/null
+++ b/new.txt
@@ -0,0 +1 @@
+NEW
'''
PATCH2 = b'''diff --git a/code.txt b/code.txt
--- a/code.txt
+++ b/code.txt
@@ -1 +1 @@
-B
+C
'''


def sha(data):
    return hashlib.sha256(data).hexdigest()


def tar(files, prefix=''):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w') as archive:
        for path, payload in sorted(files.items()):
            info = tarfile.TarInfo(prefix + path)
            info.mode = 0o644
            info.size = len(payload)
            archive.addfile(info, io.BytesIO(payload))
    return gzip.compress(output.getvalue(), mtime=0)


class FinalizerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.parts = self.root / 'parts'
        self.parts.mkdir()
        self.database = self.root / 'inventory.sqlite'
        self.out = self.root / 'final'
        self.inputs = self.root / 'patch-inputs'
        self.sparse = self.root / 'sparse'
        self.config = [{'repo': 'src', 'patch_dir': 'src/electron/patches/core'}]
        self.recipe_files = {
            'src/electron/LICENSE': b'fixture license\n',
            'src/electron/patches/config.json': json.dumps(self.config).encode(),
            'src/electron/patches/core/.patches': b'one.patch\ntwo.patch\n',
            'src/electron/patches/core/one.patch': PATCH1,
            'src/electron/patches/core/two.patch': PATCH2,
        }
        seed = {'source_seeds': [
            {'id': 'chromium', 'revision': 'a' * 40, 'archive': 'chromium.tar.gz',
             'archive_url': 'https://chromium.googlesource.com/chromium/src.git/+archive/' + 'a' * 40 + '.tar.gz'},
            {'id': 'electron', 'revision': 'b' * 40, 'archive': 'electron.tar.gz',
             'archive_url': 'https://codeload.github.com/electron/electron/tar.gz/' + 'b' * 40},
        ]}
        git = {'path': 'src', 'url': 'https://chromium.googlesource.com/chromium/src.git@' + 'a' * 40, 'enabled': True}
        non_git = {'path': 'src/extra', 'deps_file': 'src/DEPS', 'condition': 'True', 'dep_type': 'gcs', 'bucket': 'fixture', 'objects': [], 'enabled': True}
        inventory = {'targets': [{'target': t, 'dependencies': [git, non_git], 'selected_git': [git], 'parsed': []} for t in ['linux', 'win']]}
        plan = list(f.derive_git(inventory, seed).values())
        extra = {'path': 'src/extra', 'repository': 'https://example.test/fixture', 'revision': '1', 'archive': 'extra.tar.gz', 'archive_prefix': '', 'archive_url': 'https://example.test/source.tar.gz', 'source_record': 'extra-source.json'}
        profiles = {'path': 'src/electron/pgo', 'repository': 'https://github.com/electron/electron.git', 'revision': 'b' * 40, 'archive': 'profiles.tar.gz', 'archive_prefix': '', 'archive_url': 'https://example.test/profiles.tar.gz', 'source_files': [{'archive_member': 'x.profile', 'size': 3, 'sha256': sha(b'PGO')}]}
        classification = {'rows': [{**{k:v for k,v in non_git.items() if k != 'enabled'}, 'targets': ['linux', 'win'], 'classification': 'required-source-headers', 'source_access_disposition': 'Preserved source', 'retained_source_review_inputs': []}], 'unknown_classifications': []}
        self.content = {
            'chromium.tar.gz': {'code.txt': b'A\n', 'extra/NOTICE': b'notice\n'},
            'electron.tar.gz': {k.removeprefix('src/electron/'): v for k, v in self.recipe_files.items()},
            'extra.tar.gz': {'api.h': b'header\n'},
            'profiles.tar.gz': {'x.profile': b'PGO'},
        }
        self.records, archives = [], {}
        for row in [*plan, extra, profiles]:
            payload = tar(self.content[row['archive']], row.get('archive_prefix', ''))
            row.update(expected_sha256=sha(payload))
            if row['archive'] in ('extra.tar.gz', 'profiles.tar.gz'):
                row.update(size=len(payload), sha256=sha(payload))
            record = {**row, 'size': len(payload), 'sha256': sha(payload), 'member_count': len(self.content[row['archive']]), 'regular_files': len(self.content[row['archive']]), 'unpacked_member_bytes': sum(map(len, self.content[row['archive']].values()))}
            archives[row['archive']] = payload
            self.records.append(record)
        self.part = 'Runtime-Sources-01.zip'
        with zipfile.ZipFile(self.parts / self.part, 'x', compression=zipfile.ZIP_STORED) as archive:
            for name, payload in archives.items():
                archive.writestr('archives/' + name, payload)
            archive.writestr('PART-MANIFEST.json', json.dumps({'status': 'source-part-verified-collection-incomplete', 'part': self.part, 'sources': self.records}))
        sidecar = {'part': self.part, 'bytes': (self.parts / self.part).stat().st_size, 'sha256': sha((self.parts / self.part).read_bytes()), 'source_count': len(self.records), 'sources': self.records}
        (self.parts / self.part).with_suffix('.json').write_text(json.dumps(sidecar))
        with sqlite3.connect(self.database) as db:
            db.execute('CREATE TABLE archives(name TEXT PRIMARY KEY,part TEXT,record TEXT)')
            db.execute('CREATE TABLE entries(path TEXT PRIMARY KEY,kind TEXT,link TEXT,mode INTEGER,size INTEGER,sha256 TEXT,source TEXT)')
            for row in self.records:
                db.execute('INSERT INTO archives VALUES(?,?,?)', (row['archive'], self.part, json.dumps(row)))
                for name, payload in self.content[row['archive']].items():
                    path = row['path'] + '/' + name
                    pieces = path.split('/')
                    for n in range(1, len(pieces)):
                        db.execute('INSERT OR IGNORE INTO entries VALUES(?,?,?,?,?,?,?)', ('/'.join(pieces[:n]), 'dir', None, 0, 0, None, 'implicit'))
                    db.execute('INSERT INTO entries VALUES(?,?,?,?,?,?,?)', (path, 'file', None, 0o644, len(payload), sha(payload), row['archive']))
        supplemental = {'sources': [extra], 'required_git_tree_notices': [{'git_path': 'src/extra/NOTICE', 'bytes': 7, 'sha256': sha(b'notice\n')}]}
        validation = {'passed': True, 'archives': [{**extra, 'passed': True, 'source_record_sha256': sha(b'fixture source provenance')}]}
        self.files = {}
        for key, value in dict(seed=seed, deps_inventory=inventory, git_plan=plan, non_git_classification=classification,
                               supplemental_manifest=supplemental, supplemental_validation=validation, profiles=profiles).items():
            self.files[key] = self.root / (key + '.json')
            self.files[key].write_text(json.dumps(value))
        self.prepare_recipe(archives['electron.tar.gz'])
        self.files['patch_recipe'] = self.inputs / 'PATCH-INPUTS.json'
        self.files['patch_result'] = self.root / 'patch-result.json'
        self.sparse.mkdir()
        (self.sparse / 'src').mkdir()
        (self.sparse / 'src/code.txt').write_bytes(b'A\n')
        (self.sparse / 'src/code.txt').chmod(0o644)
        proof = f.parts_tool.verify_local_part(self.parts, self.part, self.records, sidecar)
        part_proof_file = self.root / 'local-part-proof.json'
        part_proof_file.write_text(json.dumps({'passed': True, 'parts': [proof]}))
        f.patch_tool.apply_chain(self.inputs, self.files['git_plan'], self.database, self.sparse,
                                 self.root / 'patch-work', [part_proof_file], self.files['patch_result'], require_production_shape=False)

    def prepare_recipe(self, electron_archive):
        retained, records, paths = [], [], set()
        for name, payload in self.recipe_files.items():
            file = self.inputs / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(payload)
            retained.append({'file': name, 'bytes': len(payload), 'sha256': sha(payload)})
        for n, name in enumerate(['one.patch', 'two.patch'], 1):
            path = 'src/electron/patches/core/' + name
            payload = self.recipe_files[path]
            diffs = f.patch_tool.recipe_tools.parse_diff_headers(payload, 'src')
            paths.update(row['path'] for row in diffs)
            records.append({'ordinal': n, 'config_index': 0, 'repository': 'src', 'patch': path, 'sha256': sha(payload), 'bytes': len(payload), 'diffs': diffs})
        recipe = {'electron_version': '45.1.0', 'electron_revision': 'b' * 40, 'seed_sha256': sha(electron_archive), 'patch_count': len(records), 'target_repository_count': 1, 'unique_touched_paths': len(paths), 'records': records, 'required_paths': sorted(paths), 'retained_inputs': retained}
        (self.inputs / 'PATCH-INPUTS.json').write_text(json.dumps(recipe))
        (self.inputs / 'REQUIRED-SOURCE-PATHS.json').write_text(json.dumps(sorted(paths)))

    def change(self, key, callback):
        data = json.loads(self.files[key].read_text())
        callback(data)
        self.files[key].write_text(json.dumps(data))

    def sql(self, statement, values=()):
        with sqlite3.connect(self.database) as db:
            db.execute(statement, values)

    def run_finalizer(self):
        return f.finalize(self.files, self.database, self.parts, None, self.out)

    def reject(self, pattern):
        with self.assertRaisesRegex((f.FinalizationError, f.parts_tool.PartVerificationError, f.patch_tool.PatchVerificationError, f.links_tool.UnsafeAssembly), pattern):
            self.run_finalizer()
        self.assertFalse(self.out.exists())

    def test_complete_real_collection_and_patch_chain(self):
        manifest, assembly = self.run_finalizer()
        self.assertEqual(manifest['source_count'], 4)
        self.assertTrue(manifest['collection_complete'])
        self.assertEqual(assembly['ordered_patch_count'], 2)
        self.assertIsNone(assembly['initial_patch_paths']['src/new.txt'])
        self.assertEqual(assembly['initial_patch_paths']['src/code.txt']['sha256'], sha(b'A\n'))
        raw = gzip.decompress((self.out / 'RUNTIME-FILE-INVENTORY.jsonl.gz').read_bytes())
        self.assertEqual(sha(raw), assembly['logical_inventory_sha256'])
        self.assertEqual(len(raw.splitlines()), assembly['entry_count'])
        self.assertEqual(assembly['input_sha256']['runtime_manifest'], sha((self.out / 'SOURCE-MANIFEST.json').read_bytes()))
        self.assertNotIn('seed', assembly['input_sha256'])
        self.assertEqual(assembly['symlink_verification']['input_sha256']['logical_inventory'], assembly['logical_inventory_sha256'])
        self.assertIn('preparation-time snapshots', manifest['preparation_status_supersession'])
        self.assertEqual([x for x in assembly['required_members'] if x['path'] == 'src/extra/NOTICE'][0]['source'], 'chromium.tar.gz')

    def test_partial_database_never_emits_final_files(self):
        self.sql('DELETE FROM archives WHERE name=?', ('extra.tar.gz',))
        self.reject('Complete accepted archive coverage')

    def test_self_consistent_plan_subset_is_rejected_against_deps(self):
        self.change('git_plan', lambda rows: rows.pop(0))
        self.sql('DELETE FROM archives WHERE name=?', ('chromium.tar.gz',))
        self.reject('Authoritative Git source coverage')

    def test_changed_revision_is_rejected(self):
        self.change('git_plan', lambda rows: rows[0].update(revision='c' * 40))
        self.reject('Git plan identity differs')

    def test_selected_table_cannot_omit_enabled_dependency(self):
        self.change('deps_inventory', lambda data: data['targets'][0].update(selected_git=[]))
        self.reject('Selected Git table differs')

    def test_unexpected_archive_rejected(self):
        self.sql('INSERT INTO archives VALUES(?,?,?)', ('unknown.tar.gz', self.part, json.dumps({'archive': 'unknown.tar.gz'})))
        self.reject('Complete accepted archive coverage')

    def test_substituted_accepted_identity_rejected(self):
        row = copy.deepcopy(self.records[0]); row['revision'] = 'd' * 40
        self.sql('UPDATE archives SET record=? WHERE name=?', (json.dumps(row), row['archive']))
        self.reject('Accepted source identity differs')

    def test_required_notice_and_profile_hashes_are_verified(self):
        for path in ['src/extra/NOTICE', 'src/electron/pgo/x.profile']:
            with self.subTest(path=path):
                self.sql('UPDATE entries SET sha256=? WHERE path=?', ('0' * 64, path))
                self.reject('Required profile/notice bytes differ')
                content = b'notice\n' if path.endswith('NOTICE') else b'PGO'
                self.sql('UPDATE entries SET sha256=? WHERE path=?', (sha(content), path))

    def test_complete_owner_proves_initial_absence(self):
        self.sql('INSERT INTO entries VALUES(?,?,?,?,?,?,?)', ('src/new.txt', 'file', None, 0o644, 2, sha(b'X\n'), 'chromium.tar.gz'))
        self.reject('Original touched-file absence')

    def test_initial_source_hash_and_owner_must_match(self):
        self.sql('UPDATE entries SET sha256=? WHERE path=?', ('0' * 64, 'src/code.txt'))
        self.reject('Patch original/intermediate bytes differ')
        self.sql('UPDATE entries SET sha256=?,source=? WHERE path=?', (sha(b'A\n'), 'electron.tar.gz', 'src/code.txt'))
        self.reject('wrong kind/owner')

    def test_patch_recipe_must_match_full_electron_archive(self):
        self.sql('UPDATE entries SET sha256=? WHERE path=?', ('0' * 64, 'src/electron/patches/core/one.patch'))
        self.reject('Retained patch recipe differs')

    def test_reordered_patch_result_rejected(self):
        self.change('patch_result', lambda result: result['applied_patches'].reverse())
        self.reject('Patch ordinal changed')

    def test_stale_patch_plan_binding_rejected(self):
        self.change('patch_result', lambda result: result.update(plan_sha256='0' * 64))
        self.reject('Ordered patch proof input binding differs')

    def test_failed_or_missing_patch_execution_rejected(self):
        self.change('patch_result', lambda result: result['applied_patches'][0]['commands'][0].update(exit_code=1))
        self.reject('execution failed or absent')

    def test_non_git_classification_coverage_rejected(self):
        self.change('non_git_classification', lambda data: data.update(rows=[]))
        self.reject('Full non-Git classification coverage')

    def test_unknown_non_git_disposition_rejected(self):
        self.change('non_git_classification', lambda data: data['rows'][0].update(classification='unreviewed-source'))
        self.reject('Unknown or unexplained non-Git')

    def test_source_bearing_non_git_mapping_cannot_disappear(self):
        self.change('supplemental_manifest', lambda data: data['sources'][0].update(path='src/unrelated'))
        self.reject('Accepted source identity differs')

    def test_pinned_accepted_archive_hash_cannot_change(self):
        row = copy.deepcopy(self.records[0]); row['sha256'] = '0' * 64
        self.sql('UPDATE archives SET record=? WHERE name=?', (json.dumps(row), row['archive']))
        self.reject('Pinned source hash differs')

    def test_missing_part_rejected(self):
        (self.parts / self.part).unlink()
        self.reject('Missing accepted part')

    def test_changed_sidecar_identity_rejected(self):
        path = (self.parts / self.part).with_suffix('.json')
        data = json.loads(path.read_text()); data['sources'][0]['sha256'] = '0' * 64
        path.write_text(json.dumps(data))
        self.reject('differs from database')

    def test_lost_regular_file_inventory_row_rejected(self):
        self.sql('DELETE FROM entries WHERE path=?', ('src/extra/api.h',))
        self.reject('Archive regular-file count differs')

    def test_inventory_nondirectory_ancestor_rejected(self):
        self.sql('UPDATE entries SET kind=?,sha256=? WHERE path=?', ('file', sha(b''), 'src/extra'))
        self.reject('implicit directories|nondirectory logical ancestor')

    def test_inventory_windows_drive_path_rejected(self):
        self.sql('INSERT INTO entries VALUES(?,?,?,?,?,?,?)', ('C:/escape', 'dir', None, 0, 0, None, 'implicit'))
        self.reject('Unsafe relative path')

    def test_expanded_symlink_escape_rejected(self):
        # src/a -> ../escape alone stays inside; src/b -> a/../../outside
        # escapes after a is expanded, despite its apparent lexical location.
        self.sql('INSERT INTO entries VALUES(?,?,?,?,?,?,?)', ('src/a', 'symlink', '../escape', 0o777, 0, None, 'chromium.tar.gz'))
        self.sql('INSERT INTO entries VALUES(?,?,?,?,?,?,?)', ('src/b', 'symlink', 'a/../../outside', 0o777, 0, None, 'chromium.tar.gz'))
        self.reject('escapes assembly')

    def test_existing_output_never_overwritten(self):
        self.out.mkdir(); (self.out / 'keep').write_text('original')
        with self.assertRaisesRegex(f.FinalizationError, 'must not exist'):
            self.run_finalizer()
        self.assertEqual((self.out / 'keep').read_text(), 'original')


if __name__ == '__main__':
    unittest.main(verbosity=2)
