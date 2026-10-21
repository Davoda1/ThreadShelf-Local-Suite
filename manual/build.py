#!/usr/bin/env python3
"""Validate and rebuild the bundled Gopher HTTP manual. Standard library only."""
from __future__ import annotations

import argparse
from pathlib import Path
import shutil
import subprocess
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--php", default="php", help="PHP CLI 8.2+ executable with ctype")
    parser.add_argument("--check-only", action="store_true", help="Validate source without writing output")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    php = shutil.which(args.php)
    if not php:
        parser.error("PHP CLI was not found; install PHP 8.2+ with ctype or pass --php PATH")
    command = [php, str(root / "builder" / "index.php")]
    try:
        subprocess.run(command + ["check", "--source", str(root / "content"), "--strict"], check=True)
        if args.check_only:
            return 0
        output = root.parent / "docs"
        build = command + ["build", "--source", str(root / "content"), "--output", str(output), "--strict"]
        if output.exists():
            if not (output / ".gopher-http-build.json").is_file():
                parser.error("docs/ exists without the Gopher build marker; move it aside before building")
            build.append("--replace")
        subprocess.run(build, check=True)
        # Preserve Gopher's underscore-prefixed local assets on branch-based Pages.
        (output / ".nojekyll").write_text("", encoding="utf-8")
        subprocess.run([sys.executable, str(root / "verify.py"), str(output)], check=True)
    except subprocess.CalledProcessError as error:
        return error.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
