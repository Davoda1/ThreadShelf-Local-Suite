# Manual validation — 1.4.5

The current manual passes the bundled Gopher HTTP 3.0.0 strict source validation:
106 source nodes, zero warnings. It generates 120 HTML pages and retains 95
original content/image assets. The local-link check verifies 2,917 relative
links, images and fragments without missing targets or fragments.

All 44 screenshots are fresh public 1.4.5 native Linux interface captures using
synthetic demonstration records: 18 Reader, 13 Analytics and 13 Alternative.
Every reused screenshot filename has a new PNG payload. Image dimensions and
SHA-256 checksums are recorded in the website authoring snapshot's images.json.
The galleries and SCREENSHOTS.md describe their scope.

The checks above validate documentation source, generated navigation and image
references. Application screenshots illustrate the actual native interfaces;
application/package verification is separate from manual link validation.

To reproduce the documentation checks from the published website checkout:

```sh
python3 _manual-source/rebuild.py --check-only
python3 _manual-source/rebuild.py --output ../rebuilt-manual
```

Requirements: Python 3.10+ and PHP CLI 8.2+ with ctype. Use `--php PATH` if needed.
