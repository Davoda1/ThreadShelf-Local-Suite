#!/usr/bin/env python3
"""Validate and rebuild the bundled Gopher HTTP manual. Standard library only."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile


def export_authoring_snapshot(root: Path, output: Path) -> None:
    """Keep the generated site's editable source consistent with this checkout."""
    website = root / "website-source"
    if not website.is_dir():
        # The standalone website wrapper supplies its own authoring snapshot.
        return
    source = output / "_manual-source"
    source.mkdir()
    shutil.copyfile(website / "site-README.md", output / "README.md")
    shutil.copyfile(website / "authoring-README.md", source / "README.md")
    shutil.copyfile(website / "rebuild.py", source / "rebuild.py")

    def ignore(directory: str, names: list[str]) -> list[str]:
        return [name for name in names if name == "__pycache__" or name.endswith(".pyc")
                or (Path(directory) == root and name == "website-source")
                or (Path(directory).name == "Images" and name.endswith(".png"))]

    shutil.copytree(root, source / "manual", ignore=ignore)
    manifest = json.loads((website / "images.json").read_text(encoding="utf-8"))
    images = {}
    for image in sorted((root / "content" / "Images").glob("*.png")):
        data = image.read_bytes()
        if data[:8] != b"\x89PNG\r\n\x1a\n":
            raise ValueError(f"Invalid source PNG: {image.name}")
        width, height = struct.unpack(">II", data[16:24])
        payload = "_gopher/files/" + hashlib.sha256(("Images/" + image.name).encode()).hexdigest() + ".png"
        if (output / payload).read_bytes() != data:
            raise ValueError(f"Published screenshot differs from source: {image.name}")
        images[image.name] = {"sha256": hashlib.sha256(data).hexdigest(), "width": width,
                              "height": height, "payload": payload}
    manifest["images"] = images
    (source / "images.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


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
        # Repository media and historical verification are not generated manual content.
        # Retain these published directories when Gopher replaces its output tree.
        with tempfile.TemporaryDirectory(prefix="threadshelf-manual-") as temporary:
            preserved = Path(temporary)
            for name in ("extras", "verification"):
                if (output / name).is_dir():
                    shutil.copytree(output / name, preserved / name, symlinks=True)
            try:
                subprocess.run(build, check=True)
            finally:
                for name in ("extras", "verification"):
                    if (preserved / name).is_dir():
                        shutil.copytree(preserved / name, output / name, dirs_exist_ok=True, symlinks=True)
        # Preserve Gopher's underscore-prefixed local assets on branch-based Pages.
        (output / ".nojekyll").write_text("", encoding="utf-8")
        # The generated site is also distributed as a standalone manual archive.
        for source, name in (
            (root / "LICENSE", "LICENSE"),
            (root / "builder" / "LICENSE", "GOPHER-LICENSE.txt"),
            (root / "THIRD-PARTY-NOTICES.md", "THIRD-PARTY-NOTICES.md"),
        ):
            shutil.copyfile(source, output / name)
        export_authoring_snapshot(root, output)
        subprocess.run([sys.executable, str(root / "verify.py"), str(output)], check=True)
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"Manual build failed: {error}", file=sys.stderr)
        return error.returncode if isinstance(error, subprocess.CalledProcessError) else 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
