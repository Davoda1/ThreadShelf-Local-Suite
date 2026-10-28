#!/usr/bin/env python3
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('ordered_patches', ROOT / 'verify-ordered-patches.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

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
diff --git a/new.txt b/new.txt
--- a/new.txt
+++ b/new.txt
@@ -1 +1 @@
-NEW
+UPDATED
'''


def digest(data):
    return hashlib.sha256(data).hexdigest()


class OrderedPatchProof(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.inputs = self.root / 'inputs'
        self.sparse = self.root / 'sparse'
        self.work = self.root / 'work'
        self.database = self.root / 'inventory.sqlite'
        self.plan_file = self.root / 'plan.json'
        self.part_report = self.root / 'part-verification.json'
        self.output = self.root / 'patch-verification.json'
        self.config = [
            {'repo': 'src', 'patch_dir': 'src/electron/patches/core'},
            {'repo': 'src/empty', 'patch_dir': 'src/electron/patches/empty'},
        ]
        self.files = {
            'src/electron/LICENSE': b'fixture license\n',
            'src/electron/patches/config.json': (json.dumps(self.config) + '\n').encode(),
            'src/electron/patches/core/.patches': b'one.patch\ntwo.patch\n',
            'src/electron/patches/empty/.patches': b'',
            'src/electron/patches/core/one.patch': PATCH1,
            'src/electron/patches/core/two.patch': PATCH2,
        }
        self.plan = [
            {'path': 'src', 'revision': 'a' * 40, 'archive': 'base.tar.gz', 'archive_url': 'https://source.example/' + 'a' * 40, 'expected_sha256': digest(b'fixture-base-source')},
            {'path': 'src/electron', 'revision': 'b' * 40, 'archive': 'electron.tar.gz', 'archive_url': 'https://source.example/' + 'b' * 40, 'expected_sha256': digest(b'fixture-electron-source')},
        ]
        self.plan_file.write_text(json.dumps(self.plan))
        self.prepare_recipe()
        (self.sparse / 'src').mkdir(parents=True)
        (self.sparse / 'src/code.txt').write_bytes(b'A\n')
        (self.sparse / 'src/code.txt').chmod(0o644)
        self.create_inventory()

    def prepare_recipe(self):
        retained = []
        for name, data in self.files.items():
            path = self.inputs / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            retained.append({'file': name, 'bytes': len(data), 'sha256': digest(data)})
        records = []
        paths = set()
        for index, item in enumerate(self.config):
            for name in self.files[item['patch_dir'] + '/.patches'].decode().splitlines():
                if not name:
                    continue
                file = item['patch_dir'] + '/' + name
                data = self.files[file]
                diffs = m.recipe_tools.parse_diff_headers(data, item['repo'])
                paths.update(row['path'] for row in diffs)
                records.append({'ordinal': len(records) + 1, 'config_index': index, 'repository': item['repo'], 'patch': file, 'sha256': digest(data), 'bytes': len(data), 'diffs': diffs})
        recipe = {'electron_version': '45.1.0', 'electron_revision': 'b' * 40, 'seed_sha256': digest(b'fixture-electron-source'), 'patch_count': len(records), 'target_repository_count': len(self.config), 'unique_touched_paths': len(paths), 'records': records, 'required_paths': sorted(paths), 'retained_inputs': retained}
        (self.inputs / 'PATCH-INPUTS.json').write_text(json.dumps(recipe))
        (self.inputs / 'REQUIRED-SOURCE-PATHS.json').write_text(json.dumps(sorted(paths)))

    def create_inventory(self, originals=None):
        originals = originals or {'src/code.txt': b'A\n'}
        self.database.unlink(missing_ok=True)
        accepted = [{**row, 'sha256': row['expected_sha256'], 'size': 100} for row in self.plan]
        with sqlite3.connect(self.database) as db:
            db.execute('CREATE TABLE archives(name TEXT,part TEXT,record TEXT)')
            db.execute('CREATE TABLE entries(path TEXT,kind TEXT,mode INTEGER,size INTEGER,sha256 TEXT,source TEXT)')
            for row in accepted:
                db.execute('INSERT INTO archives VALUES(?,?,?)', (row['archive'], 'fixture.zip', json.dumps(row)))
            for path, data in originals.items():
                db.execute('INSERT INTO entries VALUES(?,?,?,?,?,?)', (path, 'file', 0o644, len(data), digest(data), 'base.tar.gz'))
        self.part_report.write_text(json.dumps({'passed': True, 'parts': [{'part': 'fixture.zip', 'verification': 'local-outer-and-inner-rehashed', 'source_count': len(accepted), 'database_archive_records_sha256': m.part_tools.records_digest(accepted)}]}))

    def run_chain(self):
        return m.apply_chain(self.inputs, self.plan_file, self.database, self.sparse, self.work, [self.part_report], self.output, require_production_shape=False)

    def test_exact_order_applies_and_keeps_originals_unchanged(self):
        report = self.run_chain()
        self.assertTrue(report['passed'])
        self.assertEqual(report['patch_count'], 2)
        self.assertEqual((self.work / 'src/code.txt').read_bytes(), b'C\n')
        self.assertEqual((self.work / 'src/new.txt').read_bytes(), b'UPDATED\n')
        self.assertEqual((self.sparse / 'src/code.txt').read_bytes(), b'A\n')
        self.assertFalse((self.sparse / 'src/new.txt').exists())
        self.assertEqual([row['patch_count'] for row in report['configurations']], [2, 0])
        self.assertEqual(report['initially_absent_paths'], ['src/new.txt'])

    def test_wrong_base_fails_actual_git_context_check(self):
        (self.sparse / 'src/code.txt').write_bytes(b'WRONG\n')
        self.create_inventory({'src/code.txt': b'WRONG\n'})
        with self.assertRaisesRegex(m.PatchVerificationError, 'failed check'):
            self.run_chain()
        self.assertEqual((self.sparse / 'src/code.txt').read_bytes(), b'WRONG\n')
        self.assertEqual(json.loads(self.output.read_text())['status'], 'failed')

    def test_wrong_order_fails_before_dependent_patch_can_apply(self):
        self.files['src/electron/patches/core/.patches'] = b'two.patch\none.patch\n'
        self.prepare_recipe()
        with self.assertRaisesRegex(m.PatchVerificationError, 'base file is absent|failed check'):
            self.run_chain()

    def test_new_file_absence_uses_full_relevant_inventory(self):
        (self.sparse / 'src/new.txt').write_bytes(b'EXISTING\n')
        (self.sparse / 'src/new.txt').chmod(0o644)
        self.create_inventory({'src/code.txt': b'A\n', 'src/new.txt': b'EXISTING\n'})
        with self.assertRaisesRegex(m.PatchVerificationError, 'already exists'):
            self.run_chain()

    def test_sparse_symlink_cannot_substitute_for_verified_bytes(self):
        source = self.sparse / 'src/code.txt'
        source.unlink()
        target = self.root / 'elsewhere'
        target.write_bytes(b'A\n')
        source.symlink_to(target)
        with self.assertRaisesRegex(m.part_tools.PartVerificationError, 'symlink'):
            self.run_chain()
        self.assertFalse(self.work.exists())

    def test_missing_source_owner_archive_cannot_be_treated_as_absence(self):
        self.plan.append({'path': 'src/new.txt', 'revision': 'c' * 40, 'archive': 'missing.tar.gz', 'archive_url': 'https://source.example/' + 'c' * 40})
        self.plan_file.write_text(json.dumps(self.plan))
        with self.assertRaisesRegex(m.PatchVerificationError, 'not yet accepted'):
            self.run_chain()
        self.assertFalse(self.work.exists())

    def test_stale_part_evidence_is_rejected_before_apply(self):
        evidence = json.loads(self.part_report.read_text())
        evidence['parts'][0]['database_archive_records_sha256'] = '0' * 64
        self.part_report.write_text(json.dumps(evidence))
        with self.assertRaisesRegex(m.PatchVerificationError, 'stale part-integrity'):
            self.run_chain()
        self.assertFalse(self.work.exists())

    def test_changed_patch_or_order_metadata_is_rejected(self):
        patch = self.inputs / 'src/electron/patches/core/one.patch'
        patch.write_bytes(PATCH1.replace(b'+B', b'+MALICIOUS'))
        with self.assertRaisesRegex(m.PatchVerificationError, 'recipe bytes differ'):
            self.run_chain()
        self.assertFalse(self.work.exists())

    def test_existing_work_tree_is_not_overwritten(self):
        self.work.mkdir()
        (self.work / 'user-file').write_bytes(b'keep')
        with self.assertRaisesRegex(m.PatchVerificationError, 'new or empty'):
            self.run_chain()
        self.assertEqual((self.work / 'user-file').read_bytes(), b'keep')

    def test_git_environment_cannot_redirect_patch_mutations(self):
        with mock.patch.dict(os.environ, {'GIT_DIR': '/not-a-repository', 'GIT_WORK_TREE': '/not-the-worktree', 'GIT_INDEX_FILE': '/not-an-index', 'GIT_CONFIG_COUNT': '1', 'GIT_CONFIG_KEY_0': 'apply.whitespace', 'GIT_CONFIG_VALUE_0': 'fix'}):
            report = self.run_chain()
        self.assertTrue(report['passed'])
        self.assertEqual((self.work / 'src/code.txt').read_bytes(), b'C\n')

    def test_production_entry_rejects_fixture_recipe_shape(self):
        with self.assertRaisesRegex(m.PatchVerificationError, 'Production pinned recipe'):
            m.apply_chain(self.inputs, self.plan_file, self.database, self.sparse, self.work, [self.part_report], self.output)


if __name__ == '__main__':
    unittest.main(verbosity=2)
