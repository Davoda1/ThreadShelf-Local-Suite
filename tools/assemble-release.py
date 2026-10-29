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
    return assets, evidence, summaries


def release_notes(version, repository):
    base = f'https://github.com/{repository}/releases/download'
    return f'''Reader, Analytics and Alternative are now **{version}**.

- Reader and Alternative use pinned **MathJax 4.1.3**, bundled locally with compatibility settings preserving established equation appearance.
- Exported ChatGPT/Codex file citations display as readable file cards with consistent document icons.
- Analytics retains its read-only behaviour. Profiles, archive/schema identifiers and the Electron/Node/npm/ONNX pins are unchanged.
- Windows portable ZIPs contain the application EXE at their root. Linux TAR.GZ packages contain a root native binary; DEB packages install a real native executable in `/usr/bin`.

Choose one of the nine native packages for your application and OS. The Reader Preview and Alternative Demo HTML files contain synthetic examples. Native packages include their runtime and do not require Node.js or npm.

All six Windows/Linux package jobs passed their archive, native runtime and GUI gates before publication. See `ThreadShelf-Local-Suite-{version}-Verification.md` and the matching evidence ZIP for exact checks and limits. Independent Checks workflow results are reported separately and are not inferred here. Verify downloads using the single **SHA256SUM.txt**.

The release includes the exact tagged suite source as ZIP and TAR.GZ. Unchanged dependency source companions retain their original filenames and checksums:

- [Electron/ONNX source parts and metadata (v1.3.0)](https://github.com/{repository}/releases/tag/v1.3.0), with the [v1.3.0 checksum manifest]({base}/v1.3.0/SHA256SUM.txt).
- [Native sharp/libvips sources (v1.0.0)]({base}/v1.0.0/ThreadShelf-Local-Suite-1.0.0-Native-Sources.tar.gz) and [offline manual]({base}/v1.0.0/ThreadShelf-Local-Suite-1.0.0-Manual.zip), with the [v1.0.0 checksum manifest]({base}/v1.0.0/SHA256SUM.txt).

Keep every numbered source part with its matching metadata/assembler ZIP. Windows packages remain unsigned. DEB payloads are validated and exercised after extraction; system-wide installation and every Linux distribution are not claimed tested. TTS is outside this release.
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
    for name, source in assets.items():
        try:
            os.link(source, output / name)
        except OSError:
            shutil.copyfile(source, output / name)
    stem = f'ThreadShelf-Local-Suite-{version}'
    for fmt, suffix in [('zip', '.zip'), ('tar.gz', '.tar.gz')]:
        run('git', 'archive', f'--format={fmt}', f'--prefix={stem}-Source/',
            f'--output={output / (stem + "-Source" + suffix)}', commit, cwd=root)
    with zipfile.ZipFile(output / (stem + '-Verification-Evidence.zip'), 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, path in sorted(evidence.items()):
            archive.write(path, 'verification/' + name)
    rows = '\n'.join(f'| {s["application"].title()} | {s["platform"]} | PASS | Executed |'
                     for s in summaries)
    report = f'''# ThreadShelf Local Suite {version} verification

Tag: `{tag}`

Commit: `{commit}`

Package workflow: {run_url}

This report is generated only after all six package jobs complete successfully. Input ledgers bind every published package and HTML preview to the exact tagged commit and SHA-256 digest. Nine native packages and two HTML previews were collected; two suite source archives were created using `git archive` from that commit.

| Application | Native host | Package/runtime validation | Native GUI |
| --- | --- | --- | --- |
{rows}

The evidence ZIP contains each original validator, native GUI and publication ledger JSON; Reader additionally includes its packaged-storage checks. Package jobs run the existing source tests, build steps and native validators. The Linux Reader and Alternative jobs also run the focused MathJax/file-citation browser checks before publication. HTML previews are generated from the tagged application sources; they are demonstrations with synthetic data, not substitutes for native tests.

