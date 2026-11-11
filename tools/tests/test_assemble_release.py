"""Small synthetic release fixtures; never upload or build native packages."""
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
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
        reader = self.artifacts / f'reader-linux-{self.version}/verification'
        self.write_json(reader / 'reader-linux-mathjax.json', {'passed': True})
        self.write_json(reader / 'reader-linux-file-citations.json', {'passed': ['rendering'], 'checks': 1, 'errors': [], 'remoteRequests': []})
        alternative = self.artifacts / f'alternative-linux-{self.version}/verification'
        self.write_json(alternative / 'alternative-linux-file-citations.json', {'passed': True})
        if tuple(map(int, self.version.split('.'))) >= (1, 4, 3):
            self.write_json(reader / 'reader-linux-chatgpt.json', {'passed': True, 'checks': 4, 'networkRequests': 0, 'pageErrors': 0})
            self.write_json(reader / 'reader-linux-grok.json', {'passed': True, 'views': 4, 'networkRequests': 0, 'pageErrors': 0})
            self.write_json(alternative / 'alternative-linux-compat.json', {'passed': True, 'checks': 4, 'networkRequests': 0, 'pageErrors': 0})
        if tuple(map(int, self.version.split('.'))) >= (1, 4, 4):
            for directory, app in ((reader, 'reader'), (alternative, 'alternative')):
                self.write_json(directory / f'{app}-linux-inline-html.json',
                                {'passed': True, 'checks': 4, 'networkRequests': 0, 'pageErrors': 0})
            for target, platform in release.PLATFORMS:
                directory = self.artifacts / f'reader-{target}-{self.version}/verification'
                self.write_json(directory / f'reader-{platform}-html-preview-host.json', {
                    'passed': True, 'checks': 11, 'separateProcess': True, 'sandbox': True, 'chromiumSandboxEnabled': True,
                    'privateRequestsBlocked': True, 'navigationBlocked': True, 'staleOpenCancelled': True,
                    'runawayIsolated': True, 'rendererCanRestrictNetwork': True})
                self.write_json(directory / f'reader-{platform}-html-preview-ui.json',
                                {'passed': True, 'chromiumSandboxEnabled': True, 'checks': 4, 'pageErrors': 0})
                directory = self.artifacts / f'alternative-{target}-{self.version}/verification'
                self.write_json(directory / f'alternative-{platform}-html-preview.json', {
                    'passed': True, 'productionApplication': True, 'sandbox': True, 'eligibleSwitches': 3,
                    'chromiumSandboxEnabled': True, 'singleInstanceLockUnmodified': True,
                    'svgUnchanged': True, 'embeddedJavascript': True, 'noApplicationBridge': True,
                    'copyUnchanged': True, 'codeTeardown': True, 'settingsTeardown': True,
                    'externalDisabled': True, 'privateAndFileBlocked': True, 'pageErrors': 0})
            self.write_json(reader / 'reader-linux-deduplication.json', {
                'passed': True, 'sandbox': True, 'chromiumSandboxEnabled': True, 'socketlessHarness': False, 'pageErrors': [],
                'checks': ['Synthetic check'] * 4, 'geometry': [{'synthetic': True}] * 80})
            self.write_json(alternative / 'alternative-linux-privacy.json', {
                'passed': True, 'chromiumSandboxEnabled': True, 'uploadToServer': False,
                'nativeStarts': 0, 'nativeUploadChanges': 0,
                'captureRequests': [], 'crashFilesBefore': [], 'crashFilesAfter': []})

        if tuple(map(int, self.version.split('.'))) >= (1, 4, 5):
            self.write_json(reader / 'reader-linux-deduplication-review.json', {
                'passed': True, 'chromiumSandboxEnabled': True, 'socketlessHarness': False,
                'pageErrors': [], 'checks': ['Synthetic cleanup review check'] * 8,
                'geometry': [{'synthetic': True}] * 42})
            for target, platform in release.PLATFORMS:
                reader_reports = self.artifacts / f'reader-{target}-{self.version}/verification'
                alternative_reports = self.artifacts / f'alternative-{target}-{self.version}/verification'
                self.write_json(reader_reports / f'reader-{platform}-code-options.json', {
                    'passed': True, 'checks': 4, 'optionCombinations': 4, 'pageErrors': 0,
                    'chromiumSandboxEnabled': True, 'nativeClipboardExact': True,
                    'blockCopyExact': True, 'messageCopyExact': True, 'wrapFits': True,
                    'logicalLineNumbers': True, 'mermaidSourceRestored': True,
                    'largeBlockCapped': True, 'defaultsOff': True,
                    'renderGutterIsolation': {'html': True, 'svg': True, 'mermaid': True}})
                self.write_json(alternative_reports / f'alternative-{platform}-code-options.json', {
                    'passed': True, 'productionApplication': True, 'chromiumSandboxEnabled': True,
                    'singleInstanceLockUnmodified': True, 'wrapping': True, 'lineNumbers': True,
                    'renderGuttersAbsent': True, 'copyUnchanged': True, 'exportUnchanged': True,
                    'persistence': True, 'defaultsOff': True, 'largeBlockLimit': True, 'combinations': 4,
                    'pageErrors': 0})
                self.write_json(reader_reports / f'reader-{platform}-html-margin-scope.json', {
                    'passed': True, 'checks': 32, 'chromiumSandboxEnabled': True,
                    'pageErrors': 0, 'htmlOnlySpacing': True})
                self.write_json(alternative_reports / f'alternative-{platform}-html-margin-scope.json', {
                    'passed': True, 'checks': 64, 'chromiumSandboxEnabled': True,
                    'pageErrors': 0, 'htmlOnlySpacing': True, 'productionApplication': True,
                    'singleInstanceLockUnmodified': True})
                for directory, app, suffix in ((reader_reports, 'reader', 'html-preview-ui'),
                                                (alternative_reports, 'alternative', 'html-preview')):
                    path = directory / f'{app}-{platform}-{suffix}.json'
                    report = json.loads(path.read_text())
                    report.update(dict.fromkeys(('initialPlacement', 'fullWidth16by9', 'scrollContained',
                                                  'htmlOnlySpacing', 'transparentLoading', 'errorCodeRestored'), True))
                    self.write_json(path, report)

    def test_complete_six_job_collection(self):
        assets, evidence, summaries = release.collect_inputs(self.artifacts, self.version, self.commit)
        self.assertEqual(len(assets), 11)
        self.assertEqual(len(summaries), 6)
        self.assertTrue(all(p.suffix == '.json' for p in evidence.values()))
        self.assertNotIn('SHA256SUM.txt', evidence)

    def legacy_host_capture(self):
        self.version, self.commit = release.LEGACY_HOST_CAPTURE[:2]
        shutil.rmtree(self.artifacts); self.artifacts.mkdir(); self.populate()
        path = self.artifacts / f'reader-linux-{self.version}/verification' / release.LEGACY_HOST_CAPTURE[2]
        original = (Path(__file__).parent / 'fixtures/release/reader-linux-html-preview-host.txt').read_bytes()
        path.write_bytes(original)
        return path, original

    def test_replays_exact_failed_run_and_preserves_auditable_original(self):
        path, original = self.legacy_host_capture()
        with self.assertRaisesRegex(ValueError, path.name + ': invalid verification JSON'):
            release.read_verification_report(path)
        assets, evidence, summaries = release.collect_inputs(self.artifacts, self.version, self.commit)
        self.assertEqual((len(assets), len(summaries)), (11, 6))
        output = self.root / 'evidence.zip'
        with zipfile.ZipFile(output, 'w') as archive:
            release.write_verification_evidence(archive, evidence, self.version, self.commit)
        with zipfile.ZipFile(output) as archive:
            reports = {name: json.loads(archive.read(name)) for name in archive.namelist() if name.endswith('.json')}
            receipt = reports['verification/host-report-recovery.json']
            self.assertEqual(archive.read(receipt['original_capture']), original)
            self.assertEqual(receipt['original_sha256'], release.digest(path))
            self.assertEqual(receipt['report_sha256'], release.hashlib.sha256(archive.read('verification/' + path.name)).hexdigest())
            self.assertEqual(receipt['commit'], self.commit)
            self.assertTrue(reports['verification/' + path.name]['sandbox'])
        self.assertEqual(path.read_bytes(), original)

    def test_recovery_receipt_cannot_shadow_an_original_report(self):
        self.legacy_host_capture()
        _, evidence, _ = release.collect_inputs(self.artifacts, self.version, self.commit)
        receipt = self.root / 'host-report-recovery.json'; self.write_json(receipt, {'original': True})
        evidence[receipt.name] = receipt
        with zipfile.ZipFile(self.root / 'evidence.zip', 'w') as archive:
            with self.assertRaisesRegex(ValueError, 'overwrite original evidence'):
                release.write_verification_evidence(archive, evidence, self.version, self.commit)

    def test_legacy_recovery_rejects_changed_identity_or_any_changed_bytes(self):
        path, original = self.legacy_host_capture()
        for identity in (('1.4.5', self.commit), (self.version, 'b' * 40), None):
            with self.subTest(identity=identity), self.assertRaisesRegex(ValueError, 'invalid verification JSON'):
                release.read_verification_report(path, release_identity=identity)
        other = path.with_name('other.json'); other.write_bytes(original)
        with self.assertRaisesRegex(ValueError, 'invalid verification JSON'):
            release.read_verification_report(other, release_identity=(self.version, self.commit))
        other.unlink()
        for content in (original + b' ', original + b'{}', b'unexpected text\n' + original,
                        original.replace(b'"sandbox":true', b'"sandbox":false'), original[:-3]):
            path.write_bytes(content)
            with self.subTest(content=content[-40:]), self.assertRaisesRegex(ValueError, 'invalid verification JSON'):
                release.collect_inputs(self.artifacts, self.version, self.commit)

    def test_reports_reject_non_objects_invalid_encoding_and_trailing_output(self):
        path = self.root / 'broken-report.json'
        for content in (b'[]', b'null', b'1', b'{}{}', b'{}\nlog output', b'\xff', b'{"passed":'):
            path.write_bytes(content)
            with self.subTest(content=content), self.assertRaisesRegex(ValueError, 'broken-report.json'):
                release.read_verification_report(path)

    def test_record_inputs_rejects_bad_json_before_recording_or_hashing_packages(self):
        path, original = self.legacy_host_capture()
        repository = self.root / 'repository'
        self.write_json(repository / 'apps/reader/package.json', {'version': self.version})
        publication = path.with_name('reader-linux-publication.json'); publication.unlink()
        with patch.object(release, 'digest') as digest, patch.object(release, 'run') as run:
            with self.assertRaisesRegex(ValueError, path.name + ': invalid verification JSON'):
                release.record_inputs(path.parent.parent, 'reader', 'linux', repository)
            digest.assert_not_called(); run.assert_not_called()
        self.assertFalse(publication.exists())
        path.write_text(original.decode('utf-8').splitlines()[-1] + '\n')
        # Native citation checks also leave screenshots beside their JSON.
        (path.parent / 'file-citations-light.png').write_bytes(b'\x89PNG\r\n\x1a\n')
        with patch.object(release, 'run', return_value=self.commit):
            release.record_inputs(path.parent.parent, 'reader', 'linux', repository)
        self.assertEqual(json.loads(publication.read_text())['commit'], self.commit)

    def test_record_inputs_rejects_screenshot_only_directory(self):
        directory = self.root / 'screenshots'; (directory / 'verification').mkdir(parents=True)
        (directory / 'verification/view.png').write_bytes(b'\x89PNG\r\n\x1a\n')
        self.write_json(self.root / 'repository/apps/reader/package.json', {'version': self.version})
        with self.assertRaisesRegex(ValueError, 'At least one verification JSON'):
            release.record_inputs(directory, 'reader', 'linux', self.root / 'repository')

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

    def test_current_release_requires_all_new_compatibility_reports(self):
        self.version = '1.4.3'
        shutil.rmtree(self.artifacts); self.artifacts.mkdir(); self.populate()
        for app, name in [('reader', 'reader-linux-chatgpt.json'), ('reader', 'reader-linux-grok.json'),
                          ('alternative', 'alternative-linux-compat.json')]:
            with self.subTest(report=name):
                report = self.artifacts / f'{app}-linux-{self.version}/verification' / name
                report.unlink()
                with self.assertRaisesRegex(ValueError, 'successful Grok/ChatGPT views'):
                    release.collect_inputs(self.artifacts, self.version, self.commit)
                self.populate()

    def test_current_compatibility_gates_reject_partial_or_unsafe_execution(self):
        self.version = '1.4.3'
        shutil.rmtree(self.artifacts); self.artifacts.mkdir(); self.populate()
        for change in ({'passed': False}, {'views': 3}, {'views': True}, {'networkRequests': 1},
                       {'networkRequests': False}, {'pageErrors': 1}):
            with self.subTest(change=change):
                report = self.artifacts / f'reader-linux-{self.version}/verification/reader-linux-grok.json'
                value = json.loads(report.read_text()); value.update(change); self.write_json(report, value)
                with self.assertRaisesRegex(ValueError, 'successful Grok/ChatGPT views'):
                    release.collect_inputs(self.artifacts, self.version, self.commit)
                self.populate()

    def test_rejects_missing_packaged_speech_evidence(self):
        (self.artifacts / 'alternative-windows-1.4.0/verification/alternative-win32-tts.json').unlink()
        with self.assertRaisesRegex(ValueError, 'packaged CPU speech validation'):
            release.collect_inputs(self.artifacts, self.version, self.commit)

    def test_144_requires_all_native_preview_inline_and_deduplication_reports(self):
        self.version = '1.4.4'
        shutil.rmtree(self.artifacts); self.artifacts.mkdir(); self.populate()
        assets, evidence, summaries = release.collect_inputs(self.artifacts, self.version, self.commit)
        self.assertEqual((len(assets), len(summaries)), (11, 6))
        names = ['reader-linux-inline-html.json', 'alternative-linux-inline-html.json',
                 'reader-linux-deduplication.json', 'alternative-linux-privacy.json']
        for _, platform in release.PLATFORMS:
            names.extend([f'reader-{platform}-html-preview-host.json', f'reader-{platform}-html-preview-ui.json',
                          f'alternative-{platform}-html-preview.json'])
        for name in names:
            with self.subTest(report=name):
                evidence[name].unlink()
                with self.assertRaisesRegex(ValueError, 'required'):
                    release.collect_inputs(self.artifacts, self.version, self.commit)
                self.populate()

    def test_144_rejects_incomplete_or_unsafe_native_preview_evidence(self):
        self.version = '1.4.4'
        shutil.rmtree(self.artifacts); self.artifacts.mkdir(); self.populate()
        cases = [
            ('reader-linux-inline-html.json', {'networkRequests': 1}),
            ('alternative-linux-inline-html.json', {'checks': True}),
            ('reader-win32-html-preview-host.json', {'separateProcess': False}),
            ('reader-linux-html-preview-host.json', {'privateRequestsBlocked': False}),
            ('reader-linux-html-preview-host.json', {'chromiumSandboxEnabled': False}),
            ('reader-linux-html-preview-host.json', {'checks': 10}),
            ('reader-win32-html-preview-ui.json', {'pageErrors': 1}),
            ('reader-win32-html-preview-ui.json', {'chromiumSandboxEnabled': False}),
            ('alternative-win32-html-preview.json', {'noApplicationBridge': False}),
            ('alternative-win32-html-preview.json', {'singleInstanceLockUnmodified': False}),
            ('alternative-linux-html-preview.json', {'externalDisabled': False}),
            ('alternative-linux-html-preview.json', {'eligibleSwitches': True}),
            ('reader-linux-deduplication.json', {'socketlessHarness': True}),
            ('reader-linux-deduplication.json', {'chromiumSandboxEnabled': False}),
            ('reader-linux-deduplication.json', {'checks': []}),
            ('reader-linux-deduplication.json', {'geometry': []}),
            ('alternative-linux-privacy.json', {'uploadToServer': True}),
            ('alternative-linux-privacy.json', {'nativeStarts': False}),
            ('alternative-linux-privacy.json', {'captureRequests': ['synthetic upload']}),
        ]
        for name, change in cases:
            with self.subTest(report=name, change=change):
                path = next(self.artifacts.rglob(name))
                value = json.loads(path.read_text()); value.update(change); self.write_json(path, value)
                with self.assertRaisesRegex(ValueError, 'required'):
                    release.collect_inputs(self.artifacts, self.version, self.commit)
                self.populate()

    def test_144_notes_describe_opt_in_execution_and_current_scope(self):
        notes = release.release_notes('1.4.4', 'example/suite')
        for text in ('VeniceAI', 'Code is selected initially', 'embedded page JavaScript',
                     'enabled by default', 'duplicate cleanup', 'Stale reviews',
                     'without application-functionality or dependency changes'):
            self.assertIn(text, notes)
        self.assertNotIn('HTML and interactive components remain passive and never execute', notes)

    def use_145(self):
        self.version = '1.4.5'
        shutil.rmtree(self.artifacts); self.artifacts.mkdir(); self.populate()

    def test_145_requires_both_native_code_reports_and_geometry_on_both_hosts(self):
        self.use_145()
        assets, evidence, summaries = release.collect_inputs(self.artifacts, self.version, self.commit)
        self.assertEqual((len(assets), len(summaries)), (11, 6))
        for app in ('reader', 'alternative'):
            for _, platform in release.PLATFORMS:
                name = f'{app}-{platform}-code-options.json'
                with self.subTest(report=name):
                    evidence[name].unlink()
                    with self.assertRaisesRegex(ValueError, 'native code presentation is required'):
                        release.collect_inputs(self.artifacts, self.version, self.commit)
                    self.populate()

    def test_145_rejects_missing_unsafe_or_incomplete_code_presentation(self):
        self.use_145()
        reader_booleans = ('passed', 'chromiumSandboxEnabled', 'nativeClipboardExact', 'blockCopyExact',
                           'messageCopyExact', 'wrapFits', 'logicalLineNumbers', 'mermaidSourceRestored',
                           'largeBlockCapped', 'defaultsOff')
        alternative_booleans = ('passed', 'productionApplication', 'chromiumSandboxEnabled',
                                'singleInstanceLockUnmodified', 'wrapping', 'lineNumbers',
                                'renderGuttersAbsent', 'copyUnchanged', 'exportUnchanged', 'persistence',
                                'defaultsOff', 'largeBlockLimit')
        for app, fields in (('reader', reader_booleans), ('alternative', alternative_booleans)):
            cases = [{field: value} for field in fields for value in (False, 1, None)]
            cases.extend([{'pageErrors': 1}, {'pageErrors': False}, {'pageErrors': None}])
            if app == 'alternative':
                cases.extend([{'combinations': 3}, {'combinations': True}, {'combinations': None}])
            if app == 'reader':
                cases.extend([{'checks': True}, {'checks': 3}, {'optionCombinations': 3},
                              {'optionCombinations': True}, {'renderGutterIsolation': {}},
                              {'renderGutterIsolation': {'html': True, 'svg': True, 'mermaid': False}},
                              {'renderGutterIsolation': {'html': True, 'svg': True, 'mermaid': 1}},
                              {'renderGutterIsolation': {'html': True, 'svg': True, 'mermaid': True, 'extra': True}}])
            for _, platform in release.PLATFORMS:
                for change in cases:
                    with self.subTest(app=app, platform=platform, change=change):
                        path = next(self.artifacts.rglob(f'{app}-{platform}-code-options.json'))
                        value = json.loads(path.read_text()); value.update(change); self.write_json(path, value)
                        with self.assertRaisesRegex(ValueError, 'native code presentation is required'):
                            release.collect_inputs(self.artifacts, self.version, self.commit)
                        self.populate()

    def test_145_rejects_stale_or_failed_html_geometry(self):
        self.use_145()
        fields = ('initialPlacement', 'fullWidth16by9', 'scrollContained')
        for app, suffix in (('reader', 'html-preview-ui'), ('alternative', 'html-preview')):
            for _, platform in release.PLATFORMS:
                for field in fields + (('transparentLoading', 'errorCodeRestored', 'htmlOnlySpacing') if app == 'alternative' else ()):
                    for value in (False, 1, None):
                        with self.subTest(app=app, platform=platform, field=field, value=value):
                            path = next(self.artifacts.rglob(f'{app}-{platform}-{suffix}.json'))
                            report = json.loads(path.read_text()); report[field] = value; self.write_json(path, report)
                            with self.assertRaisesRegex(ValueError, 'required'):
                                release.collect_inputs(self.artifacts, self.version, self.commit)
                            self.populate()

    def test_145_requires_successful_paired_html_spacing_comparisons(self):
        self.use_145()
        for app, minimum in (('reader', 32), ('alternative', 64)):
            for _, platform in release.PLATFORMS:
                cases = [{'passed': False}, {'chromiumSandboxEnabled': False}, {'htmlOnlySpacing': False},
                         {'checks': minimum - 1}, {'checks': True}, {'pageErrors': 1}, {'pageErrors': False}]
                if app == 'alternative':
                    cases.extend([{'productionApplication': False}, {'singleInstanceLockUnmodified': False}])
                for change in cases:
                    with self.subTest(app=app, platform=platform, change=change):
                        path = next(self.artifacts.rglob(f'{app}-{platform}-html-margin-scope.json'))
                        report = json.loads(path.read_text()); report.update(change); self.write_json(path, report)
                        with self.assertRaisesRegex(ValueError, 'paired HTML spacing comparisons'):
                            release.collect_inputs(self.artifacts, self.version, self.commit)
                        self.populate()
                path.unlink()
                with self.assertRaisesRegex(ValueError, 'paired HTML spacing comparisons'):
                    release.collect_inputs(self.artifacts, self.version, self.commit)
                self.populate()

    def test_145_requires_full_native_cleanup_review_lifecycle_and_geometry(self):
        self.use_145()
        name = 'reader-linux-deduplication-review.json'
        path = next(self.artifacts.rglob(name)); path.unlink()
        with self.assertRaisesRegex(ValueError, 'native cleanup review lifecycle and layouts'):
            release.collect_inputs(self.artifacts, self.version, self.commit)
        self.populate()
        cases = [{'passed': False}, {'passed': 1}, {'chromiumSandboxEnabled': False},
                 {'socketlessHarness': True}, {'socketlessHarness': 0}, {'socketlessHarness': None},
                 {'pageErrors': ['Synthetic renderer error']}, {'pageErrors': False},
                 {'checks': ['Synthetic check'] * 7}, {'checks': 8}, {'checks': None},
                 {'geometry': [{}] * 41}, {'geometry': 42}, {'geometry': None}]
        for change in cases:
            with self.subTest(change=change):
                report = json.loads(path.read_text()); report.update(change); self.write_json(path, report)
                with self.assertRaisesRegex(ValueError, 'native cleanup review lifecycle and layouts'):
                    release.collect_inputs(self.artifacts, self.version, self.commit)
                self.populate()

    def test_145_notes_describe_cleanup_and_code_preview_changes(self):
        notes = release.release_notes('1.4.5', 'example/suite')
        for text in ('Within a collection', 'distinct IDs', 'VeniceAI', 'Grok', 'visible progress',
                     'Wrap long code lines', 'Show code line numbers', 'display-only', '16:9',
                     '1.4.5 cleanup, code presentation', 'without application-functionality or dependency changes'):
            self.assertIn(text, notes)
        self.assertIn('1.4.5', release.release_title('1.4.5'))
        self.assertNotIn('Stale reviews', notes)

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

    def test_current_release_includes_verified_runtime_source_update_in_single_manifest(self):
        self.version = '1.4.3'
        shutil.rmtree(self.artifacts); self.artifacts.mkdir(); self.populate()
        repository = self.root / 'repository'; repository.mkdir()
        fixture = RuntimeSourceFixture(repository)
        for app in release.APPS:
            self.write_json(repository / 'apps' / app / 'package.json', {
                'name': app, 'version': self.version, 'devDependencies': {'electron': '45.2.3'}})
        self.write_json(repository / 'tools/release-versions.json', dict.fromkeys(release.APPS, self.version))
        (repository / 'docs').mkdir()
        (repository / 'docs/index.html').write_text('<title>Synthetic offline manual</title>')
        def git(*args):
            return subprocess.check_output(['git', *args], cwd=repository, text=True, stderr=subprocess.DEVNULL).strip()
        git('init'); git('config', 'user.name', 'Synthetic Fixture'); git('config', 'user.email', 'fixture@example.invalid')
        git('add', '.'); git('commit', '-m', 'Synthetic release fixture'); git('tag', 'v1.4.3')
        self.commit = git('rev-parse', 'HEAD'); self.populate()
        original_run = release.run
        def run(*args, **kwargs):
            if str(args[0]) == release.sys.executable:
                return fixture.build(*args, **kwargs)
            return original_run(*args, **kwargs)
        output = self.root / 'assembled'
        with patch.object(release, 'run', side_effect=run):
            version, ledger = release.assemble(self.artifacts, output, 'v1.4.3', 'example/suite', 'https://example.invalid/run', repository)
        self.assertEqual(version, self.version)
        self.assertEqual(len(ledger), 18)
        manifest = (output / 'SHA256SUM.txt').read_text().splitlines()
        self.assertEqual(len(manifest), 17)
        self.assertIn(f'{release.digest(output / fixture.name)}  {fixture.name}', manifest)
        with zipfile.ZipFile(output / 'ThreadShelf-Local-Suite-1.4.3-Verification-Evidence.zip') as archive:
            receipt = json.loads(archive.read('verification/runtime-source-update.json'))
            self.assertEqual(receipt['sha256'], release.digest(output / fixture.name))
        self.assertIn(fixture.name, (output / 'ThreadShelf-Local-Suite-1.4.3-Verification.md').read_text())


