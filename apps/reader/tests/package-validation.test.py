#!/usr/bin/env python3
"""Focused release-validator regressions: python3 tests/package-validation.test.py."""
import importlib.util
import hashlib
import io
import json
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

class MermaidManifestTests(unittest.TestCase):
    def test_exact_bundle_bytes_match_the_recorded_manifest(self):
        self.check_bundle_mutation(False)

    def test_windows_newline_conversion_is_rejected(self):
        self.check_bundle_mutation(True)

    def check_bundle_mutation(self, mutate):
        canonical = b'/* synthetic diagram renderer */\nglobalThis.mermaid = {};\n'
        manifest = {'bundle': {'file': 'mermaid.min.js', 'bytes': len(canonical),
                               'sha256': hashlib.sha256(canonical).hexdigest()}}
        with tempfile.TemporaryDirectory() as temporary:
            app = Path(temporary)
            bundle = app / 'dist/mermaid.min.js'
            manifest_file = app / 'licenses/Mermaid-BUNDLE-MANIFEST.json'
            bundle.parent.mkdir(parents=True)
            manifest_file.parent.mkdir(parents=True)
            bundle.write_bytes(canonical.replace(b'\n', b'\r\n') if mutate else canonical)
            manifest_file.write_text(json.dumps(manifest), encoding='utf-8')
            if mutate:
                with self.assertRaisesRegex(ValueError, 'does not match the dependency manifest'):
                    VALIDATOR.verify_mermaid_bundle(app)
            else:
                self.assertEqual(VALIDATOR.verify_mermaid_bundle(app)['sha256'], manifest['bundle']['sha256'])


