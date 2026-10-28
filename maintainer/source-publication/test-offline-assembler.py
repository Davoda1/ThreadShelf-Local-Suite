#!/usr/bin/env python3
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import stat
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location('assembler', Path(__file__).with_name('assemble-runtime-sources.py'))
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def tar(members, trailing=b''):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w') as archive:
        for row in members:
            name, kind, payload, mode = row
            member = tarfile.TarInfo(name)
            member.mode = mode
            if kind == 'file':
                member.size = len(payload)
                archive.addfile(member, io.BytesIO(payload))
            elif kind == 'dir':
                member.type = tarfile.DIRTYPE
                archive.addfile(member)
            elif kind == 'link':
                member.type = tarfile.SYMTYPE
                member.linkname = payload
                archive.addfile(member)
            elif kind == 'hardlink':
                member.type = tarfile.LNKTYPE
                member.linkname = payload
                archive.addfile(member)
    # Put hidden bytes inside the first buffered 10KiB tar block after end marker.
    data = output.getvalue()
    if trailing:
        data = data[:2048] + trailing + data[2048 + len(trailing):]
    return gzip.compress(data, mtime=0)


class AssemblerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.source = self.root / 'parts'
        self.source.mkdir()
        self.manifest = self.source / 'SOURCE-MANIFEST.json'
        self.dest = self.root / 'assembled'

    def tearDown(self):
        self.tmp.cleanup()

    def collection(self, groups):
        parts, sources = [], []
        for i, group in enumerate(groups, 1):
            name = f'Sources-{i:02}.zip'
            records = []
            with zipfile.ZipFile(self.source / name, 'w', compression=zipfile.ZIP_STORED) as package:
                for j, item in enumerate(group, 1):
                    path, members, *prefix = item
                    data = members if isinstance(members, bytes) else tar(members)
                    row = {'archive': f'source-{i}-{j}.tar.gz', 'path': path, 'archive_prefix': prefix[0] if prefix else '', 'size': len(data), 'sha256': sha(data)}
                    records.append(row)
                    sources.append({**row, 'part': name})
                    package.writestr('archives/' + row['archive'], data)
                package.writestr('PART-MANIFEST.json', json.dumps({'part': name, 'sources': records}))
            data = (self.source / name).read_bytes()
            parts.append({'file': name, 'size': len(data), 'sha256': sha(data)})
        manifest = {'schema_version': 2, 'collection_complete': True, 'source_count': len(sources), 'part_count': len(parts), 'parts': parts, 'sources': sources}
        self.manifest.write_text(json.dumps(manifest))
        return manifest

    def rewrite_part(self, name, transform):
        file = self.source / name
        with zipfile.ZipFile(file) as package:
            members = [(item.filename, package.read(item)) for item in package.infolist()]
        members = transform(members)
        with zipfile.ZipFile(file, 'w', compression=zipfile.ZIP_STORED) as package:
            for member, data in members:
                package.writestr(member, data)
        manifest = json.loads(self.manifest.read_text())
        for part in manifest['parts']:
            if part['file'] == name:
                part.update(size=file.stat().st_size, sha256=sha(file.read_bytes()))
        self.manifest.write_text(json.dumps(manifest))

    def basic(self):
        return self.collection([[('src', [('main.c', 'file', b'hello\n', 0o644), ('run.sh', 'file', b'executable\n', 0o755), ('nested', 'dir', None, 0o755), ('alias', 'link', 'nested/data', 0o777)])], [('src/nested', [('data', 'file', b'payload', 0o644)])]])

    def test_verify_and_extract_bytes_modes_and_deferred_links(self):
        self.basic()
        report = a.run(self.manifest)
        self.assertEqual(report['status'], 'verified-logical-assembly')
        self.assertFalse(self.dest.exists())
        report = a.run(self.manifest, destination=self.dest)
        self.assertEqual(report['source_archive_count'], 2)
        self.assertEqual((self.dest / 'src/alias').read_bytes(), b'payload')
        self.assertEqual(stat.S_IMODE((self.dest / 'src/run.sh').stat().st_mode), 0o755)
        self.assertEqual(json.loads((self.dest / a.REPORT_NAME).read_text())['status'], 'assembled-unpatched')

    def test_missing_or_corrupt_outer_part(self):
        self.basic()
        (self.source / 'Sources-02.zip').unlink()
        with self.assertRaises(a.SourceError):
            a.run(self.manifest, destination=self.dest)
        self.assertFalse(self.dest.exists())

    def test_wrong_outer_hash(self):
        self.basic()
        with (self.source / 'Sources-01.zip').open('ab') as stream:
            stream.write(b'extra')
        with self.assertRaises(a.SourceError):
            a.run(self.manifest)

    def test_inner_archive_hash_checked_separately(self):
        self.basic()
        def change(members):
            return [(name, b'X' + data[1:] if name.startswith('archives/') else data) for name, data in members]
        self.rewrite_part('Sources-01.zip', change)
        with self.assertRaises((a.SourceError, gzip.BadGzipFile)):
            a.run(self.manifest)

    def test_embedded_identity_mismatch(self):
        self.basic()
        def change(members):
            result = []
            for name, data in members:
                if name == 'PART-MANIFEST.json':
                    row = json.loads(data)
                    row['sources'][0]['path'] = 'changed'
                    data = json.dumps(row).encode()
                result.append((name, data))
            return result
        self.rewrite_part('Sources-01.zip', change)
        with self.assertRaises(a.SourceError):
            a.run(self.manifest)

    def test_extra_zip_member_refused(self):
        self.basic()
        self.rewrite_part('Sources-01.zip', lambda rows: rows + [('unexpected', b'bad')])
        with self.assertRaises(a.SourceError):
            a.run(self.manifest)

    def test_duplicate_zip_member_refused(self):
        self.basic()
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)
            self.rewrite_part('Sources-01.zip', lambda rows: rows + [rows[0]])
        with self.assertRaises(a.SourceError):
            a.run(self.manifest)

    def test_manifest_counts_and_incomplete_flag_refused(self):
        manifest = self.basic()
        for key, value in [('source_count', 3), ('part_count', 1), ('collection_complete', False)]:
            changed = dict(manifest)
            changed[key] = value
            self.manifest.write_text(json.dumps(changed))
            with self.assertRaises(a.SourceError):
                a.run(self.manifest)

    def test_cross_archive_file_overlap(self):
        self.collection([[('src', [('same', 'file', b'one', 0o644)])], [('src', [('same', 'file', b'two', 0o644)])]])
        with self.assertRaises(a.SourceError):
            a.run(self.manifest, destination=self.dest)
        self.assertFalse(self.dest.exists())

    def test_cross_archive_nondirectory_ancestor(self):
        self.collection([[('src', [('nested', 'file', b'one', 0o644)])], [('src/nested', [('child', 'file', b'two', 0o644)])]])
        with self.assertRaises(a.SourceError):
            a.run(self.manifest)

    def test_symlink_chain_escape_after_expansion(self):
        self.collection([[('src', [('short', 'link', '..', 0o777)])], [('src/nested', [('escape', 'link', '../short/../../outside', 0o777)])]])
        with self.assertRaises(a.SourceError):
            a.run(self.manifest)

    def test_symlink_cycle(self):
        self.collection([[('src', [('a', 'link', 'b', 0o777), ('b', 'link', 'a', 0o777)])]])
        with self.assertRaises(a.SourceError):
            a.run(self.manifest)

    def test_parent_windows_drive_and_unc_paths(self):
        for bad in ['../outside', 'C:/outside', '//server/share', 'nested\\outside', 'file:stream']:
            with self.subTest(path=bad):
                self.collection([[('src', [(bad, 'file', b'data', 0o644)])]])
                with self.assertRaises(a.SourceError):
                    a.run(self.manifest)

    def test_existing_destination_is_untouched(self):
        self.basic()
        self.dest.mkdir()
        (self.dest / 'mine').write_text('retain')
        with self.assertRaises(a.SourceError):
            a.run(self.manifest, destination=self.dest)
        self.assertEqual((self.dest / 'mine').read_text(), 'retain')

    def test_destination_symlink_refused(self):
        self.basic()
        elsewhere = self.root / 'elsewhere'
        elsewhere.mkdir()
        self.dest.symlink_to(elsewhere)
        with self.assertRaises(a.SourceError):
            a.run(self.manifest, destination=self.dest)
        self.assertEqual(list(elsewhere.iterdir()), [])

    def test_repository_wrapper_symlink_refused(self):
        self.collection([[('src', [('wrapper', 'link', 'other', 0o777)], 'wrapper/')]])
        with self.assertRaises(a.SourceError):
            a.run(self.manifest)

    def test_buffered_nonzero_tar_tail_refused(self):
        data = tar([('file', 'file', b'data', 0o644)], trailing=b'hidden')
        self.collection([[('src', data)]])
        with self.assertRaises(a.SourceError):
            a.run(self.manifest)

    def test_hardlink_refused(self):
        self.collection([[('src', [('data', 'file', b'abc', 0o644), ('alias', 'hardlink', 'data', 0o644)])]])
        with self.assertRaises(a.SourceError):
            a.run(self.manifest)

    def patch_collection(self, reverse=False):
        patch1 = b'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+middle\n'
        patch2 = b'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-middle\n+new\n'
        config = [{'repo': 'src', 'patch_dir': 'src/electron/patches/chromium'}]
        order = b'2.patch\n1.patch\n' if reverse else b'1.patch\n2.patch\n'
        self.collection([[('src', [('file.txt', 'file', b'old\n', 0o644)])], [('src/electron', [('patches/config.json', 'file', json.dumps(config).encode(), 0o644), ('patches/chromium/.patches', 'file', order, 0o644), ('patches/chromium/1.patch', 'file', patch1, 0o644), ('patches/chromium/2.patch', 'file', patch2, 0o644)])]])

    @unittest.skipUnless(shutil.which('git'), 'Git required')
    def test_real_ordered_patch_application(self):
        self.patch_collection()
        with patch.dict(a.os.environ, {'GIT_DIR': '/nonexistent-host-repository', 'GIT_WORK_TREE': '/incorrect', 'GIT_CONFIG_PARAMETERS': "'apply.whitespace=error'"}):
            report = a.run(self.manifest, destination=self.dest, apply=True)
        self.assertEqual(report['status'], 'assembled-and-patched')
        self.assertEqual((self.dest / 'src/file.txt').read_bytes(), b'new\n')
        self.assertEqual(len(report['patches']), 2)

    @unittest.skipUnless(shutil.which('git'), 'Git required')
    def test_incorrect_patch_order_keeps_incomplete_state(self):
        self.patch_collection(reverse=True)
        with self.assertRaises(a.subprocess.CalledProcessError):
            a.run(self.manifest, destination=self.dest, apply=True)
        self.assertEqual(json.loads((self.dest / a.REPORT_NAME).read_text())['status'], 'incomplete')

    def test_destination_populated_during_verification_is_untouched(self):
        self.basic()
        original = a.check_outer_parts
        def changed(*args):
            original(*args)
            self.dest.mkdir()
            (self.dest / 'new-user-file').write_bytes(b'retain')
        with patch.object(a, 'check_outer_parts', changed):
            with self.assertRaises(a.SourceError):
                a.run(self.manifest, destination=self.dest)
        self.assertEqual((self.dest / 'new-user-file').read_bytes(), b'retain')
        self.assertEqual(len(list(self.dest.iterdir())), 1)

    @unittest.skipUnless(shutil.which('git'), 'Git required')
    def test_unlisted_unified_patch_target_rejected_before_application(self):
        contents = b'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+middle\n--- a/other.txt\n+++ b/other.txt\n@@ -1 +1 @@\n-old\n+injected\n'
        config = [{'repo': 'src', 'patch_dir': 'src/electron/patches/chromium'}]
        self.collection([[('src', [('file.txt', 'file', b'old\n', 0o644), ('other.txt', 'file', b'old\n', 0o644)])], [('src/electron', [('patches/config.json', 'file', json.dumps(config).encode(), 0o644), ('patches/chromium/.patches', 'file', b'1.patch\n', 0o644), ('patches/chromium/1.patch', 'file', contents, 0o644)])]])
        with self.assertRaises(a.SourceError):
            a.run(self.manifest, destination=self.dest, apply=True)
        self.assertEqual((self.dest / 'src/file.txt').read_bytes(), b'old\n')
        self.assertEqual((self.dest / 'src/other.txt').read_bytes(), b'old\n')

    def test_patch_symlink_mode_and_git_metadata_refused(self):
        for data in [b'diff --git a/link b/link\nnew file mode 120000\n', b'diff --git a/.git/config b/.git/config\n', b'diff --git a/link b/link\nindex 000000..abcdef 120000\n']:
            with self.assertRaises(a.SourceError):
                a.checked_patch_paths(data, 'src')

    def test_changed_second_pass_bytes_rejected_before_patches(self):
        self.basic()
        original = a.inspect_archive
        def altered(package, row, inventory, destination=None):
            if destination is not None:
                inventory.db.execute("UPDATE entries SET sha256=? WHERE path='src/main.c'", ('0' * 64,))
            return original(package, row, inventory, destination)
        with patch.object(a, 'inspect_archive', altered), patch.object(a, 'apply_patches') as apply:
            with self.assertRaises(a.SourceError):
                a.run(self.manifest, destination=self.dest, apply=True)
            apply.assert_not_called()
        self.assertEqual(json.loads((self.dest / a.REPORT_NAME).read_text())['status'], 'incomplete')


if __name__ == '__main__':
    unittest.main(verbosity=2)
