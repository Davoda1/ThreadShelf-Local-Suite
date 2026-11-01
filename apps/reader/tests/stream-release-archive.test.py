#!/usr/bin/env python3
"""Verify bounded-memory ZIP publication using synthetic files only."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('stream_archive', ROOT / 'scripts/stream-release-archive.py')
ARCHIVE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ARCHIVE)


class StreamingArchiveTests(unittest.TestCase):
    def test_unicode_paths_content_and_modes_are_preserved(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / 'source'
            source.mkdir()
            files = {'native': b'MZ' + b'x' * 4096, 'notes/日本語.txt': 'Synthetic text.\n'.encode()}
            for name, contents in files.items():
                target = source / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(contents)
                target.chmod(0o755 if name == 'native' else 0o644)
            destination = root / 'release.zip'
            ARCHIVE.make_zip(source, destination, 'Release', list(files))
            with zipfile.ZipFile(destination) as stream:
                self.assertEqual(set(stream.namelist()), {'Release/' + name for name in files})
                for name, contents in files.items():
                    self.assertEqual(stream.read('Release/' + name), contents)
                    self.assertEqual(stream.getinfo('Release/' + name).external_attr >> 16 & 0o777, (source / name).stat().st_mode & 0o777)

    def test_changed_inputs_do_not_replace_an_existing_deliverable(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / 'source'
            source.mkdir()
            (source / 'data').write_bytes(b'original')
            destination = root / 'release.zip'
            destination.write_bytes(b'existing deliverable')
            original = ARCHIVE.snapshot_inputs
            def mutate(*args, **kwargs):
                frozen = original(*args, **kwargs)
                (source / 'data').write_bytes(b'modified')
                return frozen
            with patch.object(ARCHIVE, 'snapshot_inputs', side_effect=mutate):
                with self.assertRaisesRegex(ValueError, 'snapshot'):
                    ARCHIVE.make_zip(source, destination, '', ['data'])
            self.assertEqual(destination.read_bytes(), b'existing deliverable')

    def test_traversal_and_duplicate_members_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'data').write_bytes(b'fixture')
            for prefix, names in [('../escape', ['data']), ('', ['../data']), ('', ['data','data'])]:
                with self.subTest(prefix=prefix, names=names), self.assertRaises(ValueError):
                    ARCHIVE.make_zip(root, root / 'bad.zip', prefix, names)


if __name__ == '__main__':
    unittest.main()