class ToolchainSelectionTests(unittest.TestCase):
    def setUp(self):
        self.pkg = {'devDependencies': {'electron': '44.9.0'}}

    def test_manifest_pin_is_used_when_no_runtime_was_selected(self):
        self.assertEqual(VALIDATOR.selected_electron_version(self.pkg, environ={}), '44.9.0')

    def test_selected_runtime_overrides_manifest_and_explicit_argument_overrides_environment(self):
        environment = {'TSLR_ELECTRON_VERSION': '44.10.0'}
        self.assertEqual(VALIDATOR.selected_electron_version(self.pkg, environ=environment), '44.10.0')
        self.assertEqual(VALIDATOR.selected_electron_version(self.pkg, 'v45.0.0', environment), '45.0.0')
        self.assertEqual(self.pkg['devDependencies']['electron'], '44.9.0')

    def test_mutable_tags_prereleases_and_paths_are_not_runtime_versions(self):
        for value in ('latest', '^44.9.0', '44.9.0-beta.1', '../44.9.0', ''):
            with self.subTest(version=value), self.assertRaises(ValueError):
                VALIDATOR.selected_electron_version(self.pkg, value, {})


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
        self.assertIsInstance(entries['threadshelf-local-reader'], VALIDATOR.SymlinkEntry)
        self.assertEqual(entries['bin/threadshelf-local-reader'],
                         VALIDATOR.SymlinkEntry('../app/threadshelf-local-reader'))
        self.assertIsInstance(entries['app/threadshelf-local-reader'], VALIDATOR.FileEntry)
        self.assertEqual(self.check()['nativeEntrypointSymlinkChecks'], 2)

    def test_prefixed_portable_archive(self):
        self.assertEqual(self.check(self.archive(prefix='ThreadShelf'), prefix='ThreadShelf')
                         ['nativeEntrypointSymlinkChecks'], 2)

    def test_default_app_is_rejected_from_prefixed_tar_even_when_staging_matches(self):
        default = self.stage / 'app/resources/default_app.asar'
        default.parent.mkdir(parents=True)
        default.write_bytes(b'unwanted Electron default application')
        with self.assertRaisesRegex(ValueError, 'default application must be omitted'):
            self.check(self.archive(prefix='ThreadShelf'), prefix='ThreadShelf')

    def test_clean_archive_can_omit_a_default_app_retained_in_managed_staging(self):
        default = self.stage / 'app/resources/default_app.asar'
        default.parent.mkdir(parents=True)
        default.write_bytes(b'stale managed staging entry')
        archive = self.archive(lambda name, entry, data:
                               None if name == 'app/resources/default_app.asar' else (entry, data))
        self.assertTrue(self.check(archive)['omittedDefaultApp'])

    def test_default_app_is_rejected_from_windows_zip_even_when_staging_matches(self):
        shutil.rmtree(self.stage)
        self.stage.mkdir()
        (self.stage / 'ThreadShelf Local Reader.exe').write_bytes(b'MZ fixture')
        default = self.stage / 'resources/default_app.asar'
        default.parent.mkdir()
        default.write_bytes(b'unwanted Electron default application')
        archive = self.root / 'Windows-fixture.zip'
        with zipfile.ZipFile(archive, 'w') as stream:
            for path in self.stage.rglob('*'):
                if path.is_file():
                    stream.write(path, path.relative_to(self.stage).as_posix())
        with self.assertRaisesRegex(ValueError, 'default application must be omitted'):
            VALIDATOR.verify_archive(archive, self.stage)

    def test_default_app_is_rejected_from_actual_deb_stream_even_when_staging_matches(self):
        shutil.rmtree(self.stage)
        self.stage.mkdir()
        self.links = VALIDATOR.DEB_LINKS
        self.make_layout(self.links)
        default = self.stage / 'opt/threadshelf-local-reader/resources/default_app.asar'
        default.parent.mkdir()
        default.write_bytes(b'unwanted Electron default application')
        archive = self.archive()
        class Process:
            stdout = archive.open('rb')
            def wait(self): return 0
        with patch.object(VALIDATOR.subprocess, 'Popen', return_value=Process()), \
             self.assertRaisesRegex(ValueError, 'default application must be omitted'):
            self.check(archive, deb=True)

    def test_deb_relative_link_stays_inside_installation_root(self):
        shutil.rmtree(self.stage)
        self.stage.mkdir()
        self.links = VALIDATOR.DEB_LINKS
        self.make_layout(self.links)
        self.assertEqual(self.check()['nativeEntrypointSymlinkChecks'], 1)

    def test_transformers_prebuilt_runtime_is_rejected_from_prefixed_tar(self):
        bundle = self.stage / 'app/resources/app/node_modules/@huggingface/transformers/dist/transformers.node.mjs'
        bundle.parent.mkdir(parents=True)
        bundle.write_bytes(b'Embedded obsolete ONNX Web runtime fixture')
        with self.assertRaisesRegex(ValueError, 'Transformers prebuilt distributions must be omitted'):
            self.check(self.archive(prefix='ThreadShelf'), prefix='ThreadShelf')

    def test_transformers_source_and_license_are_preserved(self):
        package = self.stage / 'app/resources/app/node_modules/@huggingface/transformers'
        (package / 'src').mkdir(parents=True)
        (package / 'src/transformers.js').write_bytes(b'export const sourceFixture = true;')
        (package / 'LICENSE').write_bytes(b'Upstream license fixture')
        self.assertTrue(self.check()['omittedTransformersPrebuiltDistributions'])

    def test_transformers_prebuilt_runtime_is_rejected_from_windows_zip(self):
        shutil.rmtree(self.stage)
        self.stage.mkdir()
        (self.stage / 'ThreadShelf Local Reader.exe').write_bytes(b'MZ fixture')
        bundle = self.stage / 'resources/app/node_modules/@huggingface/transformers/dist/transformers.web.js'
        bundle.parent.mkdir(parents=True)
        bundle.write_bytes(b'Embedded obsolete ONNX Web runtime fixture')
        archive = self.root / 'Windows-fixture.zip'
        with zipfile.ZipFile(archive, 'w') as stream:
            for file in self.stage.rglob('*'):
                if file.is_file():
                    stream.write(file, file.relative_to(self.stage).as_posix())
        with self.assertRaisesRegex(ValueError, 'Transformers prebuilt distributions must be omitted'):
            VALIDATOR.verify_archive(archive, self.stage)

    def test_transformers_prebuilt_runtime_is_rejected_from_actual_deb_stream(self):
        shutil.rmtree(self.stage)
        self.stage.mkdir()
        self.links = VALIDATOR.DEB_LINKS
        self.make_layout(self.links)
        bundle = self.stage / 'opt/threadshelf-local-reader/resources/app/node_modules/@huggingface/transformers/dist/transformers.node.mjs'
        bundle.parent.mkdir(parents=True)
        bundle.write_bytes(b'Embedded obsolete ONNX Web runtime fixture')
        archive = self.archive()
        class Process:
            stdout = archive.open('rb')
            def wait(self): return 0
        with patch.object(VALIDATOR.subprocess, 'Popen', return_value=Process()), \
             self.assertRaisesRegex(ValueError, 'Transformers prebuilt distributions must be omitted'):
            self.check(archive, deb=True)

    def test_link_survives_relocation(self):
        relocated = self.root / 'arbitrary location' / 'reader'
        shutil.copytree(self.stage, relocated, symlinks=True)
        self.assertEqual(os.readlink(relocated / 'threadshelf-local-reader'),
                         'app/threadshelf-local-reader')
        self.assertEqual(os.readlink(relocated / 'bin/threadshelf-local-reader'),
                         '../app/threadshelf-local-reader')
        self.assertEqual(VALIDATOR.snapshot(relocated, self.links),
                         VALIDATOR.snapshot(self.stage, self.links))

    def test_default_snapshot_rejects_all_links(self):
        with self.assertRaises(ValueError):
            VALIDATOR.snapshot(self.stage)

    def test_only_exact_packaging_link_policies_are_supported(self):
        with self.assertRaises(ValueError):
            VALIDATOR.snapshot(self.stage, {'threadshelf-local-reader': str(self.binary)})

    def test_wrong_relative_target(self):
        self.replace_link('app/../app/threadshelf-local-reader')
        self.assert_stage_rejected()

    def test_absolute_target(self):
        self.replace_link(str(self.binary))
        self.assert_stage_rejected()

    def test_escaping_target(self):
        self.replace_link('../outside')
        self.assert_stage_rejected()
        with self.assertRaises(ValueError):
            VALIDATOR.verify_native_link_target(self.stage, 'threadshelf-local-reader', '../outside')

    def test_missing_link(self):
        self.link.unlink()
        self.assert_stage_rejected()

    def test_missing_bin_link(self):
        (self.stage / 'bin/threadshelf-local-reader').unlink()
        self.assert_stage_rejected()

    def test_bin_link_cannot_chain_through_root_link(self):
        entry = self.stage / 'bin/threadshelf-local-reader'
        entry.unlink()
        entry.symlink_to('../threadshelf-local-reader')
        self.assert_stage_rejected()

    def test_archive_missing_bin_link(self):
        def mutate(name, entry, data):
            return None if name == 'bin/threadshelf-local-reader' else (entry, data)
        with self.assertRaises(ValueError):
            self.check(self.archive(mutate))

    def test_script_substituted_for_link(self):
        self.link.unlink()
        self.link.write_text('#!/bin/sh\nexec app/threadshelf-local-reader "$@"\n')
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
        (self.stage / 'other').symlink_to('app/threadshelf-local-reader')
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
            if name == 'threadshelf-local-reader':
                entry.linkname = '../outside'
            return entry, data
        with self.assertRaises(ValueError):
            self.check(self.archive(mutate))

    def test_archive_regular_file_substitutes_link(self):
        def mutate(name, entry, data):
            if name == 'threadshelf-local-reader':
                entry.type = tarfile.REGTYPE
                data = b'app/threadshelf-local-reader'
                entry.size = len(data)
            return entry, data
        with self.assertRaises(ValueError):
            self.check(self.archive(mutate))

    def test_archive_directory_substitutes_link(self):
        def mutate(name, entry, data):
            if name == 'threadshelf-local-reader':
                entry.type = tarfile.DIRTYPE
            return entry, data
        with self.assertRaises(ValueError):
            self.check(self.archive(mutate))

    def test_archive_hardlink_is_not_accepted_as_symlink(self):
        def mutate(name, entry, data):
            if name == 'threadshelf-local-reader':
                entry.type = tarfile.LNKTYPE
            return entry, data
        with self.assertRaises(ValueError):
            self.check(self.archive(mutate))

    def test_archive_link_substitutes_regular_native_file(self):
        def mutate(name, entry, data):
            if name == 'app/threadshelf-local-reader':
                entry.type = tarfile.SYMTYPE
                entry.linkname = '../threadshelf-local-reader'
                entry.size = 0
                data = None
            return entry, data
        with self.assertRaises(ValueError):
            self.check(self.archive(mutate))

    def test_archive_link_mode_mismatch(self):
        def mutate(name, entry, data):
            if name == 'threadshelf-local-reader':
                entry.mode = 0o644
            return entry, data
        with self.assertRaises(ValueError):
            self.check(self.archive(mutate))

    def test_archive_omitted_native_target(self):
        def mutate(name, entry, data):
            return None if name == 'app/threadshelf-local-reader' else (entry, data)
        with self.assertRaises(ValueError):
            self.check(self.archive(mutate))

    def test_archive_duplicate_link(self):
        extra = tarfile.TarInfo('./threadshelf-local-reader')
        extra.type = tarfile.SYMTYPE
        extra.mode = 0o777
        extra.linkname = 'app/threadshelf-local-reader'
        with self.assertRaises(ValueError):
            self.check(self.archive(additions=[(extra, None)]))

    def test_archive_traversal(self):
        extra = tarfile.TarInfo('../outside')
        extra.type = tarfile.SYMTYPE
        extra.linkname = 'app/threadshelf-local-reader'
        with self.assertRaises(ValueError):
            self.check(self.archive(additions=[(extra, None)]))

    def test_launcher_script_rejected_even_if_it_matches_staging(self):
        (self.stage / 'start.sh').write_text('#!/bin/sh\nexit 0\n')
        with self.assertRaisesRegex(ValueError, 'launcher script'):
            self.check()

    def test_extensionless_shebang_launcher_rejected_in_all_portable_entry_directories(self):
        for relative in ['launch', 'bin/launch', 'app/launch']:
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
        for relative in ['usr/bin/launch', 'opt/threadshelf-local-reader/launch.py']:
            with self.subTest(relative=relative):
                script = self.stage / relative
                script.write_text('#!/usr/bin/python3\npass\n')
                with self.assertRaisesRegex(ValueError, 'launcher script'):
                    self.check()
                script.unlink()

    def test_windows_public_root_rejects_script_launchers(self):
        shutil.rmtree(self.stage)
        self.stage.mkdir()
        (self.stage / 'ThreadShelf Local Reader.exe').write_bytes(b'MZ fixture')
        archive = self.root / 'Windows-fixture.zip'
        for name, contents in [('launch.cmd', '@echo off\n'),
                               ('launch.CMD', '@echo off\n'),
                               ('launch.vbs', 'WScript.Echo "launcher"'),
                               ('launch.js', 'console.log("launcher");'),
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

    def test_windows_bundled_npm_command_shims_are_not_public_launchers(self):
        shutil.rmtree(self.stage)
        self.stage.mkdir()
        (self.stage / 'ThreadShelf Local Reader.exe').write_bytes(b'MZ fixture')
        shim = self.stage / 'resources/app/node_modules/.bin/semver.cmd'
        shim.parent.mkdir(parents=True)
        shim.write_text('@echo off\nnode "%~dp0/../semver/bin/semver.js" %*\n')
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
            stream.write(self.binary, 'app/threadshelf-local-reader')
            entry = zipfile.ZipInfo('threadshelf-local-reader')
            entry.create_system = 3
            entry.external_attr = (stat.S_IFLNK | 0o777) << 16
            stream.writestr(entry, 'app/threadshelf-local-reader')
        with self.assertRaisesRegex(ValueError, 'unsupported ZIP object'):
            self.check(archive)


class PlatformSelectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='threadshelf-platform-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'scripts').mkdir()
        (self.root / 'scripts/release-filenames.mjs').write_text('export const RELEASE_REVISION = 0;\n')
        (self.root / 'package.json').write_text(json.dumps({'version': '1.0.0', 'devDependencies': {'electron': '44.9.1'}}))

    def check(self, platforms):
        argv = ['validate-packages.py', '--binaries', '--out', str(self.root / 'release'), '--runtime-cache', str(self.root / 'runtime')]
        for platform in platforms:
            argv.extend(['--platform', platform])
        output = io.StringIO()
        with patch.object(VALIDATOR, 'ROOT', self.root), patch.object(sys, 'argv', argv), patch.object(sys, 'stdout', output), \
             patch.object(VALIDATOR, 'verify_archive', side_effect=lambda archive, *a, **kw: {'file': archive.name}), \
             patch.object(VALIDATOR, 'verify_readme_inputs', return_value={'localLinksChecked': 13}), \
             patch.object(VALIDATOR, 'verify_application_inputs', return_value={'result': 'PASS'}), \
             patch.object(VALIDATOR, 'verify_runtime', side_effect=lambda cache, platform, *a: {'platform': platform}), \
             patch.object(VALIDATOR, 'verify_deb_runtime', return_value={'package': 'deb'}), \
             patch.object(VALIDATOR.subprocess, 'check_output', return_value='Version: 1.0.0\nArchitecture: amd64\n') as deb:
            VALIDATOR.main()
            return json.loads(output.getvalue()), deb.call_count

    def test_windows_only_does_not_require_linux_archives_or_deb_tooling(self):
        report, deb_calls = self.check(['win32'])
        self.assertEqual(report['platforms'], ['win32'])
        self.assertEqual(len(report['archives']), 1)
        self.assertTrue(report['archives'][0]['file'].endswith('.zip'))
        self.assertEqual([x['platform'] for x in report['applicationInputs']], ['win32'])
        self.assertEqual(len(report['runtimes']), 1)
        self.assertEqual(deb_calls, 0)

    def test_linux_selection_always_includes_portable_and_deb(self):
        report, deb_calls = self.check(['linux'])
        self.assertEqual(report['platforms'], ['linux'])
        self.assertEqual(len(report['archives']), 2)
        self.assertEqual([x['platform'] for x in report['applicationInputs']], ['linux', 'deb'])
        self.assertEqual(len(report['runtimes']), 2)
        self.assertEqual(deb_calls, 1)

    def test_default_retains_all_platforms_and_repeated_selection_is_unique(self):
        for selected in [[], ['linux', 'win32', 'linux']]:
            with self.subTest(selected=selected):
                report, deb_calls = self.check(selected)
                self.assertEqual(report['platforms'], ['win32', 'linux'])
                self.assertEqual(len(report['archives']), 3)
                self.assertEqual(len(report['runtimes']), 3)
                self.assertEqual(deb_calls, 1)


class PackagedReadmeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='threadshelf-readme-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'source'
        self.stage = self.root / 'stage'
        for directory in [self.source, self.stage]:
            (directory / 'docs').mkdir(parents=True)
            (directory / 'README.md').write_text('[Build](docs/Toolchain.md) [Architecture](ARCHITECTURE.md) [LICENSE](LICENSE) [Upstream](https://example.invalid/)\n')
            (directory / 'LICENSE').write_text('Application MIT copyright davoda1\n')
            (directory / 'ARCHITECTURE.md').write_text('Architecture\n')
            (directory / 'docs/Toolchain.md').write_text('Pinned build tools\n')

    def portable(self):
        (self.stage / 'APPLICATION-LICENSE').write_bytes((self.source / 'LICENSE').read_bytes())
        (self.stage / 'LICENSE').write_text('Electron runtime license\n')
        (self.stage / 'README.md').write_text((self.source / 'README.md').read_text().replace('[LICENSE](LICENSE)', '[application LICENSE](APPLICATION-LICENSE)'))

    def check(self, portable=False):
        with patch.object(VALIDATOR, 'ROOT', self.source):
            return VALIDATOR.verify_readme_inputs(self.stage, portable=portable)

    def test_embedded_readme_retains_exact_source_and_application_license(self):
        self.assertEqual(self.check(), {'localLinksChecked': 3, 'applicationLicense': 'LICENSE'})

    def test_portable_readme_uses_application_license_without_replacing_electron_license(self):
        self.portable()
        self.assertEqual(self.check(True)['applicationLicense'], 'APPLICATION-LICENSE')
        self.assertEqual((self.stage / 'LICENSE').read_text(), 'Electron runtime license\n')

    def test_missing_linked_document_is_rejected(self):
        (self.stage / 'docs/Toolchain.md').unlink()
        with self.assertRaisesRegex(ValueError, 'local link is missing'):
            self.check()

    def test_portable_link_to_electron_license_is_rejected(self):
        self.portable()
        (self.stage / 'README.md').write_bytes((self.source / 'README.md').read_bytes())
        with self.assertRaisesRegex(ValueError, 'incorrect application license link'):
            self.check(True)

    def test_incorrect_application_license_is_rejected(self):
        self.portable()
        (self.stage / 'APPLICATION-LICENSE').write_text('Electron runtime license\n')
        with self.assertRaisesRegex(ValueError, 'application MIT license is stale or missing'):
            self.check(True)


class DebRuntimeArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='threadshelf-deb-runtime-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.binary = Path('/bin/true').read_bytes()
        self.official = self.root / 'electron-v44.4.5-linux-x64.zip'
        with zipfile.ZipFile(self.official, 'w') as archive:
            archive.writestr('electron', self.binary)
            archive.writestr('LICENSE', b'official runtime license')
            archive.writestr('resources/default_app.asar', b'intentionally omitted')
        (self.root / 'SHASUMS256.txt').write_text(
            VALIDATOR.file_digest(self.official)[1] + '  ' + self.official.name + '\n')

    def check(self, binary=None, include_license=True, include_default_app=False):
        data = io.BytesIO()
        members = [('threadshelf-local-reader', self.binary if binary is None else binary)]
        if include_license:
            members.append(('LICENSE', b'official runtime license'))
        if include_default_app:
            members.append(('resources/default_app.asar', b'intentionally omitted'))
        with tarfile.open(fileobj=data, mode='w') as archive:
            for name, contents in members:
                entry = tarfile.TarInfo('./opt/threadshelf-local-reader/' + name)
                entry.size = len(contents)
                archive.addfile(entry, io.BytesIO(contents))
        data.seek(0)
        class Process:
            stdout = data
            def wait(self): return 0
            def kill(self): pass
        with patch.object(VALIDATOR.subprocess, 'Popen', return_value=Process()):
            return VALIDATOR.verify_deb_runtime(self.root, self.root / 'fixture.deb', '44.4.5')

    def test_exact_deb_archive_runtime_matches_official_bytes(self):
        report = self.check()
        self.assertEqual(report['package'], 'deb')
        self.assertEqual(report['officialFilesVerified'], 2)
        self.assertTrue(report['runtimeBytesReadFromArchive'])

    def test_deb_archive_rejects_truncated_and_same_size_corrupted_runtime(self):
        for damaged in [self.binary[:-512], self.binary[:-1] + bytes([self.binary[-1] ^ 1])]:
            with self.subTest(bytes=len(damaged)):
                with self.assertRaisesRegex(ValueError, 'DEB archived runtime mismatch'):
                    self.check(binary=damaged)

    def test_deb_archive_rejects_missing_official_runtime_member(self):
        with self.assertRaisesRegex(ValueError, 'DEB runtime members missing'):
            self.check(include_license=False)

    def test_deb_runtime_report_cannot_claim_omission_when_default_app_is_archived(self):
        with self.assertRaisesRegex(ValueError, 'default application must be omitted'):
            self.check(include_default_app=True)


class LicenseInputTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='threadshelf-license-inputs-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'source'
        self.app = self.root / 'app'
        for directory in (self.source, self.app):
            license_file = directory / 'licenses/npm/current/LICENSE'
            license_file.parent.mkdir(parents=True)
            license_file.write_bytes(b'retained license input')

    def check(self):
        with patch.object(VALIDATOR, 'ROOT', self.source):
            return VALIDATOR.verify_license_inputs(self.app)

    def test_exact_retained_licenses_allow_only_generated_root_metadata(self):
        self.assertEqual(self.check(), 1)
        (self.app / 'licenses/DEPENDENCIES.json').write_text('{"platform":"fixture"}')
        self.assertEqual(self.check(), 1)

    def test_stale_dependency_directory_and_nested_generated_name_are_rejected(self):
        for relative in ('npm/electron-previous/package-metadata.json', 'npm/DEPENDENCIES.json'):
            with self.subTest(relative=relative):
                extra = self.app / 'licenses' / relative
                extra.parent.mkdir(parents=True, exist_ok=True)
                extra.write_text('{}')
                with self.assertRaisesRegex(ValueError, 'Unexpected packaged license inputs'):
                    self.check()
                extra.unlink()

    def test_missing_or_changed_retained_license_is_rejected(self):
        retained = self.app / 'licenses/npm/current/LICENSE'
        retained.write_bytes(b'changed license')
        with self.assertRaisesRegex(ValueError, 'stale or missing'):
            self.check()
        retained.unlink()
        with self.assertRaisesRegex(ValueError, 'stale or missing'):
            self.check()


if __name__ == '__main__':
    unittest.main(verbosity=2)
