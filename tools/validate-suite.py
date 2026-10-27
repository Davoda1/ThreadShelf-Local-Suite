#!/usr/bin/env python3
"""Verify built archives and execute their native runtime on the matching host.

Copyright (c) 2026 davoda1. MIT; see ../LICENSE.
This is a development check, not an application launcher. All applications
exercise relocated release archives graphically on both systems; Analytics
uses its deeper capture/reindex harness for Linux TAR and extracted DEB payloads.
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import zipfile
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
APPS = ('reader', 'analytics', 'alternative')
sys.dont_write_bytecode = True


def digest(file):
    value = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def checksum_for(contents, filename):
    matches = []
    for line in contents.splitlines():
        match = re.fullmatch(r'([a-fA-F0-9]{64})\s+\*?(\S+)', line.strip())
        if match and match[2] == filename:
            matches.append(match[1].lower())
    if len(matches) != 1:
        raise ValueError(f'Exactly one official checksum is required for {filename}.')
    return matches[0]


def prepare_runtime_cache(app, version, platform, cache):
    """Expose the checked ZIP at the flat path expected by package validators."""
    if not re.fullmatch(r'[1-9][0-9]*\.[0-9]+\.[0-9]+', version):
        raise ValueError('The Electron version must be exact.')
    cache.mkdir(parents=True, exist_ok=True)
    name = f'electron-v{version}-{platform}-x64.zip'
    archive = cache / name
    if app == 'alternative':
        spec = importlib.util.spec_from_file_location('alternative_build', ROOT / 'apps/alternative/scripts/build.py')
        build = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(build)
        if version != build.ELECTRON:
            raise ValueError('Alternative manifest and fixed runtime version disagree.')
        expected = build.HASHES[platform]
        source = 'fixed upstream ZIP hash in Alternative build script'
    else:
        sums = cache / 'SHASUMS256.txt'
        try:
            expected = checksum_for(sums.read_text(encoding='utf-8'), name)
        except (OSError, ValueError):
            url = f'https://github.com/electron/electron/releases/download/v{version}/SHASUMS256.txt'
            request = Request(url, headers={'User-Agent': 'ThreadShelf-Local-Suite-validation'})
            with urlopen(request, timeout=60) as response:
                data = response.read(2 * 1024 * 1024 + 1)
            if len(data) > 2 * 1024 * 1024:
                raise ValueError('Official Electron checksum file exceeds its size limit.')
            contents = data.decode('utf-8')
            expected = checksum_for(contents, name)
            sums.write_bytes(data)
        source = f'Electron v{version} official SHASUMS256.txt'
    layout = 'flat'
    if not archive.is_file():
        candidates = sorted(p for p in cache.rglob(name) if p.is_file())
        matching = [p for p in candidates if digest(p) == expected]
        if not matching:
            raise ValueError(f'No checksum-matching cached runtime found for {name}; build the selected package first.')
        shutil.copyfile(matching[0], archive)
        layout = 'normalized @electron/get cache'
    if digest(archive) != expected:
        raise ValueError(f'Official runtime ZIP checksum mismatch: {name}')
    return {'file': name, 'sha256': expected, 'bytes': archive.stat().st_size,
            'cacheLayout': layout, 'checksumSource': source}


def staged_runtime(app, platform, version):
    project = ROOT / 'apps' / app
    product = 'ThreadShelf Local ' + app.title()
    slug = 'threadshelf-local-' + app
    if app == 'alternative':
        runtime = project / '.build' / ('stage-windows' if platform == 'win32' else 'stage-linux')
        if platform == 'linux':
            runtime = runtime / 'lib' / slug
    else:
        suffix = '-Windows-x64-Portable' if platform == 'win32' else '-Linux-amd64'
        runtime = project / '.packaging' / (product.replace(' ', '-') + '-' + version + suffix)
        if platform == 'linux':
            runtime = runtime / 'app'
    executable = runtime / (product + '.exe' if platform == 'win32' else slug)
    return runtime, executable


def validator_command(app, platform, out, cache, report):
    command = [sys.executable, str(ROOT / 'apps' / app / 'scripts/validate-packages.py')]
    command += [str(out)] if app == 'alternative' else ['--binaries', '--out', str(out)]
    return command + ['--platform', platform, '--runtime-cache', str(cache), '--report', str(report)]


def sanitize(value, replacements):
    if isinstance(value, dict):
        return {key: sanitize(item, replacements) for key, item in value.items()}
    if isinstance(value, list):
        return [sanitize(item, replacements) for item in value]
    if isinstance(value, str):
        for original, replacement in sorted(replacements, key=lambda pair: len(str(pair[0])), reverse=True):
            variants = {str(original), str(original).replace('\\', '/'), json.dumps(str(original))[1:-1]}
            for text in sorted(variants, key=len, reverse=True):
                if text:
                    value = value.replace(text, replacement)
    return value


def run_checked(command, cwd, env, replacements, timeout=1200):
    result = subprocess.run(command, cwd=cwd, env=env, capture_output=True,
                            text=True, encoding='utf-8', errors='replace', timeout=timeout)
    if result.returncode:
        detail = sanitize((result.stdout + '\n' + result.stderr)[-16000:], replacements)
        raise RuntimeError(f'Validation process exited {result.returncode}:\n{detail}')
    return result.stdout


def native_identity(runtime, executable, manifest, platform, env, replacements):
    probe = """const fs=require('node:fs'),path=require('node:path');