The independent Checks workflow has its own status and is not asserted successful by this report. The local implementation review is [recorded at the tag](https://github.com/{repository}/blob/{tag}/maintainer/REVIEW-{version}.md). Historical personal-edition results are not counted as executions of this release.

## Limits

- Hosted Windows x64 and Ubuntu amd64 runners were used; other OS versions and real user archives were not exhaustively tested.
- DEB payloads were extracted and exercised; system-wide DEB installation is not claimed.
- Focused rendering checks use synthetic test harnesses and test-only browser flags. The separate packaged-GUI validators check the unchanged applications with Chromium's sandbox enabled.
- Windows packages are unsigned. No byte-identical rebuild of Electron/ONNX is claimed.
- Analytics functionality and the existing application storage/schema identifiers are unchanged.
- No TTS functionality is included.

## Sources and checksums

Use this release's `SHA256SUM.txt` for every attached asset. Unchanged Electron/ONNX sources remain at v1.3.0 and native sharp/libvips sources/manual at v1.0.0, with their original manifests. The v1.3.0 dependency inventory remains the runtime/toolchain baseline; Reader/Alternative MathJax is now 4.1.3.
'''
    (output / (stem + '-Verification.md')).write_text(report, encoding='utf-8')
    ledger = [{'name': p.name, 'bytes': p.stat().st_size, 'sha256': digest(p)} for p in sorted(output.iterdir())]
    (output / 'SHA256SUM.txt').write_text(''.join(f'{a["sha256"]}  {a["name"]}\n' for a in ledger))
    ledger.append({'name': 'SHA256SUM.txt', 'bytes': (output / 'SHA256SUM.txt').stat().st_size,
                   'sha256': digest(output / 'SHA256SUM.txt')})
    return version, ledger


def verify_uploaded(remote, tag, ledger):
    if remote.get('tag_name') != tag or {a['name'] for a in remote.get('assets', [])} != {a['name'] for a in ledger}:
        raise ValueError('Uploaded release asset names do not match the complete local ledger.')
    uploaded = {a['name']: a for a in remote['assets']}
    for asset in ledger:
        found = uploaded[asset['name']]
        if found.get('size') != asset['bytes'] or found.get('digest') != 'sha256:' + asset['sha256']:
            raise ValueError(f'Uploaded asset size/digest not verified: {asset["name"]}')


def publish(output, tag, repository, version, ledger):
    if os.environ.get('GITHUB_EVENT_NAME') != 'push' or os.environ.get('GITHUB_REF') != 'refs/tags/' + tag:
        raise ValueError('Publication is restricted to the workflow tag-push event.')
    notes = output.parent / f'{tag}-release-notes.md'
    notes.write_text(release_notes(version, repository), encoding='utf-8')
    exists = subprocess.run(['gh', 'release', 'view', tag, '--repo', repository],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
    if exists:
        previous = json.loads(run('gh', 'api', f'repos/{repository}/releases/tags/{tag}'))
        if previous.get('draft') is not True:
            # A retry of already published identical bytes is harmless. Never
            # partially replace a live release if a rebuild produced new bytes.
            verify_uploaded(previous, tag, ledger)
            return
    if not exists:
        run('gh', 'release', 'create', tag, '--repo', repository, '--verify-tag', '--draft',
            '--title', f'ThreadShelf Local Suite {version}', '--notes-file', notes)
    run('gh', 'release', 'upload', tag, '--repo', repository, '--clobber',
        *(output / a['name'] for a in ledger))
    remote = json.loads(run('gh', 'api', f'repos/{repository}/releases/tags/{tag}'))
    verify_uploaded(remote, tag, ledger)
    run('gh', 'release', 'edit', tag, '--repo', repository, '--draft=false', '--latest',
        '--title', f'ThreadShelf Local Suite {version}', '--notes-file', notes)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--record-inputs', type=Path)
    parser.add_argument('--app', choices=APPS)
    parser.add_argument('--platform', choices=('linux', 'win32'))
    parser.add_argument('--artifacts', type=Path)
    parser.add_argument('--out', type=Path, default=ROOT / 'release-assets')
    parser.add_argument('--tag')
    parser.add_argument('--repository', default=os.environ.get('GITHUB_REPOSITORY', 'Davoda1/ThreadShelf-Local-Suite'))
    parser.add_argument('--run-url', default='Not supplied')
    parser.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    if args.record_inputs:
        if not args.app or not args.platform:
            parser.error('--record-inputs requires --app and --platform')
        record_inputs(args.record_inputs.resolve(), args.app, args.platform)
        return
    if not args.tag or not args.artifacts:
        parser.error('--tag and --artifacts are required for assembly')
    version, ledger = assemble(args.artifacts.resolve(), args.out.resolve(), args.tag, args.repository, args.run_url)
    if args.publish:
        publish(args.out.resolve(), args.tag, args.repository, version, ledger)
    print(f'Assembled {len(ledger)} assets for {args.tag}; all six native validation records passed.')


if __name__ == '__main__':
    main()
