#!/usr/bin/env python3
"""Check native package entries and packaged application parity without installation."""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import io
import json
import posixpath
import re
import stat
import struct
import subprocess
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
SLUG = 'threadshelf-local-alternative'
PREFIX = 'ThreadShelf-Local-Alternative-1.3.1'
APP_ROOTS = ('core', 'renderer', 'assets', 'vendor', 'licenses')

def build_module():
    spec = importlib.util.spec_from_file_location('alternative_build', ROOT / 'scripts/build.py')
    build = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(build)
    return build

def document_links(document_path, data, names):
    """Resolve each generated local Markdown link against archive members."""
    for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', data.decode('utf-8')):
        if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', target) or target.startswith('#'):
            continue
        target = target.split('#', 1)[0]
        resolved = posixpath.normpath(posixpath.join(posixpath.dirname(document_path), target))
        assert not resolved.startswith('../'), f'Document link leaves package: {document_path} -> {target}'
        exists = any(name.startswith(resolved.rstrip('/') + '/') for name in names) if target.endswith('/') else resolved in names
        assert exists, f'Broken packaged document link: {document_path} -> {target}'

def expected_files():
    files = [ROOT / name for name in ('main.cjs', 'preload.cjs', 'package.json', 'LICENSE', 'THIRD-PARTY-NOTICES.md') if (ROOT / name).is_file()]
    for directory in APP_ROOTS:
        if not (ROOT / directory).exists():
            continue
        files += [p for p in (ROOT / directory).rglob('*') if p.is_file() and '__pycache__' not in p.parts and not p.suffix == '.map' and not (directory == 'vendor' and p.relative_to(ROOT / directory).parts[0] in {'build', 'highlight-source', 'reader-source'})]
    return {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}

def parity(read, prefix, expected):
    for name, sha in expected.items():
        actual = hashlib.sha256(read(prefix + name)).hexdigest()
        if actual != sha:
            raise AssertionError(f'Packaged source mismatch: {prefix}{name}')

def verify_mermaid_bundle(app):
    """Bind source bytes used by every archive-parity check to the manifest."""
    manifest = json.loads((app / 'vendor/licenses/Mermaid-BUNDLE-MANIFEST.json').read_text(encoding='utf-8'))
    expected = manifest['bundle']
    bundle = (app / 'vendor/mermaid.min.js').read_bytes()
    sha = hashlib.sha256(bundle).hexdigest()
    if expected.get('file') != 'mermaid.min.js' or expected.get('bytes') != len(bundle) or expected.get('sha256') != sha:
        raise ValueError('Packaged Mermaid bundle does not match the dependency manifest')
    return {'bytes': len(bundle), 'sha256': sha, 'matchesDependencyManifest': True}

def no_launchers(names):
    for name in names:
        if name.endswith(('.sh', '.cmd', '.bat', '.ps1', '.py')):
            raise AssertionError(f'Runtime package contains script: {name}')
        if any(f'/vendor/{directory}/' in name for directory in ('build', 'highlight-source', 'reader-source')):
            raise AssertionError('Build-only tooling leaked into runtime')

def native_elf(header):
    assert header[:4] == b'\x7fELF' and header[4:6] == b'\x02\x01'
    assert struct.unpack_from('<H', header, 18)[0] == 0x3e

def stream_hash(stream, initial=b''):
    sha = hashlib.sha256(initial)
    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
        sha.update(chunk)
    return sha.hexdigest()

def official_runtime(cache, platform):
    build = build_module()
    archive = build.runtime(cache, platform, False)  # Always verifies the pinned ZIP hash.
    expected = build.runtime_file_manifest(archive, platform)
    hashes = {}
    with zipfile.ZipFile(archive) as z:
        for entry in z.infolist():
            if entry.is_dir() or entry.filename in {'version', 'resources/default_app.asar', 'electron.exe'}:
                continue
            name = SLUG if entry.filename == 'electron' else entry.filename
            with z.open(entry) as content:
                hashes[name] = stream_hash(content)
    return expected, hashes

def exact_names(actual, expected, label):
    assert len(actual) == len(set(actual)), f'{label}: duplicate archive entries'
    assert set(actual) == set(expected), f'{label}: unexpected={sorted(set(actual) - set(expected))}, missing={sorted(set(expected) - set(actual))}'

