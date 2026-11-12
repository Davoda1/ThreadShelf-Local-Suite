#!/usr/bin/env python3
"""Check generated local HTML links, fragments and images without network access."""
from __future__ import annotations

import argparse
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


class Page(HTMLParser):
    def __init__(self, source: str):
        super().__init__()
        self.ids: set[str] = set()
        self.links: list[tuple[str, str]] = []
        self.feed(source)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get("id"):
            self.ids.add(values["id"])
        if tag == "a" and values.get("name"):
            self.ids.add(values["name"])
        for attribute in ("href", "src", "poster"):
            if values.get(attribute):
                self.links.append((tag, values[attribute]))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", type=Path, default=Path(__file__).resolve().parent.parent / "docs")
    args = parser.parse_args()
    root = args.root.resolve()
    if not (root / "index.html").is_file():
        parser.error("The generated site must contain index.html")
    pages = {p.resolve(): Page(p.read_text(encoding="utf-8")) for p in root.rglob("*.html")}
    errors: list[str] = []
    links = 0
    for source, page in pages.items():
        for tag, href in page.links:
            url = urlsplit(href)
            if url.scheme or url.netloc:
                continue
            if url.path.startswith("/"):
                errors.append(f"{source.relative_to(root)}: root-relative URL breaks project Pages/offline: {href}")
                continue
            links += 1
            target = (source.parent / unquote(url.path)).resolve() if url.path else source
            if target.is_dir():
                target /= "index.html"
            if not target.is_relative_to(root):
                errors.append(f"{source.relative_to(root)}: link escapes manual: {href}")
            elif not target.is_file():
                errors.append(f"{source.relative_to(root)}: missing local target: {href}")
            elif url.fragment and target.suffix == ".html" and unquote(url.fragment) not in pages[target].ids:
                errors.append(f"{source.relative_to(root)}: missing fragment: {href}")
    if errors:
        print("\n".join(errors))
        return 1
    print(f"Verified {len(pages)} HTML pages and {links} relative links/assets; no missing targets or fragments.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
