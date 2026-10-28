#!/usr/bin/env python3
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parent

def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

m = module('verify_parts', 'verify-source-parts.py')
f = module('stream_fixtures', 'test-stream-runtime-sources.py')


class AcceptedPartIntegrity(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.required = ['src/component/code.c']
        payload = f.archive_bytes([('code.c', 'exec', b'code\n')])
        f.StreamBoundary().run_main(self.temp.name, payload, self.required, hashlib.sha256(payload).hexdigest())
        self.part = self.root / 'parts/part01.zip'
        self.sidecar = self.root / 'parts/part01.json'

    def verify(self, receipts=None):
        return m.verify(self.root / 'assembly-inventory.sqlite', self.root / 'parts', self.root / 'sparse-source', self.required, receipts_file=receipts)

    def update_outer_digest(self):
        report = json.loads(self.sidecar.read_text())
        report.update(bytes=self.part.stat().st_size, sha256=m.sha256_file(self.part))
        self.sidecar.write_text(json.dumps(report))

    def rewrite_zip(self, transform):
        with zipfile.ZipFile(self.part) as archive:
            members = [(item.filename, archive.read(item)) for item in archive.infolist()]
        with zipfile.ZipFile(self.part, 'w', compression=zipfile.ZIP_STORED) as archive:
            for name, data in transform(members):
                archive.writestr(name, data)
        self.update_outer_digest()

    def make_receipt(self):
        local = self.verify()
        prior = self.root / 'prior-local.json'
        prior.write_text(json.dumps(local))
        part = local['parts'][0]
        receipt = {
            'status': 'github-api-digest-and-size-verified',
            'repository': m.REPOSITORY,
            'part': 'part01.zip',
            'bytes': part['bytes'],
            'sha256': part['sha256'],
            'asset_digest': 'sha256:' + part['sha256'],
            'asset_id': 123,
            'asset_api_url': f'https://api.github.com/repos/{m.REPOSITORY}/releases/assets/123',
            'local_verification_report': prior.name,
            'local_verification_sha256': m.sha256_file(prior),
        }
        path = self.root / 'receipts.json'
        path.write_text(json.dumps([receipt]))
        return path, receipt

    def test_local_part_and_sparse_original_are_verified(self):
        report = self.verify()
        self.assertTrue(report['passed'])
        self.assertEqual(report['parts'][0]['verification'], 'local-outer-and-inner-rehashed')
        self.assertEqual(report['sparse_source']['known_touched_source_files_verified'], 1)

    def test_outer_corruption_is_rejected(self):
        data = self.part.read_bytes()
        self.part.write_bytes(data[:-1] + bytes([data[-1] ^ 1]))
        with self.assertRaisesRegex(m.PartVerificationError, 'Outer source part'):
            self.verify()

    def test_duplicate_or_extra_zip_member_is_rejected_even_with_new_outer_hash(self):
        for extra in ['PART-MANIFEST.json', 'unexpected']:
            with self.subTest(extra=extra):
                original = self.part.read_bytes()
                self.rewrite_zip(lambda rows: [*rows, (extra, b'{}')])
                with self.assertRaisesRegex(m.PartVerificationError, 'Unexpected or duplicate'):
                    self.verify()
                self.part.write_bytes(original)
                self.update_outer_digest()

    def test_inner_corruption_is_rejected_even_with_new_outer_hash(self):
        self.rewrite_zip(lambda rows: [(name, data[:-1] + bytes([data[-1] ^ 1]) if name.startswith('archives/') else data) for name, data in rows])
        with self.assertRaisesRegex(m.PartVerificationError, 'inner archive SHA256'):
            self.verify()

    def test_embedded_manifest_must_match_database(self):
        def change(rows):
            for name, data in rows:
                if name == 'PART-MANIFEST.json':
                    document = json.loads(data)
                    document['sources'][0]['revision'] = 'd' * 40
                    data = json.dumps(document).encode()
                yield name, data
        self.rewrite_zip(change)
        with self.assertRaisesRegex(m.PartVerificationError, 'Embedded manifest differs'):
            self.verify()

    def test_database_records_cannot_drift_from_sidecar(self):
        with sqlite3.connect(self.root / 'assembly-inventory.sqlite') as db:
            record = json.loads(db.execute('SELECT record FROM archives').fetchone()[0])
            record['revision'] = 'd' * 40
            db.execute('UPDATE archives SET record=?', (json.dumps(record),))
        with self.assertRaisesRegex(m.PartVerificationError, 'Part report differs'):
            self.verify()

    def test_sparse_bytes_and_modes_are_checked(self):
        file = self.root / 'sparse-source' / self.required[0]
        file.write_bytes(b'bad!\n')
        with self.assertRaisesRegex(m.PartVerificationError, 'pre-patch source bytes/mode'):
            self.verify()
        file.write_bytes(b'code\n')
        file.chmod(0o644)
        with self.assertRaisesRegex(m.PartVerificationError, 'pre-patch source bytes/mode'):
            self.verify()

    def test_missing_part_requires_explicit_verified_receipt(self):
        self.part.unlink()
        with self.assertRaisesRegex(m.PartVerificationError, 'absent and has no'):
            self.verify()

    def test_remote_receipt_has_explicit_evidence_scope(self):
        path, receipt = self.make_receipt()
        self.part.unlink()
        report = self.verify(path)
        self.assertEqual(report['parts'][0]['verification'], 'prior-local-check-plus-github-api-receipt')
        self.assertIn('did not download or rehash', report['parts'][0]['limitation'])

    def test_wrong_remote_digest_and_altered_prior_report_are_rejected(self):
        path, receipt = self.make_receipt()
        self.part.unlink()
        bad = {**receipt, 'asset_digest': 'sha256:' + '0' * 64}
        path.write_text(json.dumps([bad]))
        with self.assertRaisesRegex(m.PartVerificationError, 'Remote receipt identity'):
            self.verify(path)
        path.write_text(json.dumps([receipt]))
        (self.root / receipt['local_verification_report']).write_text('{}')
        with self.assertRaisesRegex(m.PartVerificationError, 'Prior local verification report hash'):
            self.verify(path)

    def test_damaged_local_part_cannot_fall_back_to_remote_receipt(self):
        path, receipt = self.make_receipt()
        self.part.write_bytes(b'corrupted')
        with self.assertRaisesRegex(m.PartVerificationError, 'Outer source part'):
            self.verify(path)


if __name__ == '__main__':
    unittest.main(verbosity=2)
