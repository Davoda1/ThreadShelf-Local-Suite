#!/usr/bin/env python3
import importlib.util
import sqlite3
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('source_symlinks', ROOT / 'validate-source-symlinks.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def tree(**links):
    result = {path: {'kind': 'dir', 'link': None} for path in ['src', 'src/sub', 'src/other', 'c']}
    result['src/file'] = {'kind': 'file', 'link': None}
    result.update({path.replace('__', '/'): {'kind': 'symlink', 'link': target} for path, target in links.items()})
    return result


class SymlinkSafety(unittest.TestCase):
    def test_simple_internal_relative_link(self):
        entries = tree(src__sub__link='../file')
        self.assertEqual(m.resolve_link('src/sub/link', entries)['resolved'], 'src/file')

    def test_expands_link_before_parent_component(self):
        entries = tree(alias='src/sub', link='alias/../file')
        # Lexical normalization would produce'file'; POSIX resolves'src/file'.
        self.assertEqual(m.resolve_link('link', entries)['resolved'], 'src/file')

    def test_chained_links_are_resolved(self):
        entries = tree(a='src/sub', b='a/../other', c_link='b/../file')
        self.assertEqual(m.resolve_link('c_link', entries)['resolved'], 'src/file')

    def test_chain_can_escape_despite_each_lexical_target_being_inside(self):
        entries = tree(b='src/..', a='b/c/../..')
        # b resolves to the root. Then a traverses c, root, root's parent.
        with self.assertRaisesRegex(m.UnsafeAssembly, 'escapes assembly'):
            m.resolve_link('a', entries)

    def test_dangling_internal_target_is_recorded(self):
        entries = tree(src__dangling='missing/child')
        result = m.resolve_link('src/dangling', entries)
        self.assertTrue(result['dangling'])
        self.assertEqual(result['resolved'], 'src/missing/child')

    def test_dangling_parent_path_cannot_hide_escape(self):
        entries = tree(src__bad='missing/../../..')
        with self.assertRaises(m.UnsafeAssembly):
            m.resolve_link('src/bad', entries)

    def test_cycles_and_expanding_cycles_require_review(self):
        for entries in [tree(a='b', b='a'), tree(a='a/child')]:
            with self.subTest(entries=entries), self.assertRaises(m.UnsafeAssembly):
                m.resolve_link('a', entries, max_expansions=40)

    def test_nondirectory_parent_cannot_be_traversed(self):
        entries = tree(src__bad='file/../other')
        with self.assertRaisesRegex(m.UnsafeAssembly, 'nondirectory'):
            m.resolve_link('src/bad', entries)

    def test_unsafe_link_representations_rejected(self):
        for target in ['/outside', 'C:/outside', '..\\outside', '\\server\\share', 'bad\0path', 'bad\npath', '']:
            with self.subTest(target=target), self.assertRaises(m.UnsafeAssembly):
                m.resolve_link('src/link', tree(src__link=target))

    def test_database_mode_is_read_only_and_ancestor_types_validated(self):
        with tempfile.TemporaryDirectory() as temp:
            db = Path(temp) / 'inventory.sqlite'
            with self.assertRaises(sqlite3.OperationalError):
                m.load_entries(db)
            self.assertFalse(db.exists())
            with sqlite3.connect(db) as connection:
                connection.execute('CREATE TABLE entries(path TEXT,kind TEXT,link TEXT)')
                connection.executemany('INSERT INTO entries VALUES(?,?,?)', [('src', 'file', None), ('src/child', 'file', None)])
            with self.assertRaisesRegex(m.UnsafeAssembly, 'nondirectory assembly ancestor'):
                m.validate(db)

    def test_read_only_completed_database_report(self):
        with tempfile.TemporaryDirectory() as temp:
            db = Path(temp) / 'inventory.sqlite'
            entries = tree(src__sub__link='../file')
            with sqlite3.connect(db) as connection:
                connection.execute('CREATE TABLE entries(path TEXT,kind TEXT,link TEXT)')
                connection.executemany('INSERT INTO entries VALUES(?,?,?)', [(path, row['kind'], row['link']) for path, row in entries.items()])
            report = m.validate(db)
            self.assertTrue(report['passed'])
            self.assertEqual(report['symlink_count'], 1)
            self.assertEqual(report['dangling_symlink_count'], 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
