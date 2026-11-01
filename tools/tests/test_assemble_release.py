"""Small synthetic release fixtures; never upload or build native packages."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit
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
        self.version = '1.4.0'
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
                if app in ('reader', 'alternative'):
                    summary['ttsReport'] = prefix + '-tts.json'
                    self.write_json(reports / summary['ttsReport'], {'passed': True, 'application': app,
                        'version': self.version, 'platform': platform, 'packagedModuleExecuted': True,
                        'cases': {'buffered': {'ok': True}, 'streaming': {'ok': True}}})
                self.write_json(reports / (prefix + '-validation.json'), summary)
                self.write_json(reports / (prefix + '-publication.json'), {'application': app, 'version': self.version,
                    'platform': platform, 'commit': self.commit, 'assets': ledger})
        reader = self.artifacts / 'reader-linux-1.4.0/verification'
        self.write_json(reader / 'reader-linux-mathjax.json', {'passed': True})
        self.write_json(reader / 'reader-linux-file-citations.json', {'passed': ['rendering'], 'checks': 1, 'errors': [], 'remoteRequests': []})
        alternative = self.artifacts / 'alternative-linux-1.4.0/verification'
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
        path = self.artifacts / 'analytics-linux-1.4.0/verification/analytics-linux-validation.json'
        data = json.loads(path.read_text()); data['result'] = 'FAIL'
        self.write_json(path, data)
        with self.assertRaisesRegex(ValueError, 'successful native validation'):
            release.collect_inputs(self.artifacts, self.version, self.commit)

    def test_rejects_other_commit(self):
        with self.assertRaisesRegex(ValueError, 'tagged commit'):
            release.collect_inputs(self.artifacts, self.version, 'b' * 40)

    def test_rejects_failed_focused_gate(self):
        self.write_json(self.artifacts / 'reader-linux-1.4.0/verification/reader-linux-mathjax.json', {'passed': False})
        with self.assertRaisesRegex(ValueError, 'Focused rendering checks'):
            release.collect_inputs(self.artifacts, self.version, self.commit)

    def test_rejects_missing_packaged_speech_evidence(self):
        (self.artifacts / 'alternative-windows-1.4.0/verification/alternative-win32-tts.json').unlink()
        with self.assertRaisesRegex(ValueError, 'packaged CPU speech validation'):
            release.collect_inputs(self.artifacts, self.version, self.commit)

    def test_rejects_failed_streaming_speech(self):
        path = self.artifacts / 'reader-linux-1.4.0/verification/reader-linux-tts.json'
        data = json.loads(path.read_text()); data['cases']['streaming']['ok'] = False
        self.write_json(path, data)
        with self.assertRaisesRegex(ValueError, 'streaming CPU speech'):
            release.collect_inputs(self.artifacts, self.version, self.commit)

    def test_uploaded_assets_require_exact_github_digest(self):
        ledger = [{'name': 'asset.zip', 'bytes': 7, 'sha256': 'a' * 64}]
        remote = {'tag_name': 'v1.4.0', 'assets': [{'name': 'asset.zip', 'size': 7,
                  'digest': 'sha256:' + 'a' * 64, 'state': 'uploaded'}]}
        release.verify_uploaded(remote, 'v1.4.0', ledger)
        remote['assets'][0]['digest'] = None
        with self.assertRaisesRegex(ValueError, 'size/digest'):
            release.verify_uploaded(remote, 'v1.4.0', ledger)

    def test_uploaded_assets_reject_other_tag_or_extra_asset(self):
        remote = {'tag_name': 'v1.3.0', 'assets': []}
        with self.assertRaisesRegex(ValueError, 'asset names'):
            release.verify_uploaded(remote, 'v1.4.0', [])
        remote = {'tag_name': 'v1.4.0', 'assets': [{'name': 'stale.zip'}]}
        with self.assertRaisesRegex(ValueError, 'asset names'):
            release.verify_uploaded(remote, 'v1.4.0', [])

    def test_exact_tag_source_and_single_complete_manifest(self):
        repository = self.root / 'repository'; repository.mkdir()
        for app in release.APPS:
            self.write_json(repository / 'apps' / app / 'package.json', {'name': app, 'version': self.version})
        self.write_json(repository / 'tools/release-versions.json', dict.fromkeys(release.APPS, self.version))
        (repository / 'docs').mkdir()
        (repository / 'docs/index.html').write_text('<title>Synthetic offline manual</title>')
        def git(*args):
            return subprocess.check_output(['git', *args], cwd=repository, text=True, stderr=subprocess.DEVNULL).strip()
        git('init'); git('config', 'user.name', 'Synthetic Fixture'); git('config', 'user.email', 'fixture@example.invalid')
        git('add', '.'); git('commit', '-m', 'Synthetic release fixture'); git('tag', 'v1.4.0')
        self.commit = git('rev-parse', 'HEAD')
        self.populate()
        (repository / 'untracked-private.txt').write_text('must not enter source archives')
        output = self.root / 'assembled'
        version, ledger = release.assemble(self.artifacts, output, 'v1.4.0', 'example/suite', 'https://example.invalid/run', repository)
        self.assertEqual(version, self.version)
        self.assertEqual(len(ledger), 17)
        manifest = (output / 'SHA256SUM.txt').read_text().splitlines()
        self.assertEqual(len(manifest), 16)
        self.assertFalse(any(line.endswith('  SHA256SUM.txt') for line in manifest))
        for item in ledger:
            self.assertEqual(release.digest(output / item['name']), item['sha256'])
        with zipfile.ZipFile(output / 'ThreadShelf-Local-Suite-1.4.0-Source.zip') as archive:
            self.assertFalse(any('untracked-private' in name for name in archive.namelist()))
            self.assertIn('ThreadShelf-Local-Suite-1.4.0-Source/apps/reader/package.json', archive.namelist())
        with zipfile.ZipFile(output / 'ThreadShelf-Local-Suite-1.4.0-Manual.zip') as archive:
            self.assertEqual(archive.read('ThreadShelf-Local-Suite-1.4.0-Manual/index.html'), b'<title>Synthetic offline manual</title>')
            self.assertFalse(any('apps/' in name for name in archive.namelist()))
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
        self.environment = {'GITHUB_EVENT_NAME': 'push', 'GITHUB_REF': 'refs/tags/v1.4.0'}

    def remote(self, draft, complete=True):
        asset = self.ledger[0]
        return {'id': 42, 'tag_name': 'v1.4.0', 'draft': draft,
                'upload_url': 'https://uploads.github.com/repos/example/suite/releases/42/assets{?name,label}', 'assets': [
            {'id': 101, 'name': asset['name'], 'size': asset['bytes'],
             'digest': 'sha256:' + asset['sha256'], 'state': 'uploaded'}
        ] if complete else []}

    def publisher_fixture(self, initially_missing=False, existing_assets=None,
                          create_changes=None, upload_changes=None, publish_changes=None,
                          upload_failure=False, remote_tag='refs/tags/v1.4.0'):
        calls = []
        remote = self.remote(True, complete=False)
        remote['assets'] = existing_assets or []
        def fake_run(*arguments, **kwargs):
            args = tuple(map(str, arguments)); calls.append(args)
            self.assertEqual(args[:2], ('gh', 'api'))
            if any('/releases/tags/' in arg for arg in args):
                raise subprocess.CalledProcessError(1, args, stderr='HTTP 404')
            if '/releases?per_page=' in args[2]:
                # A newly created draft can be absent from a subsequent listing.
                return json.dumps([] if initially_missing else [{'id': 42, 'tag_name': 'v1.4.0'}])
            if args == ('gh', 'api', 'repos/example/suite/releases/42'):
                return json.dumps(remote)
            if args == ('gh', 'api', 'repos/example/suite/git/ref/tags/v1.4.0'):
                return json.dumps({'ref': remote_tag, 'object': {'type': 'tag', 'sha': 'a' * 40}})
            if args[:5] == ('gh', 'api', '--method', 'POST', 'repos/example/suite/releases'):
                self.assertIn('Content-Type: application/json', args)
                body = json.loads(Path(args[args.index('--input') + 1]).read_text())
                self.assertEqual(body['tag_name'], 'v1.4.0')
                self.assertIs(body['draft'], True)
                self.assertEqual(body['name'], 'ThreadShelf Local Suite 1.4.0')
                return json.dumps({**remote, **(create_changes or {})})
            if args[:4] == ('gh', 'api', '--method', 'POST') and args[4].startswith('https://uploads.github.com/'):
                url = urlsplit(args[4])
                self.assertEqual(url.path, '/repos/example/suite/releases/42/assets')
                name = parse_qs(url.query)['name'][0]
                asset = next(item for item in self.ledger if item['name'] == name)
                path = Path(args[args.index('--input') + 1])
                self.assertEqual(path, self.output / name)
                self.assertEqual(release.digest(path), asset['sha256'])
                self.assertIn('Content-Type: application/octet-stream', args)
                self.assertIn('Content-Length: ' + str(asset['bytes']), args)
                if upload_failure:
                    raise subprocess.CalledProcessError(1, args, stderr='HTTP 502')
                uploaded = {'id': 200 + len(remote['assets']), 'name': name, 'size': asset['bytes'],
                            'digest': 'sha256:' + asset['sha256'], 'state': 'uploaded'}
                uploaded.update(upload_changes or {})
                remote['assets'].append(uploaded)
                return json.dumps(uploaded)
            if args[:4] == ('gh', 'api', '--method', 'DELETE'):
                asset_id = int(args[4].rsplit('/', 1)[-1])
                self.assertEqual(args[4], 'repos/example/suite/releases/assets/' + str(asset_id))
                self.assertEqual(sum(a['id'] == asset_id for a in remote['assets']), 1)
                remote['assets'] = [a for a in remote['assets'] if a['id'] != asset_id]
                return ''
            if args[:5] == ('gh', 'api', '--method', 'PATCH', 'repos/example/suite/releases/42'):
                self.assertIn('Content-Type: application/json', args)
                body = json.loads(Path(args[args.index('--input') + 1]).read_text())
                self.assertEqual(body['draft'], False)
                self.assertEqual(body['make_latest'], 'true')
                self.assertEqual(body['name'], 'ThreadShelf Local Suite 1.4.0')
                remote['draft'] = False
                return json.dumps({**remote, **(publish_changes or {})})
            raise AssertionError(f'Unexpected publisher command: {args}')
        return calls, fake_run

    @staticmethod
    def mutation_calls(calls, method=None):
        return [call for call in calls if call[:3] == ('gh', 'api', '--method')
                and (method is None or call[3] == method)]

    def invoke_publisher(self, fake_run):
        with patch.object(release, 'run', side_effect=fake_run), patch.dict(release.os.environ, self.environment, clear=True):
            release.publish(self.output, 'v1.4.0', 'example/suite', '1.4.0', self.ledger)

    def test_existing_draft_uses_id_when_tag_endpoint_is_unavailable(self):
        calls, fake_run = self.publisher_fixture()
        self.invoke_publisher(fake_run)
        self.assertFalse(any(call[4] == 'repos/example/suite/releases' for call in self.mutation_calls(calls, 'POST')))
        self.assertEqual(sum(call == ('gh', 'api', 'repos/example/suite/releases/42') for call in calls), 2)
        self.assertFalse(any('/releases/tags/' in arg for call in calls for arg in call))

    def test_missing_release_uses_created_id_despite_stale_listing(self):
        calls, fake_run = self.publisher_fixture(initially_missing=True)
        self.invoke_publisher(fake_run)
        self.assertEqual(sum('/releases?per_page=' in call[2] for call in calls), 1)
        creations = [call for call in self.mutation_calls(calls, 'POST') if call[4] == 'repos/example/suite/releases']
        self.assertEqual(len(creations), 1)
        tag_read = ('gh', 'api', 'repos/example/suite/git/ref/tags/v1.4.0')
        self.assertLess(calls.index(tag_read), calls.index(creations[0]))
        self.assertEqual(len(self.mutation_calls(calls, 'PATCH')), 1)

    def test_missing_remote_tag_prevents_release_creation(self):
        calls, fake_run = self.publisher_fixture(initially_missing=True, remote_tag='refs/tags/v1.3.0')
        with self.assertRaises(ValueError):
            self.invoke_publisher(fake_run)
        self.assertEqual(self.mutation_calls(calls), [])

    def test_invalid_created_release_prevents_upload_and_publication(self):
        for changes in ({'id': None}, {'id': True}, {'id': 0}, {'id': '42'},
                        {'tag_name': 'v1.3.0'}, {'draft': False}):
            with self.subTest(changes=changes):
                calls, fake_run = self.publisher_fixture(initially_missing=True, create_changes=changes)
                with self.assertRaises(ValueError):
                    self.invoke_publisher(fake_run)
                self.assertEqual(len(self.mutation_calls(calls)), 1)
                self.assertEqual(self.mutation_calls(calls)[0][4], 'repos/example/suite/releases')

    def test_partial_draft_keeps_verified_asset_and_uploads_only_missing_asset(self):
        existing = self.remote(True)['assets']
        (self.output / 'second.zip').write_bytes(b'second')
        self.ledger.append({'name': 'second.zip', 'bytes': 6, 'sha256': release.digest(self.output / 'second.zip')})
        calls, fake_run = self.publisher_fixture(existing_assets=existing)
        self.invoke_publisher(fake_run)
        uploads = self.mutation_calls(calls, 'POST')
        self.assertEqual(len(uploads), 1)
        self.assertEqual(parse_qs(urlsplit(uploads[0][4]).query)['name'], ['second.zip'])
        self.assertEqual(self.mutation_calls(calls, 'DELETE'), [])

    def test_corrupt_draft_asset_is_replaced_by_id_before_publication(self):
        existing = self.remote(True)['assets']
        existing[0]['digest'] = 'sha256:' + 'b' * 64
        calls, fake_run = self.publisher_fixture(existing_assets=existing)
        self.invoke_publisher(fake_run)
        mutations = self.mutation_calls(calls)
        self.assertEqual([call[3] for call in mutations], ['DELETE', 'POST', 'PATCH'])
        self.assertEqual(mutations[0][4], 'repos/example/suite/releases/assets/101')

    def test_unexpected_or_duplicate_draft_assets_prevent_mutation(self):
        valid = self.remote(True)['assets'][0]
        for assets in ([{**valid, 'name': 'unrelated.zip'}], [valid, {**valid, 'id': 102}]):
            with self.subTest(assets=assets):
                calls, fake_run = self.publisher_fixture(existing_assets=assets)
                with self.assertRaises(ValueError):
                    self.invoke_publisher(fake_run)
                self.assertEqual(self.mutation_calls(calls), [])

    def test_upload_failure_leaves_release_as_draft(self):
        calls, fake_run = self.publisher_fixture(upload_failure=True)
        with self.assertRaises(subprocess.CalledProcessError):
            self.invoke_publisher(fake_run)
        self.assertEqual(self.mutation_calls(calls, 'PATCH'), [])

    def test_invalid_uploaded_asset_prevents_publication(self):
        for changes in ({'name': 'wrong.zip'}, {'size': 8}, {'digest': None},
                        {'digest': 'sha256:' + 'b' * 64}, {'state': 'starter'}):
            with self.subTest(changes=changes):
                calls, fake_run = self.publisher_fixture(upload_changes=changes)
                with self.assertRaises(ValueError):
                    self.invoke_publisher(fake_run)
                self.assertEqual(self.mutation_calls(calls, 'PATCH'), [])

    def test_asset_name_is_encoded_without_changing_uploaded_file(self):
        name = 'fixture name+#.zip'
        (self.output / 'fixture.zip').rename(self.output / name)
        self.ledger[0]['name'] = name
        calls, fake_run = self.publisher_fixture()
        self.invoke_publisher(fake_run)
        url = self.mutation_calls(calls, 'POST')[0][4]
        self.assertEqual(parse_qs(urlsplit(url).query)['name'], [name])
        self.assertEqual(urlsplit(url).fragment, '')

    def test_publication_response_must_confirm_release_identity_and_assets(self):
        for changes in ({'id': 43}, {'tag_name': 'v1.3.0'}, {'draft': True}, {'assets': []}):
            with self.subTest(changes=changes):
                calls, fake_run = self.publisher_fixture(publish_changes=changes)
                with self.assertRaises(ValueError):
                    self.invoke_publisher(fake_run)
                self.assertEqual(len(self.mutation_calls(calls, 'PATCH')), 1)

    def test_existing_public_release_is_identical_noop(self):
        responses = [json.dumps([{'id': 42, 'tag_name': 'v1.4.0'}]), json.dumps(self.remote(False))]
        with patch.object(release, 'run', side_effect=responses) as command, patch.dict(release.os.environ, self.environment, clear=True):
            release.publish(self.output, 'v1.4.0', 'example/suite', '1.4.0', self.ledger)
        self.assertEqual(command.call_count, 2)
        self.assertTrue(all(call.args[:2] == ('gh', 'api') for call in command.call_args_list))

    def test_changed_public_release_is_refused_before_mutation(self):
        previous = self.remote(False)
        previous['assets'][0]['digest'] = 'sha256:' + 'b' * 64
        responses = [json.dumps([{'id': 42, 'tag_name': 'v1.4.0'}]), json.dumps(previous)]
        with patch.object(release, 'run', side_effect=responses) as command, patch.dict(release.os.environ, self.environment, clear=True):
            with self.assertRaisesRegex(ValueError, 'size/digest'):
                release.publish(self.output, 'v1.4.0', 'example/suite', '1.4.0', self.ledger)
        self.assertEqual(command.call_count, 2)

    def test_api_error_does_not_create_a_missing_release(self):
        failure = subprocess.CalledProcessError(1, ['gh', 'api'], stderr='HTTP 403')
        with patch.object(release, 'run', side_effect=failure) as command, patch.dict(release.os.environ, self.environment, clear=True):
            with self.assertRaises(subprocess.CalledProcessError):
                release.publish(self.output, 'v1.4.0', 'example/suite', '1.4.0', self.ledger)
        self.assertEqual(command.call_count, 1)

    def test_dispatch_guard_accepts_only_verified_master_recovery(self):
        valid = {'GITHUB_EVENT_NAME': 'workflow_dispatch', 'GITHUB_REF': 'refs/heads/master',
                 'GITHUB_WORKFLOW': 'Publish validated release', 'RELEASE_TAG': 'v1.4.0'}
        self.assertTrue(release.publication_event_allowed('v1.4.0', valid))
        self.assertTrue(release.publication_event_allowed('v1.4.0', self.environment))
        for key, value in [('GITHUB_REF', 'refs/heads/other'), ('GITHUB_WORKFLOW', 'Build desktop packages'),
                           ('RELEASE_TAG', 'v1.3.0'), ('GITHUB_EVENT_NAME', 'pull_request')]:
            with self.subTest(key=key):
                self.assertFalse(release.publication_event_allowed('v1.4.0', {**valid, key: value}))


if __name__ == '__main__':
    unittest.main()
