"""Small synthetic release fixtures; never upload or build native packages."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile

SPEC = importlib.util.spec_from_file_location('assemble_release', Path(__file__).resolve().parents[1] / 'assemble-release.py')
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


class ReleaseAssemblyTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='threadshelf-release-fixture-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.artifacts = self.root / 'artifacts'
        self.artifacts.mkdir()
        self.version = '1.3.1'
        self.commit = 'a' * 40
        self.populate()

    @staticmethod
    def write_json(path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value))

    def populate(self):
        for app in release.APPS:
            for target, platform in release.PLATFORMS:
                directory = self.artifacts / f'{app}-{target}-{self.version}'
                directory.mkdir(exist_ok=True)
                reports = directory / 'verification'
                reports.mkdir(exist_ok=True)
                prefix = f'{app}-{platform}'
                ledger = []
                for name in release.expected_names(app, target, self.version):
                    path = directory / name
                    path.write_bytes(('Synthetic package: ' + name).encode())
                    ledger.append({'name': name, 'bytes': path.stat().st_size, 'sha256': release.digest(path)})
                (directory / 'SHA256SUM.txt').write_text(''.join(f'{a["sha256"]}  {a["name"]}\n' for a in ledger))
                summary = {'application': app, 'version': self.version, 'platform': platform,
                           'result': 'PASS', 'nativeGUIExecuted': True,
                           'packageReport': prefix + '-packages.json', 'guiReport': prefix + '-gui.json'}
                self.write_json(reports / summary['packageReport'], {'result': 'PASS'})
                self.write_json(reports / summary['guiReport'], {'passed': True, 'nativeGUIExecuted': True})
                if app == 'reader':
                    summary['storageReport'] = prefix + '-storage.json'
                    self.write_json(reports / summary['storageReport'], {'status': 'PASS'})
                self.write_json(reports / (prefix + '-validation.json'), summary)
                self.write_json(reports / (prefix + '-publication.json'), {'application': app, 'version': self.version,
                    'platform': platform, 'commit': self.commit, 'assets': ledger})
        reader = self.artifacts / 'reader-linux-1.3.1/verification'
        self.write_json(reader / 'reader-linux-mathjax.json', {'passed': True})
        self.write_json(reader / 'reader-linux-file-citations.json', {'passed': ['rendering'], 'checks': 1, 'errors': [], 'remoteRequests': []})
        alternative = self.artifacts / 'alternative-linux-1.3.1/verification'
        self.write_json(alternative / 'alternative-linux-file-citations.json', {'passed': True})

    def test_complete_six_job_collection(self):
        assets, evidence, summaries = release.collect_inputs(self.artifacts, self.version, self.commit)
        self.assertEqual(len(assets), 11)
        self.assertEqual(len(summaries), 6)
        self.assertTrue(all(p.suffix == '.json' for p in evidence.values()))
        self.assertNotIn('SHA256SUM.txt', evidence)

    def test_rejects_missing_package(self):
        next(self.artifacts.glob('reader-windows-*/*.zip')).unlink()
        with self.assertRaisesRegex(ValueError, 'missing publication files'):
            release.collect_inputs(self.artifacts, self.version, self.commit)

    def test_rejects_altered_package_bytes(self):
        next(self.artifacts.glob('reader-windows-*/*.zip')).write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'publication bytes differ'):
            release.collect_inputs(self.artifacts, self.version, self.commit)

    def test_rejects_failed_validation(self):
        path = self.artifacts / 'analytics-linux-1.3.1/verification/analytics-linux-validation.json'
        data = json.loads(path.read_text()); data['result'] = 'FAIL'
        self.write_json(path, data)
        with self.assertRaisesRegex(ValueError, 'successful native validation'):
            release.collect_inputs(self.artifacts, self.version, self.commit)

    def test_rejects_other_commit(self):
        with self.assertRaisesRegex(ValueError, 'tagged commit'):
            release.collect_inputs(self.artifacts, self.version, 'b' * 40)

    def test_rejects_failed_focused_gate(self):
        self.write_json(self.artifacts / 'reader-linux-1.3.1/verification/reader-linux-mathjax.json', {'passed': False})
        with self.assertRaisesRegex(ValueError, 'Focused rendering checks'):
            release.collect_inputs(self.artifacts, self.version, self.commit)

    def test_uploaded_assets_require_exact_github_digest(self):
        ledger = [{'name': 'asset.zip', 'bytes': 7, 'sha256': 'a' * 64}]
        remote = {'tag_name': 'v1.3.1', 'assets': [{'name': 'asset.zip', 'size': 7, 'digest': 'sha256:' + 'a' * 64}]}
        release.verify_uploaded(remote, 'v1.3.1', ledger)
        remote['assets'][0]['digest'] = None
        with self.assertRaisesRegex(ValueError, 'size/digest'):
            release.verify_uploaded(remote, 'v1.3.1', ledger)

    def test_uploaded_assets_reject_other_tag_or_extra_asset(self):
        remote = {'tag_name': 'v1.3.0', 'assets': []}
        with self.assertRaisesRegex(ValueError, 'asset names'):
            release.verify_uploaded(remote, 'v1.3.1', [])
        remote = {'tag_name': 'v1.3.1', 'assets': [{'name': 'stale.zip'}]}
        with self.assertRaisesRegex(ValueError, 'asset names'):
            release.verify_uploaded(remote, 'v1.3.1', [])

    def test_exact_tag_source_and_single_complete_manifest(self):
        repository = self.root / 'repository'; repository.mkdir()
        for app in release.APPS:
            self.write_json(repository / 'apps' / app / 'package.json', {'name': app, 'version': self.version})
        self.write_json(repository / 'tools/release-versions.json', dict.fromkeys(release.APPS, self.version))
        def git(*args):
            return subprocess.check_output(['git', *args], cwd=repository, text=True, stderr=subprocess.DEVNULL).strip()
        git('init'); git('config', 'user.name', 'Synthetic Fixture'); git('config', 'user.email', 'fixture@example.invalid')
        git('add', '.'); git('commit', '-m', 'Synthetic release fixture'); git('tag', 'v1.3.1')
        self.commit = git('rev-parse', 'HEAD')
        self.populate()
        (repository / 'untracked-private.txt').write_text('must not enter source archives')
        output = self.root / 'assembled'
        version, ledger = release.assemble(self.artifacts, output, 'v1.3.1', 'example/suite', 'https://example.invalid/run', repository)
        self.assertEqual(version, self.version)
        self.assertEqual(len(ledger), 16)
        manifest = (output / 'SHA256SUM.txt').read_text().splitlines()
        self.assertEqual(len(manifest), 15)
        self.assertFalse(any(line.endswith('  SHA256SUM.txt') for line in manifest))
        for item in ledger:
            self.assertEqual(release.digest(output / item['name']), item['sha256'])
        with zipfile.ZipFile(output / 'ThreadShelf-Local-Suite-1.3.1-Source.zip') as archive:
            self.assertFalse(any('untracked-private' in name for name in archive.namelist()))
            self.assertIn('ThreadShelf-Local-Suite-1.3.1-Source/apps/reader/package.json', archive.namelist())
        with self.assertRaisesRegex(ValueError, 'application version'):
            release.version_for_tag('v1.3.0', repository)


if __name__ == '__main__':
    unittest.main()
