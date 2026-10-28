#!/usr/bin/env python3
"""Small offline fixtures for native source identity and notice-scope gates."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('native_scope', Path(__file__).with_name('verify-native-source-scope.py'))
N = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(N)


def encoded(value):
    return (json.dumps(value, sort_keys=True, indent=2) + '\n').encode()


class FixtureBundle:
    """Implements the guard's already-verified material/JSON input interface."""
    def __init__(self, root):
        self.root, self.values, self.inputs, self.native_runtime_files = root, {}, {}, {}
        self.data = {'version': '1.3.0', 'electron_version': '45.1.0', 'repository': 'Davoda1/ThreadShelf-Local-Suite'}

    def put(self, key, value, storage='metadata', file=None):
        self.values[key] = deepcopy(value)
        raw = encoded(value)
        self.inputs[key] = {'file': file or key + '.json', 'storage': storage, 'bytes': len(raw), 'sha256': N.sha(raw)}

    def get(self, key):
        return self.values[key]

    def sha(self, key):
        return self.inputs[key]['sha256']

    def change(self, key, action):
        value = deepcopy(self.get(key))
        action(value)
        old = self.inputs[key]
        self.put(key, value, old['storage'], old['file'])

    def material(self, _owner, row):
        path = self.root / row['file']
        raw = path.read_bytes()
        if N.sha(raw) != row['sha256'] or ('bytes' in row and len(raw) != row['bytes']):
            raise ValueError('Fixture material hash/size differs')
        return path

    def file(self, relative, text, source_path=None):
        raw = text.encode()
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
        if source_path:
            self.native_runtime_files[source_path] = {'kind': 'file', 'size': len(raw), 'sha256': N.sha(raw)}
        return {'file': relative, 'bytes': len(raw), 'sha256': N.sha(raw)}


class NativeScopeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bundle = FixtureBundle(self.root)
        self.sources = [
            {'path': 'src', 'repository': 'https://source.invalid/chromium', 'revision': 'a' * 40,
             'archive': 'chromium.tar.gz', 'sha256': 'b' * 64, 'size': 100, 'part': 'part01.zip', 'regular_files': 4},
            {'path': 'src/electron', 'repository': 'https://source.invalid/electron', 'revision': 'c' * 40,
             'archive': 'electron.tar.gz', 'sha256': 'd' * 64, 'size': 100, 'part': 'part02.zip'},
            {'path': 'src/third_party/ffmpeg', 'repository': 'https://source.invalid/ffmpeg', 'revision': 'e' * 40,
             'archive': 'ffmpeg.tar.gz', 'sha256': 'f' * 64, 'size': 100, 'part': 'part02.zip'},
        ]
        self.make_reuse()
        self.make_ffmpeg()
        self.make_grants()

    def make_reuse(self):
        b = self.bundle
        components = {'sharp': '0.34.5', 'sharpLibvips': '1.2.4', 'libvips': '8.17.3'}
        b.put('native_historical_manifest', {'components': components, 'provenanceLimits': ['No binary reproduction is claimed.']})
        b.put('native_historical_linux', {'files': [{'component': 'vips', 'version': '8.17.3'}, {'component': 'jpeg', 'version': '4.1.5'}]})
        b.put('native_historical_windows', {'files': [{'component': 'vips', 'shippedVersion': '8.17.3'}]})
        b.put('native_historical_wasm', {'shippedVersionChecks': {'vips': {'shipped': '8.17.3'}}})
        name = 'ThreadShelf-Local-Suite-1.0.0-Native-Sources.tar.gz'
        asset = {'name': name, 'url': f'https://github.com/{b.data["repository"]}/releases/download/v1.0.0/{name}',
                 'bytes': 1000, 'sha256': '1' * 64, 'full_asset_stream_hash_verified': True}
        prefix = 'ThreadShelf-Local-Suite-1.0.0-Native-Sources/'
        retained = []
        for key, relative in [('native_historical_manifest', 'MANIFEST.json'), ('native_historical_linux', 'linux/sources-manifest.json'),
                              ('native_historical_windows', 'windows/sources-manifest.json'), ('native_historical_wasm', 'wasm/wasm-source-manifest.json')]:
            retained.append({'path': prefix + relative, 'bytes': b.inputs[key]['bytes'], 'sha256': b.sha(key)})
        b.put('native_historical_inspection', {'passed': True, 'bytes': asset['bytes'], 'sha256': asset['sha256'],
                                             'expected_sha256': asset['sha256'], 'url': asset['url'], 'retained': retained})
        checks = []
        for package, (key, historical, old_name) in N.VERSION_INPUTS.items():
            versions = {'vips': '8.17.3', 'mozjpeg': '4.1.5'} if historical.endswith('linux') else {'vips': '8.17.3'}
            current_file = f'apps/reader/licenses/native/{package}/versions.json'
            b.put(key, versions, 'repository', current_file)
            checks.append({'package': package, 'versions': versions, 'current_versions_file': current_file,
                           'current_versions_sha256': b.sha(key), 'historical_source_manifest': old_name,
                           'historical_source_manifest_sha256': b.sha(historical), 'component_versions_checked': len(versions), 'all_versions_equal': True})
        packages = {'node_modules/sharp': {'version': components['sharp'], 'resolved': 'https://registry.invalid/sharp.tgz', 'integrity': 'sha512-fixture'}}
        for package in N.VERSION_INPUTS:
            packages['node_modules/@img/' + package] = {'version': components['sharpLibvips'] if 'libvips' in package else components['sharp'],
                                                       'resolved': 'https://registry.invalid/' + package + '.tgz', 'integrity': 'sha512-fixture'}
        b.put('native_reader_lock', {'packages': packages}, 'repository', 'apps/reader/package-lock.json')
        b.put('native_reuse', {'passed': True, 'suite_version': '1.3.0', 'scope': 'Synthetic unchanged native source identity fixture.',
                              'historical_asset': asset, 'reusable_prefixes': ['linux/', 'windows/', 'wasm/', 'notices/'],
                              'components': components, 'provenance_limits_retained': ['No binary reproduction is claimed.'],
                              'excluded_historical_scope': ['electron-runtime/', 'ONNX'], 'component_version_checks': checks,
                              'total_component_versions_checked': sum(row['component_versions_checked'] for row in checks),
                              'unchanged_package_inputs': [{'path': path, **row, 'unchanged_from_base': True} for path, row in packages.items()]})

    def make_ffmpeg(self):
        b, source = self.bundle, self.sources[2]
        records, configurations = [], []
        flags = {'CONFIG_GPL': 0, 'CONFIG_NONFREE': 0, 'CONFIG_VERSION3': 0}
        for target in ('linux-x64', 'win-x64'):
            relative = 'config/' + target + '.h'
            row = b.file('ffmpeg/' + relative, ''.join(f'#define {name} {value}\n' for name, value in flags.items()), source['path'] + '/' + relative)
            records.append({**row, 'source_path': relative})
            configurations.append({**row, 'target': target, 'flags': flags})
        records.append({**b.file('ffmpeg/LICENSE.md', 'Original FFmpeg notice.\n', source['path'] + '/LICENSE.md'), 'source_path': 'LICENSE.md'})
        electron_input = {**b.file('electron/ffmpeg.gn', 'ffmpeg_branding = "Chrome"\n', 'src/electron/build/args/ffmpeg.gn'),
                          'source_path': 'src/electron/build/args/ffmpeg.gn', 'source_archive_sha256': self.sources[1]['sha256']}
        self.patch = {'ordinal': 177, 'patch': 'src/electron/patches/ffmpeg/fix.patch', 'patch_sha256': '2' * 64}
        b.put('native_legacy_patch_result', {'applied_patches': [self.patch]})
        b.put('patch_result', {'applied_patches': [self.patch]})
        b.put('native_ffmpeg', {'electron': '45.1.0', 'ffmpeg_revision': source['revision'], 'records': records,
                               'electron_inputs': [electron_input], 'release_configurations': configurations,
                               'source_archive_and_patch_verification': {
                                   'passed': True, 'source_archive': {key: source[key] for key in ('path', 'repository', 'revision', 'archive', 'sha256', 'size')},
                                   'source_part': source['part'], 'reviewed_input_bindings': [
                                       {'path': source['path'] + '/' + row['source_path'], 'bytes': row['bytes'], 'sha256': row['sha256'], 'archive': source['archive']} for row in records],
                                   'ordered_patch_report': {'sha256': b.sha('native_legacy_patch_result')}, 'ffmpeg_patch': self.patch}})

    def make_grants(self):
        b, source = self.bundle, self.sources[0]
        selected = 'third_party/blink/renderer/example.cc'
        manual_path = 'third_party/blink/common/manual.cc'
        mozilla_path = 'url/third_party/mozilla/original.cc'
        self.selected = selected
        self.selected_header = '// LGPL version 2 or any later version\n'
        definitions = [
            (selected, self.selected_header, 'explicit-lgpl-or-later', 'LGPL-3.0'),
            (N.BASE64, '// Original LGPL version 2 only\n', 'original-lgpl-version-2-only', None),
            (manual_path, '// Original alternatives are retained.\n', 'original-mixed-notice', None),
            (mozilla_path, '// Original Mozilla notice\n', 'original-mozilla-notice', None),
        ]
        scanned, candidates, grants = [], [], {}
        for path, header, classification, selection in definitions:
            row = b.file('grant-inputs/' + path, header + 'int fixture_value;\n', 'src/' + path)
            scanned.append({'path': path, 'bytes': row['bytes'], 'sha256': row['sha256']})
            header_sha = N.sha(header.encode())
            grants[header_sha] = {'original_header': header}
            candidates.append({'path': path, 'bytes': row['bytes'], 'sha256': row['sha256'], 'header_sha256': header_sha,
                               'classification': classification, 'selected_later_version': selection,
                               **({'manual_review': True} if path == manual_path else {}),
                               **({'original_notice_review': True} if path == mozilla_path else {})})
        manual_row = next(row for row in candidates if row['path'] == manual_path)
        b.put('native_manual', {'chromium_revision': source['revision'], 'reviews': [
            {**{key: manual_row[key] for key in ('path', 'bytes', 'sha256')}, 'file': 'grant-inputs/' + manual_path,
             'original_notice_excerpt': 'Original alternatives are retained.', 'later_version_selection': None}]})
        mozilla_row = next(row for row in candidates if row['path'] == mozilla_path)
        b.put('native_mozilla', {'passed': True, 'chromium_revision': source['revision'], 'source_archive_sha256': source['sha256'],
                                'reviews': [{key: mozilla_row[key] for key in ('path', 'sha256', 'header_sha256', 'selected_later_version')}]})
        fingerprint = N.sha(''.join(row['path'] + '\0' + str(row['bytes']) + '\0' + row['sha256'] + '\n'
                                   for row in sorted(scanned, key=lambda row: row['path'])).encode())
        b.put('native_scanned_index', scanned)
        b.put('native_grant_index', {'scope_prefixes': list(N.PREFIXES), 'chromium_revision': source['revision'],
                                    'source_archive_sha256': source['sha256'], 'source_archive_bytes': source['size'],
                                    'status': 'per-file-original-notices-reviewed', 'original_notices_retained': True,
                                    'scanned_source_inventory_sha256': fingerprint,
                                    'counts': {'blink_regular_files': 3, 'mozilla_regular_files': 1, 'archive_regular_files': 4},
                                    'files': [candidates[0]], 'notSelected': candidates[1:], 'grants': grants,
                                    'manual_review_candidates': [],
                                    'manual_review_evidence': {'sha256': b.sha('native_manual'), 'applied_paths': [manual_path]},
                                    'mozilla_notice_review': {'sha256': b.sha('native_mozilla'), 'reviewed_headers': 1}})
        b.put('native_grants', {'passed': True, 'unreviewed_candidates': 0, 'index_sha256': b.sha('native_grant_index'),
                               'chromium_revision': source['revision'], 'chromium_source_archive_sha256': source['sha256'],
                               'regular_blink_files_scanned': 3, 'regular_mozilla_files_scanned': 1,
                               'explicit_permission_template_matches': 1, 'original_mozilla_notice_headers_reviewed': 1,
                               'manual_original_notice_reviews': 1, 'original_version2_only_base64_preserved': True})
        b.put('patch_recipe', {'records': []})
        b.put('native_indexed_patches', {'passed': True, 'ordered_patch_inputs_reviewed': 0, 'affected_patch_files': [],
                                        'indexed_files_touched': [], 'changes_within_indexed_original_headers': [],
                                        'base64_exception_patch_references': []})

    def check(self):
        return N.check_native_scope(self.bundle, self.sources)

    def snapshot(self, now):
        asset = self.bundle.get('native_reuse')['historical_asset']
        repository = self.bundle.data['repository']
        return {'repository': repository, 'checked_at': now.isoformat(), 'release': {
            'id': 10, 'tag_name': 'v1.0.0', 'draft': False, 'published_at': '2026-01-01T00:00:00Z',
            'url': f'https://api.github.com/repos/{repository}/releases/10', 'assets': [{
                'id': 20, 'name': asset['name'], 'state': 'uploaded', 'size': asset['bytes'], 'digest': 'sha256:' + asset['sha256'],
                'browser_download_url': asset['url'], 'url': f'https://api.github.com/repos/{repository}/releases/assets/20'}]}}

    def test_complete_small_fixture_passes_without_external_inputs(self):
        result = self.check()
        self.assertEqual(result['reuse']['component_versions'], 6)
        self.assertEqual(result['reuse']['npm_pins'], 5)
        self.assertEqual(result['ffmpeg']['ordered_patch'], 177)
        self.assertEqual(result['original_notices']['scoped_original_files'], 4)

    def test_missing_native_platform_coverage_fails(self):
        self.bundle.change('native_reuse', lambda proof: proof['component_version_checks'].pop())
        with self.assertRaisesRegex(ValueError, 'platform version coverage'):
            self.check()

    def test_duplicate_native_platform_coverage_fails(self):
        self.bundle.change('native_reuse', lambda proof: proof['component_version_checks'].append(
            dict(proof['component_version_checks'][0])))
        with self.assertRaisesRegex(ValueError, 'duplicate native version check'):
            self.check()

    def test_changed_current_version_cannot_be_hidden_by_rewriting_comparison_flag(self):
        self.bundle.change('native_versions_windows', lambda versions: versions.update(vips='99.0.0'))
        with self.assertRaisesRegex(ValueError, 'component versions differ'):
            self.check()

    def test_stale_current_version_hash_fails(self):
        self.bundle.change('native_reuse', lambda proof: proof['component_version_checks'][0].update(current_versions_sha256='0' * 64))
        with self.assertRaisesRegex(ValueError, 'current versions proof binding'):
            self.check()

    def test_current_versions_must_be_repository_inputs_at_exact_paths(self):
        self.bundle.inputs['native_versions_windows']['storage'] = 'metadata'
        with self.assertRaisesRegex(ValueError, 'current native version source'):
            self.check()

    def test_missing_native_npm_pin_fails(self):
        self.bundle.change('native_reuse', lambda proof: proof['unchanged_package_inputs'].pop())
        with self.assertRaisesRegex(ValueError, 'npm pin coverage'):
            self.check()

    def test_changed_lock_integrity_fails(self):
        self.bundle.change('native_reader_lock', lambda lock: lock['packages']['node_modules/sharp'].update(integrity='sha512-changed'))
        with self.assertRaisesRegex(ValueError, 'npm pin changed'):
            self.check()

    def test_false_historical_pin_comparison_fails(self):
        self.bundle.change('native_reuse', lambda proof: proof['unchanged_package_inputs'][0].update(unchanged_from_base=False))
        with self.assertRaisesRegex(ValueError, 'historical comparison failed'):
            self.check()

    def test_retained_historical_metadata_hash_is_bound_to_full_stream_inspection(self):
        self.bundle.change('native_historical_inspection', lambda proof: proof['retained'][0].update(sha256='0' * 64))
        with self.assertRaisesRegex(ValueError, 'retained historical manifest bytes'):
            self.check()

    def test_old_runtime_and_onnx_cannot_be_silently_reused(self):
        self.bundle.change('native_reuse', lambda proof: proof.update(excluded_historical_scope=['electron-runtime/']))
        with self.assertRaisesRegex(ValueError, 'exclusions missing'):
            self.check()

    def test_fresh_exact_historical_snapshot_passes(self):
        now = datetime(2026, 10, 28, tzinfo=timezone.utc)
        result = N.check_historical(self.snapshot(now), self.bundle.get('native_reuse')['historical_asset'], self.bundle.data['repository'], now)
        self.assertEqual(result['asset_id'], 20)

    def test_historical_snapshot_identity_and_integrity_fail_closed(self):
        now = datetime(2026, 10, 28, tzinfo=timezone.utc)
        changes = [
            lambda snapshot: snapshot.update(repository='another/repository'),
            lambda snapshot: snapshot['release'].update(tag_name='v1.2.0'),
            lambda snapshot: snapshot['release'].update(draft=True),
            lambda snapshot: snapshot['release'].update(published_at=None),
            lambda snapshot: snapshot['release'].update(url='https://api.github.com/repos/another/repository/releases/10'),
            lambda snapshot: snapshot['release']['assets'][0].update(digest='sha256:' + '0' * 64),
            lambda snapshot: snapshot['release']['assets'][0].update(size=1),
            lambda snapshot: snapshot['release']['assets'][0].update(state='new'),
            lambda snapshot: snapshot['release']['assets'][0].update(browser_download_url='https://github.com/another/repository/releases/download/v1.0.0/asset.tar.gz'),
            lambda snapshot: snapshot['release']['assets'][0].update(url='https://api.github.com/repos/another/repository/releases/assets/20'),
            lambda snapshot: snapshot['release']['assets'].clear(),
            lambda snapshot: snapshot['release']['assets'].append(dict(snapshot['release']['assets'][0])),
        ]
        for index, change in enumerate(changes):
            with self.subTest(case=index):
                snapshot = self.snapshot(now)
                change(snapshot)
                with self.assertRaises(ValueError):
                    N.check_historical(snapshot, self.bundle.get('native_reuse')['historical_asset'], self.bundle.data['repository'], now)

    def test_stale_future_and_timezone_free_historical_snapshots_fail(self):
        now = datetime(2026, 10, 28, tzinfo=timezone.utc)
        for checked in ((now - timedelta(seconds=901)).isoformat(), (now + timedelta(seconds=1)).isoformat(), '2026-10-28T00:00:00'):
            with self.subTest(checked=checked):
                snapshot = self.snapshot(now)
                snapshot['checked_at'] = checked
                with self.assertRaisesRegex(ValueError, 'stale or in the future'):
                    N.check_historical(snapshot, self.bundle.get('native_reuse')['historical_asset'], self.bundle.data['repository'], now)

    def test_historical_api_ids_must_be_positive_integers(self):
        now = datetime(2026, 10, 28, tzinfo=timezone.utc)
        for target in ('release', 'asset'):
            for identifier in (-1, 0, '10', True):
                with self.subTest(target=target, identifier=identifier):
                    snapshot = self.snapshot(now)
                    row = snapshot['release'] if target == 'release' else snapshot['release']['assets'][0]
                    row['id'] = identifier
                    suffix = 'releases/' if target == 'release' else 'releases/assets/'
                    row['url'] = f'https://api.github.com/repos/{self.bundle.data["repository"]}/{suffix}{identifier}'
                    with self.assertRaises(ValueError):
                        N.check_historical(snapshot, self.bundle.get('native_reuse')['historical_asset'], self.bundle.data['repository'], now)

    def test_ffmpeg_platform_coverage_is_required(self):
        self.bundle.change('native_ffmpeg', lambda proof: proof['release_configurations'].pop())
        with self.assertRaisesRegex(ValueError, 'FFmpeg platform coverage'):
            self.check()

    def test_ffmpeg_source_revision_must_match_accepted_archive(self):
        self.bundle.change('native_ffmpeg', lambda proof: proof.update(ffmpeg_revision='0' * 40))
        with self.assertRaisesRegex(ValueError, 'FFmpeg source revision'):
            self.check()

    def test_ffmpeg_original_notice_bytes_must_match_runtime_inventory(self):
        self.bundle.native_runtime_files['src/third_party/ffmpeg/LICENSE.md']['sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'original source bytes'):
            self.check()

    def test_ffmpeg_applied_patch_cannot_drift_between_proofs(self):
        self.bundle.change('patch_result', lambda proof: proof['applied_patches'][0].update(patch_sha256='0' * 64))
        with self.assertRaisesRegex(ValueError, 'exact applied FFmpeg patch'):
            self.check()

    def test_original_notice_scope_cannot_omit_a_prefix(self):
        self.bundle.change('native_grant_index', lambda index: index['scope_prefixes'].pop())
        with self.assertRaisesRegex(ValueError, 'exact original-notice source scope'):
            self.check()

    def test_full_scoped_inventory_omission_fails_even_when_counts_are_adjusted(self):
        self.bundle.change('native_scanned_index', lambda rows: rows.pop())
        scanned = self.bundle.get('native_scanned_index')
        fingerprint = N.sha(''.join(row['path'] + '\0' + str(row['bytes']) + '\0' + row['sha256'] + '\n'
                                   for row in sorted(scanned, key=lambda row: row['path'])).encode())
        self.bundle.change('native_grant_index', lambda index: index.update(
            scanned_source_inventory_sha256=fingerprint,
            counts={'blink_regular_files': 3, 'mozilla_regular_files': 0, 'archive_regular_files': 4}))
        with self.assertRaisesRegex(ValueError, 'complete scoped original-source inventory'):
            self.check()

    def test_manual_original_notice_review_cannot_be_omitted(self):
        self.bundle.change('native_manual', lambda proof: proof['reviews'].clear())
        with self.assertRaisesRegex(ValueError, 'complete manual review coverage'):
            self.check()

    def test_original_mozilla_review_cannot_be_omitted(self):
        self.bundle.change('native_mozilla', lambda proof: proof['reviews'].clear())
        # Refresh the binding to expose the actual coverage check, not a stale hash.
        index = self.bundle.get('native_grant_index')
        index['mozilla_notice_review']['sha256'] = self.bundle.sha('native_mozilla')
        with self.assertRaisesRegex(ValueError, 'complete original Mozilla review coverage'):
            self.check()

    def test_real_patch_hunk_changing_original_header_requires_new_review(self):
        b = self.bundle
        patch_path = 'src/electron/patches/chromium/change-notice.patch'
        raw = (f'diff --git a/{self.selected} b/{self.selected}\n--- a/{self.selected}\n+++ b/{self.selected}\n'
               '@@ -1,2 +1,2 @@\n-' + self.selected_header.rstrip('\n') + '\n+// Changed original permission\n int fixture_value;\n')
        material = b.file(patch_path, raw)
        target = self.root / 'actual-patch' / self.selected
        target.parent.mkdir(parents=True)
        target.write_bytes((self.selected_header + 'int fixture_value;\n').encode())
        env = {key: value for key, value in os.environ.items() if not key.startswith('GIT_')}
        env.update(GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull)
        for options in (['--check'], []):
            subprocess.run(['git', 'apply', *options, str(self.root / patch_path)], cwd=self.root / 'actual-patch', env=env, check=True, capture_output=True)
        self.assertTrue(target.read_text().startswith('// Changed original permission'))
        b.put('patch_recipe', {'records': [{'repository': 'src', 'patch': patch_path, 'bytes': material['bytes'], 'sha256': material['sha256'],
                                           'diffs': [{'path': 'src/' + self.selected}]}]})
        short = patch_path.removeprefix('src/electron/')
        b.put('native_indexed_patches', {'passed': True, 'ordered_patch_inputs_reviewed': 1,
                                        'affected_patch_files': [{'path': 'src/' + self.selected, 'patch': short, 'patch_sha256': material['sha256']}],
                                        'indexed_files_touched': ['src/' + self.selected],
                                        'changes_within_indexed_original_headers': [{'path': 'src/' + self.selected, 'patch': short, 'line': 1}],
                                        'base64_exception_patch_references': []})
        with self.assertRaisesRegex(ValueError, 'new explicit review'):
            N.check_indexed_patches(b, b.get('native_grant_index'), b.get('native_manual'))

    def test_patch_to_code_below_original_header_keeps_notice_review_valid(self):
        b = self.bundle
        patch_path = 'src/electron/patches/chromium/change-code.patch'
        raw = (f'diff --git a/{self.selected} b/{self.selected}\n--- a/{self.selected}\n+++ b/{self.selected}\n'
               '@@ -1,2 +1,2 @@\n ' + self.selected_header + '-int fixture_value;\n+int updated_value;\n')
        material = b.file(patch_path, raw)
        b.put('patch_recipe', {'records': [{'repository': 'src', 'patch': patch_path, 'bytes': material['bytes'], 'sha256': material['sha256'],
                                           'diffs': [{'path': 'src/' + self.selected}]}]})
        short = patch_path.removeprefix('src/electron/')
        b.put('native_indexed_patches', {'passed': True, 'ordered_patch_inputs_reviewed': 1,
                                        'affected_patch_files': [{'path': 'src/' + self.selected, 'patch': short, 'patch_sha256': material['sha256']}],
                                        'indexed_files_touched': ['src/' + self.selected],
                                        'changes_within_indexed_original_headers': [], 'base64_exception_patch_references': []})
        N.check_indexed_patches(b, b.get('native_grant_index'), b.get('native_manual'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
