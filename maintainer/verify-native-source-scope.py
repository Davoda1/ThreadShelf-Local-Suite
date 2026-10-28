#!/usr/bin/env python3
"""Verify the bounded native-source reuse and original-notice evidence.

This checks source identities and retained evidence, not a binary rebuild or a
legal-compliance conclusion. Used by verify-release-sources.py.
"""
from datetime import datetime, timezone
import hashlib
import re
import shlex

PREFIXES = ('third_party/blink/renderer/', 'third_party/blink/public/',
            'third_party/blink/common/', 'third_party/blink/tools/',
            'base/third_party/nspr/', 'net/third_party/mozilla_security_manager/',
            'url/third_party/mozilla/')
BASE64 = 'third_party/blink/renderer/platform/wtf/text/base64.cc'
VERSION_INPUTS = {
    'sharp-libvips-linux-x64': ('native_versions_linux', 'native_historical_linux', 'linux/sources-manifest.json'),
    'sharp-libvips-linuxmusl-x64': ('native_versions_linuxmusl', 'native_historical_linux', 'linux/sources-manifest.json'),
    'sharp-win32-x64': ('native_versions_windows', 'native_historical_windows', 'windows/sources-manifest.json'),
    'sharp-wasm32': ('native_versions_wasm', 'native_historical_wasm', 'wasm/wasm-source-manifest.json'),
}


def need(value, message):
    if not value:
        raise ValueError('Native source scope: ' + message)


