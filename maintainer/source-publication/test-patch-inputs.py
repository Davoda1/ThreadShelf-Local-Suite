#!/usr/bin/env python3
"""Small adversarial fixtures for the source patch input boundary."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('patch_inputs', ROOT / 'prepare-patch-inputs.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class PatchInputBoundary(unittest.TestCase):
    def test_paths_reject_escape_and_windows_drive_and_noncanonical_names(self):
        for value in ['../x', '/x', 'a/../../x', 'C:/x', 'a\\x', 'a//b', 'a/./b', '.', '', 'a\nx', 'a\0x']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                m.relative(value)
        self.assertEqual(m.relative('src/electron/patches/a.patch'), 'src/electron/patches/a.patch')

    def test_retain_refuses_changed_existing_input(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            first = m.retain(root, 'source.patch', b'original')
            self.assertEqual(first, m.retain(root, 'source.patch', b'original'))
            with self.assertRaises(ValueError):
                m.retain(root, 'source.patch', b'changed')
            self.assertEqual((root / 'source.patch').read_bytes(), b'original')

    def test_retain_refuses_symlink_ancestor_and_destination(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'actual').mkdir()
            (root / 'alias').symlink_to('actual', target_is_directory=True)
            with self.assertRaises(ValueError):
                m.retain(root, 'alias/patch', b'no')
            (root / 'file').symlink_to('actual/patch')
            with self.assertRaises(ValueError):
                m.retain(root, 'file', b'no')
            self.assertFalse((root / 'actual/patch').exists())

    def test_rejects_unreviewed_patch_forms_and_modes(self):
        forms = [
            b'diff --git a/a b/b\n',
            b'diff --git "a/with space" "b/with space"\n',
            b'diff --git a/x b/x\nGIT binary patch\n',
            b'diff --git a/x b/x\nnew file mode 120000\n',
            b'diff --git a/../../x b/../../x\n',
            b'not a patch\n',
        ]
        for patch in forms:
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                m.parse_diff_headers(patch, 'src')

    def test_exact_pinned_inventory_matches_independent_scan(self):
        report = json.loads((ROOT / 'patch-inputs/PATCH-INPUTS.json').read_text())
        independent = json.loads((ROOT / 'independent-patch-inventory.json').read_text())
        self.assertEqual(report['required_paths'], independent['required_paths'])
        self.assertEqual([(r['repository'], r['sha256']) for r in report['records']], [(r['repository'], r['sha256']) for r in independent['records']])
        self.assertEqual([r['ordinal'] for r in report['records']], list(range(1, 258)))
        for row in report['retained_inputs']:
            path = ROOT / 'patch-inputs' / row['file']
            self.assertEqual(path.stat().st_size, row['bytes'])
            self.assertEqual(m.digest(path), row['sha256'])

    def test_wrong_source_digest_is_rejected_before_output(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'seed').write_bytes(b'not the pinned source archive')
            with self.assertRaises(ValueError):
                m.prepare(root / 'seed', root / 'output')
            self.assertFalse((root / 'output').exists())


if __name__ == '__main__':
    unittest.main(verbosity=2)