class RuntimeSourceFixture:
    """A tiny source companion, with no real downloads or build execution."""
    def __init__(self, root):
        self.root = root
        self.directory = root / 'maintainer/runtime-source-update'
        self.directory.mkdir(parents=True)
        self.manifest = self.directory / 'manifest.json'
        self.manifest.write_text(json.dumps({'schema_version': 1, 'suite_version': '1.4.3', 'electron_version': '45.2.3'}))
        (self.directory / 'build-source-update.py').write_text('# Synthetic builder; mocked in tests.\n')
        (self.directory / 'update-runtime-sources.py').write_text('# Synthetic offline updater.\n')
        for app in release.APPS:
            path = root / 'apps' / app / 'package.json'; path.parent.mkdir(parents=True)
            path.write_text(json.dumps({'devDependencies': {'electron': '45.2.3'}}))
        self.name = 'ThreadShelf-Local-Suite-1.4.3-Runtime-Source-Update.tar.gz'
        self.receipt_changes = {}
        self.omit = set()
        self.extra = None
        self.extra_output = False

    def build(self, *args, **kwargs):
        args = tuple(map(str, args))
        assert args == (release.sys.executable, str(self.directory / 'build-source-update.py'),
                        '--out', args[3], '--version', '1.4.3')
        assert kwargs['cwd'] == self.root
        output = Path(args[3]); path = output / self.name
        with tarfile.open(path, 'w:gz') as archive:
            for name in ('manifest.json', 'update-runtime-sources.py'):
                if name not in self.omit:
                    archive.add(self.directory / name, 'runtime-source-update/' + name)
            if self.extra:
                name, content, kind = self.extra
                info = tarfile.TarInfo(name); info.type = kind
                if kind == tarfile.REGTYPE:
                    info.size = len(content); archive.addfile(info, io.BytesIO(content))
                else:
                    info.linkname = content; archive.addfile(info)
        if self.extra_output:
            (output / 'unexpected-source.txt').write_text('unlisted')
        receipt = {'schema': 'threadshelf-runtime-source-update-v1', 'version': '1.4.3', 'electron': '45.2.3',
                   'file_name': self.name, 'bytes': path.stat().st_size, 'sha256': release.digest(path),
                   'manifest_sha256': release.digest(self.manifest), 'verified': True}
        return json.dumps({**receipt, **self.receipt_changes})


class RuntimeSourceUpdateTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='threadshelf-runtime-fixture-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.fixture = RuntimeSourceFixture(self.root)
        self.output = self.root / 'out'; self.output.mkdir()

    def invoke(self):
        with patch.object(release, 'run', side_effect=self.fixture.build):
            return release.build_runtime_source_update(self.output, '1.4.3', self.root)

    def test_required_source_inputs_cannot_be_omitted(self):
        self.fixture.manifest.unlink()
        with self.assertRaisesRegex(ValueError, 'tagged runtime source-update inputs'):
            self.invoke()

    def test_source_version_must_cover_all_three_app_runtimes(self):
        path = self.root / 'apps/analytics/package.json'
        path.write_text(json.dumps({'devDependencies': {'electron': '45.1.0'}}))
        with self.assertRaisesRegex(ValueError, 'analytics: runtime source-update Electron'):
            self.invoke()

    def test_wrong_release_or_manifest_receipt_is_rejected(self):
        for change in ({'version': '1.4.2'}, {'electron': '45.1.0'}, {'verified': False}, {'manifest_sha256': 'f' * 64}):
            with self.subTest(change=change):
                self.fixture.receipt_changes = change
                with self.assertRaisesRegex(ValueError, 'builder verification'):
                    self.invoke()
                shutil.rmtree(self.output); self.output.mkdir()

    def test_wrong_archive_hash_or_size_is_rejected(self):
        for change in ({'sha256': 'f' * 64}, {'bytes': 1}, {'file_name': '../outside.tar.gz'}):
            with self.subTest(change=change):
                self.fixture.receipt_changes = change
                with self.assertRaises(ValueError):
                    self.invoke()
                shutil.rmtree(self.output); self.output.mkdir()

    def test_unlisted_output_cannot_enter_release_ledger(self):
        self.fixture.extra_output = True
        with self.assertRaisesRegex(ValueError, 'output bytes'):
            self.invoke()

    def test_missing_or_duplicate_archived_provenance_is_rejected(self):
        self.fixture.omit = {'update-runtime-sources.py'}
        with self.assertRaisesRegex(ValueError, 'missing its tagged manifest'):
            self.invoke()
        shutil.rmtree(self.output); self.output.mkdir()
        self.fixture.omit.clear()
        self.fixture.extra = ('runtime-source-update/manifest.json', b'{}', tarfile.REGTYPE)
        with self.assertRaisesRegex(ValueError, 'unsafe or duplicate'):
            self.invoke()

    def test_archive_traversal_and_links_are_rejected(self):
        for extra in [('runtime-source-update/../outside', b'x', tarfile.REGTYPE),
                      ('runtime-source-update/link', '../../outside', tarfile.SYMTYPE)]:
            with self.subTest(extra=extra):
                self.fixture.extra = extra
                with self.assertRaisesRegex(ValueError, 'unsafe or duplicate'):
                    self.invoke()
                shutil.rmtree(self.output); self.output.mkdir()

    def test_builder_failure_is_not_treated_as_optional(self):
        with patch.object(release, 'run', side_effect=subprocess.CalledProcessError(1, ['fixture'])):
            with self.assertRaises(subprocess.CalledProcessError):
                release.build_runtime_source_update(self.output, '1.4.3', self.root)


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
