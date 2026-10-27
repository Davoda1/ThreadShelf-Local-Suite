#!/usr/bin/env python3
"""Release-only archive integrity verification; Python 3 standard library.

Compares every archive file (size and SHA-256) to its final staging tree,
checks path/layout safety and executable modes, verifies official Electron
runtime bytes when --runtime-cache is supplied, and inspects Windows PE
sections after branding. This does not execute the Windows application.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import posixpath
import re
import stat
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
import struct
import subprocess
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
LINUX_PORTABLE_LINKS = {
    'threadshelf-local-reader': 'app/threadshelf-local-reader',
    'bin/threadshelf-local-reader': '../app/threadshelf-local-reader',
}
DEB_LINKS = {'usr/bin/threadshelf-local-reader': '../../opt/threadshelf-local-reader/threadshelf-local-reader'}
DEFAULT_APP_PATHS = {prefix + 'resources/default_app.asar'
                     for prefix in ('', 'app/', 'opt/threadshelf-local-reader/')}
TRANSFORMERS_DIST_PATHS = {prefix + 'resources/app/node_modules/@huggingface/transformers/dist'
                          for prefix in ('', 'app/', 'opt/threadshelf-local-reader/')}
LAUNCHER_SCRIPT_SUFFIX = re.compile(r'\.(?:sh|bash|zsh|ksh|cmd|bat|ps1|vbs|js|mjs|cjs|py)$', re.I)


def selected_electron_version(pkg, explicit=None, environ=None):
    """Validate the exact same runtime selected for packaging, not a new latest."""
    environ = os.environ if environ is None else environ
    value = explicit if explicit is not None else environ.get('TSLR_ELECTRON_VERSION') or pkg['devDependencies']['electron']
    match = re.fullmatch(r'v?([1-9][0-9]*\.[0-9]+\.[0-9]+)', str(value))
    if not match:
        raise ValueError(f'Expected an exact stable Electron version, received: {value}')
    return match[1]


@dataclass(frozen=True)
class FileEntry:
    size: int
    sha256: str


@dataclass(frozen=True)
class SymlinkEntry:
    target: str


def digest(stream):
    h = hashlib.sha256()
    n = 0
    while chunk := stream.read(1024 * 1024):
        n += len(chunk)
        h.update(chunk)
    return n, h.hexdigest()


def file_digest(path):
    with path.open('rb') as f:
        return digest(f)


def is_managed_work_file(path):
    if not path.name.startswith('.'):
        return False
    candidate = path.name[1:]
    while match := re.fullmatch(r'(.+)\.[A-Za-z0-9]{6}', candidate):
        candidate = match[1]
        if (path.parent / candidate).exists() or candidate in {'electron', 'electron.exe'}:
            return True
    return False


def clean_name(name):
    name = name.removeprefix('./')
    p = PurePosixPath(name)
    if p.is_absolute() or '..' in p.parts or '\\' in name or '\x00' in name:
        raise ValueError(f'Unsafe archive path: {name!r}')
    return str(p)


def verify_native_link_target(stage, name, target):
    """Allowed relative links must end directly at a real, executable AMD64 ELF."""
    if PurePosixPath(target).is_absolute() or '\\' in target or '\x00' in target:
        raise ValueError(f'Unsafe symlink target: {name} -> {target!r}')
    relative = PurePosixPath(posixpath.normpath(str(PurePosixPath(name).parent / target)))
    if relative.is_absolute() or '..' in relative.parts or str(relative) == '.':
        raise ValueError(f'Symlink target escapes staging: {name} -> {target}')
    current = stage
    try:
        for part in relative.parts:
            current = current / part
            mode = current.lstat().st_mode
            if stat.S_ISLNK(mode):
                raise ValueError(f'Symlink target traverses another symlink: {name} -> {target}')
        if not stat.S_ISREG(mode) or not mode & 0o111:
            raise ValueError(f'Symlink target is not an executable regular file: {name} -> {target}')
        with current.open('rb') as executable:
            header = executable.read(64)
    except OSError as exc:
        raise ValueError(f'Missing or inaccessible symlink target: {name} -> {target}') from exc
    if (len(header) != 64 or header[:7] != b'\x7fELF\x02\x01\x01'
            or struct.unpack_from('<H', header, 16)[0] not in {2, 3}
            or struct.unpack_from('<H', header, 18)[0] != 62
            or struct.unpack_from('<I', header, 20)[0] != 1
            or struct.unpack_from('<H', header, 52)[0] != 64
            or struct.unpack_from('<H', header, 56)[0] == 0):
        raise ValueError(f'Symlink target is not a native AMD64 ELF executable: {name} -> {target}')


def snapshot(stage, approved_links=None):
    approved_links = approved_links or {}
    if approved_links and approved_links not in (LINUX_PORTABLE_LINKS, DEB_LINKS):
        raise ValueError('Unsupported native executable symlink policy')
    result = {}
    for directory, dirs, files in os.walk(stage):
        for name in dirs + files:
            p = Path(directory) / name
            relative = p.relative_to(stage).as_posix()
            if p.is_symlink():
                target = os.readlink(p)
                if approved_links.get(relative) != target:
                    raise ValueError(f'Unexpected symlink in staging: {p} -> {target}')
                verify_native_link_target(stage, relative, target)
                result[relative] = SymlinkEntry(target)
        for name in files:
            p = Path(directory) / name
            if p.is_symlink():
                continue
            if is_managed_work_file(p):
                continue
            if not stat.S_ISREG(p.lstat().st_mode):
                raise ValueError(f'Unexpected non-regular file in staging: {p}')
            result[p.relative_to(stage).as_posix()] = FileEntry(*file_digest(p))
    for name, target in approved_links.items():
        if result.get(name) != SymlinkEntry(target):
            raise ValueError(f'Required native executable symlink is missing or substituted: {name}')
    return result


def verify_no_launcher_scripts(stage, directories):
    """Inspect public entry directories only; bundled source/utilities are valid."""
    for relative in directories:
        directory = stage / relative
        if not directory.is_dir():
            raise ValueError(f'Missing package entry directory: {relative}')
        for path in directory.iterdir():
            if path.is_symlink() or not path.is_file() or is_managed_work_file(path):
                continue
            if LAUNCHER_SCRIPT_SUFFIX.search(path.name):
                raise ValueError(f'An unnecessary application launcher script is included: {path.relative_to(stage)}')
            with path.open('rb') as stream:
                if stream.read(2) == b'#!':
                    raise ValueError(f'An unnecessary application launcher script is included: {path.relative_to(stage)}')


def verify_archive(archive, stage, prefix='', deb=False, approved_links=None):
    approved_links = approved_links or {}
    expected = snapshot(stage, approved_links)
    if deb:
        expected = {name: value for name, value in expected.items() if not name.startswith('DEBIAN/')}
    # The packager intentionally excludes the original executable and default app.
    # Managed filesystems may show an unlinked original in staging; its presence in
    # an archive is still rejected below as an unexpected file.
    excluded_originals = {'electron.exe'} if 'Windows' in archive.name else {'app/electron', 'opt/threadshelf-local-reader/electron'}
    expected = {name: value for name, value in expected.items()
                if name not in excluded_originals | DEFAULT_APP_PATHS}
    seen = set()
    total_bytes = 0
    mode_checks = 0
    link_checks = 0

    def relative_name(name):
        name = clean_name(name)
        if prefix:
            if not name.startswith(prefix + '/'):
                raise ValueError(f'{archive.name}: missing top-level {prefix}: {name}')
            name = name[len(prefix) + 1:]
        if name in DEFAULT_APP_PATHS:
            raise ValueError(f'{archive.name}: Electron default application must be omitted: {name}')
        if any(name == root or name.startswith(root + '/') for root in TRANSFORMERS_DIST_PATHS):
            raise ValueError(f'{archive.name}: Unused Transformers prebuilt distributions must be omitted: {name}')
        return name

    def check_entry(name):
        name = relative_name(name)
        if name in seen:
            raise ValueError(f'{archive.name}: duplicate entry {name}')
        seen.add(name)
        if name not in expected:
            raise ValueError(f'{archive.name}: unexpected entry {name}')
        return name

    def check(name, stream, size, mode=None):
        nonlocal total_bytes, mode_checks
        name = check_entry(name)
        if not isinstance(expected[name], FileEntry):
            raise ValueError(f'{archive.name}: expected symlink, found regular file: {name}')
        actual = FileEntry(*digest(stream))
        if actual != expected[name] or actual.size != size:
            raise ValueError(f'{archive.name}: size/hash mismatch {name}')
        total_bytes += size
        if mode is not None:
            wanted = (stage / name).stat().st_mode & 0o7777
            # DEB sandbox mode is a release requirement; managed staging may
            # subsequently clear the setuid bit on its exposed filesystem view.
            if deb and name == 'opt/threadshelf-local-reader/chrome-sandbox':
                wanted = 0o4755
            if mode & 0o7777 != wanted:
                raise ValueError(f'{archive.name}: mode mismatch {name}: {oct(mode)} != {oct(wanted)}')
            mode_checks += 1

    def check_link(entry):
        nonlocal link_checks
        name = check_entry(entry.name)
        if (name not in approved_links or expected[name] != SymlinkEntry(entry.linkname)
                or entry.linkname != approved_links[name] or entry.size != 0):
            raise ValueError(f'{archive.name}: invalid symlink {name} -> {entry.linkname}')
        if (entry.mode & 0o7777) != ((stage / name).lstat().st_mode & 0o7777):
            raise ValueError(f'{archive.name}: symlink mode mismatch {name}')
        link_checks += 1

    def check_directory(name):
        # A directory must not mask a required file/link, even if a later
        # duplicate entry would otherwise restore the expected bytes.
        name = clean_name(name)
        if prefix and name == prefix:
            return
        name = relative_name(name)
        if name in expected:
            raise ValueError(f'{archive.name}: directory substitutes a file or symlink: {name}')

    if archive.suffix == '.zip':
        with zipfile.ZipFile(archive) as z:
            for e in z.infolist():
                clean_name(e.filename)
                kind = stat.S_IFMT(e.external_attr >> 16)
                if kind not in {0, stat.S_IFREG, stat.S_IFDIR}:
                    raise ValueError(f'{archive.name}: unsupported ZIP object {e.filename}')
                if e.is_dir():
                    if kind not in {0, stat.S_IFDIR}:
                        raise ValueError(f'{archive.name}: invalid ZIP directory type {e.filename}')
                    check_directory(e.filename)
                    continue
                if kind == stat.S_IFDIR:
                    raise ValueError(f'{archive.name}: invalid ZIP file type {e.filename}')
                with z.open(e) as f:
                    check(e.filename, f, e.file_size)
    else:
        process = None
        if deb:
            process = subprocess.Popen(['dpkg-deb', '--fsys-tarfile', str(archive)], stdout=subprocess.PIPE)
            source = process.stdout
        else:
            source = archive.open('rb')
        try:
            with tarfile.open(fileobj=source, mode='r|*') as t:
                for e in t:
                    clean_name(e.name)
                    if e.isdir():
                        check_directory(e.name)
                        continue
                    if e.issym():
                        check_link(e)
                        continue
                    if not e.isfile():
                        raise ValueError(f'{archive.name}: unsupported archive object {e.name}')
                    with t.extractfile(e) as f:
                        check(e.name, f, e.size, e.mode)
        finally:
            source.close()
            if process is not None and process.wait():
                raise ValueError(f'dpkg-deb failed reading {archive}')
    if missing := sorted(set(expected) - seen):
        raise ValueError(f'{archive.name}: missing {missing[:10]}')
    if 'Windows' in archive.name:
        if 'ThreadShelf Local Reader.exe' not in seen or any(n.startswith('app/') or n == 'electron.exe' for n in seen):
            raise ValueError('Windows portable root layout is invalid')
    if any(n in {'electron', 'app/electron', 'opt/threadshelf-local-reader/electron'} for n in seen):
        raise ValueError('Redundant original Electron executable included')
    entry_directories = []
    if approved_links == LINUX_PORTABLE_LINKS:
        entry_directories = ['.', 'bin', 'app']
    elif approved_links == DEB_LINKS:
        entry_directories = ['usr/bin', 'opt/threadshelf-local-reader']
    elif 'Windows' in archive.name:
        entry_directories = ['.']
    verify_no_launcher_scripts(stage, entry_directories)
    return {'file': archive.name, 'files': len(seen), 'uncompressedBytes': total_bytes,
            'archiveBytes': archive.stat().st_size, 'sha256': file_digest(archive)[1],
            'stagingByteMatches': True, 'modeChecks': mode_checks,
            'nativeEntrypointSymlinkChecks': link_checks,
            'launcherScriptDirectoriesChecked': entry_directories,
            'omittedDefaultApp': True,
            'omittedTransformersPrebuiltDistributions': True,
            'zipCrcChecked': archive.suffix == '.zip'}


def pe_sections(stream):
    stream.seek(0x3c)
    offset = struct.unpack('<I', stream.read(4))[0]
    stream.seek(offset)
    if stream.read(4) != b'PE\0\0':
        raise ValueError('Not a valid PE executable')
    machine, count = struct.unpack('<HH', stream.read(4))
    stream.seek(offset + 20)
    optional_size = struct.unpack('<H', stream.read(2))[0]
    sections = {}
    for i in range(count):
        stream.seek(offset + 24 + optional_size + i * 40)
        entry = stream.read(40)
        name = entry[:8].rstrip(b'\0').decode('ascii')
        size, pointer = struct.unpack('<II', entry[16:24])
        stream.seek(pointer)
        sections[name] = {'bytes': size, 'sha256': hashlib.sha256(stream.read(size)).hexdigest()}
    return machine, sections


def verify_runtime(cache, platform, runtime, electron_version):
    name = f'electron-v{electron_version}-{platform}-x64.zip'
    official = cache / name
    lines = (cache / 'SHASUMS256.txt').read_text().splitlines()
    sums = {line.split()[1].lstrip('*'): line.split()[0] for line in lines if line.strip()}
    if file_digest(official)[1] != sums.get(name):
        raise ValueError(f'Official runtime archive checksum mismatch: {name}')
    compared = 0
    pe = None
    with zipfile.ZipFile(official) as z:
        for entry in z.infolist():
            if entry.is_dir() or entry.filename == 'resources/default_app.asar':
                continue
            clean_name(entry.filename)
            target = runtime / entry.filename
            if entry.filename == 'electron':
                target = runtime / 'threadshelf-local-reader'
            elif entry.filename == 'electron.exe':
                target = runtime / 'ThreadShelf Local Reader.exe'
                with z.open(entry) as original, target.open('rb') as branded:
                    om, os = pe_sections(original)
                    bm, bs = pe_sections(branded)
                if om != 0x8664 or bm != om or set(os) != set(bs):
                    raise ValueError('Windows runtime architecture/section set changed')
                unchanged = [s for s in os if s != '.rsrc']
                if any(os[s] != bs[s] for s in unchanged):
                    raise ValueError('Windows runtime executable section differs outside branding resources')
                pe = {'machine': 'AMD64', 'unchangedSections': unchanged, 'allowedResourceSection': '.rsrc'}
                compared += 1
                continue
            with z.open(entry) as source:
                if digest(source) != file_digest(target):
                    raise ValueError(f'Runtime mismatch: {platform}/{entry.filename}')
            compared += 1
    return {'platform': platform, 'electron': electron_version, 'officialFilesVerified': compared,
            'windowsBrandingCheck': pe}


def verify_deb_runtime(cache, archive, electron_version):
    """Compare the DEB's actual runtime members directly to official ZIP bytes."""
    name = f'electron-v{electron_version}-linux-x64.zip'
    official = cache / name
    sums = {line.split()[1].lstrip('*'): line.split()[0]
            for line in (cache / 'SHASUMS256.txt').read_text().splitlines() if line.strip()}
    if file_digest(official)[1] != sums.get(name):
        raise ValueError(f'Official runtime archive checksum mismatch: {name}')
    expected = {}
    with zipfile.ZipFile(official) as z:
        for entry in z.infolist():
            if entry.is_dir() or entry.filename == 'resources/default_app.asar':
                continue
            relative = clean_name(entry.filename)
            if relative == 'electron':
                relative = 'threadshelf-local-reader'
            with z.open(entry) as source:
                expected['opt/threadshelf-local-reader/' + relative] = digest(source)
    seen = set()
    process = subprocess.Popen(['dpkg-deb', '--fsys-tarfile', str(archive)], stdout=subprocess.PIPE)
    try:
        with tarfile.open(fileobj=process.stdout, mode='r|*') as stream:
            for entry in stream:
                relative = clean_name(entry.name)
                if relative in DEFAULT_APP_PATHS:
                    raise ValueError(f'Electron default application must be omitted: {relative}')
                if relative not in expected:
                    continue
                if relative in seen or not entry.isfile():
                    raise ValueError(f'Invalid or duplicate DEB runtime member: {relative}')
                with stream.extractfile(entry) as source:
                    if digest(source) != expected[relative]:
                        raise ValueError(f'DEB archived runtime mismatch: {relative}')
                seen.add(relative)
        if process.wait() != 0:
            raise ValueError('Could not read DEB runtime archive')
    except BaseException:
        process.kill()
        process.wait()
        raise
    finally:
        process.stdout.close()
    if seen != expected.keys():
        raise ValueError(f'DEB runtime members missing: {sorted(expected.keys() - seen)}')
    return {'package': 'deb', 'platform': 'linux', 'electron': electron_version,
            'officialFilesVerified': len(seen), 'runtimeBytesReadFromArchive': True,
            'omittedDefaultApp': True, 'windowsBrandingCheck': None}


