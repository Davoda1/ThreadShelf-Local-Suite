#!/usr/bin/env python3
"""Run one native source check with a fresh, separate JSON report.

Copyright (c) 2026 davoda1. MIT; see ../LICENSE.
Application code and release validation requirements are not changed here.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
MAX_REPORT_BYTES = 20 * 1024 * 1024
CHECKS = {
    ('reader', 'html-preview-host'): ('electron', 'apps/reader/tests/html-preview-host.electron.cjs', 'HTML_PREVIEW_HOST_REPORT'),
    ('reader', 'html-preview-ui'): ('node', 'apps/reader/tests/html-preview-ui.browser.mjs', 'HTML_PREVIEW_UI_REPORT'),
    ('reader', 'code-options'): ('node', 'apps/reader/tests/code-presentation.browser.mjs', 'CODE_OPTIONS_REPORT'),
    ('reader', 'html-margin-scope'): ('node', 'apps/reader/tests/html-margin-scope.browser.mjs', 'HTML_MARGIN_SCOPE_REPORT'),
    ('alternative', 'html-preview'): ('node', 'apps/alternative/test/html-preview.electron.cjs', 'HTML_PREVIEW_REPORT'),
    ('alternative', 'code-options'): ('node', 'apps/alternative/test/code-options.electron.cjs', 'CODE_OPTIONS_REPORT'),
    ('alternative', 'html-margin-scope'): ('node', 'apps/alternative/test/html-margin-scope.browser.cjs', 'HTML_MARGIN_SCOPE_REPORT'),
    ('alternative', 'privacy'): ('node', 'apps/alternative/test/privacy-policy.electron.cjs', 'THREADSHELF_PRIVACY_REPORT'),
}


def remove_report(report):
    """Never accept a previous success or follow a report symlink."""
    if report.is_symlink():
        raise ValueError('The native check report must not be a symlink.')
    if report.exists():
        if not report.is_file():
            raise ValueError('The native check report must be a regular file.')
        report.unlink()


def read_report(report):
    info = report.lstat()
    if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= MAX_REPORT_BYTES:
        raise ValueError('The native check did not write a bounded regular JSON report.')
    result = json.loads(report.read_text(encoding='utf-8'))
    if not isinstance(result, dict) or result.get('passed') is not True:
        raise ValueError('The native check report must contain passed: true.')
    return result


def run_report(command, report, *, env, cwd=ROOT, runner=subprocess.run):
    # Only the configured JSON file is evidence. Native diagnostics remain on
    # stdout/stderr and can neither contaminate it nor impersonate success.
    if any(parent.is_symlink() for parent in report.parents):
        raise ValueError('The native report directory must not contain symlinks.')
    report.parent.mkdir(parents=True, exist_ok=True)
    remove_report(report)
    try:
        result = runner(command, cwd=cwd, env=env, check=False)
        if result.returncode:
            raise RuntimeError(f'Native check process exited with code {result.returncode}.')
        return read_report(report)
    except BaseException:
        # A child may write a result and fail during teardown. Such a file is
        # not successful evidence and must not be collected by later steps.
        if report.is_file() or report.is_symlink():
            report.unlink()
        raise


def check_command(app, check, platform, electron, *, node=None, xvfb=None):
    if (app, check) not in CHECKS or (check == 'privacy' and platform != 'linux'):
        raise ValueError('Unsupported native application/check/platform combination.')
    kind, script, _ = CHECKS[app, check]
    executable = str(electron) if kind == 'electron' else node
    if not executable:
        raise ValueError('The pinned Node.js executable is required.')
    command = [executable, str(ROOT / script)]
    if platform == 'linux':
        if not xvfb:
            raise ValueError('Native Linux checks require xvfb-run.')
        command = [xvfb, '-a', *command]
    return command


def prepare_runtime(platform):
    output = subprocess.check_output(
        [sys.executable, str(ROOT / 'tools/prepare-test-electron.py'), '--platform', platform],
        cwd=ROOT, text=True).strip()
    if '\n' in output or '\r' in output:
        raise ValueError('The native runtime helper returned more than one path.')
    executable = Path(output)
    if not executable.is_absolute() or executable.is_symlink() or not executable.is_file():
        raise ValueError('The native runtime helper did not return a regular executable.')
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as target:
            target.write('executable=' + str(executable) + '\n')
    else:
        print(executable)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--platform', choices=('linux', 'win32'), required=True)
    parser.add_argument('--prepare-runtime', action='store_true')
    parser.add_argument('--app', choices=('reader', 'alternative'))
    parser.add_argument('--check')
    parser.add_argument('--electron', type=Path)
    parser.add_argument('--out', type=Path, default=ROOT / 'release')
    args = parser.parse_args()
    if args.platform != sys.platform:
        parser.error('Native checks must run on the selected host platform.')
    if args.prepare_runtime:
        if args.app or args.check or args.electron:
            parser.error('Runtime preparation cannot select a native check.')
        prepare_runtime(args.platform)
        return
    if not (args.app and args.check and args.electron):
        parser.error('A native check requires --app, --check and --electron.')
    electron = args.electron.resolve()
    if args.electron.is_symlink() or not electron.is_file():
        parser.error('Use the regular executable produced by runtime preparation.')
    command = check_command(args.app, args.check, args.platform, electron,
                            node=shutil.which('node'), xvfb=shutil.which('xvfb-run'))
    report = args.out.absolute() / 'verification' / f'{args.app}-{args.platform}-{args.check}.json'
    env = os.environ.copy()
    env.pop('ELECTRON_RUN_AS_NODE', None)
    env.update({
        'READER_ELECTRON': str(electron), 'ELECTRON_PATH': str(electron),
        'THREADSHELF_PLAYWRIGHT_MODULE': str(ROOT / 'tools/mermaid-bundle/node_modules/playwright-core/index.mjs'),
        'PLAYWRIGHT_PATH': str(ROOT / 'tools/mermaid-bundle/node_modules/playwright-core'),
        CHECKS[args.app, args.check][2]: str(report),
    })
    print(f'Running {args.app} {args.check} on {args.platform}.', flush=True)
    run_report(command, report, env=env)
    print(f'Validated fresh report: {report.name}', flush=True)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(f'Native check failed: {error}', file=sys.stderr)
        raise SystemExit(1)
