#!/usr/bin/env python3
"""Adversarial local fixtures for streamed source preservation; no network."""
import contextlib
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sqlite3
import sys
import tarfile
import tempfile
import unittest
from unittest import mock
import zipfile

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('stream_sources', ROOT / 'stream-runtime-sources.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def archive_bytes(rows, tail_mutation=None):
    sink = io.BytesIO()
    with tarfile.open(fileobj=sink, mode='w') as tar:
        for name, kind, contents in rows:
            info = tarfile.TarInfo(name)
            info.mode = 0o755 if kind == 'exec' else 0o644
            if kind == 'symlink':
                info.type = tarfile.SYMTYPE
                info.linkname = contents
                tar.addfile(info)
            elif kind == 'dir':
                info.type = tarfile.DIRTYPE
                tar.addfile(info)
            else:
                info.size = len(contents)
                tar.addfile(info, io.BytesIO(contents))
    raw = sink.getvalue()
    if tail_mutation:
        raw = tail_mutation(raw)
    return gzip.compress(raw, mtime=0)


class StreamBoundary(unittest.TestCase):
    def run_main(self, temp, payload, required=(), digest=None, max_part_gib='0.01', patch_hash_failure=False, prefix=''):
        root = Path(temp)
        (root / 'patch-inputs').mkdir(exist_ok=True)
        (root / 'patch-inputs/REQUIRED-SOURCE-PATHS.json').write_text(json.dumps(list(required)))
        source = root / 'fixture.tar.gz'
        source.write_bytes(payload)
        row = {'path': 'src/component', 'archive': 'fixture.tar.gz', 'archive_url': 'https://codeload.github.com/example/source/tar.gz/' + 'c' * 40, 'archive_prefix': prefix, 'local_file': str(source), 'revision': 'c' * 40}
        if digest is not None:
            row['expected_sha256'] = digest
        plan = root / 'plan.json'
        plan.write_text(json.dumps([row]))
        argv = ['stream-runtime-sources.py', '--plan', str(plan), '--part', 'part01.zip', '--max-part-gib', max_part_gib, '--reserve-mib', '0']
        with mock.patch.object(m, 'ROOT', root), mock.patch.object(sys, 'argv', argv), contextlib.redirect_stdout(io.StringIO()):
            if patch_hash_failure:
                with mock.patch.object(m.hashlib, 'file_digest', side_effect=OSError('injected hash read failure')):
                    m.main()
            else:
                m.main()

    def assert_rejected_cleanly(self, payload, required=(), digest=None, max_part_gib='0.01', patch_hash_failure=False, prefix=''):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises((m.SourceError, OSError, ValueError, tarfile.TarError)):
                self.run_main(temp, payload, required, digest, max_part_gib, patch_hash_failure, prefix)
            root = Path(temp)
            self.assertFalse((root / 'parts/part01.zip').exists())
            if (root / 'assembly-inventory.sqlite').exists():
                with sqlite3.connect(root / 'assembly-inventory.sqlite') as db:
                    self.assertEqual(db.execute('SELECT COUNT(*) FROM archives').fetchone()[0], 0)
                    self.assertEqual(db.execute('SELECT COUNT(*) FROM entries').fetchone()[0], 0)
            for path in required:
                self.assertFalse((root / 'sparse-source' / path).exists())

    def test_preserves_exact_compressed_bytes_inventory_and_sparse_mode(self):
        payload = archive_bytes([('code.c', 'exec', b'int main() { return 0; }\n')])
        with tempfile.TemporaryDirectory() as temp:
            self.run_main(temp, payload, ['src/component/code.c'], hashlib.sha256(payload).hexdigest())
            root = Path(temp)
            with zipfile.ZipFile(root / 'parts/part01.zip') as zf:
                self.assertEqual(zf.read('archives/fixture.tar.gz'), payload)
            sparse = root / 'sparse-source/src/component/code.c'
            self.assertEqual(sparse.read_bytes(), b'int main() { return 0; }\n')
            self.assertEqual(sparse.stat().st_mode & 0o777, 0o755)
            with sqlite3.connect(root / 'assembly-inventory.sqlite') as db:
                self.assertEqual(db.execute('SELECT kind,size,sha256 FROM entries WHERE path=?', ('src/component/code.c',)).fetchone(), ('file', 25, hashlib.sha256(sparse.read_bytes()).hexdigest()))
                self.assertEqual(db.execute('SELECT COUNT(*) FROM archives').fetchone()[0], 1)

    def test_rejects_nondirectory_repository_wrapper(self):
        payload = archive_bytes([('repo', 'symlink', '../escape'), ('repo/a', 'file', b'x')])
        self.assert_rejected_cleanly(payload, prefix='repo/')

    def test_repository_wrapper_directory_is_supported(self):
        payload = archive_bytes([('repo', 'dir', b''), ('repo/a', 'file', b'x')])
        with tempfile.TemporaryDirectory() as temp:
            self.run_main(temp, payload, prefix='repo/')
            with sqlite3.connect(Path(temp) / 'assembly-inventory.sqlite') as db:
                self.assertEqual(db.execute('SELECT COUNT(*) FROM entries WHERE path=?', ('src/component/a',)).fetchone()[0], 1)

    def test_rejects_parent_traversal(self):
        self.assert_rejected_cleanly(archive_bytes([('../escape', 'file', b'x')]))

    def test_rejects_nondirectory_collision(self):
        self.assert_rejected_cleanly(archive_bytes([('same', 'file', b'a'), ('same', 'file', b'b')]))

    def test_rejects_file_or_symlink_ancestor(self):
        for kind, contents in [('file', b'a'), ('symlink', 'other')]:
            with self.subTest(kind=kind):
                self.assert_rejected_cleanly(archive_bytes([('parent', kind, contents), ('parent/child', 'file', b'b')]))

    def test_rejects_escaping_symlink(self):
        self.assert_rejected_cleanly(archive_bytes([('escape', 'symlink', '../../../outside')]))

    def test_rejects_hidden_nonzero_data_after_tar_end(self):
        # One file consumes1024bytes; zeroheader follows. This payload hides
        # nonzero bytes later in tarfile's initial10240byte stream readbuffer.
        payload = archive_bytes([('a', 'file', b'x')], lambda raw: raw[:2048] + b'HIDDEN' + raw[2054:])
        self.assert_rejected_cleanly(payload)

    def test_rejects_wrong_hash_and_rolls_back_sparse_file(self):
        payload = archive_bytes([('code.c', 'file', b'x')])
        self.assert_rejected_cleanly(payload, ['src/component/code.c'], '0' * 64)

    def test_hash_io_failure_cannot_leave_accepted_database_rows(self):
        payload = archive_bytes([('code.c', 'file', b'x')])
        self.assert_rejected_cleanly(payload, ['src/component/code.c'], patch_hash_failure=True)

    def test_part_limit_includes_zip_and_manifest_overhead(self):
        payload = archive_bytes([('a', 'file', b'x')])
        # Input archive fits, but outer ZIP+manifest cannot fit this limit.
        limit = str((len(payload) + 20) / (1024 ** 3))
        self.assert_rejected_cleanly(payload, max_part_gib=limit)


if __name__ == '__main__':
    unittest.main(verbosity=2)
