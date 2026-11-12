"""Focused public 1.4.6 release-note identity and scope regressions."""
import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location('release_146_notes', Path(__file__).resolve().parents[1] / 'assemble-release.py')
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


class Release146NotesTests(unittest.TestCase):
    def test_current_fix_describes_bounded_public_analytics(self):
        notes = release.release_notes('1.4.6', 'Davoda1/ThreadShelf-Local-Suite')
        self.assertIn('Reader, Analytics and Alternative are now **1.4.6**.', notes)
        self.assertIn('**2 GiB**', notes)
        self.assertIn("public edition's full text", notes)
        self.assertIn('content version remains 1.4.5', notes)
        self.assertIn('corrected davoda1 attribution', notes)
        self.assertNotIn('without application-functionality or dependency changes', notes)
        self.assertIn('/v1.4.6/ThreadShelf-Local-Suite-1.4.6-Runtime-Source-Update.tar.gz', notes)

    def test_release_title_identifies_the_fix(self):
        self.assertEqual(release.release_title('1.4.6'),
                         'ThreadShelf Local Suite 1.4.6 — Reliable Reader imports and bounded Analytics')

    def test_previous_release_keeps_its_original_scope(self):
        notes = release.release_notes('1.4.5', 'Davoda1/ThreadShelf-Local-Suite')
        self.assertIn('without application-functionality or dependency changes', notes)
        self.assertNotIn("public edition's full text", notes)


if __name__ == '__main__':
    unittest.main()
