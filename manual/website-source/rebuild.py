#!/usr/bin/env python3
"""Rebuild the published manual offline from its editable authoring snapshot."""
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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--php", default="php", help="PHP CLI 8.2+ with ctype")
    parser.add_argument("--check-only", action="store_true", help="Validate source and image checksums")
    parser.add_argument("--output", type=Path, help="New output directory; must not already exist")
    args = parser.parse_args()
    if not args.check_only and args.output is None:
        parser.error("Pass --output PATH or --check-only")
    output = args.output.resolve() if args.output else None
    if output is not None and output.exists():
        parser.error("The output directory already exists; choose a new directory")

    source = Path(__file__).resolve().parent
    site = source.parent
    manifest = json.loads((source / "images.json").read_text(encoding="utf-8"))
    try:
        with tempfile.TemporaryDirectory(prefix="threadshelf-manual-build-") as temporary:
            work = Path(temporary)
            manual = work / "manual"
            shutil.copytree(source / "manual", manual)
            image_dir = manual / "content" / "Images"
            image_dir.mkdir(exist_ok=True)
            for name, item in manifest["images"].items():
                if Path(name).name != name or not name.endswith(".png"):
                    raise ValueError(f"Invalid source image name: {name}")
                # A newly supplied source PNG replaces the existing published image.
                target = image_dir / name
                if target.exists():
                    continue
                payload = (site / item["payload"]).resolve()
                if not payload.is_relative_to(site) or not payload.is_file():
                    raise ValueError(f"Missing published image payload: {name}")
                data = payload.read_bytes()
                if hashlib.sha256(data).hexdigest() != item["sha256"]:
                    raise ValueError(f"Image checksum mismatch: {name}")
                target.write_bytes(data)

            command = [sys.executable, str(manual / "build.py"), "--php", args.php]
            if args.check_only:
                subprocess.run(command + ["--check-only"], check=True)
                print(f"Verified {len(list(image_dir.glob('*.png')))} source images.")
                return 0
            subprocess.run(command, check=True)
            built = work / "docs"
            for name in ("extras", "verification"):
                if (site / name).is_dir():
                    shutil.copytree(site / name, built / name, dirs_exist_ok=True)
            if (site / "README.md").is_file():
                shutil.copy2(site / "README.md", built / "README.md")
            next_source = built / "_manual-source"
            def source_ignore(directory: str, names: list[str]) -> list[str]:
                return [name for name in names if name == "__pycache__" or name.endswith(".pyc")
                        or (Path(directory).name == "Images" and name.endswith(".png"))]
            shutil.copytree(source, next_source, ignore=source_ignore)
            updated = {}
            for image in sorted(image_dir.glob("*.png")):
                data = image.read_bytes()
                if data[:8] != b"\x89PNG\r\n\x1a\n":
                    raise ValueError(f"Invalid PNG: {image.name}")
                sha = hashlib.sha256(data).hexdigest()
                width, height = struct.unpack(">II", data[16:24])
                updated[image.name] = {
                    "sha256": sha, "width": width, "height": height,
                    "payload": f"_gopher/files/{hashlib.sha256(('Images/' + image.name).encode()).hexdigest()}.png",
                }
            manifest["images"] = updated
            (next_source / "images.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
            assert output is not None
            shutil.copytree(built, output)
            print(f"Built {len(updated)} screenshot images into {output}")
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"Manual rebuild failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
