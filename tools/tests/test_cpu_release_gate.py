"""Validate the native speech gate without downloading models or running workers."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location('validate_suite', Path(__file__).resolve().parents[1] / 'validate-suite.py')
validation = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validation)


class NativeSpeechGateTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='threadshelf-speech-gate-')
        self.addCleanup(self.temporary.cleanup)
        self.runtime = Path(self.temporary.name) / 'relocated package'
        (self.runtime / 'resources/tts-assets').mkdir(parents=True)
        self.module = self.runtime / 'resources/app/tts/cpu.cjs'
        self.module.parent.mkdir(parents=True)
        self.module.write_text('// Synthetic packaged module fixture.\n')
        self.executable = self.runtime / 'threadshelf-local-reader'
        self.manifest = {'version': '1.4.0'}

    def gate(self):
        return validation.cpu_speech(self.runtime, self.executable, 'reader', 'linux',
                                     self.manifest, {}, [])

    def test_both_harnesses_select_packaged_module_and_assets(self):
        valid = json.dumps({'ok': True, 'platform': 'linux', 'onnxruntime': '1.31.1'})
        with patch.object(validation, 'run_checked', return_value=valid) as run:
            report = self.gate()
        self.assertTrue(report['passed'])
        self.assertTrue(report['packagedModuleExecuted'])
        self.assertEqual(set(report['cases']), {'buffered', 'streaming'})
        self.assertEqual(run.call_count, 2)
        for call in run.call_args_list:
            command, _, environment, _ = call.args
            self.assertEqual(command[0], str(self.executable))
            self.assertEqual(command[-2:], ['--assets', str(self.runtime / 'resources/tts-assets')])
            self.assertEqual(environment['THREADSHELF_CPU_MODULE'], str(self.module))
            self.assertEqual(environment['ELECTRON_RUN_AS_NODE'], '1')

    def test_missing_packaged_module_is_not_replaced_with_source(self):
        self.module.unlink()
        with patch.object(validation, 'run_checked') as run:
            with self.assertRaisesRegex(ValueError, 'packaged module and assets'):
                self.gate()
            run.assert_not_called()

    def test_wrong_runtime_or_failed_harness_cannot_pass(self):
        valid = {'ok': True, 'platform': 'linux', 'onnxruntime': '1.31.1'}
        for change in ({'ok': False}, {'platform': 'win32'}, {'onnxruntime': '1.0.0'}):
            with self.subTest(change=change), patch.object(validation, 'run_checked', return_value=json.dumps({**valid, **change})):
                with self.assertRaisesRegex(ValueError, 'selected native host'):
                    self.gate()


if __name__ == '__main__':
    unittest.main()
