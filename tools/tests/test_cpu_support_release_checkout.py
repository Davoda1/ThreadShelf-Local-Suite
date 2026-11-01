"""Hash-locked speech support files survive Windows and Unix Git checkouts."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]


class SpeechSupportCheckoutTests(unittest.TestCase):
    def test_manifest_bytes_survive_git_line_ending_conversion(self):
        git = shutil.which('git')
        self.assertIsNotNone(git, 'Git is required to verify release checkout integrity.')
        environment = {key: value for key, value in os.environ.items() if not key.startswith('GIT_')}
        environment.update({'GIT_CONFIG_GLOBAL': os.devnull, 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_ATTR_NOSYSTEM': '1'})
        with tempfile.TemporaryDirectory(prefix='threadshelf speech checkout ') as temporary:
            base = Path(temporary)
            source = base / 'source'
            source.mkdir()
            shutil.copyfile(ROOT / '.gitattributes', source / '.gitattributes')
            expected = []
            for app in ('reader', 'alternative'):
                cpu = Path('apps') / app / 'tts/cpu'
                manifest = json.loads((ROOT / cpu / 'support-manifest.json').read_text(encoding='utf-8'))
                self.assertTrue(manifest['files'])
                for entry in manifest['files']:
                    relative = cpu / 'support' / entry['path']
                    data = (ROOT / relative).read_bytes()
                    self.assertEqual(len(data), entry['size'], relative.as_posix())
                    self.assertEqual(hashlib.sha256(data).hexdigest(), entry['sha256'], relative.as_posix())
                    destination = source / relative
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_bytes(data)
                    expected.append((relative, entry))

            def run(*args):
                result = subprocess.run([git, *args], cwd=source, env=environment,
                                        capture_output=True, text=True, timeout=30)
                self.assertEqual(result.returncode, 0, result.stderr)

            run('init', '--quiet')
            run('config', 'core.longpaths', 'true')
            run('config', 'core.autocrlf', 'false')
            run('config', 'core.safecrlf', 'false')
            run('add', '--all')
            for autocrlf in ('false', 'true'):
                with self.subTest(autocrlf=autocrlf):
                    checkout = base / ('checkout-' + autocrlf)
                    checkout.mkdir()
                    run('config', 'core.autocrlf', autocrlf)
                    run('checkout-index', '--all', '--prefix=' + checkout.as_posix() + '/')
                    for relative, entry in expected:
                        data = (checkout / relative).read_bytes()
                        self.assertEqual(len(data), entry['size'], relative.as_posix())
                        self.assertEqual(hashlib.sha256(data).hexdigest(), entry['sha256'], relative.as_posix())


if __name__ == '__main__':
    unittest.main()