def same(actual, expected, message):
    need(actual == expected, message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def by(rows, key, label):
    result = {}
    for row in rows:
        value = row[key]
        need(value not in result, 'duplicate ' + label)
        result[value] = row
    return result


def check_historical(snapshot, asset, repository, now=None):
    now = now or datetime.now(timezone.utc)
    same(snapshot['repository'], repository, 'historical snapshot repository')
    checked = datetime.fromisoformat(snapshot['checked_at'].replace('Z', '+00:00'))
    need(checked.tzinfo is not None and 0 <= (now-checked).total_seconds() <= 900,
         'historical API snapshot is stale or in the future')
    release = snapshot['release']
    need(type(release.get('id')) is int and release['id'] > 0, 'invalid historical release ID')
    same((release['tag_name'], release['draft']), ('v1.0.0', False), 'historical published release')
    need(release.get('published_at'), 'historical release publication time missing')
    same(release['url'], f'https://api.github.com/repos/{repository}/releases/{release["id"]}',
         'historical release API identity')
    found = [r for r in release['assets'] if r['name'] == asset['name']]
    need(len(found) == 1, 'historical native asset missing or duplicated')
    row = found[0]
    need(type(row.get('id')) is int and row['id'] > 0, 'invalid historical asset ID')
    same((row['state'], row['size'], row['digest'], row['browser_download_url']),
         ('uploaded', asset['bytes'], 'sha256:' + asset['sha256'], asset['url']), 'historical remote asset integrity')
    same(row['url'], f'https://api.github.com/repos/{repository}/releases/assets/{row["id"]}',
         'historical asset API identity')
    return {'asset_id': row['id'], 'checked_at': snapshot['checked_at'],
            'scope': 'Fresh GitHub API metadata; full historical bytes were rehashed in the retained inspection.'}


def check_reuse(bundle, historical_snapshot):
    proof = bundle.get('native_reuse')
    inspection = bundle.get('native_historical_inspection')
    historical = bundle.get('native_historical_manifest')
    need(proof['passed'] is True and inspection['passed'] is True, 'historical source verification failed')
    same(proof['suite_version'], bundle.data['version'], 'reuse suite version')
    asset = proof['historical_asset']
    same(asset['name'], 'ThreadShelf-Local-Suite-1.0.0-Native-Sources.tar.gz', 'historical asset name')
    same(asset['url'], f'https://github.com/{bundle.data["repository"]}/releases/download/v1.0.0/{asset["name"]}',
         'historical source URL')
    same((asset['bytes'], asset['sha256'], asset['url']),
         (inspection['bytes'], inspection['sha256'], inspection['url']), 'historical full-stream binding')
    same(inspection['sha256'], inspection['expected_sha256'], 'historical expected checksum')
    need(asset['full_asset_stream_hash_verified'] is True, 'historical archive not fully verified')
    same(proof['reusable_prefixes'], ['linux/', 'windows/', 'wasm/', 'notices/'], 'reuse scope excludes old runtime')
    same(proof['components'], {k: historical['components'][k] for k in ('sharp', 'sharpLibvips', 'libvips')},
         'historical native component identity')
    same(proof['provenance_limits_retained'], historical['provenanceLimits'], 'historical provenance limitations')
    need(proof['excluded_historical_scope'] and all(x in ' '.join(proof['excluded_historical_scope'])
         for x in ('electron-runtime/', 'ONNX')), 'old Electron and ONNX exclusions missing')
    retained = by(inspection['retained'], 'path', 'historical retained path')
    prefix = 'ThreadShelf-Local-Suite-1.0.0-Native-Sources/'
    for name, relative in [('native_historical_manifest', 'MANIFEST.json'),
                           ('native_historical_linux', 'linux/sources-manifest.json'),
                           ('native_historical_windows', 'windows/sources-manifest.json'),
                           ('native_historical_wasm', 'wasm/wasm-source-manifest.json')]:
        row = retained[prefix + relative]
        same((bundle.inputs[name]['bytes'], bundle.sha(name)), (row['bytes'], row['sha256']),
             'retained historical manifest bytes')
    linux = bundle.get('native_historical_linux')
    windows = bundle.get('native_historical_windows')
    wasm = bundle.get('native_historical_wasm')
    versions = {
        'native_historical_linux': {('mozjpeg' if r['component'] == 'jpeg' else r['component']): r['version']
                                   for r in linux['files'] if r['component'] != 'patch'},
        'native_historical_windows': {r['component']: r['shippedVersion'] for r in windows['files']},
        'native_historical_wasm': {k: v['shipped'] for k, v in wasm['shippedVersionChecks'].items()},
    }
    checks = by(proof['component_version_checks'], 'package', 'native version check')
    same(set(checks), set(VERSION_INPUTS), 'complete native platform version coverage')
    total = 0
    for package, (current, prior, historical_name) in VERSION_INPUTS.items():
        row = checks[package]
        expected_file = f'apps/reader/licenses/native/{package}/versions.json'
        same((bundle.inputs[current].get('storage'), bundle.inputs[current]['file']),
             ('repository', expected_file), 'current native version source')
        actual = bundle.get(current)
        same(actual, versions[prior], 'current component versions differ from historical source')
        same(row['versions'], actual, 'native reuse versions proof')
        same((row['current_versions_file'], row['current_versions_sha256']),
             (expected_file, bundle.sha(current)), 'current versions proof binding')
        same((row['historical_source_manifest'], row['historical_source_manifest_sha256']),
             (historical_name, bundle.sha(prior)), 'historical versions proof binding')
        same((row['component_versions_checked'], row['all_versions_equal']), (len(actual), True), 'version comparison result')
        total += len(actual)
    same(proof['total_component_versions_checked'], total, 'native component count')
    same((bundle.inputs['native_reader_lock'].get('storage'), bundle.inputs['native_reader_lock']['file']),
         ('repository', 'apps/reader/package-lock.json'), 'current Reader lock source')
    packages = bundle.get('native_reader_lock')['packages']
    selected = {k: v for k, v in packages.items() if k == 'node_modules/sharp' or k.startswith('node_modules/@img/sharp')}
    pins = by(proof['unchanged_package_inputs'], 'path', 'native npm pin')
    same(set(pins), set(selected), 'complete native npm pin coverage')
    for name, row in selected.items():
        same({k: pins[name][k] for k in ('version', 'resolved', 'integrity')},
             {k: row[k] for k in ('version', 'resolved', 'integrity')}, 'native npm pin changed')
        need(pins[name]['unchanged_from_base'] is True, 'native npm historical comparison failed')
    same(packages['node_modules/sharp']['version'], proof['components']['sharp'], 'Sharp source version')
    same(packages['node_modules/@img/sharp-libvips-linux-x64']['version'], proof['components']['sharpLibvips'],
         'Sharp libvips source version')
    result = {'component_versions': total, 'npm_pins': len(pins), 'historical_asset': asset,
              'scope': proof['scope']}
    if historical_snapshot is not None:
        result['availability'] = check_historical(historical_snapshot, asset, bundle.data['repository'])
    return result


def runtime_file(bundle, path, size, digest):
    row = bundle.native_runtime_files.get(path)
    need(row is not None, 'required original source missing from full runtime inventory: ' + path)
    same((row['kind'], row['size'], row['sha256']), ('file', size, digest), 'original source bytes: ' + path)


def check_ffmpeg(bundle, sources):
    proof = bundle.get('native_ffmpeg')
    coverage = proof['source_archive_and_patch_verification']
    need(coverage['passed'] is True, 'FFmpeg source and patch verification failed')
    same(proof['electron'], bundle.data['electron_version'], 'FFmpeg Electron version')
    source = sources['src/third_party/ffmpeg']
    same(source['revision'], proof['ffmpeg_revision'], 'FFmpeg source revision')
    for key in ('path', 'repository', 'revision', 'archive', 'sha256', 'size'):
        same(coverage['source_archive'][key], source[key], 'FFmpeg archive ' + key)
    same(coverage['source_part'], source['part'], 'FFmpeg source part')
    bindings = by(coverage['reviewed_input_bindings'], 'path', 'FFmpeg source binding')
    expected = set()
    for row in proof['records']:
        bundle.material('native_ffmpeg', row)
        path = 'src/third_party/ffmpeg/' + row['source_path']; expected.add(path)
        runtime_file(bundle, path, row['bytes'], row['sha256'])
        same(bindings[path], {'path': path, 'bytes': row['bytes'], 'sha256': row['sha256'], 'archive': source['archive']},
             'FFmpeg notice/config archive binding')
    same(set(bindings), expected, 'FFmpeg input coverage')
    for row in proof['electron_inputs']:
        bundle.material('native_ffmpeg', row)
        runtime_file(bundle, row['source_path'], row['bytes'], row['sha256'])
        same(row['source_archive_sha256'], sources['src/electron']['sha256'], 'Electron FFmpeg recipe owner')
    configurations = by(proof['release_configurations'], 'target', 'FFmpeg configuration')
    same(set(configurations), {'linux-x64', 'win-x64'}, 'FFmpeg platform coverage')
    for row in configurations.values():
        raw = bundle.material('native_ffmpeg', {'file': row['file'], 'sha256': row['sha256']}).read_text()
        for name, value in row['flags'].items():
            matches = re.findall(r'^#define\s+' + re.escape(name) + r'\s+(\d+)\s*$', raw, re.M)
            same(matches, [str(value)], 'FFmpeg build switch ' + name)
        same({k: row['flags'][k] for k in ('CONFIG_GPL', 'CONFIG_NONFREE', 'CONFIG_VERSION3')},
             {'CONFIG_GPL': 0, 'CONFIG_NONFREE': 0, 'CONFIG_VERSION3': 0}, 'FFmpeg source build configuration')
    legacy = bundle.get('native_legacy_patch_result')
    same(coverage['ordered_patch_report']['sha256'], bundle.sha('native_legacy_patch_result'), 'legacy ordered-patch proof binding')
    patch = coverage['ffmpeg_patch']
    for result in (legacy, bundle.get('patch_result')):
        rows = [r for r in result['applied_patches'] if r['patch'] == patch['patch']]
        same(rows, [patch], 'exact applied FFmpeg patch')
    return {'revision': source['revision'], 'original_inputs': len(expected), 'ordered_patch': patch['ordinal']}


def check_indexed_patches(bundle, index, manual):
    headers = {}
    for row in index['files'] + index['notSelected']:
        if row.get('header_sha256'):
            text = index['grants'][row['header_sha256']]['original_header']
            headers['src/' + row['path']] = [(1, len(text.splitlines()))]
    for row in manual['reviews']:
        raw = bundle.material('native_manual', row).read_text()
        excerpt = row['original_notice_excerpt']; need(excerpt in raw, 'manual original notice excerpt missing')
        start = raw[:raw.index(excerpt)].count('\n') + 1
        headers.setdefault('src/' + row['path'], []).append((start, start + excerpt.count('\n')))
    affected, edits, base64 = [], [], []
    recipe = bundle.get('patch_recipe')
    for row in recipe['records']:
        raw = bundle.material('patch_recipe', {'file': row['patch'], 'bytes': row['bytes'], 'sha256': row['sha256']}).read_text()
        short = row['patch'].removeprefix('src/electron/')
        if any(d['path'] == 'src/' + BASE64 for d in row['diffs']):
            base64.append(short)
        current, oldline = None, None
        for line in raw.splitlines():
            if line.startswith('diff --git '):
                current = row['repository'] + '/' + shlex.split(line)[2].removeprefix('a/'); oldline = None
                if current in headers:
                    affected.append({'path': current, 'patch': short, 'patch_sha256': row['sha256']})
            elif line.startswith('@@ '):
                match = re.match(r'@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@', line)
                need(match, 'unsupported patch hunk'); oldline = int(match[1])
            elif oldline is not None:
                if line.startswith(('+', '-')) and any(a <= oldline <= b for a, b in headers.get(current, [])):
                    edits.append({'path': current, 'patch': short, 'line': oldline})
                if line.startswith((' ', '-')):
                    oldline += 1
    proof = bundle.get('native_indexed_patches')
    need(proof['passed'] is True, 'indexed header patch review failed')
    same(proof['ordered_patch_inputs_reviewed'], len(recipe['records']), 'indexed ordered patch coverage')
    same(proof['affected_patch_files'], affected, 'exact indexed patch identities')
    same(proof['indexed_files_touched'], sorted({r['path'] for r in affected}), 'indexed touched paths')
    same(proof['changes_within_indexed_original_headers'], edits, 'indexed original header edits')
    same(proof['base64_exception_patch_references'], base64, 'original version-2-only source patch references')
    need(not edits and not base64, 'changed original grant requires a new explicit review')


def check_grants(bundle, sources):
    index = bundle.get('native_grant_index'); scanned = bundle.get('native_scanned_index')
    review = bundle.get('native_grants'); source = sources['src']
    same(index['scope_prefixes'], list(PREFIXES), 'exact original-notice source scope')
    same((index['chromium_revision'], index['source_archive_sha256'], index['source_archive_bytes']),
         (source['revision'], source['sha256'], source['size']), 'notice index Chromium source binding')
    need(index['status'] == 'per-file-original-notices-reviewed' and index['original_notices_retained'] is True,
         'original notice review incomplete')
    rows = by(scanned, 'path', 'scanned original source')
    actual = {p.removeprefix('src/'): r for p, r in bundle.native_runtime_files.items()
              if r['kind'] == 'file' and any(p.startswith('src/' + prefix) for prefix in PREFIXES)}
    same(set(rows), set(actual), 'complete scoped original-source inventory')
    for name, row in rows.items():
        runtime_file(bundle, 'src/' + name, row['bytes'], row['sha256'])
    fingerprint = sha(''.join(r['path'] + '\0' + str(r['bytes']) + '\0' + r['sha256'] + '\n'
                             for r in sorted(scanned, key=lambda r: r['path'])).encode())
    same(index['scanned_source_inventory_sha256'], fingerprint, 'full scoped inventory logical digest')
    blink = sum(any(p.startswith(prefix) for prefix in PREFIXES[:4]) for p in rows)
    mozilla = len(rows) - blink
    same(index['counts'], {'blink_regular_files': blink, 'mozilla_regular_files': mozilla,
                          'archive_regular_files': source['regular_files']}, 'scoped source counts')
    candidates = by(index['files'] + index['notSelected'], 'path', 'reviewed original notice')
    for header_hash, grant in index['grants'].items():
        same(sha(grant['original_header'].encode()), header_hash, 'original notice header digest')
    for name, row in candidates.items():
        same((row['bytes'], row['sha256']), (rows[name]['bytes'], rows[name]['sha256']), 'notice source-file identity')
        need(not row['classification'].endswith('needs-review'), 'unreviewed original notice')
        if row.get('header_sha256'):
            need(row['header_sha256'] in index['grants'], 'missing original notice header')
    for row in index['files']:
        same((row['classification'], row['selected_later_version']), ('explicit-lgpl-or-later', 'LGPL-3.0'),
             'scoped later-version selection')
        header = re.sub(r'\s+', ' ', re.sub(r'(?m)^\s*(?:\*|//|#)\s?', '',
                                            index['grants'][row['header_sha256']]['original_header']))
        need('any later version' in header, 'original later-version permission absent')
    exception = candidates[BASE64]
    same((exception['classification'], exception['selected_later_version']),
         ('original-lgpl-version-2-only', None), 'original version-2-only source must remain unchanged')
    same(index['manual_review_candidates'], [], 'pending original notice reviews')
    manual = bundle.get('native_manual'); mozilla_proof = bundle.get('native_mozilla')
    same(manual['chromium_revision'], source['revision'], 'manual notice source revision')
    same(set(by(manual['reviews'], 'path', 'manual review path')),
         {p for p, r in candidates.items() if r.get('manual_review')}, 'complete manual review coverage')
    for row in manual['reviews']:
        bundle.material('native_manual', row)
        same((row['sha256'], row['bytes']), (rows[row['path']]['sha256'], rows[row['path']]['bytes']), 'manual notice bytes')
        same(row['later_version_selection'], None, 'manual original alternatives preserved')
    same(index['manual_review_evidence']['sha256'], bundle.sha('native_manual'), 'manual review evidence binding')
    same(index['manual_review_evidence']['applied_paths'], [r['path'] for r in manual['reviews']], 'manual review coverage')
    same(index['mozilla_notice_review']['sha256'], bundle.sha('native_mozilla'), 'Mozilla review evidence binding')
    same((mozilla_proof['passed'], mozilla_proof['chromium_revision'], mozilla_proof['source_archive_sha256']),
         (True, source['revision'], source['sha256']), 'Mozilla source binding')
    same(set(by(mozilla_proof['reviews'], 'path', 'Mozilla review path')),
         {p for p, r in candidates.items() if r.get('original_notice_review')}, 'complete original Mozilla review coverage')
    same(index['mozilla_notice_review']['reviewed_headers'], len(mozilla_proof['reviews']), 'Mozilla reviewed header count')
    for row in mozilla_proof['reviews']:
        candidate = candidates[row['path']]
        same((row['sha256'], row['header_sha256'], row['selected_later_version']),
             (candidate['sha256'], candidate['header_sha256'], None), 'original Mozilla/mixed notice')
    need(review['passed'] is True and review['unreviewed_candidates'] == 0, 'original grant review incomplete')
    same(review['index_sha256'], bundle.sha('native_grant_index'), 'original grant index evidence binding')
    same((review['chromium_revision'], review['chromium_source_archive_sha256']),
         (source['revision'], source['sha256']), 'grant review source identity')
    same((review['regular_blink_files_scanned'], review['regular_mozilla_files_scanned'],
          review['explicit_permission_template_matches'], review['original_mozilla_notice_headers_reviewed'],
          review['manual_original_notice_reviews'], review['original_version2_only_base64_preserved']),
         (blink, mozilla, len(index['files']), len(mozilla_proof['reviews']), len(manual['reviews']), True),
         'grant review exact coverage')
    check_indexed_patches(bundle, index, manual)
    return {'scoped_original_files': len(rows), 'explicit_original_permission_files': len(index['files']),
            'original_version2_only_preserved': True, 'original_notices_unchanged_by_patches': True}


def check_native_scope(bundle, runtime_sources, historical_snapshot=None):
    sources = by(runtime_sources, 'path', 'runtime source destination')
    need(hasattr(bundle, 'native_runtime_files'), 'full runtime inventory must be verified first')
    reuse = check_reuse(bundle, historical_snapshot)
    ffmpeg = check_ffmpeg(bundle, sources)
    grants = check_grants(bundle, sources)
    return {'reuse': reuse, 'ffmpeg': ffmpeg, 'original_notices': grants,
            'scope': 'Hash-bound source scope and retained original-notice review evidence; '
                     'classifications are reviewed inputs, not independently reclassified from every archive here. '
                     'No binary rebuild or legal certification.'}
