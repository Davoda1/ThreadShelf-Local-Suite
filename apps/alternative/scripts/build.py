#!/usr/bin/env python3
"""Package the independent application. Python 3.10+; pinned Node.js 24.19.0 for Windows.

The app uses Electron directly, without npm installation or launcher wrappers.
All filesystem writes stay inside the explicitly selected work/output/cache paths.
"""
from __future__ import annotations
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tarfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent
PRODUCT = 'ThreadShelf Local Alternative'
SLUG = 'threadshelf-local-alternative'
PREFIX = 'ThreadShelf-Local-Alternative-1.2.0'
ELECTRON = '44.9.1'
HASHES = {
    'linux': '994bc3664cc3ac55b50c21a58d345cf8322003d37f5439a81801e3267e6145e2',
    'win32': '41bd7900bd42d0f49110a81617876137041fbbf473466920248ddb076349ef91',
}
EXCLUDE_DIRS = {'.git', '.cache', '.build', 'dist', 'node_modules', '__pycache__', 'screenshots', '.verification'}
APP_FILES = ['package.json', 'main.cjs', 'preload.cjs', 'core', 'renderer', 'assets', 'vendor', 'licenses', 'LICENSE', 'THIRD-PARTY-NOTICES.md']
SOURCE_ONLY_VENDOR = {'build', 'highlight-source', 'reader-source'}
REPOSITORY = 'https://github.com/Davoda1/ThreadShelf-Local-Suite'

def package_readme(runtime_prefix=''):
    """Distribution guide with links relative to this README's location."""
    source = (ROOT / 'README.md').read_text(encoding='utf-8')
    intro = source.split('## Source and builds', 1)[0]
    app = runtime_prefix + 'resources/app/'
    return intro + f'''## Source, builds and manual

This native distribution already includes its runtime. Development commands and
build-only tools belong to the [source repository]({REPOSITORY}), not this package.
See the [build instructions]({REPOSITORY}/blob/master/apps/alternative/docs/BUILD.md)
and [illustrated manual]({REPOSITORY}/tree/master/docs). Server patch and publishing
instructions are available in the same repository.

## Licenses in this distribution

Copyright (c) 2026 davoda1. Original application code is MIT licensed; see
[APPLICATION-LICENSE]({runtime_prefix}APPLICATION-LICENSE).
The runtime-level [LICENSE]({runtime_prefix}LICENSE) is Electron's original
license, and [LICENSES.chromium.html]({runtime_prefix}LICENSES.chromium.html)
contains the supplied Chromium notices. These are separate from the application license.

The complete [application third-party notices]({app}THIRD-PARTY-NOTICES.md),
[rendering notices]({app}vendor/RENDERER-NOTICES.txt),
[renderer licenses]({app}vendor/licenses/) and
[upstream ThreadShelf notice]({app}licenses/ThreadShelf-MIT.txt) are retained
inside the embedded application. The upstream server itself is independently installed.
'''

def package_notices(runtime_prefix=''):
    app = runtime_prefix + 'resources/app/'
    return f'''# Distribution notices

ThreadShelf Local Alternative 1.2.0 is an independent application by davoda1.
Original application code is MIT licensed: [application license]({runtime_prefix}APPLICATION-LICENSE).

The complete component credits and terms are retained in the
[application notices]({app}THIRD-PARTY-NOTICES.md),
[rendering notices]({app}vendor/RENDERER-NOTICES.txt),
[renderer licenses]({app}vendor/licenses/) and
[ThreadShelf MIT notice]({app}licenses/ThreadShelf-MIT.txt).
Build-only source locations mentioned there are included in the
[source repository]({REPOSITORY}/tree/master/apps/alternative/vendor), not this runtime package.

Electron {ELECTRON} retains its original [LICENSE]({runtime_prefix}LICENSE) and
[Chromium notices]({runtime_prefix}LICENSES.chromium.html). They are not the application license.
The rebranded Windows executable is unsigned.
'''