const canonical=p=>{const s=fs.realpathSync(p);return process.platform==='win32'?s.toLowerCase():s;};
const app=JSON.parse(fs.readFileSync(path.join(process.env.THREADSHELF_VALIDATION_APP,'package.json'),'utf8'));
console.log('THREADSHELF_NATIVE_IDENTITY '+JSON.stringify({application:app.name,version:app.version,
electron:process.versions.electron,node:process.versions.node,chrome:process.versions.chrome,
platform:process.platform,arch:process.arch,
executedStagedBinary:canonical(process.execPath)===canonical(process.env.THREADSHELF_VALIDATION_EXECUTABLE)}));"""
    probe_env = {**env, 'ELECTRON_RUN_AS_NODE': '1',
                 'THREADSHELF_VALIDATION_APP': str(runtime / 'resources/app'),
                 'THREADSHELF_VALIDATION_EXECUTABLE': str(executable)}
    output = run_checked([str(executable), '-e', probe], runtime, probe_env, replacements, timeout=60)
    prefix = 'THREADSHELF_NATIVE_IDENTITY '
    records = [json.loads(line[len(prefix):]) for line in output.splitlines() if line.startswith(prefix)]
    if len(records) != 1:
        raise ValueError('Native runtime did not return exactly one identity record.')
    record = records[0]
    expected = {'application': manifest['name'], 'version': manifest['version'],
                'electron': manifest['devDependencies']['electron'], 'platform': platform,
                'arch': 'x64', 'executedStagedBinary': True}
    if any(record.get(key) != value for key, value in expected.items()):
        raise ValueError('Native package identity, version, architecture or runtime differs from the selected release.')
    return {**record, 'nativeRuntimeExecutedInNodeMode': True, 'nativeGUIExecuted': False}


def reader_storage(runtime, executable, manifest, platform, env, replacements):
    project = ROOT / 'apps/reader'
    with tempfile.TemporaryDirectory(prefix='threadshelf-reader-validation-') as temporary:
        temp = Path(temporary)
        local_replacements = replacements + [(temp, '<synthetic-test>')]
        smoke_env = {**env, 'ELECTRON_RUN_AS_NODE': '1', 'READER_APP_ROOT': str(runtime / 'resources/app'),
                     'READER_EVIDENCE': str(temp), 'TMPDIR': str(temp), 'TMP': str(temp), 'TEMP': str(temp)}
        run_checked([str(executable), str(project / 'tests/packaged-storage-smoke.mjs')],
                    project, smoke_env, local_replacements, timeout=600)
        report = json.loads((temp / 'packaged-storage-smoke.json').read_text(encoding='utf-8'))
        if (report.get('status') != 'PASS' or report.get('version') != manifest['version']
                or report.get('runtime', {}).get('electron') != manifest['devDependencies']['electron']
                or report.get('runtime', {}).get('platform') != platform):
            raise ValueError('Native Reader storage smoke did not validate the selected application/runtime.')
        report['appRoot'] = 'resources/app'
        report['nativeGUIExecuted'] = False
        return sanitize(report, local_replacements)


def packaged_gui(app, out, manifest, platform, env, replacements):
    """Launch the unchanged native payload extracted from each release archive."""
    node = shutil.which('node')
    xvfb = shutil.which('xvfb-run') if platform == 'linux' else None
    if not node or (platform == 'linux' and not xvfb):
        raise ValueError('Native GUI validation requires Node.js and, on Linux, xvfb-run.')
    version = manifest['version']
    product = 'ThreadShelf Local ' + app.title()
    stem = product.replace(' ', '-') + '-' + version
    slug = 'threadshelf-local-' + app
    archives = [('ZIP', out / (stem + '-Windows-x64-Portable.zip'))] if platform == 'win32' else [
        ('TAR', out / (stem + '-Linux-amd64.tar.gz')),
        ('DEB', out / (slug + '_' + version + '_amd64.deb')),
    ]
    cases = []
    for kind, archive in archives:
        with tempfile.TemporaryDirectory(prefix=f'threadshelf-{app}-gui-') as temporary:
            temp = Path(temporary)
            relocated = temp / 'relocated package with spaces'
            relocated.mkdir()
            evidence = temp / 'native-gui.json'
            local_replacements = replacements + [(temp, '<synthetic-test>')]
            if kind == 'ZIP':
                with zipfile.ZipFile(archive) as package:
                    package.extractall(relocated)
                runtime = relocated
                entry = runtime / (product + '.exe')
            elif kind == 'TAR':
                # The preceding archive validator has already checked every
                # path, byte, mode and approved native executable symlink.
                with tarfile.open(archive, 'r:gz') as package:
                    extraction = {'filter': 'fully_trusted'} if hasattr(tarfile, 'fully_trusted_filter') else {}
                    package.extractall(relocated, **extraction)
                portable = relocated / (stem + '-Linux-amd64')
                runtime = portable / ('app' if app == 'reader' else 'lib/' + slug)
                entry = portable / 'bin' / slug
            else:
                run_checked(['dpkg-deb', '--extract', str(archive), str(relocated)],
                            ROOT, env, local_replacements, timeout=180)
                runtime = relocated / 'opt' / slug
                # Absolute /usr/bin links in a DEB resolve only after a system
                # installation. Their exact target is checked by the archive
                # validator; exercise the extracted native target directly here.
                entry = runtime / slug
            archived_manifest = json.loads((runtime / 'resources/app/package.json').read_text(encoding='utf-8'))
            if (archived_manifest.get('name'), archived_manifest.get('version')) != (manifest['name'], version):
                raise ValueError('The relocated GUI payload does not match the selected application/version.')
            gui_env = {**env, 'TMPDIR': str(temp), 'TMP': str(temp), 'TEMP': str(temp)}
            command = [node, str(ROOT / 'tools/packaged-gui-smoke.mjs'), app,
                       str(runtime), str(entry), str(evidence)]
            if xvfb:
                command = [xvfb, '-a', '-s', '-screen 0 1600x1200x24'] + command
            run_checked(command, ROOT, gui_env, local_replacements, timeout=600)
            report = json.loads(evidence.read_text(encoding='utf-8'))
            expected = {'passed': True, 'application': app, 'version': version,
                        'platform': platform, 'electron': manifest['devDependencies']['electron'],
                        'nativeGUIExecuted': True, 'packageFilesUnchanged': True,
                        'chromiumSandboxEnabled': True, 'errors': []}
            if any(report.get(key) != value for key, value in expected.items()):
                raise ValueError('Native GUI validation did not verify the unchanged sandboxed release payload.')
            if len(report.get('checks', [])) < (6 if app == 'reader' else 5):
                raise ValueError('Native GUI validation did not execute all required application checks.')
            cases.append({**sanitize(report, local_replacements), 'archiveType': kind,
                          'archive': archive.name, 'archiveSha256': digest(archive),
                          'entryPoint': entry.relative_to(relocated).as_posix(),
                          'relocatedArchiveExecuted': True})
    return {'passed': True, 'application': app, 'version': version, 'platform': platform,
            'nativeGUIExecuted': True, 'cases': cases,
            'limitations': ['DEB payloads are extracted and exercised; no system-wide DEB installation is performed.']
            if platform == 'linux' else []}


def analytics_gui(out, manifest, env, replacements):
    project = ROOT / 'apps/analytics'
    xvfb, node = shutil.which('xvfb-run'), shutil.which('node')
    if not xvfb or not node:
        raise ValueError('Analytics native GUI validation requires xvfb-run and Node.js.')
    version = manifest['version']
    tar = out / f'ThreadShelf-Local-Analytics-{version}-Linux-amd64.tar.gz'
    deb = out / f'threadshelf-local-analytics_{version}_amd64.deb'
    with tempfile.TemporaryDirectory(prefix='threadshelf-analytics-gui-') as temporary:
        temp = Path(temporary)
        evidence = temp / 'gui.json'
        local_replacements = replacements + [(temp, '<synthetic-test>')]
        gui_env = {**env, 'ANALYTICS_PACKAGE_TAR': str(tar), 'ANALYTICS_PACKAGE_DEB': str(deb),
                   'ANALYTICS_GUI_EVIDENCE': str(evidence), 'TMPDIR': str(temp), 'TMP': str(temp), 'TEMP': str(temp)}
        # Hosted CI must exercise the unchanged package and ordinary sandbox.
        for name in ('ELECTRON_RUN_AS_NODE', 'ANALYTICS_GUI_TEST_DISABLE_SINGLETON',
                     'ANALYTICS_GUI_TEST_NO_SANDBOX', 'ANALYTICS_XVFB_PATH',
                     'ANALYTICS_XKB_DIR', 'ANALYTICS_PACKAGE_X_DISPLAY'):
            gui_env.pop(name, None)
        run_checked([xvfb, '-a', node, 'test/gui-package-smoke.cjs'], project,
                    gui_env, local_replacements, timeout=1200)
        report = json.loads(evidence.read_text(encoding='utf-8'))
        cases = report.get('cases', [])
        if (report.get('passed') is not True or report.get('version') != version
                or len(cases) != 2 or {case.get('type') for case in cases} != {'TAR', 'DEB'}
                or report.get('rendererErrors') != [] or report.get('observedExternalRequests') != []):
            raise ValueError('Analytics GUI smoke did not complete both native package cases cleanly.')
        for case in cases:
            if (case.get('packagedGui') != 'executed' or case.get('copiedExecutableForGui') is not False
                    or case.get('embeddedMainUnchangedForGui') is not True
                    or case.get('electron') != manifest['devDependencies']['electron']
                    or case.get('allInstalledFilesSha256ModeAndLinksUnchanged') is not True
                    or case.get('syntheticCaptureReadOnly') is not True
                    or case.get('preloadSettingsPersistAcrossGracefulRestart') is not True):
                raise ValueError('Analytics GUI smoke did not verify the unchanged native release payload.')
        harness = report.get('testOnlyHarness', {})
        if any(harness.get(key) is not False for key in ('copiedMain', 'copiedExecutable', 'singletonMethodOverride', 'externalPreloadShimAttempt', 'rootSandboxFlag')):
            raise ValueError('Analytics GUI smoke unexpectedly used a singleton or sandbox accommodation.')
        report['nativeGUIExecuted'] = True
        return sanitize(report, local_replacements)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app', choices=APPS, required=True)
    parser.add_argument('--platform', choices=('win32', 'linux'), required=True)
    parser.add_argument('--out', type=Path, default=ROOT / 'release')
    parser.add_argument('--runtime-cache', type=Path, default=ROOT / '.cache/electron')
    args = parser.parse_args()
    if sys.platform != args.platform:
        parser.error('Native validation must run on the selected Windows or Linux platform.')
    project = ROOT / 'apps' / args.app
    manifest = json.loads((project / 'package.json').read_text(encoding='utf-8'))
    out = args.out.resolve()
    cache = args.runtime_cache.resolve() / manifest['devDependencies']['electron']
    reports = out / 'verification'
    reports.mkdir(parents=True, exist_ok=True)
    prefix = f'{args.app}-{args.platform}'
    replacements = [(ROOT, '<checkout>'), (out, '<release>'), (cache, '<runtime-cache>'),
                    (Path.home(), '<home>'), (Path(tempfile.gettempdir()), '<temporary>')]
    summary = {'application': args.app, 'version': manifest['version'], 'platform': args.platform,
               'nativeGUIExecuted': False, 'result': 'FAIL'}
    env = os.environ.copy()
    env.pop('NODE_OPTIONS', None)
    env.pop('ELECTRON_RUN_AS_NODE', None)
    try:
        print(f'Validating {args.app} archives and native {args.platform} runtime.', flush=True)
        summary['runtimeArchive'] = prepare_runtime_cache(args.app, manifest['devDependencies']['electron'], args.platform, cache)
        package_report = reports / (prefix + '-packages.json')
        run_checked(validator_command(args.app, args.platform, out, cache, package_report), project, env, replacements)
        package_data = sanitize(json.loads(package_report.read_text(encoding='utf-8')), replacements)
        package_report.write_text(json.dumps(package_data, indent=2) + '\n', encoding='utf-8')
        summary['packageReport'] = package_report.name
        runtime, executable = staged_runtime(args.app, args.platform, manifest['version'])
        summary['nativeRuntime'] = native_identity(runtime, executable, manifest, args.platform, env, replacements)
        if args.app == 'reader':
            storage = reader_storage(runtime, executable, manifest, args.platform, env, replacements)
            storage_report = reports / (prefix + '-storage.json')
            storage_report.write_text(json.dumps(storage, indent=2) + '\n', encoding='utf-8')
            summary['storageReport'] = storage_report.name
        if args.app in ('reader', 'alternative') or (args.app == 'analytics' and args.platform == 'win32'):
            gui = packaged_gui(args.app, out, manifest, args.platform, env, replacements)
            gui_report = reports / (prefix + '-gui.json')
            gui_report.write_text(json.dumps(gui, indent=2) + '\n', encoding='utf-8')
            summary['guiReport'] = gui_report.name
            summary['nativeGUIExecuted'] = True
        if args.app == 'analytics' and args.platform == 'linux':
            gui = analytics_gui(out, manifest, env, replacements)
            gui_report = reports / (prefix + '-gui.json')
            gui_report.write_text(json.dumps(gui, indent=2) + '\n', encoding='utf-8')
            summary['guiReport'] = gui_report.name
            summary['nativeGUIExecuted'] = True
        summary['result'] = 'PASS'
    except Exception as error:
        summary['error'] = sanitize(str(error), replacements)
        print(summary['error'], file=sys.stderr)
    (reports / (prefix + '-validation.json')).write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
    gui_status = 'native GUI verified' if summary['nativeGUIExecuted'] else 'native GUI not exercised'
    print(f'{args.app} {args.platform}: {summary["result"]}; {gui_status}.', flush=True)
    return 0 if summary['result'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
