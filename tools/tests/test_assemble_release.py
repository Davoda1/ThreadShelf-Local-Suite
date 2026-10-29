"""Small synthetic release fixtures; never upload or build native packages."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
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


class ReleasePublicationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='threadshelf-publication-fixture-')
        self.addCleanup(self.temporary.cleanup)
        self.output = Path(self.temporary.name) / 'assets'
        self.output.mkdir()
        (self.output / 'fixture.zip').write_bytes(b'fixture')
        self.ledger = [{'name': 'fixture.zip', 'bytes': 7, 'sha256': release.digest(self.output / 'fixture.zip')}]
        self.environment = {'GITHUB_EVENT_NAME': 'push', 'GITHUB_REF': 'refs/tags/v1.3.1'}

    def remote(self, draft, complete=True):
        asset = self.ledger[0]
        return {'id': 42, 'tag_name': 'v1.3.1', 'draft': draft, 'assets': [
            {'name': asset['name'], 'size': asset['bytes'], 'digest': 'sha256:' + asset['sha256']}
        ] if complete else []}

    def publisher_fixture(self, initially_missing=False):
        calls = []
        state = {'exists': not initially_missing, 'uploaded': False}
        def fake_run(*arguments, **kwargs):
            args = tuple(map(str, arguments)); calls.append(args)
            if any('/releases/tags/' in arg for arg in args):
                raise subprocess.CalledProcessError(1, args, stderr='HTTP 404')
            if args[:2] == ('gh', 'api') and '/releases?per_page=' in args[2]:
                return json.dumps([{'id': 42, 'tag_name': 'v1.3.1'}] if state['exists'] else [])
            if args == ('gh', 'api', 'repos/example/suite/releases/42'):
                return json.dumps(self.remote(True, state['uploaded']))
            if args[:3] == ('gh', 'release', 'create'):
                state['exists'] = True
                return 'https://example.invalid/releases/42'
            if args[:3] == ('gh', 'release', 'upload'):
                state['uploaded'] = True
                return ''
            if args[:5] == ('gh', 'api', '--method', 'PATCH', 'repos/example/suite/releases/42'):
                body = json.loads(Path(args[-1]).read_text())
                self.assertEqual(body['draft'], False)
                self.assertEqual(body['make_latest'], 'true')
                self.assertEqual(body['name'], 'ThreadShelf Local Suite 1.3.1')
                return json.dumps(self.remote(False))
            raise AssertionError(f'Unexpected publisher command: {args}')
        return calls, fake_run

    def test_existing_draft_uses_id_when_tag_endpoint_is_unavailable(self):
        calls, fake_run = self.publisher_fixture()
        with patch.object(release, 'run', side_effect=fake_run), patch.dict(release.os.environ, self.environment, clear=True):
            release.publish(self.output, 'v1.3.1', 'example/suite', '1.3.1', self.ledger)
        self.assertFalse(any(call[:3] == ('gh', 'release', 'create') for call in calls))
        self.assertEqual(sum(call == ('gh', 'api', 'repos/example/suite/releases/42') for call in calls), 2)
        self.assertFalse(any('/releases/tags/' in arg for call in calls for arg in call))

    def test_missing_release_creates_and_resolves_draft_before_upload(self):
        calls, fake_run = self.publisher_fixture(initially_missing=True)
        with patch.object(release, 'run', side_effect=fake_run), patch.dict(release.os.environ, self.environment, clear=True):
            release.publish(self.output, 'v1.3.1', 'example/suite', '1.3.1', self.ledger)
        actions = [call[2] for call in calls if call[:2] == ('gh', 'release')]
        self.assertEqual(actions, ['create', 'upload'])
        self.assertIn('--verify-tag', next(call for call in calls if call[:3] == ('gh', 'release', 'create')))

    def test_existing_public_release_is_identical_noop(self):
        responses = [json.dumps([{'id': 42, 'tag_name': 'v1.3.1'}]), json.dumps(self.remote(False))]
        with patch.object(release, 'run', side_effect=responses) as command, patch.dict(release.os.environ, self.environment, clear=True):
            release.publish(self.output, 'v1.3.1', 'example/suite', '1.3.1', self.ledger)
        self.assertEqual(command.call_count, 2)
        self.assertTrue(all(call.args[:2] == ('gh', 'api') for call in command.call_args_list))

    def test_changed_public_release_is_refused_before_mutation(self):
        previous = self.remote(False)
        previous['assets'][0]['digest'] = 'sha256:' + 'b' * 64
        responses = [json.dumps([{'id': 42, 'tag_name': 'v1.3.1'}]), json.dumps(previous)]
        with patch.object(release, 'run', side_effect=responses) as command, patch.dict(release.os.environ, self.environment, clear=True):
            with self.assertRaisesRegex(ValueError, 'size/digest'):
                release.publish(self.output, 'v1.3.1', 'example/suite', '1.3.1', self.ledger)
        self.assertEqual(command.call_count, 2)

    def test_api_error_does_not_create_a_missing_release(self):
        failure = subprocess.CalledProcessError(1, ['gh', 'api'], stderr='HTTP 403')
        with patch.object(release, 'run', side_effect=failure) as command, patch.dict(release.os.environ, self.environment, clear=True):
            with self.assertRaises(subprocess.CalledProcessError):
                release.publish(self.output, 'v1.3.1', 'example/suite', '1.3.1', self.ledger)
        self.assertEqual(command.call_count, 1)

    def test_dispatch_guard_accepts_only_verified_master_recovery(self):
        valid = {'GITHUB_EVENT_NAME': 'workflow_dispatch', 'GITHUB_REF': 'refs/heads/master',
                 'GITHUB_WORKFLOW': 'Publish validated release', 'RELEASE_TAG': 'v1.3.1'}
        self.assertTrue(release.publication_event_allowed('v1.3.1', valid))
        self.assertTrue(release.publication_event_allowed('v1.3.1', self.environment))
        for key, value in [('GITHUB_REF', 'refs/heads/other'), ('GITHUB_WORKFLOW', 'Build desktop packages'),
                           ('RELEASE_TAG', 'v1.3.0'), ('GITHUB_EVENT_NAME', 'pull_request')]:
            with self.subTest(key=key):
                self.assertFalse(release.publication_event_allowed('v1.3.1', {**valid, key: value}))


if __name__ == '__main__':
    unittest.main()