def production_file_paths():
    files = set()
    for name in APP_FILES:
        source = ROOT / name
        candidates = source.rglob('*') if source.is_dir() else [source]
        for item in candidates:
            relative = item.relative_to(ROOT)
            if not item.is_file() or '__pycache__' in relative.parts or item.suffix == '.map':
                continue
            if name == 'vendor' and len(relative.parts) > 1 and relative.parts[1] in SOURCE_ONLY_VENDOR:
                continue
            files.add(relative.as_posix())
    return files

def runtime_file_manifest(archive: Path, platform: str):
    # Derive the runtime allowlist from the verified upstream ZIP, not from a
    # mutable staging directory. Include only explicit product additions.
    with zipfile.ZipFile(archive) as z:
        files = {entry.filename for entry in z.infolist() if not entry.is_dir()}
    original = 'electron.exe' if platform == 'win32' else 'electron'
    renamed = f'{PRODUCT}.exe' if platform == 'win32' else SLUG
    files.difference_update({original, 'resources/default_app.asar'})
    files.add(renamed)
    files.update('resources/app/' + name for name in production_file_paths())
    files.update({'README.md', 'THIRD-PARTY-NOTICES.md', 'APPLICATION-LICENSE'})
    return files

def assert_file_manifest(actual, expected, label):
    actual = list(actual)
    if len(actual) != len(set(actual)):
        raise SystemExit(f'{label} has duplicate file entries')
    actual, expected = set(actual), set(expected)
    if actual != expected:
        raise SystemExit(f'{label} file manifest mismatch; unexpected={sorted(actual - expected)}, missing={sorted(expected - actual)}')

def tree_files(root: Path):
    return {p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file() or p.is_symlink()}

def assert_runtime_tree(root: Path, expected, label):
    for path in root.rglob('*'):
        if path.is_symlink() or not (path.is_file() or path.is_dir()):
            raise SystemExit(f'{label} contains a non-regular runtime entry: {path.relative_to(root)}')
    assert_file_manifest(tree_files(root), expected, label)

def digest(path: Path) -> str:
    with path.open('rb') as stream:
        sha = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            sha.update(chunk)
        return sha.hexdigest()

def runtime(cache: Path, platform: str, allow_download: bool) -> Path:
    archive = cache / f'electron-v{ELECTRON}-{platform}-x64.zip'
    if not archive.is_file():
        if not allow_download:
            raise SystemExit(f'Missing {archive}. Download it from the Electron v{ELECTRON} GitHub release, or use --download.')
        cache.mkdir(parents=True, exist_ok=True)
        url = f'https://github.com/electron/electron/releases/download/v{ELECTRON}/{archive.name}'
        part = archive.with_suffix('.download')
        try:
            with urllib.request.urlopen(url, timeout=60) as response, part.open('wb') as out:
                shutil.copyfileobj(response, out)
            if digest(part) != HASHES[platform]:
                raise SystemExit('Downloaded Electron hash mismatch; refusing to package.')
            part.replace(archive)
        finally:
            part.unlink(missing_ok=True)
    if digest(archive) != HASHES[platform]:
        raise SystemExit(f'Electron hash mismatch: {archive}')
    return archive

def extract(archive: Path, target: Path):
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        for entry in z.infolist():
            name = Path(entry.filename)
            if name.is_absolute() or '..' in name.parts:
                raise SystemExit('Unsafe runtime archive path')
            z.extract(entry, target)
            mode = (entry.external_attr >> 16) & 0o777
            if mode and not entry.is_dir():
                (target / name).chmod(mode)

def clean_stage(target: Path, work: Path):
    if target.parent != work or not target.name.startswith('stage-'):
        raise SystemExit('Refusing to clear an unrelated path')
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)