def verify_license_inputs(app):
    """Match retained license inputs while allowing generated target metadata."""
    expected = snapshot(ROOT / 'licenses')
    actual = snapshot(app / 'licenses')
    for name, value in expected.items():
        if actual.get(name) != value:
            raise ValueError(f'Packaged license input is stale or missing: licenses/{name}')
    # Packaging adds only this target-specific file. Other extras can be stale
    # dependency notices left behind by an earlier staging tree.
    unexpected = actual.keys() - expected.keys() - {'DEPENDENCIES.json'}
    if unexpected:
        raise ValueError(f'Unexpected packaged license inputs: {sorted(unexpected)}')
    return len(expected)


def verify_japanese_font(app):
    """Require the actual bundled font, not merely a CSS URL or license."""
    source = ROOT / 'src/ui/fonts/NotoSansJP-variable.woff2'
    fonts = list((app / 'dist/assets').glob('NotoSansJP-variable-*.woff2'))
    if len(fonts) != 1 or file_digest(fonts[0]) != file_digest(source):
        raise ValueError('Packaged Japanese font is stale, missing or duplicated')
    return {'file': fonts[0].relative_to(app).as_posix(), 'bytes': source.stat().st_size,
            'matchesSourceFont': True}


def verify_mermaid_bundle(app):
    """Bind packaged renderer bytes to the generated dependency manifest."""
    manifest = json.loads((app / 'licenses/Mermaid-BUNDLE-MANIFEST.json').read_text(encoding='utf-8'))
    expected = manifest['bundle']
    size, sha = file_digest(app / 'dist/mermaid.min.js')
    if expected.get('file') != 'mermaid.min.js' or expected.get('bytes') != size or expected.get('sha256') != sha:
        raise ValueError('Packaged Mermaid bundle does not match the dependency manifest')
    return {'bytes': size, 'sha256': sha, 'matchesDependencyManifest': True}


