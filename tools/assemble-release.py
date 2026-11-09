#!/usr/bin/env python3
"""Assemble one tagged release from the six successful native package jobs.

Copyright (c) 2026 davoda1. MIT; see ../LICENSE.
No dependencies beyond Python, Git and (for publication) the GitHub CLI.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
from urllib.parse import quote
import zipfile

ROOT = Path(__file__).resolve().parents[1]
APPS = ('reader', 'analytics', 'alternative')
PLATFORMS = (('linux', 'linux'), ('windows', 'win32'))


def run(*args, cwd=ROOT):
    return subprocess.check_output(list(map(str, args)), cwd=cwd, text=True).strip()


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def version_for_tag(tag, root=ROOT):
    if not re.fullmatch(r'v[0-9]+\.[0-9]+\.[0-9]+', tag):
        raise ValueError('Publication requires an exact stable vX.Y.Z tag.')
    version = tag[1:]
    versions = json.loads((root / 'tools/release-versions.json').read_text())
    for app in APPS:
        manifest = json.loads((root / 'apps' / app / 'package.json').read_text())
        if versions.get(app) != version or manifest.get('version') != version:
            raise ValueError(f'{app}: application version does not match {tag}.')
    return version


def expected_names(app, target, version):
    stem = f'ThreadShelf-Local-{app.title()}-{version}'
    if target == 'windows':
        return [stem + '-Windows-x64-Portable.zip']
    names = [stem + '-Linux-amd64.tar.gz', f'threadshelf-local-{app}_{version}_amd64.deb']
    if app in ('reader', 'alternative'):
        names.append(stem + ('-Preview.html' if app == 'reader' else '-Demo.html'))
    return names


def record_inputs(directory, app, platform, root=ROOT):
    version = json.loads((root / 'apps' / app / 'package.json').read_text())['version']
    target = 'windows' if platform == 'win32' else 'linux'
    assets = []
    for name in expected_names(app, target, version):
        path = directory / name
        if not path.is_file() or path.is_symlink() or not path.stat().st_size:
            raise ValueError(f'Missing or invalid publication input: {name}')
        assets.append({'name': name, 'bytes': path.stat().st_size, 'sha256': digest(path)})
    record = {'application': app, 'version': version, 'platform': platform,
              'commit': run('git', 'rev-parse', 'HEAD', cwd=root), 'assets': assets}
    reports = directory / 'verification'
    reports.mkdir(exist_ok=True)
    (reports / f'{app}-{platform}-publication.json').write_text(json.dumps(record, indent=2) + '\n')
    (directory / 'SHA256SUM.txt').write_text(''.join(f'{a["sha256"]}  {a["name"]}\n' for a in assets))


def collect_inputs(artifacts, version, commit):
    """Fail closed on missing, duplicate, stale or failed platform results."""
    assets, evidence, summaries = {}, {}, []
    expected_directories = {f'{app}-{target}-{version}' for app in APPS for target, _ in PLATFORMS}
    if {p.name for p in artifacts.iterdir()} != expected_directories:
        raise ValueError('Exactly the six named application/platform artifacts are required.')
    for app in APPS:
        for target, platform in PLATFORMS:
            directory = artifacts / f'{app}-{target}-{version}'
            if directory.is_symlink():
                raise ValueError('Artifact directories must not be symlinks.')
            names = set(expected_names(app, target, version))
            if {p.name for p in directory.iterdir()} != names | {'verification', 'SHA256SUM.txt'}:
                raise ValueError(f'{directory.name}: unexpected or missing publication files.')
            reports = directory / 'verification'
            if reports.is_symlink() or not reports.is_dir():
                raise ValueError('Verification evidence must be a regular directory.')
            prefix = f'{app}-{platform}'
            records = {}
            for path in reports.iterdir():
                if not path.is_file() or path.is_symlink() or path.suffix != '.json' or path.stat().st_size > 20 * 1024 * 1024:
                    raise ValueError('Verification evidence must contain bounded regular JSON files.')
                if path.name in evidence:
                    raise ValueError(f'Duplicate evidence: {path.name}')
                records[path.name] = json.loads(path.read_text(encoding='utf-8'))
                evidence[path.name] = path
            summary = records.get(prefix + '-validation.json', {})
            if any(summary.get(k) != v for k, v in {'application': app, 'version': version,
                    'platform': platform, 'result': 'PASS', 'nativeGUIExecuted': True}.items()):
                raise ValueError(f'{prefix}: successful native validation is required.')
            for field in ('packageReport', 'guiReport') + (('storageReport',) if app == 'reader' else ()):
                if summary.get(field) not in records:
                    raise ValueError(f'{prefix}: missing {field}.')
            gui = records[summary['guiReport']]
            if gui.get('passed') is not True or gui.get('nativeGUIExecuted') is not True:
                raise ValueError(f'{prefix}: native GUI evidence is not successful.')
            publication = records.get(prefix + '-publication.json', {})
            if app in ('reader', 'alternative'):
                speech = records.get(summary.get('ttsReport', ''), {})
                if any(speech.get(k) != v for k, v in {'passed': True, 'application': app,
                        'version': version, 'platform': platform, 'packagedModuleExecuted': True}.items()):
                    raise ValueError(f'{prefix}: successful packaged CPU speech validation is required.')
                if set(speech.get('cases', {})) != {'buffered', 'streaming'} or any(
                        case.get('ok') is not True for case in speech['cases'].values()):
                    raise ValueError(f'{prefix}: buffered and streaming CPU speech must both pass.')
            if any(publication.get(k) != v for k, v in {'application': app, 'version': version,
                    'platform': platform, 'commit': commit}.items()):
                raise ValueError(f'{prefix}: inputs were not produced from the tagged commit.')
            ledger = publication.get('assets', [])
            if len(ledger) != len(names) or {a.get('name') for a in ledger} != names:
                raise ValueError(f'{prefix}: incomplete publication ledger.')
            for asset in ledger:
                path = directory / asset['name']
                if path.is_symlink() or not path.is_file() or path.stat().st_size != asset.get('bytes') or digest(path) != asset.get('sha256'):
                    raise ValueError(f'{prefix}: publication bytes differ for {path.name}.')
                assets[path.name] = path
            summaries.append(summary)
    if len(assets) != 11 or len(summaries) != 6:
        raise ValueError('Release requires nine native packages, two previews and six successful jobs.')
    math = json.loads(evidence['reader-linux-mathjax.json'].read_text())
    reader = json.loads(evidence['reader-linux-file-citations.json'].read_text())
    alternative = json.loads(evidence['alternative-linux-file-citations.json'].read_text())
    if math.get('passed') is not True or alternative.get('passed') is not True:
        raise ValueError('Focused rendering checks must pass.')
    if not reader.get('checks') or not reader.get('passed') or reader.get('errors') != [] or reader.get('remoteRequests') != []:
        raise ValueError('Reader file-citation rendering checks must pass.')
    if tuple(map(int, version.split('.'))) >= (1, 4, 3):
        for name, count in [('reader-linux-chatgpt.json', 'checks'),
                            ('reader-linux-grok.json', 'views'),
                            ('alternative-linux-compat.json', 'checks')]:
            path = evidence.get(name)
            report = json.loads(path.read_text()) if path else {}
            if (report.get('passed') is not True or type(report.get(count)) is not int or report[count] < 4
                    or type(report.get('networkRequests')) is not int or report['networkRequests'] != 0
                    or type(report.get('pageErrors')) is not int or report['pageErrors'] != 0):
                raise ValueError(f'{name}: four successful Grok/ChatGPT views without requests or page errors are required.')
    return assets, evidence, summaries


def release_title(version):
    suffix = {
        '1.4.2': ' — SVG previews and upstream 1.4.1 search patch',
        '1.4.3': ' — Grok and ChatGPT rendering improvements',
    }.get(version, '')
    return f'ThreadShelf Local Suite {version}{suffix}'


def build_runtime_source_update(output, version, root=ROOT):
    """Build the tagged, hash-pinned source supplement before packaging assets.

    Older historical tags predate this companion. Current releases must supply
    it; missing provenance or an unsuccessful builder cannot silently omit it.
    """
    if tuple(map(int, version.split('.'))) < (1, 4, 3):
        return None
    directory = root / 'maintainer/runtime-source-update'
    manifest_path = directory / 'manifest.json'
    builder = directory / 'build-source-update.py'
    updater = directory / 'update-runtime-sources.py'
    for path in (directory, manifest_path, builder, updater):
        if path.is_symlink() or not (path.is_dir() if path == directory else path.is_file()):
            raise ValueError('The tagged runtime source-update inputs are required.')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    electron = manifest.get('electron_version')
    if (manifest.get('schema_version') != 1 or manifest.get('suite_version') != version
            or not isinstance(electron, str) or not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', electron)):
        raise ValueError('Runtime source-update manifest identity does not match the release.')
    for app in APPS:
        package = json.loads((root / 'apps' / app / 'package.json').read_text(encoding='utf-8'))
        if package.get('devDependencies', {}).get('electron') != electron:
            raise ValueError(f'{app}: runtime source-update Electron version differs from the package.')
    if any(output.iterdir()):
        raise ValueError('Build runtime source update in an empty release output directory.')
    receipt = json.loads(run(sys.executable, builder, '--out', output.resolve(), '--version', version, cwd=root))
    name = f'ThreadShelf-Local-Suite-{version}-Runtime-Source-Update.tar.gz'
    path = output / name
    if (not isinstance(receipt, dict) or any(receipt.get(key) != value for key, value in {
            'schema': 'threadshelf-runtime-source-update-v1', 'version': version,
            'electron': electron, 'file_name': name, 'manifest_sha256': digest(manifest_path)}.items())
            or receipt.get('verified') is not True):
        raise ValueError('Runtime source-update builder verification is missing or stale.')
    if ({p.name for p in output.iterdir()} != {name} or path.is_symlink() or not path.is_file()
            or not 0 < path.stat().st_size < 2_000_000_000
            or type(receipt.get('bytes')) is not int or path.stat().st_size != receipt['bytes']
            or digest(path) != receipt.get('sha256')):
        raise ValueError('Runtime source-update output bytes do not match the verified archive.')
    # Inspect without extraction. The companion contains source archives and
    # regular updater/data files; it must never install links or traversal paths.
    required = {'runtime-source-update/manifest.json': manifest_path,
                'runtime-source-update/update-runtime-sources.py': updater}
    seen, verified, total = set(), set(), 0
    with tarfile.open(path, 'r:gz') as archive:
        for member in archive:
            name = member.name.rstrip('/')
            components = name.split('/')
            if (name in seen or len(seen) >= 100000 or components[0] != 'runtime-source-update'
                    or any(part in ('', '.', '..') or '\\' in part or ':' in part for part in components)
                    or not (member.isdir() or member.isfile()) or member.size < 0):
                raise ValueError('Runtime source-update archive contains an unsafe or duplicate member.')
            seen.add(name); total += member.size
            if total > 4 * 1024 * 1024 * 1024:
                raise ValueError('Runtime source-update archive exceeds its inspection limit.')
            if name in required:
                source = required[name]
                if not member.isfile() or member.size != source.stat().st_size:
                    raise ValueError('Runtime source-update provenance does not match the tagged inputs.')
                stream = archive.extractfile(member)
                if stream is None or hashlib.sha256(stream.read()).hexdigest() != digest(source):
                    raise ValueError('Runtime source-update provenance does not match the tagged inputs.')
                verified.add(name)
    if verified != set(required):
        raise ValueError('Runtime source-update archive is missing its tagged manifest or offline updater.')
    return receipt


def release_notes(version, repository):
    base = f'https://github.com/{repository}/releases/download'
    source_update = (f'- [Runtime source update]({base}/v{version}/ThreadShelf-Local-Suite-{version}-Runtime-Source-Update.tar.gz): verified changed runtime sources and an offline updater, used with all six original [v1.3.0 runtime source parts and matching metadata](https://github.com/{repository}/releases/tag/v1.3.0). Assemble the historical base without applying its old Electron patches, then follow the update instructions.\n'
                     if tuple(map(int, version.split('.'))) >= (1, 4, 3) else '')
    return f'''Reader, Analytics and Alternative are now **{version}**.

- Render Grok XML/custom elements, citation markers, saved cards, image/file/media references and artifacts as bounded archive content with SVG icons. Unknown or incomplete records retain readable, inspectable fallbacks; source URLs are resolved only from matching saved metadata.
- Expand ChatGPT citation/file-citation markers, saved filenames and line ranges, entities, source lists, archived widget envelopes, nested markers and chart data adapters. Supported chart data is rendered locally as SVG.
- Preserve original message/code copying and literal code examples. Archived tools, tasks, HTML and interactive components remain passive and never execute. Existing Markdown, math, Mermaid, SVG previews, image controls and TTS remain available.
- Bound repeated card metadata and parser output. Reader authorizes only referenced, exactly matched Grok image metadata through its existing image loading and network policy.
- Fix three Reader resource-exhaustion paths: oversized Ollama responses/progress, repeated backup-content expansion and forged ZIP read lengths.
- Refresh the selected runtime, build-tool and parser dependencies recorded in the tagged manifests. Analytics is rebuilt at **{version}** with the aligned toolchain; its application functionality and persisted formats are unchanged.
- Retain the optional [search patches for supported upstream ThreadShelf versions](https://github.com/{repository}/tree/v{version}/server-patch). The offline manual and screenshots retain their original 1.4.0 provenance; current rendering behavior is documented in the application READMEs and support notes.
- Windows portable ZIPs contain the application EXE at their root. Linux TAR.GZ packages contain a root native binary; DEB packages install a real native executable in `/usr/bin`.

Choose one of the nine native packages for your application and OS. Analytics also has new **{version}** Windows and Linux packages. The Reader Preview and Alternative Demo HTML files provide offline demonstrations using synthetic data. Missing metadata or assets in an export cannot be reconstructed. Native packages include their runtime and do not require Node.js or npm.

All six Windows/Linux package jobs passed their archive, native runtime and GUI gates before publication. See `ThreadShelf-Local-Suite-{version}-Verification.md` and the matching evidence ZIP for exact checks and limits. Independent Checks workflow results are reported separately and are not inferred here. Verify downloads using the single **SHA256SUM.txt**.

The release includes the exact tagged suite source as ZIP and TAR.GZ. Versioned dependency notices identify the corresponding source coverage, exact pins and retrieval/build instructions:

{source_update}- [Electron source access](https://github.com/{repository}/blob/v{version}/apps/reader/licenses/ELECTRON-SOURCE-ACCESS.md) and [ONNX source access](https://github.com/{repository}/blob/v{version}/apps/reader/licenses/ONNX-SOURCE-ACCESS.md).
- [Native sharp/libvips sources (v1.0.0)]({base}/v1.0.0/ThreadShelf-Local-Suite-1.0.0-Native-Sources.tar.gz), with the [v1.0.0 checksum manifest]({base}/v1.0.0/SHA256SUM.txt).

For multipart source companions, keep every numbered source part with its matching metadata/assembler ZIP and verify it against its original release manifest. Speech payloads include their own notices, voice attribution and corresponding GPL source archives. Windows packages remain unsigned. DEB payloads are validated and exercised after extraction; system-wide installation and every Linux distribution are not claimed tested. Remote speech services require a configured endpoint and any credentials required by that provider; their availability and output are not verified by the offline package gates.
'''


def assemble(artifacts, output, tag, repository, run_url, root=ROOT):
    version = version_for_tag(tag, root)
    commit = run('git', 'rev-parse', 'HEAD', cwd=root)
    if run('git', 'rev-parse', f'refs/tags/{tag}^{{commit}}', cwd=root) != commit:
        raise ValueError('Checkout HEAD must be the exact release tag.')
    assets, evidence, summaries = collect_inputs(artifacts, version, commit)
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise ValueError('Use an empty release output directory.')
    source_update = build_runtime_source_update(output, version, root)
    for name, source in assets.items():
        try:
            os.link(source, output / name)
        except OSError:
            shutil.copyfile(source, output / name)
    stem = f'ThreadShelf-Local-Suite-{version}'
    for fmt, suffix in [('zip', '.zip'), ('tar.gz', '.tar.gz')]:
        run('git', 'archive', f'--format={fmt}', f'--prefix={stem}-Source/',
            f'--output={output / (stem + "-Source" + suffix)}', commit, cwd=root)
    run('git', 'archive', '--format=zip', f'--prefix={stem}-Manual/',
        f'--output={output / (stem + "-Manual.zip")}', f'{commit}:docs', cwd=root)
    with zipfile.ZipFile(output / (stem + '-Verification-Evidence.zip'), 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, path in sorted(evidence.items()):
            archive.write(path, 'verification/' + name)
        if source_update:
            archive.writestr('verification/runtime-source-update.json', json.dumps(source_update, indent=2) + '\n')
    rows = '\n'.join(f'| {s["application"].title()} | {s["platform"]} | PASS | Executed |'
                     for s in summaries)
    update_report = (f'The attached [runtime source update](https://github.com/{repository}/releases/download/{tag}/{source_update["file_name"]}) was built from the tagged source manifest and its pinned upstream inputs. Its archive SHA-256 is `{source_update["sha256"]}`; the evidence ZIP includes its verified build receipt. Use it with all six original v1.3.0 runtime source parts and metadata, assembling that base without applying the old Electron patches. The update provides the changed runtime sources and offline update instructions.\n\n'
                     if source_update else '')
    report = f'''# ThreadShelf Local Suite {version} verification

Tag: `{tag}`

Commit: `{commit}`

Package workflow: {run_url}

This report is generated only after all six package jobs complete successfully. Input ledgers bind every published package and HTML preview to the exact tagged commit and SHA-256 digest. Nine native packages and two HTML previews were collected; two suite source archives and the offline manual ZIP were created using `git archive` from that commit.

| Application | Native host | Package/runtime validation | Native GUI |
| --- | --- | --- | --- |
{rows}

The evidence ZIP contains each original validator, native GUI and publication ledger JSON; Reader additionally includes its packaged-storage checks. Reader and Alternative execute their packaged CPU speech module and bundled workers for buffered and streaming inference on each native host. Package jobs run the source tests, build steps and native validators. The Linux Reader and Alternative jobs also run the focused MathJax/file-citation and Grok/ChatGPT compatibility browser checks before publication. The new compatibility gates require four successful layout/theme views per suite, with no unsolicited requests or page errors. HTML previews are generated from the tagged application sources; they are demonstrations with synthetic data, not substitutes for native tests.

The independent Checks workflow has its own status and is not asserted successful by this report. The local implementation review is [recorded at the tag](https://github.com/{repository}/blob/{tag}/maintainer/REVIEW-{version}.md).

## Limits

- Hosted Windows x64 and Ubuntu amd64 runners were used; other OS versions and real user archives were not exhaustively tested.
- DEB payloads were extracted and exercised; system-wide DEB installation is not claimed.
- Focused rendering checks use synthetic test harnesses and test-only browser flags. The separate packaged-GUI validators check the application builds with Chromium's sandbox enabled.
- Windows packages are unsigned. No byte-identical rebuild of Electron/ONNX is claimed.
- Analytics functionality and the existing application storage/schema identifiers are unchanged.
- Speech checks exercise bundled CPU engines with synthetic text. External provider accounts and real remote-service availability are not tested by these offline gates.

## Sources and checksums

{update_report}Use this release's `SHA256SUM.txt` for every attached asset, including the bundled manual and runtime source update. The exact tagged package manifests, lockfiles and toolchain manifests record the release dependency versions. Consult the tagged [Electron](https://github.com/{repository}/blob/{tag}/apps/reader/licenses/ELECTRON-SOURCE-ACCESS.md) and [ONNX](https://github.com/{repository}/blob/{tag}/apps/reader/licenses/ONNX-SOURCE-ACCESS.md) source notices for version-specific source coverage and instructions. The unchanged native sharp/libvips source companion remains at v1.0.0 with its original manifest. Speech models, runtimes and sources are pinned in each application's `tts/cpu/assets-manifest.json`, with notices and corresponding GPL sources retained in the packaged speech payload.
'''
    (output / (stem + '-Verification.md')).write_text(report, encoding='utf-8')
    ledger = [{'name': p.name, 'bytes': p.stat().st_size, 'sha256': digest(p)} for p in sorted(output.iterdir())]
    (output / 'SHA256SUM.txt').write_text(''.join(f'{a["sha256"]}  {a["name"]}\n' for a in ledger))
    ledger.append({'name': 'SHA256SUM.txt', 'bytes': (output / 'SHA256SUM.txt').stat().st_size,
                   'sha256': digest(output / 'SHA256SUM.txt')})
    return version, ledger


def verify_uploaded(remote, tag, ledger):
    if (remote.get('tag_name') != tag or len(remote.get('assets', [])) != len(ledger)
            or {a['name'] for a in remote.get('assets', [])} != {a['name'] for a in ledger}):
        raise ValueError('Uploaded release asset names do not match the complete local ledger.')
    uploaded = {a['name']: a for a in remote['assets']}
    for asset in ledger:
        found = uploaded[asset['name']]
        if (found.get('state') != 'uploaded' or found.get('size') != asset['bytes']
                or found.get('digest') != 'sha256:' + asset['sha256']):
            raise ValueError(f'Uploaded asset size/digest not verified: {asset["name"]}')


def validate_release_identity(remote, release_id, tag):
    if not isinstance(release_id, int) or isinstance(release_id, bool) or release_id < 1:
        raise ValueError('GitHub must return a positive numeric release ID.')
    if not isinstance(remote, dict) or remote.get('id') != release_id or remote.get('tag_name') != tag:
        raise ValueError('Resolved GitHub release identity does not match the requested tag.')
    return remote


def read_release(repository, release_id, tag):
    validate_release_identity({'id': release_id, 'tag_name': tag}, release_id, tag)
    remote = json.loads(run('gh', 'api', f'repos/{repository}/releases/{release_id}'))
    return validate_release_identity(remote, release_id, tag)


def resolve_release(repository, tag):
    """Authenticated listing includes drafts that the tag endpoint can omit."""
    matches = []
    for page in range(1, 11):
        records = json.loads(run('gh', 'api', f'repos/{repository}/releases?per_page=100&page={page}'))
        if not isinstance(records, list):
            raise ValueError('GitHub release listing did not return an array.')
        matches.extend(record for record in records if record.get('tag_name') == tag)
        if len(records) < 100:
            break
    else:
        raise ValueError('Release lookup exceeded its bounded 1,000-release limit.')
    if len(matches) > 1:
        raise ValueError('Multiple GitHub releases use this tag; refusing an ambiguous update.')
    if not matches:
        return None
    return read_release(repository, matches[0].get('id'), tag)


def publication_event_allowed(tag, environment=os.environ):
    pushed_tag = (environment.get('GITHUB_EVENT_NAME') == 'push'
                  and environment.get('GITHUB_REF') == 'refs/tags/' + tag)
    verified_recovery = (environment.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
                         and environment.get('GITHUB_REF') == 'refs/heads/master'
                         and environment.get('GITHUB_WORKFLOW') == 'Publish validated release'
                         and environment.get('RELEASE_TAG') == tag)
    return pushed_tag or verified_recovery


def create_draft(repository, tag, version, notes):
    reference = json.loads(run('gh', 'api', f'repos/{repository}/git/ref/tags/{tag}'))
    if reference.get('ref') != 'refs/tags/' + tag:
        raise ValueError('The release tag must already exist in the remote repository.')
    request = notes.with_name(f'{tag}-release-create.json')
    request.write_text(json.dumps({'tag_name': tag, 'draft': True,
        'name': release_title(version), 'body': notes.read_text(encoding='utf-8')}), encoding='utf-8')
    remote = json.loads(run('gh', 'api', '--method', 'POST', f'repos/{repository}/releases',
        '--header', 'Content-Type: application/json', '--input', request))
    validate_release_identity(remote, remote.get('id') if isinstance(remote, dict) else None, tag)
    if remote.get('draft') is not True:
        raise ValueError('GitHub did not return the requested draft release.')
    # Use the creation response: release listings can lag behind a successful POST.
    return remote


def upload_assets(output, repository, current, ledger):
    release_id = current['id']
    assets = current.get('assets', [])
    existing = {asset['name']: asset for asset in assets}
    expected_names = {asset['name'] for asset in ledger}
    if len(existing) != len(assets) or set(existing) - expected_names:
        raise ValueError('The draft contains duplicate or unexpected release assets.')
    for asset in ledger:
        previous = existing.get(asset['name'])
        if previous is not None:
            if (previous.get('state') == 'uploaded' and previous.get('size') == asset['bytes']
                    and previous.get('digest') == 'sha256:' + asset['sha256']):
                print(f'Reusing verified asset: {asset["name"]}', flush=True)
                continue
            asset_id = previous.get('id')
            if not isinstance(asset_id, int) or isinstance(asset_id, bool) or asset_id < 1:
                raise ValueError('GitHub must return a positive numeric asset ID before replacement.')
            run('gh', 'api', '--method', 'DELETE', f'repos/{repository}/releases/assets/{asset_id}')
        # gh api streams --input from disk, including multi-gigabyte packages.
        endpoint = (f'https://uploads.github.com/repos/{repository}/releases/{release_id}/assets'
                    f'?name={quote(asset["name"], safe="")}')
        print(f'Uploading asset: {asset["name"]}', flush=True)
        uploaded = json.loads(run('gh', 'api', '--method', 'POST', endpoint,
            '--header', 'Content-Type: application/octet-stream',
            '--header', f'Content-Length: {asset["bytes"]}', '--input', output / asset['name']))
        verify_uploaded({'tag_name': current['tag_name'], 'assets': [uploaded]}, current['tag_name'], [asset])


def publish(output, tag, repository, version, ledger):
    if not publication_event_allowed(tag):
        raise ValueError('Publication requires a tag push or the verified master release-recovery workflow.')
    notes = output.parent / f'{tag}-release-notes.md'
    notes.write_text(release_notes(version, repository), encoding='utf-8')
    current = resolve_release(repository, tag)
    if current is not None and current.get('draft') is not True:
        # A retry of already published identical bytes is harmless. Never
        # partially replace a live release if a rebuild produced new bytes.
        verify_uploaded(current, tag, ledger)
        return
    if current is None:
        current = create_draft(repository, tag, version, notes)
    release_id = current['id']
    upload_assets(output, repository, current, ledger)
    remote = read_release(repository, release_id, tag)
    verify_uploaded(remote, tag, ledger)
    update = output.parent / f'{tag}-release-update.json'
    update.write_text(json.dumps({'draft': False, 'make_latest': 'true',
        'name': release_title(version), 'body': notes.read_text(encoding='utf-8')}), encoding='utf-8')
    published = json.loads(run('gh', 'api', '--method', 'PATCH', f'repos/{repository}/releases/{release_id}',
        '--header', 'Content-Type: application/json', '--input', update))
    validate_release_identity(published, release_id, tag)
    if published.get('draft') is not False:
        raise ValueError('GitHub did not confirm publication of the verified release.')
    verify_uploaded(published, tag, ledger)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--record-inputs', type=Path)
    parser.add_argument('--app', choices=APPS)
    parser.add_argument('--platform', choices=('linux', 'win32'))
    parser.add_argument('--artifacts', type=Path)
    parser.add_argument('--out', type=Path, default=ROOT / 'release-assets')
    parser.add_argument('--source-root', type=Path, default=ROOT)
    parser.add_argument('--tag')
    parser.add_argument('--repository', default=os.environ.get('GITHUB_REPOSITORY', 'Davoda1/ThreadShelf-Local-Suite'))
    parser.add_argument('--run-url', default='Not supplied')
    parser.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    if args.record_inputs:
        if not args.app or not args.platform:
            parser.error('--record-inputs requires --app and --platform')
        record_inputs(args.record_inputs.resolve(), args.app, args.platform, args.source_root.resolve())
        return
    if not args.tag or not args.artifacts:
        parser.error('--tag and --artifacts are required for assembly')
    version, ledger = assemble(args.artifacts.resolve(), args.out.resolve(), args.tag, args.repository,
                               args.run_url, args.source_root.resolve())
    if args.publish:
        publish(args.out.resolve(), args.tag, args.repository, version, ledger)
    print(f'Assembled {len(ledger)} assets for {args.tag}; all six native validation records passed.')


if __name__ == '__main__':
    main()