def copy_app(runtime_dir: Path):
    for required in ('main.cjs', 'preload.cjs', 'package.json', 'renderer/index.html'):
        if not (ROOT / required).is_file():
            raise SystemExit(f'Application is incomplete: {required}')
    app = runtime_dir / 'resources' / 'app'
    # Always replace the whole application tree, even when a staging directory
    # has been reused. Never merge stale modules into the new release.
    if app.is_symlink():
        app.unlink()
    elif app.exists():
        shutil.rmtree(app)
    app.mkdir(parents=True)
    (runtime_dir / 'resources' / 'default_app.asar').unlink(missing_ok=True)
    for name in sorted(production_file_paths()):
        destination = app / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / name, destination)
    # Never overwrite Electron's LICENSE. Keep the application MIT license distinct.
    shutil.copy2(ROOT / 'LICENSE', runtime_dir / 'APPLICATION-LICENSE')
    (runtime_dir / 'README.md').write_text(package_readme(), encoding='utf-8', newline='\n')
    (runtime_dir / 'THIRD-PARTY-NOTICES.md').write_text(package_notices(), encoding='utf-8', newline='\n')

def zip_tree(source: Path, destination: Path, files, prefix=''):
    with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED, compresslevel=7) as z:
        for name in sorted(files):
            z.write(source / name, (Path(prefix) / name).as_posix())

def tar_tree(source: Path, destination: Path, prefix: str, files):
    with destination.open('wb') as raw:
        with gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0, compresslevel=6) as gz:
            with tarfile.open(fileobj=gz, mode='w') as tar:
                def metadata(info):
                    info.uid = info.gid = 0
                    info.uname = info.gname = 'root'
                    return info
                tar.add(source, arcname=prefix, recursive=False, filter=metadata)
                for name in sorted(files):
                    tar.add(source / name, arcname=(Path(prefix) / name).as_posix(), recursive=False, filter=metadata)

def windows(args, work: Path, out: Path):
    stage = work / 'stage-windows'
    clean_stage(stage, work)
    archive = runtime(args.runtime_cache, 'win32', args.download)
    manifest = runtime_file_manifest(archive, 'win32')
    extract(archive, stage)
    copy_app(stage)
    exe = stage / f'{PRODUCT}.exe'
    subprocess.run([args.node, str(ROOT / 'scripts/rebrand-windows.mjs'), str(stage / 'electron.exe'), str(exe)], check=True)
    (stage / 'electron.exe').unlink()
    (stage / 'version').write_text('1.2.0\n', encoding='utf-8')
    assert_runtime_tree(stage, manifest, 'Windows staging')
    if not args.stage_only:
        artifact = out / f'{PREFIX}-Windows-x64-Portable.zip'
        zip_tree(stage, artifact, manifest)
        print(artifact)
    print(f'Windows staging: {stage}')

def linux(args, work: Path, out: Path):
    stage = work / 'stage-linux'
    clean_stage(stage, work)
    runtime_dir = stage / 'lib' / SLUG
    archive = runtime(args.runtime_cache, 'linux', args.download)
    manifest = runtime_file_manifest(archive, 'linux')
    extract(archive, runtime_dir)
    copy_app(runtime_dir)
    (runtime_dir / 'electron').rename(runtime_dir / SLUG)
    (runtime_dir / SLUG).chmod(0o755)
    for name in ('chrome_crashpad_handler', 'chrome-sandbox'):
        (runtime_dir / name).chmod(0o755)
    (runtime_dir / 'version').write_text('1.2.0\n', encoding='utf-8')
    (stage / 'bin').mkdir()
    (stage / 'bin' / SLUG).symlink_to(f'../lib/{SLUG}/{SLUG}')
    (stage / 'README.md').write_text(package_readme(f'lib/{SLUG}/'), encoding='utf-8', newline='\n')
    assert_runtime_tree(runtime_dir, manifest, 'Linux staging')
    if not args.stage_only and args.target in ('all', 'linux'):
        artifact = out / f'{PREFIX}-Linux-amd64.tar.gz'
        portable = {f'lib/{SLUG}/' + name for name in manifest} | {f'bin/{SLUG}'}
        if (ROOT / 'README.md').is_file():
            portable.add('README.md')
        tar_tree(stage, artifact, f'{PREFIX}-Linux-amd64', portable)
        print(artifact)
    if args.target in ('all', 'deb'):
        deb(args, work, out, runtime_dir, manifest)
    print(f'Linux staging: {stage}')

