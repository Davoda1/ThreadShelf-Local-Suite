#!/usr/bin/env python3
"""CPU asset staging and package validation use the same verified bytes."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent

def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

BUILD = load('alternative_build_test', 'build.py')
VALIDATE = load('alternative_validate_test', 'validate-packages.py')

class TtsPackaging(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='alternative-tts-package-')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.assets = self.base / 'prepared'
        common = {'models/voice.bin': b'model', 'licenses/model.txt': b'license'}
        for platform in ('linux-x64', 'win32-x64'):
            files = {**common, 'engines/pocket/engine.bin': platform.encode(), 'runtime/python/runtime.bin': b'runtime'}
            records = []
            for name, data in files.items():
                destination = self.assets / ('common' if name in common else platform) / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(data)
                records.append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'mode': 420})
            (self.assets / platform / 'asset-inventory.json').write_text(json.dumps({'onnxruntime': '1.31.1', 'files': records}))

    def test_stage_is_exact_and_platform_specific(self):
        for platform, expected_engine in [('linux', b'linux-x64'), ('win32', b'win32-x64')]:
            target = self.base / platform
            BUILD._tts_stage.stage(self.assets, platform, target)
            self.assertEqual((target / 'engines/pocket/engine.bin').read_bytes(), expected_engine)
            hashes = VALIDATE.tts_payload_hashes(BUILD, self.assets, platform)
            actual = {'resources/tts-assets/' + item.relative_to(target).as_posix(): BUILD.digest(item) for item in target.rglob('*') if item.is_file()}
            self.assertEqual(actual, hashes)
            with self.assertRaisesRegex(RuntimeError, 'must be empty'):
                BUILD._tts_stage.stage(self.assets, platform, target)

    def test_manifest_bytes_match_validation_on_windows_text_writes(self):
        original_open = Path.open

        def windows_text_open(path, mode='r', *args, **kwargs):
            if 'w' in mode and 'b' not in mode and kwargs.get('newline') is None:
                kwargs['newline'] = '\r\n'
            return original_open(path, mode, *args, **kwargs)

        for platform in ('win32', 'linux'):
            with self.subTest(platform=platform):
                target = self.base / ('windows-text-' + platform)
                with patch.object(Path, 'open', windows_text_open):
                    BUILD._tts_stage.stage(self.assets, platform, target)
                manifest = (target / 'PACKAGED-ASSETS.json').read_bytes()
                self.assertNotIn(b'\r\n', manifest)
                expected = VALIDATE.tts_payload_hashes(BUILD, self.assets, platform)
                actual = {'resources/tts-assets/' + item.relative_to(target).as_posix(): BUILD.digest(item)
                          for item in target.rglob('*') if item.is_file()}
                self.assertEqual(actual, expected)

    def test_corrupt_and_unlisted_assets_are_rejected(self):
        model = self.assets / 'common/models/voice.bin'
        model.write_bytes(b'corrupt')
        with self.assertRaisesRegex(RuntimeError, 'inventory mismatch'):
            BUILD._tts_stage.inventory(self.assets, 'linux')
        model.write_bytes(b'model')
        extra = self.assets / 'common/models/unlisted.bin'
        extra.write_bytes(b'unknown')
        with self.assertRaisesRegex(RuntimeError, 'complete prepared inventory'):
            BUILD._tts_stage.inventory(self.assets, 'linux')

    def test_runtime_keeps_worker_and_excludes_build_inputs(self):
        files = BUILD.production_file_paths()
        self.assertIn('tts/index.cjs', files)
        self.assertIn('tts/cpu/voice_light.py', files)
        for excluded in ['tts/test.cjs', 'tts/cpu/test_cpu.cjs', 'tts/cpu/prepare_assets.py', 'tts/cpu/assets-manifest.json']:
            self.assertNotIn(excluded, files)
        VALIDATE.no_launchers(['resources/app/tts/cpu/voice_light.py', 'resources/tts-assets/runtime/python/package.py'])
        with self.assertRaisesRegex(AssertionError, 'Runtime package contains script'):
            VALIDATE.no_launchers(['launch.py'])

    def test_source_excludes_prepared_payloads(self):
        original = BUILD.ROOT
        self.addCleanup(setattr, BUILD, 'ROOT', original)
        BUILD.ROOT = self.base / 'source'
        BUILD.ROOT.mkdir()
        (BUILD.ROOT / 'package.json').write_text('{}')
        prepared = BUILD.ROOT / 'custom-payload'
        prepared.mkdir()
        (prepared / 'model.bin').write_bytes(b'model')
        work, output, cache = [self.base / name for name in ('work', 'output', 'cache')]
        output.mkdir()
        BUILD.source_archives(output, work, cache, prepared)
        import tarfile
        with tarfile.open(output / (BUILD.PREFIX + '-Source.tar.gz')) as archive:
            names = archive.getnames()
        self.assertEqual(names, [BUILD.PREFIX + '-Source/package.json'])

if __name__ == '__main__':
    unittest.main()