def verify_readme_inputs(directory, *, portable=False):
    """Check authored README links and distinguish app MIT from runtime licenses."""
    expected = (ROOT / 'README.md').read_text(encoding='utf-8')
    license_name = 'APPLICATION-LICENSE' if portable else 'LICENSE'
    if portable:
        expected = expected.replace('[LICENSE](LICENSE)', '[application LICENSE](APPLICATION-LICENSE)')
    if (directory / 'README.md').read_text(encoding='utf-8') != expected:
        raise ValueError('Packaged README is stale or has an incorrect application license link')
    license_file = directory / license_name
    if not license_file.is_file() or file_digest(license_file) != file_digest(ROOT / 'LICENSE'):
        raise ValueError('Packaged application MIT license is stale or missing')
    links = 0
    for target in re.findall(r'\[[^\]]+\]\(([^)]+)\)', expected):
        if re.match(r'^[A-Za-z][A-Za-z0-9+.-]*:', target) or target.startswith('#'):
            continue
        local = directory / target.split('#', 1)[0]
        if not local.resolve().is_relative_to(directory.resolve()) or not local.is_file():
            raise ValueError(f'Packaged README local link is missing or escapes its directory: {target}')
        links += 1
    return {'localLinksChecked': links, 'applicationLicense': license_name}