def deb(args, work: Path, out: Path, runtime_dir: Path, manifest):
    stage = work / 'stage-deb'
    clean_stage(stage, work)
    app = stage / 'opt' / SLUG
    for name in sorted(manifest):
        destination = app / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        # Share immutable runtime bytes within this build filesystem; keep the
        # sandbox helper separate because Debian changes its required mode.
        if name != 'chrome-sandbox':
            try:
                os.link(runtime_dir / name, destination)
            except OSError:
                shutil.copy2(runtime_dir / name, destination)
        else:
            shutil.copy2(runtime_dir / name, destination)
    assert_runtime_tree(app, manifest, 'Debian runtime staging')
    # Debian root-owned sandbox helper is installed with its upstream required mode.
    (app / 'chrome-sandbox').chmod(0o4755)
    binary = stage / 'usr/bin'
    binary.mkdir(parents=True)
    (binary / SLUG).symlink_to(f'/opt/{SLUG}/{SLUG}')
    applications = stage / 'usr/share/applications'
    applications.mkdir(parents=True)
    (applications / f'{SLUG}.desktop').write_text(
        f'[Desktop Entry]\nType=Application\nName={PRODUCT}\nComment=Search and read your ThreadShelf server\n'
        f'Exec={SLUG}\nIcon={SLUG}\nTerminal=false\nCategories=Office;Utility;\nStartupWMClass={SLUG}\n', encoding='utf-8')
    icons = stage / 'usr/share/icons/hicolor/512x512/apps'
    icons.mkdir(parents=True)
    shutil.copy2(ROOT / 'assets/icon.png', icons / f'{SLUG}.png')
    docs = stage / 'usr/share/doc' / SLUG
    docs.mkdir(parents=True)
    shutil.copy2(ROOT / 'LICENSE', docs / 'LICENSE')
    (docs / 'README.md').write_text(package_readme(f'../../../../opt/{SLUG}/'), encoding='utf-8', newline='\n')
    (docs / 'THIRD-PARTY-NOTICES.md').write_text(package_notices(f'../../../../opt/{SLUG}/'), encoding='utf-8', newline='\n')
    control = stage / 'DEBIAN'
    control.mkdir()
    installed_kib = sum((app / name).stat().st_size for name in manifest) // 1024
    (control / 'control').write_text(
        f'Package: {SLUG}\nVersion: 1.2.0\nSection: utils\nPriority: optional\nArchitecture: amd64\n'
        f'Maintainer: davoda1 <noreply@example.invalid>\nInstalled-Size: {installed_kib}\n'
        'Depends: libasound2t64 | libasound2, libatk1.0-0t64 | libatk1.0-0, libatk-bridge2.0-0t64 | libatk-bridge2.0-0, '
        'libatspi2.0-0t64 | libatspi2.0-0, libc6 (>= 2.31), libcairo2, libcups2t64 | libcups2, libdbus-1-3, '
        'libdrm2, libexpat1, libgbm1, libglib2.0-0t64 | libglib2.0-0, libgtk-3-0t64 | libgtk-3-0, '
        'libnspr4, libnss3, libpango-1.0-0, libudev1, libx11-6, libxcb1, libxcomposite1, libxdamage1, '
        'libxext6, libxfixes3, libxkbcommon0, libxrandr2\n'
        f'Description: {PRODUCT}\n Independent desktop search and reading companion for a ThreadShelf server.\n', encoding='utf-8')
    if not args.stage_only:
        if not shutil.which('dpkg-deb'):
            raise SystemExit('dpkg-deb is required to build the Debian package. Use Linux or WSL.')
        artifact = out / f'{SLUG}_1.2.0_amd64.deb'
        expected = {f'opt/{SLUG}/' + name for name in manifest}
        expected.update({f'usr/bin/{SLUG}', f'usr/share/applications/{SLUG}.desktop', f'usr/share/icons/hicolor/512x512/apps/{SLUG}.png'})
        expected.update(f'usr/share/doc/{SLUG}/{name}' for name in ('README.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md') if (ROOT / name).is_file())
        assert_file_manifest(tree_files(stage), expected | {'DEBIAN/control'}, 'Debian package staging')
        subprocess.run(['dpkg-deb', '--root-owner-group', '-Zgzip', '-z6', '--build', str(stage), str(artifact)], check=True)
        process = subprocess.Popen(['dpkg-deb', '--fsys-tarfile', str(artifact)], stdout=subprocess.PIPE)
        with tarfile.open(fileobj=process.stdout, mode='r|') as tar:
            actual = []
            invalid_types = []
            for member in tar:
                name = member.name.removeprefix('./')
                if not (member.isfile() or member.isdir() or (name == f'usr/bin/{SLUG}' and member.issym() and member.linkname == f'/opt/{SLUG}/{SLUG}')):
                    invalid_types.append(name)
                if not member.isdir():
                    actual.append(name)
        if process.wait() != 0:
            artifact.unlink(missing_ok=True)
            raise SystemExit('Debian archive stream failed integrity validation')
        try:
            if invalid_types:
                raise SystemExit(f'Debian archive contains invalid file types: {invalid_types}')
            assert_file_manifest(actual, expected, 'Debian archive')
        except SystemExit:
            artifact.unlink(missing_ok=True)
            raise
        print(artifact)