def tar_entry_type(member, link_path, link_target):
    assert member.isfile() or member.isdir() or (member.name.removeprefix('./') == link_path and member.issym() and member.linkname == link_target), f'Unexpected archive entry type: {member.name}'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--report', type=Path)
    parser.add_argument('--platform', choices=('win32', 'linux'), help='Validate only Windows ZIP or Linux tarball plus Debian package; default validates all platforms.')
    parser.add_argument('--runtime-cache', type=Path, help='Verify official runtime hashes and reject all unexpected archive files.')
    args = parser.parse_args()
    expected = expected_files()
    build = build_module()
    report = {'checks': [], 'application_files_compared_per_package': len(expected),
              'mermaidBundle': verify_mermaid_bundle(ROOT)}
    platforms = (args.platform,) if args.platform else ('win32', 'linux')
    runtime_specs = {p: official_runtime(args.runtime_cache, p) for p in platforms} if args.runtime_cache else {}
    if 'win32' in platforms:
        windows = args.directory / f'{PREFIX}-Windows-x64-Portable.zip'
        with zipfile.ZipFile(windows) as z:
            names = z.namelist()
            for entry in z.infolist():
                kind = stat.S_IFMT(entry.external_attr >> 16)
                assert kind in (0, stat.S_IFREG, stat.S_IFDIR), f'Unexpected ZIP entry type: {entry.filename}'
            exe = 'ThreadShelf Local Alternative.exe'
            assert exe in names
            executable = z.read(exe)
            assert executable[:2] == b'MZ'
            pe_offset = struct.unpack_from('<I', executable, 0x3c)[0]
            assert executable[pe_offset:pe_offset + 4] == b'PE\x00\x00'
            assert struct.unpack_from('<H', executable, pe_offset + 4)[0] == 0x8664
            assert 'electron.exe' not in names and 'resources/default_app.asar' not in names
            no_launchers(names)
            parity(z.read, 'resources/app/', expected)
            assert 'LICENSE' in names and 'LICENSES.chromium.html' in names
            assert z.read('README.md') == build.package_readme().encode('utf-8')
            assert z.read('THIRD-PARTY-NOTICES.md') == build.package_notices().encode('utf-8')
            assert z.read('APPLICATION-LICENSE') == (ROOT / 'LICENSE').read_bytes()
            for name in ('README.md', 'THIRD-PARTY-NOTICES.md'):
                document_links(name, z.read(name), names)
            if runtime_specs:
                files, hashes = runtime_specs['win32']
                exact_names([i.filename for i in z.infolist() if not i.is_dir()], files, 'Windows runtime')
                for name, sha in hashes.items():
                    with z.open(name) as content:
                        assert stream_hash(content) == sha, name
            report['checks'].append({'package': windows.name, 'native_root_exe': True, 'no_launcher_scripts': True, 'source_parity': True})
    if 'linux' in platforms:
        linux = args.directory / f'{PREFIX}-Linux-amd64.tar.gz'
        with tarfile.open(linux) as tar:
            prefix = ''
            names = tar.getnames()
            for member in tar.getmembers():
                tar_entry_type(member, None, None)
            no_launchers(names)
            executable = tar.getmember(SLUG)
            assert executable.isfile()
            assert executable.mode & 0o111
            native_elf(tar.extractfile(executable).read(20))
            read = lambda name: tar.extractfile(name).read()
            parity(read, 'resources/app/', expected)
            assert read('README.md') == build.package_readme().encode('utf-8')
            assert read('THIRD-PARTY-NOTICES.md') == build.package_notices().encode('utf-8')
            assert read('APPLICATION-LICENSE') == (ROOT / 'LICENSE').read_bytes()
            for name in ('README.md', 'THIRD-PARTY-NOTICES.md'):
                document_links(prefix + name, read(prefix + name), names)
            if runtime_specs:
                files, hashes = runtime_specs['linux']
                runtime_prefix = ''
                wanted = files
                exact_names([m.name for m in tar.getmembers() if m.isfile() or m.issym()], wanted, 'Linux portable')
                runtime_seen = set()
                for member in tar.getmembers():
                    relative = member.name.removeprefix(runtime_prefix)
                    if member.isfile() and member.name.startswith(runtime_prefix) and relative in hashes:
                        assert stream_hash(tar.extractfile(member)) == hashes[relative], member.name
                        runtime_seen.add(relative)
                assert runtime_seen == set(hashes), 'Missing Linux runtime hash coverage'
            report['checks'].append({'package': linux.name, 'native_root_elf': True, 'no_launcher_scripts': True, 'source_parity': True})
        deb = args.directory / f'{SLUG}_1.3.1_amd64.deb'
        metadata = subprocess.check_output(['dpkg-deb', '-f', str(deb)], text=True)
        assert 'Package: ' + SLUG in metadata and 'Version: 1.3.1' in metadata and 'Architecture: amd64' in metadata
        # Stream the archive to avoid loading the 400+ MB runtime in memory.
        process = subprocess.Popen(['dpkg-deb', '--fsys-tarfile', str(deb)], stdout=subprocess.PIPE)
        checks = {'entrypoint': False, 'elf': False, 'sandbox': False, 'desktop': False, 'readme': False}
        seen = set()
        data_names = []
        runtime_seen = set()
        document_expected = {
            f'opt/{SLUG}/README.md': build.package_readme().encode('utf-8'),
            f'opt/{SLUG}/THIRD-PARTY-NOTICES.md': build.package_notices().encode('utf-8'),
            f'opt/{SLUG}/APPLICATION-LICENSE': (ROOT / 'LICENSE').read_bytes(),
            f'usr/share/doc/{SLUG}/README.md': build.package_readme(f'../../../../opt/{SLUG}/').encode('utf-8'),
            f'usr/share/doc/{SLUG}/THIRD-PARTY-NOTICES.md': build.package_notices(f'../../../../opt/{SLUG}/').encode('utf-8'),
            f'usr/share/doc/{SLUG}/LICENSE': (ROOT / 'LICENSE').read_bytes(),
        }
        documents_seen = set()
        linux_hashes = runtime_specs['linux'][1] if runtime_specs else {}
        with tarfile.open(fileobj=process.stdout, mode='r|') as tar:
            for member in tar:
                name = member.name.removeprefix('./')
                tar_entry_type(member, None, None)
                if member.isfile() or member.issym():
                    data_names.append(name)
                no_launchers([name])
                assert member.uid == 0 and member.gid == 0
                runtime_relative = name.removeprefix(f'opt/{SLUG}/')
                if member.isfile() and name.startswith(f'opt/{SLUG}/') and runtime_relative in linux_hashes:
                    content = tar.extractfile(member)
                    initial = content.read(20) if runtime_relative == SLUG else b''
                    if initial:
                        native_elf(initial)
                    assert stream_hash(content, initial) == linux_hashes[runtime_relative], name
                    runtime_seen.add(runtime_relative)
                if name == 'usr/bin/' + SLUG:
                    assert member.isfile() and member.mode & 0o111
                    native_elf(tar.extractfile(member).read(20))
                    checks['entrypoint'] = True
                if name == f'opt/{SLUG}/{SLUG}':
                    assert member.mode & 0o111
                    if not runtime_specs:
                        native_elf(tar.extractfile(member).read(20))
                    checks['elf'] = True
                if name == f'opt/{SLUG}/chrome-sandbox':
                    assert member.mode == 0o4755
                    checks['sandbox'] = True
                if name == f'usr/share/applications/{SLUG}.desktop':
                    assert f'Exec=/usr/bin/{SLUG}\n' in tar.extractfile(member).read().decode()
                    checks['desktop'] = True
                if name == f'usr/share/doc/{SLUG}/README.md':
                    checks['readme'] = True
                if name in document_expected:
                    assert tar.extractfile(member).read() == document_expected[name], name
                    documents_seen.add(name)
                prefix = f'opt/{SLUG}/resources/app/'
                if name.startswith(prefix) and member.isfile():
                    local = name[len(prefix):]
                    if local in expected:
                        assert hashlib.sha256(tar.extractfile(member).read()).hexdigest() == expected[local], name
                        seen.add(local)
        assert process.wait() == 0 and all(checks.values()) and seen == set(expected)
        assert documents_seen == set(document_expected), 'Missing packaged documentation or application license'
        for name, content in document_expected.items():
            if name.endswith('.md'):
                document_links(name, content, data_names)
        if runtime_specs:
            wanted = {f'opt/{SLUG}/' + n for n in runtime_specs['linux'][0]}
            wanted.update({f'usr/bin/{SLUG}', f'usr/share/applications/{SLUG}.desktop', f'usr/share/icons/hicolor/512x512/apps/{SLUG}.png'})
            wanted.update(f'usr/share/doc/{SLUG}/{n}' for n in ('README.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md') if (ROOT / n).is_file())
            exact_names(data_names, wanted, 'Debian data archive')
            assert runtime_seen == set(linux_hashes)
        report['checks'].append({'package': deb.name, 'usr_bin_regular_native_elf': True, 'root_ownership': True, 'sandbox_mode_4755': True, 'desktop_entry': True, 'no_launcher_scripts': True, 'source_parity': True})
    if runtime_specs:
        report['official_runtime_files_and_hashes_verified'] = True
    report['packaged_document_links_verified'] = True
    report['limitations'] = ['Static packaging validation does not demonstrate native Windows launch or installation on every Linux distribution.']
    result = json.dumps(report, indent=2) + '\n'
    print(result)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(result, encoding='utf-8')

if __name__ == '__main__':
    main()
