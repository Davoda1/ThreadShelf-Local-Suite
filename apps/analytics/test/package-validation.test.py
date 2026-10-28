#!/usr/bin/env python3
"""Focused release-validator regressions: python3 tests/package-validation.test.py."""
import importlib.util
import io
import os
from pathlib import Path
import shutil
import stat
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile


sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location(
    'package_validator', Path(__file__).resolve().parents[1] / 'scripts/validate-packages.py')
VALIDATOR = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = VALIDATOR
SPEC.loader.exec_module(VALIDATOR)


class NativeEntrypointTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='threadshelf-package-validation-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.stage = self.root / 'stage'
        self.stage.mkdir()
        self.links = VALIDATOR.LINUX_PORTABLE_LINKS
        self.make_layout(self.links)

    def make_layout(self, links):
        for name, target in links.items():
            entry = self.stage / name
            destination = self.stage / VALIDATOR.posixpath.normpath(
                str(VALIDATOR.PurePosixPath(name).parent / target))
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile('/bin/true', destination)
            destination.chmod(0o755)
            entry.parent.mkdir(parents=True, exist_ok=True)
            entry.symlink_to(target)
        self.link = self.stage / next(iter(links))
        self.binary = self.link.resolve()

    def archive(self, mutate=None, additions=(), prefix=''):
        archive = self.root / 'fixture.tar.gz'
        with tarfile.open(archive, 'w:gz', dereference=False) as stream:
            for path in sorted(self.stage.rglob('*')):
                relative = path.relative_to(self.stage).as_posix()
                name = prefix + '/' + relative if prefix else relative
                entry = stream.gettarinfo(str(path), arcname=name)
                data = path.read_bytes() if entry.isfile() else None
                if mutate:
                    result = mutate(relative, entry, data)
                    if result is None:
                        continue
                    entry, data = result
                stream.addfile(entry, io.BytesIO(data) if data is not None else None)
            for entry, data in additions:
                stream.addfile(entry, io.BytesIO(data) if data is not None else None)
        return archive

    def check(self, archive=None, **kwargs):
        return VALIDATOR.verify_archive(archive or self.archive(), self.stage,
                                        approved_links=self.links, **kwargs)

    def assert_stage_rejected(self):
        with self.assertRaises(ValueError):
            VALIDATOR.snapshot(self.stage, self.links)

    def replace_link(self, target):
        self.link.unlink()
        self.link.symlink_to(target)

    def test_portable_relative_link_and_native_file_have_distinct_types(self):
        entries = VALIDATOR.snapshot(self.stage, self.links)
        self.assertIsInstance(entries['threadshelf-local-analytics'], VALIDATOR.SymlinkEntry)
        self.assertIsInstance(entries['app/threadshelf-local-analytics'], VALIDATOR.FileEntry)
        self.assertEqual(self.check()['nativeEntrypointSymlinkChecks'], len(self.links))

    def test_prefixed_portable_archive(self):
        self.assertEqual(self.check(self.archive(prefix='ThreadShelf'), prefix='ThreadShelf')
                         ['nativeEntrypointSymlinkChecks'], len(self.links))

    def test_deb_relative_link_stays_inside_installation_root(self):
        shutil.rmtree(self.stage)
        self.stage.mkdir()
        self.links = VALIDATOR.DEB_LINKS
        self.make_layout(self.links)
        self.assertEqual(self.check()['nativeEntrypointSymlinkChecks'], len(self.links))

    def test_link_survives_relocation(self):
        relocated = self.root / 'arbitrary location' / 'reader'
        shutil.copytree(self.stage, relocated, symlinks=True)
        self.assertEqual(os.readlink(relocated / 'threadshelf-local-analytics'),
                         'app/threadshelf-local-analytics')
        self.assertEqual(VALIDATOR.snapshot(relocated, self.links),
                         VALIDATOR.snapshot(self.stage, self.links))

    def test_default_snapshot_rejects_all_links(self):
        with self.assertRaises(ValueError):
            VALIDATOR.snapshot(self.stage)

    def test_only_exact_packaging_link_policies_are_supported(self):
        with self.assertRaises(ValueError):
            VALIDATOR.snapshot(self.stage, {'threadshelf-local-analytics': str(self.binary)})

    def test_wrong_relative_target(self):
        self.replace_link('app/../app/threadshelf-local-analytics')
        self.assert_stage_rejected()

    def test_absolute_target(self):
        self.replace_link(str(self.binary))
        self.assert_stage_rejected()

    def test_escaping_target(self):
        self.replace_link('../outside')
        self.assert_stage_rejected()
        with self.assertRaises(ValueError):
            VALIDATOR.verify_native_link_target(self.stage, 'threadshelf-local-analytics', '../outside')

    def test_missing_link(self):
        self.link.unlink()
        self.assert_stage_rejected()

    def test_script_substituted_for_link(self):
        self.link.unlink()
        self.link.write_text('#!/bin/sh\nexec app/threadshelf-local-analytics "$@"\n')
        self.assert_stage_rejected()

    def test_binary_substituted_for_link(self):
        self.link.unlink()
        shutil.copyfile(self.binary, self.link)
        self.assert_stage_rejected()

    def test_directory_substituted_for_link(self):
        self.link.unlink()
        self.link.mkdir()
        self.assert_stage_rejected()

    def test_unapproved_extra_link(self):
        (self.stage / 'other').symlink_to('app/threadshelf-local-analytics')
        self.assert_stage_rejected()

    def test_dangling_link(self):
        self.binary.unlink()
        self.assert_stage_rejected()

    def test_chained_link(self):
        real = self.binary.with_name('real')
        self.binary.rename(real)
        self.binary.symlink_to('real')
        self.assert_stage_rejected()

    def test_linked_parent_directory(self):
        (self.stage / 'app').rename(self.stage / 'actual')
        (self.stage / 'app').symlink_to('actual', target_is_directory=True)
        self.assert_stage_rejected()

    def test_directory_target(self):
        self.binary.unlink()
        self.binary.mkdir()
        self.assert_stage_rejected()

    def test_non_executable_target(self):
        self.binary.chmod(0o644)
        self.assert_stage_rejected()

    def test_script_target(self):
        self.binary.write_bytes(b'#!/bin/sh\nexit 0\n')
        self.assert_stage_rejected()

    def test_other_architecture_target(self):
        header = bytearray(self.binary.read_bytes())
        header[18:20] = (183).to_bytes(2, 'little')
        self.binary.write_bytes(header)
        self.assert_stage_rejected()

    def test_archive_wrong_link_target(self):
        def mutate(name, entry, data):
            if name == 'threadshelf-local-analytics':
                entry.linkname = '../outside'
            return entry, data
        with self.assertRaises(ValueError):
            self.check(self.archive(mutate))

    def test_archive_regular_file_substitutes_link(self):
        def mutate(name, entry, data):
            if name == 'threadshelf-local-analytics':
                entry.type = tarfile.REGTYPE
                data = b'app/threadshelf-local-analytics'
                entry.size = len(data)
            return entry, data
        with self.assertRaises(ValueError):
            self.check(self.archive(mutate))

    def test_archive_directory_substitutes_link(self):
        def mutate(name, entry, data):
            if name == 'threadshelf-local-analytics':
                entry.type = tarfile.DIRTYPE
            return entry, data
        with self.assertRaises(ValueError):
            self.check(self.archive(mutate))

    def test_archive_hardlink_is_not_accepted_as_symlink(self):
        def mutate(name, entry, data):
            if name == 'threadshelf-local-analytics':
                entry.type = tarfile.LNKTYPE
            return entry, data
        with self.assertRaises(ValueError):
            self.check(self.archive(mutate))

    def test_archive_link_substitutes_regular_native_file(self):
        def mutate(name, entry, data):
            if name == 'app/threadshelf-local-analytics':
                entry.type = tarfile.SYMTYPE
                entry.linkname = '../threadshelf-local-analytics'
                entry.size = 0
                data = None
            return entry, data
        with self.assertRaises(ValueError):
            self.check(self.archive(mutate))

    def test_archive_link_mode_mismatch(self):
        def mutate(name, entry, data):
            if name == 'threadshelf-local-analytics':
                entry.mode = 0o644
            return entry, data
        with self.assertRaises(ValueError):
            self.check(self.archive(mutate))

    def test_archive_omitted_native_target(self):
        def mutate(name, entry, data):
            return None if name == 'app/threadshelf-local-analytics' else (entry, data)
        with self.assertRaises(ValueError):
            self.check(self.archive(mutate))

    def test_archive_duplicate_link(self):
        extra = tarfile.TarInfo('./threadshelf-local-analytics')
        extra.type = tarfile.SYMTYPE
        extra.mode = 0o777
        extra.linkname = 'app/threadshelf-local-analytics'
        with self.assertRaises(ValueError):
            self.check(self.archive(additions=[(extra, None)]))

    def test_archive_traversal(self):
        extra = tarfile.TarInfo('../outside')
        extra.type = tarfile.SYMTYPE
        extra.linkname = 'app/threadshelf-local-analytics'
        with self.assertRaises(ValueError):
            self.check(self.archive(additions=[(extra, None)]))

    def test_launcher_script_rejected_even_if_it_matches_staging(self):
        (self.stage / 'start.sh').write_text('#!/bin/sh\nexit 0\n')
        with self.assertRaisesRegex(ValueError, 'launcher script'):
            self.check()

    def test_extensionless_shebang_launcher_rejected_in_both_portable_entry_directories(self):
        for relative in ['launch', 'app/launch']:
            with self.subTest(relative=relative):
                script = self.stage / relative
                script.write_text('#!/bin/sh\nexit 0\n')
                with self.assertRaisesRegex(ValueError, 'launcher script'):
                    self.check()
                script.unlink()

    def test_script_suffixes_rejected_in_public_runtime_directory_without_shebang(self):
        for suffix in ['sh', 'bash', 'zsh', 'ksh', 'cmd', 'bat', 'ps1', 'vbs', 'js', 'mjs', 'cjs', 'py', 'MJS']:
            with self.subTest(suffix=suffix):
                script = self.stage / 'app' / ('launch.' + suffix)
                script.write_text('script contents do not need a shebang')
                with self.assertRaisesRegex(ValueError, 'launcher script'):
                    self.check()
                script.unlink()

    def test_bundled_application_source_and_utilities_are_not_launcher_directories(self):
        source = self.stage / 'app/resources/app/src/main.js'
        source.parent.mkdir(parents=True)
        source.write_text('console.log("application source");')
        utility = self.stage / 'app/resources/app/vendor/tools/helper.py'
        utility.parent.mkdir(parents=True)
        utility.write_text('#!/usr/bin/python3\npass\n')
        self.assertEqual(self.check()['launcherScriptDirectoriesChecked'], ['.', 'bin', 'app'])

    def test_deb_script_launchers_rejected_in_command_and_runtime_directories(self):
        shutil.rmtree(self.stage)
        self.stage.mkdir()
        self.links = VALIDATOR.DEB_LINKS
        self.make_layout(self.links)
        for relative in ['usr/bin/launch', 'opt/threadshelf-local-analytics/launch.py']:
            with self.subTest(relative=relative):
                script = self.stage / relative
                script.write_text('#!/usr/bin/python3\npass\n')
                with self.assertRaisesRegex(ValueError, 'launcher script'):
                    self.check()
                script.unlink()

    def test_windows_public_root_rejects_script_launchers(self):
        shutil.rmtree(self.stage)
        self.stage.mkdir()
        (self.stage / 'ThreadShelf Local Analytics.exe').write_bytes(b'MZ fixture')
        archive = self.root / 'Windows-fixture.zip'
        for name, contents in [('launch.vbs', 'WScript.Echo "launcher"'),
                               ('launch.js', 'console.log("launcher");'),
                               ('launch.cmd', '@echo off\r\n'),
                               ('launch.CMD', '@echo off\r\n'),
                               ('launch', '#!/bin/sh\nexit 0\n')]:
            with self.subTest(name=name):
                script = self.stage / name
                script.write_text(contents)
                with zipfile.ZipFile(archive, 'w') as stream:
                    for path in self.stage.iterdir():
                        stream.write(path, path.name)
                with self.assertRaisesRegex(ValueError, 'launcher script'):
                    VALIDATOR.verify_archive(archive, self.stage)
                script.unlink()

    def test_windows_bundled_npm_cmd_shim_is_not_a_root_launcher(self):
        shutil.rmtree(self.stage)
        self.stage.mkdir()
        (self.stage / 'ThreadShelf Local Analytics.exe').write_bytes(b'MZ fixture')
        shim = self.stage / 'resources/app/node_modules/.bin/marked.cmd'
        shim.parent.mkdir(parents=True)
        shim.write_text('@echo off\r\nnode "%~dp0../marked/bin/marked.js" %*\r\n')
        archive = self.root / 'Windows-fixture.zip'
        with zipfile.ZipFile(archive, 'w') as stream:
            for path in self.stage.rglob('*'):
                if path.is_file():
                    stream.write(path, path.relative_to(self.stage).as_posix())
        result = VALIDATOR.verify_archive(archive, self.stage)
        self.assertTrue(result['stagingByteMatches'])
        self.assertEqual(result['launcherScriptDirectoriesChecked'], ['.'])

    def test_zip_symlinks_rejected(self):
        archive = self.root / 'fixture.zip'
        with zipfile.ZipFile(archive, 'w') as stream:
            stream.write(self.binary, 'app/threadshelf-local-analytics')
            entry = zipfile.ZipInfo('threadshelf-local-analytics')
            entry.create_system = 3
            entry.external_attr = (stat.S_IFLNK | 0o777) << 16
            stream.writestr(entry, 'app/threadshelf-local-analytics')
        with self.assertRaisesRegex(ValueError, 'unsupported ZIP object'):
            self.check(archive)

    def test_portable_archive_rejects_default_app_even_when_staging_matches(self):
        default_app = self.stage / 'app/resources/default_app.asar'
        default_app.parent.mkdir(parents=True)
        default_app.write_bytes(b'Unwanted Electron default application')
        with self.assertRaisesRegex(ValueError, 'Electron default application is included'):
            self.check(self.archive(prefix='ThreadShelf'), prefix='ThreadShelf')

    def test_archive_omission_is_checked_independently_of_stale_staging(self):
        default_app = self.stage / 'app/resources/default_app.asar'
        default_app.parent.mkdir(parents=True)
        default_app.write_bytes(b'Stale managed staging file')
        def omit_default(name, entry, data):
            return None if name == 'app/resources/default_app.asar' else (entry, data)
        self.assertTrue(self.check(self.archive(omit_default))['omittedDefaultApp'])

    def test_windows_archive_rejects_default_app_even_when_staging_matches(self):
        shutil.rmtree(self.stage)
        self.stage.mkdir()
        (self.stage / 'ThreadShelf Local Analytics.exe').write_bytes(b'MZ fixture')
        default_app = self.stage / 'resources/default_app.asar'
        default_app.parent.mkdir()
        default_app.write_bytes(b'Unwanted Electron default application')
        archive = self.root / 'Windows-fixture.zip'
        with zipfile.ZipFile(archive, 'w') as stream:
            for path in self.stage.rglob('*'):
                if path.is_file():
                    stream.write(path, path.relative_to(self.stage).as_posix())
        with self.assertRaisesRegex(ValueError, 'Electron default application is included'):
            VALIDATOR.verify_archive(archive, self.stage)

    def test_deb_archive_checks_default_app_in_actual_payload(self):
        shutil.rmtree(self.stage)
        self.stage.mkdir()
        self.links = VALIDATOR.DEB_LINKS
        self.make_layout(self.links)
        for include_default in [False, True]:
            with self.subTest(include_default=include_default):
                if include_default:
                    default_app = self.stage / 'opt/threadshelf-local-analytics/resources/default_app.asar'
                    default_app.parent.mkdir()
                    default_app.write_bytes(b'Unwanted Electron default application')
                archive = self.root / 'fixture.deb'
                archive.write_bytes(self.archive().read_bytes())
                class Process:
                    stdout = archive.open('rb')
                    def wait(self): return 0
                with patch.object(VALIDATOR.subprocess, 'Popen', return_value=Process()):
                    if include_default:
                        with self.assertRaisesRegex(ValueError, 'Electron default application is included'):
                            VALIDATOR.verify_archive(archive, self.stage, deb=True, approved_links=self.links)
                    else:
                        self.assertTrue(VALIDATOR.verify_archive(
                            archive, self.stage, deb=True, approved_links=self.links)['stagingByteMatches'])


class LicenseInputTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='threadshelf-license-inputs-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source, self.app = self.root / 'source', self.root / 'app'
        for directory in [self.source, self.app]:
            license_file = directory / 'licenses/npm/current/LICENSE'
            license_file.parent.mkdir(parents=True)
            license_file.write_bytes(b'Current dependency license')

    def check(self):
        with patch.object(VALIDATOR, 'ROOT', self.source):
            return VALIDATOR.verify_license_inputs(self.app)

    def test_retained_inputs_and_generated_target_metadata_are_allowed(self):
        self.assertEqual(self.check(), 1)
        (self.app / 'licenses/DEPENDENCIES.json').write_text('{"target":"linux-x64"}')
        self.assertEqual(self.check(), 1)

    def test_unexpected_stale_dependency_license_is_rejected(self):
        stale = self.app / 'licenses/npm/old-version/LICENSE'
        stale.parent.mkdir()
        stale.write_bytes(b'Old dependency license')
        with self.assertRaisesRegex(ValueError, 'Unexpected packaged license inputs'):
            self.check()

    def test_metadata_exception_does_not_allow_nested_extra_files(self):
        (self.app / 'licenses/npm/DEPENDENCIES.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'Unexpected packaged license inputs'):
            self.check()

    def test_missing_or_changed_retained_input_is_rejected(self):
        retained = self.app / 'licenses/npm/current/LICENSE'
        for contents in [None, b'Changed license']:
            with self.subTest(contents=contents):
                if contents is None:
                    retained.unlink()
                else:
                    retained.write_bytes(contents)
                with self.assertRaisesRegex(ValueError, 'stale or missing'):
                    self.check()


class PortableDocumentationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='threadshelf-documentation-validation-')
        self.addCleanup(self.temp.cleanup)
        self.stage = Path(self.temp.name)
        readme = (VALIDATOR.ROOT / 'README.md').read_text().replace(
            '[MIT License](LICENSE)', '[MIT License](APPLICATION-LICENSE)')
        (self.stage / 'README.md').write_text(readme)
        shutil.copyfile(VALIDATOR.ROOT / 'LICENSE', self.stage / 'APPLICATION-LICENSE')
        shutil.copyfile(VALIDATOR.ROOT / 'THIRD-PARTY-NOTICES.md', self.stage / 'THIRD-PARTY-NOTICES.md')
        shutil.copytree(VALIDATOR.ROOT / 'docs', self.stage / 'docs')
        (self.stage / 'LICENSE').write_text('Separate Electron runtime license fixture\n')

    def test_application_license_is_distinct_from_electron_license(self):
        result = VALIDATOR.verify_portable_documentation(self.stage)
        self.assertEqual(result['applicationLicense'], 'APPLICATION-LICENSE')
        self.assertTrue(result['readmeLocalLinksExist'])
        self.assertEqual((self.stage / 'LICENSE').read_text(), 'Separate Electron runtime license fixture\n')

    def test_readme_must_not_link_application_license_to_electron_license(self):
        shutil.copyfile(VALIDATOR.ROOT / 'README.md', self.stage / 'README.md')
        with self.assertRaisesRegex(ValueError, 'wrong application license'):
            VALIDATOR.verify_portable_documentation(self.stage)

    def test_missing_or_changed_application_license_is_rejected(self):
        license_file = self.stage / 'APPLICATION-LICENSE'
        for contents in [None, 'Unrelated license\n']:
            with self.subTest(contents=contents):
                if contents is None:
                    license_file.unlink()
                else:
                    license_file.write_text(contents)
                with self.assertRaisesRegex(ValueError, 'application license is missing or changed'):
                    VALIDATOR.verify_portable_documentation(self.stage)

    def test_missing_linked_document_is_rejected(self):
        (self.stage / 'docs/Packaging-Policy.md').unlink()
        with self.assertRaisesRegex(ValueError, 'README link is missing'):
            VALIDATOR.verify_portable_documentation(self.stage)


class DebRuntimeProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='threadshelf-deb-runtime-validation-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.cache = self.root / 'cache'
        self.cache.mkdir()
        self.runtime = self.root / 'deb/opt/threadshelf-local-analytics'
        self.runtime.mkdir(parents=True)
        self.version = '44.9.1'
        self.archive = self.cache / f'electron-v{self.version}-linux-x64.zip'
        with zipfile.ZipFile(self.archive, 'w') as archive:
            for name, data in [('electron', b'\x7fELF runtime fixture'), ('LICENSE', b'Electron license fixture'),
                               ('LICENSES.chromium.html', b'Chromium notice fixture')]:
                archive.writestr(name, data)
                target = 'threadshelf-local-analytics' if name == 'electron' else name
                (self.runtime / target).write_bytes(data)
            archive.writestr('resources/default_app.asar', b'Intentionally omitted Electron default application')
        checksum = VALIDATOR.file_digest(self.archive)[1]
        (self.cache / 'SHASUMS256.txt').write_text(f'{checksum}  {self.archive.name}\n')

    def test_deb_runtime_is_checked_against_the_official_linux_archive(self):
        result = VALIDATOR.verify_packaged_runtime(self.cache, 'deb', self.runtime, self.version)
        self.assertEqual(result['package'], 'deb')
        self.assertEqual(result['platform'], 'linux')
        self.assertEqual(result['officialFilesVerified'], 3)
        self.assertNotIn('omittedDefaultApp', result)

    def test_changed_deb_runtime_is_rejected_even_when_tar_runtime_would_be_valid(self):
        (self.runtime / 'threadshelf-local-analytics').write_bytes(b'\x7fELF altered fixture')
        with self.assertRaisesRegex(ValueError, 'Runtime mismatch: linux/electron'):
            VALIDATOR.verify_packaged_runtime(self.cache, 'deb', self.runtime, self.version)

    def test_staging_runtime_does_not_claim_archive_default_application_omission(self):
        default_app = self.runtime / 'resources/default_app.asar'
        default_app.parent.mkdir()
        default_app.write_bytes(b'Intentionally omitted Electron default application')
        result = VALIDATOR.verify_packaged_runtime(self.cache, 'deb', self.runtime, self.version)
        self.assertNotIn('omittedDefaultApp', result)


if __name__ == '__main__':
    unittest.main(verbosity=2)
