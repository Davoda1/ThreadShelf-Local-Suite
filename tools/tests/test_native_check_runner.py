"""Native-check orchestration regressions; no GUI or network required."""
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('native_check', ROOT / 'tools/run-native-check.py')
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


class NativeCheckRunnerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.report = Path(self.temporary.name) / 'verification/result.json'

    def run_child(self, action, code=0):
        def child(command, *, cwd, env, check):
            self.assertEqual(command, ['synthetic-child'])
            self.assertFalse(check)
            action()
            return subprocess.CompletedProcess(command, code)
        return native.run_report(['synthetic-child'], self.report, env={}, runner=child)

    def write_report(self, value=None):
        self.report.write_text(json.dumps({'passed': True} if value is None else value), encoding='utf-8')

    def test_success_requires_a_new_separate_json_report(self):
        self.report.parent.mkdir()
        self.report.write_text('{"passed":true,"stale":true}')

        def action():
            self.assertFalse(self.report.exists())
            self.write_report({'passed': True, 'fresh': True})
        self.assertEqual(self.run_child(action), {'passed': True, 'fresh': True})

    def test_successful_stdout_cannot_replace_a_missing_report(self):
        with self.assertRaises(FileNotFoundError):
            self.run_child(lambda: None)

    def test_previous_success_cannot_survive_a_child_that_writes_nothing(self):
        self.report.parent.mkdir()
        self.write_report()
        with self.assertRaises(FileNotFoundError):
            self.run_child(lambda: self.assertFalse(self.report.exists()))
        self.assertFalse(self.report.exists())

    def test_failed_child_removes_even_a_new_success_report(self):
        with self.assertRaisesRegex(RuntimeError, 'code 7'):
            self.run_child(self.write_report, code=7)
        self.assertFalse(self.report.exists())

    def test_malformed_or_diagnostic_contaminated_json_is_rejected(self):
        for text in ['not JSON', 'Chromium diagnostic\n{"passed":true}', '{"passed":true}\n{"passed":true}']:
            with self.subTest(text=text):
                with self.assertRaises(json.JSONDecodeError):
                    self.run_child(lambda: self.report.write_text(text))
                self.assertFalse(self.report.exists())

    def test_failed_missing_or_wrong_type_success_flags_are_rejected(self):
        for value in [{'passed': False}, {}, {'passed': 1}, {'passed': 'true'}, [], True, None]:
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    self.run_child(lambda: self.report.write_text(json.dumps(value)))
                self.assertFalse(self.report.exists())

    def test_oversized_report_is_rejected_without_parsing(self):
        def action():
            with self.report.open('wb') as stream:
                stream.truncate(native.MAX_REPORT_BYTES + 1)
        with self.assertRaises(ValueError):
            self.run_child(action)
        self.assertFalse(self.report.exists())

    def test_empty_report_is_rejected(self):
        with self.assertRaises(ValueError):
            self.run_child(lambda: self.report.touch())
        self.assertFalse(self.report.exists())

    def test_report_symlink_is_rejected_without_touching_its_target(self):
        target = Path(self.temporary.name) / 'outside.json'
        target.write_text('{"passed":true}')
        self.report.parent.mkdir()
        try:
            self.report.symlink_to(target)
        except OSError as error:
            self.skipTest(f'This host cannot create a synthetic symlink: {error}')
        with self.assertRaises(ValueError):
            self.run_child(lambda: self.fail('Child must not run'))
        self.assertEqual(target.read_text(), '{"passed":true}')

    def test_child_created_symlink_cannot_be_evidence(self):
        target = Path(self.temporary.name) / 'outside.json'
        target.write_text('{"passed":true}')
        def action():
            try:
                self.report.symlink_to(target)
            except OSError as error:
                self.skipTest(f'This host cannot create a synthetic symlink: {error}')
        with self.assertRaises(ValueError):
            self.run_child(action)
        self.assertFalse(self.report.exists())
        self.assertEqual(target.read_text(), '{"passed":true}')

    def test_report_directory_symlink_cannot_create_or_overwrite_external_files(self):
        outside = Path(self.temporary.name) / 'outside'
        outside.mkdir()
        alias = Path(self.temporary.name) / 'alias'
        try:
            alias.symlink_to(outside, target_is_directory=True)
        except OSError as error:
            self.skipTest(f'This host cannot create a synthetic symlink: {error}')
        report = alias / 'not-created' / 'result.json'
        with self.assertRaisesRegex(ValueError, 'directory'):
            native.run_report(['synthetic-child'], report, env={}, runner=lambda *args, **kwargs: self.fail('Child must not run'))
        self.assertEqual(list(outside.iterdir()), [])

    def test_each_configured_check_has_an_existing_script_and_direct_report(self):
        self.assertEqual(len(native.CHECKS), 8)
        for (app, check), (kind, script, report_env) in native.CHECKS.items():
            with self.subTest(app=app, check=check):
                self.assertTrue((ROOT / script).is_file())
                self.assertIn(report_env, (ROOT / script).read_text(encoding='utf-8'))
                self.assertIn(kind, ('node', 'electron'))

    def test_linux_uses_display_and_windows_uses_native_argument_paths(self):
        electron = Path('runtime with spaces/electron')
        command = native.check_command('reader', 'html-preview-host', 'linux', electron, node='node', xvfb='xvfb-run')
        self.assertEqual(command[:3], ['xvfb-run', '-a', str(electron)])
        command = native.check_command('reader', 'code-options', 'win32', electron, node='node.exe')
        self.assertEqual(command[0], 'node.exe')
        self.assertEqual(command[1], str(ROOT / native.CHECKS['reader', 'code-options'][1]))

    def test_unsupported_combinations_and_missing_display_fail_closed(self):
        for app, check, platform in [('unknown', 'code-options', 'linux'), ('alternative', 'privacy', 'win32')]:
            with self.assertRaises(ValueError):
                native.check_command(app, check, platform, Path('electron'), node='node', xvfb='xvfb-run')
        with self.assertRaisesRegex(ValueError, 'xvfb-run'):
            native.check_command('reader', 'code-options', 'linux', Path('electron'), node='node')

    def test_workflow_keeps_checks_independent_but_publication_failure_sensitive(self):
        workflow = (ROOT / '.github/workflows/build.yml').read_text(encoding='utf-8')
        block = workflow.split('      - name: Verify Reader native HTML isolation\n', 1)[1]
        block, publication = block.split('      - name: Record exact publication inputs\n', 1)
        # A failed focused check must not hide the remaining focused failures.
        # It must still fail the job, preventing publication inputs/artifacts.
        self.assertEqual(block.count("steps.native_runtime.outcome == 'success'"), 8)
        self.assertEqual(block.count('!cancelled()'), 8)
        self.assertNotIn('continue-on-error', block)
        self.assertNotIn('if:', publication.split('  publish:', 1)[0])
        for app, check in native.CHECKS:
            self.assertEqual(block.count(f'--app {app} --check {check} '), 1)

    def test_workflow_run_titles_describe_the_release_instead_of_a_commit_message(self):
        expected = {
            'build.yml': 'ThreadShelf Local Suite ${{ github.ref_name }} — Desktop packages',
            'checks.yml': 'ThreadShelf Local Suite — Source and compatibility checks',
            'publish-release.yml': 'ThreadShelf Local Suite ${{ inputs.tag }} — Release publication',
        }
        for filename, title in expected.items():
            with self.subTest(workflow=filename):
                workflow = (ROOT / '.github/workflows' / filename).read_text(encoding='utf-8')
                matches = re.findall(r'^run-name:\s*(.+)$', workflow, re.MULTILINE)
                self.assertEqual(matches, [title])
                self.assertNotIn('head_commit', matches[0])


if __name__ == '__main__':
    unittest.main()