def verify_application_inputs(runtime):
    """Reject stale binary staging after any shipped application input changes."""
    app = runtime / 'resources/app'
    inputs = ['package.json', 'src/core', 'src/desktop', 'dist', 'build', 'vendor',
              'README.md', 'ARCHITECTURE.md', 'docs/Toolchain.md', 'docs/Code-Highlighting.md', 'docs/Activity.md', 'docs/Search.md', 'docs/Themes.md',
              'docs/Packaging-Policy.md', 'docs/Rich-Rendering.md', 'docs/rich-parser-support.md', 'docs/rich-chart-support.md',
              'docs/Storage.md', 'docs/DATABASE-MANAGER.md', 'server-support', 'LICENSE',
              'THIRD-PARTY-NOTICES.md']
    compared = 0
    for name in inputs:
        source, target = ROOT / name, app / name
        if source.is_dir():
            expected, actual = snapshot(source), snapshot(target)
            if expected != actual:
                raise ValueError(f'Packaged application input is stale or missing: {name}')
            compared += len(expected)
        elif not target.is_file() or file_digest(source) != file_digest(target):
            raise ValueError(f'Packaged application input is stale or missing: {name}')
        else:
            compared += 1
    for relative in ['7zip/linux-x64/7zz', '7zip/win32-x64/7za.exe',
                     '7zip/7z2603-src.tar.xz', '7zip/License.txt', '7zip/copying.txt',
                     '7zip/provenance.json', '7zip/README.md']:
        if not (app / 'vendor' / relative).is_file():
            raise ValueError(f'Bundled 7-Zip component missing: {relative}')
    license_files = verify_license_inputs(app)
    return {'files': compared + license_files, 'matchesCurrentSourceAndRenderer': True,
            'licenseFiles': license_files, 'retainedLicensesMatchCurrentSource': True,
            'mermaidBundle': verify_mermaid_bundle(app),
            'japaneseFont': verify_japanese_font(app),
            'bundled7ZipAndCorrespondingSource': True,
            'readme': verify_readme_inputs(app)}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    group = p.add_mutually_exclusive_group()
    group.add_argument('--binaries', action='store_true')
    group.add_argument('--source', action='store_true')
    p.add_argument('--out', type=Path, default=ROOT / 'release')
    p.add_argument('--runtime-cache', type=Path)
    p.add_argument('--platform', action='append', choices=['win32', 'linux'],
                   help='Validate only these binary platforms; repeatable; Linux includes TAR.GZ and DEB. Defaults to both.')
    p.add_argument('--electron-version', help='Exact stable runtime selected for packaging; defaults to TSLR_ELECTRON_VERSION or the manifest pin')
    p.add_argument('--report', type=Path)
    p.add_argument('--revision', type=int, help='Download filename revision (defaults to scripts/release-filenames.mjs); 0 disables the suffix')
    args = p.parse_args()
    platforms = tuple(platform for platform in ('win32', 'linux') if platform in (args.platform or ('win32', 'linux')))
    pkg = json.loads((ROOT / 'package.json').read_text())
    electron_version = selected_electron_version(pkg, args.electron_version)
    stem = 'ThreadShelf-Local-Reader-' + pkg['version']
    configured = re.search(r'export const RELEASE_REVISION = (null|[0-9]+);', (ROOT / 'scripts/release-filenames.mjs').read_text())
    revision = args.revision if args.revision is not None else (int(configured[1]) if configured and configured[1] != 'null' else 0)
    def release_name(name):
        if not revision:
            return name
        extension = '.tar.gz' if name.endswith('.tar.gz') else Path(name).suffix
        return name[:-len(extension)] + '-' + str(revision) + extension
    stage = ROOT / '.packaging'
    checks = []
    runtimes = []
    application_inputs = []
    portable_readmes = []
    if not args.source:
        win = stage / (stem + '-Windows-x64-Portable')
        linux = stage / (stem + '-Linux-amd64')
        selected_runtimes = []
        if 'win32' in platforms:
            checks.append(verify_archive(args.out / release_name(win.name + '.zip'), win))
            portable_readmes.append({'platform': 'win32', **verify_readme_inputs(win, portable=True)})
            selected_runtimes.append(('win32', win))
        if 'linux' in platforms:
            checks.append(verify_archive(args.out / release_name(linux.name + '.tar.gz'), linux, linux.name,
                                         approved_links=LINUX_PORTABLE_LINKS))
            portable_readmes.append({'platform': 'linux', **verify_readme_inputs(linux, portable=True)})
            debname = release_name(f"threadshelf-local-reader_{pkg['version']}_amd64.deb")
            checks.append(verify_archive(args.out / debname, stage / 'deb', deb=True, approved_links=DEB_LINKS))
            deb = subprocess.check_output(['dpkg-deb', '-f', str(args.out / debname), 'Version', 'Architecture'], text=True)
            if f"Version: {pkg['version']}" not in deb or 'Architecture: amd64' not in deb:
                raise ValueError('DEB version or architecture is incorrect')
            selected_runtimes.extend([('linux', linux / 'app'), ('deb', stage / 'deb/opt/threadshelf-local-reader')])
        for platform, runtime in selected_runtimes:
            application_inputs.append({'platform': platform, **verify_application_inputs(runtime)})
        if args.runtime_cache:
            for platform, runtime in selected_runtimes:
                if platform == 'deb':
                    runtimes.append(verify_deb_runtime(args.runtime_cache, args.out / debname, electron_version))
                else:
                    runtimes.append({'package': platform, **verify_runtime(args.runtime_cache, platform, runtime, electron_version)})
    if not args.binaries:
        source = stage / (stem + '-Source')
        source_inputs = ['package.json', 'package-lock.json', 'index.html', 'src', 'public', 'build', 'vendor', 'scripts', 'tests', 'docs', 'server-support', 'README.md', 'ARCHITECTURE.md', 'CHANGELOG.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'licenses']
        actual_inputs = snapshot(source)
        expected_inputs = {}
        for name in source_inputs:
            original = ROOT / name
            if not original.exists():
                continue
            if original.is_dir():
                expected_inputs.update({name + '/' + relative: value for relative, value in snapshot(original).items()})
            else:
                expected_inputs[name] = FileEntry(*file_digest(original))
        if actual_inputs != expected_inputs:
            differences = sorted(set(actual_inputs) ^ set(expected_inputs) | {name for name in actual_inputs.keys() & expected_inputs.keys() if actual_inputs[name] != expected_inputs[name]})
            raise ValueError(f'Source staging differs from current source: {differences[:10]}')
        for suffix in ['.zip', '.tar.gz']:
            checks.append(verify_archive(args.out / release_name(source.name + suffix), source, source.name))
    report = {'version': pkg['version'], 'downloadRevision': revision or None, 'electronVersion': electron_version, 'archives': checks, 'runtimes': runtimes,
              'applicationInputs': application_inputs, 'portableReadmes': portable_readmes, 'platforms': list(platforms),
              'windowsNativeExecution': False, 'result': 'PASS'}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