def source_archives(out: Path, work: Path, cache: Path):
    files = []
    excluded_paths = tuple(p.resolve() for p in (out, work, cache) if p.resolve().is_relative_to(ROOT))
    for item in sorted(ROOT.rglob('*')):
        if any(item.resolve().is_relative_to(excluded) for excluded in excluded_paths):
            continue
        relative = item.relative_to(ROOT)
        parts = relative.parts
        # Build-only vendored dependencies are intentionally included in source archives.
        if any(p in EXCLUDE_DIRS for p in parts) and parts[:2] not in {('vendor', 'build'), ('vendor', 'highlight-source'), ('vendor', 'reader-source')}:
            continue
        if item.is_file() and item.suffix not in ('.pyc', '.log'):
            files.append((item, relative))
    prefix = f'{PREFIX}-Source'
    with zipfile.ZipFile(out / f'{prefix}.zip', 'w', zipfile.ZIP_DEFLATED, compresslevel=7) as z:
        for item, relative in files:
            z.write(item, (Path(prefix) / relative).as_posix())
    with tarfile.open(out / f'{prefix}.tar.gz', 'w:gz', compresslevel=6) as tar:
        for item, relative in files:
            info = tar.gettarinfo(str(item), (Path(prefix) / relative).as_posix())
            info.uid = info.gid = 0
            info.uname = info.gname = 'root'
            with item.open('rb') as content:
                tar.addfile(info, content)
    print(f'Source archives: {out / prefix}')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', choices=('all', 'windows', 'linux', 'deb', 'source'), default='all')
    parser.add_argument('--runtime-cache', type=Path, default=ROOT / '.cache/electron')
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'dist')
    parser.add_argument('--work-dir', type=Path, default=ROOT / '.build')
    parser.add_argument('--node', default='node')
    parser.add_argument('--download', action='store_true', help='Fetch missing official Electron runtimes; always verify pinned hashes.')
    parser.add_argument('--stage-only', action='store_true', help='Prepare runtime trees without writing archives.')
    parser.add_argument('--include-source', action='store_true')
    args = parser.parse_args()
    args.runtime_cache = args.runtime_cache.resolve()
    work, out = args.work_dir.resolve(), args.output_dir.resolve()
    if ROOT in (work, out, args.runtime_cache) or work == out:
        parser.error('Work/output directories must be separate from each other; work/output/cache cannot be the source root.')
    work.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    if args.target in ('all', 'windows'):
        windows(args, work, out)
    if args.target in ('all', 'linux', 'deb'):
        linux(args, work, out)
    if args.target == 'source' or args.include_source:
        source_archives(out, work, args.runtime_cache)

if __name__ == '__main__':
    main()
